/**
 * Partner dashboard e2e — owns:
 *   /partner/dashboard
 *
 * Not covered (by design / environment limits):
 * - Positive case (role NonCustodialWalletPartner sees the dashboard): the API does not yet
 *   grant that role (DFXswiss/api#4587 unmerged). Covered instead by the mocked Handbook e2e
 *   (e2e/partner-dashboard.spec.ts).
 */

import { expect, gotoWithSession, normPath, test } from './fixtures';
import { cleanupCreatedData, createUser } from './fixtures/factories';

test.describe('Partner dashboard e2e', () => {
  test.afterAll(async () => {
    await cleanupCreatedData();
  });

  test('plain User role is denied /partner/dashboard', async ({ page }) => {
    const user = await createUser({ tag: 'partner-dash-guard', language: 'EN' });

    await gotoWithSession(page, '/partner/dashboard', user.jwt);
    await page.waitForLoadState('networkidle');

    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'User must be redirected away from /partner/dashboard',
        timeout: 15000,
      })
      .not.toBe(normPath('/partner/dashboard'));
  });
});
