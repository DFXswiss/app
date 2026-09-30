import { expect, Page, Route, test } from '@playwright/test';

/**
 * Visual regression for the Log Validity admin screen (/dashboard/financial/log-validity): the empty
 * form with both sections, and the confirmation shown before an info point is recorded.
 *
 * Auth is a synthetic Admin JWT and the app shell reads are mocked, the same way as the RealUnit
 * workspace spec. The screen fetches nothing on mount, so no validity data is involved.
 */

function jwt(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    account: 1,
    user: 1,
    role: 'Admin',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.synthetic`;
}

async function json(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installShellRoutes(page: Page): Promise<void> {
  await page.route('**/v1/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (
      request.method() === 'GET' &&
      ['/v1/language', '/v1/fiat', '/v1/asset', '/v1/bankAccount', '/v1/country'].includes(path)
    ) {
      return json(route, []);
    }
    if (request.method() === 'GET' && path === '/v1/setting/infoBanner') return json(route, null);
    await route.continue();
  });

  await page.route('**/v2/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET' && path === '/v2/user') {
      return json(route, {
        id: 1,
        activeAddress: { address: '0x0000000000000000000000000000000000000001', wallet: 'DFX' },
        addresses: [],
        kyc: { level: 50, status: 'Completed' },
        language: { id: 1, name: 'English', symbol: 'EN' },
      });
    }
    await route.continue();
  });
}

const shot = { fullPage: true, maxDiffPixels: 1000, animations: 'disabled' as const };

test.describe('Log Validity - Visual Regression Tests', () => {
  // The confirmation prints the picked local time as UTC, so the zone is pinned for a stable baseline.
  test.use({ timezoneId: 'Europe/Zurich' });

  test('form and info point confirmation', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1400 });
    await installShellRoutes(page);
    await page.goto(`/dashboard/financial/log-validity?session=${encodeURIComponent(jwt())}&lang=en`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'By financial range / threshold' })).toBeVisible();
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('log-validity-01-form.png', shot);

    const dates = page.locator('input[type="datetime-local"]');
    await dates.nth(0).fill('2026-09-30T19:00');
    await dates.nth(1).fill('2026-09-30T19:02');
    await page.getByPlaceholder('Reason').fill('Bank fee debit');
    await page.getByRole('button', { name: 'Add info point (set valid)' }).click();
    await expect(page.getByText(/Record an info point for all financial data logs matching/)).toBeVisible();

    await expect(page).toHaveScreenshot('log-validity-02-info-point-confirmation.png', shot);
  });
});
