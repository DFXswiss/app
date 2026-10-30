import { expect, Page, Route, test } from '@playwright/test';

/**
 * Visual regression: a command-line wallet login on a login page continues to /buy,
 * and the same login on /connect continues to /account.
 *
 * Auth is a synthetic unsigned JWT (`alg: none`, role User) returned by the mocked
 * POST /v1/auth. Bootstrap GETs are mocked via page.route, so the suite does not need
 * a live API. GET /v2/user answers 401 until that login, then waits 800 ms and returns
 * a synthetic user. A green run does not prove production auth, a real signature check,
 * real user latency, or that /buy and /account show live data.
 *
 * User data is MOCKED with a synthetic fixture so the baselines are deterministic and
 * contain no production data. UI language is pinned with `lang=en`. Unmatched v1/v2
 * calls are fulfilled with 501 (not continued).
 *
 * Intercepted endpoints:
 *   - GET /v1/language, /v1/fiat, /v1/asset, /v1/bankAccount, /v1/country
 *   - GET /v1/setting/infoBanner  (no banner)
 *   - GET /v1/auth/signMessage
 *   - POST /v1/auth
 *   - GET /v2/user                (401 until login, then an active user after 800 ms)
 */

const ADDRESS = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function jwt(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    account: 1,
    user: 1,
    address: ADDRESS,
    role: 'User',
    blockchains: ['Bitcoin'],
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.synthetic`;
}

function activeUser(): unknown {
  const address = {
    address: ADDRESS,
    wallet: 'DFX',
    explorerUrl: 'https://example.invalid',
    status: 'Active',
    blockchains: ['Bitcoin'],
  };
  return {
    id: 1,
    activeAddress: address,
    addresses: [address],
    mail: 'login-redirect@example.com',
    currency: { id: 1, name: 'CHF' },
    language: { id: 2, name: 'English', symbol: 'EN' },
    kyc: { level: 20, status: 'Completed' },
    tradingLimit: { limit: 1000, period: 'Month' },
    volumes: {
      buy: { total: 0, annual: 0 },
      sell: { total: 0, annual: 0 },
      swap: { total: 0, annual: 0 },
    },
    disabledAddresses: [],
  };
}

async function installLoginRedirectRoutes(page: Page): Promise<void> {
  let signedIn = false;

  await page.route('**/v1/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (method === 'GET' && path === '/v1/language') {
      return json(route, [
        { id: 1, name: 'English', symbol: 'EN', foreignName: 'English', enable: true },
        { id: 2, name: 'German', symbol: 'DE', foreignName: 'Deutsch', enable: true },
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

    if (method === 'GET' && ['/v1/asset', '/v1/bankAccount', '/v1/country'].includes(path)) {
      return json(route, []);
    }

    if (method === 'GET' && path === '/v1/setting/infoBanner') {
      return json(route, {});
    }

    if (method === 'GET' && path === '/v1/auth/signMessage') {
      return json(route, { message: 'Sign this message to log in to DFX.' });
    }

    if (method === 'POST' && path === '/v1/auth') {
      signedIn = true;
      return json(route, { accessToken: jwt() });
    }

    await json(route, { error: `Unexpected ${method} ${path}` }, 501);
  });

  await page.route('**/v2/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (method === 'GET' && path === '/v2/user') {
      if (!signedIn) return json(route, { statusCode: 401, message: 'Unauthorized' }, 401);
      await new Promise((resolve) => setTimeout(resolve, 800));
      return json(route, activeUser());
    }

    await json(route, { error: `Unexpected ${method} ${path}` }, 501);
  });
}

async function loginWithCommandLine(page: Page, startPath: string, openCryptoWallet: boolean): Promise<void> {
  await page.goto(`${startPath}?lang=en`);

  // /login opens on the login page, whose command-line tile is one step in.
  // /connect opens on the wallets page, which already shows that tile.
  if (openCryptoWallet) {
    await page.locator('img[src*="cryptowallet"]').click();
  }

  await page.locator('img[src*="command"]').click();

  const address = page.locator('input[name="address"]');
  await address.fill(ADDRESS);
  await address.blur();

  const signature = page.locator('input[type="password"]');
  await expect(signature).toBeVisible({ timeout: 15_000 });
  await signature.fill('signed');
  await signature.blur();

  const login = page.getByRole('button', { name: 'Login' });
  await expect(login).toBeEnabled();
  await login.click();
}

test.describe('Login redirect', () => {
  test.use({ timezoneId: 'Europe/Zurich' });

  test('a command-line login on /login continues to /buy', async ({ page }) => {
    await installLoginRedirectRoutes(page);
    await loginWithCommandLine(page, '/login', true);

    await page.waitForURL(/\/buy(\?|$)/);
    await expect(page.getByText('You spend')).toBeVisible({ timeout: 15_000 });

    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('login-redirect-01-buy.png', { fullPage: true, maxDiffPixels: 1000 });
  });

  test('a command-line login on /connect continues to /account', async ({ page }) => {
    await installLoginRedirectRoutes(page);
    await loginWithCommandLine(page, '/connect', false);

    await page.waitForURL(/\/account(\?|$)/);
    await expect(page.getByText('Total trading volume')).toBeVisible({ timeout: 15_000 });

    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('login-redirect-02-account.png', { fullPage: true, maxDiffPixels: 1000 });
  });
});
