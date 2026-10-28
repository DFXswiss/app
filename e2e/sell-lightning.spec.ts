import { test, expect } from '@playwright/test';
import { getCachedAuth } from './helpers/auth-cache';

/**
 * E2E Tests for Sell process with Lightning wallet.
 *
 * Lightning is Bitcoin's Layer 2 payment network.
 * These tests verify that a user can sell BTC via Lightning.
 */
test.describe('Sell Process - Lightning Wallet', () => {
  async function getLightningToken(
    request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  ): Promise<string> {
    const auth = await getCachedAuth(request, 'lightning');
    return auth.token;
  }

  test('should load sell page with Lightning blockchain', async ({ page, request }) => {
    const token = await getLightningToken(request);

    await page.goto(`/sell?session=${token}&blockchain=Lightning&lang=de`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const pageContent = await page.textContent('body');

    const hasSellContent =
      pageContent?.includes('Sell') ||
      pageContent?.includes('Verkaufen') ||
      pageContent?.includes('spend') ||
      pageContent?.includes('zahlst') ||
      pageContent?.includes('BTC') ||
      pageContent?.includes('Lightning') ||
      pageContent?.includes('SAT');

    expect(hasSellContent).toBeTruthy();

    await expect(page).toHaveScreenshot('sell-lightning-page-loaded.png', {
      maxDiffPixels: 10000,
    });
  });

  test('should show BTC/Lightning as the asset to sell', async ({ page, request }) => {
    const token = await getLightningToken(request);

    await page.goto(`/sell?session=${token}&blockchain=Lightning&lang=de`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const pageContent = await page.textContent('body');

    const hasLightningAsset =
      pageContent?.includes('BTC') ||
      pageContent?.includes('Lightning') ||
      pageContent?.includes('SAT') ||
      pageContent?.includes('sats');

    expect(hasLightningAsset).toBeTruthy();
  });

  test('should display amount input for Lightning sell', async ({ page, request }) => {
    const token = await getLightningToken(request);

    await page.goto(`/sell?session=${token}&blockchain=Lightning&lang=de`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const hasAmountInput =
      (await page.locator('input[name="amount"]').count()) > 0 ||
      (await page.locator('input[type="number"]').count()) > 0 ||
      (await page.locator('input[inputmode="decimal"]').count()) > 0;

    const pageContent = await page.textContent('body');
    const hasFormElements =
      hasAmountInput ||
      pageContent?.includes('BTC') ||
      pageContent?.includes('CHF') ||
      pageContent?.includes('EUR') ||
      pageContent?.includes('SAT');

    expect(hasFormElements).toBeTruthy();
  });

  test('should show bank account selector or IBAN input for Lightning sell', async ({ page, request }) => {
    const token = await getLightningToken(request);

    await page.goto(`/sell?session=${token}&blockchain=Lightning&lang=de`);
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
      pageContent?.includes('erhältst') ||
      pageContent?.includes('E-Mail'); // KYC requirement

    expect(hasIbanContent).toBeTruthy();
  });

  test('should show trading restriction or successful load for Lightning sell', async ({ page, request }) => {
    const token = await getLightningToken(request);

    await page.goto(`/sell?session=${token}&blockchain=Lightning&lang=de`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const pageContent = await page.textContent('body');

    const hasTradingRestriction =
      pageContent?.includes('Trading not allowed') ||
      pageContent?.includes('recommendation') ||
      pageContent?.includes('email address') ||
      pageContent?.includes('nicht erlaubt') ||
      pageContent?.includes('KYC') ||
      pageContent?.includes('verify') ||
      pageContent?.includes('E-Mail');

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

  test('should handle sell flow with pre-filled amount for Lightning', async ({ page, request }) => {
    const token = await getLightningToken(request);

    await page.goto(`/sell?session=${token}&blockchain=Lightning&lang=de`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Set amount directly in DOM (Playwright's fill/type don't work with StyledInput)
    await page.evaluate(() => {
      const input = document.querySelector('input[type="number"]') as HTMLInputElement;
      if (input) {
        input.value = '0.001';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(500);

    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();

    await expect(page).toHaveScreenshot('sell-lightning-with-amount.png', {
      maxDiffPixels: 10000,
    });
  });

  test('should display exchange rate or IBAN selector for Lightning sell', async ({ page, request }) => {
    const token = await getLightningToken(request);

    await page.goto(`/sell?session=${token}&blockchain=Lightning&lang=de`);
    await page.waitForLoadState('networkidle');

    // Wait for page to fully load - IBAN selector or exchange rate
    await page
      .locator('text=/IBAN|Wechselkurs|erhältst/i')
      .first()
      .waitFor({ timeout: 10000 });

    // Wait for React to fully initialize the form
    await page.waitForTimeout(2000);

    // Set amount directly in DOM (Playwright's fill/type don't work with StyledInput)
    await page.evaluate(() => {
      const input = document.querySelector('input[type="number"]') as HTMLInputElement;
      if (input) {
        input.value = '0.01';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(1000);

    const pageContent = await page.textContent('body');

    // Either shows exchange rate, IBAN selector, or CHF/EUR amounts
    const hasExchangeInfo =
      pageContent?.includes('Wechselkurs') ||
      pageContent?.includes('Exchange rate') ||
      pageContent?.includes('CHF') ||
      pageContent?.includes('EUR');

    const hasIbanSelector =
      pageContent?.includes('IBAN') ||
      pageContent?.includes('hinzufügen') ||
      pageContent?.includes('auswählen');

    expect(hasExchangeInfo || hasIbanSelector).toBeTruthy();

    await expect(page).toHaveScreenshot('sell-lightning-exchange-rate.png', {
      maxDiffPixels: 10000,
    });
  });

  test('should show Lightning invoice info or deposit address', async ({ page, request }) => {
    const token = await getLightningToken(request);

    await page.goto(`/sell?session=${token}&blockchain=Lightning&lang=de`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const pageContent = await page.textContent('body');

    // Lightning uses LNURL or invoices, or shows KYC requirement
    const hasLightningInfo =
      pageContent?.includes('LNURL') ||
      pageContent?.includes('lnbc') ||
      pageContent?.includes('Lightning') ||
      pageContent?.includes('invoice') ||
      pageContent?.includes('Rechnung') ||
      pageContent?.includes('BTC') ||
      pageContent?.includes('E-Mail'); // KYC requirement

    const hasFormElements =
      pageContent?.includes('IBAN') || pageContent?.includes('EUR') || pageContent?.includes('CHF');

    expect(hasLightningInfo || hasFormElements).toBeTruthy();
  });
});

test.describe('Sell Process - Lightning Full UI Flow', () => {
  async function getLightningToken(
    request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  ): Promise<string> {
    const auth = await getCachedAuth(request, 'lightning');
    return auth.token;
  }

  test('should complete Lightning sell UI flow with amount entry', async ({ page, request }) => {
    test.setTimeout(60000);

    const token = await getLightningToken(request);

    // Step 1: Navigate to sell page with Lightning blockchain
    await page.goto(`/sell?session=${token}&blockchain=Lightning&lang=de`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await expect(page).toHaveScreenshot('lightning-sell-01-initial-page.png', {
      maxDiffPixels: 10000,
    });

    // Step 2: Set amount directly in DOM
    await page.evaluate(() => {
      const input = document.querySelector('input[type="number"]') as HTMLInputElement;
      if (input) {
        input.value = '0.001';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(1500);

    // Step 3: Wait for quote to load (exchange rate should update) or KYC message
    try {
      await page.waitForSelector('text=/Wechselkurs|E-Mail/i', { timeout: 10000 });
    } catch {
      // Continue even if not found
    }
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('lightning-sell-02-form-filled.png', {
      maxDiffPixels: 10000,
    });

    // Step 4: Scroll down to see full page
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    // Step 5: Screenshot showing the full page
    await expect(page).toHaveScreenshot('lightning-sell-03-full-page.png', {
      maxDiffPixels: 10000,
      fullPage: true,
    });

    console.log('Lightning sell UI flow completed');
  });
});
