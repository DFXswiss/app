import { test, expect } from '@playwright/test';

/**
 * App 2.0 handbook baselines. Requires `app2-dist/` to be served at /app2/
 * (`npm run app2:loc` then `npm start`, which mounts it via src/setupProxy.js).
 */
async function openApp2(page: import('@playwright/test').Page, hash: string): Promise<void> {
  const response = await page.goto(`/app2/${hash}`, { waitUntil: 'domcontentloaded' });
  expect(response, `/app2/${hash} must be served`).toBeTruthy();
  expect(response?.ok(), `/app2/${hash} status ${response?.status()}`).toBe(true);
  expect(await page.title()).toBe('DFX — Buy crypto directly into your wallet');
  await page.waitForLoadState('networkidle');
}

test.describe('App2 preview screens', () => {
  test('home / landing', async ({ page }) => {
    await openApp2(page, '#/');
  });

  test('account (logged out)', async ({ page }) => {
    await openApp2(page, '#/account');
  });

  test('transactions (logged out)', async ({ page }) => {
    await openApp2(page, '#/tx');
  });

  test('kyc (logged out)', async ({ page }) => {
    await openApp2(page, '#/kyc');
  });

  test('limit (logged out)', async ({ page }) => {
    await openApp2(page, '#/limit');
  });

  test('support (logged out)', async ({ page }) => {
    await openApp2(page, '#/support');
  });

  test('OpenCryptoPay hub (logged out)', async ({ page }) => {
    await openApp2(page, '#/ocp');
  });

  test('404', async ({ page }) => {
    await openApp2(page, '#/missing-route');
  });

  test('connect sheet', async ({ page }) => {
    await openApp2(page, '#/');
    await page.getByRole('button', { name: /connect wallet|wallet verbinden/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page).toHaveScreenshot('app2-connect-sheet.png', { maxDiffPixels: 2000, fullPage: true });
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
