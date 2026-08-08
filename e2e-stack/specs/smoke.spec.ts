import {
  completeMailLogin,
  expect,
  gotoWithSession,
  requestMailLogin,
  signatureLogin,
  test,
  testEmail,
  testWallet,
  waitForRow,
} from './fixtures';

function apiBase(): string {
  return process.env.E2E_API_URL ?? 'http://api:3000';
}

/**
 * Smoke chain only — proves frontend, API, DB, signature login, and mail login work end to end.
 * Navigates only to `/` so the route registry claim in specs/registry/smoke.ts stays accurate;
 * later lanes own the rest of the route tree.
 */
test.describe('e2e-stack smoke', () => {
  test('frontend loads, API assets, signature login, mail login', async ({ page }) => {
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
    // Root shell is present (body rendered). Title may vary by env; body content is the stable check.
    await expect(page.locator('body')).not.toBeEmpty();
    expect(pageErrors, `uncaught pageerror during load: ${pageErrors.join('; ')}`).toEqual([]);
    expect(consoleErrors, `console error during load: ${consoleErrors.join('; ')}`).toEqual([]);

    // 2) API assets list is non-empty.
    const assetRes = await fetch(`${apiBase()}/v1/asset`);
    expect(assetRes.ok, `GET /v1/asset status ${assetRes.status}`).toBe(true);
    const assets = (await assetRes.json()) as unknown[];
    expect(Array.isArray(assets), 'GET /v1/asset should return a JSON array').toBe(true);
    expect(assets.length, 'GET /v1/asset should be non-empty').toBeGreaterThan(0);

    // 3) Signature login -> DB user row -> session in browser on `/`.
    const wallet = testWallet();
    const jwt = await signatureLogin(wallet);
    await waitForRow('SELECT id, address, role FROM "user" WHERE address = $1', [wallet.address]);
    await gotoWithSession(page, '/', jwt);
    // gotoWithSession already asserted localStorage["dfx.authenticationToken"].
    // Additional page-level signal: token still present after hydration and body is non-empty.
    await page.waitForLoadState('networkidle');
    const tokenAfterSig = await page.evaluate(() => window.localStorage.getItem('dfx.authenticationToken'));
    expect(tokenAfterSig, 'signature session token should remain in localStorage').toBeTruthy();
    await expect(page.locator('body')).not.toBeEmpty();

    // 4) Mail login -> notification OTP path -> session -> user_data row.
    const email = testEmail('smoke');
    await requestMailLogin(email);
    const mailJwt = await completeMailLogin(email);
    await waitForRow('SELECT id, mail FROM user_data WHERE mail = $1', [email]);
    await gotoWithSession(page, '/', mailJwt);
    await page.waitForLoadState('networkidle');
    const tokenAfterMail = await page.evaluate(() => window.localStorage.getItem('dfx.authenticationToken'));
    expect(tokenAfterMail, 'mail session token should remain in localStorage').toBeTruthy();
    await expect(page.locator('body')).not.toBeEmpty();
  });
});
