import { expect, Page, Route, test } from '@playwright/test';

/**
 * Visual regression: the wallet lists the partner sell flows show after Alby was removed, and the
 * Bitcoin Lightning wallet list.
 *
 * - bitcoinonly → sell → Bitcoin: the wallet selection of the bitcoinonly partner page. It offers
 *   the DFX app and the hardware wallets; the DFX app tile is Lightning-only, so the pre-selected
 *   Bitcoin blockchain hides it here. No Alby tile.
 * - kevinsoell → sell → Bitcoin: this partner allows only the hardware-wallet tile, whose page is
 *   the only tile on that list, so the app descends straight into the hardware-wallet selection.
 *   No Alby tile.
 * - lightning-wallets: the Bitcoin Lightning wallet list with the DFX app and the command-line
 *   wallet. No Alby tile.
 *
 * Bootstrap GETs are mocked via page.route, so the suite does not need a live API; the client-error
 * POST is fulfilled and recorded. UI language is pinned with `lang=en`. Unmatched v1/v2 calls are
 * fulfilled with 501 (not continued), so an unexpected request would show up as an error in the
 * screenshot.
 *
 * Intercepted endpoints:
 *   - GET /v1/language, /v1/fiat, /v1/asset, /v1/bankAccount, /v1/country
 *   - GET /v1/setting/infoBanner  (no banner)
 *   - POST /v1/log/clientError    (recorded, answered 201)
 *
 * A green run does not prove that the production API returns these languages and assets, that the
 * wallet tiles are reachable with a real wallet, or that the partner flow completes end to end.
 * The partner sell lists run against the real frontend, API and database in
 * e2e-stack/specs/sell-swap.spec.ts; this spec only pins their rendering.
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

test.describe('Partner wallet selection', () => {
  test.use({ timezoneId: 'Europe/Zurich' });

  test('bitcoinonly sell shows the partner wallet selection', async ({ page }) => {
    const reports: string[] = [];
    await installRoutes(page, reports);

    await page.goto('/?mode=bitcoinonly&lang=en');
    await page.waitForLoadState('networkidle');
    await page.locator('img[src$="/verkaufen_en.jpg"]').click();

    // bitcoinonly-sell has a single Bitcoin tile, so the app descends straight into the wallet list.
    await expect(page.locator('img[src$="/hardwarewallets_en.jpg"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('img[src*="alby"]')).toHaveCount(0);
    await expect(page.getByText('Oh, sorry, something went wrong')).toHaveCount(0);

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    expect(reports).toEqual([]);
    await expect(page).toHaveScreenshot('partner-wallet-selection-01-bitcoinonly-sell.png', {
      fullPage: true,
      maxDiffPixels: 1000,
    });
  });

  test('kevinsoell sell reaches the hardware-wallet selection', async ({ page }) => {
    const reports: string[] = [];
    await installRoutes(page, reports);

    await page.goto('/?mode=kevinsoell&lang=en');
    await page.waitForLoadState('networkidle');
    await page.locator('img[src$="/verkaufen_en.jpg"]').click();

    // kevinsoell-sell also offers an ERC20 tile, so Bitcoin has to be selected explicitly.
    await expect(page.locator('img[src$="/bitcoinlightning_en.jpg"]')).toBeVisible({ timeout: 15000 });
    await page.locator('img[src$="/bitcoinlightning_en.jpg"]').click();

    // Only the hardware-wallet tile is allowed for this partner, and it has a page of its own, so
    // the single-tile shortcut descends into the hardware-wallet selection.
    await expect(page.locator('img[src$="/bitbox_en.jpg"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('img[src*="alby"]')).toHaveCount(0);
    await expect(page.getByText('Oh, sorry, something went wrong')).toHaveCount(0);

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    expect(reports).toEqual([]);
    await expect(page).toHaveScreenshot('partner-wallet-selection-02-kevinsoell-sell.png', {
      fullPage: true,
      maxDiffPixels: 1000,
    });
  });

  test('the Bitcoin Lightning page shows the Lightning wallet list', async ({ page }) => {
    const reports: string[] = [];
    await installRoutes(page, reports);

    await page.goto('/?mode=lightning-wallets&lang=en');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('img[src$="/bitcoinapp_en.jpg"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('img[src$="/command_en.jpg"]')).toBeVisible();
    await expect(page.locator('img[src*="alby"]')).toHaveCount(0);
    await expect(page.getByText('Oh, sorry, something went wrong')).toHaveCount(0);

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    expect(reports).toEqual([]);
    await expect(page).toHaveScreenshot('partner-wallet-selection-03-lightning-wallets.png', {
      fullPage: true,
      maxDiffPixels: 1000,
    });
  });
});
