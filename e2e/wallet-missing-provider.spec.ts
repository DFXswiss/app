import { expect, Page, Route, test } from '@playwright/test';

/**
 * Visual regression: the connect screen shows the missing-wallet hint when an injected provider is
 * marked as MetaMask but reading `request` throws. The visitor has selected the crypto wallet and
 * MetaMask, so the install hint is not the end state.
 *
 * `window.ethereum` is an in-page object installed with addInitScript. Bootstrap GETs are mocked
 * via page.route, so the suite does not need a live API; POST /v1/log/clientError is answered with
 * 201. UI language is pinned with `lang=en`. Unmatched /v1/** and /v2/** calls get 501, so an
 * unexpected request shows up as an error instead of a silent miss.
 *
 * A green run does not prove that a real wallet extension throws when `request` is read, or that a
 * login succeeds. The same hint against the real API and database is in e2e-stack/specs/auth.spec.ts.
 *
 * Intercepted endpoints:
 *   - GET /v1/language, /v1/fiat, /v1/asset, /v1/bankAccount, /v1/country
 *   - GET /v1/setting/infoBanner  (no banner)
 *   - POST /v1/log/clientError    (answered 201)
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

const HINT = 'No wallet found. Please check your wallet extension or set one up, then reload this page.';

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installRoutes(page: Page): Promise<void> {
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
      return json(route, {}, 201);
    }

    await json(route, { error: `Unexpected ${method} ${path}` }, 501);
  });

  await page.route('**/v2/**', async (route: Route) => {
    const request = route.request();
    await json(route, { error: `Unexpected ${request.method()} ${new URL(request.url()).pathname}` }, 501);
  });
}

async function installUnreachableWallet(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const provider: { isMetaMask: boolean; on: () => void; removeListener: () => void } = {
      isMetaMask: true,
      on: () => undefined,
      removeListener: () => undefined,
    };
    Object.defineProperty(provider, 'request', {
      configurable: true,
      get() {
        throw new Error('request unavailable');
      },
    });
    (window as unknown as { ethereum: unknown }).ethereum = provider;
  });
}

test.describe('Missing wallet provider', () => {
  test.use({ timezoneId: 'Europe/Zurich' });

  test('a wallet whose request cannot be read shows the hint', async ({ page }) => {
    await installRoutes(page);
    await installUnreachableWallet(page);

    await page.goto('/login?blockchain=Ethereum&lang=en');
    await page.locator('img[src*="cryptowallet"]').click({ timeout: 15_000 });
    await page.locator('img[src*="metamask"]').click();

    await expect(page.getByText('Connection failed!', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(HINT, { exact: true })).toBeVisible();
    await expect(page.getByText('Provider not set or invalid')).toHaveCount(0);

    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('wallet-missing-provider-01-error.png', {
      fullPage: true,
      maxDiffPixels: 1000,
    });
  });
});
