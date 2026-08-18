import { test, expect } from '@playwright/test';
import { app2ScreenshotOpts as screenshotOpts } from './helpers/app2-screenshot';

/**
 * App 2.0 handbook baselines. Requires `app2-dist/` to be served at /app2/
 * (`npm run app2:loc` then `npm start`, which mounts it via src/setupProxy.js).
 *
 * `buy success return path lands on hash with cko query` and
 * `buy success trailing-slash return path folds into the same hash` check a
 * Pages 302 from `public/_redirects` (`/app2/buy/success` into
 * `/app2/#/buy/success`). `src/setupProxy.js` mirrors it; the e2e stack's
 * `e2e-stack/images/frontend/nginx.conf` does not — only a try_files fallback
 * for /app2/. Measured 2026-08-18: 11/11 against the local dev server, 9/11
 * against `npm run e2e:stack:up`. Red on the stack is the missing rewrite, not
 * a product bug. To match Pages there, copy the six 302 rules into that
 * nginx.conf and rebuild the frontend image.
 */
async function openApp2(page: import('@playwright/test').Page, hash: string): Promise<void> {
  const response = await page.goto(`/app2/${hash}`, { waitUntil: 'domcontentloaded' });
  expect(response, `/app2/${hash} must be served`).toBeTruthy();
  expect(response?.ok(), `/app2/${hash} status ${response?.status()}`).toBe(true);
  await page.waitForLoadState('networkidle');
  // Artifact-only marker from scripts/postprocess-app2.js — the main app's public/index.html
  // has no robots meta. Title + #root content prove the React shell mounted (Shell sets 'DFX').
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page).toHaveTitle('DFX');
  await expect(page.locator('#root')).not.toBeEmpty();
}

test.describe('App2 preview screens', () => {
  test('home / landing', async ({ page }) => {
    await openApp2(page, '#/');
    await expect(page.getByRole('heading', { name: /buy crypto/i })).toBeVisible();
    await expect(page).toHaveScreenshot('app2-home.png', screenshotOpts);
  });

  test('account (logged out)', async ({ page }) => {
    await openApp2(page, '#/account');
    await expect(page.getByRole('heading', { name: /my account|mein konto|il mio conto|mon compte/i })).toBeVisible();
    await expect(page).toHaveScreenshot('app2-account.png', screenshotOpts);
  });

  test('transactions (logged out)', async ({ page }) => {
    await openApp2(page, '#/tx');
    await expect(page.getByRole('heading', { name: /transactions|transaktionen|transazioni/i })).toBeVisible();
    await expect(page).toHaveScreenshot('app2-transactions.png', screenshotOpts);
  });

  test('kyc (logged out)', async ({ page }) => {
    await openApp2(page, '#/kyc');
    await expect(page.getByRole('heading', { name: /verification|verifizierung|verifica/i })).toBeVisible();
    await expect(page).toHaveScreenshot('app2-kyc.png', screenshotOpts);
  });

  test('limit (logged out)', async ({ page }) => {
    await openApp2(page, '#/limit');
    await expect(page.getByRole('heading', { name: /limit/i })).toBeVisible();
    await expect(page).toHaveScreenshot('app2-limit.png', screenshotOpts);
  });

  test('support (logged out)', async ({ page }) => {
    await openApp2(page, '#/support');
    await expect(page.getByRole('heading', { name: /support|supporto/i })).toBeVisible();
    await expect(page).toHaveScreenshot('app2-support.png', screenshotOpts);
  });

  test('OpenCryptoPay hub (logged out)', async ({ page }) => {
    await openApp2(page, '#/ocp');
    await expect(page.getByRole('heading', { name: /opencryptopay/i })).toBeVisible();
    await expect(page).toHaveScreenshot('app2-ocp.png', screenshotOpts);
  });

  test('404', async ({ page }) => {
    await openApp2(page, '#/missing-route');
    await expect(
      page.getByRole('heading', { name: /page not found|seite nicht gefunden|pagina non trovata|page introuvable/i }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot('app2-404.png', screenshotOpts);
  });

  test('connect sheet', async ({ page }) => {
    await openApp2(page, '#/');
    await page.getByRole('button', { name: /connect wallet|wallet verbinden/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page).toHaveScreenshot('app2-connect-sheet.png', screenshotOpts);
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
