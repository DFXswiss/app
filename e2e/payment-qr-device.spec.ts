import { expect, test, devices, type Page, type Route } from '@playwright/test';

/**
 * Visual regression: device-aware QR on the payment link page.
 *
 * Desktop → large QR + scan copy.
 * Handheld (iPhone profile: mobile UA + coarse pointer) → no large QR + wallet copy.
 *
 * All payment APIs are mocked with a fixed quote expiry so the countdown and
 * expiration display stay byte-stable across runs. Wait-polling is held open
 * so it never re-triggers a re-fetch loop.
 */

const FIXED_NOW = new Date('2026-06-15T12:00:00.000Z');
/** 30 minutes after FIXED_NOW — countdown freezes at 30m 0s under page.clock. */
const FIXED_EXPIRATION = '2026-06-15T12:30:00.000Z';

const PAY_REQUEST = {
  id: 'pl-handbook-1',
  externalId: 'ext-handbook-1',
  tag: 'handbook-tag',
  displayName: 'Handbook Merchant',
  standard: 'OpenCryptoPay',
  possibleStandards: ['OpenCryptoPay'],
  displayQr: false,
  mode: 'Multiple',
  route: '26678',
  currency: 'CHF',
  recipient: { name: 'Handbook Merchant' },
  transferAmounts: [
    {
      method: 'Lightning',
      minFee: 0,
      assets: [{ asset: 'BTC', amount: 0.00025 }],
      available: true,
    },
  ],
  requestedAmount: { asset: 'CHF', amount: 12.5 },
  quote: {
    id: 'q-handbook',
    expiration: FIXED_EXPIRATION,
    payment: 'pay-handbook',
  },
  callback: 'https://api.example.test/v1/lnurlp/cb/pay-handbook',
  metadata: 'handbook-meta',
  minSendable: 1,
  maxSendable: 100000000,
};

const PAYMENT_STANDARDS = [
  {
    id: 'OpenCryptoPay',
    label: 'OpenCryptoPay',
    description: 'Pay with a compatible app',
  },
];

const WALLET_APPS = [
  {
    id: 1,
    name: 'TestWallet',
    iconUrl:
      'data:image/svg+xml,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="#c8c8c8"/></svg>',
      ),
    recommended: true,
    active: true,
    supportedMethods: ['Lightning'],
    websiteUrl: 'https://example.test',
    deepLink: 'testwallet://',
  },
];

async function installPaymentMocks(page: Page): Promise<void> {
  // Catch every API call so nothing depends on a live backend.
  await page.route('**/*', async (route: Route) => {
    const url = route.request().url();
    const resourceType = route.request().resourceType();

    // Let the SPA, fonts, and webpack-dev-server through.
    if (
      url.includes('localhost:3001') ||
      url.includes('127.0.0.1:3001') ||
      resourceType === 'document' ||
      resourceType === 'stylesheet' ||
      resourceType === 'script' ||
      resourceType === 'font' ||
      resourceType === 'image' ||
      url.includes('webpack') ||
      url.includes('hot-update') ||
      url.includes('sockjs') ||
      url.includes('ws://') ||
      url.includes('wss://')
    ) {
      await route.continue();
      return;
    }

    if (url.includes('/paymentLink/payment') || url.includes('/plp')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(PAY_REQUEST),
      });
      return;
    }

    if (url.includes('/paymentLink/standard')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(PAYMENT_STANDARDS),
      });
      return;
    }

    if (url.includes('/paymentLink/walletApp')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(WALLET_APPS),
      });
      return;
    }

    // Hold open so wait-polling never completes and re-fetches the quote.
    if (url.includes('/lnurlp/wait')) {
      await new Promise(() => {
        /* intentionally never resolves */
      });
      return;
    }

    if (url.includes('/lnurlp/cb') || url.includes('api.example.test')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ pr: 'lnbc1handbooktest' }),
      });
      return;
    }

    // Languages, assets, settings, etc. — empty JSON so the shell can boot offline.
    if (url.includes('/v1/') || url.includes('api.dfx.swiss') || url.includes('api.example')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      });
      return;
    }

    await route.continue();
  });
}

async function openPaymentPage(page: Page): Promise<void> {
  page.on('pageerror', (err) => {
    console.log('[pageerror]', err.message);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('[console.error]', msg.text());
  });

  await installPaymentMocks(page);
  // Freeze wall-clock after routes are ready so countdown + expiry stay stable.
  await page.clock.setFixedTime(FIXED_NOW);

  // Avoid networkidle: the intentional hang on /lnurlp/wait keeps a connection open forever.
  await page.goto('/pl?route=26678&externalId=ext-handbook-1&amount=12.5&currency=CHF&lang=en', {
    waitUntil: 'domcontentloaded',
  });

  // Merchant name + amount confirm the quote rendered (not the loading spinner).
  await expect(page.getByText('Handbook Merchant')).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('12.5')).toBeVisible({ timeout: 15000 });

  // Wait until the QR is no longer in the loading (near-invisible) state if present.
  await page.waitForTimeout(500);
}

const screenshotOpts = {
  animations: 'disabled' as const,
  maxDiffPixels: 200,
};

test.describe('Payment QR — desktop', () => {
  test.use({
    viewport: { width: 1280, height: 900 },
    isMobile: false,
    hasTouch: false,
  });

  test('desktop shows large QR and scan copy', async ({ page }) => {
    await openPaymentPage(page);

    await expect(page.getByText('Scan the QR-Code with a compatible app to complete the payment.')).toBeVisible();
    await expect(page.getByText('Choose your wallet to open the payment.')).toHaveCount(0);

    // Confirm device detection: desktop UA + fine pointer.
    const deviceFlags = await page.evaluate(() => ({
      coarse:
        typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: coarse)').matches : null,
    }));
    expect(deviceFlags.coarse).toBe(false);

    await expect(page).toHaveScreenshot('payment-qr-desktop.png', screenshotOpts);
  });
});

test.describe('Payment QR — handheld', () => {
  // iPhone 13 profile: mobile UA (react-device-detect) + hasTouch (pointer: coarse).
  // Strip defaultBrowserType so the chromium project still drives the browser.
  test.use({
    userAgent: devices['iPhone 13'].userAgent,
    viewport: devices['iPhone 13'].viewport,
    deviceScaleFactor: devices['iPhone 13'].deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
  });

  test('handheld shows wallet copy without large QR', async ({ page }) => {
    await openPaymentPage(page);

    await expect(page.getByText('Choose your wallet to open the payment.')).toBeVisible();
    await expect(page.getByText('Scan the QR-Code with a compatible app to complete the payment.')).toHaveCount(0);

    const deviceFlags = await page.evaluate(() => ({
      coarse:
        typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: coarse)').matches : null,
      ua: navigator.userAgent,
    }));
    // Both signals the screen reads: UA (via isMobile) and coarse pointer.
    expect(deviceFlags.ua).toMatch(/iPhone/i);
    expect(deviceFlags.coarse).toBe(true);

    await expect(page).toHaveScreenshot('payment-qr-handheld.png', screenshotOpts);
  });
});
