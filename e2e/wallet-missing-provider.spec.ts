import { expect, Page, Route, test } from '@playwright/test';

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installLoginApi(page: Page): Promise<string[]> {
  const unexpectedRequests: string[] = [];

  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (method === 'GET' && path === '/v1/language') {
      return json(route, [{ id: 1, name: 'English', symbol: 'EN', enable: true }]);
    }
    if (method === 'GET' && ['/v1/fiat', '/v1/asset', '/v1/bankAccount', '/v1/country'].includes(path)) {
      return json(route, []);
    }
    if (method === 'GET' && path === '/v1/setting/infoBanner') return json(route, null);
    if (method === 'POST' && path === '/v1/log/clientError') return json(route, null);

    unexpectedRequests.push(`${method} ${path}`);
    return json(route, { error: 'Unexpected test request' }, 501);
  });

  await page.route('**/v2/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    unexpectedRequests.push(`${request.method()} ${path}`);
    return json(route, { error: 'Unexpected test request' }, 501);
  });

  return unexpectedRequests;
}

test('shows the missing-wallet error when an injected wallet rejects RPC', async ({ page }) => {
  // The synthetic provider rejects RPC with Web3's invalid-provider message.
  // This exercises the translated error view, not a real extension failure.
  const unexpectedRequests = await installLoginApi(page);
  await page.addInitScript(() => {
    (window as any).ethereum = {
      isMetaMask: true,
      on: () => undefined,
      request: async ({ method }: { method: string }) => {
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
          throw new Error('Provider not set or invalid');
        }
        throw new Error(`Unexpected wallet RPC: ${method}`);
      },
    };
  });

  await page.goto('/login/wallet?lang=en');
  await page.waitForLoadState('networkidle');

  await page.locator('img[src*="metamask"]').click();

  await expect(page.getByRole('heading', { name: 'Connection failed!', exact: true })).toBeVisible();
  await expect(
    page.getByText('No wallet found. Please check your wallet extension or set one up, then reload this page.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText('Please install MetaMask or Rabby!', { exact: true })).toHaveCount(0);

  await expect(page).toHaveScreenshot('wallet-missing-provider-01-error.png', {
    fullPage: true,
    animations: 'disabled',
  });
  expect(unexpectedRequests).toEqual([]);
});
