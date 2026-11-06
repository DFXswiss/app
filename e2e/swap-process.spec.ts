import { test, expect } from '@playwright/test';
import { prepareLocalSwapVisuals } from './helpers/local-swap-auth';

test.describe('Swap Process - UI Flow', () => {
  let token: string;

  test.beforeAll(async () => {
    const session = await prepareLocalSwapVisuals();
    token = session.evmToken;
  });

  test('should load swap page with session token', async ({ page }) => {
    // Use ETH as source (consistent with sell) - default amount 0.1 will be set automatically
    await page.goto(`/swap?session=${token}&blockchain=Ethereum&asset-in=ETH&asset-out=USDT`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const pageContent = await page.textContent('body');

    const hasSwapContent =
      pageContent?.includes('Swap') ||
      pageContent?.includes('Tauschen') ||
      pageContent?.includes('Du zahlst') ||
      pageContent?.includes('Du erhältst');

    expect(hasSwapContent).toBeTruthy();

    await expect(page).toHaveScreenshot('swap-page-loaded.png', {
      maxDiffPixels: 5000,
      fullPage: true,
    });
  });

  test('should show at least one visible ETH or USDT asset label', async ({ page }) => {
    await page.goto(`/swap?session=${token}&blockchain=Ethereum&asset-in=ETH&asset-out=USDT`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // At least one of the ETH or USDT labels is visible
    const ethVisible = await page.locator('text=ETH').first().isVisible();
    const usdtVisible = await page.locator('text=USDT').first().isVisible();

    expect(ethVisible || usdtVisible).toBeTruthy();
  });

  test('should wait for ETH text, show target USDT and Ethereum, and wait for Wechselkurs', async ({ page }) => {
    // ETH source should auto-fill 0.1 as default amount (like sell page)
    await page.goto(`/swap?session=${token}&blockchain=Ethereum&asset-in=ETH&asset-out=USDT`);
    await page.waitForLoadState('networkidle');
    // Wait for assets to load
    await page.waitForSelector('text=ETH', { timeout: 10000 });
    await expect(page.locator('input[name="targetAsset"]')).toHaveValue('USDT');
    await expect(page.getByRole('button', { name: 'Blockchain' })).toContainText('Ethereum');
    await page.waitForSelector('text=Wechselkurs', { timeout: 30000 });
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('swap-page-with-amount.png', {
      maxDiffPixels: 5000,
    });
  });

  test('should include one of the swap-related tokens in the page text', async ({ page }) => {
    await page.goto(`/swap?session=${token}&blockchain=Ethereum&asset-in=ETH&asset-out=USDT`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const pageContent = await page.textContent('body');

    const hasSwapInfo =
      pageContent?.includes('0x') ||
      pageContent?.includes('deposit') ||
      pageContent?.includes('Einzahlung') ||
      pageContent?.includes('send') ||
      pageContent?.includes('senden') ||
      pageContent?.includes('Swap') ||
      pageContent?.includes('exchange');

    expect(hasSwapInfo).toBeTruthy();
  });
});
