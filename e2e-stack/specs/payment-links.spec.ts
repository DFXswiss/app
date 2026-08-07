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

  test.fixme(
    '/pl: real lightning= URLs from GET /paymentLink are unreachable from this harness\'s browser',
    async () => {
      // LightningHelper.createLnurlp/createEncodedLnurlp (api/src/integration/lightning/
      // lightning-helper.ts) build the lnurl from Config.url(), which under ENVIRONMENT=loc is
      // hardcoded to `http://localhost:${port}` (api/src/config/config.ts `url()`) -- correct
      // for a single-machine local dev setup where the browser and the API share one host, but
      // unreachable from this harness: the Playwright browser runs inside the separate `tests`
      // container, where `localhost` resolves to itself, not to the `api` service. Confirmed by
      // decoding a real GET /paymentLink `lnurl` and navigating `/pl?lightning=...` to it: the
      // page shows "Failed to fetch" (PaymentLinkProvider's fetchPayRequest network error). The
      // same construction is used by PUT /paymentLink/pos for /pl/pos, so this is a structural
      // harness/environment limitation, not a defect in the reachable-invoice-param test above.
    },
  );

  // =========================================================================
  // /pl/assign
  // =========================================================================

  test('/pl/assign: unassigned Lightning sell route form creates payment_link by externalId', async ({ page }) => {
    const user = await createUser({ tag: 'pl-assign', language: 'EN', kycLevel: 30, completePersonalData: true });

    // The ad-hoc invoice endpoint behind /pl?routeId=... (GET /paymentLink/payment ->
    // PaymentLinkService.createInvoice) rejects any route whose deposit blockchain isn't
    // Lightning ("Only Lightning routes are allowed") -- so the "not assigned" -> /pl/assign
    // redirect can only be reached from a Lightning Sell route with no payment_link yet. No
    // allowed factory produces that combination: createSell only ever creates non-Lightning
    // routes, and createPaymentLink always creates the payment_link in the same call. Build the
    // missing precondition with the same raw-SQL shape createPaymentLink uses internally for its
    // synthetic Lightning deposit, stopping short of the payment_link/payment_link_payment rows.
    const tag = `pl-assign-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const fiat = await queryOne<{ id: number }>(`SELECT id FROM fiat WHERE name = 'CHF' LIMIT 1`);
    if (!fiat) throw new Error('CHF fiat not seeded');

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
         (type, active, volume, "depositId", "userId", iban, "fiatId", "bankDataId", "annualVolume", "monthlyVolume")
       VALUES ('Sell', true, 0, $1, $2, $3, $4, $5, 0, 0) RETURNING id`,
      [deposit.id, user.userId, 'CH9300762011623852957', fiat.id, bankData.id],
    );
    if (!route) throw new Error('failed to insert unassigned Lightning deposit_route');

    const externalId = `e2e-assign-${tag}`;
    const publicName = `E2E Assign Org ${tag}`;

    try {
      // Ad-hoc invoice path: API returns statusCode 400 "not assigned" → provider navigates to /pl/assign.
      await page.goto(`/pl?routeId=${route.id}&externalId=${encodeURIComponent(externalId)}&amount=10`);
      await page.waitForLoadState('networkidle');
      await expect
        .poll(() => normPath(new URL(page.url()).pathname), {
          message: 'unassigned Lightning route invoice params should land on /pl/assign',
          timeout: 20000,
        })
        .toBe('/pl/assign');

      // Screen-specific content: heading includes the externalId.
      await expect(page.getByText(externalId, { exact: false })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Assign', exact: true })).toBeVisible();

      await page.locator('input[name="publicName"]').fill(publicName);
      await page.locator('input[name="publicName"]').blur();
      await expect(page.getByRole('button', { name: 'Assign', exact: true })).toBeEnabled({ timeout: 5000 });
      await page.getByRole('button', { name: 'Assign', exact: true }).click();

      const created = await waitForRow<{ id: number; externalId: string; routeId: number; status: string }>(
        `SELECT id, "externalId" AS "externalId", "routeId" AS "routeId", status
         FROM payment_link
         WHERE "externalId" = $1`,
        [externalId],
        20000,
      );
      expect(Number(created.routeId)).toBe(route.id);
      expect(created.status).toBe('Active');

      const stillThere = await queryOne<{ id: number }>(`SELECT id FROM payment_link WHERE id = $1`, [created.id]);
      expect(stillThere?.id).toBe(created.id);

      await queryRows(`DELETE FROM payment_link_payment WHERE "linkId" = $1`, [created.id]);
      await queryRows(`DELETE FROM payment_link WHERE id = $1`, [created.id]);
    } finally {
      // Manual cleanup: these rows were inserted with raw SQL, not through a tracked factory.
      await queryRows(`DELETE FROM deposit_route WHERE id = $1`, [route.id]);
      await queryRows(`DELETE FROM bank_data WHERE id = $1`, [bankData.id]);
      await queryRows(`DELETE FROM deposit WHERE id = $1`, [deposit.id]);
    }
  });

  // =========================================================================
  // /pl/pos
  // =========================================================================

  test('/pl/pos: without lightning stays on loading spinner', async ({ page }) => {
    await page.goto('/pl/pos');
    await page.waitForLoadState('networkidle');
    // Real "no link" behaviour: init effect returns when !lightning, isLoading never clears.
    await expect(page.locator('[role="status"], .animate-spin').first()).toBeVisible({ timeout: 10000 });
    expect(normPath(new URL(page.url()).pathname)).toBe('/pl/pos');
  });

  test.fixme(
    '/pl/pos: unauthenticated (lightning only) shows Authenticate; with real key shows Create Payment',
    async () => {
      // Blocked by the same harness-only limitation as the /pl lnurl fixme above: both the
      // GET /paymentLink `lnurl` field and PUT /paymentLink/pos's returned `url` embed a
      // `lightning=` value built from LightningHelper.createEncodedLnurlp -> Config.url(),
      // which under ENVIRONMENT=loc is hardcoded to `http://localhost:<port>`
      // (api/src/config/config.ts `url()`) -- unreachable from this harness's browser process
      // (runs inside the separate `tests` container). Reproduced directly: navigating
      // `/pl/pos?lightning=<real lnurl>` shows "Failed to fetch".
      //
      // A same-origin workaround (self-encode `http://api:3000/v1/lnurlp/<uniqueId>` as the
      // lnurl instead of trusting the API's own value) does not close the gap either: the
      // GET /v1/lnurlp/:id forwarder only routes to payment-link handling when the id starts
      // with the configured `pl_` prefix (LnUrlForwardService.lnurlpForward, prefix from
      // Config.prefixes.paymentLinkUidPrefix = 'pl'), but the allowed createPaymentLink
      // factory strips all non-alphanumeric characters from its generated uniqueId
      // (`` `pl${tag}`.replace(/[^a-zA-Z0-9]/g, '') ``), which removes the required
      // underscore -- so no id this harness can produce satisfies that prefix check either.
      //
      // /pl/pos has no invoice-param fallback entry point (unlike /pl) -- PaymentLinkPosContext
      // only ever reads the `lightning` search param -- so there is no reachable browser path
      // left to exercise the authenticated POS view or a UI-driven payment creation here. The
      // "no lightning param" spinner-forever behaviour above remains real, verified coverage
      // for this route.
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
    const sell = await createSell(user.jwt, { blockchain: 'Ethereum' });

    await page.goto('/invoice');
    await waitForPublicPath(page, '/invoice');

    // Screen-specific title + form fields.
    await expect(page.getByText('Create Invoice', { exact: true }).first()).toBeVisible();
    const recipient = page.locator('input[name="recipient"]');
    await expect(recipient).toBeVisible();
    await expect(page.locator('input[name="invoiceId"]')).toBeVisible();
    await expect(page.locator('input[name="amount"]')).toBeVisible();

    // (a) valid recipient — numeric sell route id is accepted by getPaymentRecipient.
    await recipient.fill(String(sell.sellId));
    await recipient.blur();
    // On success invoiceId/amount enable and currency prefix appears (debounced 500ms + API).
    await expect(page.locator('input[name="invoiceId"]')).toBeEnabled({ timeout: 15000 });
    await expect(page.locator('input[name="amount"]')).toBeEnabled({ timeout: 5000 });
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
    await expect(page.locator('input[name="invoiceId"]')).toBeDisabled({ timeout: 10000 });
  });
});
