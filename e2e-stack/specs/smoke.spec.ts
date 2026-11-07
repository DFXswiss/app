import { expect, test } from './fixtures';

function apiBase(): string {
  return process.env.E2E_API_URL ?? 'http://api:3000';
}

/**
 * Smoke chain only — proves the frontend shell and that GET /v1/asset returns a non-empty list.
 * Navigates only to `/` so the route registry claim in specs/registry/smoke.ts stays accurate;
 * later lanes own the rest of the route tree.
 */
test.describe('e2e-stack smoke', () => {
  test('frontend loads, API assets', async ({ page }) => {
    // 1) Frontend load: attach error listeners before navigating.
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => {
      pageErrors.push(String(err));
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    // Root shell is present (#app-root from layout.tsx) — not just a non-empty body (nginx errors count too).
    await expect(page.locator('#app-root')).toBeVisible({ timeout: 15000 });
    expect(pageErrors, `uncaught pageerror during load: ${pageErrors.join('; ')}`).toEqual([]);
    expect(consoleErrors, `console error during load: ${consoleErrors.join('; ')}`).toEqual([]);

    // 2) API assets list is non-empty.
    const assetRes = await fetch(`${apiBase()}/v1/asset`);
    expect(assetRes.ok, `GET /v1/asset status ${assetRes.status}`).toBe(true);
    const assets = (await assetRes.json()) as unknown[];
    expect(Array.isArray(assets), 'GET /v1/asset should return a JSON array').toBe(true);
    expect(assets.length, 'GET /v1/asset should be non-empty').toBeGreaterThan(0);

    // Re-assert error lists at the END — the listeners have stayed active through the asset check,
    // not just the first page load.
    expect(pageErrors, `uncaught pageerror after asset check: ${pageErrors.join('; ')}`).toEqual([]);
    expect(consoleErrors, `console error after asset check: ${consoleErrors.join('; ')}`).toEqual([]);
  });
});
