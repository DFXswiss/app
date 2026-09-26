/**
 * Additional App2 checklist flows with real local browser/API/Postgres evidence.
 * External providers and actions without a deterministic local setup are documented as gaps,
 * not replaced with route mocks.
 */

import type { Page } from '@playwright/test';
import { expect, test, waitForRow } from './fixtures';
import { cleanupCreatedData, createUser, e2eMail, trackRow } from './fixtures/factories';

async function openApp2(page: Page, jwt: string, hash: string): Promise<void> {
  const url = `/app2/?session=${encodeURIComponent(jwt)}${hash}`;
  let response: Awaited<ReturnType<Page['goto']>>;
  try {
    response = await page.goto(url);
  } catch {
    // Playwright's navigation exception normally includes the complete URL, which contains the JWT.
    throw new Error(`App2 ${hash.split('?')[0]} navigation failed before receiving a response`);
  }
  expect(response?.ok(), `App2 ${hash.split('?')[0]} should load (HTTP ${response?.status() ?? 'no response'})`).toBe(true);
  await page.waitForFunction((expected) => localStorage.getItem('dfx.authenticationToken') === expected, jwt);
}

function magicOtp(data: string): string {
  const notification = JSON.parse(data) as { texts?: Array<{ params?: { url?: string } }> };
  for (const text of notification.texts ?? []) {
    const link = text.params?.url;
    if (typeof link !== 'string') continue;
    const otp = new URL(link, process.env.E2E_FRONTEND_URL ?? 'http://frontend').searchParams.get('otp');
    if (otp) return otp;
  }
  throw new Error('Login notification does not contain an otp URL');
}

test.describe('App2 additional open checklist functions', () => {
  test.afterEach(async () => cleanupCreatedData());

  test('a render crash shows the branded error fallback and Retry reloads into the real account', async ({ page }) => {
    const user = await createUser({ tag: 'app2-error-boundary-retry', language: 'EN' });
    let userApiResponseSeen = false;
    let realApiResponseWasSuccessful = false;
    let baselineMailWasString = false;
    let injectedResponseCount = 0;
    await page.route('**/v2/user*', async (route) => {
      const requestUrl = new URL(route.request().url());
      if (!requestUrl.pathname.endsWith('/v2/user') || route.request().method() !== 'GET') {
        return route.continue();
      }
      userApiResponseSeen = true;
      if (injectedResponseCount > 0) return route.continue();
      // Keep the real API request and response, but inject one impossible API value to exercise
      // React Router's root route errorElement. A plain 404 does not exercise this render-error path.
      const response = await route.fetch();
      realApiResponseWasSuccessful = response.ok();
      const body = await response.json() as Record<string, unknown>;
      baselineMailWasString = typeof body.mail === 'string';
      body.mail = { deliberatelyInvalidReactChild: true };
      injectedResponseCount += 1;
      await route.fulfill({ response, json: body });
    });

    await openApp2(page, user.jwt, '#/account');
    await expect.poll(() => injectedResponseCount, { message: 'one real App2 user API response must be fault-injected' }).toBe(1);
    expect(userApiResponseSeen, 'the App2 user API request must be observed').toBe(true);
    expect(realApiResponseWasSuccessful, 'the unmodified local API response must be successful').toBe(true);
    expect(baselineMailWasString, 'the value changed for fault injection must be a real API string').toBe(true);
    expect(injectedResponseCount, 'exactly one real API response must receive the crash-inducing value').toBe(1);
    await expect(page.getByRole('button', { name: /^retry$/i })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('img', { name: 'DFX' })).toBeVisible();
    await page.getByRole('button', { name: /^retry$/i }).click();
    await expect(page.getByText(user.mail, { exact: true })).toBeVisible({ timeout: 20000 });
    expect(injectedResponseCount).toBe(1);
  });

  test('entry, route refresh and not-found fallback retain the authenticated API account', async ({ page }) => {
    const user = await createUser({ tag: 'app2-open-entry', language: 'EN' });
    const firstUserFetch = page.waitForResponse((response) => {
      const path = new URL(response.url()).pathname;
      return path.endsWith('/user') && response.request().method() === 'GET' && response.ok();
    });
    await openApp2(page, user.jwt, '#/account');
    await expect(page.getByText(user.mail, { exact: true })).toBeVisible({ timeout: 20000 });
    await firstUserFetch;

    const reloadUserFetch = page.waitForResponse((response) => {
      const path = new URL(response.url()).pathname;
      return path.endsWith('/user') && response.request().method() === 'GET' && response.ok();
    });
    await page.reload();
    await reloadUserFetch;
    await expect(page.getByText(user.mail, { exact: true })).toBeVisible({ timeout: 20000 });
    const persisted = await waitForRow<{ id: number; mail: string }>(
      `SELECT id, mail FROM user_data WHERE id = $1 AND mail = $2`,
      [user.userDataId, user.mail],
    );
    expect(persisted.mail).toBe(user.mail);

    await page.goto('/app2/#/not-a-real-route');
    await expect(page.getByRole('heading', { name: /page not found/i })).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /back to (home|buy)|home/i }).click();
    await expect(page.getByRole('tab', { name: /^buy$/i })).toHaveAttribute('aria-selected', 'true');
  });

  test('logged-out landing translates its hero and primary actions for German, Italian and French', async ({ page }) => {
    const languages = [
      {
        code: 'de',
        heading: ['Krypto kaufen,', 'direkt in deine Wallet'],
        connect: 'Wallet verbinden',
        email: 'Mit E-Mail fortfahren',
      },
      {
        code: 'it',
        heading: ['Compra crypto,', 'dritto nel tuo wallet'],
        connect: 'Connetti wallet',
        email: 'Continua con email',
      },
      {
        code: 'fr',
        heading: ['Achète des cryptos,', 'directement dans ton wallet'],
        connect: 'Connecte ton wallet',
        email: 'Continuer par e-mail',
      },
    ];

    for (const language of languages) {
      const response = await page.goto(`/app2/?lang=${language.code}`);
      expect(response?.ok(), `App2 landing for ${language.code} should load`).toBe(true);
      await expect(page.getByText(language.heading[0], { exact: true })).toBeVisible({ timeout: 20000 });
      await expect(page.getByText(language.heading[1], { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: new RegExp(language.connect) })).toBeVisible();
      await expect(page.getByRole('button', { name: new RegExp(language.email) })).toBeVisible();
    }
  });

  test('magic link opens in browser once, creates a real session and rejects replay', async ({ page }) => {
    test.setTimeout(90000);
    const email = e2eMail('app2-open-magic-link');
    await page.goto('/app2/');
    await page.getByRole('button', { name: /continue with email/i }).click();
    await page.getByRole('textbox', { name: /email address/i }).fill(email);
    await page.getByRole('button', { name: /send magic link/i }).click();
    await expect(page.getByTestId('app2-toast')).toContainText(/check your email/i, { timeout: 20000 });

    const sent = await waitForRow<{ data: string }>(
      `SELECT n.data FROM notification n JOIN user_data ud ON ud.id = n."userDataId"
       WHERE ud.mail = $1 AND n.context = 'Login' ORDER BY n.id DESC LIMIT 1`,
      [email],
      20000,
    );
    const otp = magicOtp(sent.data);
    await page.goto(`/mail-login?otp=${encodeURIComponent(otp)}`);
    await page.waitForURL((url) => url.pathname === '/account' || url.searchParams.has('session'), { timeout: 30000 });
    await expect.poll(() => page.evaluate(() => localStorage.getItem('dfx.authenticationToken')), { timeout: 20000 }).toBeTruthy();
    const session = await page.evaluate(() => localStorage.getItem('dfx.authenticationToken'));
    expect(session).toBeTruthy();
    await page.goto('/app2/');
    await expect(page.getByRole('tab', { name: /^buy$/i })).toHaveAttribute('aria-selected', 'true', { timeout: 20000 });

    const account = await waitForRow<{ id: number; mail: string }>(
      `SELECT id, mail FROM user_data WHERE mail = $1`,
      [email],
      15000,
    );
    trackRow('user_data', account.id);
    await page.goto(`/mail-login?otp=${encodeURIComponent(otp)}`);
    await page.waitForURL((url) => url.pathname === '/error', { timeout: 20000 });
    await expect(page.getByText(/login link expired/i)).toBeVisible({ timeout: 10000 });
  });

  test('a magic link expires after its configured lifetime @magic-link-expiry', async ({ page }) => {
    const configuredTtl = process.env.E2E_MAIL_LOGIN_TTL_MINUTES;
    test.skip(!configuredTtl, 'Run only in the isolated stack with E2E_MAIL_LOGIN_TTL_MINUTES set.');

    const ttlMinutes = Number(configuredTtl);
    expect(Number.isFinite(ttlMinutes), 'the configured magic-link TTL must be numeric').toBe(true);
    expect(ttlMinutes, 'this opt-in browser test must not wait on a long production-like TTL').toBeGreaterThan(0);
    expect(ttlMinutes, 'use a short TTL (at most 30 seconds) for the isolated expiry test').toBeLessThanOrEqual(0.5);
    test.setTimeout(90000);

    const email = e2eMail('app2-expired-magic-link');
    await page.goto('/app2/');
    await page.getByRole('button', { name: /continue with email/i }).click();
    await page.getByRole('textbox', { name: /email address/i }).fill(email);
    await page.getByRole('button', { name: /send magic link/i }).click();
    await expect(page.getByTestId('app2-toast')).toContainText(/check your email/i, { timeout: 20000 });

    const sent = await waitForRow<{ data: string; userDataId: number }>(
      `SELECT n.data, ud.id AS "userDataId"
       FROM notification n JOIN user_data ud ON ud.id = n."userDataId"
       WHERE ud.mail = $1 AND n.context = 'Login' ORDER BY n.id DESC LIMIT 1`,
      [email],
      20000,
    );
    trackRow('user_data', sent.userDataId);
    const otp = magicOtp(sent.data);

    // The API registered the key before writing this notification. Waiting a full configured
    // lifetime plus a margin from this later point is therefore safely beyond expiration,
    // without probing/consuming the code early or changing either process clock.
    await page.waitForTimeout(Math.ceil(ttlMinutes * 60_000) + 2000);

    try {
      await page.goto(`/mail-login?otp=${encodeURIComponent(otp)}`);
    } catch {
      // Avoid Playwright's navigation exception echoing the one-time OTP in its URL.
      throw new Error('Opening the expired Magic Link did not complete browser navigation');
    }
    try {
      await page.waitForURL((url) => url.pathname === '/error', { timeout: 20000 });
    } catch {
      throw new Error('The expired Magic Link did not navigate to the existing error screen');
    }
    await expect(page.getByText(/login link expired/i)).toBeVisible({ timeout: 10000 });
    expect(await page.evaluate(() => localStorage.getItem('dfx.authenticationToken'))).toBeNull();
  });

  test('drawer reaches every internal destination and external entries keep their HTTPS origins', async ({ page }) => {
    const user = await createUser({ tag: 'app2-open-drawer', kycLevel: 50, completePersonalData: true, language: 'EN' });
    await openApp2(page, user.jwt, '#/');

    const destinations = [
      {
        label: 'Buy',
        path: '/?mode=buy',
        assertion: () => expect(page.getByRole('tab', { name: /^buy$/i })).toHaveAttribute('aria-selected', 'true'),
      },
      {
        label: 'Sell',
        path: '/?mode=sell',
        assertion: () => expect(page.getByRole('tab', { name: /^sell$/i })).toHaveAttribute('aria-selected', 'true'),
      },
      {
        label: 'Swap',
        path: '/?mode=swap',
        assertion: () => expect(page.getByRole('tab', { name: /^swap$/i })).toHaveAttribute('aria-selected', 'true'),
      },
      { label: 'My account', path: '/account', assertion: () => expect(page.getByText(/^trading limit$/i)).toBeVisible() },
      { label: 'Transactions', path: '/tx', assertion: () => expect(page.getByRole('heading', { name: /^transactions$/i })).toBeVisible() },
      {
        label: 'Verification (KYC)',
        path: '/kyc',
        assertion: () => expect(page.getByRole('heading', { name: /verification/i })).toBeVisible(),
      },
      { label: 'Increase your limit', path: '/limit', assertion: () => expect(page.getByTestId('limit-card')).toBeVisible() },
      {
        label: 'OpenCryptoPay',
        path: '/ocp',
        assertion: () => expect(page.getByRole('heading', { name: /opencryptopay/i }).first()).toBeVisible(),
      },
      { label: 'Support', path: '/support', assertion: () => expect(page.getByRole('heading', { name: /^support$/i })).toBeVisible() },
    ];

    for (const destination of destinations) {
      await page.getByRole('button', { name: 'menu' }).click();
      const drawer = page.getByRole('dialog', { name: /account/i });
      await drawer.getByRole('button', { name: destination.label, exact: true }).click();
      await expect.poll(() => page.evaluate(() => location.hash.slice(1))).toContain(destination.path);
      await destination.assertion();
    }

    await page.goBack();
    await expect.poll(() => page.evaluate(() => location.hash.slice(1))).toBe('/ocp');
    await expect(page.getByRole('heading', { name: /opencryptopay/i }).first()).toBeVisible();
    await page.getByRole('button', { name: 'menu' }).click();
    await page.getByRole('dialog', { name: /account/i }).getByRole('button', { name: 'Support', exact: true }).click();
    await expect(page.getByRole('heading', { name: /^support$/i })).toBeVisible();

    // Payment routes is merchant-gated. For a real non-merchant account, the drawer action
    // requests the sub-view, the API's 403 marks the account inactive, and OcpScreen returns
    // to the hub. Assert that real gate and its persisted prerequisite instead of pretending
    // the route sub-view opened.
    const activationDenied = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/paymentLink/config') && response.status() === 403,
    );
    await page.getByRole('button', { name: 'menu' }).click();
    await page.getByRole('dialog', { name: /account/i }).getByRole('button', { name: 'Payment routes', exact: true }).click();
    const deniedResponse = await activationDenied;
    expect(deniedResponse.status(), 'the live non-merchant API must deny payment-route access').toBe(403);
    await expect.poll(() => page.evaluate(() => location.hash.slice(1))).toBe('/ocp');
    // The UI fallback returns to the OCP hub rather than leaving a broken route or blank screen.
    await expect(page.getByRole('heading', { name: /opencryptopay/i }).first()).toBeVisible();
    const merchantEnabled = await waitForRow<{ paymentLinksAllowed: boolean }>(
      `SELECT "paymentLinksAllowed" AS "paymentLinksAllowed" FROM user_data WHERE id = $1`,
      [user.userDataId],
    );
    expect(merchantEnabled.paymentLinksAllowed).toBe(false);

    const externalLinks = [
      { label: 'DFX.swiss', host: 'dfx.swiss' },
      { label: 'Terms & conditions', host: 'docs.dfx.swiss' },
      { label: 'Privacy policy', host: 'docs.dfx.swiss' },
      { label: 'Imprint', host: 'docs.dfx.swiss' },
    ];
    for (const link of externalLinks) {
      await page.getByRole('button', { name: 'menu' }).click();
      const drawer = page.getByRole('dialog', { name: /account/i });
      const popupPromise = page.waitForEvent('popup');
      const targetRequestPromise = page.context().waitForEvent('request', (request) => {
        if (!request.isNavigationRequest()) return false;
        const target = new URL(request.url());
        return target.protocol === 'https:' && target.hostname === link.host;
      });
      await drawer.getByRole('button', { name: link.label, exact: true }).click();
      const [popup, targetRequest] = await Promise.all([popupPromise, targetRequestPromise]);
      // DNS for external pages is blocked in this harness. Verify the actual browser navigation
      // request URL (the popup becomes chrome-error://chromewebdata/ after that expected failure).
      const target = new URL(targetRequest.url());
      expect(target.protocol).toBe('https:');
      expect(target.hostname).toBe(link.host);
      await popup.close();
    }
  });

  test('combined partner asset and amount params affect the real buy payment request', async ({ page }) => {
    test.setTimeout(120000);
    const user = await createUser({ tag: 'app2-open-widget-combined', kycLevel: 50, completePersonalData: true, language: 'EN' });
    const externalTransactionId = `partner-combo-${Date.now()}`;
    const responseCapture: { body?: Record<string, unknown> } = {};
    page.on('request', (request) => {
      try {
        if (request.method() !== 'PUT' || !new URL(request.url()).pathname.endsWith('/buy/paymentInfos')) return;
        responseCapture.body = request.postDataJSON() as Record<string, unknown>;
      } catch {
        // Other requests do not carry JSON.
      }
    });

    const query = new URLSearchParams({
      session: user.jwt,
      'asset-in': 'CHF',
      'asset-out': 'Ethereum/USDT',
      // The buy flow has a fiat-equivalent minimum; 0.01 USDT leaves the quote invalid.
      // 200 USDT clears that minimum with room for exchange-rate variation.
      'amount-out': '200',
      'external-transaction-id': externalTransactionId,
    });
    const partnerUrl = `/app2/?${query.toString()}#/`;
    let response: Awaited<ReturnType<Page['goto']>>;
    try {
      response = await page.goto(partnerUrl);
    } catch {
      throw new Error('App2 combined partner URL navigation failed before receiving a response');
    }
    expect(response?.ok(), 'App2 partner URL should load').toBe(true);
    await page.waitForFunction((jwt) => localStorage.getItem('dfx.authenticationToken') === jwt, user.jwt);
    await expect(page.getByRole('button', { name: 'Select receive asset' })).toContainText(/USDT/i, { timeout: 20000 });
    await expect(page.getByRole('button', { name: 'Select pay currency' })).toContainText(/CHF/i, { timeout: 20000 });
    await expect(page.getByRole('textbox', { name: 'Amount you receive' })).toHaveValue('200');
    const cta = page.getByTestId('trade-cta');
    await expect(cta).toBeEnabled({ timeout: 45000 });
    await cta.click();
    await expect(page.getByText('IBAN', { exact: true }).first()).toBeVisible({ timeout: 45000 });

    await expect.poll(() => responseCapture.body?.externalTransactionId, { timeout: 15000 }).toBe(externalTransactionId);
    expect(responseCapture.body?.targetAmount).toBe(200);
    expect(responseCapture.body?.currency).toMatchObject({ name: 'CHF' });
    expect(responseCapture.body?.asset).toMatchObject({ blockchain: 'Ethereum', name: 'USDT' });
    const quote = await waitForRow<{
      id: number;
      userId: number;
      externalTransactionId: string;
      sourceId: number;
      targetId: number;
    }>(
      `SELECT id, "userId" AS "userId", "externalTransactionId" AS "externalTransactionId",
              "sourceId" AS "sourceId", "targetId" AS "targetId"
       FROM transaction_request WHERE "externalTransactionId" = $1 ORDER BY id DESC LIMIT 1`,
      [externalTransactionId],
      20000,
    );
    trackRow('transaction_request', quote.id);
    expect(quote.userId).toBe(user.userId);
    expect(quote.externalTransactionId).toBe(externalTransactionId);
    const source = await waitForRow<{ name: string }>(`SELECT name FROM fiat WHERE id = $1`, [quote.sourceId]);
    expect(source.name).toBe('CHF');
    const target = await waitForRow<{ name: string }>(`SELECT name FROM asset WHERE id = $1`, [quote.targetId]);
    expect(target.name).toMatch(/USDT/i);
  });
});
