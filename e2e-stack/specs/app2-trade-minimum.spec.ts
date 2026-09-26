/**
 * App 2.0 Buy minimum-volume boundary against the real local API and Postgres.
 * Requests are never fulfilled or mocked; an unexpected valid quote reports the full response.
 */

import type { Page, Response } from '@playwright/test';
import { cleanupCreatedData, createUser, expect, queryOne, test } from './fixtures';

interface BuyQuoteResponse {
  amount: number;
  estimatedAmount: number;
  isValid: boolean;
  error?: string;
  minVolume?: number;
  errors?: Array<{ error: string; limit?: number }>;
}

async function openApp2(page: Page, jwt: string): Promise<void> {
  const response = await page.goto(`/app2/?session=${encodeURIComponent(jwt)}#/`);
  expect(response?.ok(), `App2 should load (HTTP ${response?.status() ?? 'no response'})`).toBe(true);
  await page.waitForFunction(
    (expected) => window.localStorage.getItem('dfx.authenticationToken') === expected,
    jwt,
    { timeout: 15000 },
  );
}

function waitForBuyQuote(page: Page, amount: number): Promise<Response> {
  return page.waitForResponse((response) => {
    if (!new URL(response.url()).pathname.endsWith('/v1/buy/quote') || response.request().method() !== 'PUT') return false;
    try {
      return (response.request().postDataJSON() as { amount?: number }).amount === amount;
    } catch {
      return false;
    }
  }, { timeout: 45000 });
}

test.describe('App2 Buy minimum-volume E2E', () => {
  test.afterEach(async () => cleanupCreatedData());

  test('a real quote endpoint 503 fails closed and manual retry recovers without arming payment info', async ({ page }) => {
    test.setTimeout(90000);
    const user = await createUser({
      tag: 'app2-buy-quote-503',
      kycLevel: 50,
      completePersonalData: true,
      language: 'EN',
    });
    let injectedFailure = false;
    let paymentInfoCalls = 0;
    await page.route('**/v1/buy/quote', async (route) => {
      if (injectedFailure || route.request().method() !== 'PUT') return route.continue();
      injectedFailure = true;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 503, message: 'temporary quote service failure' }),
      });
    });
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.endsWith('/v1/buy/paymentInfos') && request.method() === 'PUT') {
        paymentInfoCalls += 1;
      }
    });

    await openApp2(page, user.jwt);
    const quoteResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/v1/buy/quote') && response.request().method() === 'PUT',
    );
    await page.getByRole('textbox', { name: 'Amount you pay' }).fill('100');
    const failedQuote = await quoteResponsePromise;
    expect(failedQuote.status()).toBe(503);
    await expect(page.getByRole('button', { name: /^retry$/i })).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('trade-cta')).toBeDisabled();
    expect(paymentInfoCalls).toBe(0);
    expect(await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM buy WHERE "userId" = $1`, [user.userId],
    )).toMatchObject({ count: 0 });

    const recoveredQuotePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/v1/buy/quote') && response.request().method() === 'PUT' && response.status() < 500,
    );
    await page.getByRole('button', { name: /^retry$/i }).click();
    const recoveredQuote = await recoveredQuotePromise;
    expect(recoveredQuote.ok()).toBe(true);
    await expect(page.getByTestId('trade-cta')).toBeEnabled({ timeout: 15000 });
    expect(paymentInfoCalls).toBe(0);
    expect(await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM buy WHERE "userId" = $1`, [user.userId],
    )).toMatchObject({ count: 0 });
  });

  test('an injected unsupported state on a real API quote fails closed before payment info', async ({ page }) => {
    const user = await createUser({
      tag: 'app2-buy-unsupported-quote',
      kycLevel: 50,
      completePersonalData: true,
      language: 'EN',
    });
    let injectedUnsupportedQuote = false;
    let paymentInfoCalls = 0;
    await page.route('**/v1/buy/quote', async (route) => {
      if (injectedUnsupportedQuote || route.request().method() !== 'PUT') return route.continue();
      injectedUnsupportedQuote = true;
      const response = await route.fetch();
      expect(response.ok(), `the local API baseline quote returned HTTP ${response.status()}`).toBe(true);
      const quote = await response.json() as Record<string, unknown>;
      await route.fulfill({ response, json: { ...quote, isValid: false, error: 'AssetUnsupported' } });
    });
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.endsWith('/v1/buy/paymentInfos') && request.method() === 'PUT') {
        paymentInfoCalls += 1;
      }
    });

    await openApp2(page, user.jwt);
    const quoteResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/v1/buy/quote') && response.request().method() === 'PUT',
    );
    await page.getByRole('textbox', { name: 'Amount you pay' }).fill('100');
    const response = await quoteResponsePromise;
    expect(response.ok()).toBe(true);
    expect((await response.json() as { isValid?: boolean; error?: string })).toMatchObject({
      isValid: false,
      error: 'AssetUnsupported',
    });
    await expect(page.getByTestId('trade-cta')).toBeDisabled({ timeout: 15000 });
    expect(paymentInfoCalls).toBe(0);
    expect(await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM buy WHERE "userId" = $1`, [user.userId],
    )).toMatchObject({ count: 0 });
    expect(injectedUnsupportedQuote).toBe(true);
  });

  test('real AmountTooLow quote explains the minimum and cannot create payment details or a route', async ({ page }) => {
    test.setTimeout(90000);
    const user = await createUser({
      tag: 'app2-buy-minimum-boundary',
      kycLevel: 50,
      completePersonalData: true,
      language: 'EN',
    });
    let paymentInfoCalls = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.endsWith('/v1/buy/paymentInfos') && request.method() === 'PUT') {
        paymentInfoCalls += 1;
      }
    });

    await openApp2(page, user.jwt);
    // The local E2E stack seeds a real CHF inbound transaction specification with a CHF 1
    // minimum. The default App2 pair is EUR/USDT and has no minimum, so select the seeded fiat
    // before deriving the probe from the real API response.
    const fiat = page.getByRole('button', { name: 'Select pay currency' });
    await fiat.click();
    await page.getByRole('button', { name: 'CHF', exact: true }).click();
    await expect(fiat).toContainText('CHF');

    const amount = page.getByRole('textbox', { name: 'Amount you pay' });

    // Read the floor from the real API. If the local seed is missing or the selected pair stops
    // exposing that floor, fail here instead of inventing a number that appears to be below it.
    const baselineResponsePromise = waitForBuyQuote(page, 100);
    await amount.fill('100');
    const baselineResponse = await baselineResponsePromise;
    expect(baselineResponse.status(), `baseline quote returned HTTP ${baselineResponse.status()}`).toBe(200);
    const baseline = (await baselineResponse.json()) as BuyQuoteResponse;
    expect(baseline.isValid, `baseline quote unexpectedly invalid: ${JSON.stringify(baseline)}`).toBe(true);

    const floor = Number(baseline.minVolume ?? 0);
    expect(floor, `CHF quote must expose the seeded nonzero minimum: ${JSON.stringify(baseline)}`).toBeGreaterThan(0);
    const probeAmount = floor / 2;
    expect(probeAmount).toBeGreaterThan(0);
    const lowQuoteResponsePromise = waitForBuyQuote(page, probeAmount);
    await amount.fill(String(probeAmount));
    const lowQuoteResponse = await lowQuoteResponsePromise;
    expect(lowQuoteResponse.status(), `minimum probe returned HTTP ${lowQuoteResponse.status()}`).toBe(200);
    const lowQuote = (await lowQuoteResponse.json()) as BuyQuoteResponse;
    const errorCodes = [lowQuote.error, ...(lowQuote.errors ?? []).map(({ error }) => error)].filter(Boolean);

    expect(
      { isValid: lowQuote.isValid, errorCodes, minVolume: lowQuote.minVolume, probeAmount, response: lowQuote },
      `Expected the real API to return AmountTooLow for ${probeAmount}; full response: ${JSON.stringify(lowQuote)}`,
    ).toMatchObject({ isValid: false, errorCodes: expect.arrayContaining(['AmountTooLow']) });
    await expect(page.getByText(/^Min\b/), 'invalid quote must show the inline minimum-amount reason').toBeVisible();
    await expect(page.getByTestId('trade-cta')).toBeDisabled();

    const persisted = await queryOne<{ routes: number; requests: number }>(
      `SELECT (SELECT COUNT(*)::int FROM buy WHERE "userId" = $1) AS routes,
              (SELECT COUNT(*)::int FROM transaction_request WHERE "userId" = $1) AS requests`,
      [user.userId],
    );
    expect(paymentInfoCalls, 'invalid quote must not call the authenticated payment-info endpoint').toBe(0);
    expect(persisted, 'invalid quote must not persist a buy route or transaction request').toEqual({ routes: 0, requests: 0 });
  });
});
