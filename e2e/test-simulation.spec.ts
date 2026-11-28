import { expect, test } from '@playwright/test';
import { getCachedAuth } from './helpers/auth-cache';

// STG/DEV simulations on the buy and sell completion (localhost counts as a test network in
// src/util/test-network.ts). Runs against the local API like buy-info.spec.ts. The simulation calls
// are fulfilled here: a green run shows the buttons and their states, it does not prove that the API
// booked a simulated bank payment or payout.
test.describe('STG/DEV simulations', () => {
  test('offers "Simulate payment" on the pending buy and shows the simulated state', async ({ page, request }) => {
    const { token } = await getCachedAuth(request, 'evm');
    const simulated: { method: string; url: string; body: unknown }[] = [];
    await page.route('**/simulatePayment**', async (route) => {
      simulated.push({
        method: route.request().method(),
        url: route.request().url(),
        body: route.request().postDataJSON() as unknown,
      });
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto(`/buy/info?session=${token}&blockchain=Ethereum&asset-in=CHF&asset-out=ETH&amount-in=100&lang=en`);
    await page.getByRole('button', { name: 'Click here once you have issued the transfer' }).click();
    const simulate = page.getByRole('button', { name: 'Simulate payment' });
    await expect(simulate).toBeVisible();
    await expect(page.getByText('Test environment only', { exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('test-simulation-buy.png', { fullPage: true });

    await simulate.click();
    await expect(
      page.getByText('Payment simulated. The purchase is now processed like a real bank transfer.', { exact: true }),
    ).toBeVisible();
    expect(simulated).toHaveLength(1);
    expect(simulated[0].body).toMatchObject({ currency: 'CHF', idempotencyKey: expect.stringMatching(/^simulate-buy-/) });
    await expect(page).toHaveScreenshot('test-simulation-buy-done.png', { fullPage: true });
  });

  test('offers "Simulate payout" on the sell completion and shows the simulated state', async ({ page, request }) => {
    const { token } = await getCachedAuth(request, 'evm');
    await page.route('**/simulatePayout**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    );

    // The sell form shows this confirmation for a wallet the app cannot send from (a session-only login).
    await page.goto(
      `/sell?session=${token}&blockchain=Ethereum&asset-in=ETH&asset-out=CHF&amount-in=0.1&bank-account=CH9300762011623852957&lang=en`,
    );
    await page.getByRole('button', { name: 'Click here once you have issued the transaction' }).click();
    const simulate = page.getByRole('button', { name: 'Simulate payout' });
    await expect(simulate).toBeVisible();
    await expect(page).toHaveScreenshot('test-simulation-sell.png', { fullPage: true });

    await simulate.click();
    await expect(page.getByText('Payout simulated.', { exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('test-simulation-sell-done.png', { fullPage: true });
  });

  test('shows the API error of a failed simulation', async ({ page, request }) => {
    const { token } = await getCachedAuth(request, 'evm');
    await page.route('**/simulatePayment**', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 400, message: 'Simulation is not allowed in this environment' }),
      }),
    );
    await page.goto(`/buy/info?session=${token}&blockchain=Ethereum&asset-in=CHF&asset-out=ETH&amount-in=100&lang=en`);
    await page.getByRole('button', { name: 'Click here once you have issued the transfer' }).click();
    await page.getByRole('button', { name: 'Simulate payment' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Simulate payment' })).toBeVisible();
    await expect(page).toHaveScreenshot('test-simulation-buy-error.png', { fullPage: true });
  });
});
