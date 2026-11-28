import { expect, test, type Page, type Route } from '@playwright/test';

// Bootstrap calls are mocked so the signed-out home toolbox renders without a live API. The
// BUY/SELL/SWAP images still load from dfx.swiss. A green run does not prove the passkey sign-in
// behind /wallet; wallet-entry.spec.ts and passkey-login.spec.ts cover that screen.

const LANGUAGES = [
  { id: 1, name: 'Deutsch', symbol: 'DE', enable: true },
  { id: 2, name: 'English', symbol: 'EN', enable: true },
  { id: 3, name: 'Français', symbol: 'FR', enable: true },
  { id: 4, name: 'Italiano', symbol: 'IT', enable: true },
];

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installRoutes(page: Page): Promise<void> {
  await page.route('https://geolocation-db.com/**', (route) => fulfillJson(route, { country_code: 'CH' }));

  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET' && path === '/v1/language') return fulfillJson(route, LANGUAGES);
    if (request.method() === 'GET' && path === '/v1/fiat') {
      return fulfillJson(route, [{ id: 1, name: 'CHF', buyable: true, sellable: true }]);
    }
    if (request.method() === 'GET' && path === '/v1/setting/infoBanner') return fulfillJson(route, null);
    return fulfillJson(route, []);
  });

  await page.route('**/v2/**', async (route) => {
    // All account requests receive 401 so the home screen stays signed out.
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Unauthorized' }),
    });
  });
}

async function stubPasskeyPlatform(page: Page): Promise<void> {
  await page.addInitScript(() => {
    class PublicKeyCredential {
      static getClientCapabilities(): Promise<Record<string, boolean>> {
        return Promise.resolve({ 'extension:prf': true });
      }
    }
    Object.defineProperty(window, 'PublicKeyCredential', { configurable: true, value: PublicKeyCredential });
  });
}

async function expectLoaded(page: Page, selector: string): Promise<void> {
  const image = page.locator(selector);
  await expect(image).toBeVisible();
  await expect.poll(async () => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
}

async function expectToolbox(page: Page): Promise<void> {
  await expectLoaded(page, 'img[src*="/kaufen_"]');
  await expectLoaded(page, 'img[src*="/verkaufen_"]');
  await expectLoaded(page, 'img[src*="/swap_"]');
}

test.describe('Home toolbox Wallet tile', () => {
  test('shows BUY, SELL and SWAP without the passkey feature', async ({ page }) => {
    await installRoutes(page);
    await page.goto('/?lang=en');

    await expectToolbox(page);
    await expect(page.getByAltText('Wallet')).toHaveCount(0);
    await expect(page.locator('img[src="/images/wallet.jpg"]')).toHaveCount(0);
    await expect(page).toHaveScreenshot('home-wallet-tile-hidden.png', { fullPage: true, animations: 'disabled' });
  });

  test('adds the Wallet tile after SWAP with ?feature=Passkey', async ({ page }) => {
    await installRoutes(page);
    await page.goto('/?feature=Passkey&lang=en');

    await expectToolbox(page);
    await expectLoaded(page, 'img[alt="Wallet"]');
    const sources = await page
      .locator('div.aspect-square > img')
      .evaluateAll((images) => images.map((img) => (img as HTMLImageElement).getAttribute('src') ?? ''));
    expect(sources).toHaveLength(4);
    expect(sources[2]).toContain('/swap_');
    expect(sources[3]).toBe('/images/wallet.jpg');
    await expect(page).toHaveScreenshot('home-wallet-tile-visible.png', { fullPage: true, animations: 'disabled' });
  });

  test('opens the passkey wallet on /wallet from the Wallet tile', async ({ page }) => {
    await stubPasskeyPlatform(page);
    await installRoutes(page);
    await page.goto('/?feature=Passkey&lang=en');

    await page.getByAltText('Wallet').click();

    await expect.poll(() => new URL(page.url()).pathname).toBe('/wallet');
    expect(new URL(page.url()).searchParams.get('feature')).toBe('Passkey');
    await expect(page.getByText('Log in with your device')).toBeVisible();
    await expect(page.getByAltText('Wallet')).toHaveCount(0);
  });
});
