import { test, expect } from '@playwright/test';
import { getCachedAuth } from './helpers/auth-cache';
import { app2ScreenshotOpts as screenshotOpts } from './helpers/app2-screenshot';

/**
 * The wallet session and all non-profile API calls use the local E2E API.
 * Only GET /v2/user/profile is intercepted with a synthetic personal profile;
 * the matching reality declaration is in docs/test-architecture.md. A green
 * screenshot proves that App2 renders the supplied customer's initials at two
 * viewport widths, not that auth or the real profile endpoint returns that name.
 */
test('customer initials are visible on desktop and mobile', async ({ page, request }) => {
  const auth = await getCachedAuth(request, 'evm');
  let profileRequests = 0;
  await page.route(/\/v2\/user\/profile(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    profileRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accountType: 'Personal', firstName: 'Ada', lastName: 'Lovelace' }),
    });
  });

  const appBase = process.env.E2E_APP2_URL ?? 'http://localhost:3001/app2/';
  const appUrl = `${appBase}?session=${encodeURIComponent(auth.token)}#/`;
  await page.setViewportSize({ width: 1280, height: 800 });
  const response = await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  expect(response).toBeTruthy();
  expect(response?.ok()).toBe(true);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page).toHaveTitle('DFX');
  await expect(page.locator('#leftBtn')).toHaveCSS('visibility', 'visible');
  await expect(page.locator('#leftBtn > span')).toHaveText('AL');
  await expect(page.locator('#topbar')).toHaveScreenshot('app2-customer-initials-desktop.png', screenshotOpts);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#leftBtn > span')).toHaveText('AL');
  await expect(page.locator('#topbar')).toHaveScreenshot('app2-customer-initials-mobile.png', screenshotOpts);
  expect(profileRequests).toBeGreaterThan(0);
});
