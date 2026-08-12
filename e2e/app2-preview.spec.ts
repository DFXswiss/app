import { test, expect } from '@playwright/test';

/**
 * App 2.0 handbook baselines. Requires the App2 artifact to be served under
 * /app2/ (production Pages layout or a local static stage of app2-dist).
 * When the path is not available on the running stack, tests skip rather than
 * fail CI that only boots the main app shell.
 */
async function app2Available(page: import('@playwright/test').Page): Promise<boolean> {
  const response = await page.goto('/app2/', { waitUntil: 'domcontentloaded' });
  if (!response || response.status() >= 400) return false;
  const body = (await page.textContent('body')) ?? '';
  // App2 landing/home branding — not the main-app shell.
  return /Buy crypto|wallet|OpenCryptoPay|Connect wallet|Krypto kaufen/i.test(body);
}

test.describe('App2 preview screens', () => {
  test('home / landing', async ({ page }) => {
    test.skip(!(await app2Available(page)), 'App2 artifact not served on this stack');
    await page.goto('/app2/#/');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('app2-home.png', { maxDiffPixels: 2000, fullPage: true });
  });

  test('account (logged out)', async ({ page }) => {
    test.skip(!(await app2Available(page)), 'App2 artifact not served on this stack');
    await page.goto('/app2/#/account');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('app2-account-logged-out.png', {
      maxDiffPixels: 2000,
      fullPage: true,
    });
  });

  test('support (logged out)', async ({ page }) => {
    test.skip(!(await app2Available(page)), 'App2 artifact not served on this stack');
    await page.goto('/app2/#/support');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('app2-support-logged-out.png', {
      maxDiffPixels: 2000,
      fullPage: true,
    });
  });

  test('buy success return path lands on hash with cko query', async ({ page }) => {
    test.skip(!(await app2Available(page)), 'App2 artifact not served on this stack');
    // Local static hosts may not apply public/_redirects; exercise the client fold.
    await page.goto('/app2/');
    await page.evaluate(() => {
      window.history.replaceState({}, '', '/app2/buy/success?cko-payment-id=test-cko');
      window.location.replace('/app2/#/buy/success?cko-payment-id=test-cko');
    });
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/#\/buy\/success\?cko-payment-id=test-cko/);
  });
});
