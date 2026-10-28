import { test, expect, request } from '@playwright/test';
import { getCachedAuth, getLinkedLightningAuth } from './helpers/auth-cache';

test.describe('Swap with Lightning URL Parameter', () => {
  test('should show Lightning as target when asset-out=Lightning/BTC', async ({ page }) => {
    const apiContext = await request.newContext();

    // Authenticate Bitcoin wallet
    const bitcoinAuth = await getCachedAuth(apiContext, 'bitcoin');
    console.log('Bitcoin wallet authenticated');

    // Link Lightning address to account
    await getLinkedLightningAuth(apiContext, bitcoinAuth.token);
    console.log('Lightning address linked');

    // Navigate to swap with Lightning as target
    const baseUrl = process.env.REACT_APP_PUBLIC_URL!;
    const url = `${baseUrl}/swap?session=${bitcoinAuth.token}&asset-out=Lightning/BTC&amount-in=0.001&lang=de`;
    await page.goto(url);

    await page.locator('text=/Wechselkurs|Exchange rate/').first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'e2e/screenshots/baseline/swap-lightning-url-param-01-loaded.png' });

    // Check that Lightning is displayed as target
    const pageContent = await page.textContent('body');
    const hasLightning = pageContent?.includes('Lightning');
    console.log('Page contains Lightning:', hasLightning);

    await page.locator('text=/Wechselkurs|Exchange rate/').first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(2000);

    // Take final screenshot
    await page.screenshot({ path: 'e2e/screenshots/baseline/swap-lightning-url-param-02-complete.png' });

    // Verify Lightning is shown
    expect(pageContent).toContain('Lightning');
  });
});
