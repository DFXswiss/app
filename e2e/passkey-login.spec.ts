import { expect, test } from '@playwright/test';

test.describe('Passkey login', () => {
  test('shows the passkey tile when the feature flag is set', async ({ page }) => {
    await page.goto('/login?feature=Passkey');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Login to DFX Services', { exact: true })).toBeVisible();
    const passkeyTile = page.locator('img[src*="/key_"]');
    await expect(passkeyTile).toBeVisible();
    await expect(page).toHaveScreenshot('passkey-login-tiles.png', { fullPage: true });
  });

  test('opens the passkey placeholder', async ({ page }) => {
    await page.goto('/login?feature=Passkey');
    await page.waitForLoadState('networkidle');
    await page.locator('img[src*="/key_"]').click();
    await expect(page.getByText('Passkey login arrives with the wallet beta')).toBeVisible();
    await expect(page).toHaveScreenshot('passkey-login-placeholder.png', { fullPage: true });
  });
});
