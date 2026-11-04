import { test, expect } from '@playwright/test';
import { prepareLocalSwapVisuals } from './helpers/local-swap-auth';

test.describe('Swap Bitcoin to Lightning', () => {
  test('shows the configured Bitcoin to Lightning form', async ({ page }) => {
    const session = await prepareLocalSwapVisuals();

    const baseUrl = process.env.REACT_APP_PUBLIC_URL!;
    const url = `${baseUrl}/swap?session=${session.bitcoinToken}&asset-in=Bitcoin/BTC&asset-out=Lightning/BTC&amount-in=0.001&lang=de`;
    await page.goto(url);

    await expect(
      page.locator('h2', { hasText: 'Du zahlst' }).locator('..').locator('input[type="number"]').first(),
    ).toHaveValue('0.001', { timeout: 15000 });
    await expect(page.locator('input[name="sourceAsset"]')).toHaveValue('BTC');
    await expect(page.getByText('Senden auf Bitcoin')).toBeVisible();
    await expect(page.locator('input[name="targetAsset"]')).toHaveValue('BTC');
    await expect(page.getByRole('button', { name: 'Empfangsnetzwerk' })).toContainText('Lightning');
    await expect(page.getByText(`Lightning · ${session.lightningAddress}`)).toBeVisible();
    await expect(page.getByText('Wechselkurs', { exact: true })).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'e2e/screenshots/baseline/swap-btc-to-ln-01-loaded.png' });
    await page.screenshot({ path: 'e2e/screenshots/baseline/swap-btc-to-ln-02-complete.png' });
  });
});
