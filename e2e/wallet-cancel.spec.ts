import { expect, Page, Route, test } from '@playwright/test';

/**
 * Visual regression: a connection the user cancels in an injected wallet (MetaMask) ends back at the
 * wallet selection with no error, while a connection the wallet fails still shows "Connection failed!"
 * with the wallet's message.
 *
 * The injected wallet is an in-page EIP-1193 object installed with addInitScript: it rejects the
 * account request with a plain object, the way MetaMask does (code 4001 with data for the cancel,
 * code -32603 for the failure). Bootstrap GETs are mocked via page.route, so the suite does not need
 * a live API; the client-error POST is fulfilled and recorded. A green run does not prove that a real
 * wallet rejects with that shape. The cancel, the retry to a real login and the reported failure run
 * against the real API and database in the full-stack harness (e2e-stack/specs/auth.spec.ts).
 *
 * UI language is pinned with `lang=en`. Unmatched v1/v2 calls are fulfilled with 501 (not
 * continued), so an unexpected request would show up as an error in the screenshot.
 *
 * Intercepted endpoints:
 *   - GET /v1/language, /v1/fiat, /v1/asset, /v1/bankAccount, /v1/country
 *   - GET /v1/setting/infoBanner  (no banner)
 *   - POST /v1/log/clientError    (recorded, answered 201)
 */

const ETH = {
  id: 111,
  name: 'ETH',
  uniqueName: 'Ethereum/ETH',
  description: 'Ether',
  blockchain: 'Ethereum',
  type: 'Coin',
  category: 'Public',
  buyable: true,
  sellable: true,
  cardBuyable: false,
  cardSellable: false,
  instantBuyable: false,
  instantSellable: false,
  comingSoon: false,
  decimals: 18,
};

const CANCEL = { code: 4001, message: 'User rejected the request.', data: { cause: 'rejectAllApprovals' } };
const FAILURE = { code: -32603, message: 'Internal JSON-RPC error.' };

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installRoutes(page: Page, reports: string[]): Promise<void> {
  await page.route('**/v1/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (method === 'GET' && path === '/v1/language') {
      return json(route, [
        { id: 1, name: 'Deutsch', symbol: 'DE', foreignName: 'Deutsch', enable: true },
        { id: 2, name: 'English', symbol: 'EN', foreignName: 'English', enable: true },
      ]);
    }

    if (method === 'GET' && path === '/v1/fiat') {
      return json(route, [
        {
          id: 1,
          name: 'CHF',
          buyable: true,
          sellable: true,
          cardBuyable: false,
          cardSellable: false,
          instantBuyable: false,
          instantSellable: false,
        },
      ]);
    }

    if (method === 'GET' && path === '/v1/asset') {
      return json(route, [ETH]);
    }

    if (method === 'GET' && ['/v1/bankAccount', '/v1/country'].includes(path)) {
      return json(route, []);
    }

    if (method === 'GET' && path === '/v1/setting/infoBanner') {
      return json(route, {});
    }

    if (method === 'POST' && path === '/v1/log/clientError') {
      reports.push(request.postData() ?? '');
      return json(route, {}, 201);
    }

    await json(route, { error: `Unexpected ${method} ${path}` }, 501);
  });

  await page.route('**/v2/**', async (route: Route) => {
    const request = route.request();
    await json(route, { error: `Unexpected ${request.method()} ${new URL(request.url()).pathname}` }, 501);
  });
}

// An injected wallet on Ethereum with no connected account that rejects the account request with `rejection`.
async function injectWallet(page: Page, rejection: typeof CANCEL | typeof FAILURE): Promise<void> {
  await page.addInitScript((answer) => {
    (window as unknown as { ethereum: unknown }).ethereum = {
      isMetaMask: true,
      request: async ({ method }: { method: string }) => {
        if (method === 'eth_accounts') return [];
        if (method === 'eth_chainId') return '0x1';
        if (method === 'net_version') return '1';
        throw method === 'eth_requestAccounts' ? answer : { code: 4200, message: `Unsupported method ${method}` };
      },
      on: () => undefined,
      removeListener: () => undefined,
    };
  }, rejection);
}

async function openMetaMask(page: Page): Promise<void> {
  await page.goto('/login?blockchain=Ethereum&lang=en');
  await page.locator('img[src*="cryptowallet"]').click({ timeout: 15_000 });
  await page.locator('img[src*="metamask"]').click();
}

test.describe('Cancel in the wallet', () => {
  test.use({ timezoneId: 'Europe/Zurich' });

  test('a cancelled connection ends back at the wallet selection', async ({ page }) => {
    const reports: string[] = [];
    await installRoutes(page, reports);
    await injectWallet(page, CANCEL);

    await openMetaMask(page);

    await expect(page.locator('img[src*="metamask"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Connection failed!')).toHaveCount(0);
    await expect(page.getByText('User rejected the request.')).toHaveCount(0);

    await page.waitForTimeout(500);
    expect(reports).toEqual([]);
    await expect(page).toHaveScreenshot('wallet-cancel-01-back-at-selection.png', {
      fullPage: true,
      maxDiffPixels: 1000,
    });
  });

  test('a failed connection still shows the error', async ({ page }) => {
    const reports: string[] = [];
    await installRoutes(page, reports);
    await injectWallet(page, FAILURE);

    await openMetaMask(page);

    await expect(page.getByText('Connection failed!')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Internal JSON-RPC error.')).toBeVisible();
    await expect.poll(() => reports.length).toBe(1);

    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('wallet-cancel-02-connection-failed.png', {
      fullPage: true,
      maxDiffPixels: 1000,
    });
  });
});
