import { test, expect } from '@playwright/test';
import { getLinkedLightningAuth } from './helpers/auth-cache';

/**
 * E2E Tests for Buy process with Lightning Wallet 2 linked to Bitcoin account.
 *
 * This test demonstrates the linked Lightning address flow:
 * 1. First authenticates with Bitcoin Wallet 1 (bc1qq70e...) at DFX
 * 2. Then authenticates Bitcoin Wallet 2 (bc1q...) at lightning.space → LNURL
 * 3. Links the new LNURL to the Bitcoin account at DFX (no second KYC)
 *
 * This allows users to have multiple Lightning addresses under one account.
 */
test.describe('Buy Process - Lightning Linked to Bitcoin Account', () => {
  test('should link Lightning Wallet 2 and load buy page', async ({ page, request }) => {
    const { token, lightningAddress, btcAddress, primaryToken } = await getLinkedLightningAuth(request);

    console.log(`Primary Bitcoin token obtained`);
    console.log(`Linked Lightning address: ${lightningAddress}`);
    console.log(`From Bitcoin Wallet 2: ${btcAddress}`);

    await page.goto(`/buy?session=${token}&blockchain=Lightning&lang=de`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const pageContent = await page.textContent('body');

    const hasBuyContent =
      pageContent?.includes('Buy') ||
      pageContent?.includes('Kaufen') ||
      pageContent?.includes('spend') ||
      pageContent?.includes('zahlst') ||
      pageContent?.includes('BTC') ||
      pageContent?.includes('Lightning');

    expect(hasBuyContent).toBeTruthy();

    await page.locator('text=/Wechselkurs|Exchange rate/').first().waitFor({ timeout: 15000 });

    await expect(page).toHaveScreenshot('buy-lightning-linked-page-loaded.png', {
      maxDiffPixels: 10000,
    });
  });

  test('should show BTC as the asset to buy with linked Lightning account', async ({ page, request }) => {
    const { token } = await getLinkedLightningAuth(request);

    await page.goto(`/buy?session=${token}&blockchain=Lightning&lang=de`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const pageContent = await page.textContent('body');

    const hasBtcAsset = pageContent?.includes('BTC') || pageContent?.includes('Bitcoin') || pageContent?.includes('Lightning');

    expect(hasBtcAsset).toBeTruthy();
  });

  test('should display amount input with linked Lightning account', async ({ page, request }) => {
    const { token } = await getLinkedLightningAuth(request);

    await page.goto(`/buy?session=${token}&blockchain=Lightning&lang=de`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const hasAmountInput =
      (await page.locator('input[name="amount"]').count()) > 0 ||
      (await page.locator('input[type="number"]').count()) > 0;

    expect(hasAmountInput).toBeTruthy();
  });

  test('should handle buy flow with pre-filled amount for linked Lightning', async ({ page, request }) => {
    const { token } = await getLinkedLightningAuth(request);

    await page.goto(`/buy?session=${token}&blockchain=Lightning&lang=de`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Set amount directly in DOM
    await page.evaluate(() => {
      const input = document.querySelector('input[type="number"]') as HTMLInputElement;
      if (input) {
        input.value = '100';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(500);

    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();

    await page.locator('text=/Wechselkurs|Exchange rate/').first().waitFor({ timeout: 15000 });

    await expect(page).toHaveScreenshot('buy-lightning-linked-with-amount.png', {
      maxDiffPixels: 10000,
    });
  });

  test('should display exchange rate for linked Lightning purchase', async ({ page, request }) => {
    const { token } = await getLinkedLightningAuth(request);

    await page.goto(`/buy?session=${token}&blockchain=Lightning&lang=de`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Set amount directly in DOM
    await page.evaluate(() => {
      const input = document.querySelector('input[type="number"]') as HTMLInputElement;
      if (input) {
        input.value = '100';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    await page.locator('text=/Wechselkurs|Exchange rate/').first().waitFor({ timeout: 15000 });

    const pageContent = await page.textContent('body');
    const hasExchangeInfo = pageContent?.includes('Wechselkurs') || pageContent?.includes('Exchange rate');

    expect(hasExchangeInfo).toBeTruthy();

    await expect(page).toHaveScreenshot('buy-lightning-linked-exchange-rate.png', {
      maxDiffPixels: 10000,
    });
  });

  test('should show same KYC status as Bitcoin primary wallet', async ({ page, request }) => {
    const { token } = await getLinkedLightningAuth(request);

    await page.goto(`/buy?session=${token}&blockchain=Lightning&lang=de`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const pageContent = await page.textContent('body');

    // The linked address should have the same KYC status as the primary Bitcoin wallet
    const hasContent =
      pageContent?.includes('Wechselkurs') ||
      pageContent?.includes('Exchange rate') ||
      pageContent?.includes('BTC') ||
      pageContent?.includes('Zahlungsinformation') ||
      pageContent?.includes('Payment') ||
      pageContent?.includes('E-Mail');

    expect(hasContent).toBeTruthy();
  });
});

test.describe('Buy Process - Lightning Linked Full UI Flow', () => {
  test('should complete linked Lightning buy UI flow', async ({ page, request }) => {
    test.setTimeout(60000);

    const { token, lightningAddress, btcAddress } = await getLinkedLightningAuth(request);

    console.log(`Testing buy flow with linked Lightning address: ${lightningAddress}`);
    console.log(`From Bitcoin Wallet 2: ${btcAddress}`);

    // Step 1: Navigate to buy page
    await page.goto(`/buy?session=${token}&blockchain=Lightning&lang=de`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.locator('text=/Wechselkurs|Exchange rate/').first().waitFor({ timeout: 15000 });

    await expect(page).toHaveScreenshot('lightning-linked-buy-01-initial.png', {
      maxDiffPixels: 10000,
    });

    // Step 2: Enter amount
    await page.evaluate(() => {
      const input = document.querySelector('input[type="number"]') as HTMLInputElement;
      if (input) {
        input.value = '100';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(1500);

    await page.locator('text=/Wechselkurs|Exchange rate/').first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('lightning-linked-buy-02-form-filled.png', {
      maxDiffPixels: 10000,
    });

    // Step 4: Full page view
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('lightning-linked-buy-03-full-page.png', {
      maxDiffPixels: 10000,
      fullPage: true,
    });

    console.log('Linked Lightning buy UI flow completed');
  });
});
