import { test, expect } from '@playwright/test';
import { prepareLocalSwapVisuals } from './helpers/local-swap-auth';

test.describe('Swap with Lightning URL Parameter', () => {
  test('shows the configured form when asset-out is Lightning/BTC', async ({ page }) => {
    const session = await prepareLocalSwapVisuals();

    const baseUrl = process.env.REACT_APP_PUBLIC_URL!;
    const url = `${baseUrl}/swap?session=${session.bitcoinToken}&asset-out=Lightning/BTC&amount-in=0.001&lang=de`;
    await page.goto(url);

    const sourceInput = page.locator('input[name="sourceAsset"]');
    await expect(sourceInput).toBeVisible({ timeout: 15000 });
    await sourceInput.click();
    const bitcoinOption = page.getByRole('button', { name: /^BTC(\s|$)/ }).filter({ hasText: 'Bitcoin' });
    await expect
      .poll(async () => bitcoinOption.count(), {
        timeout: 15000,
        message: 'native BTC on Bitcoin must be the only matching source option',
      })
      .toBe(1);
    await bitcoinOption.click();

    await expect(
      page.locator('h2', { hasText: 'Du zahlst' }).locator('..').locator('input[type="number"]').first(),
    ).toHaveValue('0.001', { timeout: 15000 });
    await expect(page.locator('input[name="sourceAsset"]')).toHaveValue('BTC');
    await expect(sourceInput.locator('../..').getByText('Bitcoin', { exact: true })).toBeVisible();
    await expect(page.locator('input[name="targetAsset"]')).toHaveValue('BTC');
    await expect(page.getByRole('button', { name: 'Blockchain' })).toContainText('Lightning');
    await expect(page.getByRole('button', { name: 'Blockchain' })).toContainText(
      new RegExp(`${session.lightningAddress.slice(0, 10)}.*${session.lightningAddress.slice(-10)}`),
    );
    await expect(page.getByText('Wechselkurs', { exact: true })).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'e2e/screenshots/baseline/swap-lightning-url-param-01-loaded.png' });
    await page.screenshot({ path: 'e2e/screenshots/baseline/swap-lightning-url-param-02-complete.png' });
  });
});
