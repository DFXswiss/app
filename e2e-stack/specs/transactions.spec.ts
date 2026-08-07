import { test, expect, openScreen, queryOne, queryRows } from './fixtures';
import {
  createUser,
  createBankAccount,
  createBuy,
  createTransaction,
  cleanupCreatedData,
  TEST_IBAN,
} from './fixtures/factories';

test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
  await cleanupCreatedData();
});

// ---------------------------------------------------------------------------
// Access control (representative for all /tx* routes)
// ---------------------------------------------------------------------------

test('unauthenticated visit to /tx redirects to /login', async ({ page }) => {
  await page.goto('/tx');
  await expect(page).toHaveURL(/\/login/);
  expect(new URL(page.url()).pathname).toBe('/login');
});

// ---------------------------------------------------------------------------
// /tx — list view
// ---------------------------------------------------------------------------

test('empty transaction list shows "No transactions found"', async ({ page }) => {
  const user = await createUser({
    tag: 'tx-list-empty',
    kycLevel: 30,
    completePersonalData: true,
  });

  await openScreen(page, '/tx', user.jwt);

  await expect(page.getByRole('heading', { name: 'Your Transactions', exact: true })).toBeVisible();
  await expect(page.getByText('No transactions found', { exact: true })).toBeVisible();
});

test('transaction list shows buy and sell rows with expected labels and amounts', async ({ page }) => {
  const user = await createUser({
    tag: 'tx-list-rows',
    kycLevel: 30,
    completePersonalData: true,
  });

  const buy = await createTransaction({
    state: 'completed_buy',
    tag: 'tx-list-buy',
    userId: user.userId,
    userDataId: user.userDataId,
    jwt: user.jwt,
    amount: 111,
    inputAsset: 'CHF',
  });
  const sell = await createTransaction({
    state: 'pending_sell',
    tag: 'tx-list-sell',
    userId: user.userId,
    userDataId: user.userDataId,
    jwt: user.jwt,
    amount: 222,
  });
  const secondAsset = await queryOne<{ id: number }>(
    `SELECT id FROM asset WHERE buyable = true AND blockchain != 'Ethereum' ORDER BY id ASC LIMIT 1`,
  );
  const secondBuy = await createBuy(user.jwt, { assetId: secondAsset!.id });
  const pendingBuy = await createTransaction({
    state: 'pending_buy',
    tag: 'tx-list-pending',
    userId: user.userId,
    userDataId: user.userDataId,
    jwt: user.jwt,
    amount: 333,
    inputAsset: 'CHF',
    buyId: secondBuy.buyId,
  });

  // Deterministic sort: newest first by "created"
  const now = Date.now();
  await queryRows(`UPDATE transaction SET "created" = $1 WHERE id = $2`, [
    new Date(now).toISOString(),
    buy.transactionId,
  ]);
  await queryRows(`UPDATE transaction SET "created" = $1 WHERE id = $2`, [
    new Date(now - 60 * 60 * 1000).toISOString(),
    sell.transactionId,
  ]);
  await queryRows(`UPDATE transaction SET "created" = $1 WHERE id = $2`, [
    new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    pendingBuy.transactionId,
  ]);

  await openScreen(page, '/tx', user.jwt);

  await expect(page.getByRole('heading', { name: 'Your Transactions', exact: true })).toBeVisible();

  const buyRow = page.locator('div').filter({ hasText: '111' }).filter({ hasText: 'CHF' }).first();
  await expect(buyRow).toBeVisible();
  await expect(buyRow.getByText('Buy', { exact: true }).first()).toBeVisible();
  await expect(buyRow.getByText('Completed', { exact: true }).first()).toBeVisible();

  const sellRow = page.locator('div').filter({ hasText: '222' }).filter({ hasText: 'ETH' }).first();
  await expect(sellRow).toBeVisible();
  await expect(sellRow.getByText('Sell', { exact: true }).first()).toBeVisible();
  await expect(sellRow.getByText('DFX check pending', { exact: true }).first()).toBeVisible();

  const pendingRow = page.locator('div').filter({ hasText: '333' }).filter({ hasText: 'CHF' }).first();
  await expect(pendingRow).toBeVisible();
  await expect(pendingRow.getByText('Buy', { exact: true }).first()).toBeVisible();
  await expect(pendingRow.getByText('DFX check pending', { exact: true }).first()).toBeVisible();

  // Newest-first order: 111 (buy) before 222 (sell) before 333 (pending)
  const listText = await page.locator('body').innerText();
  const idx111 = listText.indexOf('111');
  const idx222 = listText.indexOf('222');
  const idx333 = listText.indexOf('333');
  expect(idx111).toBeGreaterThan(-1);
  expect(idx222).toBeGreaterThan(-1);
  expect(idx333).toBeGreaterThan(-1);
  expect(idx111).toBeLessThan(idx222);
  expect(idx222).toBeLessThan(idx333);
});

test('transaction list does not show another user\'s transactions', async ({ page }) => {
  const owner = await createUser({
    tag: 'tx-list-owner',
    kycLevel: 30,
    completePersonalData: true,
  });
  const stranger = await createUser({
    tag: 'tx-list-stranger',
    kycLevel: 30,
    completePersonalData: true,
  });

  await createTransaction({
    state: 'completed_buy',
    tag: 'tx-list-secret',
    userId: owner.userId,
    userDataId: owner.userDataId,
    jwt: owner.jwt,
    amount: 555,
    inputAsset: 'CHF',
  });

  await openScreen(page, '/tx', stranger.jwt);

  await expect(page.getByRole('heading', { name: 'Your Transactions', exact: true })).toBeVisible();
  await expect(page.getByText('555', { exact: false })).toHaveCount(0);
  await expect(page.getByText('No transactions found', { exact: true })).toBeVisible();
});

// ---------------------------------------------------------------------------
// /tx/:id — detail / status view (uid)
// ---------------------------------------------------------------------------

test('transaction detail shows completed buy status fields', async ({ page }) => {
  const user = await createUser({
    tag: 'tx-detail-buy',
    kycLevel: 30,
    completePersonalData: true,
  });
  const tx = await createTransaction({
    state: 'completed_buy',
    tag: 'tx-detail-buy',
    userId: user.userId,
    userDataId: user.userDataId,
    jwt: user.jwt,
    amount: 166,
    inputAsset: 'CHF',
  });

  await openScreen(page, `/tx/${tx.uid}`, user.jwt);

  await expect(page.getByText('Transaction status', { exact: true })).toBeVisible();
  await expect(page.getByText('ID', { exact: true })).toBeVisible();
  await expect(page.getByText(String(tx.transactionId), { exact: true })).toBeVisible();
  await expect(page.getByText('Type', { exact: true })).toBeVisible();
  await expect(page.getByText('Buy', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('State', { exact: true })).toBeVisible();
  await expect(page.getByText('Completed', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Input', { exact: true })).toBeVisible();
  await expect(page.getByText(/166.*CHF|CHF.*166/)).toBeVisible();
});

test('transaction detail shows pending sell status fields', async ({ page }) => {
  const user = await createUser({
    tag: 'tx-detail-sell',
    kycLevel: 30,
    completePersonalData: true,
  });
  const tx = await createTransaction({
    state: 'pending_sell',
    tag: 'tx-detail-sell',
    userId: user.userId,
    userDataId: user.userDataId,
    jwt: user.jwt,
    amount: 177,
  });

  await openScreen(page, `/tx/${tx.uid}`, user.jwt);

  await expect(page.getByText('Transaction status', { exact: true })).toBeVisible();
  await expect(page.getByText('Sell', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('DFX check pending', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/177.*ETH|ETH.*177/)).toBeVisible();
});

test('unknown transaction uid shows ErrorHint with not-found message', async ({ page }) => {
  const user = await createUser({
    tag: 'tx-detail-missing',
    kycLevel: 30,
    completePersonalData: true,
  });

  await openScreen(page, '/tx/T0000000000000000', user.jwt);

  await expect(
    page.getByText(
      'Something went wrong. Please try again. If the issue persists please reach out to our support.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText(/not found/i)).toBeVisible();
});

// ---------------------------------------------------------------------------
// /tx/:id/assign — list + inline assign form (numeric transaction id)
// ---------------------------------------------------------------------------

test('assign route opens list with unassigned row and assigns to single buy target', async ({ page }) => {
  const user = await createUser({
    tag: 'tx-assign-ok',
    kycLevel: 30,
    completePersonalData: true,
  });
  const ba = await createBankAccount(user.jwt, { iban: TEST_IBAN, label: 'Assign IBAN' });
  const baRow = await queryOne<{ iban: string }>('SELECT iban FROM bank_data WHERE id = $1', [ba.bankAccountId]);
  const buy = await createBuy(user.jwt);
  const unassigned = await createTransaction({
    state: 'bank_tx_only',
    tag: 'tx-assign-ok',
    userId: user.userId,
    userDataId: user.userDataId,
    amount: 444,
  });
  await queryRows(
    `UPDATE bank_tx SET "senderAccount" = $1, "txAmount" = $2, "txCurrency" = 'CHF', type = 'Unknown'
     WHERE id = $3`,
    [baRow!.iban, 444, unassigned.bankTxId],
  );

  await openScreen(page, `/tx/${unassigned.transactionId}/assign`, user.jwt);

  await expect(page.getByRole('heading', { name: 'Your Transactions', exact: true })).toBeVisible();
  await expect(page.getByText('Unassigned', { exact: true }).first()).toBeVisible();
  await expect(page.locator('div').filter({ hasText: '444' }).filter({ hasText: 'CHF' }).first()).toBeVisible();

  // Single target auto-selects; dropdown is disabled — just submit
  const assignBtn = page.getByRole('button', { name: 'Assign transaction' });
  await expect(assignBtn).toBeVisible();
  await assignBtn.click();

  // DB: bank_tx becomes BuyCrypto; assignment creates buy_crypto linked to the buy route
  await expect
    .poll(async () => {
      const bankTxRow = await queryOne<{ type: string }>(`SELECT type FROM bank_tx WHERE id = $1`, [
        unassigned.bankTxId,
      ]);
      const buyCryptoRow = await queryOne<{ id: number; buyId: number | null }>(
        `SELECT id, "buyId" FROM buy_crypto WHERE "bankTxId" = $1`,
        [unassigned.bankTxId],
      );
      return { bankTxType: bankTxRow?.type ?? null, buyCryptoBuyId: buyCryptoRow?.buyId ?? null };
    })
    .toEqual({ bankTxType: 'BuyCrypto', buyCryptoBuyId: buy.buyId });
});

test('assign route for another user\'s unassigned tx leaves list empty of that row and DB unchanged', async ({
  page,
}) => {
  const owner = await createUser({
    tag: 'tx-assign-owner',
    kycLevel: 30,
    completePersonalData: true,
  });
  const stranger = await createUser({
    tag: 'tx-assign-stranger',
    kycLevel: 30,
    completePersonalData: true,
  });
  const ba = await createBankAccount(owner.jwt, { iban: TEST_IBAN, label: 'Owner IBAN' });
  const baRow = await queryOne<{ iban: string }>('SELECT iban FROM bank_data WHERE id = $1', [ba.bankAccountId]);
  await createBuy(owner.jwt);
  const unassigned = await createTransaction({
    state: 'bank_tx_only',
    tag: 'tx-assign-foreign',
    userId: owner.userId,
    userDataId: owner.userDataId,
    amount: 445,
  });
  await queryRows(
    `UPDATE bank_tx SET "senderAccount" = $1, "txAmount" = $2, "txCurrency" = 'CHF', type = 'Unknown'
     WHERE id = $3`,
    [baRow!.iban, 445, unassigned.bankTxId],
  );

  const before = await queryOne<{ type: string }>(`SELECT type FROM bank_tx WHERE id = $1`, [
    unassigned.bankTxId,
  ]);

  await openScreen(page, `/tx/${unassigned.transactionId}/assign`, stranger.jwt);

  // Still the ordinary list; no crash; stranger cannot see the owner's unassigned row
  await expect(page.getByRole('heading', { name: 'Your Transactions', exact: true })).toBeVisible();
  await expect(page.getByText('445', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Assign transaction' })).toHaveCount(0);

  const after = await queryOne<{ type: string }>(`SELECT type FROM bank_tx WHERE id = $1`, [unassigned.bankTxId]);
  expect(after).toEqual(before);
  expect(after?.type).toBe('Unknown');

  const buyCryptoAfter = await queryOne<{ id: number }>(`SELECT id FROM buy_crypto WHERE "bankTxId" = $1`, [
    unassigned.bankTxId,
  ]);
  expect(buyCryptoAfter).toBeUndefined();
});

// ---------------------------------------------------------------------------
// /tx/:id/refund — refund form (uid)
// ---------------------------------------------------------------------------

test('pending buy refund form submits and writes chargeback columns', async ({ page }) => {
  const user = await createUser({
    tag: 'tx-refund-ok',
    kycLevel: 30,
    completePersonalData: true,
  });
  const tx = await createTransaction({
    state: 'pending_buy',
    tag: 'tx-refund-ok',
    userId: user.userId,
    userDataId: user.userDataId,
    jwt: user.jwt,
    amount: 188,
    inputAsset: 'CHF',
  });

  await openScreen(page, `/tx/${tx.uid}/refund`, user.jwt);

  await expect(page.getByText('Transaction refund', { exact: true })).toBeVisible();

  await page.locator('input[name="street"]').fill('Bahnhofstrasse');
  await page.locator('input[name="house-number"]').fill('1');
  await page.locator('input[name="zip"]').fill('8001');
  await page.locator('input[name="city"]').fill('Zurich');
  await page.locator('input[name="country"]').fill('Switzerland');
  await page.getByText('Transaction refund', { exact: true }).click();

  const nameInput = page.locator('input[placeholder="John Doe"]');
  if ((await nameInput.count()) === 1) {
    await nameInput.fill('Test User');
  }

  const submit = page.getByRole('button', { name: /Confirm refund|Request refund/ });
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page).toHaveURL(/\/tx$/);
  expect(new URL(page.url()).pathname).toBe('/tx');

  await expect
    .poll(async () => {
      const row = await queryOne<{
        chargebackAmount: string | number | null;
        chargebackIban: string | null;
        chargebackAllowedDateUser: string | Date | null;
      }>(
        `SELECT "chargebackAmount", "chargebackIban", "chargebackAllowedDateUser"
         FROM buy_crypto WHERE id = $1`,
        [tx.buyCryptoId],
      );
      if (!row) return null;
      return {
        amountPositive: row.chargebackAmount != null && Number(row.chargebackAmount) > 0,
        hasIban: row.chargebackIban != null && row.chargebackIban.length > 0,
        hasAllowedDate: row.chargebackAllowedDateUser != null,
      };
    })
    .toEqual({ amountPositive: true, hasIban: true, hasAllowedDate: true });
});

test('refund form with invalid ZIP keeps submit disabled and leaves buy_crypto unchanged', async ({ page }) => {
  const user = await createUser({
    tag: 'tx-refund-zip',
    kycLevel: 30,
    completePersonalData: true,
  });
  const tx = await createTransaction({
    state: 'pending_buy',
    tag: 'tx-refund-zip',
    userId: user.userId,
    userDataId: user.userDataId,
    jwt: user.jwt,
    amount: 189,
    inputAsset: 'CHF',
  });

  await openScreen(page, `/tx/${tx.uid}/refund`, user.jwt);

  await expect(page.getByText('Transaction refund', { exact: true })).toBeVisible();

  await page.locator('input[name="street"]').fill('Bahnhofstrasse');
  await page.locator('input[name="house-number"]').fill('1');
  await page.locator('input[name="zip"]').fill('123456789'); // 9 chars > max 8
  await page.locator('input[name="city"]').fill('Zurich');
  await page.locator('input[name="country"]').fill('Switzerland');

  const nameInput = page.locator('input[placeholder="John Doe"]');
  if ((await nameInput.count()) === 1) {
    await nameInput.fill('Test User');
  }

  const submit = page.getByRole('button', { name: /Confirm refund|Request refund/ });
  await expect(submit).toBeDisabled();

  const row = await queryOne<{
    chargebackAmount: string | number | null;
    chargebackIban: string | null;
    chargebackAllowedDateUser: string | Date | null;
  }>(
    `SELECT "chargebackAmount", "chargebackIban", "chargebackAllowedDateUser"
     FROM buy_crypto WHERE id = $1`,
    [tx.buyCryptoId],
  );
  expect(row?.chargebackAmount).toBeNull();
  expect(row?.chargebackIban).toBeNull();
  expect(row?.chargebackAllowedDateUser).toBeNull();
});

test('completed buy is not refundable and shows ErrorHint with DB unchanged', async ({ page }) => {
  const user = await createUser({
    tag: 'tx-refund-completed',
    kycLevel: 30,
    completePersonalData: true,
  });
  const tx = await createTransaction({
    state: 'completed_buy',
    tag: 'tx-refund-completed',
    userId: user.userId,
    userDataId: user.userDataId,
    jwt: user.jwt,
    amount: 190,
    inputAsset: 'CHF',
  });

  await openScreen(page, `/tx/${tx.uid}/refund`, user.jwt);

  await expect(
    page.getByText(
      'Something went wrong. Please try again. If the issue persists please reach out to our support.',
      { exact: true },
    ),
  ).toBeVisible();
  // Form must not render for non-refundable completed transactions
  await expect(page.locator('input[name="street"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Confirm refund|Request refund/ })).toHaveCount(0);

  const row = await queryOne<{
    chargebackAmount: string | number | null;
    chargebackIban: string | null;
    chargebackAllowedDateUser: string | Date | null;
  }>(
    `SELECT "chargebackAmount", "chargebackIban", "chargebackAllowedDateUser"
     FROM buy_crypto WHERE id = $1`,
    [tx.buyCryptoId],
  );
  expect(row?.chargebackAmount).toBeNull();
  expect(row?.chargebackIban).toBeNull();
  expect(row?.chargebackAllowedDateUser).toBeNull();
});
