/**
 * Wallet AML rules on the /sell screen.
 *
 * The API applies the wallet rules (`wallet.amlRules` / `wallet.exceptAmlRules`) to every buy, sell and swap
 * in its AML check. The quote applies them as well, so a visitor below the KYC level a wallet rule requires
 * is refused before sending crypto: the screen shows the KYC hint and no payment information, and the
 * payment info the screen received carries `KycRequired` and no deposit address.
 *
 * Real frontend, real API, real Postgres. The visitor opens the sell form with the amount filled in, the
 * screen asks the API for the payment information, and the test checks what the visitor sees. The seeded
 * default wallet carries the column default `3;7`, so RULE_3 (KYC level 50 on every route) applies to every
 * factory user. The RULE_11 and exception cases start from a wallet row created for this file, with the user
 * moved onto it and its IP country set in the database (starting state, see docs/test-architecture.md).
 *
 * There is no swap case: with the API's swap product off in its loc environment the swap routes are not
 * mounted, so the swap screen gets no quote (docs/test-architecture.md).
 */

import type { Page, Response } from '@playwright/test';
import {
  type CapturedResponse,
  expect,
  expectPausedQuoteOnScreen,
  gotoWithSession,
  normPath,
  queryOne,
  queryRows,
  required,
  test,
} from './fixtures';
import {
  cleanupCreatedData,
  createBankAccount,
  createUser,
  type CreateUserResult,
  type KycLevelValue,
  TEST_IBAN,
  trackRow,
} from './fixtures/factories';

// Own wallet-index range, so this file never signs into an account of another spec file.
let walletSeq = 0;
function nextWalletIndex(): number {
  walletSeq += 1;
  return 8100000 + walletSeq;
}

const KYC_HINT =
  'This transaction is only possible with a verified account. Please complete our KYC (Know-Your-Customer) process.';
const PAYMENT_BUTTON = /Click here once you have issued the transaction|Complete transaction in your wallet/i;

interface PaymentInfo {
  isValid?: boolean;
  error?: string;
  depositAddress?: string;
}

/** Records every answer to `PUT /v1/sell/paymentInfos` the screen receives, attached before navigation. */
function captureSellPaymentInfos(page: Page): { last: CapturedResponse | null } {
  const box: { last: CapturedResponse | null } = { last: null };
  page.on('response', async (res: Response) => {
    if (res.request().method() !== 'PUT') return;
    if (!new URL(res.url()).pathname.endsWith('/v1/sell/paymentInfos')) return;
    box.last = { status: res.status(), body: await res.text().catch(() => '') };
  });
  return box;
}

function paymentInfoOf(captured: CapturedResponse | null): PaymentInfo {
  const answer = required(captured, 'PUT sell/paymentInfos answer of the screen');
  expect(answer.status, `PUT sell/paymentInfos HTTP ${answer.status}: ${answer.body}`).toBe(200);
  return JSON.parse(answer.body) as PaymentInfo;
}

async function seller(tag: string, kycLevel: KycLevelValue): Promise<CreateUserResult> {
  const user = await createUser({
    walletIndex: nextWalletIndex(),
    tag,
    kycLevel,
    completePersonalData: true,
    language: 'EN',
  });
  await createBankAccount(user.jwt, { iban: TEST_IBAN, label: 'Wallet AML BA' });
  return user;
}

/** Starting state: a wallet with the given rules, the user moved onto it, and the user's IP country. */
async function moveToWallet(
  user: CreateUserResult,
  rules: { amlRules: string; exceptAmlRules?: string },
  ipCountry: string,
): Promise<void> {
  const wallet = required(
    await queryOne<{ id: number }>(
      `INSERT INTO wallet (name, "amlRules", "exceptAmlRules", "autoTradeApproval") VALUES ($1, $2, $3, TRUE) RETURNING id`,
      [`e2e-wallet-aml-${walletSeq}`, rules.amlRules, rules.exceptAmlRules ?? null],
    ),
    'inserted wallet',
  );
  trackRow('wallet', wallet.id);
  await queryRows(`UPDATE "user" SET "walletId" = $1, "ipCountry" = $2 WHERE id = $3`, [
    wallet.id,
    ipCountry,
    user.userId,
  ]);
}

/**
 * Opens the sell form with the amount filled in and waits for the screen's payment-info answer. Returns undefined
 * after asserting the paused answer on screen while sell is switched off.
 */
async function openSellForm(
  page: Page,
  user: CreateUserResult,
): Promise<{ last: CapturedResponse | null } | undefined> {
  const capture = captureSellPaymentInfos(page);
  await gotoWithSession(page, '/sell?asset-in=ETH&asset-out=CHF&amount-in=0.1', user.jwt);
  expect(normPath(new URL(page.url()).pathname)).toBe('/sell');
  await expect(page.getByText('You spend', { exact: true })).toBeVisible({ timeout: 15000 });
  if (await expectPausedQuoteOnScreen(page, () => capture.last, 'sell', 45000)) return undefined;
  return capture;
}

async function expectRefusedOnScreen(page: Page, capture: { last: CapturedResponse | null }): Promise<void> {
  const info = paymentInfoOf(capture.last);
  const detail = `PUT sell/paymentInfos answer: ${capture.last?.body}`;
  expect(info.isValid, detail).toBe(false);
  expect(info.error, detail).toBe('KycRequired');
  expect(info.depositAddress, detail).toBeUndefined();

  await expect(page.getByText(KYC_HINT)).toBeVisible({ timeout: 25000 });
  await expect(page.getByRole('heading', { name: 'Payment Information', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: PAYMENT_BUTTON })).toHaveCount(0);
}

async function expectPaymentInfoOnScreen(page: Page, capture: { last: CapturedResponse | null }): Promise<void> {
  const detail = `PUT sell/paymentInfos answer: ${capture.last?.body}`;
  const paymentPanel = page
    .getByRole('heading', { name: 'Payment Information', exact: true })
    .or(page.getByRole('button', { name: PAYMENT_BUTTON }));
  await expect(paymentPanel.first(), detail).toBeVisible({ timeout: 45000 });
  await expect(page.getByText(KYC_HINT)).toHaveCount(0);

  const info = paymentInfoOf(capture.last);
  expect(info.error, detail).toBeUndefined();
  expect(info.isValid, detail).toBe(true);
  expect(info.depositAddress, detail).toBeTruthy();
}

test.describe.configure({ mode: 'serial' });

test.describe('Wallet AML rules on the /sell screen', () => {
  test.afterAll(async () => {
    await cleanupCreatedData();
  });

  test('/sell: KYC level 30 on a RULE_3 wallet shows the KYC hint and no payment information', async ({ page }) => {
    test.setTimeout(90000);
    const capture = await openSellForm(page, await seller('sell-aml-30', 30));
    if (capture) await expectRefusedOnScreen(page, capture);
  });

  test('/sell: KYC level 50 on a RULE_3 wallet shows the payment information', async ({ page }) => {
    test.setTimeout(90000);
    const capture = await openSellForm(page, await seller('sell-aml-50', 50));
    if (capture) await expectPaymentInfoOnScreen(page, capture);
  });

  test('/sell: RULE_11 waives RULE_3 for a Swiss IP', async ({ page }) => {
    test.setTimeout(90000);
    const user = await seller('sell-aml-r11-ch', 30);
    await moveToWallet(user, { amlRules: '3;7;11' }, 'CH');
    const capture = await openSellForm(page, user);
    if (capture) await expectPaymentInfoOnScreen(page, capture);
  });

  test('/sell: RULE_11 does not waive RULE_3 for a non-Swiss IP', async ({ page }) => {
    test.setTimeout(90000);
    const user = await seller('sell-aml-r11-de', 30);
    await moveToWallet(user, { amlRules: '3;7;11' }, 'DE');
    const capture = await openSellForm(page, user);
    if (capture) await expectRefusedOnScreen(page, capture);
  });

  test('/sell: a wallet exception for RULE_3 lets KYC level 30 through', async ({ page }) => {
    test.setTimeout(90000);
    const user = await seller('sell-aml-except', 30);
    await moveToWallet(user, { amlRules: '3;7', exceptAmlRules: '3' }, 'DE');
    const capture = await openSellForm(page, user);
    if (capture) await expectPaymentInfoOnScreen(page, capture);
  });
});
