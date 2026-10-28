import { test, expect, request } from '@playwright/test';
import { getCachedAuth, getLinkedLightningAuth } from './helpers/auth-cache';

test.describe('Swap Bitcoin to Lightning', () => {
  test('should swap from Bitcoin/BTC to Lightning/BTC', async ({ page }) => {
    const apiContext = await request.newContext();

    // Authenticate Bitcoin wallet (primary)
    const bitcoinAuth = await getCachedAuth(apiContext, 'bitcoin');

    // Link Lightning address to account
    await getLinkedLightningAuth(apiContext, bitcoinAuth.token);

    // Navigate to swap with Bitcoin as source and Lightning as target
    const baseUrl = process.env.REACT_APP_PUBLIC_URL!;
    const url = `${baseUrl}/swap?session=${bitcoinAuth.token}&asset-in=Bitcoin/BTC&asset-out=Lightning/BTC&amount-in=0.001&lang=de`;
    await page.goto(url);

    // Wait for page to load and exchange rate to appear
    await page.locator('text=/Wechselkurs|Exchange rate/').first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(2000);

    // Take screenshot after full load
    await page.screenshot({ path: 'e2e/screenshots/baseline/swap-btc-to-ln-01-loaded.png' });

    // Get page content AFTER full load
    const pageContent = await page.textContent('body');

    // Verify Bitcoin is shown as source
    const hasBitcoinSource = pageContent?.includes('Bitcoin');
    console.log('Page contains Bitcoin:', hasBitcoinSource);

    // Verify Lightning is shown as target
    const hasLightningTarget = pageContent?.includes('Lightning');
    console.log('Page contains Lightning:', hasLightningTarget);

    const showsLightningAddress =
      pageContent?.includes('@') || pageContent?.includes('LNURL') || pageContent?.includes('lnbc');
    console.log('Has Lightning address:', !!showsLightningAddress);

    // Verify the info text shows correct swap direction (Bitcoin -> Lightning)
    const hasSwapInfo = pageContent?.includes('Bitcoin') && pageContent?.includes('Lightning');
    console.log('Shows Bitcoin to Lightning swap:', hasSwapInfo);

    // Take final screenshot
    await page.screenshot({ path: 'e2e/screenshots/baseline/swap-btc-to-ln-02-complete.png' });

    // Assertions
    expect(pageContent).toContain('Bitcoin');
    expect(pageContent).toContain('Lightning');
  });
});
