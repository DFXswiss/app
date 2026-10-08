import { expect, test, type Page, type Route } from '@playwright/test';

test.use({
  launchOptions: {
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
  },
});

/**
 * Visual baselines for the SPAR location block on /pl?merchant=SPAR.
 * These specs are a local review aid and do not run in CI.
 * The map uses the live Liberty style so the pictures show Switzerland,
 * not an empty canvas.
 */

const FILTERS = { countries: ['CH', 'LI'], shopNames: ['SPAR', 'others'] };

const SPAR_PLACES = [
  { name: 'SPAR Zürich Oerlikon', shopName: 'SPAR', country: 'CH', category: 'Grocery', lat: 47.411, lon: 8.544 },
  { name: 'SPAR Bern Marktgasse', shopName: 'SPAR', country: 'CH', category: 'Grocery', lat: 46.948, lon: 7.447 },
  { name: 'SPAR Basel Claraplatz', shopName: 'SPAR', country: 'CH', category: 'Grocery', lat: 47.561, lon: 7.59 },
  { name: 'SPAR Genève Cornavin', shopName: 'SPAR', country: 'CH', category: 'Grocery', lat: 46.21, lon: 6.142 },
  { name: 'SPAR Lugano Centro', shopName: 'SPAR', country: 'CH', category: 'Grocery', lat: 46.005, lon: 8.952 },
  { name: 'SPAR St. Gallen Marktplatz', shopName: 'SPAR', country: 'CH', category: 'Grocery', lat: 47.424, lon: 9.376 },
  { name: 'SPAR Luzern Bahnhof', shopName: 'SPAR', country: 'CH', category: 'Grocery', lat: 47.05, lon: 8.31 },
  { name: 'SPAR Chur Postplatz', shopName: 'SPAR', country: 'CH', category: 'Grocery', lat: 46.85, lon: 9.53 },
];

const OTHER_PLACES = [
  { name: 'Volg Samedan', shopName: 'Volg', country: 'CH', category: 'Grocery', lat: 46.534, lon: 9.872 },
  { name: 'Volg Vaduz', shopName: 'Volg', country: 'LI', category: 'Grocery', lat: 47.141, lon: 9.521 },
];

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

async function stubPlaces(
  page: Page,
  places: { status: number; body: unknown } | 'by-shop',
  filters: { status: number; body: unknown } = { status: 200, body: FILTERS },
): Promise<void> {
  await page.route('https://api.opencryptopay.io/map/**', (route) => {
    const url = route.request().url();
    if (url.includes('/map/filters')) return fulfillJson(route, filters.status, filters.body);
    if (places === 'by-shop') {
      const shopName = new URL(url).searchParams.get('shopName');
      const country = new URL(url).searchParams.get('country');
      const source = shopName === 'others' ? OTHER_PLACES : SPAR_PLACES;
      const body = {
        places: country === null ? source : source.filter((place) => place.country === country),
      };
      return fulfillJson(route, 200, body);
    }
    return fulfillJson(route, places.status, places.body);
  });
}

async function openLocations(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pl?merchant=SPAR&lang=en');
  await expect(page.getByTestId('spar-locations')).toBeVisible();
}

async function mapEpoch(page: Page): Promise<string | null> {
  return page.locator('[data-testid="spar-locations"] [data-map-epoch]').getAttribute('data-map-epoch');
}

async function waitForMap(page: Page): Promise<void> {
  await expect(page.locator('[data-testid="spar-locations"] [data-map-ready="true"]')).toBeVisible({
    timeout: 60000,
  });
}

async function waitForNextMap(page: Page, previousEpoch: string | null): Promise<void> {
  await page.waitForFunction(
    (previous) => {
      const ready = document.querySelector('[data-testid="spar-locations"] [data-map-ready="true"]');
      if (ready === null) return false;
      const epoch = ready.getAttribute('data-map-epoch');
      return epoch !== null && epoch !== previous;
    },
    previousEpoch,
    { timeout: 60000 },
  );
}

async function shoot(page: Page, name: string): Promise<void> {
  const section = page.getByTestId('spar-locations');
  await section.scrollIntoViewIfNeeded();
  await expect(section).toHaveScreenshot(name, { animations: 'disabled' });
}

test.describe('SPAR locations', () => {
  test.describe.configure({ timeout: 120000 });

  test('visual regression - location list error', async ({ page }) => {
    await stubAppApi(page);
    await stubPayment(page);
    await stubPlaces(page, { status: 500, body: {} }, { status: 500, body: {} });
    await openLocations(page);
    await expect(page.getByText('The location list could not be loaded.', { exact: true })).toBeVisible();
    await shoot(page, 'spar-locations-error.png');
  });

  test('visual regression - no locations published', async ({ page }) => {
    await stubAppApi(page);
    await stubPayment(page);
    await stubPlaces(page, { status: 200, body: { places: [] } });
    await openLocations(page);
    await expect(page.getByText('No locations published yet.', { exact: true })).toBeVisible();
    await waitForMap(page);
    await shoot(page, 'spar-locations-empty.png');
  });

  test('visual regression - locations across Switzerland', async ({ page }) => {
    await stubAppApi(page);
    await stubPayment(page);
    await stubPlaces(page, 'by-shop');
    await openLocations(page);
    await waitForMap(page);
    await expect(page.getByRole('button', { name: 'SPAR Genève Cornavin' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'SPAR St. Gallen Marktplatz' })).toBeVisible();
    await shoot(page, 'spar-locations-map.png');
  });

  test('visual regression - open location', async ({ page }) => {
    await stubAppApi(page);
    await stubPayment(page);
    await stubPlaces(page, 'by-shop');
    await openLocations(page);
    await waitForMap(page);
    await page.getByRole('button', { name: 'SPAR Bern Marktgasse' }).click();
    await expect(page.getByText('SPAR Bern Marktgasse', { exact: true })).toBeVisible();
    await expect(page.getByText('Grocery', { exact: true })).toBeVisible();
    await shoot(page, 'spar-locations-popup.png');
  });

  test('visual regression - Switzerland only', async ({ page }) => {
    await stubAppApi(page);
    await stubPayment(page);
    await stubPlaces(page, 'by-shop');
    await openLocations(page);
    await waitForMap(page);
    const beforeShop = await mapEpoch(page);
    const others = page.waitForResponse(
      (response) =>
        response.url().includes('/map/places') && response.url().includes('shopName=others') && response.ok(),
    );
    await page.getByRole('combobox', { name: 'Shop' }).selectOption('others');
    await others;
    await waitForNextMap(page, beforeShop);
    const beforeCountry = await mapEpoch(page);
    const filtered = page.waitForResponse(
      (response) => response.url().includes('/map/places') && response.url().includes('country=CH') && response.ok(),
    );
    await page.getByRole('combobox', { name: 'Country' }).selectOption('CH');
    await filtered;
    await waitForNextMap(page, beforeCountry);
    await expect(page.getByRole('combobox', { name: 'Country' })).toHaveValue('CH');
    await expect(page.getByRole('button', { name: 'Volg Samedan' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Volg Vaduz' })).toHaveCount(0);
    await shoot(page, 'spar-locations-country.png');
  });

  test('visual regression - other shops', async ({ page }) => {
    await stubAppApi(page);
    await stubPayment(page);
    await stubPlaces(page, 'by-shop');
    await openLocations(page);
    await waitForMap(page);
    const beforeShop = await mapEpoch(page);
    const others = page.waitForResponse(
      (response) =>
        response.url().includes('/map/places') && response.url().includes('shopName=others') && response.ok(),
    );
    await page.getByRole('combobox', { name: 'Shop' }).selectOption('others');
    await others;
    await waitForNextMap(page, beforeShop);
    await expect(page.getByRole('button', { name: 'Volg Samedan' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Volg Vaduz' })).toBeVisible();
    await shoot(page, 'spar-locations-others.png');
  });
});
