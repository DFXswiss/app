import { expect, Page, Route, test } from '@playwright/test';

/**
 * Visual regression: the command-line wallet login form shows a field error under the
 * signature when the pasted text cannot be a signature for the selected wallet (here a
 * whole armored signed-message block for an Ethereum address), and keeps Login disabled.
 *
 * Bootstrap GETs and the sign message are mocked via page.route, so the suite does not
 * need a live API. A green run does not prove the API's signature check; the real login
 * with a malformed and with a whitespace-padded signature runs in the full-stack harness
 * (e2e-stack/specs/auth.spec.ts).
 *
 * UI language is pinned with `lang=en`. Unmatched v1/v2 calls are fulfilled with 501
 * (not continued), so a sign-in request would show up as an error in the screenshot.
 *
 * Intercepted endpoints:
 *   - GET /v1/language, /v1/fiat, /v1/asset, /v1/bankAccount, /v1/country
 *   - GET /v1/setting/infoBanner  (no banner)
 *   - GET /v1/auth/signMessage    (fixed sign message)
 */

const ADDRESS = '0x0000000000000000000000000000000000000001';
const SIGN_MESSAGE = `By_signing_this_message,_you_confirm_that_you_are_the_sole_owner_of_the_provided_Blockchain_address._Your_ID:_${ADDRESS}`;
const ARMORED_SIGNATURE = [
  '-----BEGIN ETHEREUM SIGNED MESSAGE-----',
  SIGN_MESSAGE,
  '-----BEGIN SIGNATURE-----',
  `0x${'ab'.repeat(65)}`,
  '-----END ETHEREUM SIGNED MESSAGE-----',
].join('\n');

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

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installRoutes(page: Page, signInRequests: string[]): Promise<void> {
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

    if (method === 'GET' && path === '/v1/auth/signMessage') {
      return json(route, { message: SIGN_MESSAGE, blockchains: ['Ethereum'] });
    }

    if (method === 'POST' && path === '/v1/auth') signInRequests.push(path);

    await json(route, { error: `Unexpected ${method} ${path}` }, 501);
  });

  await page.route('**/v2/**', async (route: Route) => {
    const request = route.request();
    await json(route, { error: `Unexpected ${request.method()} ${new URL(request.url()).pathname}` }, 501);
  });
}

test.describe('Command-line login signature format', () => {
  test.use({ timezoneId: 'Europe/Zurich' });

  test('shows the field error for a malformed signature', async ({ page }) => {
    const signInRequests: string[] = [];
    await installRoutes(page, signInRequests);

    await page.goto('/login?blockchain=Ethereum&lang=en');
    await page.locator('img[src*="cryptowallet"]').click({ timeout: 15_000 });
    await page.locator('img[src*="command"]').click();

    const address = page.locator('input[name="address"]');
    await address.fill(ADDRESS);
    await address.blur();
    await expect(page.getByText(SIGN_MESSAGE)).toBeVisible({ timeout: 15_000 });

    const signature = page.locator('input[type="password"]');
    await signature.fill(ARMORED_SIGNATURE);
    await signature.blur();

    await expect(page.getByText('Invalid pattern')).toBeVisible();
    const login = page.getByRole('button', { name: 'Login' });
    await expect(login).toBeDisabled();
    await login.click({ force: true });
    expect(signInRequests).toEqual([]);
    await expect(page.getByText('Connection failed!')).toHaveCount(0);

    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('cli-signature-format-01-field-error.png', {
      fullPage: true,
      maxDiffPixels: 1000,
    });
  });
});
