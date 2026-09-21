import { test, expect, Page } from '@playwright/test';
import { randomBytes } from 'crypto';
import { completeMailLogin, requestMailLogin } from '../e2e-stack/specs/fixtures/mail';
import { TEST_IBAN } from '../e2e-stack/specs/fixtures/test-data';

/**
 * E2E Visual Regression Tests: Add bank account on a mail-only (KycOnly) account
 *
 * Route:
 *   - /settings  (Your Bank Accounts → add → IBAN rejected because no wallet is linked)
 *
 * Runs against a real local API and its database (see CONTRIBUTING.md, "Visual regression
 * tests"). The account is created the way it is in production: a mail login without a wallet
 * address, which leaves the account KycOnly. The one-time login code is read from the API's
 * notification table by the full-stack harness fixture, so no mail service is involved.
 *
 * Required environment (in addition to REACT_APP_API_URL for the frontend):
 *   E2E_API_URL        API base URL, e.g. http://localhost:3000
 *   E2E_FRONTEND_URL   Frontend base URL, e.g. http://localhost:3001
 *   E2E_PG_HOST / E2E_PG_PORT / E2E_PG_USER / E2E_PG_PASSWORD / E2E_PG_DATABASE
 *                      the local API database
 * and the harness dependencies installed (`npm ci --prefix e2e-stack`).
 *
 * Synthetic data only: a random example.com address (not shown on this screen) and the public
 * Swiss sample IBAN.
 */

async function openAddBankAccountAsMailOnlyUser(page: Page, lang: string): Promise<void> {
  const email = `kyc-only-${randomBytes(4).toString('hex')}@example.com`;
  await requestMailLogin(email);
  const session = await completeMailLogin(email);

  await page.goto(`/settings?session=${encodeURIComponent(session)}&lang=${lang}`);
  const addButton = page.getByRole('heading', { name: /Bank/ }).getByRole('button');
  await expect(addButton).toBeVisible({ timeout: 15_000 });
  await addButton.click();

  await page.getByPlaceholder('XX XXXX XXXX XXXX XXXX X').fill(TEST_IBAN);
  await page.locator('form').getByRole('button').last().click();
}

test.describe('Settings add bank account on a mail-only account - Visual Regression Tests', () => {
  test('shows the wallet hint with a connect link (EN)', async ({ page }) => {
    await openAddBankAccountAsMailOnlyUser(page, 'en');

    await expect(
      page.getByText('A bank account can only be added once a wallet is linked to this account.'),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Connect your wallet', { exact: true })).toBeVisible();
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('settings-add-bank-account-kyc-only-01-en.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });

  test('shows the wallet hint with a connect link (DE)', async ({ page }) => {
    await openAddBankAccountAsMailOnlyUser(page, 'de');

    await expect(
      page.getByText('Ein Bankkonto kann erst hinzugefügt werden, wenn eine Wallet mit diesem Konto verknüpft ist.'),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Verbinde Deine Wallet', { exact: true })).toBeVisible();
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('settings-add-bank-account-kyc-only-02-de.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });
});
