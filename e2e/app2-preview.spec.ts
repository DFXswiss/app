import { test, expect } from '@playwright/test';

/**
 * App 2.0 handbook baselines. Requires `app2-dist/` to be served at /app2/
 * (`npm run app2:loc` then `npm start`, which mounts it via src/setupProxy.js).
 */
async function openApp2(page: import('@playwright/test').Page, hash: string): Promise<void> {
  const response = await page.goto(`/app2/${hash}`, { waitUntil: 'domcontentloaded' });
  expect(response, `/app2/${hash} must be served`).toBeTruthy();
  expect(response?.ok(), `/app2/${hash} status ${response?.status()}`).toBe(true);
  await page.waitForLoadState('networkidle');
}

test.describe('App2 preview screens', () => {
  test('home / landing', async ({ page }) => {
    await openApp2(page, '#/');
    await expect(page).toHaveScreenshot('app2-home.png', { maxDiffPixels: 2000, fullPage: true });
  });

  test('account (logged out)', async ({ page }) => {
    await openApp2(page, '#/account');
    await expect(page).toHaveScreenshot('app2-account-logged-out.png', {
      maxDiffPixels: 2000,
      fullPage: true,
    });
  });

  test('transactions (logged out)', async ({ page }) => {
    await openApp2(page, '#/tx');
    await expect(page).toHaveScreenshot('app2-tx-logged-out.png', { maxDiffPixels: 2000, fullPage: true });
  });

  test('kyc (logged out)', async ({ page }) => {
    await openApp2(page, '#/kyc');
    await expect(page).toHaveScreenshot('app2-kyc-logged-out.png', { maxDiffPixels: 2000, fullPage: true });
  });

  test('limit (logged out)', async ({ page }) => {
    await openApp2(page, '#/limit');
    await expect(page).toHaveScreenshot('app2-limit-logged-out.png', { maxDiffPixels: 2000, fullPage: true });
  });

  test('support (logged out)', async ({ page }) => {
    await openApp2(page, '#/support');
    await expect(page).toHaveScreenshot('app2-support-logged-out.png', {
      maxDiffPixels: 2000,
      fullPage: true,
    });
  });

  test('OpenCryptoPay hub (logged out)', async ({ page }) => {
    await openApp2(page, '#/ocp');
    await expect(page).toHaveScreenshot('app2-ocp-logged-out.png', { maxDiffPixels: 2000, fullPage: true });
  });

  test('404', async ({ page }) => {
    await openApp2(page, '#/missing-route');
    await expect(page).toHaveScreenshot('app2-404.png', { maxDiffPixels: 2000, fullPage: true });
  });

  test('buy success return path lands on hash with cko query', async ({ page }) => {
    const response = await page.goto('/app2/buy/success?cko-payment-id=test-cko', {
      waitUntil: 'domcontentloaded',
    });
    expect(response, 'return path must be served').toBeTruthy();
    await expect(page).toHaveURL(/#\/buy\/success\?cko-payment-id=test-cko/);
  });

  test('buy success trailing-slash return path folds into the same hash', async ({ page }) => {
    const response = await page.goto('/app2/buy/success/?cko-payment-id=test-cko', {
      waitUntil: 'domcontentloaded',
    });
    expect(response, 'trailing-slash return path must be served').toBeTruthy();
    await expect(page).toHaveURL(/#\/buy\/success\?cko-payment-id=test-cko/);
  });
});
