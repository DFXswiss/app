import { test, expect } from '@playwright/test';
import { gotoWithSession, loginAs } from '../e2e-stack/specs/fixtures/auth';

/**
 * E2E Visual Regression Tests: Partner onboarding fee
 *
 * Route:
 *   - /partner/onboarding-fee (Partner only)
 *
 * Runs against a real local API (see CONTRIBUTING.md, "Visual regression tests"). The screen loads
 * the fixed fee list from the API, so the account must be a Partner: the fixture logs in the
 * deterministic Partner wallet and elevates its DB role.
 *
 * Required environment (in addition to REACT_APP_API_URL for the frontend):
 *   E2E_API_URL        API base URL, e.g. http://localhost:3000
 *   E2E_FRONTEND_URL   Frontend base URL, e.g. http://localhost:3001
 *   E2E_PG_HOST        host of the local API database, e.g. localhost
 *   E2E_PG_PASSWORD    password of the local API database
 * Optional: E2E_PG_PORT / E2E_PG_USER / E2E_PG_DATABASE (harness defaults 5432 / sa / dfx).
 * The harness dependencies must be installed (`npm ci --prefix e2e-stack`).
 *
 * The screenshot captures the empty form only: no customer address is entered and no fee is
 * assigned, so the run changes no customer data.
 */

const REQUIRED_ENV = ['E2E_API_URL', 'E2E_FRONTEND_URL', 'E2E_PG_HOST', 'E2E_PG_PASSWORD'];

test.describe('Partner onboarding fee - Visual Regression Tests', () => {
  test.beforeAll(() => {
    const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
    if (missing.length) throw new Error(`Set ${missing.join(', ')} to point this spec at the local API`);
  });

  test('shows the empty assign and remove forms (EN)', async ({ page }) => {
    const { jwt } = await loginAs('Partner');
    await gotoWithSession(page, '/partner/onboarding-fee?lang=en', jwt);

    await expect(page.getByText('Assign onboarding fee', { exact: true })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Remove onboarding fee', { exact: true })).toBeVisible();

    // The trigger stays disabled until the fixed fee list arrived; wait for that state so the
    // screenshot does not race the load.
    const assign = page.locator('section').filter({ hasText: 'Assign onboarding fee' });
    await expect(assign.locator('#dropDownButton')).toBeEnabled({ timeout: 20000 });
    await expect(page.getByRole('button', { name: 'Assign', exact: true })).toBeDisabled();
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('partner-onboarding-fee-01-en.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });
});
