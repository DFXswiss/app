import { test, expect } from '@playwright/test';
import { gotoWithSession, loginAs } from '../e2e-stack/specs/fixtures/auth';

/**
 * E2E Visual Regression Tests: Partner onboarding fee
 *
 * Route:
 *   - /partner/onboarding-fee (Partner only)
 *
 * Runs against a real local API (see CONTRIBUTING.md, "Visual regression tests"). The screen loads
 * the suggested fee amounts from the API, so the account must be a Partner: the fixture logs in the
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
 * The screenshots capture the empty form and the same form with an out-of-range amount: no customer
 * address is entered and no fee is assigned, so the run changes no customer data.
 */

const REQUIRED_ENV = ['E2E_API_URL', 'E2E_FRONTEND_URL', 'E2E_PG_HOST', 'E2E_PG_PASSWORD'];

test.describe('Partner onboarding fee - Visual Regression Tests', () => {
  test.beforeAll(() => {
    const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
    if (missing.length) throw new Error(`Set ${missing.join(', ')} to point this spec at the local API`);
  });

  test('shows the empty assign and remove forms and the range rule for an invalid amount (EN)', async ({ page }) => {
    const { jwt } = await loginAs('Partner');
    await gotoWithSession(page, '/partner/onboarding-fee?lang=en', jwt);

    await expect(page.getByText('Assign onboarding fee', { exact: true })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Remove onboarding fee', { exact: true })).toBeVisible();

    // The suggested amounts appear as quick picks once they arrived; wait for them so the
    // screenshot does not race the load.
    const assign = page.locator('section').filter({ hasText: 'Assign onboarding fee' });
    await expect(assign.getByRole('group', { name: 'Suggested amounts' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: 'Assign', exact: true })).toBeDisabled();
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('partner-onboarding-fee-01-en.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });

    // An out-of-range amount: the rule runs once the field is left, so the field is blurred before
    // the capture. StyledInput does not put its `name` on the DOM input, so the field is found from
    // its label (the nearest ancestor that holds an input).
    const amountInput = assign
      .getByText('Onboarding fee (CHF)', { exact: true })
      .first()
      .locator('xpath=ancestor::*[.//input][1]')
      .locator('input')
      .first();
    await amountInput.fill('0');
    await amountInput.blur();

    // The upper bound carries the Swiss thousands separator, whose character depends on the
    // browser's locale data, so only its position is fixed here.
    await expect(page.getByText(/^Enter a whole CHF amount between 1 and 1.000.000\.$/)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole('button', { name: 'Assign', exact: true })).toBeDisabled();
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('partner-onboarding-fee-02-invalid-amount-en.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });
});
