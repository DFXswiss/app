/**
 * App 2.0 OpenCryptoPay merchant flows against the local API and Postgres.
 * The account credential, merchant approval and Lightning deposit addresses are synthetic
 * local-stack fixtures; every route/link/invoice/charge mutation in the scenarios is made by
 * the real browser UI and API.
 */
import { randomBytes } from 'node:crypto';
import type { Page, Response } from '@playwright/test';
import {
  apiGet,
  apiPost,
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
interface RouteDto { id: number; active: boolean; currency?: { name?: string }; deposit?: { blockchains?: string[] } }
interface LinkDto { id: number | string; routeId: number | string; status: string; lnurl: string; url?: string; label?: string; externalId?: string }

async function app2(page: Page, jwt: string, sub: string): Promise<void> {
  let response: Response | null;
  try {
    response = await page.goto(`/app2/?session=${encodeURIComponent(jwt)}#/ocp?sub=${sub}`);
  } catch {
    throw new Error('/app2/ navigation failed before receiving an HTTP response');
  }
  expect(response?.ok(), `/app2/ status ${response?.status()}`).toBe(true);
  await page.waitForFunction((token) => localStorage.getItem('dfx.authenticationToken') === token, jwt);
}

async function makeMerchant(): Promise<Merchant> {
  // This credential shape is accepted by the local API's Lightning-custodial signup branch.
  const address = `LNNID${randomBytes(33).toString('hex').toUpperCase()}`;
  const signature = randomBytes(70).toString('hex');
  const auth = await fetch(`${process.env.E2E_API_URL ?? 'http://api:3000'}/v1/auth`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, signature, language: 'EN' }),
  });
  if (!auth.ok) throw new Error(`Lightning fixture signup failed: ${auth.status} ${await auth.text()}`);
  const { accessToken } = (await auth.json()) as { accessToken: string };
  const row = await queryOne<{ id: number; userDataId: number }>(
    `SELECT id, "userDataId" AS "userDataId" FROM "user" WHERE address = $1`, [address],
  );
  if (!row || !accessToken) throw new Error('Lightning fixture signup did not persist a user and token');
  trackRow('user_data', row.userDataId);
  trackRow('user', row.id);
  await ensurePersonalDataComplete(row.userDataId, { country: 'CH' });
  const mail = e2eMail(`ocp-merchant-${Date.now()}-${randomBytes(4).toString('hex')}`);
  await withDb(async (db) => {
    await db.query(
      `UPDATE user_data SET mail = $2, "kycLevel" = 30, "paymentLinksAllowed" = TRUE WHERE id = $1`,
      [row.userDataId, mail],
    );
  });
  const requiredData = await queryOne<{
    accountType: string; mail: string | null; phone: string | null; firstname: string | null;
    surname: string | null; street: string | null; location: string | null; zip: string | null; countryId: number | null;
  }>(
    `SELECT "accountType" AS "accountType", mail, phone, firstname, surname, street, location, zip,
       "countryId" AS "countryId" FROM user_data WHERE id = $1`, [row.userDataId],
  );
  if (!requiredData) throw new Error(`No user_data row found for merchant user_data id ${row.userDataId}`);
  const incomplete = Object.entries(requiredData)
    .filter(([, value]) => value == null || value === '')
    .map(([key]) => key);
  expect(incomplete, `Merchant user_data must satisfy SellService.isDataComplete; missing ${incomplete.join(', ')}`).toEqual([]);
  // Route creation consumes these pool rows through the real API. Two permit testing route
  // selection without inventing a separate default-route control that the UI does not have.
  for (let i = 0; i < 2; i++) {
    const deposit = await queryOne<{ id: number }>(
      `INSERT INTO deposit (address, blockchains, "accountIndex") VALUES ($1, 'Lightning', NULL) RETURNING id`,
      [`LNNID${randomBytes(33).toString('hex').toUpperCase()}`],
    );
    if (!deposit) throw new Error('Could not provision local Lightning deposit address');
    trackRow('deposit', deposit.id);
  }
  return { jwt: accessToken, userId: row.id, userDataId: row.userDataId };
}

async function createRouteThroughUi(page: Page, userId: number, iban = TEST_IBAN): Promise<RouteDto> {
  const ibanInput = page.locator('#srIban');
  await ibanInput.fill(iban);
  await expect(ibanInput).toHaveValue(iban);
  const currencySelect = page.locator('#srCur');
  await expect(currencySelect).toHaveValue(/\S+/, { timeout: 20000 });
  const currencyId = await currencySelect.inputValue();
  await currencySelect.selectOption(currencyId);
  const chainSelect = page.locator('#srChain');
  await expect(chainSelect).toHaveValue('Lightning', { timeout: 20000 });
  await chainSelect.selectOption('Lightning');
  const routeResponsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith('/v1/sell') && response.request().method() === 'POST',
    { timeout: 15000 },
  );
  await page.getByRole('button', { name: /create route/i }).click();
  const routeResponse = await routeResponsePromise;
  const routeBody = await routeResponse.text();
  expect(routeResponse.ok(), `POST /v1/sell failed: HTTP ${routeResponse.status()} ${routeBody}`).toBe(true);
  const row = await waitForRow<{ id: number }>(
    `SELECT id FROM deposit_route WHERE "userId" = $1 AND type = 'Sell' ORDER BY id DESC LIMIT 1`, [userId], 20000,
  );
  trackRow('deposit_route', row.id);
  const route = await waitForRow<RouteDto>(
    `SELECT r.id, r.active, json_build_object('blockchains', d.blockchains) AS deposit
     FROM deposit_route r JOIN deposit d ON d.id = r."depositId"
     WHERE r.id = $1`, [row.id], 10000,
  );
  expect(route.active).toBe(true);
  expect(route.deposit?.blockchains).toContain('Lightning');
  // Let the App2 success handler finish clearing the controlled field before
  // a subsequent route creation fills it again.
  await expect(ibanInput).toHaveValue('');
  return route;
}

async function openOcpSub(page: Page, jwt: string, sub: string): Promise<void> {
  await app2(page, jwt, sub);
  await expect(page.locator('h2').first()).toBeVisible({ timeout: 20000 });
}

test.describe('App 2.0 OCP merchant provisioning and transactions', () => {
  test.afterEach(async () => { await cleanupCreatedData(); });

  test('creates and toggles Lightning payout routes while keeping active-route API state correct', async ({ page }) => {
    test.setTimeout(120000);
    const merchant = await makeMerchant();
    await openOcpSub(page, merchant.jwt, 'routes');
    const first = await createRouteThroughUi(page, merchant.userId);
    await createRouteThroughUi(page, merchant.userId, 'CH6600762011623852958');
    const ownedRoutes = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM deposit_route WHERE "userId" = $1 AND type = 'Sell' AND active`, [merchant.userId],
    );
    expect(ownedRoutes?.count).toBe(2);

    const firstRouteCard = page.getByText(`Route ${first.id}`, { exact: true }).locator('xpath=ancestor::details[1]');
    await firstRouteCard.locator('summary').click();
    await firstRouteCard.getByRole('button', { name: /deactivate/i }).click();
    await expect.poll(async () => (await queryOne<{ active: boolean }>(
      `SELECT active FROM deposit_route WHERE id = $1 AND "userId" = $2`, [first.id, merchant.userId],
    ))?.active).toBe(false);

    const defaultRoutes = await apiGet<{ sell: RouteDto[] }>('route', { jwt: merchant.jwt });
    expect(defaultRoutes.sell.some((route) => route.id === first.id)).toBe(false);
    const managementRoutes = await apiGet<{ sell: RouteDto[] }>(
      'route?includeInactiveSell=true', { jwt: merchant.jwt },
    );
    expect(managementRoutes.sell.some((route) => route.id === first.id && !route.active)).toBe(true);

    const reloadRouteResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/v1/route') &&
      new URL(response.url()).searchParams.get('includeInactiveSell') === 'true',
    );
    await page.reload();
    expect((await reloadRouteResponse).ok()).toBe(true);
    const reloadedRouteCard = page.getByText(`Route ${first.id}`, { exact: true }).locator('xpath=ancestor::details[1]');
    await expect(reloadedRouteCard).toContainText(/inactive/i);
    await reloadedRouteCard.locator('summary').click();
    await reloadedRouteCard.getByRole('button', { name: /activate/i }).click();
    await expect.poll(async () => (await queryOne<{ active: boolean }>(
      `SELECT active FROM deposit_route WHERE id = $1 AND "userId" = $2`, [first.id, merchant.userId],
    ))?.active).toBe(true);

    const routes = await apiGet<{ sell: RouteDto[] }>('route', { jwt: merchant.jwt });
    const firstActiveLightning = routes.sell.filter((r) => r.active && r.deposit?.blockchains?.includes('Lightning'))[0];
    expect(firstActiveLightning?.id).toBe(first.id);
  });

  test('creates, disables and opens a merchant link POS; charges and recovers its pending payment', async ({ page }) => {
    test.setTimeout(120000);
    const merchant = await makeMerchant();
    await openOcpSub(page, merchant.jwt, 'routes');
    const route = await createRouteThroughUi(page, merchant.userId);
    await openOcpSub(page, merchant.jwt, 'links');
    await page.getByRole('button', { name: /create payment link/i }).click();
    const link = await waitForRow<LinkDto>(
      `SELECT pl.id, pl."routeId" AS "routeId", pl.status, '' AS lnurl FROM payment_link pl
       JOIN deposit_route r ON r.id = pl."routeId" WHERE r."userId" = $1 ORDER BY pl.id DESC LIMIT 1`,
      [merchant.userId], 20000,
    );
    trackRow('payment_link', Number(link.id));
    expect(String(link.routeId)).toBe(String(route.id));
    const apiLinks = await apiGet<LinkDto[]>('paymentLink', { jwt: merchant.jwt });
    const apiLink = apiLinks.find((item) => String(item.id) === String(link.id));
    expect(apiLink?.lnurl.length).toBeGreaterThan(20);
    const card = page.getByTestId('ocp-link-card').filter({
      has: page.getByText(apiLink?.label || apiLink?.externalId || `Link ${link.id}`, { exact: true }),
    });
    await expect(card).toBeVisible();
    await card.locator('summary').click();
    // OCP CSS-module class names are hashed; target react-qr-code's explicit dimensions.
    await expect(card.locator('svg[width="212"][height="212"]')).toBeVisible();

    await card.getByRole('button', { name: /deactivate/i }).click();
    await expect.poll(async () => (await queryOne<{ status: string }>(
      `SELECT status FROM payment_link WHERE id = $1`, [link.id],
    ))?.status).toMatch(/Inactive/);
    const inactiveLinks = await apiGet<LinkDto[]>('paymentLink', { jwt: merchant.jwt });
    expect(inactiveLinks.some((item) => String(item.id) === String(link.id) && item.status === 'Inactive')).toBe(true);
    await expect(card).toBeVisible();
    await expect(card.getByText('Inactive', { exact: true }).first()).toBeVisible();
    const activateLink = card.getByRole('button', { name: /^activate$/i });
    if (!(await activateLink.isVisible().catch(() => false))) await card.locator('summary').click();
    await expect(activateLink).toBeVisible();
    await activateLink.click();
    await expect.poll(async () => (await queryOne<{ status: string }>(
      `SELECT status FROM payment_link WHERE id = $1`, [link.id],
    ))?.status).toMatch(/Active/);

    if ((await card.getAttribute('open')) === null) await card.locator('summary').click();
    await expect(card.getByRole('button', { name: /open pos/i })).toBeVisible();
    const [popup, posResponse] = await Promise.all([
      page.waitForEvent('popup'),
      page.waitForResponse((response) =>
        new URL(response.url()).pathname.endsWith('/paymentLink/pos') && response.request().method() === 'PUT',
      ),
      card.getByRole('button', { name: /open pos/i }).click(),
    ]);
    const posResult = await posResponse.json() as { url?: string };
    expect(posResponse.ok(), `PUT /paymentLink/pos failed: HTTP ${posResponse.status()}`).toBe(true);
    expect(posResult.url).toBeTruthy();
    const posUrl = new URL(posResult.url!);
    const safeExternalPosUrl = posUrl.protocol === 'https:' &&
      (posUrl.hostname === 'dfx.swiss' || posUrl.hostname.endsWith('.dfx.swiss'));
    expect(safeExternalPosUrl).toBe(false);
    // Local API URLs are deliberately rejected by safeDfxUrl: the reserved tab closes
    // and the merchant stays in App2's internal POS view.
    await expect.poll(() => popup.isClosed()).toBe(true);
    await expect.poll(() => page.evaluate(() => window.location.hash)).toContain('sub=pos');
    await expect(page.locator('input[inputmode="decimal"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /charge/i })).toBeVisible();

    await openOcpSub(page, merchant.jwt, 'pos');
    await page.locator('input[inputmode="decimal"]').fill('9.25');
    await page.getByRole('button', { name: /charge/i }).click();
    const pending = await waitForRow<{ id: number; amount: number | string; status: string; externalId: string }>(
      `SELECT id, amount, status, "externalId" AS "externalId" FROM payment_link_payment
       WHERE "linkId" = $1 AND status = 'Pending' ORDER BY id DESC LIMIT 1`, [link.id], 20000,
    );
    trackRow('payment_link_payment', pending.id);
    expect(Number(pending.amount)).toBe(9.25);
    expect(pending.externalId).toBeTruthy();
    await expect(page.locator('svg[width="212"][height="212"]')).toBeVisible();
    await page.reload();
    await expect(page.locator('[data-testid="ocp-pos-charge-amount"]')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('svg[width="212"][height="212"]')).toBeVisible({ timeout: 20000 });
    const pendingRows = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM payment_link_payment WHERE "linkId" = $1 AND status = 'Pending'`, [link.id],
    );
    expect(pendingRows?.count).toBe(1);
  });

  test('persists merchant settings and renders the completed POS payment in UI and API history', async ({ page }) => {
    test.setTimeout(120000);
    const merchant = await makeMerchant();
    await openOcpSub(page, merchant.jwt, 'routes');
    const route = await createRouteThroughUi(page, merchant.userId);
    await openOcpSub(page, merchant.jwt, 'links');
    await page.getByRole('button', { name: /create payment link/i }).click();
    const link = await waitForRow<{ id: number }>(
      `SELECT pl.id FROM payment_link pl JOIN deposit_route r ON r.id = pl."routeId"
       WHERE r."userId" = $1 ORDER BY pl.id DESC LIMIT 1`, [merchant.userId], 20000,
    );
    trackRow('payment_link', link.id);
    await openOcpSub(page, merchant.jwt, 'pos');
    await page.locator('input[inputmode="decimal"]').fill('4.75');
    await page.getByRole('button', { name: /charge/i }).click();
    const payment = await waitForRow<{ id: number; externalId: string }>(
      `SELECT id, "externalId" AS "externalId" FROM payment_link_payment
       WHERE "linkId" = $1 AND status = 'Pending' ORDER BY id DESC LIMIT 1`, [link.id], 20000,
    );
    trackRow('payment_link_payment', payment.id);
    // Local stack disables settlement workers. This transition exercises terminal UI/readback,
    // not a Lightning settlement or processor callback.
    await withDb(async (db) => db.query(`UPDATE payment_link_payment SET status = 'Completed' WHERE id = $1`, [payment.id]));
    // A normal pending charge refreshed as completed shows its paid state.
    // The terminal-attempt receipt is reserved for ambiguous attempt recovery.
    await expect(page.getByText('Paid · EUR 4.75', { exact: true })).toBeVisible({ timeout: 20000 });
    await openOcpSub(page, merchant.jwt, 'history');
    await expect(page.getByText(payment.externalId, { exact: true })).toBeVisible({ timeout: 20000 });
    const history = await apiGet<Array<{ payments?: Array<{ id: number; status: string; amount: number }> }>>(
      'paymentLink/history', { jwt: merchant.jwt },
    );
    expect(history.some((linkItem) => linkItem.payments?.some(
      (item) => item.id === payment.id && item.status === 'Completed' && item.amount === 4.75,
    ))).toBe(true);
    expect(route.id).toBeGreaterThan(0);

    await openOcpSub(page, merchant.jwt, 'config');
    const timeout = page.locator('input[inputmode="numeric"]');
    await timeout.fill('73');
    await page.getByRole('button', { name: /save/i }).click();
    await expect.poll(async () => {
      const row = await queryOne<{ cfg: string | null }>(
        `SELECT "paymentLinksConfig" AS cfg FROM user_data WHERE id = $1`, [merchant.userDataId],
      );
      return row?.cfg ? Number(JSON.parse(row.cfg).paymentTimeout) : undefined;
    }).toBe(73);
    await openOcpSub(page, merchant.jwt, 'config');
    await expect(timeout).toHaveValue('73');
  });

  test('a concurrent POS charge receives the backend pending-payment conflict and leaves one pending row', async ({ page }) => {
    test.setTimeout(90000);
    const merchant = await makeMerchant();
    await openOcpSub(page, merchant.jwt, 'routes');
    await createRouteThroughUi(page, merchant.userId);
    await openOcpSub(page, merchant.jwt, 'links');
    await page.getByRole('button', { name: /create payment link/i }).click();
    const link = await waitForRow<{ id: number }>(
      `SELECT pl.id FROM payment_link pl JOIN deposit_route r ON r.id = pl."routeId"
       WHERE r."userId" = $1 ORDER BY pl.id DESC LIMIT 1`, [merchant.userId], 20000,
    );
    trackRow('payment_link', link.id);
    await openOcpSub(page, merchant.jwt, 'pos');
    let intercepted!: () => void;
    const held = new Promise<void>((resolve) => { intercepted = resolve; });
    let release!: () => void;
    const allowRequest = new Promise<void>((resolve) => { release = resolve; });
    const isPaymentPost = (url: URL): boolean => url.pathname.endsWith('/v1/paymentLink/payment') && url.searchParams.has('linkId');
    const holdPaymentPost = async (route: import('@playwright/test').Route): Promise<void> => {
      if (route.request().method() !== 'POST') return route.continue();
      intercepted();
      await allowRequest;
      await route.continue();
    };
    await page.route((url) => isPaymentPost(url), holdPaymentPost);
    await page.locator('input[inputmode="decimal"]').fill('6.40');
    await page.getByRole('button', { name: /charge/i }).click();
    await held;
    const winner = await apiPost<{ payment?: { status: string } }>(
      `paymentLink/payment?linkId=${link.id}`,
      { amount: 6.4, externalId: `e2e-race-${Date.now()}` }, { jwt: merchant.jwt },
    );
    expect(winner.payment?.status).toBe('Pending');
    const winnerPayment = await waitForRow<{ id: number }>(
      `SELECT id FROM payment_link_payment WHERE "linkId" = $1 AND status = 'Pending'`, [link.id], 10000,
    );
    trackRow('payment_link_payment', winnerPayment.id);
    const responsePromise = page.waitForResponse((response) =>
      isPaymentPost(new URL(response.url())) && response.request().method() === 'POST',
    );
    release();
    const loser = await responsePromise;
    expect(loser.status()).toBe(409);
    const pending = await queryOne<{ count: number; amount: number }>(
      `SELECT COUNT(*)::int AS count, MAX(amount) AS amount FROM payment_link_payment
       WHERE "linkId" = $1 AND status = 'Pending'`, [link.id],
    );
    expect(pending?.count).toBe(1);
    expect(Number(pending?.amount)).toBe(6.4);
    await page.unroute((url) => isPaymentPost(url), holdPaymentPost);
  });
});
