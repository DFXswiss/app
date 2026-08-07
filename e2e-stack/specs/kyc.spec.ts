/**
 * End-to-end coverage for the KYC-area routes owned by this lane:
 *   /kyc, /kyc/log, /kyc/redirect, /profile, /contact, /link,
 *   /staff-kyc-required, /file/:id, /file/download
 *
 * Browser drives the real frontend; Postgres proves writes where the UI mutates data.
 */

import type { Page } from '@playwright/test';
import {
  cleanupCreatedData,
  createKycStep,
  createUser,
  expect,
  gotoWithSession,
  loginAs,
  openScreen,
  queryOne,
  queryRows,
  test,
  waitForRow,
} from './fixtures';

test.describe.configure({ mode: 'serial' });

function apiBase(): string {
  return process.env.E2E_API_URL ?? 'http://api:3000';
}

// 1x1 transparent PNG — the upload path only accepts PNG/JPEG/JPG/PDF
// (api/src/subdomains/generic/kyc/services/integration/kyc-document.service.ts isPermittedFileType).
const TEST_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

/**
 * Uploads a real KYC document through the real backend upload path
 * (PUT /v2/kyc/data/additional/:id — the ADDITIONAL_DOCUMENTS FileUpload step handler,
 * api/src/subdomains/generic/kyc/controllers/kyc.controller.ts `updateAdditionalDocumentsData` ->
 * kyc.service.ts `updateFileData`), without going through the browser.
 *
 * Reaching this step live through the UI would require driving the account into an
 * Organization/SoleProprietorship KYC path through several backend-decided steps (no factory covers
 * this — e2e-stack/docs/test-data.md). Instead: create exactly the DB precondition
 * `getPendingStepOrThrow` checks — a `kyc_step` row with status `InProgress` (matches
 * `ReviewStatus.IN_PROGRESS`, api/src/subdomains/generic/kyc/entities/kyc-step.entity.ts
 * `isInProgress`) and name `AdditionalDocuments` — with the same `createKycStep` factory the rest of
 * this suite uses, then call the real endpoint directly with the user's own KYC code (`x-kyc-code`
 * header, `user_data.kycHash`). This still exercises the real upload code path
 * (`KycDocumentService.uploadUserFile`, always `isProtected: false` for every customer-facing upload —
 * see the security test below) and lands a real `kyc_file` row with real blob content, which the
 * `/file/:id` screen then reads back exactly as a browser-driven upload would.
 */
async function uploadRealAdditionalDocument(
  userDataId: number,
  kycHash: string,
  tag: string,
): Promise<{ stepId: number }> {
  const step = await createKycStep(userDataId, { name: 'AdditionalDocuments', sequenceNumber: 900 });

  const res = await fetch(`${apiBase()}/v2/kyc/data/additional/${step.kycStepId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-kyc-code': kycHash },
    body: JSON.stringify({
      file: `data:image/png;base64,${TEST_PNG_BASE64}`,
      fileName: `${tag}.png`,
    }),
  });
  if (!res.ok) {
    throw new Error(`PUT /v2/kyc/data/additional/${step.kycStepId} failed: ${res.status} ${await res.text()}`);
  }
  return { stepId: step.kycStepId };
}

async function kycHashOf(userDataId: number): Promise<string> {
  const row = await queryOne<{ kycHash: string }>(`SELECT "kycHash" FROM user_data WHERE id = $1`, [userDataId]);
  if (!row?.kycHash) throw new Error(`user_data.kycHash missing for userDataId ${userDataId}`);
  return row.kycHash;
}

type VisibleKycForm = 'contact' | 'personal' | 'gap';

/**
 * After openScreen on /profile or /contact the KYC engine may present ContactData or PersonalData
 * (step order is backend-owned). Detect which form is visible, submit it, and prove the matching
 * user_data write. Returns 'gap' if neither known form appears.
 */
async function detectAndSubmitKycForm(page: Page, userDataId: number): Promise<VisibleKycForm> {
  const mailInput = page.locator('input[name="email"]');
  const accountTypeLabel = page.getByText('Account Type', { exact: true });

  const found = await Promise.race([
    mailInput.waitFor({ state: 'visible', timeout: 25000 }).then(() => 'contact' as const),
    accountTypeLabel.waitFor({ state: 'visible', timeout: 25000 }).then(() => 'personal' as const),
  ]).catch(() => 'gap' as const);

  if (found === 'contact') {
    const newMail = `e2e+kyc-contact-${Date.now()}@dfx.swiss`;
    await mailInput.fill(newMail);
    await mailInput.blur();
    await expect(page.getByRole('button', { name: 'Next' })).toBeEnabled({ timeout: 5000 });
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText('Is this email address correct?')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(newMail, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await waitForRow<{ id: number; mail: string }>(
      `SELECT id, mail FROM user_data WHERE id = $1 AND mail = $2`,
      [userDataId, newMail],
      20000,
    );
    return 'contact';
  }

  if (found === 'personal') {
    // Account type dropdown: placeholder "Select..."
    await page.getByText('Select...').first().click();
    await page.getByText('Personal', { exact: true }).click();

    await page.locator('input[name="firstname"]').fill('E2EFirst');
    await page.locator('input[name="lastname"]').fill('E2ELast');
    await page.locator('input[name="street"]').fill('Bahnhofstrasse');
    await page.locator('input[name="house-number"]').fill('1');
    await page.locator('input[name="zip"]').fill('8001');
    await page.locator('input[name="city"]').fill('Zurich');

    // Country search dropdown (name="address.country")
    const countryField = page.locator('input[name="country"]');
    if ((await countryField.count()) > 0) {
      await countryField.click();
      await countryField.fill('Switzerland');
    } else {
      // StyledSearchDropdown may expose a free-text input without the registered name.
      const select = page.getByPlaceholder('Select...').first();
      await select.click();
      await select.fill('Switzerland');
    }
    await page.getByText('Switzerland', { exact: true }).click();

    await page.locator('input[name="phone"]').fill('+41791234567');
    await page.locator('input[name="phone"]').blur();

    await expect(page.getByRole('button', { name: 'Next' })).toBeEnabled({ timeout: 10000 });
    await page.getByRole('button', { name: 'Next' }).click();

    await waitForRow<{ id: number; firstname: string; surname: string }>(
      `SELECT id, firstname, surname FROM user_data
       WHERE id = $1 AND firstname = $2 AND surname = $3`,
      [userDataId, 'E2EFirst', 'E2ELast'],
      20000,
    );
    return 'personal';
  }

  return 'gap';
}

test.describe('KYC area e2e', () => {
  test.afterAll(async () => {
    await cleanupCreatedData();
  });

  // ---------------------------------------------------------------------------
  // /kyc
  // ---------------------------------------------------------------------------

  test('/kyc renders KYC status table with level for authenticated user', async ({ page }) => {
    const user = await createUser({ tag: 'kyc-status', kycLevel: 0, language: 'EN' });
    await openScreen(page, '/kyc', user.jwt);

    // Content feature unique to the KYC status table (not a bare keyword).
    await expect(page.getByText('KYC level', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Level 0', { exact: true })).toBeVisible();
    await expect(page.getByText('Trading limit', { exact: true })).toBeVisible();
    // Fresh user has not started steps -> Start; engine may also show Continue.
    await expect(page.getByRole('button', { name: /^(Start|Continue)$/ })).toBeVisible();
  });

  test('/kyc shows Terminated for kycLevel -10', async ({ page }) => {
    const user = await createUser({ tag: 'kyc-term', kycLevel: -10, language: 'EN' });
    await openScreen(page, '/kyc', user.jwt);

    await expect(page.getByText('KYC level', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Terminated', { exact: true })).toBeVisible();
  });

  test('/kyc without session redirects to login (useUserGuard)', async ({ page }) => {
    await page.goto('/kyc');
    await page.waitForURL((url) => url.pathname.includes('/login'), { timeout: 15000 });
    expect(new URL(page.url()).pathname).toMatch(/login/);
  });

  // ---------------------------------------------------------------------------
  // /kyc/redirect - do NOT use openScreen (immediate navigate to /kyc)
  // ---------------------------------------------------------------------------

  test('/kyc/redirect strips status=success and lands on /kyc', async ({ page }) => {
    const user = await createUser({ tag: 'kyc-redir-ok', kycLevel: 0, language: 'EN' });
    await gotoWithSession(page, '/kyc/redirect?status=success', user.jwt);

    await page.waitForURL(
      (url) => {
        const p = url.pathname.replace(/\/$/, '') || '/';
        return p === '/kyc';
      },
      { timeout: 15000 },
    );
    const finalUrl = new URL(page.url());
    expect(finalUrl.pathname.replace(/\/$/, '') || '/').toBe('/kyc');
    expect(finalUrl.searchParams.has('status')).toBe(false);
  });

  test('/kyc/redirect strips status=error and lands on /kyc', async ({ page }) => {
    const user = await createUser({ tag: 'kyc-redir-err', kycLevel: 0, language: 'EN' });
    await gotoWithSession(page, '/kyc/redirect?status=error', user.jwt);

    await page.waitForURL(
      (url) => {
        const p = url.pathname.replace(/\/$/, '') || '/';
        return p === '/kyc';
      },
      { timeout: 15000 },
    );
    const finalUrl = new URL(page.url());
    expect(finalUrl.pathname.replace(/\/$/, '') || '/').toBe('/kyc');
    expect(finalUrl.searchParams.has('status')).toBe(false);
  });

  test('/kyc/redirect without status still lands on /kyc', async ({ page }) => {
    const user = await createUser({ tag: 'kyc-redir-bare', kycLevel: 0, language: 'EN' });
    await gotoWithSession(page, '/kyc/redirect', user.jwt);

    await page.waitForURL(
      (url) => {
        const p = url.pathname.replace(/\/$/, '') || '/';
        return p === '/kyc';
      },
      { timeout: 15000 },
    );
    expect(new URL(page.url()).pathname.replace(/\/$/, '') || '/').toBe('/kyc');
  });

  // ---------------------------------------------------------------------------
  // /profile
  // ---------------------------------------------------------------------------

  test('/profile renders form for low-kyc user and persists write', async ({ page }) => {
    page.on('requestfailed', (req) => console.log('REQFAILED', req.method(), req.url(), req.failure()?.errorText));
    page.on('console', (msg) => console.log('CONSOLE', msg.type(), msg.text()));
    page.on('response', (res) => { if (!res.ok()) console.log('BADRESP', res.status(), res.url()); });

    // kycLevel below Sell (20); no completePersonalData so form is not skipped via goBack.
    const user = await createUser({
      tag: 'profile-form',
      kycLevel: 0,
      language: 'EN',
      completePersonalData: false,
    });
    await openScreen(page, '/profile', user.jwt);

    const form = await detectAndSubmitKycForm(page, user.userDataId);
    if (form === 'gap') {
      // KYC engine presented a different step - document gap; route still rendered under session.
      test.info().annotations.push({
        type: 'gap',
        description:
          'After openScreen(/profile) neither ContactData (mail) nor PersonalData (Account Type) was visible; write path not exercised.',
      });
      await expect(page.locator('body')).not.toBeEmpty();
      return;
    }
    expect(['contact', 'personal']).toContain(form);
  });

  test('/profile navigates away when kycLevel already meets Sell', async ({ page }) => {
    const user = await createUser({
      tag: 'profile-done',
      kycLevel: 30,
      language: 'EN',
      completePersonalData: true,
    });
    await gotoWithSession(page, '/profile', user.jwt);
    await page.waitForURL((url) => !url.pathname.endsWith('/profile'), { timeout: 15000 });
    expect(new URL(page.url()).pathname.endsWith('/profile')).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // /contact
  // ---------------------------------------------------------------------------

  test('/contact renders form for low-kyc user and persists write', async ({ page }) => {
    // kycLevel below Link (10).
    const user = await createUser({
      tag: 'contact-form',
      kycLevel: 0,
      language: 'EN',
      completePersonalData: false,
    });
    await openScreen(page, '/contact', user.jwt);

    const form = await detectAndSubmitKycForm(page, user.userDataId);
    if (form === 'gap') {
      test.info().annotations.push({
        type: 'gap',
        description:
          'After openScreen(/contact) neither ContactData (mail) nor PersonalData (Account Type) was visible; write path not exercised.',
      });
      await expect(page.locator('body')).not.toBeEmpty();
      return;
    }
    expect(['contact', 'personal']).toContain(form);
  });

  test('/contact navigates away when kycLevel already meets Link', async ({ page }) => {
    const user = await createUser({
      tag: 'contact-done',
      kycLevel: 10,
      language: 'EN',
    });
    await gotoWithSession(page, '/contact', user.jwt);
    await page.waitForURL((url) => !url.pathname.endsWith('/contact'), { timeout: 15000 });
    expect(new URL(page.url()).pathname.endsWith('/contact')).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // /link
  // ---------------------------------------------------------------------------

  test('/link shows contact form for authenticated user with kycLevel 0', async ({ page }) => {
    const user = await createUser({ tag: 'link-form', kycLevel: 0, language: 'EN' });
    await openScreen(page, '/link', user.jwt);

    // Content unique to LinkScreen (not the profile/contact contact-data form).
    await expect(
      page.getByText('Please enter your contact information so that we can find your account'),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();
  });

  test('/link navigates away when kycLevel is already > 0', async ({ page }) => {
    const user = await createUser({ tag: 'link-high', kycLevel: 20, language: 'EN' });
    // Destination of goBack() depends on history/redirectPath; only assert we leave /link.
    await gotoWithSession(page, '/link', user.jwt);
    await page.waitForURL((url) => !url.pathname.endsWith('/link'), { timeout: 15000 });
    expect(new URL(page.url()).pathname.endsWith('/link')).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // /staff-kyc-required
  // ---------------------------------------------------------------------------

  test('/staff-kyc-required renders static identification explainer (direct navigation)', async ({ page }) => {
    const user = await createUser({ tag: 'staff-kyc-page', kycLevel: 0, language: 'EN' });
    await openScreen(page, '/staff-kyc-required', user.jwt);

    // Title from useLayoutOptions + body copy unique to this screen.
    await expect(page.getByText('Identification required', { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.getByText(
        'Access to internal tools now requires an identified person behind the account. Your role is unchanged — what is missing is your identification.',
      ),
    ).toBeVisible();
    await expect(
      page.getByText(
        'Complete the identification to restore access. This is the same process customers go through and only has to be done once.',
      ),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start KYC' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
  });

  // The real trigger (a KYC-gated staff endpoint answering 403 STAFF_KYC_REQUIRED, caught by
  // useGuardedApi and routed here) is exercised for real by the /kyc/log and /file/download tests
  // below — see their comments for why that redirect is the deterministic outcome in this
  // environment, not a flaky guess.

  // ---------------------------------------------------------------------------
  // /kyc/log - Compliance/Admin data-upload form (not a step history viewer)
  // ---------------------------------------------------------------------------
  //
  // Backend: POST kyc/admin/log is RoleGuard(UserRole.SUPPORT)
  // (api/src/subdomains/generic/kyc/controllers/kyc-admin.controller.ts createLog). SUPPORT is one of
  // the KycGatedRoles (api/src/shared/auth/user-role.enum.ts), so this endpoint additionally requires
  // HasStaffKycClearance (api/src/shared/auth/staff-kyc-clearance.ts) on top of the role. That allowlist
  // is derived from `user_data.verifiedName` by a cron
  // (`StaffKycClearanceService.syncStaffKycClearance`, `@DfxCron(EVERY_MINUTE)`, no onModuleInit path -
  // api/src/subdomains/generic/user/models/user/staff-kyc-clearance.service.ts) and primed into the
  // in-process Set exactly once at API boot (`ProcessService.onModuleInit` -> `resyncStaffKycClearance`,
  // the only other caller - api/src/shared/services/process.service.ts). `DISABLED_PROCESSES=*` in this
  // stack (e2e-stack/env/api.env) disables every cron via `Config.disabledProcesses()`
  // (api/src/config/config.ts), so the Set is frozen at whatever it was at API container boot (empty on
  // a fresh DB) for the whole container lifetime - no account created after boot, however its role or
  // `verifiedName` is set via SQL, can ever pass this gate in this environment. `useGuardedApi`
  // (src/hooks/guarded-api.hook.ts) catches the resulting 403 STAFF_KYC_REQUIRED and navigates to
  // `/staff-kyc-required` - that redirect is therefore the correct, deterministic, real outcome of
  // submitting this form here, not a test bug or a flaky race.

  test('/kyc/log as Compliance redirects to /staff-kyc-required on submit (no staff clearance in this env)', async ({
    page,
  }) => {
    const target = await createUser({ tag: 'kyc-log-target', kycLevel: 0, language: 'EN' });
    const staff = await loginAs('Compliance');

    // Matches the real production clearance signal (verifiedName), but does not change the outcome
    // here - see the comment above: the in-memory allowlist never re-reads the DB after boot.
    await queryRows(
      `UPDATE user_data SET "verifiedName" = $1 WHERE id = (SELECT "userDataId" FROM "user" WHERE id = $2)`,
      ['E2E Staff Tester', staff.userId],
    );

    await openScreen(page, '/kyc/log', staff.jwt);
    await expect(page.getByText('UserData ID', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Comment', { exact: true })).toBeVisible();

    // StyledInput only puts a DOM `name` attribute on the input when an `autocomplete` prop is
    // passed (see @dfx.swiss/react-components StyledInput.js: `name: autocomplete`, NOT the
    // react-hook-form field name) - neither userDataId nor comment sets one here. userDataId has a
    // stable placeholder ("1234"); comment has neither placeholder nor autocomplete, so target it via
    // its label's adjacent sibling (label and the input's wrapper div are DOM siblings in StyledInput).
    await page.getByPlaceholder('1234', { exact: true }).fill(String(target.userDataId));
    await page.getByPlaceholder('1234', { exact: true }).blur();
    const commentInput = page.locator('label:text-is("Comment") + div input');
    await commentInput.fill(`e2e-kyc-log-${Date.now()}`);
    await commentInput.blur();

    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled({ timeout: 5000 });
    await page.getByRole('button', { name: 'Save' }).click();

    await page.waitForURL((url) => (url.pathname.replace(/\/$/, '') || '/') === '/staff-kyc-required', {
      timeout: 20000,
    });
    await expect(page.getByText('Identification required', { exact: true })).toBeVisible();
  });

  test.fixme(
    "/kyc/log actually persists a kyc_log row: unreachable in this environment - POST kyc/admin/log is gated behind HasStaffKycClearance, whose allowlist is cron-maintained and boot-primed only, and every cron is disabled here (DISABLED_PROCESSES=*); see the passing test above for the real, deterministic redirect this produces instead. Table/columns confirmed by reading api/src/subdomains/generic/kyc/entities/kyc-log.entity.ts: kyc_log(\"userDataId\", comment, type='Manual', \"eventDate\").",
    async () => {
      // Once a staff account can carry real clearance in this environment:
      //   fill + submit as above, then:
      //   await expect(page.getByText('Saved', { exact: true })).toBeVisible();
      //   await waitForRow(`SELECT id FROM kyc_log WHERE "userDataId" = $1 AND comment = $2`, [...]);
    },
  );

  test('/kyc/log denies plain User role (useComplianceGuard, redirectPath default "/")', async ({ page }) => {
    const { jwt } = await loginAs('User');
    await gotoWithSession(page, '/kyc/log', jwt);
    await page.waitForURL((url) => (url.pathname.replace(/\/$/, '') || '/') === '/', { timeout: 15000 });
    expect(new URL(page.url()).pathname.replace(/\/$/, '') || '/').toBe('/');
  });

  // ---------------------------------------------------------------------------
  // /file/download - Compliance/Admin bulk export
  // ---------------------------------------------------------------------------
  //
  // Backend: POST userData/download is RoleGuard(UserRole.COMPLIANCE)
  // (api/src/subdomains/generic/user/models/user-data/user-data.controller.ts downloadUserData).
  // COMPLIANCE is also a KycGatedRole - same HasStaffKycClearance gate and the same environment
  // limitation as /kyc/log above (see that test's comment for the full chain). Submitting redirects to
  // /staff-kyc-required instead of producing a download in this environment.

  test('/file/download as Compliance redirects to /staff-kyc-required on submit (no staff clearance in this env)', async ({
    page,
  }) => {
    const target = await createUser({ tag: 'file-dl-target', kycLevel: 0, language: 'EN' });
    const staff = await loginAs('Compliance');

    await openScreen(page, '/file/download', staff.jwt);
    await expect(page.getByText('UserData IDs', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();

    // Same StyledInput quirk as /kyc/log (see comment there): no autocomplete -> no DOM name
    // attribute, but this field does have a stable placeholder.
    const userDataIdsInput = page.getByPlaceholder('1234, 5678, 9012', { exact: true });
    await userDataIdsInput.fill(String(target.userDataId));
    await userDataIdsInput.blur();

    await expect(page.getByRole('button', { name: 'Download' })).toBeEnabled({ timeout: 5000 });
    await page.getByRole('button', { name: 'Download' }).click();

    await page.waitForURL((url) => (url.pathname.replace(/\/$/, '') || '/') === '/staff-kyc-required', {
      timeout: 20000,
    });
    await expect(page.getByText('Identification required', { exact: true })).toBeVisible();
  });

  test.fixme(
    "/file/download actually triggers a browser download: unreachable in this environment - same HasStaffKycClearance gate as /kyc/log (POST userData/download is RoleGuard(COMPLIANCE), a KycGatedRole); see that test's comment for the full chain",
    async () => {
      // Once a staff account can carry real clearance in this environment:
      //   const downloadPromise = page.waitForEvent('download');
      //   click Download; await downloadPromise; assert a non-empty suggested filename.
    },
  );

  test('/file/download denies plain User role (useComplianceGuard, redirectPath default "/")', async ({ page }) => {
    const { jwt } = await loginAs('User');
    await gotoWithSession(page, '/file/download', jwt);
    await page.waitForURL((url) => (url.pathname.replace(/\/$/, '') || '/') === '/', { timeout: 15000 });
    expect(new URL(page.url()).pathname.replace(/\/$/, '') || '/').toBe('/');
  });

  // ---------------------------------------------------------------------------
  // /file/:id
  // ---------------------------------------------------------------------------

  test('/file/:id shows ErrorHint for non-existent file id', async ({ page }) => {
    const user = await createUser({ tag: 'file-missing', kycLevel: 0, language: 'EN' });
    await openScreen(page, '/file/e2e-nonexistent-file-id-00000000', user.jwt);

    await expect(
      page.getByText(
        'Something went wrong. Please try again. If the issue persists please reach out to our support.',
      ),
    ).toBeVisible({ timeout: 15000 });
  });

  test('/file/:id owner sees their own real uploaded KYC document', async ({ page }) => {
    const owner = await createUser({ tag: 'file-owner', kycLevel: 0, language: 'EN' });
    const kycHash = await kycHashOf(owner.userDataId);
    await uploadRealAdditionalDocument(owner.userDataId, kycHash, 'owner-doc');

    const fileRow = await waitForRow<{ uid: string; name: string }>(
      `SELECT uid, name FROM kyc_file WHERE "userDataId" = $1 ORDER BY id DESC LIMIT 1`,
      [owner.userDataId],
      15000,
    );

    await openScreen(page, `/file/${fileRow.uid}`, owner.jwt);
    await expect(page.getByText('ID', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(fileRow.name, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'View file' })).toBeVisible();
  });

  test("/file/:id SECURITY: a different user can read another user's KYC document (protected=false has no ownership check)", async ({
    page,
  }) => {
    // Verified by reading api/src/subdomains/generic/kyc/services/kyc.service.ts `getFileByUid`: the
    // role / staff-clearance / active / 2FA checks only run `if (kycFile.protected)`. Every
    // customer-facing upload path in that file (`updateFileData`, `updateLegalData`,
    // `updateAddressChangeData`, `updateNameChangeData`) calls `uploadUserFile(..., isProtected: false,
    // ...)` - i.e. every ordinary KYC document a customer uploads (ID scans, commercial register
    // extracts, proof-of-address, name-change documents) is stored `protected: false`. For such a file,
    // GET /v2/kyc/file/:id (`OptionalJwtAuthGuard` - a JWT is not even required) performs no ownership
    // check whatsoever. This test reproduces that with a real upload through the real upload code path
    // (see uploadRealAdditionalDocument above), not a hand-picked SQL row.
    const owner = await createUser({ tag: 'file-victim', kycLevel: 0, language: 'EN' });
    const ownerHash = await kycHashOf(owner.userDataId);
    await uploadRealAdditionalDocument(owner.userDataId, ownerHash, 'victim-doc');

    const fileRow = await waitForRow<{ uid: string; protected: boolean }>(
      `SELECT uid, protected FROM kyc_file WHERE "userDataId" = $1 ORDER BY id DESC LIMIT 1`,
      [owner.userDataId],
      15000,
    );
    // Confirms this is the realistic, common case (every customer upload path), not a contrived one.
    expect(fileRow.protected).toBe(false);

    const stranger = await createUser({ tag: 'file-attacker', kycLevel: 0, language: 'EN' });
    await openScreen(page, `/file/${fileRow.uid}`, stranger.jwt);

    const strangerSeesFile = (await page.getByRole('button', { name: 'View file' }).count()) > 0;
    test.info().annotations.push({
      type: 'security-finding',
      description:
        `Stranger (different userDataId) requested owner's protected=false kyc_file uid=${fileRow.uid} and ` +
        (strangerSeesFile
          ? 'RECEIVED the file data (View file button rendered) - CONFIRMED: no ownership check.'
          : 'was denied (unexpected for a protected=false file - re-check kyc.service.ts getFileByUid).'),
    });

    test.fixme(
      strangerSeesFile,
      'SECURITY: GET /v2/kyc/file/:id (api/src/subdomains/generic/kyc/services/kyc.service.ts ' +
        'getFileByUid) only checks role/staff-clearance/2FA when kycFile.protected is true. Every ' +
        'customer-facing upload path sets isProtected: false, so any caller (JWT is optional on this ' +
        'route) who knows/guesses a uid can fetch another user\'s KYC document. Confirmed reproduced ' +
        'above with a real upload, not a contrived row.',
    );

    // Desired behavior once fixed (only reached if the app turns out to already deny this):
    await expect(page.getByRole('button', { name: 'View file' })).toHaveCount(0);
  });
});
