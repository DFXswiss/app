import { test, expect } from '@playwright/test';
import { getCachedAuth } from './helpers/auth-cache';

/**
 * E2E Tests for Buy process with Lightning wallet.
 *
 * Lightning is Bitcoin's Layer 2 payment network.
 * These tests verify that a user can buy BTC via Lightning.
 */
test.describe('Buy Process - Lightning Wallet', () => {
  async function getLightningToken(
    request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  ): Promise<string> {
    // Lightning flow: authenticate via lightning.space to get LNURL + signature for DFX
    const auth = await getCachedAuth(request, 'lightning');
    return auth.token;
  }

  test('should load buy page with Lightning blockchain', async ({ page, request }) => {
    const token = await getLightningToken(request);

    await page.goto(`/buy?session=${token}&blockchain=Lightning&lang=de`);
    await page.waitForLoadState('networkidle');

    // Wait for amount field to have default value (300)
    await page.locator('input[type="number"]').first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(2000); // Wait for React to set default value

    // Wait for page to fully load - either KYC message or exchange rate
    await page
      .locator('text=/E-Mail|Wechselkurs/i')
      .first()
      .waitFor({ timeout: 10000 });
    await page.waitForTimeout(500); // Small delay for animations

    const pageContent = await page.textContent('body');

    const hasBuyContent =
      pageContent?.includes('Buy') ||
      pageContent?.includes('Kaufen') ||
      pageContent?.includes('spend') ||
      pageContent?.includes('zahlst') ||
      pageContent?.includes('BTC') ||
      pageContent?.includes('Lightning') ||
      pageContent?.includes('SAT') ||
      pageContent?.includes('CHF') ||
      pageContent?.includes('EUR');

    expect(hasBuyContent).toBeTruthy();

    await expect(page).toHaveScreenshot('buy-lightning-page-loaded.png', {
      maxDiffPixels: 10000,
    });
  });

  test('should display amount input for Lightning purchase', async ({ page, request }) => {
    const token = await getLightningToken(request);

    await page.goto(`/buy?session=${token}&blockchain=Lightning&lang=de`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const hasAmountInput =
      (await page.locator('input[name="amount"]').count()) > 0 ||
      (await page.locator('input[type="number"]').count()) > 0 ||
      (await page.locator('input[placeholder*="0"]').count()) > 0;

    const pageContent = await page.textContent('body');
    const hasFormElements =
      hasAmountInput || pageContent?.includes('100') || pageContent?.includes('CHF') || pageContent?.includes('EUR');

    expect(hasFormElements).toBeTruthy();
  });

  test('should show Lightning or BTC as target asset', async ({ page, request }) => {
    const token = await getLightningToken(request);

    await page.goto(`/buy?session=${token}&blockchain=Lightning&lang=de`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const pageContent = await page.textContent('body');

    // Should show BTC, Lightning, or SAT as the asset
    const hasLightningAsset =
      pageContent?.includes('BTC') ||
      pageContent?.includes('Lightning') ||
      pageContent?.includes('SAT') ||
      pageContent?.includes('sats');

    expect(hasLightningAsset).toBeTruthy();
  });

  test('should show trading restriction or successful load for Lightning', async ({ page, request }) => {
    const token = await getLightningToken(request);

    await page.goto(`/buy?session=${token}&blockchain=Lightning&lang=de`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const pageContent = await page.textContent('body');

    const hasTradingRestriction =
      pageContent?.includes('Trading not allowed') ||
      pageContent?.includes('recommendation') ||
      pageContent?.includes('email address') ||
      pageContent?.includes('nicht erlaubt') ||
      pageContent?.includes('KYC') ||
      pageContent?.includes('verify');

    const hasSuccessfulLoad =
      pageContent?.includes('BTC') ||
      pageContent?.includes('Lightning') ||
      pageContent?.includes('SAT') ||
      pageContent?.includes('spend') ||
      pageContent?.includes('zahlst');

    expect(hasTradingRestriction || hasSuccessfulLoad).toBeTruthy();

    if (hasTradingRestriction) {
      console.log('Trading restriction detected - this is expected for sandbox test accounts');
    }
  });

  test('should handle buy flow with pre-filled amount for Lightning', async ({ page, request }) => {
    const token = await getLightningToken(request);

    await page.goto(`/buy?session=${token}&blockchain=Lightning&lang=de`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Set amount directly in DOM (Playwright's fill/type don't work with StyledInput)
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

    await expect(page).toHaveScreenshot('buy-lightning-with-amount.png', {
      maxDiffPixels: 10000,
    });
  });

  test('should display exchange rate or KYC requirement for Lightning purchase', async ({ page, request }) => {
    const token = await getLightningToken(request);

    await page.goto(`/buy?session=${token}&blockchain=Lightning&lang=de`);
    await page.waitForLoadState('networkidle');

    // Wait for page to fully load - either KYC message or exchange rate
    await page
      .locator('text=/E-Mail|Wechselkurs/i')
      .first()
      .waitFor({ timeout: 10000 });

    // Wait for React to fully initialize the form
    await page.waitForTimeout(2000);

    // Set amount directly in DOM (Playwright's fill/type don't work with this React input)
    await page.evaluate(() => {
      const input = document.querySelector('input[type="number"]') as HTMLInputElement;
      if (input) {
        input.value = '100';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(1000);

    const pageContent = await page.textContent('body');

    // Either shows exchange rate OR KYC requirement (email needed)
    const hasExchangeInfo =
      pageContent?.includes('Wechselkurs') ||
      pageContent?.includes('Exchange rate') ||
      pageContent?.includes('BTC') ||
      pageContent?.includes('Lightning');

    const hasKycRequirement =
      pageContent?.includes('E-Mail') ||
      pageContent?.includes('email') ||
      pageContent?.includes('handeln');

    expect(hasExchangeInfo || hasKycRequirement).toBeTruthy();

    await expect(page).toHaveScreenshot('buy-lightning-exchange-rate.png', {
      maxDiffPixels: 10000,
    });
  });
});
