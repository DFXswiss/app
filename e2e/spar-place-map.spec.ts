import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Visual baselines for the SPAR location block on /pl?merchant=SPAR.
 * These specs are a local review aid and do not run in CI.
 */

const EMPTY_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e8eef4' } }],
};

const FILTERS = { countries: ['CH'], shopNames: ['SPAR', 'others'] };

const ONE_PLACE = {
  places: [
    {
      name: 'SPAR Zürich',
      shopName: 'SPAR',
      country: 'CH',
      category: 'grocery',
      lat: 47.37,
      lon: 8.54,
    },
  ],
};

async function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function stubAppApi(page: Page): Promise<void> {
  await page.route('**/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/v1/setting/infoBanner') return fulfillJson(route, 200, null);
    if (path === '/v1/language') {
      return fulfillJson(route, 200, [
        { id: 1, name: 'Deutsch', symbol: 'DE' },
        { id: 2, name: 'English', symbol: 'EN' },
      ]);
    }
    return fulfillJson(route, 200, []);
  });
  await page.route('**/v2/**', (route) => fulfillJson(route, 200, {}));
}

async function stubPayment(page: Page): Promise<void> {
  await page.route('**/paymentLink/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/walletApp')) return fulfillJson(route, 200, []);
    return fulfillJson(route, 200, {
      displayName: 'SPAR',
      externalId: 'merchant-info-shot',
      message: 'no payment',
    });
  });
}

async function stubMapStyle(page: Page): Promise<void> {
  await page.route('https://tiles.openfreemap.org/**', (route) => fulfillJson(route, 200, EMPTY_STYLE));
}

async function stubPlaces(
  page: Page,
  places: { status: number; body: unknown },
  filters: { status: number; body: unknown } = { status: 200, body: FILTERS },
): Promise<void> {
  await page.route('https://api.opencryptopay.io/map/**', (route) => {
    const url = route.request().url();
    if (url.includes('/map/filters')) return fulfillJson(route, filters.status, filters.body);
    return fulfillJson(route, places.status, places.body);
  });
}

test.describe('SPAR locations', () => {
  test('visual regression - location list error', async ({ page }) => {
    await stubAppApi(page);
    await stubPayment(page);
    await stubMapStyle(page);
    await stubPlaces(page, { status: 500, body: {} }, { status: 500, body: {} });
    await page.goto('/pl?merchant=SPAR&lang=en');
    await expect(page.getByText('LOCATIONS', { exact: true })).toBeVisible();
    await expect(page.getByText('The location list could not be loaded.', { exact: true })).toBeVisible();
    await expect(page.locator('div.h-96')).toHaveScreenshot('spar-locations-error.png');
  });

  test('visual regression - no locations published', async ({ page }) => {
    await stubAppApi(page);
    await stubPayment(page);
    await stubMapStyle(page);
    await stubPlaces(page, { status: 200, body: { places: [] } });
    await page.goto('/pl?merchant=SPAR&lang=en');
    await expect(page.getByText('No locations published yet.', { exact: true })).toBeVisible();
    await expect(page.locator('div.h-96')).toHaveScreenshot('spar-locations-empty.png');
  });

  test('visual regression - one location', async ({ page }) => {
    await stubAppApi(page);
    await stubPayment(page);
    await stubMapStyle(page);
    await stubPlaces(page, { status: 200, body: ONE_PLACE });
    await page.goto('/pl?merchant=SPAR&lang=en');
    await expect(page.getByRole('combobox', { name: 'Shop' })).toBeVisible();
    await expect(page.getByText('No locations published yet.', { exact: true })).toHaveCount(0);
    await expect(page.getByText('The location list could not be loaded.', { exact: true })).toHaveCount(0);
    await expect(page.locator('div.h-96')).toHaveScreenshot('spar-locations-map.png');
  });
});
