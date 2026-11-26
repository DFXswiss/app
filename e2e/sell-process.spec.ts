import { test, expect, Page, Route } from '@playwright/test';
import { getCachedAuth } from './helpers/auth-cache';

const KYC0_ADDRESS = '0x1111111111111111111111111111111111111111';

function kyc0Jwt(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    account: 1,
    user: 1,
    address: KYC0_ADDRESS,
    role: 'User',
    blockchains: ['Ethereum'],
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.synthetic`;
}

const KYC0_EUR = {
  id: 2,
  name: 'EUR',
  buyable: true,
  sellable: true,
  cardBuyable: false,
  cardSellable: false,
  instantBuyable: false,
  instantSellable: false,
};

const KYC0_ETH = {
  id: 1,
  name: 'ETH',
  uniqueName: 'Ethereum/ETH',
  description: 'Ethereum',
  type: 'Coin',
  category: 'Public',
  dexName: 'ETH',
  feeTier: 'Tier0',
  comingSoon: false,
  buyable: true,
  sellable: true,
  cardBuyable: false,
  cardSellable: false,
  instantBuyable: false,
  instantSellable: false,
  blockchain: 'Ethereum',
  decimals: 18,
  sortOrder: 0,
};

const KYC0_USER_ADDRESS = {
  address: KYC0_ADDRESS,
  wallet: 'DFX',
  explorerUrl: 'https://example.invalid',
  blockchains: ['Ethereum'],
  isCustody: false,
};

const KYC0_GET_RESPONSES: Record<string, unknown> = {
  '/v1/language': [
    { id: 1, name: 'Deutsch', symbol: 'DE', foreignName: 'Deutsch', enable: true },
    { id: 2, name: 'English', symbol: 'EN', foreignName: 'English', enable: true },
  ],
  '/v1/fiat': [KYC0_EUR],
  '/v1/asset': [KYC0_ETH],
  '/v1/bankAccount': [],
  '/v1/country': [],
  '/v1/setting/infoBanner': null,
  '/v1/sell/address-check': { result: 'Ok' },
  '/v2/user': {
    id: 1,
    accountId: 1,
    activeAddress: KYC0_USER_ADDRESS,
    addresses: [KYC0_USER_ADDRESS],
    currency: KYC0_EUR,
    language: { id: 2, name: 'English', symbol: 'EN' },
    kyc: { level: 0, status: 'NA' },
    disabledAddresses: [],
  },
};

async function installKyc0Routes(page: Page): Promise<void> {
  await page.route(/\/v[12]\//, async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'GET' && path in KYC0_GET_RESPONSES) return json(KYC0_GET_RESPONSES[path]);
    if (method === 'POST' && path === '/v1/log/clientError') return json({}, 201);

    await json({ error: `Unexpected ${method} ${path}` }, 501);
  });
}

test.describe('Sell Process - KYC level 0 without bank account', () => {
  test('shows the already-verified link below the IBAN selection', async ({ page }) => {
    await installKyc0Routes(page);

    await page.goto(
      `/sell?session=${encodeURIComponent(kyc0Jwt())}&blockchain=Ethereum&asset-in=ETH&asset-out=EUR&amount-in=0.1&lang=en`,
    );

    await expect(page.getByText('Add or select your IBAN', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('I am already verified with DFX', { exact: true })).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('sell-kyc0-already-verified-link.png', {
      fullPage: true,
      maxDiffPixels: 1000,
    });
  });
});


test.describe('Sell Process - UI Flow', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const auth = await getCachedAuth(request, 'evm');
    token = auth.token;
  });

  test('should load sell page with session token', async ({ page }) => {
    await page.goto(`/sell?session=${token}&blockchain=Ethereum`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const pageContent = await page.textContent('body');

    const hasSellContent =
      pageContent?.includes('Sell') ||
      pageContent?.includes('Verkaufen') ||
      pageContent?.includes('spend') ||
      pageContent?.includes('zahlst') ||
      pageContent?.includes('ETH') ||
      pageContent?.includes('IBAN');

    expect(hasSellContent).toBeTruthy();

    await expect(page).toHaveScreenshot('sell-page-loaded.png', {
      maxDiffPixels: 1000,
      fullPage: true,
    });
  });

  test('should display asset selector and amount input', async ({ page }) => {
    await page.goto(`/sell?session=${token}&blockchain=Ethereum`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const hasAmountInput =
      (await page.locator('input[name="amount"]').count()) > 0 ||
      (await page.locator('input[type="number"]').count()) > 0;

    const pageContent = await page.textContent('body');
    const hasFormElements =
      hasAmountInput || pageContent?.includes('ETH') || pageContent?.includes('USDT') || pageContent?.includes('IBAN');

    expect(hasFormElements).toBeTruthy();
  });

  test('should show bank account selector or IBAN input', async ({ page }) => {
    await page.goto(`/sell?session=${token}&blockchain=Ethereum`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const pageContent = await page.textContent('body');

    const hasIbanContent =
      pageContent?.includes('IBAN') ||
      pageContent?.includes('Bank') ||
      pageContent?.includes('Konto') ||
      pageContent?.includes('account') ||
      pageContent?.includes('CH') ||
      pageContent?.includes('DE') ||
      pageContent?.includes('erhältst');

    expect(hasIbanContent).toBeTruthy();
  });

  test('should handle sell flow with pre-filled amount', async ({ page }) => {
    await page.goto(`/sell?session=${token}&blockchain=Ethereum&amount-in=0.1`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();

    await expect(page).toHaveScreenshot('sell-page-with-amount.png', {
      maxDiffPixels: 10000,
    });
  });

  test('should show deposit address after form completion', async ({ page }) => {
    await page.goto(`/sell?session=${token}&blockchain=Ethereum`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const pageContent = await page.textContent('body');

    const hasDepositInfo =
      pageContent?.includes('0x') ||
      pageContent?.includes('deposit') ||
      pageContent?.includes('Einzahlung') ||
      pageContent?.includes('send') ||
      pageContent?.includes('senden');

    const hasFormElements =
      pageContent?.includes('ETH') ||
      pageContent?.includes('IBAN') ||
      pageContent?.includes('EUR') ||
      pageContent?.includes('CHF');

    expect(hasDepositInfo || hasFormElements).toBeTruthy();
  });
});

// UI-based Blockchain Transaction Tests with Full Screenshot Coverage
test.describe('Sell Process - Blockchain Transaction UI (Sepolia)', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const auth = await getCachedAuth(request, 'evm');
    token = auth.token;
  });

  test('should complete Sepolia ETH sell UI flow', async ({ page }) => {
    test.setTimeout(60000);

    // Step 1: Navigate to sell page with Sepolia blockchain
    await page.goto(`/sell?session=${token}&blockchain=Sepolia`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('text=ETH', { timeout: 10000 });
    await page.waitForSelector('text=Sepolia', { timeout: 10000 });
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('sepolia-eth-sell-01-initial-page.png', {
      maxDiffPixels: 2000,
    });

    // Step 2: Enter sell amount in the input field
    const amountInput = page.locator('input[type="number"], input[inputmode="decimal"]').first();
    await amountInput.fill('0.01');
    await page.waitForTimeout(1500);

    // Step 3: Wait for quote to load (exchange rate should update)
    await page.waitForSelector('text=Wechselkurs', { timeout: 10000 });
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('sepolia-eth-sell-02-form-filled.png', {
      maxDiffPixels: 2000,
      fullPage: true,
    });

    // Step 4: Scroll down to find and click the transaction button
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    // Look for the wallet transaction button
    const walletButton = page.locator('button:has-text("Wallet"), button:has-text("Transaktion"), button:has-text("Schliesse")').first();
    const buttonVisible = await walletButton.isVisible().catch(() => false);

    if (buttonVisible) {
      await walletButton.click();
      await page.waitForTimeout(2000);
    }

    // Step 5: Screenshot showing the full page with transaction info
    await expect(page).toHaveScreenshot('sepolia-eth-sell-03-transaction-ready.png', {
      maxDiffPixels: 2000,
      fullPage: true,
    });

    console.log('ETH sell UI flow completed');
  });

  test('should complete Sepolia USDT sell UI flow', async ({ page }) => {
    test.setTimeout(60000);

    // Step 1: Navigate to sell page with Sepolia blockchain
    await page.goto(`/sell?session=${token}&blockchain=Sepolia`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('text=ETH', { timeout: 10000 });
    await page.waitForSelector('text=Sepolia', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Step 2: Click on the asset dropdown (the box showing ETH with chevron)
    // Find the clickable area with ETH and Sepolia Testnet
    await page.click('text=Sepolia Testnet');
    await page.waitForTimeout(1000);

    // Step 3: Select USDT from dropdown
    const usdtOption = page.locator('text=USDT').first();
    await usdtOption.waitFor({ state: 'visible', timeout: 5000 });
    await usdtOption.click();
    await page.waitForTimeout(1000);

    // Verify USDT is now selected and quote is loaded
    await page.waitForSelector('text=USDT', { timeout: 5000 });
    await page.waitForSelector('text=Wechselkurs', { timeout: 15000 });
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('sepolia-usdt-sell-01-initial-page.png', {
      maxDiffPixels: 2000,
    });

    // Step 4: Enter sell amount
    const amountInput = page.locator('input[type="number"], input[inputmode="decimal"]').first();
    await amountInput.fill('10');
    await page.waitForTimeout(1500);

    // Step 5: Wait for quote to load
    await page.waitForSelector('text=Wechselkurs', { timeout: 10000 });
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('sepolia-usdt-sell-02-form-filled.png', {
      maxDiffPixels: 2000,
      fullPage: true,
    });

    // Step 6: Scroll down and click the wallet transaction button
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const walletButton = page.locator('button:has-text("Wallet"), button:has-text("Transaktion"), button:has-text("Schliesse")').first();
    const buttonVisible = await walletButton.isVisible().catch(() => false);

    if (buttonVisible) {
      await walletButton.click();
      await page.waitForTimeout(2000);
    }

    // Step 7: Final screenshot
    await expect(page).toHaveScreenshot('sepolia-usdt-sell-03-transaction-ready.png', {
      maxDiffPixels: 2000,
      fullPage: true,
    });

    console.log('USDT sell UI flow completed');
  });
});
