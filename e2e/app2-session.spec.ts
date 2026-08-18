import { test, expect } from '@playwright/test';
import { getCachedAuth } from './helpers/auth-cache';

/**
 * App 2.0 handbook baselines for every screen that needs a wallet.
 *
 * Intended path: start the local stack with `bash e2e-stack/scripts/up.sh`,
 * set `REACT_APP_API_URL=http://localhost:3000` in `.env`, then run this spec
 * against `http://localhost:3001`.
 *
 * Do not take these pictures against the production API. The wallet from
 * `.env.sample` is public; on production, other people's account data can
 * land in the image.
 *
 * These pictures are a real session against that API, not a mocked shell.
 * The stack's mock providers do not serve quotes, so the buy picture shows
 * the no-quote state. The account is fresh, so the transaction list is empty.
 */
async function openApp2Session(
  page: import('@playwright/test').Page,
  token: string,
  hash: string,
): Promise<void> {
  const url = `/app2/?session=${encodeURIComponent(token)}${hash}`;
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  expect(response, `${url} must be served`).toBeTruthy();
  expect(response?.ok(), `${url} status ${response?.status()}`).toBe(true);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page).toHaveTitle('DFX');
  await expect(page.locator('#root')).not.toBeEmpty();
}

test.describe('App2 session screens', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const auth = await getCachedAuth(request, 'evm');
    token = auth.token;
  });

  test('buy (logged in)', async ({ page }) => {
    await openApp2Session(page, token, '#/');
    await expect(page.getByRole('tablist')).toBeVisible();
    await expect(page.getByRole('tab', { name: /^buy$/i })).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveScreenshot('app2-buy.png', { maxDiffPixels: 2000, fullPage: true });
  });

  test('sell (logged in)', async ({ page }) => {
    await openApp2Session(page, token, '#/?mode=sell');
    await expect(page.getByRole('tablist')).toBeVisible();
    await expect(page.getByRole('tab', { name: /^sell$/i })).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveScreenshot('app2-sell.png', { maxDiffPixels: 2000, fullPage: true });
  });

  test('swap (logged in)', async ({ page }) => {
    await openApp2Session(page, token, '#/?mode=swap');
    await expect(page.getByRole('tablist')).toBeVisible();
    await expect(page.getByRole('tab', { name: /^swap$/i })).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveScreenshot('app2-swap.png', { maxDiffPixels: 2000, fullPage: true });
  });

  test('account (logged in)', async ({ page }) => {
    await openApp2Session(page, token, '#/account');
    await expect(page.getByText(/not verified|nicht verifiziert|non verificato|non vérifié/i)).toBeVisible();
    await expect(page).toHaveScreenshot('app2-account-in.png', { maxDiffPixels: 2000, fullPage: true });
  });

  test('transactions (logged in)', async ({ page }) => {
    await openApp2Session(page, token, '#/tx');
    await expect(page.getByRole('heading', { name: /transactions|transaktionen|transazioni/i })).toBeVisible();
    await expect(page).toHaveScreenshot('app2-tx-in.png', { maxDiffPixels: 2000, fullPage: true });
  });

  test('kyc steps (logged in)', async ({ page }) => {
    await openApp2Session(page, token, '#/kyc');
    await expect(page.getByRole('heading', { name: /verification|verifizierung|verifica/i })).toBeVisible();
    await expect(page.getByText(/personal data|persönliche daten|dati personali|données personnelles/i)).toBeVisible();
    await expect(page).toHaveScreenshot('app2-kyc-in.png', { maxDiffPixels: 2000, fullPage: true });
  });

  test('limit (logged in)', async ({ page }) => {
    await openApp2Session(page, token, '#/limit');
    await expect(page.locator('.limit-now')).toBeVisible();
    await expect(page).toHaveScreenshot('app2-limit-in.png', { maxDiffPixels: 2000, fullPage: true });
  });

  test('OpenCryptoPay hub (logged in)', async ({ page }) => {
    await openApp2Session(page, token, '#/ocp');
    await expect(page.getByRole('heading', { name: /opencryptopay/i }).first()).toBeVisible();
    await expect(page).toHaveScreenshot('app2-ocp-in.png', { maxDiffPixels: 2000, fullPage: true });
  });

  test('OpenCryptoPay apply (logged in)', async ({ page }) => {
    await openApp2Session(page, token, '#/ocp?sub=apply');
    await expect(page.getByRole('heading', { name: /apply|beantragen|candidati|postuler/i }).first()).toBeVisible();
    await expect(page).toHaveScreenshot('app2-ocp-apply.png', { maxDiffPixels: 2000, fullPage: true });
  });
});
