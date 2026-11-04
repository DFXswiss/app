import { test, expect } from '@playwright/test';
import { prepareLocalSwapVisuals } from './helpers/local-swap-auth';

test.describe('Swap Lightning to Bitcoin Onchain', () => {
  test('shows the configured Lightning to Bitcoin form', async ({ page }) => {
    const session = await prepareLocalSwapVisuals();

    const baseUrl = process.env.REACT_APP_PUBLIC_URL!;
    const url = `${baseUrl}/swap?session=${session.bitcoinToken}&asset-in=Lightning/BTC&asset-out=Bitcoin/BTC&amount-in=0.001`;
    await page.goto(url);

    await expect(
      page.locator('h2', { hasText: 'Du zahlst' }).locator('..').locator('input[type="number"]').first(),
    ).toHaveValue('0.001', { timeout: 15000 });
    await expect(page.locator('input[name="sourceAsset"]')).toHaveValue('BTC');
    await expect(page.getByText('Senden auf Lightning')).toBeVisible();
    await expect(page.locator('input[name="targetAsset"]')).toHaveValue('BTC');
    await expect(page.getByRole('button', { name: 'Empfangsnetzwerk' })).toContainText('Bitcoin');
    await expect(page.getByText(`Bitcoin · ${session.bitcoinAddress}`)).toBeVisible();
    await expect(page.getByText('Wechselkurs', { exact: true })).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'e2e/screenshots/baseline/swap-ln-to-btc-01-loaded.png' });
    await page.screenshot({ path: 'e2e/screenshots/baseline/swap-ln-to-btc-02-complete.png' });
  });
});
