/**
 * /partner/onboarding-fee — Partner key-account managers assign an onboarding fee of any whole CHF
 * amount to a customer wallet and remove it again. The amount is typed or filled from a suggested
 * amount; the first case clicks a suggestion, the free-amount case types one.
 *
 * The screen is guarded with usePartnerGuard. The API attributes the named address to the logged-in
 * partner's ref as part of the assignment; the DB assertions below prove that attribution, the fee
 * on the account and its removal. A plain User must be redirected away from the route.
 *
 * Preconditions written here: the partner account gets a `ref` by SQL (the API only assigns one on
 * its own KYC path). The 409 case starts from a customer that another key-account manager already
 * owns, so a partner cannot take over the attribution.
 */

import type { Locator, Page } from '@playwright/test';
import {
  decryptPii,
  expect,
  gotoWithSession,
  loginAs,
  normPath,
  openScreen,
  queryOne,
  queryRows,
  test,
  waitForMatchingRow,
  waitForRow,
} from './fixtures';
import { cleanupCreatedData, createUser, trackRow } from './fixtures/factories';

test.describe.configure({ mode: 'serial' });

/** Open the top-right nav menu (hamburger / close icon in Navigation). */
async function openNavMenu(page: Page): Promise<void> {
  await page.locator('div.absolute.right-4').click();
  await expect(page.getByRole('button', { name: /^(Logout|Login)$/ })).toBeVisible({ timeout: 10000 });
}

async function freeRef(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = `${String(Math.floor(Math.random() * 900) + 100)}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
    const taken = await queryOne<{ id: number }>(`SELECT id FROM "user" WHERE ref = $1`, [candidate]);
    if (!taken) return candidate;
  }
  throw new Error('freeRef: no free ref found');
}

// The partner account's own ref as it was before the first test wrote one: `undefined` = not
// captured yet, `null` = the account had none. Restored in afterAll so the shared fixture user
// keeps its state after a failing run too.
let previousPartnerRef: { userId: number; ref: string | null } | undefined;

/** Give a user a ref the API can attribute customers to. */
async function seedRef(userId: number): Promise<string> {
  const ref = await freeRef();
  if (previousPartnerRef === undefined) {
    const row = await queryOne<{ ref: string | null }>(`SELECT ref FROM "user" WHERE id = $1`, [userId]);
    previousPartnerRef = { userId, ref: row?.ref ?? null };
  }
  await queryRows(`UPDATE "user" SET ref = $1 WHERE id = $2`, [ref, userId]);
  return ref;
}

/** Put the partner account's ref back to its value before this file's tests. */
async function restorePartnerRef(): Promise<void> {
  if (previousPartnerRef === undefined) return;
  await queryRows(`UPDATE "user" SET ref = $1 WHERE id = $2`, [previousPartnerRef.ref, previousPartnerRef.userId]);
  previousPartnerRef = undefined;
}

/**
 * The input of a StyledInput, found by its field label.
 *
 * `name` on the React component does not become the DOM `name` attribute — StyledInput derives that
 * from its `autocomplete` prop, which these fields do not set, so `input[name="address"]` matches
 * nothing. The label is the stable handle; the input sits in the same field container as the label.
 * The nearest ancestor that actually holds an input is taken because the plain two-level step can
 * land on a container wide enough to also cover the neighbouring field.
 */
function styledInput(root: Locator, fieldLabel: string): Locator {
  return root
    .getByText(fieldLabel, { exact: true })
    .first()
    .locator('xpath=ancestor::*[.//input or .//textarea][1]')
    .locator('input, textarea')
    .first();
}

/**
 * The <section> a heading belongs to, taken from the heading rather than from `filter({ hasText })`:
 * a text filter would also match any outer section once the screen is nested in one, while going up
 * to the nearest section always lands on the one the heading was rendered in.
 */
function sectionOf(page: Page, heading: string): Locator {
  return page.getByRole('heading', { name: heading, exact: true }).locator('xpath=ancestor::section[1]');
}

function assignSection(page: Page): Locator {
  return sectionOf(page, 'Assign onboarding fee');
}

function removeSection(page: Page): Locator {
  return sectionOf(page, 'Remove onboarding fee');
}

/** Type the customer address and the amount into the assign form, the way a partner does. */
async function fillAssignForm(assign: Locator, address: string, amount: string): Promise<void> {
  await styledInput(assign, 'Customer address').fill(address);
  await styledInput(assign, 'Onboarding fee (CHF)').fill(amount);
}

test.describe('Partner onboarding fee', () => {
  test.afterAll(async () => {
    try {
      await restorePartnerRef();
    } finally {
      await cleanupCreatedData();
    }
  });

  test('assigns and removes an onboarding fee through the Partner screen', async ({ page }) => {
    const { jwt, userId } = await loginAs('Partner');
    const ref = await seedRef(userId);

    const customer = await createUser({
      tag: 'partner-onboarding-fee',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });
    // Starting state the API transitions from: an NA account with an NA user.
    await queryRows(`UPDATE "user" SET status = 'NA' WHERE id = $1`, [customer.userId]);
    await queryRows(`UPDATE user_data SET status = 'NA' WHERE id = $1`, [customer.userDataId]);

    // Enter through the real navigation, so the Partner menu entry is exercised too.
    await openScreen(page, '/account', jwt);
    await openNavMenu(page);
    await page.getByText('Onboarding fee', { exact: true }).first().click();

    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'the Partner menu entry must open /partner/onboarding-fee',
        timeout: 15000,
      })
      .toBe(normPath('/partner/onboarding-fee'));
    await expect(page.getByRole('button', { name: /^(Logout|Login)$/ })).toBeHidden({ timeout: 10000 });

    await expect(page.getByText('Assign onboarding fee', { exact: true })).toBeVisible({ timeout: 20000 });

    const assign = assignSection(page);
    // The amount comes from the quick pick, not from typing: the click must fill the input, and the
    // request body below proves the picked value is what the screen sends.
    await styledInput(assign, 'Customer address').fill(customer.address);
    const pick = assign.getByRole('button', { name: 'CHF 400', exact: true });
    await expect(pick).toBeVisible({ timeout: 20000 });
    await pick.click();
    await expect(styledInput(assign, 'Onboarding fee (CHF)')).toHaveValue('400');

    const putResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' && new URL(response.url()).pathname === '/v1/partner/onboardingFee',
    );
    await assign.getByRole('button', { name: 'Assign', exact: true }).click();
    const put = await putResponse;
    expect(put.status()).toBe(200);
    expect(put.request().postDataJSON()).toEqual({ address: customer.address, amount: 400 });

    await expect(
      page.getByText(`Onboarding fee of CHF 400 assigned to ${customer.address}.`, { exact: true }),
    ).toBeVisible({ timeout: 20000 });

    // Attribution and status transition, asserted from the database.
    const userRow = await waitForRow<{ usedRef: string | null; status: string }>(
      `SELECT "usedRef", status FROM "user" WHERE id = $1 AND status = 'Active'`,
      [customer.userId],
      20000,
    );
    expect(userRow.usedRef).toBe(ref);

    const userDataRow = await waitForRow<{ status: string; individualFees: string | null }>(
      `SELECT status, "individualFees" FROM user_data WHERE id = $1 AND status = 'Active'`,
      [customer.userDataId],
      20000,
    );
    const feeIds = (userDataRow.individualFees ?? '').split(';').filter(Boolean);
    expect(feeIds.length).toBeGreaterThan(0);
    const fee = await waitForRow<{ id: number }>(
      `SELECT id FROM fee
       WHERE id = ANY($1::int[]) AND label = 'Onboarding Fixed 400' AND fixed = 400 AND active = true`,
      [feeIds.map(Number)],
      20000,
    );

    // The backend audits the attribution and the assignment names the partner as the clerk.
    const log = await waitForMatchingRow<{ id: number; message: string | null }>(
      `SELECT id, message FROM support_log
       WHERE "userDataId" = $1 AND clerk = $2`,
      [customer.userDataId, 'E2E Test Staff'],
      (row) => decryptPii(row.message)?.startsWith('Onboarding fee') ?? false,
      20000,
    );
    trackRow('support_log', log.id);

    // Remove the fee again through the UI.
    const remove = removeSection(page);
    await styledInput(remove, 'Customer address').fill(customer.address);
    await remove.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.getByText(`Remove the onboarding fee of ${customer.address}?`, { exact: true })).toBeVisible();

    const deleteResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' && new URL(response.url()).pathname === '/v1/partner/onboardingFee',
    );
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    expect((await deleteResponse).status()).toBe(200);

    await expect(page.getByText(`Onboarding fee of ${customer.address} removed.`, { exact: true })).toBeVisible({
      timeout: 20000,
    });

    await expect
      .poll(
        async () => {
          const row = await queryOne<{ individualFees: string | null }>(
            `SELECT "individualFees" FROM user_data WHERE id = $1`,
            [customer.userDataId],
          );
          if (!row) {
            throw new Error(`the customer's user_data row ${customer.userDataId} must still exist after removal`);
          }
          return (row.individualFees ?? '').split(';').filter(Boolean).includes(String(fee.id));
        },
        { timeout: 20000, message: 'the onboarding fee id must be gone from user_data.individualFees' },
      )
      .toBe(false);
  });

  test('assigns a typed onboarding fee that is not among the suggested amounts', async ({ page }) => {
    const { jwt, userId } = await loginAs('Partner');
    const ref = await seedRef(userId);

    const customer = await createUser({
      tag: 'partner-onboarding-fee-free',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });
    // Starting state the API transitions from: an NA account with an NA user.
    await queryRows(`UPDATE "user" SET status = 'NA' WHERE id = $1`, [customer.userId]);
    await queryRows(`UPDATE user_data SET status = 'NA' WHERE id = $1`, [customer.userDataId]);

    await openScreen(page, '/partner/onboarding-fee', jwt);
    await expect(page.getByText('Assign onboarding fee', { exact: true })).toBeVisible({ timeout: 20000 });

    const assign = assignSection(page);
    // The agreed amount is typed; it is not one of the suggestions the screen offers as quick picks.
    await expect(assign.getByRole('group', { name: 'Suggested amounts' })).toBeVisible({ timeout: 20000 });
    await expect(assign.getByRole('button', { name: /^CHF 14.000$/ })).toHaveCount(0);
    await fillAssignForm(assign, customer.address, '14000');

    const putResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' && new URL(response.url()).pathname === '/v1/partner/onboardingFee',
    );
    const assignButton = assign.getByRole('button', { name: 'Assign', exact: true });
    await expect(assignButton).toBeEnabled({ timeout: 10000 });
    await assignButton.click();
    const put = await putResponse;
    expect(put.status()).toBe(200);
    expect(put.request().postDataJSON()).toEqual({ address: customer.address, amount: 14000 });

    // The notice shows the amount with the Swiss thousands separator; the separator character
    // depends on the browser's locale data, so only its position is fixed here.
    const notice = new RegExp(`^Onboarding fee of CHF 14.000 assigned to ${customer.address}\\.$`);
    await expect(page.getByText(notice)).toBeVisible({ timeout: 20000 });

    const userRow = await waitForRow<{ usedRef: string | null; status: string }>(
      `SELECT "usedRef", status FROM "user" WHERE id = $1 AND status = 'Active'`,
      [customer.userId],
      20000,
    );
    expect(userRow.usedRef).toBe(ref);

    const userDataRow = await waitForRow<{ status: string; individualFees: string | null }>(
      `SELECT status, "individualFees" FROM user_data WHERE id = $1 AND status = 'Active'`,
      [customer.userDataId],
      20000,
    );
    const feeIds = (userDataRow.individualFees ?? '').split(';').filter(Boolean);
    expect(feeIds.length).toBeGreaterThan(0);
    await waitForRow<{ id: number }>(
      `SELECT id FROM fee
       WHERE id = ANY($1::int[]) AND label = 'Onboarding Fixed 14000' AND fixed = 14000 AND active = true`,
      [feeIds.map(Number)],
      20000,
    );

    const log = await waitForMatchingRow<{ id: number; message: string | null }>(
      `SELECT id, message FROM support_log
       WHERE "userDataId" = $1 AND clerk = $2`,
      [customer.userDataId, 'E2E Test Staff'],
      (row) => decryptPii(row.message)?.startsWith('Onboarding fee') ?? false,
      20000,
    );
    trackRow('support_log', log.id);
  });

  test('refuses an amount outside the allowed range and assigns the upper bound', async ({ page }) => {
    const { jwt, userId } = await loginAs('Partner');
    const ref = await seedRef(userId);

    const customer = await createUser({
      tag: 'partner-onboarding-fee-range',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });
    // Starting state the API transitions from: an NA account with an NA user.
    await queryRows(`UPDATE "user" SET status = 'NA' WHERE id = $1`, [customer.userId]);
    await queryRows(`UPDATE user_data SET status = 'NA' WHERE id = $1`, [customer.userDataId]);

    // Every request the page sends is recorded, so the refusal is proven by the absence of a PUT and
    // not only by the disabled button.
    const requests: { method: string; pathname: string }[] = [];
    page.on('request', (request) => {
      requests.push({ method: request.method(), pathname: new URL(request.url()).pathname });
    });

    await openScreen(page, '/partner/onboarding-fee', jwt);
    await expect(page.getByText('Assign onboarding fee', { exact: true })).toBeVisible({ timeout: 20000 });

    const assign = assignSection(page);
    const amountInput = styledInput(assign, 'Onboarding fee (CHF)');
    const assignButton = assign.getByRole('button', { name: 'Assign', exact: true });
    // The screen fills the bounds with the Swiss grouping; the separator character depends on the
    // browser's locale data, so only its position is fixed here.
    const rangeSentence = /^Enter a whole CHF amount between 1 and 1.000.000\.$/;

    // The form validates on blur first, so the amount field is left before the sentence is expected.
    await fillAssignForm(assign, customer.address, '0');
    await amountInput.blur();
    await expect(assign.getByText(rangeSentence)).toBeVisible({ timeout: 10000 });
    await expect(assignButton).toBeDisabled();

    await amountInput.fill('1000001');
    await amountInput.blur();
    await expect(assign.getByText(rangeSentence)).toBeVisible({ timeout: 10000 });
    await expect(assignButton).toBeDisabled();

    const refusedPuts = requests.filter(
      (request) => request.method === 'PUT' && request.pathname === '/v1/partner/onboardingFee',
    );
    expect(refusedPuts).toEqual([]);

    const refusedUser = await queryOne<{ status: string }>(`SELECT status FROM "user" WHERE id = $1`, [
      customer.userId,
    ]);
    expect(refusedUser?.status).toBe('NA');
    const refusedUserData = await queryOne<{ status: string; individualFees: string | null }>(
      `SELECT status, "individualFees" FROM user_data WHERE id = $1`,
      [customer.userDataId],
    );
    expect(refusedUserData?.status).toBe('NA');
    expect((refusedUserData?.individualFees ?? '').split(';').filter(Boolean)).toEqual([]);

    // The upper bound itself is a valid amount, typed the way the range sentence shows it (Swiss
    // grouping with the typographic apostrophe): the screen sends it as a plain number and the real
    // API stores it.
    await amountInput.fill('1’000’000');
    await amountInput.blur();
    await expect(assign.getByText(rangeSentence)).toHaveCount(0);
    await expect(assignButton).toBeEnabled({ timeout: 10000 });

    const putResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' && new URL(response.url()).pathname === '/v1/partner/onboardingFee',
    );
    await assignButton.click();
    const put = await putResponse;
    expect(put.status()).toBe(200);
    expect(put.request().postDataJSON()).toEqual({ address: customer.address, amount: 1000000 });

    const notice = new RegExp(`^Onboarding fee of CHF 1.000.000 assigned to ${customer.address}\\.$`);
    await expect(page.getByText(notice)).toBeVisible({ timeout: 20000 });

    const userRow = await waitForRow<{ usedRef: string | null; status: string }>(
      `SELECT "usedRef", status FROM "user" WHERE id = $1 AND status = 'Active'`,
      [customer.userId],
      20000,
    );
    expect(userRow.usedRef).toBe(ref);

    const userDataRow = await waitForRow<{ status: string; individualFees: string | null }>(
      `SELECT status, "individualFees" FROM user_data WHERE id = $1 AND status = 'Active'`,
      [customer.userDataId],
      20000,
    );
    const feeIds = (userDataRow.individualFees ?? '').split(';').filter(Boolean);
    expect(feeIds.length).toBeGreaterThan(0);
    await waitForRow<{ id: number }>(
      `SELECT id FROM fee
       WHERE id = ANY($1::int[]) AND label = 'Onboarding Fixed 1000000' AND fixed = 1000000 AND active = true`,
      [feeIds.map(Number)],
      20000,
    );

    const log = await waitForMatchingRow<{ id: number; message: string | null }>(
      `SELECT id, message FROM support_log
       WHERE "userDataId" = $1 AND clerk = $2`,
      [customer.userDataId, 'E2E Test Staff'],
      (row) => decryptPii(row.message)?.startsWith('Onboarding fee') ?? false,
      20000,
    );
    trackRow('support_log', log.id);
  });

  test('refuses to assign a fee to a customer another key-account manager already owns', async ({ page }) => {
    const { jwt, userId } = await loginAs('Partner');
    await seedRef(userId);

    // A second key-account manager owns this ref; the customer already points at it.
    const otherManager = await createUser({ tag: 'partner-other-manager', kycLevel: 30 });
    const foreignRef = await seedRef(otherManager.userId);

    const customer = await createUser({
      tag: 'partner-onboarding-conflict',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });
    await queryRows(`UPDATE "user" SET status = 'Active', "usedRef" = $2 WHERE id = $1`, [customer.userId, foreignRef]);
    await queryRows(`UPDATE user_data SET status = 'Active' WHERE id = $1`, [customer.userDataId]);

    const beforeUser = await queryOne<{ usedRef: string | null; status: string }>(
      `SELECT "usedRef", status FROM "user" WHERE id = $1`,
      [customer.userId],
    );
    const beforeUserData = await queryOne<{ status: string; individualFees: string | null }>(
      `SELECT status, "individualFees" FROM user_data WHERE id = $1`,
      [customer.userDataId],
    );

    await openScreen(page, '/partner/onboarding-fee', jwt);
    await expect(page.getByText('Assign onboarding fee', { exact: true })).toBeVisible({ timeout: 20000 });

    const assign = assignSection(page);
    await fillAssignForm(assign, customer.address, '400');

    const putResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' && new URL(response.url()).pathname === '/v1/partner/onboardingFee',
    );
    await assign.getByRole('button', { name: 'Assign', exact: true }).click();
    const response = await putResponse;
    expect(response.status()).toBe(409);

    // The screen reports exactly the API's conflict message; a 409 without one would be a broken
    // API contract, not a silently skipped assertion.
    const body = (await response.json()) as { message?: unknown };
    expect(typeof body.message).toBe('string');
    expect(body.message).not.toBe('');
    await expect(page.getByText(body.message as string, { exact: true })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/assigned to/)).toHaveCount(0);

    const afterUser = await queryOne<{ usedRef: string | null; status: string }>(
      `SELECT "usedRef", status FROM "user" WHERE id = $1`,
      [customer.userId],
    );
    const afterUserData = await queryOne<{ status: string; individualFees: string | null }>(
      `SELECT status, "individualFees" FROM user_data WHERE id = $1`,
      [customer.userDataId],
    );
    expect(afterUser).toEqual(beforeUser);
    expect(afterUserData).toEqual(beforeUserData);
  });

  test('redirects a plain User away from the Partner screen', async ({ page }) => {
    const { jwt } = await loginAs('User');

    await gotoWithSession(page, '/partner/onboarding-fee', jwt);
    await page.waitForLoadState('networkidle');

    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'User role must be redirected away from /partner/onboarding-fee (usePartnerGuard)',
        timeout: 15000,
      })
      .not.toBe(normPath('/partner/onboarding-fee'));
  });
});
