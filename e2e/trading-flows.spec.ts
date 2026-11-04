import { test, expect } from '@playwright/test';
import { getCachedAuth } from './helpers/auth-cache';
import { prepareLocalSwapVisuals } from './helpers/local-swap-auth';

let token: string;

test.beforeAll(async ({ request }) => {
  const auth = await getCachedAuth(request, 'evm');
  token = auth.token;
});

test.describe('Buy Flow', () => {
  test('should load buy page', async ({ page }) => {
    await page.goto(`/buy?session=${token}&blockchain=Ethereum`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display buy interface elements', async ({ page }) => {
    await page.goto(`/buy?session=${token}&blockchain=Ethereum`);
    await page.waitForLoadState('networkidle');

    // Page should have loaded without errors
    const title = await page.title();
    expect(title).toContain('DFX');
  });

  test('visual regression - buy page', async ({ page }) => {
    await page.goto(`/buy?session=${token}&blockchain=Ethereum`);
    await page.waitForLoadState('networkidle');
    // Wait for asset data to load (ETH should be visible)
    await page.waitForSelector('text=ETH', { timeout: 10000 });
    // Wait for exchange rate to load (indicates all data including address is ready)
    await page.waitForSelector('text=Wechselkurs', { timeout: 30000 });
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('buy-flow-page.png', {
      maxDiffPixels: 5000,
    });
  });
});

test.describe('Sell Flow', () => {
  test('should load sell page', async ({ page }) => {
    await page.goto(`/sell?session=${token}&blockchain=Ethereum`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display sell interface', async ({ page }) => {
    await page.goto(`/sell?session=${token}&blockchain=Ethereum`);
    await page.waitForLoadState('networkidle');

    const title = await page.title();
    expect(title).toContain('DFX');
  });

  test('visual regression - sell page', async ({ page }) => {
    await page.goto(`/sell?session=${token}&blockchain=Ethereum`);
    await page.waitForLoadState('networkidle');
    // Wait for asset data to load (ETH should be visible)
    await page.waitForSelector('text=ETH', { timeout: 10000 });
    // Wait for exchange rate to load (indicates all data including address is ready)
    await page.waitForSelector('text=Wechselkurs', { timeout: 30000 });
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('sell-flow-page.png', {
      maxDiffPixels: 5000,
    });
  });
});

test.describe('Swap Flow', () => {
  let swapToken: string;

  test.beforeAll(async () => {
    const session = await prepareLocalSwapVisuals();
    swapToken = session.evmToken;
  });

  test('should load swap page', async ({ page }) => {
    // Use ETH as source (consistent with sell) - default amount 0.1 will be set automatically
    await page.goto(`/swap?session=${swapToken}&blockchain=Ethereum&asset-in=ETH&asset-out=USDT`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display swap interface', async ({ page }) => {
    await page.goto(`/swap?session=${swapToken}&blockchain=Ethereum&asset-in=ETH&asset-out=USDT`);
    await page.waitForLoadState('networkidle');

    const title = await page.title();
    expect(title).toContain('DFX');
  });

  test('visual regression - swap page', async ({ page }) => {
    await page.goto(`/swap?session=${swapToken}&blockchain=Ethereum&asset-in=ETH&asset-out=USDT`);
    await page.waitForLoadState('networkidle');
    // Wait for page to fully render with default amount (0.1 ETH)
    await page.waitForSelector('text=Du zahlst', { timeout: 10000 });
    await page.waitForSelector('text=Du erhältst ungefähr', { timeout: 10000 });
    await page.waitForSelector('text=ETH', { timeout: 10000 });
    await expect(page.locator('input[name="targetAsset"]')).toHaveValue('USDT');
    await expect(page.getByRole('button', { name: 'Blockchain' })).toContainText('Ethereum');
    // Wait for exchange rate to load (like sell page) - increased timeout for slow API
    await page.waitForSelector('text=Wechselkurs', { timeout: 60000 });
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('swap-flow-page.png', {
      maxDiffPixels: 5000,
    });
  });
});
