import { expect, test, devices, type Page, type Route } from '@playwright/test';

/**
 * Visual regression: device-aware QR on the payment link page.
 *
 * Desktop → large QR + scan copy.
 * Handheld (iPhone profile: mobile UA + coarse pointer) → no large QR + wallet copy.
 *
 * All payment APIs under /v1/ are mocked. Quote expiry is a fixed ISO string so the
 * expiration display stays stable. Wait-polling is held open so it never re-triggers
 * a re-fetch loop.
 *
 * API base URL for the QR payload is pinned via playwright.config webServer.env
 * (E2E_API_URL ?? https://dev.api.dfx.swiss) so baselines stay matrix-stable.
 */

const FIXED_NOW = new Date('2026-06-15T12:00:00.000Z');
/** 30 minutes after FIXED_NOW — used as quote.expiration display value. */
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
  route: 'route-handbook-1',
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
  // Repo standard: only intercept /v1/** so unknown API calls cannot slip to a live backend.
  await page.route('**/v1/**', async (route: Route) => {
    const url = route.request().url();

    // Hold open so wait-polling never completes and re-fetches the quote.
    // Check wait paths before the general /paymentLink/payment match (POS uses paymentLink/payment/wait).
    if (url.includes('/lnurlp/wait') || url.includes('paymentLink/payment/wait')) {
      await new Promise(() => {
        /* intentionally never resolves */
      });
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

    if (url.includes('/lnurlp/cb') || url.includes('api.example.test')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ pr: 'lnbc1handbooktest' }),
      });
      return;
    }

    // Languages, assets, settings, etc. — empty JSON so the shell can boot offline.
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
    });
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
  // Wall-clock pin for any Date.now() consumers; the rate/timer copy does not render
  // here because PAYMENT_STANDARDS has no blockchain field (see payment-link.screen rate guard).
  await page.clock.setFixedTime(FIXED_NOW);

  // Avoid networkidle: the intentional hang on /lnurlp/wait keeps a connection open forever.
  await page.goto('/pl?route=route-handbook-1&externalId=ext-handbook-1&amount=12.5&currency=CHF&lang=en', {
    waitUntil: 'domcontentloaded',
  });

  // Merchant name + amount confirm the quote rendered (not the loading spinner).
  await expect(page.getByText('Handbook Merchant')).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('12.5')).toBeVisible({ timeout: 15000 });

  // QrBasic uses animate-pulse while isLoading; wait until the near-invisible QR state is gone.
  await expect(page.locator('.animate-pulse')).toHaveCount(0, { timeout: 15000 });
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
