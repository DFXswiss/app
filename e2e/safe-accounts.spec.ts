import { expect, test } from '@playwright/test';
import { getCachedAuth } from './helpers/auth-cache';

/**
 * E2E Visual Regression Tests: DFX Safe account switcher
 *
 * Covers the states that only exist once a user can reach more than one Safe. The
 * single-account and legacy cases are covered by `safe.spec.ts` and are deliberately not
 * repeated here — the switcher is not rendered at all in those.
 *
 * Requires a local dataset with three reachable accounts: one owned (write), one shared
 * read-only, and one shared with a write mandate. The last one matters: a write mandate
 * can transact, because orders now hit the account resource. Not a CI regression gate —
 * see CONTRIBUTING.md.
 */

test.describe('DFX Safe - Account switcher', () => {
  // The Safe scrolls inside an overflow-auto container, so `fullPage` still only captures the
  // viewport. A taller viewport puts portfolio, holdings and activity on one image.
  test.use({ viewport: { width: 1280, height: 1250 } });

  let token: string;

  test.beforeAll(async ({ request }) => {
    const auth = await getCachedAuth(request, 'evm');
    token = auth.token;
  });

  test('switching between an owned and a shared account', async ({ page }) => {
    const screenshotOpts = { fullPage: true, maxDiffPixels: 200, timeout: 10000 } as const;

    // The statement dialog prefills today's date, which would otherwise bake a moving value
    // into the committed baseline.
    await page.clock.setFixedTime(new Date('2026-06-15T12:00:00Z'));

    // ========================================
    // STEP 1: the owned account, preselected
    // ========================================
    await page.goto(`/safe?session=${token}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Portfolio' })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('My Safe')).toBeVisible({ timeout: 15000 });

    // The owned account allows acting, so the transaction area is offered.
    await expect(page.getByRole('button', { name: 'Deposit', exact: true })).toBeVisible();

    await expect(page).toHaveScreenshot('01-account-owned.png', screenshotOpts);

    // ========================================
    // STEP 2: the picker, listing both reachable accounts
    // ========================================
    await page.getByText('My Safe').first().click();
    await expect(page.getByText('Example Partner AG')).toBeVisible({ timeout: 10000 });

    await expect(page).toHaveScreenshot('02-account-picker-open.png', screenshotOpts);

    // ========================================
    // STEP 3: a shared account, held by inspection only
    // ========================================
    await page.getByText('Example Partner AG').click();
    await page.waitForLoadState('networkidle');

    // The decisive assertion of this file: inspection must not offer any way to act. The
    // buttons are absent, not merely disabled.
    await expect(page.getByRole('button', { name: 'Deposit', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Withdraw', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Swap', exact: true })).toHaveCount(0);
    await expect(page.getByText('View only').first()).toBeVisible();

    await expect(page).toHaveScreenshot('03-account-shared-read-only.png', screenshotOpts);

    // ========================================
    // STEP 4: a shared account held under a write mandate
    // ========================================
    await page.getByText('Example Partner AG').first().click();
    await expect(page.getByText('Example Mandate AG')).toBeVisible({ timeout: 10000 });
    await page.getByText('Example Mandate AG').click();
    await page.waitForLoadState('networkidle');

    // Write mandate can transact: orders hit the account resource.
    await expect(page.getByRole('button', { name: 'Deposit', exact: true })).toBeVisible();
    await expect(page.getByText('View only')).toHaveCount(0);

    // Baseline follows; visuals are not a CI gate.
    await expect(page).toHaveScreenshot('04-account-shared-write-mandate.png', screenshotOpts);
  });
});
