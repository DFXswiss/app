import { expect, test, type Page, type Route } from '@playwright/test';

test.use({
  launchOptions: {
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
  },
});

/**
 * Visual baselines for the SPAR payment page on /pl?merchant=SPAR.
 * Each picture is the whole page, not only the locations block.
 * The page always asks for SPAR shops in Switzerland and shows no country or shop control.
 * These specs are a local review aid and do not run in CI.
 * The map uses the live Liberty style so the pictures show Switzerland,
 * not an empty canvas.
 * A green run does not prove that the place API returns these shops or that those shops exist.
 * Map tiles are the live OpenFreeMap style.
 */

const SPAR_PLACES = [
  { name: 'SPAR Zürich Oerlikon', shopName: 'SPAR', country: 'CH', category: 'Grocery', lat: 47.411, lon: 8.544 },
  { name: 'SPAR Bern Marktgasse', shopName: 'SPAR', country: 'CH', category: 'Grocery', lat: 46.948, lon: 7.447 },
  { name: 'SPAR Basel Claraplatz', shopName: 'SPAR', country: 'CH', category: 'Grocery', lat: 47.561, lon: 7.59 },
  { name: 'SPAR Genève Cornavin', shopName: 'SPAR', country: 'CH', category: 'Grocery', lat: 46.21, lon: 6.142 },
  { name: 'SPAR Lugano Centro', shopName: 'SPAR', country: 'CH', category: 'Grocery', lat: 46.005, lon: 8.952 },
  { name: 'SPAR St. Gallen Marktplatz', shopName: 'SPAR', country: 'CH', category: 'Grocery', lat: 47.424, lon: 9.376 },
  { name: 'SPAR Luzern Bahnhof', shopName: 'SPAR', country: 'CH', category: 'Grocery', lat: 47.05, lon: 8.31 },
  { name: 'SPAR Chur Postplatz', shopName: 'SPAR', country: 'CH', category: 'Grocery', lat: 46.85, lon: 9.53 },
  { name: 'SPAR Vaduz', shopName: 'SPAR', country: 'LI', category: 'Grocery', lat: 47.141, lon: 9.521 },
  { name: 'Volg Samedan', shopName: 'Volg', country: 'CH', category: 'Grocery', lat: 46.534, lon: 9.872 },
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

function watchMap(page: Page): string[] {
  const seen: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('api.opencryptopay.io/map')) seen.push(request.url());
  });
  return seen;
}

async function expectSwissSparOnly(seen: string[]): Promise<void> {
  await expect.poll(() => seen.length).toBeGreaterThan(0);
  expect(seen.every((url) => url.includes('/map/places?shopName=SPAR&country=CH'))).toBe(true);
  expect(seen.some((url) => url.includes('/map/filters'))).toBe(false);
}

async function stubPlaces(page: Page, places: { status: number; body: unknown }): Promise<void> {
  await page.route('https://api.opencryptopay.io/map/**', (route) => {
    const url = route.request().url();
    if (!url.includes('/map/places?shopName=SPAR&country=CH')) return fulfillJson(route, 500, {});
    return fulfillJson(route, places.status, places.body);
  });
}

async function openLocations(page: Page): Promise<void> {
  // The payment page scrolls inside the layout, so a short viewport would clip the
  // locations block. Start tall enough that the map is on screen while it draws.
  await page.setViewportSize({ width: 1280, height: 1600 });
  await page.goto('/pl?merchant=SPAR&lang=en');
  await expect(page.getByTestId('spar-locations')).toBeVisible();
  await expect(page.locator('img[alt="logo"]')).toBeVisible();
}

async function waitForMap(page: Page): Promise<void> {
  await expect(page.locator('[data-testid="spar-locations"] [data-map-ready="true"]')).toBeVisible({
    timeout: 60000,
  });
}

async function shoot(page: Page, name: string): Promise<void> {
  const section = page.getByTestId('spar-locations');
  await section.scrollIntoViewIfNeeded();
  const height = await page.evaluate(async () => {
    const root = document.getElementById('app-root');
    const scroller = root?.querySelector('.overflow-auto');
    if (scroller instanceof HTMLElement) scroller.scrollTop = 0;
    await document.fonts.ready;
    const column = root?.querySelector('.max-w-screen-md');
    const last = column?.lastElementChild;
    if (!(column instanceof HTMLElement) || !(last instanceof HTMLElement)) return 900;
    const pad = Number.parseFloat(getComputedStyle(column).paddingBottom) || 0;
    return Math.ceil(last.getBoundingClientRect().bottom + pad);
  });
  await page.setViewportSize({ width: 1280, height });
  await expect(section).toBeInViewport();
  await expect(page).toHaveScreenshot(name, { animations: 'disabled', fullPage: true });
}

test.describe('SPAR locations', () => {
  test.describe.configure({ timeout: 120000 });

  test('visual regression - locations loading places', async ({ page }) => {
    const seen = watchMap(page);
    let resolvePlaces: (() => void) | undefined;
    const placesHeld = new Promise<void>((resolve) => {
      resolvePlaces = resolve;
    });
    await page.route('https://api.opencryptopay.io/map/**', async (route) => {
      const url = route.request().url();
      if (!url.includes('/map/places?shopName=SPAR&country=CH')) return fulfillJson(route, 500, {});
      await placesHeld;
      return fulfillJson(route, 200, { places: [] });
    });
    await stubAppApi(page);
    await stubPayment(page);
    await openLocations(page);
    await expectSwissSparOnly(seen);
    await expect(page.getByRole('combobox', { name: 'Country' })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Shop' })).toHaveCount(0);
    await expect(page.getByText('No locations published yet.', { exact: true })).toHaveCount(0);
    await expect(page.locator('[data-testid="spar-locations"] [data-map-ready="true"]')).toHaveCount(0);
    await shoot(page, 'spar-locations-loading-places.png');
    const placesDone = page.waitForResponse((response) => response.url().includes('/map/places'));
    if (resolvePlaces === undefined) {
      throw new Error('resolvePlaces was not assigned');
    }
    resolvePlaces();
    await placesDone;
  });

  test('visual regression - location list error', async ({ page }) => {
    const seen = watchMap(page);
    await stubAppApi(page);
    await stubPayment(page);
    await stubPlaces(page, { status: 500, body: {} });
    await openLocations(page);
    await expect(page.getByText('The location list could not be loaded.', { exact: true })).toBeVisible();
    await expectSwissSparOnly(seen);
    await expect(page.getByRole('combobox', { name: 'Country' })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Shop' })).toHaveCount(0);
    await shoot(page, 'spar-locations-error.png');
  });

  test('visual regression - no locations published', async ({ page }) => {
    const seen = watchMap(page);
    await stubAppApi(page);
    await stubPayment(page);
    await stubPlaces(page, { status: 200, body: { places: [] } });
    await openLocations(page);
    await expect(page.getByText('No locations published yet.', { exact: true })).toBeVisible();
    await waitForMap(page);
    await expectSwissSparOnly(seen);
    await expect(page.getByRole('combobox', { name: 'Country' })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Shop' })).toHaveCount(0);
    await shoot(page, 'spar-locations-empty.png');
  });

  test('visual regression - locations across Switzerland', async ({ page }) => {
    const seen = watchMap(page);
    await stubAppApi(page);
    await stubPayment(page);
    await stubPlaces(page, { status: 200, body: { places: SPAR_PLACES } });
    await openLocations(page);
    await waitForMap(page);
    await expectSwissSparOnly(seen);
    await expect(page.getByRole('button', { name: 'SPAR Genève Cornavin' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'SPAR St. Gallen Marktplatz' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'SPAR Vaduz' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Volg Samedan' })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Country' })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Shop' })).toHaveCount(0);
    await shoot(page, 'spar-locations-map.png');
  });

  test('visual regression - open location', async ({ page }) => {
    const seen = watchMap(page);
    await stubAppApi(page);
    await stubPayment(page);
    await stubPlaces(page, { status: 200, body: { places: SPAR_PLACES } });
    await openLocations(page);
    await waitForMap(page);
    await expectSwissSparOnly(seen);
    await page.getByRole('button', { name: 'SPAR Bern Marktgasse' }).click();
    await expect(page.locator('.maplibregl-popup').getByText('SPAR Bern Marktgasse', { exact: true })).toBeVisible();
    await expect(page.locator('.maplibregl-popup').getByText('Grocery', { exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Country' })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Shop' })).toHaveCount(0);
    await shoot(page, 'spar-locations-popup.png');
  });
});
