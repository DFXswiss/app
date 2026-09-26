/**
 * App 2.0 trade quote, direction-change and payment-request recovery contracts.
 * All browser requests reach the local API and Postgres; no HTTP route is fulfilled or mocked.
 */

import type { Page, Response } from '@playwright/test';
import {
  apiGet,
  apiPut,
  cleanupCreatedData,
  createBankAccount,
  createUser,
  expect,
  queryOne,
  test,
  waitForRow,
} from './fixtures';
import { TEST_IBAN } from './fixtures/test-data';

interface QuoteResponse {
  amount: number;
  estimatedAmount: number;
  isValid: boolean;
  fees: { total: number };
}

interface BuyPaymentInfoResponse {
  id: number;
  routeId: number;
  iban?: string;
  remittanceInfo?: string;
}

interface BuyPaymentInfoRequest {
  asset: { id: number };
  currency: { id: number };
  amount: number;
  paymentMethod: string;
  clientRequestId: string;
  [key: string]: unknown;
}

interface SellQuoteResponse {
  amount: number;
  estimatedAmount: number;
  isValid: boolean;
  feesTarget: { total: number };
}

interface SellPaymentInfoResponse {
  id: number;
  routeId: number;
  depositAddress?: string;
  beneficiary?: { iban: string };
}

interface PaymentInfoRequestStatus {
  existingUid?: string;
  requestStatus: string;
}

async function openApp2(page: Page, jwt: string, hash = '#/'): Promise<void> {
  const response = await page.goto(`/app2/?session=${encodeURIComponent(jwt)}${hash}`);
  expect(response, `/app2/ must be served`).toBeTruthy();
  expect(response?.ok(), `/app2/ status ${response?.status()}`).toBe(true);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(
    (expected) => window.localStorage.getItem('dfx.authenticationToken') === expected,
    jwt,
    { timeout: 15000 },
  );
}

async function pickEthPayAsset(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Select pay asset' }).click();
  const search = page.getByRole('textbox', { name: /search assets/i });
  await expect(search).toBeVisible({ timeout: 15000 });
  await search.fill('ETH');
  await page.getByRole('button', { name: /^ETH\b/ }).first().click();
  const ethereum = page.getByRole('button', { name: /ethereum network/i });
  if (await ethereum.isVisible().catch(() => false)) await ethereum.click();
  await expect(page.getByRole('button', { name: 'Select pay asset' })).toContainText(/ETH/i, { timeout: 10000 });
}

function waitForPut(page: Page, path: string, matches?: (body: Record<string, unknown>) => boolean): Promise<Response> {
  return page.waitForResponse((response) => {
    if (!new URL(response.url()).pathname.endsWith(path) || response.request().method() !== 'PUT') return false;
    if (!matches) return true;
    try {
      return matches(response.request().postDataJSON() as Record<string, unknown>);
    } catch {
      return false;
    }
  }, { timeout: 45000 });
}

test.describe('App 2.0 trade API contracts', () => {
  test.afterEach(async () => {
    await cleanupCreatedData();
  });

  test('buy quote renders the API estimate and fees, then blocks an empty amount before payment creation', async ({ page }) => {
    test.setTimeout(90000);
    const user = await createUser({ tag: 'app2-buy-quote-contract', kycLevel: 50, completePersonalData: true, language: 'EN' });
    let paymentInfoCalls = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.endsWith('/v1/buy/paymentInfos') && request.method() === 'PUT') {
        paymentInfoCalls += 1;
      }
    });

    await openApp2(page, user.jwt);
    await expect(page.getByRole('tab', { name: /^buy$/i })).toHaveAttribute('aria-selected', 'true');
    const spend = page.getByRole('textbox', { name: 'Amount you pay' });
    const quoteResponsePromise = waitForPut(page, '/v1/buy/quote');
    await spend.fill('100');
    const quoteResponse = await quoteResponsePromise;
    expect(quoteResponse.ok(), `PUT /v1/buy/quote status ${quoteResponse.status()}`).toBe(true);
    const quote = (await quoteResponse.json()) as QuoteResponse;
    expect(quote.isValid).toBe(true);
    expect(quote.amount).toBe(100);
    expect(quote.estimatedAmount).toBeGreaterThan(0);
    expect(Number.isFinite(quote.fees.total)).toBe(true);

    const receive = page.getByRole('textbox', { name: 'Amount you receive' });
    const expectedEstimate = quote.estimatedAmount.toLocaleString('en-GB', { maximumFractionDigits: 8 });
    await expect(receive).toHaveValue(expectedEstimate);
    const fees = page.locator('details').first();
    await expect(fees.locator('summary')).not.toBeEmpty();
    await fees.locator('summary').click();
    await expect(fees.getByText(/total fee/i)).toBeVisible();
    await expect(fees).toContainText(
      quote.fees.total.toLocaleString('en-GB', { maximumFractionDigits: 2 }),
    );

    // The local API currently reports minVolume=0 for this live pair, which its backend
    // specification repository uses as the documented no-spec default. Do not invent a floor.
    // Empty input is independently invalid at the App2 amount gate and must never request
    // payment details or create a route.
    await spend.fill('');
    await expect(page.getByTestId('trade-cta')).toBeDisabled();
    expect(paymentInfoCalls, 'empty amount must not call the payment-info write endpoint').toBe(0);
    const routes = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM buy WHERE "userId" = $1`,
      [user.userId],
    );
    expect(routes?.count, 'empty amount must not create a buy route').toBe(0);
  });

  test('swap flip clears the old amount and sends the reversed assets to the real quote endpoint', async ({ page }) => {
    test.setTimeout(90000);
    const user = await createUser({ tag: 'app2-swap-flip-contract', kycLevel: 50, completePersonalData: true, language: 'EN' });
    await openApp2(page, user.jwt, '#/?mode=swap');
    await expect(page.getByRole('tab', { name: /^swap$/i })).toHaveAttribute('aria-selected', 'true', { timeout: 20000 });

    const amount = page.getByRole('textbox', { name: 'Amount you pay' });
    const firstQuotePromise = waitForPut(page, '/v1/swap/quote');
    await amount.fill('0.1');
    const firstResponse = await firstQuotePromise;
    expect(firstResponse.ok(), `initial PUT /v1/swap/quote status ${firstResponse.status()}`).toBe(true);
    const firstBody = firstResponse.request().postDataJSON() as {
      sourceAsset: { id: number };
      targetAsset: { id: number };
      amount: number;
    };
    expect(firstBody.sourceAsset?.id).toBeGreaterThan(0);
    expect(firstBody.targetAsset?.id).toBeGreaterThan(0);
    expect(firstBody.sourceAsset.id).not.toBe(firstBody.targetAsset.id);

    await page.getByRole('button', { name: 'Flip direction' }).click();
    await expect(amount).toHaveValue('');
    const flippedQuotePromise = waitForPut(
      page,
      '/v1/swap/quote',
      (body) => {
        const source = body.sourceAsset as { id?: number } | undefined;
        const target = body.targetAsset as { id?: number } | undefined;
        return source?.id === firstBody.targetAsset.id && target?.id === firstBody.sourceAsset.id;
      },
    );
    await amount.fill('0.1');
    const flippedResponse = await flippedQuotePromise;
    expect(flippedResponse.ok(), `reversed PUT /v1/swap/quote status ${flippedResponse.status()}`).toBe(true);
    const flippedBody = flippedResponse.request().postDataJSON() as typeof firstBody;
    expect(flippedBody.sourceAsset.id).toBe(firstBody.targetAsset.id);
    expect(flippedBody.targetAsset.id).toBe(firstBody.sourceAsset.id);
    expect(flippedBody.amount).toBe(0.1);
  });

  test('sell displays the public quote before creating one IBAN-bound route through payment info', async ({ page }) => {
    test.setTimeout(120000);
    const user = await createUser({ tag: 'app2-sell-quote-contract', kycLevel: 50, completePersonalData: true, language: 'EN' });
    const selectedBankAccount = await createBankAccount(user.jwt, {
      iban: TEST_IBAN,
      label: 'App2 sell quote contract',
    });
    await openApp2(page, user.jwt, '#/?mode=sell');
    await expect(page.getByRole('tab', { name: /^sell$/i })).toHaveAttribute('aria-selected', 'true', { timeout: 20000 });
    await pickEthPayAsset(page);

    const amount = page.getByRole('textbox', { name: 'Amount you pay' });
    const quoteResponsePromise = waitForPut(page, '/v1/sell/quote');
    await amount.fill('0.1');
    const quoteResponse = await quoteResponsePromise;
    expect(quoteResponse.ok(), `PUT /v1/sell/quote status ${quoteResponse.status()}`).toBe(true);
    const quote = (await quoteResponse.json()) as SellQuoteResponse;
    expect(quote.isValid).toBe(true);
    expect(quote.amount).toBe(0.1);
    expect(quote.estimatedAmount).toBeGreaterThan(0);
    expect(Number.isFinite(quote.feesTarget.total)).toBe(true);

    const receiveCurrency = (await page.getByRole('button', { name: 'Select receive currency' }).innerText())
      .trim()
      .split('\n')[0];
    const expectedReceive = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: receiveCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(quote.estimatedAmount);
    await expect(page.getByRole('textbox', { name: 'Amount you receive' })).toHaveValue(expectedReceive);

    let paymentInfoRequestBody: Record<string, unknown> | undefined;
    const paymentInfoResponsePromise = waitForPut(page, '/v1/sell/paymentInfos');
    page.on('request', (request) => {
      if (!new URL(request.url()).pathname.endsWith('/v1/sell/paymentInfos') || request.method() !== 'PUT') return;
      paymentInfoRequestBody = request.postDataJSON() as Record<string, unknown>;
    });
    const cta = page.getByTestId('trade-cta');
    await expect(cta).toBeEnabled({ timeout: 45000 });
    await cta.click();
    const paymentInfoResponse = await paymentInfoResponsePromise;
    expect(paymentInfoResponse.ok(), `PUT /v1/sell/paymentInfos status ${paymentInfoResponse.status()}`).toBe(true);
    expect(paymentInfoRequestBody?.iban).toBe(TEST_IBAN);
    const paymentInfo = (await paymentInfoResponse.json()) as SellPaymentInfoResponse;
    expect(paymentInfo.id).toBeGreaterThan(0);
    expect(paymentInfo.depositAddress).toBeTruthy();
    expect(paymentInfo.routeId).toBeGreaterThan(0);
    expect(paymentInfo.beneficiary?.iban).toBe(TEST_IBAN);

    const route = await waitForRow<{
      id: number;
      type: string;
      userId: number;
      active: boolean;
      iban: string;
      routeId: number;
      depositId: number;
      bankDataId: number;
      bankDataUserDataId: number;
      bankDataIban: string;
      bankDataType: string;
      bankDataActive: boolean;
      routeConfigId: number;
      depositAddress: string;
      depositBlockchains: string;
    }>(
      `SELECT dr.id, dr.type, dr."userId" AS "userId", dr.active, dr.iban,
              dr."routeId" AS "routeId", dr."depositId" AS "depositId",
              dr."bankDataId" AS "bankDataId",
              bd."userDataId" AS "bankDataUserDataId", bd.iban AS "bankDataIban",
              bd.type AS "bankDataType", bd.active AS "bankDataActive",
              r.id AS "routeConfigId", d.address AS "depositAddress",
              d.blockchains AS "depositBlockchains"
       FROM deposit_route dr
       JOIN bank_data bd ON bd.id = dr."bankDataId"
       JOIN route r ON r.id = dr."routeId"
       JOIN deposit d ON d.id = dr."depositId"
       WHERE dr.id = $1 AND dr."userId" = $2 AND dr.type = 'Sell'`,
      [paymentInfo.routeId, user.userId],
      20000,
    );
    expect(route.type).toBe('Sell');
    expect(route.userId).toBe(user.userId);
    expect(route.active).toBe(true);
    expect(route.iban).toBe(TEST_IBAN);
    expect(route.bankDataId).toBe(selectedBankAccount.bankAccountId);
    expect(route.bankDataUserDataId).toBe(user.userDataId);
    expect(route.bankDataIban).toBe(TEST_IBAN);
    expect(route.bankDataType).toBe('User');
    expect(route.bankDataActive).toBe(true);
    expect(route.routeId).toBe(route.routeConfigId);
    expect(route.depositId).toBeGreaterThan(0);
    expect(route.depositAddress).toBe(paymentInfo.depositAddress);
    expect(route.depositBlockchains).toContain('Ethereum');
    const routeCount = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM deposit_route WHERE "userId" = $1 AND type = 'Sell'`,
      [user.userId],
    );
    expect(routeCount?.count).toBe(1);
  });

  test('replaying the App 2.0 buy request ID returns 409 and status lookup finds its single persisted request', async ({ page }) => {
    test.setTimeout(120000);
    const user = await createUser({ tag: 'app2-buy-idempotency-contract', kycLevel: 50, completePersonalData: true, language: 'EN' });
    await openApp2(page, user.jwt);
    const spend = page.getByRole('textbox', { name: 'Amount you pay' });
    const quoteResponsePromise = waitForPut(page, '/v1/buy/quote');
    await spend.fill('100');
    const quoteResponse = await quoteResponsePromise;
    expect(quoteResponse.ok(), `PUT /v1/buy/quote status ${quoteResponse.status()}`).toBe(true);

    const paymentInfoResponsePromise = waitForPut(page, '/v1/buy/paymentInfos');
    const cta = page.getByTestId('trade-cta');
    await expect(cta).toBeEnabled({ timeout: 45000 });
    await cta.click();
    const paymentInfoResponse = await paymentInfoResponsePromise;
    expect(paymentInfoResponse.ok(), `PUT /v1/buy/paymentInfos status ${paymentInfoResponse.status()}`).toBe(true);
    const requestBody = paymentInfoResponse.request().postDataJSON() as BuyPaymentInfoRequest;
    const paymentInfo = (await paymentInfoResponse.json()) as BuyPaymentInfoResponse;
    expect(requestBody.clientRequestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(paymentInfo.id).toBeGreaterThan(0);
    expect(paymentInfo.routeId).toBeGreaterThan(0);
    await expect(page.getByText('IBAN', { exact: true }).first()).toBeVisible({ timeout: 45000 });
    if (paymentInfo.iban) await expect(page.locator('b').filter({ hasText: paymentInfo.iban }).first()).toBeVisible();

    let replayStatusCode = 0;
    const replay = await apiPut<{ code?: string; details?: { existingUid?: string; requestStatus?: string } }>(
      'buy/paymentInfos',
      requestBody,
      { jwt: user.jwt, expectOk: false, onStatus: (status) => { replayStatusCode = status; } },
    );
    expect(replayStatusCode).toBe(409);
    expect(replay.code).toBe('PAYMENT_INFO_ALREADY_EXISTS');

    const requestStatus = await apiGet<PaymentInfoRequestStatus>(
      `transaction/payment-info-request?type=Buy&clientRequestId=${encodeURIComponent(requestBody.clientRequestId)}`,
      { jwt: user.jwt },
    );
    expect(requestStatus.requestStatus).toMatch(/^(Created|WaitingForPayment|Completed|Unknown)$/);
    expect(replay.details?.requestStatus).toBe(requestStatus.requestStatus);

    const claims = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM payment_info_request_claim
       WHERE "accountId" = $1 AND type = 'Buy' AND "clientRequestId" = $2`,
      [user.userDataId, requestBody.clientRequestId],
    );
    expect(claims?.count).toBe(1);
    if (requestStatus.existingUid) {
      const requests = await queryOne<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM transaction_request WHERE uid = $1`,
        [requestStatus.existingUid],
      );
      expect(requests?.count).toBe(1);
    }
  });
});
