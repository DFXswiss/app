/**
 * Additional App2 trade boundaries against the local API and Postgres.
 * No API response is fabricated. One test deliberately drops a real successful response after
 * `route.fetch()` has completed so the browser exercises the ambiguous-response recovery path.
 */

import type { Page, Response } from '@playwright/test';
import { apiGet, expect, queryOne, test, waitForRow, withDb } from './fixtures';
import { cleanupCreatedData, createUser } from './fixtures/factories';

interface QuoteResponse {
  amount: number;
  estimatedAmount: number;
  isValid: boolean;
  error?: string;
  fees?: { total: number };
}

interface BuyPaymentInfoResponse {
  id: number;
  routeId: number;
  uid?: string;
  iban?: string;
  remittanceInfo?: string;
  isValid?: boolean;
  error?: string;
}

interface PaymentInfoStatus {
  existingUid?: string;
  requestStatus: string;
}

async function openApp2(page: Page, jwt: string, hash = '#/'): Promise<void> {
  const response = await page.goto(`/app2/?session=${encodeURIComponent(jwt)}${hash}`);
  expect(response?.ok(), `App2 should load (HTTP ${response?.status() ?? 'no response'})`).toBe(true);
  await page.waitForFunction(
    (expected) => window.localStorage.getItem('dfx.authenticationToken') === expected,
    jwt,
    { timeout: 15000 },
  );
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

async function selectAsset(page: Page, selector: 'Select receive asset' | 'Select pay asset', code: string): Promise<void> {
  await page.getByRole('button', { name: selector }).click();
  const search = page.getByRole('textbox', { name: /search/i });
  await expect(search).toBeVisible({ timeout: 15000 });
  await search.fill(code);
  await page.getByRole('button', { name: new RegExp(`^${code}\\b`) }).first().click();

  // Tokens with multiple wallet-reachable networks show the network chooser after their row.
  const network = page.getByRole('button', { name: /ethereum network/i });
  if (await network.isVisible().catch(() => false)) await network.click();
  await expect(page.getByRole('button', { name: selector })).toContainText(new RegExp(code, 'i'), { timeout: 10000 });
}

async function dropQuoteResponsesUntilManualRetry(page: Page, path: string): Promise<{
  dropped: () => number;
  successfulBackendQuotes: () => number;
  allowResponses: () => void;
}> {
  let dropped = 0;
  let successfulBackendQuotes = 0;
  let shouldDropResponses = true;
  await page.route(`**${path}`, async (route) => {
    if (!shouldDropResponses) {
      await route.continue();
      return;
    }

    // Forward each unchanged browser request to the real local API. Keep the quote failure
    // visible despite automatic retries; the test explicitly releases responses on manual retry.
    const response = await route.fetch();
    const quote = (await response.json()) as QuoteResponse;
    if (response.ok() && quote.isValid) successfulBackendQuotes += 1;
    dropped += 1;
    await route.abort('connectionreset');
  });
  return {
    dropped: () => dropped,
    successfulBackendQuotes: () => successfulBackendQuotes,
    allowResponses: () => { shouldDropResponses = false; },
  };
}

test.describe('App2 extended trade checklist', () => {
  test.afterEach(async () => cleanupCreatedData());

  test('buy quote expires at its real TTL, refreshes from the API and creates no payment route', async ({ page }) => {
    test.setTimeout(90000);
    const user = await createUser({ tag: 'app2-trade-quote-ttl', kycLevel: 50, completePersonalData: true, language: 'EN' });
    await openApp2(page, user.jwt);

    const amount = page.getByRole('textbox', { name: 'Amount you pay' });
    const initialQuotePromise = waitForPut(page, '/v1/buy/quote');
    await amount.fill('100');
    const initialResponse = await initialQuotePromise;
    expect(initialResponse.ok(), `initial real buy quote returned HTTP ${initialResponse.status()}`).toBe(true);
    const initialRequest = initialResponse.request().postDataJSON() as {
      asset: { id: number };
      currency: { id: number };
      amount: number;
    };
    const initialQuote = (await initialResponse.json()) as QuoteResponse;
    expect(initialQuote).toMatchObject({ amount: 100, isValid: true });
    // CSS Modules hash `.qcount`, so assert the actual user-visible countdown instead of
    // relying on a source class name that is not present in the built DOM.
    await expect(page.getByText(/^Refreshes in \d+s$/)).toBeVisible();

    const beforeExpiry = await queryOne<{ routes: number; requests: number }>(
      `SELECT (SELECT COUNT(*)::int FROM buy WHERE "userId" = $1) AS routes,
              (SELECT COUNT(*)::int FROM transaction_request WHERE "userId" = $1) AS requests`,
      [user.userId],
    );
    expect(beforeExpiry).toEqual({ routes: 0, requests: 0 });

    // useQuoteEngine's production TTL is 30 seconds. No timer is mocked: this waits for the
    // browser to let the held real quote expire and for the automatic refresh to reach the API.
    const refreshedQuotePromise = waitForPut(page, '/v1/buy/quote');
    const refreshedResponse = await refreshedQuotePromise;
    expect(refreshedResponse.ok(), `automatic real buy quote refresh returned HTTP ${refreshedResponse.status()}`).toBe(true);
    const refreshedRequest = refreshedResponse.request().postDataJSON() as typeof initialRequest;
    expect(refreshedRequest).toEqual(initialRequest);
    const refreshedQuote = (await refreshedResponse.json()) as QuoteResponse;
    expect(refreshedQuote).toMatchObject({ amount: 100, isValid: true });
    await expect(page.getByText(/^Refreshes in \d+s$/)).toBeVisible();
    await expect(page.getByTestId('trade-cta')).toBeEnabled();

    const afterRefresh = await queryOne<{ routes: number; requests: number }>(
      `SELECT (SELECT COUNT(*)::int FROM buy WHERE "userId" = $1) AS routes,
              (SELECT COUNT(*)::int FROM transaction_request WHERE "userId" = $1) AS requests`,
      [user.userId],
    );
    expect(afterRefresh).toEqual({ routes: 0, requests: 0 });
  });

  test('buy selection carries the chosen asset and fiat through quote into persisted payment details', async ({ page }) => {
    test.setTimeout(120000);
    const user = await createUser({ tag: 'app2-trade-select-pay', kycLevel: 50, completePersonalData: true, language: 'EN' });
    await openApp2(page, user.jwt);

    await selectAsset(page, 'Select receive asset', 'ETH');
    const fiat = page.getByRole('button', { name: 'Select pay currency' });
    await fiat.click();
    await page.getByRole('button', { name: 'CHF', exact: true }).click();
    await expect(fiat).toContainText('CHF');

    const amount = page.getByRole('textbox', { name: 'Amount you pay' });
    const quotePromise = waitForPut(page, '/v1/buy/quote');
    await amount.fill('100');
    const quoteResponse = await quotePromise;
    expect(quoteResponse.ok(), `selected buy quote returned HTTP ${quoteResponse.status()}`).toBe(true);
    const quoteRequest = quoteResponse.request().postDataJSON() as {
      asset: { id: number };
      currency: { id: number };
      amount: number;
    };
    const quote = (await quoteResponse.json()) as QuoteResponse;
    expect(quoteRequest.asset.id).toBeGreaterThan(0);
    expect(quoteRequest.currency.id).toBeGreaterThan(0);
    expect(quoteRequest.amount).toBe(100);
    expect(quote.isValid).toBe(true);
    expect(quote.estimatedAmount).toBeGreaterThan(0);
    await expect(page.getByRole('textbox', { name: 'Amount you receive' })).not.toHaveValue('');

    const paymentInfoPromise = waitForPut(page, '/v1/buy/paymentInfos');
    await expect(page.getByTestId('trade-cta')).toBeEnabled({ timeout: 45000 });
    await page.getByTestId('trade-cta').click();
    const paymentInfoResponse = await paymentInfoPromise;
    expect(paymentInfoResponse.ok(), `selected buy payment info returned HTTP ${paymentInfoResponse.status()}`).toBe(true);
    const paymentRequest = paymentInfoResponse.request().postDataJSON() as {
      asset: { id: number };
      currency: { id: number };
      amount: number;
      clientRequestId: string;
    };
    expect(paymentRequest.asset.id).toBe(quoteRequest.asset.id);
    expect(paymentRequest.currency.id).toBe(quoteRequest.currency.id);
    expect(paymentRequest.amount).toBe(100);
    expect(paymentRequest.clientRequestId).toMatch(/^[0-9a-f-]{36}$/i);
    const details = (await paymentInfoResponse.json()) as BuyPaymentInfoResponse;
    expect(details.id).toBeGreaterThan(0);
    expect(details.routeId).toBeGreaterThan(0);
    await expect(page.getByText('IBAN', { exact: true }).first()).toBeVisible({ timeout: 45000 });

    const persistedRoute = await waitForRow<{ id: number; userId: number; assetId: number; active: boolean }>(
      `SELECT id, "userId", "assetId", active FROM buy WHERE id = $1 AND "userId" = $2`,
      [details.routeId, user.userId],
    );
    expect(persistedRoute.assetId).toBe(quoteRequest.asset.id);
    expect(persistedRoute.active).toBe(true);
    const persistedRequest = await waitForRow<{
      id: number;
      routeId: number;
      sourceId: number;
      targetId: number;
      amount: string;
      userId: number;
    }>(
      `SELECT id, "routeId", "sourceId", "targetId", amount, "userId"
       FROM transaction_request WHERE id = $1 AND "userId" = $2`,
      [details.id, user.userId],
    );
    expect(persistedRequest.routeId).toBe(details.routeId);
    expect(persistedRequest.sourceId).toBe(quoteRequest.currency.id);
    expect(persistedRequest.targetId).toBe(quoteRequest.asset.id);
    expect(Number(persistedRequest.amount)).toBe(100);
    const requestRow = await queryOne<{ clientRequestId: string; requestUid: string }>(
      `SELECT "clientRequestId", "requestUid" FROM payment_info_request_claim
       WHERE "accountId" = $1 AND type = 'Buy' AND "clientRequestId" = $2`,
      [user.userDataId, paymentRequest.clientRequestId],
    );
    expect(requestRow?.clientRequestId).toBe(paymentRequest.clientRequestId);
    expect(requestRow?.requestUid).toBe(details.uid);
  });

  test('buy payment info surfaces the real account limit and tracks its persisted request', async ({ page }) => {
    test.setTimeout(120000);
    const user = await createUser({
      tag: 'app2-trade-buy-limit-recovery',
      kycLevel: 50,
      // A positive but insufficient account limit is a real user-specific gate. The public
      // /buy/quote endpoint deliberately has no user context and must still return a display quote.
      depositLimit: 50,
      completePersonalData: true,
      language: 'EN',
    });
    await openApp2(page, user.jwt);

    const amount = page.getByRole('textbox', { name: 'Amount you pay' });
    const quotePromise = waitForPut(page, '/v1/buy/quote');
    await amount.fill('100');
    const quoteResponse = await quotePromise;
    expect(quoteResponse.ok(), `public quote should return HTTP 200, got ${quoteResponse.status()}`).toBe(true);
    const quote = (await quoteResponse.json()) as QuoteResponse;
    expect(quote.isValid).toBe(true);
    expect(quote.estimatedAmount).toBeGreaterThan(0);

    // The authenticated endpoint returns its payment-info DTO with a business validity error
    // (HTTP 200); it does not reject this as an HTTP 400. No API result is fabricated here.
    const paymentInfoRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.endsWith('/v1/buy/paymentInfos') && request.method() === 'PUT') {
        paymentInfoRequests.push(request.postDataJSON().clientRequestId as string);
      }
    });
    const rejectedPaymentInfoPromise = waitForPut(page, '/v1/buy/paymentInfos');
    await expect(page.getByTestId('trade-cta')).toBeEnabled({ timeout: 45000 });
    await page.getByTestId('trade-cta').click();
    const rejectedPaymentInfo = await rejectedPaymentInfoPromise;
    expect(rejectedPaymentInfo.status()).toBe(200);
    const rejected = await rejectedPaymentInfo.json() as BuyPaymentInfoResponse;
    expect(rejected.isValid).toBe(false);
    expect(rejected.error).toBe('LimitExceeded');
    expect(rejected.id).toBeGreaterThan(0);
    expect(rejected.routeId).toBeGreaterThan(0);
    expect(rejected.uid).toBeTruthy();
    await expect(page.getByText(/exceeds your current limit/i)).toBeVisible({ timeout: 15000 });
    const requestId = rejectedPaymentInfo.request().postDataJSON().clientRequestId as string;
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(paymentInfoRequests).toEqual([requestId]);

    // The API persists the route and invalid transaction request, then links the claim. This is
    // why this response cannot take the pre-claim 404/UUID-rotation retry path.
    const persistedRoute = await waitForRow<{ id: number; userId: number; assetId: number; active: boolean }>(
      `SELECT id, "userId", "assetId", active FROM buy WHERE id = $1 AND "userId" = $2`,
      [rejected.routeId, user.userId],
    );
    expect(persistedRoute.active).toBe(true);
    const persistedRequest = await waitForRow<{
      id: number;
      routeId: number;
      amount: string;
      userId: number;
      status: string;
    }>(
      `SELECT id, "routeId", amount, "userId", status FROM transaction_request
       WHERE id = $1 AND "userId" = $2`,
      [rejected.id, user.userId],
    );
    expect(persistedRequest.routeId).toBe(rejected.routeId);
    expect(persistedRequest.userId).toBe(user.userId);
    expect(Number(persistedRequest.amount)).toBe(100);
    expect(persistedRequest.status).toBeTruthy();
    const claim = await waitForRow<{ clientRequestId: string; requestUid: string }>(
      `SELECT "clientRequestId", "requestUid" FROM payment_info_request_claim
       WHERE "accountId" = $1 AND type = 'Buy' AND "clientRequestId" = $2`,
      [user.userDataId, requestId],
    );
    expect(claim.clientRequestId).toBe(requestId);
    expect(claim.requestUid).toBe(rejected.uid);

    const statusResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/v1/transaction/payment-info-request') && response.ok(),
    );
    await page.getByRole('button', { name: /check request status/i }).click();
    const statusResponse = await statusResponsePromise;
    const status = await statusResponse.json() as PaymentInfoStatus;
    expect(status.existingUid).toBe(rejected.uid);
    expect(status.requestStatus).toBeTruthy();
    expect(paymentInfoRequests).toEqual([requestId]);
    await expect(page.getByTestId('payment-existing-request')).toContainText(rejected.uid!);
  });

  test('buy quote shows manual retry after a lost real response and recovers without creating a route', async ({ page }) => {
    test.setTimeout(150000);
    const user = await createUser({ tag: 'app2-trade-buy-quote-retry', kycLevel: 50, completePersonalData: true, language: 'EN' });
    await openApp2(page, user.jwt);
    const simulation = await dropQuoteResponsesUntilManualRetry(page, '/v1/buy/quote');
    let paymentInfoCalls = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.endsWith('/v1/buy/paymentInfos') && request.method() === 'PUT') {
        paymentInfoCalls += 1;
      }
    });

    await page.getByRole('textbox', { name: 'Amount you pay' }).fill('100');
    const retry = page.getByRole('button', { name: /^retry$/i });
    await expect(retry).toBeVisible({ timeout: 70000 });
    expect(simulation.dropped()).toBeGreaterThan(0);
    expect(simulation.successfulBackendQuotes()).toBeGreaterThan(0);
    const cta = page.getByTestId('trade-cta');
    await expect(cta).toBeDisabled();
    // A transport failure is not a classified account gate. The app must not issue authenticated
    // paymentInfos or create a route until a real public quote succeeds.

    const routeCountBeforeRetry = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM buy WHERE "userId" = $1`, [user.userId],
    );
    expect(routeCountBeforeRetry?.count).toBe(0);
    expect(paymentInfoCalls).toBe(0);

    const recoveredQuotePromise = waitForPut(page, '/v1/buy/quote');
    simulation.allowResponses();
    await retry.click();
    const response = await recoveredQuotePromise;
    expect(response.ok(), `manual buy quote retry returned HTTP ${response.status()}`).toBe(true);
    const quote = await response.json() as QuoteResponse;
    expect(quote.isValid).toBe(true);
    expect(quote.amount).toBe(100);
    await expect(page.getByTestId('trade-cta')).toBeEnabled({ timeout: 15000 });

    const routeCountAfterRetry = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM buy WHERE "userId" = $1`, [user.userId],
    );
    expect(routeCountAfterRetry?.count).toBe(0);
    expect(paymentInfoCalls).toBe(0);
  });

  test('a lost successful buy response recovers the existing request without creating a second route', async ({ page }) => {
    test.setTimeout(120000);
    const user = await createUser({ tag: 'app2-trade-response-loss', kycLevel: 50, completePersonalData: true, language: 'EN' });
    await openApp2(page, user.jwt);
    const amount = page.getByRole('textbox', { name: 'Amount you pay' });
    const quotePromise = waitForPut(page, '/v1/buy/quote');
    await amount.fill('100');
    expect((await quotePromise).ok()).toBe(true);

    let firstAttempt = true;
    let actualSuccessfulResponse: { status: number; id?: number; routeId?: number } | undefined;
    const paymentInfoRequests: Array<Record<string, unknown>> = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.endsWith('/v1/buy/paymentInfos') && request.method() === 'PUT') {
        paymentInfoRequests.push(request.postDataJSON() as Record<string, unknown>);
      }
    });
    // Transport-fault simulation only: route.fetch sends the unchanged browser request to the
    // actual local API. We verify its 2xx/body, then sever only the browser's response socket.
    await page.route('**/v1/buy/paymentInfos', async (route) => {
      if (!firstAttempt) return route.continue();
      firstAttempt = false;
      const realResponse = await route.fetch();
      const body = (await realResponse.json()) as BuyPaymentInfoResponse;
      actualSuccessfulResponse = { status: realResponse.status(), id: body.id, routeId: body.routeId };
      await route.abort('connectionreset');
    });

    await expect(page.getByTestId('trade-cta')).toBeEnabled({ timeout: 45000 });
    await page.getByTestId('trade-cta').click();
    await expect(page.getByRole('heading', { name: /complete your purchase/i })).toBeVisible({ timeout: 45000 });
    expect(actualSuccessfulResponse?.status, 'the backend must have completed the first request').toBe(200);
    expect(actualSuccessfulResponse?.id).toBeGreaterThan(0);
    expect(actualSuccessfulResponse?.routeId).toBeGreaterThan(0);
    expect(paymentInfoRequests).toHaveLength(1);

    const statusResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/v1/transaction/payment-info-request') && response.ok(),
    );
    // Generic network errors render Retry. Because this payment request is locked, that action
    // checks its existing server-side status instead of resubmitting paymentInfos.
    await page.getByRole('button', { name: /^retry$/i }).click();
    const statusResponse = await statusResponsePromise;
    const requestId = paymentInfoRequests[0].clientRequestId as string;
    const status = await statusResponse.json() as PaymentInfoStatus;
    expect(status.existingUid).toBeTruthy();
    expect(status.requestStatus).toMatch(/^(Created|WaitingForPayment|Completed)$/);
    expect(statusResponse.url()).toContain(encodeURIComponent(requestId));
    await expect(page.getByTestId('payment-existing-request')).toContainText(status.existingUid!);
    await expect(page.getByTestId('payment-existing-request')).toContainText(status.requestStatus);

    const claims = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM payment_info_request_claim
       WHERE "accountId" = $1 AND type = 'Buy' AND "clientRequestId" = $2`,
      [user.userDataId, requestId],
    );
    expect(claims?.count).toBe(1);
    const routes = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM buy WHERE "userId" = $1`,
      [user.userId],
    );
    expect(routes?.count).toBe(1);
    const linkedRequest = await queryOne<{ uid: string; routeId: number; amount: string }>(
      `SELECT uid, "routeId", amount FROM transaction_request WHERE id = $1`,
      [actualSuccessfulResponse!.id],
    );
    expect(linkedRequest?.uid).toBe(status.existingUid);
    expect(Number(linkedRequest?.routeId)).toBe(actualSuccessfulResponse?.routeId);
    expect(Number(linkedRequest?.amount)).toBe(100);
  });

  test('sell without a payout account opens the real account picker and never submits payment info', async ({ page }) => {
    test.setTimeout(90000);
    const user = await createUser({ tag: 'app2-trade-sell-no-bank', kycLevel: 50, completePersonalData: true, language: 'EN' });
    await openApp2(page, user.jwt, '#/?mode=sell');
    await expect(page.getByRole('tab', { name: /^sell$/i })).toHaveAttribute('aria-selected', 'true', { timeout: 20000 });
    await selectAsset(page, 'Select pay asset', 'ETH');

    const paymentInfoRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.endsWith('/v1/sell/paymentInfos') && request.method() === 'PUT') {
        paymentInfoRequests.push(request.url());
      }
    });
    const quotePromise = waitForPut(page, '/v1/sell/quote');
    await page.getByRole('textbox', { name: 'Amount you pay' }).fill('0.1');
    const quoteResponse = await quotePromise;
    expect(quoteResponse.ok(), `sell display quote returned HTTP ${quoteResponse.status()}`).toBe(true);
    const quote = (await quoteResponse.json()) as QuoteResponse;
    expect(quote.isValid).toBe(true);

    const cta = page.getByTestId('trade-cta');
    await expect(cta).toBeEnabled({ timeout: 45000 });
    await cta.click();
    await expect(page.getByText(/no bank accounts yet/i)).toBeVisible({ timeout: 15000 });
    expect(paymentInfoRequests, 'account selection must precede the payout-bound API write').toHaveLength(0);
    const accounts = await apiGet<Array<{ iban: string }>>('bankAccount', { jwt: user.jwt });
    expect(accounts).toHaveLength(0);
    const routes = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM deposit_route WHERE "userId" = $1 AND type = 'Sell'`,
      [user.userId],
    );
    expect(routes?.count).toBe(0);
  });

  test('swap clearing a valid quote disables payment and re-entry requests a fresh real quote', async ({ page }) => {
    test.setTimeout(90000);
    const user = await createUser({ tag: 'app2-trade-swap-clear-retry', kycLevel: 50, completePersonalData: true, language: 'EN' });
    await openApp2(page, user.jwt, '#/?mode=swap');
    await expect(page.getByRole('tab', { name: /^swap$/i })).toHaveAttribute('aria-selected', 'true', { timeout: 20000 });
    const paymentInfoRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.endsWith('/v1/swap/paymentInfos') && request.method() === 'PUT') {
        paymentInfoRequests.push(request.url());
      }
    });

    const amount = page.getByRole('textbox', { name: 'Amount you pay' });
    const firstQuotePromise = waitForPut(page, '/v1/swap/quote');
    await amount.fill('0.1');
    const firstResponse = await firstQuotePromise;
    expect(firstResponse.ok(), `first swap quote returned HTTP ${firstResponse.status()}`).toBe(true);
    const firstQuote = (await firstResponse.json()) as QuoteResponse;
    expect(firstQuote.isValid).toBe(true);
    await expect(page.getByTestId('trade-cta')).toBeEnabled({ timeout: 45000 });

    await amount.fill('');
    await expect(page.getByTestId('trade-cta')).toBeDisabled();
    expect(paymentInfoRequests).toHaveLength(0);
    const noRoute = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM deposit_route WHERE "userId" = $1 AND type = 'Crypto'`,
      [user.userId],
    );
    expect(noRoute?.count).toBe(0);

    const recoveredQuotePromise = waitForPut(page, '/v1/swap/quote', (body) => body.amount === 0.2);
    await amount.fill('0.2');
    const recoveredResponse = await recoveredQuotePromise;
    expect(recoveredResponse.ok(), `re-entered swap quote returned HTTP ${recoveredResponse.status()}`).toBe(true);
    const recoveredQuote = (await recoveredResponse.json()) as QuoteResponse;
    expect(recoveredQuote.amount).toBe(0.2);
    expect(recoveredQuote.isValid).toBe(true);
    await expect(page.getByTestId('trade-cta')).toBeEnabled({ timeout: 45000 });
    expect(paymentInfoRequests).toHaveLength(0);
  });

  test('swap quote exposes manual retry after a lost real response and creates its deposit route only after payment intent', async ({ page }) => {
    test.setTimeout(180000);
    const user = await createUser({ tag: 'app2-trade-swap-quote-retry', kycLevel: 50, completePersonalData: true, language: 'EN' });
    await openApp2(page, user.jwt, '#/?mode=swap');
    const simulation = await dropQuoteResponsesUntilManualRetry(page, '/v1/swap/quote');
    let paymentInfoCalls = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.endsWith('/v1/swap/paymentInfos') && request.method() === 'PUT') {
        paymentInfoCalls += 1;
      }
    });

    await page.getByRole('textbox', { name: 'Amount you pay' }).fill('0.1');
    const retry = page.getByRole('button', { name: /^retry$/i });
    await expect(retry).toBeVisible({ timeout: 70000 });
    expect(simulation.dropped()).toBeGreaterThan(0);
    expect(simulation.successfulBackendQuotes()).toBeGreaterThan(0);
    const cta = page.getByTestId('trade-cta');
    await expect(cta).toBeDisabled();
    // A transport failure is not a classified account gate. Do not create a swap route or issue
    // authenticated paymentInfos until a real quote response succeeds.
    const noRouteBeforeRetry = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM deposit_route WHERE "userId" = $1 AND type = 'Crypto'`,
      [user.userId],
    );
    expect(noRouteBeforeRetry?.count).toBe(0);
    expect(paymentInfoCalls).toBe(0);

    const recoveredQuotePromise = waitForPut(page, '/v1/swap/quote');
    simulation.allowResponses();
    await retry.click();
    const quoteResponse = await recoveredQuotePromise;
    expect(quoteResponse.ok(), `manual swap quote retry returned HTTP ${quoteResponse.status()}`).toBe(true);
    const quote = await quoteResponse.json() as QuoteResponse;
    expect(quote.isValid).toBe(true);
    expect(quote.amount).toBe(0.1);
    await expect(page.getByTestId('trade-cta')).toBeEnabled({ timeout: 15000 });

    const paymentInfoPromise = waitForPut(page, '/v1/swap/paymentInfos');
    await page.getByTestId('trade-cta').click();
    const paymentInfoResponse = await paymentInfoPromise;
    expect(paymentInfoResponse.ok(), `swap payment info returned HTTP ${paymentInfoResponse.status()}`).toBe(true);
    const paymentInfo = await paymentInfoResponse.json() as {
      id: number;
      routeId: number;
      depositAddress?: string;
      isValid: boolean;
      amount: number;
      sourceAsset: { id: number };
      targetAsset: { id: number };
    };
    expect(paymentInfo.isValid).toBe(true);
    expect(paymentInfo.id).toBeGreaterThan(0);
    expect(paymentInfo.depositAddress).toBeTruthy();
    expect(paymentInfo.amount).toBe(0.1);

    const depositRoute = await waitForRow<{ id: number; userId: number; type: string; active: boolean }>(
      `SELECT id, "userId", type, active FROM deposit_route WHERE id = $1 AND "userId" = $2`,
      [paymentInfo.routeId, user.userId],
    );
    expect(depositRoute).toEqual({ id: paymentInfo.routeId, userId: user.userId, type: 'Crypto', active: true });
    const transactionRequest = await waitForRow<{
      id: number;
      routeId: number;
      sourceId: number;
      targetId: number;
      amount: string;
      userId: number;
    }>(
      `SELECT id, "routeId", "sourceId", "targetId", amount, "userId"
       FROM transaction_request WHERE id = $1 AND "userId" = $2`,
      [paymentInfo.id, user.userId],
    );
    expect(transactionRequest.routeId).toBe(paymentInfo.routeId);
    expect(transactionRequest.sourceId).toBe(paymentInfo.sourceAsset.id);
    expect(transactionRequest.targetId).toBe(paymentInfo.targetAsset.id);
    expect(Number(transactionRequest.amount)).toBe(0.1);
    expect(paymentInfoCalls).toBe(1);
  });
});
