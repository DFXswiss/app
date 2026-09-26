/**
 * Locally observable App2 OCP follow-up flows. Merchant credentials and route pool
 * entries are local fixtures; mutations under test go through the browser and real API.
 * Payment settlement is never simulated as a provider callback: terminal history states
 * are explicit local DB transitions, and POS ambiguous-response tests forward the POST to
 * the real API before dropping only the browser response.
 */
import { randomBytes } from 'node:crypto';
import type { Page, Response, Route } from '@playwright/test';
import {
  apiGet,
  cleanupCreatedData,
  e2eMail,
  ensurePersonalDataComplete,
  expect,
  queryOne,
  test,
  trackRow,
  waitForRow,
  withDb,
} from './fixtures';
import { TEST_IBAN } from './fixtures/test-data';

interface Merchant { jwt: string; userId: number; userDataId: number }
interface RouteDto { id: number; active: boolean; deposit?: { blockchains?: string[] } }
interface LinkDto { id: number | string; routeId: number | string; lnurl?: string; url?: string; label?: string; externalId?: string; payment?: { externalId?: string; status?: string } }

function linkCard(page: Page, link: LinkDto) {
  const title = link.label || link.externalId || `Link ${link.id}`;
  return page.getByTestId('ocp-link-card').filter({ has: page.getByText(title, { exact: true }) });
}

async function makeMerchant(): Promise<Merchant> {
  const address = `LNNID${randomBytes(33).toString('hex').toUpperCase()}`;
  const auth = await fetch(`${process.env.E2E_API_URL ?? 'http://api:3000'}/v1/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, signature: randomBytes(70).toString('hex'), language: 'EN' }),
  });
  if (!auth.ok) throw new Error(`Local OCP fixture signup failed: HTTP ${auth.status}`);
  const { accessToken } = (await auth.json()) as { accessToken: string };
  const user = await queryOne<{ id: number; userDataId: number }>(
    `SELECT id, "userDataId" AS "userDataId" FROM "user" WHERE address = $1`, [address],
  );
  if (!user || !accessToken) throw new Error('Local OCP fixture signup did not persist user credentials');
  trackRow('user_data', user.userDataId);
  trackRow('user', user.id);
  await ensurePersonalDataComplete(user.userDataId, { country: 'CH' });
  await withDb(async (db) => db.query(
    `UPDATE user_data SET mail = $2, "kycLevel" = 30, "paymentLinksAllowed" = TRUE WHERE id = $1`,
    [user.userDataId, e2eMail(`ocp-extended-${Date.now()}-${randomBytes(3).toString('hex')}`)],
  ));
  for (let i = 0; i < 2; i++) {
    const deposit = await queryOne<{ id: number }>(
      `INSERT INTO deposit (address, blockchains, "accountIndex") VALUES ($1, 'Lightning', NULL) RETURNING id`,
      [`LNNID${randomBytes(33).toString('hex').toUpperCase()}`],
    );
    if (!deposit) throw new Error('Could not provision a local Lightning deposit fixture');
    trackRow('deposit', deposit.id);
  }
  return { jwt: accessToken, userId: user.id, userDataId: user.userDataId };
}

async function openOcp(page: Page, jwt: string, sub: string): Promise<void> {
  let response: Response | null;
  try {
    response = await page.goto(`/app2/?session=${encodeURIComponent(jwt)}#/ocp?sub=${sub}`);
  } catch {
    throw new Error('/app2/ navigation failed before an HTTP response');
  }
  expect(response?.ok(), `/app2/ status ${response?.status()}`).toBe(true);
  await page.waitForFunction((token) => localStorage.getItem('dfx.authenticationToken') === token, jwt);
  await expect(page.locator('h2').first()).toBeVisible({ timeout: 20000 });
}

async function createRoute(page: Page, userId: number): Promise<RouteDto> {
  await page.locator('#srIban').fill(TEST_IBAN);
  const currency = page.locator('#srCur');
  await expect(currency).toHaveValue(/\S+/, { timeout: 20000 });
  await currency.selectOption(await currency.inputValue());
  const chain = page.locator('#srChain');
  await expect(chain).toHaveValue('Lightning', { timeout: 20000 });
  await chain.selectOption('Lightning');
  const responsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/v1/sell') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: /create route/i }).click();
  const response = await responsePromise;
  expect(response.ok(), `POST /sell returned HTTP ${response.status()}`).toBe(true);
  const row = await waitForRow<{ id: number }>(
    `SELECT id FROM deposit_route WHERE "userId" = $1 AND type = 'Sell' ORDER BY id DESC LIMIT 1`, [userId],
  );
  trackRow('deposit_route', row.id);
  await expect(page.locator('#srIban')).toHaveValue('');
  return waitForRow<RouteDto>(
    `SELECT r.id, r.active, json_build_object('blockchains', d.blockchains) AS deposit
     FROM deposit_route r JOIN deposit d ON d.id = r."depositId" WHERE r.id = $1`, [row.id],
  );
}

async function createLink(page: Page, jwt: string, userId: number): Promise<LinkDto> {
  const responsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/v1/paymentLink') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: /create payment link/i }).click();
  const response = await responsePromise;
  expect(response.ok(), `POST /paymentLink returned HTTP ${response.status()}`).toBe(true);
  const row = await waitForRow<{ id: number; routeId: number }>(
    `SELECT pl.id, pl."routeId" AS "routeId" FROM payment_link pl
     JOIN deposit_route r ON r.id = pl."routeId" WHERE r."userId" = $1 ORDER BY pl.id DESC LIMIT 1`, [userId],
  );
  trackRow('payment_link', row.id);
  const ownedLinks = await apiGet<LinkDto[]>('paymentLink', { jwt });
  const created = ownedLinks.find((item) => String(item.id) === String(row.id));
  if (!created) throw new Error(`Created payment link ${row.id} is missing from the owner's API list`);
  const result = { ...created, routeId: row.routeId };
  await expect(linkCard(page, result)).toBeVisible({ timeout: 20000 });
  return result;
}

async function chargeThroughUi(page: Page, linkId: number, amount: string): Promise<{ id: number; externalId: string }> {
  await page.locator('[data-testid="ocp-pos-register"]').selectOption(String(linkId));
  await page.locator('input[inputmode="decimal"]').fill(amount);
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/v1/paymentLink/payment') && url.searchParams.get('linkId') === String(linkId) &&
      response.request().method() === 'POST';
  });
  await page.getByRole('button', { name: /charge/i }).click();
  const response = await responsePromise;
  expect(response.ok(), `POST /paymentLink/payment returned HTTP ${response.status()}`).toBe(true);
  const payment = await waitForRow<{ id: number; externalId: string }>(
    `SELECT id, "externalId" AS "externalId" FROM payment_link_payment
     WHERE "linkId" = $1 ORDER BY id DESC LIMIT 1`, [linkId],
  );
  trackRow('payment_link_payment', payment.id);
  return payment;
}

test.describe('App2 OCP locally observable extended flows', () => {
  test.afterEach(async () => { await cleanupCreatedData(); });

  test('merchant home retries a failed probe and renders the successful live merchant state', async ({ page }) => {
    test.setTimeout(120000);
    const merchant = await makeMerchant();
    let droppedProbe = false;
    await page.route((url) => url.pathname.endsWith('/v1/paymentLink/config'), async (route: Route) => {
      if (!droppedProbe && route.request().method() === 'GET') {
        droppedProbe = true;
        await route.abort('failed');
      } else {
        await route.continue();
      }
    });
    await openOcp(page, merchant.jwt, 'home');
    await expect(page.getByRole('button', { name: /retry/i })).toBeVisible();
    const configResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/v1/paymentLink/config') && response.request().method() === 'GET',
    );
    await page.getByRole('button', { name: /retry/i }).click();
    expect((await configResponse).ok()).toBe(true);
    await expect(page.getByTestId('ocp-tile').first()).toBeVisible();
    const permission = await queryOne<{ allowed: boolean }>(
      `SELECT "paymentLinksAllowed" AS allowed FROM user_data WHERE id = $1`, [merchant.userDataId],
    );
    expect(permission?.allowed).toBe(true);
  });

  test('inactive sell route is visible after reload and reactivation while default trade listing stays active-only', async ({ page }) => {
    test.setTimeout(90000);
    const merchant = await makeMerchant();
    await openOcp(page, merchant.jwt, 'routes');
    const route = await createRoute(page, merchant.userId);
    const routeRow = page.getByText(`Route ${route.id}`, { exact: true }).locator('xpath=ancestor::details[1]');
    await routeRow.locator('summary').click();
    await routeRow.getByRole('button', { name: /deactivate/i }).click();
    await expect.poll(async () => (await queryOne<{ active: boolean }>(
      `SELECT active FROM deposit_route WHERE id = $1 AND "userId" = $2`, [route.id, merchant.userId],
    ))?.active).toBe(false);

    const defaultRoutes = await apiGet<{ sell: RouteDto[] }>('route', { jwt: merchant.jwt });
    expect(defaultRoutes.sell.some((item) => item.id === route.id)).toBe(false);
    const managedRoutes = await apiGet<{ sell: RouteDto[] }>('route?includeInactiveSell=true', { jwt: merchant.jwt });
    expect(managedRoutes.sell.some((item) => item.id === route.id && !item.active)).toBe(true);

    const listResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/v1/route') &&
      new URL(response.url()).searchParams.get('includeInactiveSell') === 'true',
    );
    await page.reload();
    expect((await listResponse).ok()).toBe(true);
    const inactiveRow = page.getByText(`Route ${route.id}`, { exact: true }).locator('xpath=ancestor::details[1]');
    await expect(inactiveRow).toContainText(/inactive/i);
    await inactiveRow.locator('summary').click();
    await inactiveRow.getByRole('button', { name: /activate/i }).click();
    await expect.poll(async () => (await queryOne<{ active: boolean }>(
      `SELECT active FROM deposit_route WHERE id = $1 AND "userId" = $2`, [route.id, merchant.userId],
    ))?.active).toBe(true);

    // There is no default-route selector or route-list refresh button in RoutesView.
    // Native page reload is the observable reload path; default payout selection is not asserted.
  });

  test('invoice success renders QR, exports PNG and sticker PDF, and invokes print without physical printing', async ({ page }) => {
    test.setTimeout(120000);
    const merchant = await makeMerchant();
    await page.addInitScript(() => {
      let copied = '';
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string) => { copied = value; },
          readText: async () => copied,
        },
      });
      const capture = { opened: 0, html: '', printCalls: 0 };
      (window as Window & { __invoicePrintCapture?: typeof capture }).__invoicePrintCapture = capture;
      window.open = (() => {
        capture.opened += 1;
        return {
          document: { write: (html: string) => { capture.html = html; }, close: () => undefined },
          focus: () => undefined,
          print: () => { capture.printCalls += 1; },
        } as unknown as Window;
      }) as typeof window.open;
    });
    await openOcp(page, merchant.jwt, 'routes');
    const route = await createRoute(page, merchant.userId);
    await openOcp(page, merchant.jwt, 'invoice');
    await page.locator('#invRoute').selectOption(String(route.id));
    const invoiceId = `comma,e2e-${Date.now()}`;
    await page.locator('#invId').fill(invoiceId);
    await page.locator('#invAmt').fill('10.25');
    const invoiceResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/v1/paymentLink/payment') && response.request().method() === 'GET',
    );
    await page.getByRole('button', { name: /generate invoice/i }).click();
    const invoiceResponse = await invoiceResponsePromise;
    expect(invoiceResponse.ok(), `GET /paymentLink/payment returned HTTP ${invoiceResponse.status()}`).toBe(true);
    const payRequest = await invoiceResponse.json() as {
      id: string;
      externalId: string;
      minSendable: number;
      maxSendable: number;
      quote: { id: string; payment: string };
    };
    expect(payRequest.id).toBeTruthy();
    expect(payRequest.externalId).toContain(invoiceId);
    expect(payRequest.externalId).toContain(',');
    expect(payRequest.minSendable).toBeGreaterThan(0);
    expect(payRequest.maxSendable).toBeGreaterThanOrEqual(payRequest.minSendable);
    expect(payRequest.quote.id).toBeTruthy();
    expect(payRequest.quote.payment).toBeTruthy();

    const qr = page.locator('svg[width="212"][height="212"]');
    await expect(qr).toBeVisible();
    await expect(qr.locator('xpath=..')).toContainText(invoiceId);
    const invoiceRows = await waitForRow<{
      linkId: number; routeId: number; linkUid: string; linkExternalId: string;
      paymentId: number; paymentUid: string; paymentExternalId: string;
      amount: number | string; paymentStatus: string; quoteId: number; quoteUid: string;
      quotePaymentId: number; quoteStatus: string;
    }>(
      `SELECT pl.id AS "linkId", pl."routeId" AS "routeId", pl."uniqueId" AS "linkUid",
              pl."externalId" AS "linkExternalId", p.id AS "paymentId", p."uniqueId" AS "paymentUid",
              p."externalId" AS "paymentExternalId", p.amount, p.status AS "paymentStatus",
              q.id AS "quoteId", q."uniqueId" AS "quoteUid", q."paymentId" AS "quotePaymentId", q.status AS "quoteStatus"
       FROM payment_link pl
       JOIN payment_link_payment p ON p."linkId" = pl.id
       JOIN payment_quote q ON q."paymentId" = p.id
       WHERE pl."uniqueId" = $1 AND pl."externalId" = $2
         AND p."uniqueId" = $3 AND q."uniqueId" = $4
       ORDER BY q.id DESC LIMIT 1`,
      [payRequest.id, payRequest.externalId, payRequest.quote.payment, payRequest.quote.id],
      30000,
    );
    trackRow('payment_link', invoiceRows.linkId);
    trackRow('payment_link_payment', invoiceRows.paymentId);
    trackRow('payment_quote', invoiceRows.quoteId);
    expect(invoiceRows).toMatchObject({
      routeId: route.id,
      linkUid: payRequest.id,
      linkExternalId: payRequest.externalId,
      paymentUid: payRequest.quote.payment,
      paymentExternalId: payRequest.externalId,
      quoteUid: payRequest.quote.id,
      quotePaymentId: invoiceRows.paymentId,
      paymentStatus: 'Pending',
    });
    expect(Number(invoiceRows.amount)).toBe(10.25);

    await page.getByLabel('Copy LNURL', { exact: true }).click();
    const copiedLnurl = await page.evaluate(() => navigator.clipboard.readText());
    expect(copiedLnurl).toMatch(/^LNURL1[A-Z0-9]+$/);
    expect(copiedLnurl.length).toBeGreaterThan(20);

    // The invoice response's id is the persisted PaymentLink uniqueId; the authenticated
    // Payment-Link API independently exposes the corresponding canonical URL and encoded LNURL.
    // Check both the id-to-URL path and the exact value delivered to the UI copy action.
    expect(invoiceRows.linkUid).toBe(payRequest.id);
    const invoiceLinkDto = (await apiGet<LinkDto[]>('paymentLink', { jwt: merchant.jwt }))
      .find((item) => String(item.id) === String(invoiceRows.linkId));
    expect(invoiceLinkDto?.url).toBeTruthy();
    expect(new URL(invoiceLinkDto!.url!).pathname.endsWith(`/lnurlp/${payRequest.id}`)).toBe(true);
    expect(copiedLnurl).toBe(invoiceLinkDto?.lnurl);

    const pngDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download QR', exact: true }).click();
    const pngDownload = await pngDownloadPromise;
    const pngPath = await pngDownload.path();
    expect(pngPath).toBeTruthy();
    const png = await (await import('node:fs/promises')).readFile(pngPath!);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

    await page.getByRole('button', { name: 'Print', exact: true }).click();
    await expect.poll(() => page.evaluate(() =>
      (window as Window & { __invoicePrintCapture?: { opened: number; html: string; printCalls: number } })
        .__invoicePrintCapture?.printCalls,
    )).toBe(1);
    const printCapture = await page.evaluate(() =>
      (window as Window & { __invoicePrintCapture?: { opened: number; html: string; printCalls: number } })
        .__invoicePrintCapture,
    );
    expect(printCapture?.opened).toBe(1);
    expect(printCapture?.html).toContain('<title>OpenCryptoPay</title>');
    expect(printCapture?.html).toContain(invoiceId);
    expect(printCapture?.html).toContain('<svg');

    const stickerResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/v1/paymentLink/stickers') && response.request().method() === 'GET',
    );
    const stickerDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Sticker PDF', exact: true }).click();
    const stickerResponse = await stickerResponsePromise;
    expect(stickerResponse.ok(), `GET /paymentLink/stickers returned HTTP ${stickerResponse.status()}`).toBe(true);
    expect(stickerResponse.headers()['content-type']).toContain('application/pdf');
    const stickerUrl = new URL(stickerResponse.url());
    expect(stickerUrl.searchParams.get('route')).toBe(String(route.id));
    expect(stickerUrl.searchParams.get('ids')).toBe(String(invoiceRows.linkId));
    expect(stickerUrl.searchParams.has('externalIds')).toBe(false);
    const stickerDownload = await stickerDownloadPromise;
    expect(stickerDownload.suggestedFilename()).toBe('DFX_OCP_stickers.pdf');
    const stickerPath = await stickerDownload.path();
    expect(stickerPath).toBeTruthy();
    const pdf = await (await import('node:fs/promises')).readFile(stickerPath!);
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  test('payment link LNURL copy and list state persist through a real browser reload', async ({ page }) => {
    test.setTimeout(90000);
    const merchant = await makeMerchant();
    // The local stack is HTTP, so Chromium does not expose its clipboard API. Capture
    // the real UI copy call in-page, as the account clipboard test does; do not claim
    // this proves writing to the host system clipboard.
    await page.addInitScript(() => {
      let copied = '';
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string) => { copied = value; },
          readText: async () => copied,
        },
      });
    });
    await openOcp(page, merchant.jwt, 'routes');
    await createRoute(page, merchant.userId);
    await openOcp(page, merchant.jwt, 'links');
    const link = await createLink(page, merchant.jwt, merchant.userId);
    const linksResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/v1/paymentLink') && response.request().method() === 'GET',
    );
    const card = linkCard(page, link);
    await expect(card).toBeVisible();
    await card.locator('summary').click();
    await expect(card.locator('svg[width="212"][height="212"]')).toBeVisible();
    const linkFromApi = (await apiGet<LinkDto[]>('paymentLink', { jwt: merchant.jwt }))
      .find((item) => String(item.id) === String(link.id));
    expect(linkFromApi?.lnurl).toBeTruthy();
    // The card intentionally has both an icon button with this accessible name and
    // a second text button. Exercise the accessible icon control exactly once.
    await card.getByLabel('Copy LNURL', { exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(linkFromApi?.lnurl);

    await page.reload();
    expect((await linksResponse).ok()).toBe(true);
    const reloaded = linkCard(page, link);
    await expect(reloaded).toBeVisible();
    const dbRow = await queryOne<{ id: number; routeId: number; status: string }>(
      `SELECT id, "routeId" AS "routeId", status FROM payment_link WHERE id = $1`, [link.id],
    );
    expect(dbRow).toMatchObject({ id: Number(link.id), routeId: Number(link.routeId), status: 'Active' });
    const reloadedLinks = await apiGet<LinkDto[]>('paymentLink', { jwt: merchant.jwt });
    expect(reloadedLinks.some((item) => String(item.id) === String(link.id) && item.lnurl === linkFromApi?.lnurl)).toBe(true);
  });

  test('history retries a failed request and follows the default completed-only history filter', async ({ page }) => {
    test.setTimeout(120000);
    const merchant = await makeMerchant();
    await openOcp(page, merchant.jwt, 'routes');
    await createRoute(page, merchant.userId);
    await openOcp(page, merchant.jwt, 'links');
    const first = await createLink(page, merchant.jwt, merchant.userId);
    const second = await createLink(page, merchant.jwt, merchant.userId);
    await openOcp(page, merchant.jwt, 'pos');
    const completed = await chargeThroughUi(page, Number(first.id), '5.10');
    await withDb(async (db) => db.query(
      `UPDATE payment_link_payment SET status = 'Completed' WHERE id = $1`, [completed.id],
    ));
    await expect(page.getByText(/paid/i).first()).toBeVisible({ timeout: 20000 });
    const pending = await chargeThroughUi(page, Number(second.id), '6.20');

    let failedHistoryOnce = false;
    await page.route((url) => url.pathname.endsWith('/v1/paymentLink/history'), async (route: Route) => {
      if (!failedHistoryOnce && route.request().method() === 'GET') {
        failedHistoryOnce = true;
        await route.abort('failed');
      } else {
        await route.continue();
      }
    });
    await openOcp(page, merchant.jwt, 'history');
    await expect(page.getByRole('button', { name: /retry/i })).toBeVisible();
    const historyResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/v1/paymentLink/history') && response.request().method() === 'GET',
    );
    await page.getByRole('button', { name: /retry/i }).click();
    expect((await historyResponse).ok()).toBe(true);
    await expect(page.getByText(completed.externalId, { exact: true })).toBeVisible();
    await expect(page.getByText('Completed', { exact: true })).toBeVisible();
    await expect(page.getByText(pending.externalId, { exact: true })).toHaveCount(0);
    const apiHistory = await apiGet<Array<{ payments?: Array<{ id: number; status: string }> }>>(
      'paymentLink/history', { jwt: merchant.jwt },
    );
    const statuses = apiHistory.flatMap((item) => item.payments ?? []);
    expect(statuses).toContainEqual(expect.objectContaining({ id: completed.id, status: 'Completed' }));
    expect(statuses.some((item) => item.id === pending.id)).toBe(false);
    const pendingHistory = await apiGet<Array<{ payments?: Array<{ id: number; status: string }> }>>(
      'paymentLink/history?status=Pending', { jwt: merchant.jwt },
    );
    expect(pendingHistory.flatMap((item) => item.payments ?? [])).toContainEqual(
      expect.objectContaining({ id: pending.id, status: 'Pending' }),
    );
    const dbStatuses = await queryOne<{ completed: string; pending: string }>(
      `SELECT (SELECT status FROM payment_link_payment WHERE id = $1) AS completed,
              (SELECT status FROM payment_link_payment WHERE id = $2) AS pending`, [completed.id, pending.id],
    );
    expect(dbStatuses).toEqual({ completed: 'Completed', pending: 'Pending' });
  });

  test('POS drops an ambiguous browser response, recovers the committed charge and retries a failed poll safely', async ({ page }) => {
    test.setTimeout(120000);
    const merchant = await makeMerchant();
    await openOcp(page, merchant.jwt, 'routes');
    await createRoute(page, merchant.userId);
    await openOcp(page, merchant.jwt, 'links');
    const link = await createLink(page, merchant.jwt, merchant.userId);
    await openOcp(page, merchant.jwt, 'pos');

    let droppedCommittedResponse = false;
    let failedPollOnce = false;
    let actualStatusAfterForward: number | undefined;
    await page.route((url) => url.pathname.endsWith('/v1/paymentLink/payment') || url.pathname.endsWith('/v1/paymentLink'), async (route: Route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname.endsWith('/v1/paymentLink/payment') && request.method() === 'POST' && !droppedCommittedResponse) {
        droppedCommittedResponse = true;
        const actualResponse = await route.fetch();
        actualStatusAfterForward = actualResponse.status();
        await route.abort('failed');
        return;
      }
      if (
        url.pathname.endsWith('/v1/paymentLink') && request.method() === 'GET' &&
        url.searchParams.get('externalPaymentId') && !failedPollOnce
      ) {
        failedPollOnce = true;
        await route.abort('failed');
        return;
      }
      await route.continue();
    });

    await page.locator('[data-testid="ocp-pos-register"]').selectOption(String(link.id));
    await page.locator('input[inputmode="decimal"]').fill('8.40');
    await page.getByRole('button', { name: /charge/i }).click();
    const committed = await waitForRow<{ id: number; externalId: string; status: string }>(
      `SELECT id, "externalId" AS "externalId", status FROM payment_link_payment
       WHERE "linkId" = $1 ORDER BY id DESC LIMIT 1`, [link.id],
    );
    trackRow('payment_link_payment', committed.id);
    expect(actualStatusAfterForward).toBe(201);
    expect(committed.status).toBe('Pending');
    await expect(page.locator('[data-testid="ocp-pos-charge-amount"]')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('svg[width="212"][height="212"]')).toBeVisible();

    // The first live status GET is dropped after the POST committed. The POS keeps its QR,
    // retries through the actual endpoint, and the DB transition becomes visible on a later poll.
    await expect.poll(() => failedPollOnce, { timeout: 20000 }).toBe(true);
    await withDb(async (db) => db.query(
      `UPDATE payment_link_payment SET status = 'Completed' WHERE id = $1`, [committed.id],
    ));
    await expect(page.getByText(/paid/i).first()).toBeVisible({ timeout: 20000 });
    const apiLinks = await apiGet<LinkDto[]>('paymentLink', { jwt: merchant.jwt });
    const persisted = apiLinks.find((item) => String(item.id) === String(link.id));
    expect(persisted?.payment).toMatchObject({ externalId: committed.externalId, status: 'Completed' });
    const count = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM payment_link_payment WHERE "linkId" = $1`, [link.id],
    );
    expect(count?.count).toBe(1);
  });

  test('POS pending-payment timeout exposes keep-waiting while preserving the one real pending charge', async ({ page }) => {
    test.setTimeout(90000);
    const merchant = await makeMerchant();
    await openOcp(page, merchant.jwt, 'routes');
    await createRoute(page, merchant.userId);
    await openOcp(page, merchant.jwt, 'links');
    const link = await createLink(page, merchant.jwt, merchant.userId);
    await openOcp(page, merchant.jwt, 'pos');
    await page.clock.install();
    await page.route((url) => url.pathname.endsWith('/v1/paymentLink'), async (route: Route) => {
      const url = new URL(route.request().url());
      if (route.request().method() === 'GET' && url.searchParams.has('externalPaymentId')) {
        await route.abort('failed');
      } else {
        await route.continue();
      }
    });

    const payment = await chargeThroughUi(page, Number(link.id), '3.33');
    await expect(page.locator('[data-testid="ocp-pos-charge-amount"]')).toBeVisible();
    const poll = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return request.method() === 'GET' && url.pathname.endsWith('/v1/paymentLink') &&
        url.searchParams.get('externalPaymentId') === payment.externalId;
    });
    await page.clock.fastForward(2000);
    await poll;
    // Advance the remaining browser-side five-minute deadline. The API remains live but each
    // status request is transport-failed, so the pending DB row remains authoritative.
    await page.clock.fastForward(298000);
    await expect(page.getByRole('button', { name: /keep waiting/i })).toBeVisible();
    const pending = await queryOne<{ status: string; count: number }>(
      `SELECT status, COUNT(*) OVER ()::int AS count FROM payment_link_payment WHERE "linkId" = $1`, [link.id],
    );
    expect(pending).toEqual({ status: 'Pending', count: 1 });
    await page.getByRole('button', { name: /keep waiting/i }).click();
    await expect(page.getByText(/waiting/i).first()).toBeVisible();
    const finalCount = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM payment_link_payment WHERE "linkId" = $1`, [link.id],
    );
    expect(finalCount?.count).toBe(1);
  });

  test('config saves and reloads every visible merchant setting through API and Postgres', async ({ page }) => {
    test.setTimeout(90000);
    const merchant = await makeMerchant();
    await openOcp(page, merchant.jwt, 'config');
    const checkboxes = page.getByRole('checkbox');
    await expect(checkboxes).toHaveCount(3);
    await checkboxes.nth(1).check();
    await checkboxes.nth(2).check();
    const selects = page.locator('select');
    await expect(selects).toHaveCount(3);
    await selects.nth(0).selectOption('TxBlockchain');
    await page.locator('input[inputmode="numeric"]').fill('87');
    await selects.nth(1).selectOption('1');
    await selects.nth(2).selectOption('0');
    const saveResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/v1/paymentLink/config') && response.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: /save/i }).click();
    expect((await saveResponse).ok()).toBe(true);
    await expect.poll(async () => {
      const row = await queryOne<{ config: string | null }>(
        `SELECT "paymentLinksConfig" AS config FROM user_data WHERE id = $1`, [merchant.userDataId],
      );
      return row?.config ? JSON.parse(row.config) : undefined;
    }).toMatchObject({
      standards: ['OpenCryptoPay', 'LightningBolt11', 'PayToAddress'],
      minCompletionStatus: 'TxBlockchain',
      paymentTimeout: 87,
      displayQr: true,
      cancellable: false,
    });
    await page.reload();
    await expect(page.getByRole('checkbox').nth(0)).toBeChecked();
    await expect(page.getByRole('checkbox').nth(1)).toBeChecked();
    await expect(page.getByRole('checkbox').nth(2)).toBeChecked();
    await expect(page.locator('select').nth(0)).toHaveValue('TxBlockchain');
    await expect(page.locator('input[inputmode="numeric"]')).toHaveValue('87');
    await expect(page.locator('select').nth(1)).toHaveValue('1');
    await expect(page.locator('select').nth(2)).toHaveValue('0');
    const configResponse = await apiGet<{
      standards: string[]; minCompletionStatus: string; paymentTimeout: number; displayQr: boolean; cancellable: boolean;
    }>('paymentLink/config', { jwt: merchant.jwt });
    expect(configResponse).toMatchObject({
      standards: ['OpenCryptoPay', 'LightningBolt11', 'PayToAddress'],
      minCompletionStatus: 'TxBlockchain', paymentTimeout: 87, displayQr: true, cancellable: false,
    });
  });
});
