import { expect, test } from '@playwright/test';

/**
 * Mail deep-link: customers open https://app.dfx.swiss/settings?a=call from the
 * verification-call mail. Without a session they are sent to /login; after login
 * they must return to /settings?a=call so the Verification Call section scrolls
 * into view (useAnchor).
 *
 * Full wallet login cannot be automated here. This spec covers the unauthenticated
 * hop and proves the memorized return path still carries `a=call` by opening the
 * mail-login tile in the same SPA session and inspecting the signInWithMail
 * redirectUri payload (ConnectMail builds it from AppHandlingContext.redirectPath).
 *
 * Does NOT cover:
 * - Completing wallet login and the post-login navigate(redirectPath) hop
 * - Actual scroll-into-view of the Verification Call block on settings
 * - Full magic-link mail login end-to-end
 */
test.describe('Mail deep-link a=call survives login redirect memory', () => {
  test('unauthenticated /settings?a=call → /login keeps a=call in redirectPath', async ({ page }) => {
    let capturedRedirectUri: string | undefined;

    await page.route('**/*', async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        try {
          const body = request.postDataJSON() as { redirectUri?: string; mail?: string } | null;
          if (body && typeof body.redirectUri === 'string' && body.mail) {
            capturedRedirectUri = body.redirectUri;
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({}),
            });
            return;
          }
        } catch {
          // not JSON / not the mail sign-in body — fall through
        }
      }
      await route.continue();
    });

    await page.goto('/settings?a=call');
    await page.waitForLoadState('networkidle');

    // Guard must send unauthenticated users to login.
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });

    // Same SPA session: open mail login so ConnectMail reads redirectPath.
    const mailTile = page.locator('img[src*="mail"]');
    await expect(mailTile.first()).toBeVisible({ timeout: 15000 });
    await mailTile.first().click();

    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible({ timeout: 10000 });
    await emailInput.fill('deeplink-probe@example.com');

    const submit = page.locator('button[type="submit"]');
    await expect(submit).toBeEnabled({ timeout: 5000 });
    await submit.click();

    await expect
      .poll(() => capturedRedirectUri, {
        timeout: 15000,
        message: 'signInWithMail should have been called with a redirectUri',
      })
      .toBeTruthy();

    expect(capturedRedirectUri).toContain('/settings');
    expect(capturedRedirectUri).toContain('a=call');
  });
});
