/**
 * App 2.0 KYC steps and external-return screens against the local full-stack harness.
 * The browser uses the real App2 bundle and API; Postgres confirms persisted state.
 * Sumsub and Checkout.com are external providers and are not represented as live here.
 */

import { expect, gotoWithSession, test, waitForRow, withDb } from './fixtures';
import { cleanupCreatedData, createKycStep, createUser, e2eMail } from './fixtures/factories';

interface KycWrite {
  url: string;
  body: unknown;
  status?: number;
}

function captureKycWrite(page: import('@playwright/test').Page): { getAll: () => KycWrite[] } {
  const writes: KycWrite[] = [];
  page.on('requestfinished', async (request) => {
    const url = request.url();
    if (request.method() !== 'PUT' || !new URL(url).pathname.includes('/kyc/')) return;
    const response = await request.response();
    let body: unknown;
    try {
      body = request.postDataJSON();
    } catch {
      body = undefined;
    }
    writes.push({ url, body, status: response?.status() });
  });
  return { getAll: () => [...writes] };
}

async function openApp2(
  page: import('@playwright/test').Page,
  jwt: string,
  hash: string,
  query: Record<string, string> = {},
): Promise<void> {
  const params = new URLSearchParams({ session: jwt, ...query });
  const url = `/app2/?${params.toString()}${hash}`;
  const response = await page.goto(url);
  // Never include the query string in a failure message: it contains the session JWT.
  const diagnosticRoute = `/app2/${hash.split('?')[0]}`;
  expect(response?.ok(), `${diagnosticRoute} status ${response?.status()}`).toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('dfx.authenticationToken')))
    .toBe(jwt);
}

async function fillPersonalData(
  page: import('@playwright/test').Page,
  firstName: string,
  lastName: string,
): Promise<void> {
  await expect(page.locator('input[autocomplete="given-name"]')).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: /^continue$/i })).toBeDisabled();
  await page.locator('input[autocomplete="given-name"]').fill(firstName);
  await page.locator('input[autocomplete="family-name"]').fill(lastName);
  await page.locator('input[autocomplete="street-address"]').fill('Bahnhofstrasse');
  await page.getByPlaceholder(/no\./i).fill('12');
  await page.locator('input[autocomplete="postal-code"]').fill('8001');
  await page.locator('input[autocomplete="address-level2"]').fill('Zurich');
  await page.getByRole('combobox', { name: /^country$/i }).selectOption({ label: 'Switzerland' });
  await page.locator('input[autocomplete="tel"]').fill('+41791234567');
}

async function waitForKycWrite(
  capture: { getAll: () => KycWrite[] },
  matches: (write: KycWrite) => boolean,
): Promise<KycWrite> {
  await expect
    .poll(
      () => capture.getAll().find((write) => matches(write) && typeof write.status === 'number'),
      { timeout: 30000, message: 'App2 KYC step must finish the matching real API PUT' },
    )
    .toBeDefined();
  const write = capture.getAll().find((candidate) => matches(candidate) && typeof candidate.status === 'number');
  expect(write?.status, `KYC API response status for ${write?.url}`).toBeGreaterThanOrEqual(200);
  expect(write?.status).toBeLessThan(300);
  return write as KycWrite;
}

async function codeFromVerificationMail(userDataId: number): Promise<string> {
  const row = await waitForRow<{ data: string }>(
    `SELECT data FROM notification
     WHERE "userDataId" = $1 AND context = 'VerificationMail'
     ORDER BY id DESC LIMIT 1`,
    [userDataId],
    20000,
  );
  const data = JSON.parse(row.data) as { texts?: Array<{ params?: { code?: string } }> };
  const code = data.texts?.map((item) => item.params?.code).find((value) => typeof value === 'string');
  if (!code) throw new Error('VerificationMail notification did not contain texts[].params.code');
  return code;
}

async function completeMailTwoFactor(page: import('@playwright/test').Page, userDataId: number): Promise<void> {
  await expect(page.getByPlaceholder('Email code')).toBeVisible({ timeout: 20000 });
  const code = await codeFromVerificationMail(userDataId);
  await page.getByPlaceholder('Email code').fill(code);
  await page.getByRole('button', { name: 'Next' }).click();
  await waitForRow(
    `SELECT id FROM kyc_log WHERE "userDataId" = $1 AND type = 'TfaLog' ORDER BY id DESC LIMIT 1`,
    [userDataId],
    20000,
  );
}

test.describe('App 2.0 KYC and return flows', () => {
  test.afterEach(async () => {
    await cleanupCreatedData();
  });

  test('KYC: contact submission advances to personal data and persists both steps', async ({ page }) => {
    test.setTimeout(120000);
    const user = await createUser({ tag: 'app2-kyc-contact-personal', kycLevel: 0, language: 'EN' });
    await withDb(async (client) => {
      await client.query('UPDATE user_data SET mail = NULL WHERE id = $1', [user.userDataId]);
      await client.query(
        `UPDATE kyc_step SET status = 'NotStarted', updated = NOW()
         WHERE "userDataId" = $1 AND name = 'ContactData'`,
        [user.userDataId],
      );
    });
    const capture = captureKycWrite(page);

    await openApp2(page, user.jwt, '#/kyc');
    await expect(page.getByRole('heading', { name: /verification/i })).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: /start verification|continue/i }).click();

    const email = `e2e+app2-kyc-${Date.now()}@dfx.swiss`;
    const contact = page.locator('input[type="email"]');
    await expect(contact).toBeVisible({ timeout: 25000 });
    await contact.fill(email);
    await expect(page.getByRole('button', { name: /^continue$/i })).toBeEnabled();
    await page.getByRole('button', { name: /^continue$/i }).click();

    await expect(page.locator('input[autocomplete="given-name"]')).toBeVisible({ timeout: 30000 });
    const contactWrite = await waitForKycWrite(capture, (write) => (write.body as { mail?: string })?.mail === email);
    expect(contactWrite.body).toMatchObject({ mail: email });
    const contactRow = await waitForRow<{ mail: string }>(
      `SELECT mail FROM user_data WHERE id = $1 AND mail = $2`,
      [user.userDataId, email],
      20000,
    );
    expect(contactRow.mail).toBe(email);

    await fillPersonalData(page, 'App2First', 'App2Last');
    const continueButton = page.getByRole('button', { name: /^continue$/i });
    await expect(continueButton).toBeEnabled();
    await continueButton.click();

    const personalRow = await waitForRow<{ firstname: string; surname: string; street: string; zip: string }>(
      `SELECT firstname, surname, street, zip FROM user_data
       WHERE id = $1 AND firstname = $2 AND surname = $3`,
      [user.userDataId, 'App2First', 'App2Last'],
      20000,
    );
    expect(personalRow).toMatchObject({ firstname: 'App2First', surname: 'App2Last', street: 'Bahnhofstrasse', zip: '8001' });
    const personalWrite = await waitForKycWrite(
      capture,
      (write) => (write.body as { firstName?: string; lastName?: string })?.firstName === 'App2First' &&
        (write.body as { lastName?: string })?.lastName === 'App2Last',
    );
    expect(personalWrite.body).toMatchObject({ firstName: 'App2First', lastName: 'App2Last' });
  });

  test('KYC: organization prefill validates required fields and submits through the App2 API', async ({ page }) => {
    test.setTimeout(90000);
    const user = await createUser({ tag: 'app2-kyc-organization', kycLevel: 0, language: 'EN' });
    const capture = captureKycWrite(page);

    await openApp2(page, user.jwt, '#/kyc', {
      'auto-start': 'true',
      'account-type': 'Organization',
      'first-name': 'OrgFirst',
      'last-name': 'OrgLast',
      street: 'Main Street',
      'house-number': '1',
      zip: '8001',
      city: 'Zurich',
      country: 'CH',
      'organization-name': 'DFX E2E AG',
      'organization-street': 'Bahnhofstrasse',
      'organization-house-number': '24',
      'organization-zip': '8001',
      'organization-city': 'Zurich',
      'organization-country': 'CH',
    });

    const organization = page.getByRole('textbox', { name: /^organization name$/i });
    await expect(organization).toHaveValue('DFX E2E AG', { timeout: 25000 });
    const submit = page.getByRole('button', { name: /^continue$/i });
    await expect(submit).toBeDisabled();
    await page.locator('input[autocomplete="tel"]').fill('+41791234567');
    await expect(submit).toBeEnabled();
    await submit.click();

    const write = await waitForKycWrite(
      capture,
      (candidate) => (candidate.body as { organizationName?: string })?.organizationName === 'DFX E2E AG',
    );
    expect(write.body).toMatchObject({
      accountType: 'Organization',
      firstName: 'OrgFirst',
      lastName: 'OrgLast',
      organizationName: 'DFX E2E AG',
    });
    await waitForRow(
      `SELECT id FROM user_data WHERE id = $1 AND firstname = $2 AND surname = $3`,
      [user.userDataId, 'OrgFirst', 'OrgLast'],
      20000,
    );
    await expect(page.getByRole('heading', { name: /verification/i })).toBeVisible();
  });

  test('KYC: seeded pending document step uploads through App2 and persists file metadata', async ({ page }) => {
    test.setTimeout(120000);
    const user = await createUser({ tag: 'app2-kyc-upload', kycLevel: 0, language: 'EN' });
    // The KYC service owns step creation and ordering; this fixture selects one already-pending
    // upload step so this test covers the App2 browser upload/API/DB seam, not provider progression.
    await withDb(async (client) => {
      await client.query(`UPDATE kyc_step SET status = 'Completed' WHERE "userDataId" = $1`, [user.userDataId]);
    });
    await createKycStep(user.userDataId, { name: 'AdditionalDocuments', status: 'InProgress', sequenceNumber: 900 });
    const capture = captureKycWrite(page);

    await openApp2(page, user.jwt, '#/kyc', { 'auto-start': 'true' });
    await expect(page.locator('input[type="file"]')).toBeVisible({ timeout: 30000 });
    await page.locator('input[type="file"]').setInputFiles({
      name: 'app2-kyc-document.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    });
    await page.getByRole('button', { name: /submit/i }).click();

    const write = await waitForKycWrite(capture, (candidate) => candidate.url.includes('/additional/'));
    expect(write.url).toContain('/additional/');
    expect(write.body).toMatchObject({ fileName: 'app2-kyc-document.png' });
    const file = await waitForRow<{ uid: string; name: string }>(
      `SELECT uid, name FROM kyc_file
       WHERE "userDataId" = $1 AND name LIKE $2 ORDER BY id DESC LIMIT 1`,
      [user.userDataId, '%app2-kyc-document.png'],
      20000,
    );
    expect(file.name).toContain('app2-kyc-document.png');
    // A successful upload marks the step InReview and advances the App2 workflow to the
    // next actionable step (PersonalData); the upload screen is not expected to remain mounted.
    await expect(page.locator('input[autocomplete="given-name"]')).toBeVisible({ timeout: 20000 });
  });

  test('account merge: valid OTP completes through App2; failure route remains retryable', async ({ page }) => {
    test.setTimeout(150000);
    const masterMail = e2eMail('app2-merge-master');
    const slaveMail = e2eMail('app2-merge-slave');
    const master = await createUser({ tag: 'app2-merge-master', mail: masterMail, language: 'EN' });
    const slave = await createUser({ tag: 'app2-merge-slave', mail: slaveMail, language: 'EN' });

    // Establish the authenticated merge request with the real local API via its existing 2FA and
    // email-change UI; this spec's tested confirmation/return screen is App2.
    await gotoWithSession(page, '/2fa', slave.jwt);
    await completeMailTwoFactor(page, slave.userDataId);
    await gotoWithSession(page, '/account/mail', slave.jwt);
    await expect(page.getByRole('textbox', { name: 'Email address' })).toBeVisible({ timeout: 20000 });
    await page.getByRole('textbox', { name: 'Email address' }).fill(masterMail);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/already have an account/i)).toBeVisible({ timeout: 20000 });

    const merge = await waitForRow<{ code: string }>(
      `SELECT code FROM account_merge WHERE "masterId" = $1 AND "slaveId" = $2 ORDER BY id DESC LIMIT 1`,
      [master.userDataId, slave.userDataId],
      20000,
    );
    expect(merge.code).toBeTruthy();

    const confirmResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname.includes('/auth/mail/confirm'),
    );
    await openApp2(page, slave.jwt, `#/account-merge?otp=${encodeURIComponent(merge.code)}`);
    const confirmResponse = await confirmResponsePromise;
    let confirmBody: Record<string, unknown> = {};
    try {
      confirmBody = (await confirmResponse.json()) as Record<string, unknown>;
    } catch {
      // Keep the status assertion below useful for non-JSON error responses too.
    }
    const safeConfirmBody = {
      ...confirmBody,
      accessToken: typeof confirmBody.accessToken === 'string' ? '[redacted]' : confirmBody.accessToken,
    };
    expect(confirmResponse.status(), `GET ${new URL(confirmResponse.url()).pathname} body=${JSON.stringify(safeConfirmBody)}`)
      .toBe(200);
    expect(confirmBody.kycHash).toEqual(expect.any(String));
    if (typeof confirmBody.accessToken === 'string') {
      await expect.poll(() => new URL(page.url()).hash).toBe('#/account');
    } else {
      await expect(page.getByText(/your accounts have been merged/i)).toBeVisible({ timeout: 20000 });
      await expect(page.getByRole('button', { name: /continue/i })).toBeVisible();
    }
    const completed = await waitForRow<{ isCompleted: boolean }>(
      `SELECT "isCompleted" AS "isCompleted" FROM account_merge
       WHERE "masterId" = $1 AND "slaveId" = $2 AND "isCompleted" = TRUE ORDER BY id DESC LIMIT 1`,
      [master.userDataId, slave.userDataId],
      20000,
    );
    expect(completed.isCompleted).toBe(true);
    const merged = await waitForRow<{ status: string }>(
      `SELECT status FROM user_data WHERE id = $1 AND status = 'Merged'`,
      [slave.userDataId],
      20000,
    );
    expect(merged.status).toBe('Merged');

    await openApp2(page, master.jwt, '#/buy/failure');
    await expect(page.getByText(/payment failed/i)).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: /^retry$/i }).click();
    await expect(page.getByRole('tab', { name: /^buy$/i })).toHaveAttribute('aria-selected', 'true');
  });
});
