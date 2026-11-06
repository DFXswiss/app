/**
 * Real MetaMask extension (11.9.1 in Chrome 126 via custom-fixtures.ts) against the dev API.
 * REACT_APP_API_URL=https://dev.api.dfx.swiss is required. TEST_SEED comes from .env.
 * No money movement, only the login signature.
 *
 * One real MetaMask login against the dev API. After the signature this file
 * does not navigate: the app has to leave the login screen on its own.
 *
 * Base URL comes from the Playwright config.
 */

import type { Page } from '@playwright/test';
import { expect, test } from './custom-fixtures';
import { loginWithRealMetaMask, requireApiOrigin, selectEthereumMainnet } from './login-redirect-metamask.helpers';

function pathOf(url: string): string {
  if (!url.startsWith('http://') && !url.startsWith('https://')) return url;
  return new URL(url).pathname;
}

function recordVisitedPaths(page: Page): void {
  const paths: string[] = [];
  const publish = () => {
    const description = paths.join(' -> ');
    const annotations = test.info().annotations;
    const existing = annotations.find((entry) => entry.type === 'visited-paths');
    if (existing) existing.description = description;
    else annotations.push({ type: 'visited-paths', description });
    console.log(`visited-paths: ${description}`);
  };
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return;
    paths.push(pathOf(frame.url()));
    publish();
  });
}

async function expectStaysOn(page: Page, pathname: string): Promise<void> {
  await expect(page).toHaveURL((url) => url.pathname === pathname, { timeout: 30_000 });
  await page.waitForTimeout(3_000);
  await expect(page).toHaveURL((url) => url.pathname === pathname);
  await expect(page.locator('img[src*="cryptowallet"]').filter({ visible: true })).toHaveCount(0);
}

async function shootApp(page: Page): Promise<void> {
  await page.bringToFront();
  await page.screenshot({ path: test.info().outputPath('final.png') });
}

test.describe('real MetaMask login redirect', () => {
  test.setTimeout(360_000);

  test.beforeAll(() => {
    requireApiOrigin();
  });

  test('continues from /login to /buy after a real MetaMask login', async ({
    page,
    context,
    metamask,
    extensionId,
  }) => {
    recordVisitedPaths(page);
    await selectEthereumMainnet(metamask, context, extensionId);
    await page.goto('/login');
    await loginWithRealMetaMask(page, context, extensionId, 'crypto-wallet');
    await expectStaysOn(page, '/buy');
    await shootApp(page);
  });

  test('returns to /buy after a real MetaMask login when /buy had no session', async ({
    page,
    context,
    metamask,
    extensionId,
  }) => {
    recordVisitedPaths(page);
    await selectEthereumMainnet(metamask, context, extensionId);
    await page.goto('/buy');
    await expect(page.locator('img[src*="cryptowallet"]')).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).not.toBe('/buy');
    const current = new URL(page.url());
    const guardPath = `${current.pathname}${current.search}`;
    test.info().annotations.push({ type: 'guard-path', description: guardPath });
    console.log(`guard left /buy for ${guardPath}`);
    await loginWithRealMetaMask(page, context, extensionId, 'crypto-wallet');
    await expectStaysOn(page, '/buy');
    await shootApp(page);
  });

  test('continues from /connect to /account after a real MetaMask login', async ({
    page,
    context,
    metamask,
    extensionId,
  }) => {
    recordVisitedPaths(page);
    await selectEthereumMainnet(metamask, context, extensionId);
    await page.goto('/connect');
    await loginWithRealMetaMask(page, context, extensionId, 'wallet-list');
    await expectStaysOn(page, '/account');
    await shootApp(page);
  });
});
