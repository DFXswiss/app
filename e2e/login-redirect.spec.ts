import { expect, type Locator, type Page, test } from '@playwright/test';
import { ethers } from 'ethers';

/**
 * Visual regression: a command-line wallet login on /login continues to /buy, a guarded /buy
 * returns there after login, and the same login on /connect continues to /account.
 *
 * Runs against a real local API (see CONTRIBUTING.md, "Visual regression tests", workflow step 2).
 * The browser signs the message the page shows with a fresh ethers wallet, and the API checks that
 * signature. The dev server has to be started with REACT_APP_API_URL pointing at that same API.
 * E2E_API_URL is required and must be localhost or 127.0.0.1.
 *
 * The clock is pinned to Europe/Zurich so an unmasked timestamp does not move between runs.
 * UI language is pinned with `lang=en`.
 *
 * A green run does not prove a real wallet extension or production.
 */

const REQUIRED_ENV = ['E2E_API_URL'];

function normPath(path: string): string {
  return path !== '/' && path.endsWith('/') ? path.slice(0, -1) : path;
}

function assertLocalApi(): void {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) throw new Error(`Set ${missing.join(', ')} to point this spec at the local API`);
  const raw = process.env.E2E_API_URL;
  if (!raw) throw new Error('Set E2E_API_URL to point this spec at the local API');
  let host: string;
  try {
    host = new URL(raw).hostname;
  } catch {
    throw new Error('E2E_API_URL is not a URL. Refusing to run.');
  }
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`E2E_API_URL must be localhost or 127.0.0.1. Refusing to call ${host}.`);
  }
}

async function loginWithCommandLine(page: Page, openCryptoWallet: boolean): Promise<string> {
  const wallet = ethers.Wallet.createRandom();
  if (openCryptoWallet) await page.locator('img[src*="cryptowallet"]').click();
  await page.locator('img[src*="command"]').click();
  const address = page.locator('input[name="address"]');
  await address.fill(wallet.address);
  await address.blur();
  const messageNode = page.locator('p.text-dfxBlue-800.min-w-0.break-words');
  await expect(messageNode).toBeVisible({ timeout: 20_000 });
  const message = await messageNode.textContent();
  if (message == null || message.length === 0) throw new Error('command-line sign message was empty');
  const signature = await wallet.signMessage(message);
  const signatureInput = page.locator('input[type="password"]');
  await signatureInput.fill(signature);
  await signatureInput.blur();
  const login = page.getByRole('button', { name: 'Login' });
  await expect(login).toBeEnabled({ timeout: 20_000 });
  await login.click();
  return wallet.address;
}

function runDataMasks(page: Page, address: string): Locator[] {
  const tail = address.slice(-4);
  return [
    page.locator('#dropDownButton').filter({ hasText: tail }),
    page.locator('input[name="targetAmount"]'),
    page.locator('label').filter({ hasText: 'Exchange rate' }).locator('..'),
  ];
}

async function expectStaysOn(page: Page, pathname: string, stableText?: string): Promise<void> {
  await expect.poll(() => normPath(new URL(page.url()).pathname), { timeout: 20_000 }).toBe(pathname);
  if (stableText) await expect(page.getByText(stableText).first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(3_000);
  expect(normPath(new URL(page.url()).pathname)).toBe(pathname);
}

test.use({ timezoneId: 'Europe/Zurich' });

test.describe('login redirect against the local API', () => {
  test.beforeAll(assertLocalApi);

  test.beforeEach(() => {
    test.setTimeout(90_000);
  });

  test('command-line login on /login continues to /buy', async ({ page }) => {
    await page.goto('/login?blockchain=Ethereum&lang=en');
    const address = await loginWithCommandLine(page, true);
    await expectStaysOn(page, '/buy', 'You spend');
    const addressMenu = page.locator('#dropDownButton').filter({ hasText: address.slice(-4) });
    await expect(addressMenu).toBeVisible({ timeout: 15_000 });
    // The local stack has no rate source. Below this menu the quote is a spinner or
    // INTERNAL_SERVER_ERROR, depending on timing, so the shot stops here.
    const box = await addressMenu.boundingBox();
    if (box == null) throw new Error('address menu has no bounding box');
    const viewport = page.viewportSize();
    if (viewport == null) throw new Error('viewport size is missing');
    await expect(page).toHaveScreenshot('login-redirect-01-buy.png', {
      fullPage: false,
      clip: { x: 0, y: 0, width: viewport.width, height: box.y + box.height + 16 },
      maxDiffPixels: 1000,
      mask: runDataMasks(page, address),
      timeout: 20_000,
    });
  });

  test('guarded /buy returns to /buy after login', async ({ page }) => {
    await page.goto('/buy?blockchain=Ethereum&lang=en');
    await expect(page.locator('img[src*="cryptowallet"]')).toBeVisible({ timeout: 20_000 });
    await loginWithCommandLine(page, true);
    await expectStaysOn(page, '/buy');
  });

  test('command-line login on /connect continues to /account', async ({ page }) => {
    await page.goto('/connect?blockchain=Ethereum&lang=en');
    const address = await loginWithCommandLine(page, false);
    await expectStaysOn(page, '/account', 'Total trading volume');
    await expect(page.locator('#dropDownButton').filter({ hasText: address.slice(-4) })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page).toHaveScreenshot('login-redirect-02-account.png', {
      fullPage: true,
      maxDiffPixels: 1000,
      mask: runDataMasks(page, address),
      timeout: 20_000,
    });
  });
});
