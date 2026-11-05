import { expect, test, type Locator, type Page, type Route } from '@playwright/test';

// A value jwt-decode cannot read is removed on boot. The expiry is in the future. The signature is not checked.
const ACCOUNT_TOKEN = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJleHAiOjQxMDI0NDQ4MDAsImJsb2NrY2hhaW5zIjpbXX0.x';

const VISUAL_USER = {
  mail: 'user@example.com',
  language: { id: 2, name: 'English', symbol: 'EN' },
  kyc: { hash: '' },
  addresses: [],
};

const LANGUAGES = [
  { id: 1, name: 'Deutsch', symbol: 'DE', enable: true },
  { id: 2, name: 'English', symbol: 'EN', enable: true },
  { id: 3, name: 'Français', symbol: 'FR', enable: true },
  { id: 4, name: 'Italiano', symbol: 'IT', enable: true },
];

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installRoutes(page: Page, holdUser?: Promise<void>): Promise<void> {
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
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const authorization = request.headers()['authorization'] ?? '';
    if (authorization.includes(ACCOUNT_TOKEN)) {
      if (request.method() === 'GET' && path === '/v2/user') {
        if (holdUser) await holdUser;
        return fulfillJson(route, VISUAL_USER);
      }
      return fulfillJson(route, []);
    }
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

async function plantAccountToken(page: Page): Promise<void> {
  await page.addInitScript((token) => {
    window.localStorage.setItem('dfx.authenticationToken', token);
  }, ACCOUNT_TOKEN);
}

async function expectWalletAddress(page: Page): Promise<void> {
  await expect.poll(() => new URL(page.url()).pathname).toBe('/wallet');
}

// The login layout clips inside overflow-auto. Expanding those nodes and growing the viewport is
// what makes each control fully visible instead of a 1280×720 crop.
async function shoot(page: Page, name: string, controls: Locator[]): Promise<void> {
  await page.evaluate(() => {
    const expanded: HTMLElement[] = [];
    const collect = (): HTMLElement[] =>
      Array.from(document.querySelectorAll('*')).filter(
        (node): node is HTMLElement => node instanceof HTMLElement && node.scrollHeight > node.clientHeight,
      );
    const expand = (nodes: HTMLElement[]): void => {
      for (const node of nodes) {
        node.style.overflow = 'visible';
        node.style.height = 'auto';
        node.style.maxHeight = 'none';
        expanded.push(node);
      }
    };
    expand(collect());
    expand(collect());
    window.scrollTo(0, 0);
    for (const node of expanded) node.scrollTop = 0;
  });
  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  if (scrollHeight > 5000) throw new Error(`document scroll height ${scrollHeight} exceeds 5000`);
  await page.setViewportSize({ width: 1280, height: Math.max(720, scrollHeight) });
  await page.evaluate(() => window.scrollTo(0, 0));
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error(`viewport is missing before ${name}`);
  for (let index = 0; index < controls.length; index += 1) {
    const control = controls[index];
    if (control === undefined) throw new Error(`required control is missing (${name} #${index})`);
    const box = await control.boundingBox();
    if (box === null) throw new Error(`required control bounding box is null (${name} #${index})`);
    if (box.y < 0 || box.y + box.height > viewport.height) {
      throw new Error(
        `required control is outside the viewport (${name} #${index}): ` +
          `y=${box.y} height=${box.height} viewport=${viewport.height}`,
      );
    }
  }
  await expect(page).toHaveScreenshot(name, { fullPage: true, animations: 'disabled' });
}

test.describe('/wallet passkey entry', () => {
  test('shows a spinner while the signed-in user is still loading', async ({ page }) => {
    let release = (): void => undefined;
    const holdUser = new Promise<void>((resolve) => {
      release = resolve;
    });
    await plantAccountToken(page);
    await installRoutes(page, holdUser);
    await page.goto('/wallet?lang=en');

    const spinner = page.locator('svg[viewBox="0 0 66 66"]');
    await expect(spinner).toBeVisible();
    await expect(page.getByLabel('Email address')).toHaveCount(0);
    await expectWalletAddress(page);
    await shoot(page, 'wallet-entry-loading.png', [spinner]);
    release();
  });

  test('opens the passkey form without leaving /wallet', async ({ page }) => {
    await stubPasskeyPlatform(page);
    await installRoutes(page);
    await page.goto('/wallet?lang=en');

    const mail = page.getByLabel('Email address');
    const create = page.getByRole('button', { name: 'Create passkey' });
    const login = page.getByRole('button', { name: 'Log in' });
    await expect(mail).toBeVisible();
    await expect(create).toBeVisible();
    await expect(login).toBeVisible();
    await expectWalletAddress(page);
    await shoot(page, 'wallet-entry-signed-out.png', [mail, create, login]);
  });

  test('shows the home services when the session is already signed in', async ({ page }) => {
    await plantAccountToken(page);
    await installRoutes(page);
    await page.goto('/wallet?lang=en');

    const buy = page.locator('img[src*="/kaufen_"]');
    await expect(buy).toBeVisible();
    await expect.poll(async () => buy.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByLabel('Email address')).toHaveCount(0);
    await expectWalletAddress(page);
    await shoot(page, 'wallet-entry-signed-in.png', [buy]);
  });
});
