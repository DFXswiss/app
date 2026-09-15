import { expect, test } from './fixtures';

const APP2_HASH_ROUTES = [
  '#/',
  '#/account',
  '#/tx',
  '#/kyc',
  '#/limit',
  '#/ocp',
  '#/support',
  '#/account-merge',
  '#/buy/success',
  '#/buy/failure',
  '#/missing-route',
];

test.describe('App 2.0 hosted artifact', () => {
  test('serves /app2/ and opens every hash route', async ({ page }) => {
    const response = await page.goto('/app2/');
    expect(response, '/app2/ must be served').toBeTruthy();
    expect(response?.ok(), `/app2/ status ${response?.status()}`).toBe(true);
    await expect(page.locator('body')).not.toBeEmpty();

    for (const hash of APP2_HASH_ROUTES) {
      await page.goto(`/app2/${hash}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('body')).not.toBeEmpty();
    }
  });
});
