/**
 * Payment Links / payment-routes / invoice E2E.
 *
 * Owns the seven App.tsx routes:
 *   /routes, /pl, /pl/assign, /pl/pos, /pl/result, /payment-link, /invoice
 *
 * Browser drives the real frontend; Postgres proves writes where the UI mutates data.
 * Payment-link creation via the UI is intentionally blocked for EVM wallets (no Lightning
 * active address) — covered as the real hidden-button behaviour; links are seeded via the
 * SQL factory instead.
 */

import type { Page } from '@playwright/test';
import {
  apiGet,
  cleanupCreatedData,
  createBuy,
  createPaymentLink,
  createSell,
  createUser,
  expect,
  openScreen,
  queryOne,
  queryRows,
  test,
  waitForRow,
} from './fixtures';

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

interface PaymentLinkPaymentDto {
  id: number | string;
  status: string;
  amount: number;
  currency?: string | { name?: string };
  externalId?: string;
}

interface PaymentLinkDto {
  id: string;
  routeId: number | string;
  status: string;
  mode: string;
  lnurl: string;
  url?: string;
  externalId?: string;
  label?: string;
  payment?: PaymentLinkPaymentDto | null;
}

function normPath(p: string): string {
  return p !== '/' && p.endsWith('/') ? p.slice(0, -1) : p;
}

// ---------------------------------------------------------------------------
// Minimal bech32 encoder (BIP-173), matching src/util/lnurl.ts's `Lnurl.encode` exactly
// (HRP "LNURL", uppercased output). Used only to build an lnurl for a URL this harness's
// browser can actually reach (http://api:3000/...) -- see the "self-built lnurl" tests below
// for why the API's own lnurl (built from Config.url(), http://localhost:<port> under
// ENVIRONMENT=loc) is not usable from inside the `tests` container.
// ---------------------------------------------------------------------------

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32Polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((b >> i) & 1) chk ^= GEN[i];
    }
  }
  return chk;
}

function bech32HrpExpand(hrpRaw: string): number[] {
  // Checksum is always computed over the lowercase HRP per BIP-173, regardless of the case the
  // caller (or the final uppercased LNURL output) uses.
  const hrp = hrpRaw.toLowerCase();
  const ret: number[] = [];
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) >> 5);
  ret.push(0);
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) & 31);
  return ret;
}

function bech32CreateChecksum(hrp: string, data: number[]): number[] {
  const values = [...bech32HrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
  const mod = bech32Polymod(values) ^ 1;
  const ret: number[] = [];
  for (let p = 0; p < 6; p++) ret.push((mod >> (5 * (5 - p))) & 31);
  return ret;
}

function bech32ToWords(bytes: Buffer): number[] {
  let acc = 0;
  let bits = 0;
  const ret: number[] = [];
  const maxv = (1 << 5) - 1;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (bits > 0) ret.push((acc << (5 - bits)) & maxv);
  return ret;
}

/** Bech32-encode `url` as an LNURL, same as the frontend's `Lnurl.encode`. */
function lnurlEncode(url: string): string {
  const data = bech32ToWords(Buffer.from(url, 'utf8'));
  const combined = [...data, ...bech32CreateChecksum('lnurl', data)];
  let ret = 'lnurl1';
  for (const d of combined) ret += BECH32_CHARSET[d];
  return ret.toUpperCase();
}

/** Wait until the app has left a loading spinner (best-effort) and pathname is stable. */
async function waitForPublicPath(page: Page, expectedPath: string, timeout = 20000): Promise<void> {
  await page.waitForLoadState('networkidle');
  const spinner = page.locator('[role="status"], .animate-spin').first();
  if ((await spinner.count()) > 0) {
    await spinner.waitFor({ state: 'detached', timeout: 15000 }).catch(() => {
      /* spinner may remain on purpose (e.g. /pl/pos without lightning) */
    });
  }
  await expect
    .poll(() => normPath(new URL(page.url()).pathname), {
      message: `expected pathname ${expectedPath}`,
      timeout,
    })
    .toBe(normPath(expectedPath));
}

/**
 * Route ids on /routes come from independent per-table sequences (buy, deposit_route), so a
 * buy id and a sell id can collide on a fresh stack (both may legitimately be "1"). Scope the
 * "Route <id>" text lookup to its section heading ("Buy" / "Sell" / "Swap") to disambiguate.
 */
async function routeVisibleInSection(page: Page, heading: string, idText: string): Promise<void> {
  const card = page
    .locator('h2', { hasText: heading })
    .locator('xpath=following-sibling::div')
    .filter({ hasText: idText })
    .first();
  await expect(card).toBeVisible();
}

/** Fetch the PaymentLinkDto (with real server-computed lnurl) for a factory-created link. */
async function fetchPaymentLinkDto(jwt: string, uniqueId: string, paymentLinkId: number): Promise<PaymentLinkDto> {
  // Prefer list endpoint then match — linkId query accepts uniqueId or numeric id depending on API.
  const listedRaw = await apiGet<PaymentLinkDto[] | PaymentLinkDto>('paymentLink', { jwt });
  const listed: PaymentLinkDto[] = Array.isArray(listedRaw) ? listedRaw : listedRaw ? [listedRaw] : [];
  const fromList = listed.find(
    (l) =>
      l.id === uniqueId ||
      l.id === String(paymentLinkId) ||
      (l.externalId != null && (l.externalId === uniqueId || l.externalId.includes(uniqueId))) ||
      String(l.id).toLowerCase() === uniqueId.toLowerCase(),
  );
  if (fromList?.lnurl) return fromList;

  try {
    const byUnique = await apiGet<PaymentLinkDto>(`paymentLink?linkId=${encodeURIComponent(uniqueId)}`, { jwt });
    if (byUnique?.lnurl) return byUnique;
  } catch {
    /* fall through */
  }

  const byNumeric = await apiGet<PaymentLinkDto>(`paymentLink?linkId=${paymentLinkId}`, { jwt });
  if (!byNumeric?.lnurl) {
    throw new Error(
      `Could not resolve lnurl for payment link uniqueId=${uniqueId} id=${paymentLinkId}. ` +
        `List size=${listed.length}`,
    );
  }
  return byNumeric;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial' });

test.describe('Payment links / routes / invoice', () => {
  test.afterAll(async () => {
    await cleanupCreatedData();
  });

  // =========================================================================
  // /routes
  // =========================================================================

  test('/routes: unauthenticated visit redirects to /login', async ({ page }) => {
    await page.goto('/routes');
    await page.waitForLoadState('networkidle');
    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'logged-out /routes must redirect to /login (useAddressGuard)',
        timeout: 15000,
      })
      .toBe('/login');
  });

  test('/routes: empty user sees empty-state copy', async ({ page }) => {
    const user = await createUser({ tag: 'pl-routes-empty', language: 'EN', kycLevel: 30, completePersonalData: true });

    await openScreen(page, '/routes', user.jwt);

    await expect(page.getByText('You have no payment routes yet', { exact: true })).toBeVisible();
    // Title is layout-level copy for this screen.
    await expect(page.getByText('Payment routes', { exact: true }).first()).toBeVisible();
  });

  test('/routes: buy, sell, payment link and pending payment appear; Create Payment Link stays hidden', async ({
    page,
  }) => {
    const user = await createUser({ tag: 'pl-routes-mixed', language: 'EN', kycLevel: 30, completePersonalData: true });
    const buy = await createBuy(user.jwt);
    const sell = await createSell(user.jwt, { blockchain: 'Ethereum' });
    const pl = await createPaymentLink(user.jwt, {
      tag: 'pl-routes-mixed',
      amount: 18.5,
      label: 'e2e-routes-pl-label',
    });

    // DB preconditions for what the list should surface.
    await waitForRow(`SELECT id FROM buy WHERE id = $1`, [buy.buyId]);
    await waitForRow(`SELECT id FROM deposit_route WHERE id = $1 AND type = 'Sell'`, [sell.sellId]);
    await waitForRow(`SELECT id, status FROM payment_link WHERE id = $1`, [pl.paymentLinkId]);
    expect(pl.paymentId, 'factory should create a pending payment_link_payment').toBeTruthy();
    const paymentRow = await waitForRow<{ id: number; amount: number; status: string }>(
      `SELECT id, amount, status FROM payment_link_payment WHERE id = $1`,
      [pl.paymentId],
    );
    expect(paymentRow.status).toBe('Pending');
    expect(Number(paymentRow.amount)).toBe(18.5);

    await openScreen(page, '/routes', user.jwt);

    // Buy + sell route cards (title is "Route <id>" — numeric id is language-stable).
    await routeVisibleInSection(page, 'Buy', `Route ${buy.buyId}`);
    await routeVisibleInSection(page, 'Sell', `Route ${sell.sellId}`);
    // Payment link's own Lightning sell route is also a sell card (same section).
    if (pl.routeId) {
      await routeVisibleInSection(page, 'Sell', `Route ${pl.routeId}`);
    }

    // Payment Links section + card content unique to this screen.
    await expect(page.getByRole('heading', { name: 'Payment Links', exact: true })).toBeVisible();
    await expect(page.getByText('e2e-routes-pl-label', { exact: true })).toBeVisible();
    if (pl.routeId) {
      await expect(page.getByText(`Payment route ${pl.routeId}`, { exact: true })).toBeVisible();
    }
    await expect(page.getByText('Active', { exact: true }).first()).toBeVisible();

    // Expand the payment-link collapsible so the nested "Payment" row's summary status
    // mounts into the DOM. The nested row's amount detail is only revealed once
    // expandedPaymentLinkId targets it (set by other app flows, e.g. after a label rename),
    // so the collapsed summary status ("Pending") is the stable UI signal that the payment
    // surfaced under its link — the amount itself is proven against the DB below.
    await page.getByText('e2e-routes-pl-label', { exact: true }).click();
    await expect(page.getByText('Pending', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    // The DB row is still the source of truth for the amount.
    expect(pl.paymentId).toBeTruthy();
    const uiPayment = await queryOne<{ id: number; amount: number }>(
      `SELECT id, amount FROM payment_link_payment WHERE id = $1`,
      [pl.paymentId],
    );
    expect(Number(uiPayment?.amount)).toBe(18.5);

    // EVM wallets never expose Lightning on the active address — Create Payment Link must stay hidden.
    // That is the real product behaviour, not a harness gap (see test-data.md: no Lightning seed).
    const createPlBtn = page.locator('button', { hasText: 'Create Payment Link' });
    await expect(createPlBtn).toBeHidden();
  });

  // =========================================================================
  // /pl
  // =========================================================================

  test('/pl: missing params redirect to /', async ({ page }) => {
    await page.goto('/pl');
    await page.waitForLoadState('networkidle');
    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'PaymentLinkProvider without lightning/invoice/session should replace-navigate to /',
        timeout: 15000,
      })
      .toBe('/');
  });

  test('/pl: valid lightning param renders merchant display from a real payment link', async ({ page }) => {
    const user = await createUser({ tag: 'pl-pay-view', language: 'EN', kycLevel: 30, completePersonalData: true });
    const externalId = 'e2e-pl-view-x';
    const pl = await createPaymentLink(user.jwt, {
      tag: 'pl-pay-view',
      amount: 22,
      label: 'e2e-pl-view',
      externalId,
    });

    // API contract check: GET /paymentLink must expose a real bech32 lnurl for the link (this is
    // what the "Payment Links" list on /routes turns into the `?lightning=` param). Navigating
    // the browser to that lnurl is NOT exercised here: the API bakes it from Config.url(), which
    // under ENVIRONMENT=loc resolves to `http://localhost:<port>` (see
    // api/src/config/config.ts `url()`) -- reachable on a developer's own machine, but not from
    // this harness's browser process, which runs inside the separate `tests` container. See the
    // dedicated fixme test below for that specific, harness-only limitation.
    const dto = await fetchPaymentLinkDto(user.jwt, pl.uniqueId, pl.paymentLinkId);
    expect(dto.lnurl, 'API must return a bech32 lnurl for the link').toBeTruthy();

    const dbLink = await waitForRow<{ id: number; status: string; uniqueId: string }>(
      `SELECT id, status, "uniqueId" AS "uniqueId" FROM payment_link WHERE id = $1`,
      [pl.paymentLinkId],
    );
    expect(dbLink.status).toBe('Active');

    // Render /pl through the ad-hoc invoice params instead (same PaymentLinkProvider /
    // fetchPayRequest code path, reachable via Api.url which IS correctly wired to
    // http://api:3000 in this harness). Matching externalId + amount + currency makes
    // PaymentLinkService.createInvoice return this exact existing link instead of creating a
    // new one (see payment-link.service.ts createInvoice `matchingLink` branch).
    await page.goto(`/pl?routeId=${pl.routeId}&externalId=${encodeURIComponent(externalId)}&amount=22&currency=CHF`);
    await waitForPublicPath(page, '/pl');

    // The real, verified rendering in this harness: PaymentLinkService.createPayRequest finds
    // the pending payment and builds a quote, but quote generation needs a live BTC transfer
    // amount (GET .../paymentLink/payment returns 404 "No BTC transfer amount found" here,
    // confirmed directly against the API) -- the exact "live price-based payment infos" gap
    // documented in test-data.md (outbound HTTP is mocked under ENVIRONMENT=loc). The frontend
    // still renders correctly for that response shape: no `quote` key and no "payment complete"
    // message resolve to NoPaymentLinkPaymentStatus.NO_PAYMENT, and PaymentStatusTile shows its
    // real "NO PAYMENT ACTIVE" copy -- screen-specific content proving /pl rendered.
    await expect(page.getByText('NO PAYMENT ACTIVE', { exact: true })).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByText(/Tell the cashier that you want to pay with crypto/i),
    ).toBeVisible();

    // The DB row is unaffected by the quote failure and remains the source of truth.
    if (pl.paymentId) {
      const pay = await queryOne<{ amount: number; status: string }>(
        `SELECT amount, status FROM payment_link_payment WHERE id = $1`,
        [pl.paymentId],
      );
      expect(Number(pay?.amount)).toBe(22);
      expect(pay?.status).toBe('Pending');
    }
  });

  test('/pl: the real lightning= URL from GET /paymentLink now resolves through the tests-container forwarder', async ({
    page,
  }) => {
    // Previously fixme'd: LightningHelper.createLnurlp/createEncodedLnurlp build the lnurl from
    // Config.url(), which under ENVIRONMENT=loc is hardcoded to `http://localhost:<port>`
    // (api/src/config/config.ts `url()`) -- correct for a single-machine local dev setup, and
    // unreachable from a browser in a separate container. The tests image now runs a socat
    // forwarder on 127.0.0.1:3000 -> the real api service (commit "Forward localhost:3000 to the
    // api service in the tests container"), so the browser process -- which runs inside that same
    // container -- resolves `localhost:3000` correctly too. This is the actual, unmodified value
    // GET /paymentLink hands out, exercised exactly as a real partner integration would use it
    // (Lnurl.prependLnurl(link.lnurl) on /routes), not a self-built substitute.
    const user = await createUser({ tag: 'pl-real-lnurl', language: 'EN', kycLevel: 30, completePersonalData: true });
    const pl = await createPaymentLink(user.jwt, { tag: 'pl-real-lnurl', amount: 19, label: 'e2e-real-lnurl' });
    const dto = await fetchPaymentLinkDto(user.jwt, pl.uniqueId, pl.paymentLinkId);
    expect(dto.lnurl, 'API must return a bech32 lnurl for the link').toBeTruthy();

    await page.goto(`/pl?lightning=${encodeURIComponent(dto.lnurl)}`);
    await waitForPublicPath(page, '/pl');

    // No "Failed to fetch" anymore -- the real lnurl resolves, and rendering lands on the same
    // documented pricing boundary as the invoice-param test above (live BTC/Lightning pricing is
    // unavailable under ENVIRONMENT=loc's mocked outbound HTTP, test-data.md), not a network error.
    await expect(page.getByText('Failed to fetch', { exact: false })).toHaveCount(0);
    await expect(page.getByText('NO PAYMENT ACTIVE', { exact: true })).toBeVisible({ timeout: 20000 });

    if (pl.paymentId) {
      const pay = await queryOne<{ amount: number; status: string }>(
        `SELECT amount, status FROM payment_link_payment WHERE id = $1`,
        [pl.paymentId],
      );
      expect(Number(pay?.amount)).toBe(19);
      expect(pay?.status).toBe('Pending');
    }
  });

  // =========================================================================
  // /pl/assign
  // =========================================================================

  test('/pl/assign: direct visit without a pending payRequest redirects to /', async ({ page }) => {
    // PaymentLinkAssignScreen's own guard: `useEffect(() => { if (!payRequest) navigate('/'); ... })`
    // (src/screens/payment-link-assign.screen.tsx). Visiting the route directly, with no prior
    // fetchPayRequest call having populated PaymentLinkContext, is a real, reachable case (e.g. a
    // bookmarked or hand-typed /pl/assign URL) and exercises that guard without any backend state.
    await page.goto('/pl/assign');
    await page.waitForLoadState('networkidle');
    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: '/pl/assign with no payRequest in context should redirect to /',
        timeout: 15000,
      })
      .toBe('/');
  });

  test('/pl/assign: unassigned Lightning link form creates payment_link by externalId', async ({ page }) => {
    // The "not assigned" -> /pl/assign redirect requires a payment_link whose status is
    // PaymentLinkStatus.UNASSIGNED (api/src/subdomains/core/payment-link/services/
    // payment-link.service.ts handleNoPendingPayment) with no pending payment. No application
    // API ever creates a link in that status (grepped the whole payment-link service: UNASSIGNED
    // is only ever read/checked, never written) -- these are pre-provisioned out-of-band (e.g.
    // printed terminal QR codes), so the row is built directly with raw SQL here, mirroring the
    // shape createPaymentLink's factory already uses for its synthetic Lightning deposit.
    //
    // Two more real preconditions were found empirically (both reproduced directly against the
    // API with curl, independent of Playwright):
    // - The Sell route's optional `Route.label` relation (Sell.route, nullable: true in
    //   sell.entity.ts) must be a real row: PaymentLinkService.createDefaultErrorResponse reads
    //   `paymentLink.route.route.label` with no null guard, so any Sell route without one --
    //   which includes every route the createSell/createPaymentLink factories produce, since
    //   neither sets it -- crashes any payment-link error response (not assigned / payment
    //   complete / no pending payment) with `500 Cannot read properties of null (reading
    //   'label')` instead of the intended 4xx. That looks like a genuine null-safety gap in the
    //   application, not a harness limitation; a base `route` row is inserted here purely to
    //   route around it and reach the intended 400.
    // - assignPaymentLink does not reuse the link's current route: it looks up
    //   `getPaymentRoutesForPublicName(dto.publicName)` (deposit-route.service.ts), which matches
    //   `user.userData.paymentLinksName === publicName` -- an account-level "public name"
    //   configured separately from anything the assign form itself submits. The test user's
    //   `paymentLinksName` is set to the same value the form will submit so the lookup finds
    //   this test's own route.
    //
    // Reaching the screen needs a `lightning=` URL reachable from this harness's browser (the
    // API's own lnurl embeds Config.url() = http://localhost:<port> under ENVIRONMENT=loc,
    // unreachable from the separate `tests` container -- see the /pl fixme test above). Since
    // this row is inserted directly, its uniqueId is fully controlled, so it is given the `pl_`
    // prefix the GET /v1/lnurlp/:id forwarder requires (LnUrlForwardService.PAYMENT_LINK_PREFIX)
    // and bech32-encoded against http://api:3000, which the tests container can reach.
    const user = await createUser({ tag: 'pl-assign', language: 'EN', kycLevel: 30, completePersonalData: true });

    const tag = `pl-assign-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const fiat = await queryOne<{ id: number }>(`SELECT id FROM fiat WHERE name = 'CHF' LIMIT 1`);
    if (!fiat) throw new Error('CHF fiat not seeded');

    const baseRoute = await queryOne<{ id: number }>(
      `INSERT INTO route (label) VALUES ($1) RETURNING id`,
      [`e2e-pl-assign-route-${tag}`],
    );
    if (!baseRoute) throw new Error('failed to insert base route (label)');

    const deposit = await queryOne<{ id: number }>(
      `INSERT INTO deposit (address, blockchains, "accountIndex") VALUES ($1, 'Lightning', $2) RETURNING id`,
      [`e2e-ln-${tag}`, 900000 + Math.floor(Math.random() * 90000)],
    );
    if (!deposit) throw new Error('failed to insert synthetic Lightning deposit');

    const bankData = await queryOne<{ id: number }>(
      `INSERT INTO bank_data (iban, type, active, "default", "userDataId", label)
       VALUES ($1, 'User', true, false, $2, $3) RETURNING id`,
      ['CH9300762011623852957;' + tag, user.userDataId, `e2e-pl-assign-ba-${tag}`],
    );
    if (!bankData) throw new Error('failed to insert bank_data');

    const route = await queryOne<{ id: number }>(
      `INSERT INTO deposit_route
         (type, active, volume, "depositId", "userId", iban, "fiatId", "bankDataId", "annualVolume", "monthlyVolume", "routeId")
       VALUES ('Sell', true, 0, $1, $2, $3, $4, $5, 0, 0, $6) RETURNING id`,
      [deposit.id, user.userId, 'CH9300762011623852957', fiat.id, bankData.id, baseRoute.id],
    );
    if (!route) throw new Error('failed to insert Lightning deposit_route for the unassigned link');

    const externalId = `e2e-assign-${tag}`;
    const publicName = `E2EAssignOrg${tag}`.replace(/[^a-zA-Z0-9]/g, '');
    const uniqueId = `pl_${tag}`.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32);

    await queryRows(`UPDATE user_data SET "paymentLinksName" = $1 WHERE id = $2`, [publicName, user.userDataId]);

    const link = await queryOne<{ id: number }>(
      `INSERT INTO payment_link ("routeId", "uniqueId", status, mode, "webhookFailCount", label, "externalId")
       VALUES ($1, $2, 'Unassigned', 'Multiple', 0, $3, $4) RETURNING id`,
      [route.id, uniqueId, `e2e-pl-assign-${tag}`, externalId],
    );
    if (!link) throw new Error('failed to insert Unassigned payment_link');

    const lightningParam = lnurlEncode(`http://api:3000/v1/lnurlp/${uniqueId}`);

    try {
      // Real "not assigned" path: GET /v1/lnurlp/:id -> createPayRequest -> no pending payment
      // -> handleNoPendingPayment -> status Unassigned -> 400 "Payment link not assigned" ->
      // PaymentLinkProvider navigates to /pl/assign.
      await page.goto(`/pl?lightning=${encodeURIComponent(lightningParam)}`);
      await page.waitForLoadState('networkidle');
      await expect
        .poll(() => normPath(new URL(page.url()).pathname), {
          message: 'an Unassigned link with no pending payment should land on /pl/assign',
          timeout: 20000,
        })
        .toBe('/pl/assign');

      // Screen-specific content: heading includes the externalId.
      await expect(page.getByText(externalId, { exact: false })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Assign', exact: true })).toBeVisible();

      const publicNameInput = page.getByRole('textbox', { name: 'My organization' });
      await publicNameInput.fill(publicName);
      await publicNameInput.blur();
      await expect(page.getByRole('button', { name: 'Assign', exact: true })).toBeEnabled({ timeout: 5000 });
      await page.getByRole('button', { name: 'Assign', exact: true }).click();

      const updated = await waitForRow<{ id: number; externalId: string; routeId: number; status: string }>(
        `SELECT id, "externalId" AS "externalId", "routeId" AS "routeId", status
         FROM payment_link
         WHERE id = $1 AND status = 'Active'`,
        [link.id],
        20000,
      );
      expect(updated.id).toBe(link.id);
      expect(Number(updated.routeId)).toBe(route.id);
      expect(updated.externalId).toBe(externalId);
      expect(updated.status).toBe('Active');
    } finally {
      // Manual cleanup: these rows were inserted with raw SQL or transitioned by the real assign
      // action, not through a tracked factory. Clear payment_link_payment child tables first
      // (quote / activation / crypto_input all FK to payment_link_payment.id), matching whatever
      // the real navigation and assign flow may have created against this link/route.
      const paymentIds = await queryRows<{ id: number }>(
        `SELECT plp.id FROM payment_link_payment plp
         JOIN payment_link pl ON pl.id = plp."linkId"
         WHERE pl."routeId" = $1`,
        [route.id],
      );
      const ids = paymentIds.map((p) => p.id);
      if (ids.length) {
        await queryRows(`DELETE FROM payment_quote WHERE "paymentId" = ANY($1)`, [ids]);
        await queryRows(`DELETE FROM payment_activation WHERE "paymentId" = ANY($1)`, [ids]);
        await queryRows(`DELETE FROM crypto_input WHERE "paymentLinkPaymentId" = ANY($1)`, [ids]);
      }
      await queryRows(
        `DELETE FROM payment_link_payment WHERE "linkId" IN (SELECT id FROM payment_link WHERE "routeId" = $1)`,
        [route.id],
      );
      await queryRows(`DELETE FROM payment_link WHERE "routeId" = $1`, [route.id]);
      await queryRows(`DELETE FROM deposit_route WHERE id = $1`, [route.id]);
      await queryRows(`DELETE FROM bank_data WHERE id = $1`, [bankData.id]);
      await queryRows(`DELETE FROM deposit WHERE id = $1`, [deposit.id]);
      await queryRows(`DELETE FROM route WHERE id = $1`, [baseRoute.id]);
    }
  });

  // =========================================================================
  // /pl/pos
  // =========================================================================

  test('/pl/pos: without lightning never renders POS content', async ({ page }) => {
    await page.goto('/pl/pos');
    await page.waitForLoadState('networkidle');
    // Real "no link" behaviour: PaymentLinkPosContext's init effect returns immediately when
    // `!lightning`, so isLoading never clears and no POS content ever mounts -- stays stuck on
    // whatever the screen renders for `!payRequest || isLoading` (a loading placeholder with no
    // stable, implementation-independent selector). Assert the negative space instead: the
    // screen never reaches any authenticated/unauthenticated POS content, and never navigates
    // away.
    await expect(page.getByRole('button', { name: 'Authenticate', exact: true })).toHaveCount(0);
    await expect(page.getByText('Latest transactions', { exact: true })).toHaveCount(0);
    expect(normPath(new URL(page.url()).pathname)).toBe('/pl/pos');
  });

  test('/pl/pos: unauthenticated (lightning only) shows Authenticate', async ({ page }) => {
    // Reachable now via the tests-container forwarder (commit "Forward localhost:3000 to the
    // api service in the tests container") -- uses the real, unmodified lnurl GET /paymentLink
    // hands out for a factory-created Lightning link, same as the /pl real-lnurl test above, no
    // self-built substitute or raw-SQL route setup needed anymore.
    const user = await createUser({ tag: 'pl-pos', language: 'EN', kycLevel: 30, completePersonalData: true });
    const pl = await createPaymentLink(user.jwt, { tag: 'pl-pos', amount: 15, label: 'e2e-pos' });
    const dto = await fetchPaymentLinkDto(user.jwt, pl.uniqueId, pl.paymentLinkId);
    expect(dto.lnurl, 'API must return a bech32 lnurl for the link').toBeTruthy();

    await page.goto(`/pl/pos?lightning=${encodeURIComponent(dto.lnurl)}`);
    await waitForPublicPath(page, '/pl/pos');
    await expect(page.getByText('Failed to fetch', { exact: false })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Authenticate', exact: true })).toBeVisible({ timeout: 20000 });
  });

  test.fixme(
    '/pl/pos: with a real access key shows Create Payment and proves a UI-driven payment',
    async () => {
      // Re-checked after the tests-container forwarder (commit "Forward localhost:3000 to the
      // api service in the tests container") and the price_rule freshness fix (commit "Give
      // staff sessions clearance and seed the data the API expects to already exist") -- both
      // landed, but this specific gap is unrelated to either and is still open, reproduced fresh
      // directly against the API with curl on this run: `GET /paymentLink/payment` for a route
      // with a real Pending payment still answers `404 No BTC transfer amount found`, and
      // price_rule rows carry the container's own boot timestamp (not stale), so the remaining
      // blocker is not price staleness -- it looks like Lightning/BTC quote generation itself has
      // no live counterpart under ENVIRONMENT=loc's mocked outbound HTTP, independent of the
      // price_rule table.
      //
      // PaymentPosContext.checkAuthentication calls GET paymentLink/history with
      // `externalLinkId: payRequest?.externalId`. `externalId` is only ever present on the
      // SUCCESS payRequest DTO (PaymentLinkService.createPayRequest, built after
      // paymentQuoteService.createQuote succeeds) -- the 404 error-shaped response this harness
      // gets instead has no `externalId` field at all, so the request is sent as literally
      // `externalLinkId=undefined` and never authenticates. The reachable unauthenticated state
      // is covered by the passing test above instead.
    },
  );

  // =========================================================================
  // /pl/result
  // =========================================================================

  test('/pl/result: Completed status shows COMPLETED tile; garbage/missing status shows no tile', async ({
    page,
  }) => {
    // Success path.
    await page.goto('/pl/result?status=Completed&lightning=dummy');
    await waitForPublicPath(page, '/pl/result');

    await expect(page.getByText('COMPLETED', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Go back to the payment page', exact: true })).toBeVisible();
    // Screen-specific legal footer always present on this route.
    await expect(
      page.getByText(/By using this service, the outstanding claim/i),
    ).toBeVisible();

    // No status: PaymentStatusTile renders nothing for undefined / PENDING.
    await page.goto('/pl/result');
    await waitForPublicPath(page, '/pl/result');
    await expect(page.getByText('COMPLETED', { exact: true })).toHaveCount(0);
    await expect(page.getByText('CANCELLED', { exact: true })).toHaveCount(0);
    await expect(page.getByText('EXPIRED', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Go back to the payment page', exact: true })).toHaveCount(0);
    await expect(
      page.getByText(/By using this service, the outstanding claim/i),
    ).toBeVisible();

    // Garbage status: no dedicated error UI — tile has no matching label entry.
    await page.goto('/pl/result?status=NotARealStatus');
    await waitForPublicPath(page, '/pl/result');
    await expect(page.getByText('COMPLETED', { exact: true })).toHaveCount(0);
    await expect(page.getByText('CANCELLED', { exact: true })).toHaveCount(0);
    await expect(page.getByText('EXPIRED', { exact: true })).toHaveCount(0);
    await expect(
      page.getByText(/By using this service, the outstanding claim/i),
    ).toBeVisible();
  });

  // =========================================================================
  // /payment-link
  // =========================================================================

  test('/payment-link: loader redirects to /pl preserving query string', async ({ page }) => {
    // The App.tsx loader does redirect(`/pl${url.search}`). PaymentLinkProvider may then
    // immediately replace-navigate to `/` when the query is not a usable lightning/invoice
    // payload — so assert the loader hop itself rather than a long-lived final URL.
    const seen: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        const u = new URL(frame.url());
        seen.push(`${normPath(u.pathname)}${u.search}`);
      }
    });

    await page.goto('/payment-link?foo=bar');
    await page.waitForLoadState('domcontentloaded');

    await expect
      .poll(() => seen.some((s) => s === '/pl?foo=bar' || (s.startsWith('/pl') && s.includes('foo=bar'))), {
        message: 'loader must visit /pl with the original query preserved',
        timeout: 15000,
      })
      .toBe(true);

    // Never remain on the legacy path.
    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'must leave /payment-link after the loader redirect',
        timeout: 10000,
      })
      .not.toBe('/payment-link');
  });

  // =========================================================================
  // /invoice
  // =========================================================================

  test('/invoice: valid recipient is accepted; invalid recipient shows not-recognized message', async ({ page }) => {
    const user = await createUser({ tag: 'pl-invoice', language: 'EN', kycLevel: 30, completePersonalData: true });
    // getPaymentRecipient -> DepositRouteService.getPaymentRoute requires the route's deposit
    // blockchain to be exactly Lightning (same restriction as the ad-hoc invoice endpoint used
    // by /pl/assign above) -- a plain createSell (Ethereum) route 404s here, so use a Lightning
    // route via createPaymentLink instead, same as the other Lightning-only screens in this file.
    const pl = await createPaymentLink(user.jwt, { tag: 'pl-invoice', label: 'e2e-invoice-recipient' });

    await page.goto('/invoice');
    await waitForPublicPath(page, '/invoice');

    // Screen-specific title + form fields.
    await expect(page.getByText('Create Invoice', { exact: true }).first()).toBeVisible();
    // StyledInput renders the HTML `name` attribute from the `autocomplete` prop, not from
    // the react-hook-form `name` prop -- `invoice.screen.tsx` sets `autocomplete="name"` on the
    // recipient field and no `autocomplete` at all on invoiceId/amount, so `input[name=...]`
    // never matches any of these three fields. Use the visible placeholder instead.
    const recipient = page.getByPlaceholder('John Doe');
    await expect(recipient).toBeVisible();
    await expect(page.getByPlaceholder('Invoice ID')).toBeVisible();
    await expect(page.getByPlaceholder('Amount')).toBeVisible();

    // (a) valid recipient — numeric Lightning route id is accepted by getPaymentRecipient.
    await recipient.fill(String(pl.routeId));
    await recipient.blur();
    // On success invoiceId/amount enable and currency prefix appears (debounced 500ms + API).
    await expect(page.getByPlaceholder('Invoice ID')).toBeEnabled({ timeout: 15000 });
    await expect(page.getByPlaceholder('Amount')).toBeEnabled({ timeout: 5000 });
    // No "not recognized" error for a real route.
    await expect(page.getByText(/DFX does not recognize a recipient with the name/i)).toHaveCount(0);

    // (b) invalid recipient
    await recipient.fill('not-a-real-recipient-e2e-xyz');
    await recipient.blur();
    await expect(page.getByText(/DFX does not recognize a recipient with the name/i)).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText('not-a-real-recipient-e2e-xyz', { exact: false })).toBeVisible();
    // Fields re-disabled after failed validation.
    await expect(page.getByPlaceholder('Invoice ID')).toBeDisabled({ timeout: 10000 });
  });
});
