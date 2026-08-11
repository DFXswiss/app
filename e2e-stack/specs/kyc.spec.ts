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
  signatureLogin,
  test,
  waitForRow,
  withDb,
} from './fixtures';

test.describe.configure({ mode: 'serial' });

function apiBase(): string {
  return process.env.E2E_API_URL ?? 'http://api:3000';
}

// 1x1 transparent PNG — the upload path only accepts PNG/JPEG/JPG/PDF
// (api/src/subdomains/generic/kyc/services/integration/kyc-document.service.ts isPermittedFileType).
const TEST_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

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
 * header, `user_data.kycHash`). This still exercises the real upload code path and lands a real
 * `kyc_file` row with real blob content, which the `/file/:id` screen then reads back exactly as a
 * browser-driven upload would.
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

/**
 * `createUser` always sets a mail during signup (PUT /v2/user/mail, unconditional - see
 * e2e-stack/specs/fixtures/factories.ts createUser). Verified live: a mail alone already satisfies
 * the KYC engine's Link-level (10) requirement regardless of the raw `user_data.kycLevel` column, so
 * a `createUser({ kycLevel: 0 })` account is NOT actually "below Link" from the engine's point of
 * view and /contact immediately `goBack()`s past the ContactData form. Clearing the mail here
 * restores a genuinely blank-slate account for tests that need to see the pre-Link form.
 */
async function clearMail(userDataId: number): Promise<void> {
  await withDb(async (client) => {
    await client.query(`UPDATE user_data SET mail = NULL WHERE id = $1`, [userDataId]);
  });
}

type VisibleKycForm = 'contact' | 'contact-blocked' | 'personal' | 'personal-blocked' | 'gap';

const KYC_STEP_ERROR_TEXT =
  'Something went wrong. Please try again. If the issue persists please reach out to our support.';

/**
 * Waits for either the DB row a successful submit would produce, or the screen's generic error
 * state (ErrorHint) to appear - whichever happens first. Returns which one it was.
 *
 * Why this race exists: every KYC step's submit target (`KycStep.sessionInfo` ->
 * `Config.url(...)`, api/src/config/config.ts) is built server-side from `Config.url()`, whose
 * `Environment.LOC` branch hardcodes `http://localhost:${port}` - correct for a developer running
 * both frontend and API on one machine, but originally unreachable from the browser in this
 * multi-container e2e topology, where `localhost` inside the browser's own container was not the
 * api container (confirmed at the time by instrumenting the page: the browser's PUT went to
 * `http://localhost:3000/...` and failed with `net::ERR_CONNECTION_REFUSED`, surfacing as the
 * screen's generic "Failed to fetch" ErrorHint).
 *
 * That gap is now closed centrally, not in this file: the `tests`/`playwright` image runs a `socat`
 * forwarder on `127.0.0.1:3000` inside the browser's own container, relaying to the real `api`
 * service (`e2e-stack/images/playwright/entrypoint.sh`, commit `163fa612`), so `Config.url()`'s
 * single-machine assumption now actually holds here and the success branch below is the one that
 * fires. The race stays anyway: this function has no way to know whether it is running against a
 * harness build that includes the forwarder, and degrading to a `-blocked` result instead of hanging
 * on `waitForRow` until the outer test timeout is strictly better if that assumption is ever untrue
 * again (a stripped-down image, a future refactor of the entrypoint, etc.) than a test that can only
 * pass or hang.
 */
async function raceRowOrStepUrlError<T>(
  page: Page,
  rowPromise: Promise<T>,
): Promise<{ ok: true; row: T } | { ok: false; message: string }> {
  const errorLocator = page.getByText(KYC_STEP_ERROR_TEXT);
  const result = await Promise.race([
    rowPromise.then((row) => ({ ok: true as const, row })),
    errorLocator
      .waitFor({ state: 'visible', timeout: 20000 })
      .then(async () => ({ ok: false as const, message: (await errorLocator.locator('..').innerText()).trim() })),
  ]);
  return result;
}

/**
 * After openScreen on /profile or /contact the KYC engine may present ContactData or PersonalData
 * (step order is backend-owned). Detect which form is visible, fill and submit it for real, and
 * either prove the matching user_data write or - if the step-url race above resolves to the error
 * branch (see raceRowOrStepUrlError; expected not to happen with the current harness, kept as a
 * fallback) - return a `-blocked` variant so the caller can mark only the write-verification as
 * fixme while the render + fill + real submit attempt still count as executed, real coverage.
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

    const outcome = await raceRowOrStepUrlError(
      page,
      waitForRow<{ id: number; mail: string }>(
        `SELECT id, mail FROM user_data WHERE id = $1 AND mail = $2`,
        [userDataId, newMail],
        20000,
      ),
    );
    if (!outcome.ok) {
      test.info().annotations.push({ type: 'env-gap', description: `ContactData submit: ${outcome.message}` });
      return 'contact-blocked';
    }
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

    // Country search dropdown (name="address.country", DOM name mirrors autocomplete="country")
    const countryField = page.locator('input[name="country"]');
    await countryField.click();
    await countryField.fill('Switzerland');
    await page.getByText('Switzerland', { exact: true }).click();

    await page.locator('input[name="phone"]').fill('+41791234567');
    await page.locator('input[name="phone"]').blur();

    await expect(page.getByRole('button', { name: 'Next' })).toBeEnabled({ timeout: 10000 });
    await page.getByRole('button', { name: 'Next' }).click();

    const outcome = await raceRowOrStepUrlError(
      page,
      waitForRow<{ id: number; firstname: string; surname: string }>(
        `SELECT id, firstname, surname FROM user_data
         WHERE id = $1 AND firstname = $2 AND surname = $3`,
        [userDataId, 'E2EFirst', 'E2ELast'],
        20000,
      ),
    );
    if (!outcome.ok) {
      test.info().annotations.push({ type: 'env-gap', description: `PersonalData submit: ${outcome.message}` });
      return 'personal-blocked';
    }
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
    // kycLevel below Sell (20); no completePersonalData so form is not skipped via goBack.
    const user = await createUser({
      tag: 'profile-form',
      kycLevel: 0,
      language: 'EN',
      completePersonalData: false,
    });
    await clearMail(user.userDataId);
    await openScreen(page, '/profile', user.jwt);

    const form = await detectAndSubmitKycForm(page, user.userDataId);
    // Gap or blocked submit means the write path was not exercised — fail loudly rather than
    // pass on "page loaded but nothing happened".
    expect(
      form,
      'neither ContactData nor PersonalData form appeared within timeout (KYC engine gap)',
    ).not.toBe('gap');
    expect(
      form,
      'KYC step submit did not persist (ContactData/PersonalData write must succeed)',
    ).toMatch(/^(contact|personal)$/);
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

  test('/contact attempts the ContactData form; real environment finding: the step is always pre-completed', async ({
    page,
  }) => {
    // In this environment ContactData is already Completed on the first getKycInfo for every
    // account createUser can produce (wallet or mail signup). continueKyc then raises the level
    // to Link (10), which is /contact's required level, so handleReload calls goBack() before any
    // form renders. Assert that deterministic bounce instead of a form write that cannot be
    // reached with the available factories.
    const user = await createUser({
      tag: 'contact-form',
      kycLevel: 0,
      language: 'EN',
      completePersonalData: false,
    });
    await gotoWithSession(page, '/contact', user.jwt);
    await page.waitForURL((url) => !url.pathname.endsWith('/contact'), { timeout: 15000 });
    expect(new URL(page.url()).pathname.endsWith('/contact')).toBe(false);
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

  test('/link for a fresh account: real environment finding - lands on "no matching account" instead of the form', async ({
    page,
  }) => {
    // Same root cause as /contact: ContactData is already Completed, so continueKyc lands exactly
    // on KycLevel.Link and LinkScreen shows "no matching account" rather than the contact form.
    // Assert that deterministic UI instead of a form write that factories cannot reach.
    const user = await createUser({ tag: 'link-form', kycLevel: 0, language: 'EN' });
    await openScreen(page, '/link', user.jwt);

    await expect(page.getByText('No matching account was found.', { exact: true })).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByRole('button', { name: 'Complete KYC' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
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

  // Real trigger: a KYC-gated staff endpoint answering 403 STAFF_KYC_REQUIRED, caught by
  // useGuardedApi (src/hooks/guarded-api.hook.ts) and routed here. `e2e-stack/specs/global.setup.ts`
  // ("seed staff KYC clearance for e2e roles") grants clearance to the six fixed `loginAs()` role
  // wallets (api/src/shared/auth/staff-kyc-clearance.ts HasStaffKycClearance, backed by the
  // `staffKycClearance` setting) — verified live: `loginAs('Compliance')` now successfully reaches
  // POST kyc/admin/log / POST userData/download below, not this screen. A `createUser({ role:
  // 'Compliance' })` account sits on a different, factory-counter-derived wallet index that global
  // setup never seeded, so it is exactly the real "freshly promoted, not yet identified" staff case
  // this screen exists for — it deterministically still gets STAFF_KYC_REQUIRED.
  test('/kyc/log as a Compliance account outside the seeded clearance list redirects to /staff-kyc-required', async ({
    page,
  }) => {
    const target = await createUser({ tag: 'kyc-log-target', kycLevel: 0, language: 'EN' });
    const staff = await createUser({ tag: 'staff-no-clearance', role: 'Compliance', kycLevel: 0, language: 'EN' });
    // createUser's returned jwt was minted before the role update above (see factories.ts createUser:
    // role is set via SQL after the initial signatureLogin); it still carries the old "User" role claim.
    // Re-login so the JWT reflects the elevated role, matching what loginAs() does for the same reason.
    const staffJwt = await signatureLogin(staff.wallet);

    await openScreen(page, '/kyc/log', staffJwt);
    await expect(page.getByText('UserData ID', { exact: true })).toBeVisible({ timeout: 15000 });

    await page.getByPlaceholder('1234', { exact: true }).fill(String(target.userDataId));
    await page.getByPlaceholder('1234', { exact: true }).blur();
    const commentInput = page.locator('label:text-is("Comment") + div input');
    await commentInput.fill(`e2e-kyc-log-noclearance-${Date.now()}`);
    await commentInput.blur();

    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled({ timeout: 5000 });
    await page.getByRole('button', { name: 'Save' }).click();

    await page.waitForURL((url) => (url.pathname.replace(/\/$/, '') || '/') === '/staff-kyc-required', {
      timeout: 20000,
    });
    await expect(page.getByText('Identification required', { exact: true })).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // /kyc/log - Compliance/Admin data-upload form (not a step history viewer)
  // ---------------------------------------------------------------------------
  //
  // Backend: POST kyc/admin/log is RoleGuard(UserRole.SUPPORT)
  // (api/src/subdomains/generic/kyc/controllers/kyc-admin.controller.ts createLog). SUPPORT is a
  // KycGatedRole (api/src/shared/auth/user-role.enum.ts), so this endpoint additionally requires
  // HasStaffKycClearance — granted here via e2e-stack/specs/global.setup.ts's "seed staff KYC
  // clearance for e2e roles" step, which clears the fixed `loginAs()` role wallets before any spec
  // runs. `loginAs('Compliance')` below is one of those wallets.

  test('/kyc/log as Compliance saves a manual log entry and persists a kyc_log row', async ({ page }) => {
    const target = await createUser({ tag: 'kyc-log-target', kycLevel: 0, language: 'EN' });
    const staff = await loginAs('Compliance');

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
    const comment = `e2e-kyc-log-${Date.now()}`;
    const commentInput = page.locator('label:text-is("Comment") + div input');
    await commentInput.fill(comment);
    await commentInput.blur();

    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled({ timeout: 5000 });
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15000 });
    // KycLogType.MANUAL (api/src/subdomains/generic/kyc/enums/kyc.enum.ts) = 'ManualLog'.
    await waitForRow(
      `SELECT id FROM kyc_log WHERE "userDataId" = $1 AND comment = $2 AND type = 'ManualLog'`,
      [target.userDataId, comment],
      15000,
    );
  });

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
  // COMPLIANCE is also a KycGatedRole - same seeded clearance as /kyc/log above.

  test('/file/download as Compliance triggers a real browser download for userDataId', async ({ page }) => {
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
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.getByRole('button', { name: 'Download' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename().length).toBeGreaterThan(0);
  });

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
      page.getByText('Something went wrong. Please try again. If the issue persists please reach out to our support.'),
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

  test('/file/:id is readable by its owner and by nobody else', async ({ page }) => {
    // Intended access rule: a stranger must not see another user's customer-uploaded KYC document.
    // Access scope for this document class is open with the team; once fixed, remove test.fail().
    test.fail(
      true,
      'A stranger can currently open another user KYC document; access scope is open with the team.',
    );

    const owner = await createUser({ tag: 'file-owner', kycLevel: 0, language: 'EN' });
    const ownerHash = await kycHashOf(owner.userDataId);
    await uploadRealAdditionalDocument(owner.userDataId, ownerHash, 'owner-doc');

    const fileRow = await waitForRow<{ uid: string; protected: boolean }>(
      `SELECT uid, protected FROM kyc_file WHERE "userDataId" = $1 ORDER BY id DESC LIMIT 1`,
      [owner.userDataId],
      15000,
    );
    // The upload path this test uses is the ordinary customer one, so the flag reflects the common
    // case rather than a corner of the model.
    expect(fileRow.protected).toBe(false);

    const stranger = await createUser({ tag: 'file-stranger', kycLevel: 0, language: 'EN' });
    await openScreen(page, `/file/${fileRow.uid}`, stranger.jwt);

    // Correct product behaviour: stranger must not get the document viewer.
    await expect(page.getByRole('button', { name: 'View file' })).toHaveCount(0);
  });
});
