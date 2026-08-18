import { createHash } from 'crypto';
import { expect, openScreen, queryOne, queryRows, required, test } from './fixtures';
import {
  createUser,
  createBankAccount,
  createBuy,
  createTransaction,
  cleanupCreatedData,
  TEST_IBAN,
} from './fixtures/factories';

const ACTION_SECRET = 'ab'.repeat(32);

async function seedActionSecret(uid: string, secret = ACTION_SECRET): Promise<void> {
  const actionSecretHash = createHash('sha256').update(secret).digest('hex');
  await queryRows(`UPDATE transaction SET "actionSecretHash" = $1 WHERE uid = $2`, [actionSecretHash, uid]);
}

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
  const secondBuy = await createBuy(user.jwt, {
    assetId: required(secondAsset, 'seed must provide a buyable non-Ethereum asset').id,
  });
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

  // Row title containers use this exact class combo (transaction.screen.tsx StyledCollapsible
  // titleContent) and are siblings, not nested inside each other -- unlike a bare `div` filter,
  // which also matches enclosing list/date-group containers and can hand back type/status text
  // belonging to a different transaction than the one identified by amount+asset.
  const buyRow = page
    .locator('div.flex.flex-row.gap-2.items-center')
    .filter({ hasText: '111' })
    .filter({ hasText: 'CHF' })
    .first();
  await expect(buyRow).toBeVisible();
  await expect(buyRow.getByText('Buy', { exact: true }).first()).toBeVisible();
  await expect(buyRow.getByText('Completed', { exact: true }).first()).toBeVisible();

  const sellRow = page
    .locator('div.flex.flex-row.gap-2.items-center')
    .filter({ hasText: '222' })
    .filter({ hasText: 'ETH' })
    .first();
  await expect(sellRow).toBeVisible();
  await expect(sellRow.getByText('Sell', { exact: true }).first()).toBeVisible();
  await expect(sellRow.getByText('DFX check pending', { exact: true }).first()).toBeVisible();

  const pendingRow = page
    .locator('div.flex.flex-row.gap-2.items-center')
    .filter({ hasText: '333' })
    .filter({ hasText: 'CHF' })
    .first();
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

test("transaction list does not show another user's transactions", async ({ page }) => {
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

// Minimal valid-looking PDF bytes as base64 for the fulfilled invoice PUT body.
// The suite only needs the frontend to accept { pdfData }; it does not render the PDF.
const MINIMAL_PDF_B64 = Buffer.from('%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF').toString('base64');

test('Open invoice is shown on a completed CHF buy and hidden on pending buy and sell', async ({ page }) => {
  const user = await createUser({
    tag: 'tx-list-invoice-vis',
    kycLevel: 30,
    completePersonalData: true,
  });

  await createTransaction({
    state: 'completed_buy',
    tag: 'tx-inv-vis-done',
    userId: user.userId,
    userDataId: user.userDataId,
    jwt: user.jwt,
    amount: 701,
    inputAsset: 'CHF',
  });
  const secondAsset = await queryOne<{ id: number }>(
    `SELECT id FROM asset WHERE buyable = true AND blockchain != 'Ethereum' ORDER BY id ASC LIMIT 1`,
  );
  const secondBuy = await createBuy(user.jwt, {
    assetId: required(secondAsset, 'seed must provide a buyable non-Ethereum asset').id,
  });
  await createTransaction({
    state: 'pending_buy',
    tag: 'tx-inv-vis-pend',
    userId: user.userId,
    userDataId: user.userDataId,
    jwt: user.jwt,
    amount: 702,
    inputAsset: 'CHF',
    buyId: secondBuy.buyId,
  });
  await createTransaction({
    state: 'pending_sell',
    tag: 'tx-inv-vis-sell',
    userId: user.userId,
    userDataId: user.userDataId,
    jwt: user.jwt,
    amount: 703,
  });

  await openScreen(page, '/tx', user.jwt);

  const completedRow = page
    .locator('div.flex.flex-row.gap-2.items-center')
    .filter({ hasText: '701' })
    .filter({ hasText: 'CHF' })
    .first();
  const pendingBuyRow = page
    .locator('div.flex.flex-row.gap-2.items-center')
    .filter({ hasText: '702' })
    .filter({ hasText: 'CHF' })
    .first();
  const sellRow = page
    .locator('div.flex.flex-row.gap-2.items-center')
    .filter({ hasText: '703' })
    .filter({ hasText: 'ETH' })
    .first();

  // Expand completed buy → Open invoice must be available.
  await completedRow.click();
  await expect(page.getByRole('button', { name: 'Open invoice' })).toBeVisible();
  // Collapse so pending/sell expanded content is the only place a button could appear.
  await completedRow.click();

  // Pending buy: no Open invoice.
  await pendingBuyRow.click();
  await expect(page.getByRole('button', { name: 'Open invoice' })).toHaveCount(0);
  await pendingBuyRow.click();

  // Sell: no Open invoice.
  await sellRow.click();
  await expect(page.getByRole('button', { name: 'Open invoice' })).toHaveCount(0);
});

test('Open invoice click opens a tab before the invoice PUT returns', async ({ page }) => {
  const user = await createUser({
    tag: 'tx-list-invoice-tab',
    kycLevel: 30,
    completePersonalData: true,
  });
  await createTransaction({
    state: 'completed_buy',
    tag: 'tx-inv-tab',
    userId: user.userId,
    userDataId: user.userDataId,
    jwt: user.jwt,
    amount: 711,
    inputAsset: 'CHF',
  });

  await openScreen(page, '/tx', user.jwt);

  // Delay the invoice PUT so a post-await window.open would miss the user gesture window.
  // Old code (open after await) fails this 800ms popup wait against a 2000ms delayed response.
  await page.route('**/v1/transaction/*/invoice', async (route) => {
    await new Promise((r) => setTimeout(r, 2000));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ pdfData: MINIMAL_PDF_B64 }),
    });
  });

  const buyRow = page
    .locator('div.flex.flex-row.gap-2.items-center')
    .filter({ hasText: '711' })
    .filter({ hasText: 'CHF' })
    .first();
  await buyRow.click();

  const openInvoice = page.getByRole('button', { name: 'Open invoice' });
  await expect(openInvoice).toBeVisible();

  const popupPromise = page.waitForEvent('popup', { timeout: 800 });
  await openInvoice.click();
  const popup = await popupPromise;

  expect(popup.url()).toMatch(/about:blank|blob:/);
});

test('Open invoice error closes the reserved tab and shows the API message', async ({ page }) => {
  const user = await createUser({
    tag: 'tx-list-invoice-err',
    kycLevel: 30,
    completePersonalData: true,
  });
  await createTransaction({
    state: 'completed_buy',
    tag: 'tx-inv-err',
    userId: user.userId,
    userDataId: user.userDataId,
    jwt: user.jwt,
    amount: 721,
    inputAsset: 'CHF',
  });

  await openScreen(page, '/tx', user.jwt);

  await page.route('**/v1/transaction/*/invoice', async (route) => {
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Missing invoice information' }),
    });
  });

  const buyRow = page
    .locator('div.flex.flex-row.gap-2.items-center')
    .filter({ hasText: '721' })
    .filter({ hasText: 'CHF' })
    .first();
  await buyRow.click();

  const openInvoice = page.getByRole('button', { name: 'Open invoice' });
  await expect(openInvoice).toBeVisible();

  const popupPromise = page.waitForEvent('popup');
  await openInvoice.click();
  const popup = await popupPromise;

  // ErrorHint surfaces the API message (no data-testid on the real component).
  await expect(page.getByText('Missing invoice information', { exact: true })).toBeVisible();
  // Reserved tab is closed in the catch path (preview?.close()).
  await expect.poll(() => popup.isClosed()).toBe(true);
});

test('Open receipt click opens a tab before the receipt request returns', async ({ page }) => {
  const user = await createUser({
    tag: 'tx-list-receipt-tab',
    kycLevel: 30,
    completePersonalData: true,
  });
  await createTransaction({
    state: 'completed_buy',
    tag: 'tx-rcpt-tab',
    userId: user.userId,
    userDataId: user.userDataId,
    jwt: user.jwt,
    amount: 731,
    inputAsset: 'CHF',
  });

  await openScreen(page, '/tx', user.jwt);

  // Delay the receipt route so a post-await window.open would miss the user gesture window.
  // Old code (open after await) fails this 800ms popup wait against a 2000ms delayed response.
  await page.route('**/v1/transaction/*/receipt*', async (route) => {
    await new Promise((r) => setTimeout(r, 2000));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ pdfData: MINIMAL_PDF_B64 }),
    });
  });

  const buyRow = page
    .locator('div.flex.flex-row.gap-2.items-center')
    .filter({ hasText: '731' })
    .filter({ hasText: 'CHF' })
    .first();
  await buyRow.click();

  const openReceipt = page.getByRole('button', { name: 'Open receipt' });
  await expect(openReceipt).toBeVisible();

  const popupPromise = page.waitForEvent('popup', { timeout: 800 });
  await openReceipt.click();
  const popup = await popupPromise;

  expect(popup.url()).toMatch(/about:blank|blob:/);
});

test('Open receipt error closes the reserved tab and shows the API message', async ({ page }) => {
  const user = await createUser({
    tag: 'tx-list-receipt-err',
    kycLevel: 30,
    completePersonalData: true,
  });
  await createTransaction({
    state: 'completed_buy',
    tag: 'tx-rcpt-err',
    userId: user.userId,
    userDataId: user.userDataId,
    jwt: user.jwt,
    amount: 741,
    inputAsset: 'CHF',
  });

  await openScreen(page, '/tx', user.jwt);

  await page.route('**/v1/transaction/*/receipt*', async (route) => {
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Missing receipt information' }),
    });
  });

  const buyRow = page
    .locator('div.flex.flex-row.gap-2.items-center')
    .filter({ hasText: '741' })
    .filter({ hasText: 'CHF' })
    .first();
  await buyRow.click();

  const openReceipt = page.getByRole('button', { name: 'Open receipt' });
  await expect(openReceipt).toBeVisible();

  const popupPromise = page.waitForEvent('popup');
  await openReceipt.click();
  const popup = await popupPromise;

  await expect(page.getByText('Missing receipt information', { exact: true })).toBeVisible();
  await expect.poll(() => popup.isClosed()).toBe(true);
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
    page.getByText('Something went wrong. Please try again. If the issue persists please reach out to our support.', {
      exact: true,
    }),
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
    [required(baRow, 'created bank_data row must exist').iban, 444, unassigned.bankTxId],
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

test('public uid assign route opens the guest assign form and assigns to the single buy target', async ({
  page,
}) => {
  const user = await createUser({
    tag: 'tx-assign-uid',
    kycLevel: 30,
    completePersonalData: true,
  });
  const ba = await createBankAccount(user.jwt, { iban: TEST_IBAN, label: 'Assign UID IBAN' });
  const baRow = await queryOne<{ iban: string }>('SELECT iban FROM bank_data WHERE id = $1', [ba.bankAccountId]);
  const buy = await createBuy(user.jwt);
  const unassigned = await createTransaction({
    state: 'bank_tx_only',
    tag: 'tx-assign-uid',
    userId: user.userId,
    userDataId: user.userDataId,
    amount: 445,
  });
  await queryRows(
    `UPDATE bank_tx SET "senderAccount" = $1, "txAmount" = $2, "txCurrency" = 'CHF', type = 'Unknown'
     WHERE id = $3`,
    [required(baRow, 'created bank_data row must exist').iban, 445, unassigned.bankTxId],
  );
  await seedActionSecret(unassigned.uid);

  // Cover /tx/:id/:secret (status with action secret) before the unauthenticated guest assign form.
  await openScreen(page, `/tx/${unassigned.uid}/${ACTION_SECRET}`, user.jwt);
  await expect(page.getByRole('button', { name: 'Assign transaction' })).toBeVisible();

  await page.context().clearCookies();
  await page.goto(`/tx/${unassigned.uid}/${ACTION_SECRET}/assign`);
  await page.waitForLoadState('networkidle');

  await expect(page.getByRole('heading', { name: 'Assign transaction', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your Transactions', exact: true })).not.toBeVisible();

  const assignBtn = page.getByRole('button', { name: 'Assign transaction' });
  await expect(assignBtn).toBeVisible();
  await assignBtn.click();

  await expect(page).toHaveURL(new RegExp(`/tx/${unassigned.uid}$`));

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

test("assign route for another user's unassigned tx leaves list empty of that row and DB unchanged", async ({
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
    [required(baRow, 'created bank_data row must exist').iban, 445, unassigned.bankTxId],
  );

  const before = await queryOne<{ type: string }>(`SELECT type FROM bank_tx WHERE id = $1`, [unassigned.bankTxId]);

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
  await seedActionSecret(tx.uid);

  await page.context().clearCookies();
  await page.goto(`/tx/${tx.uid}/${ACTION_SECRET}/refund`);
  await page.waitForLoadState('networkidle');

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

  await expect(page).toHaveURL(new RegExp(`/tx/${tx.uid}$`));
  expect(new URL(page.url()).pathname).toBe(`/tx/${tx.uid}`);

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
  await seedActionSecret(tx.uid);

  await page.context().clearCookies();
  await page.goto(`/tx/${tx.uid}/${ACTION_SECRET}/refund`);
  await page.waitForLoadState('networkidle');

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
  await seedActionSecret(tx.uid);

  await page.context().clearCookies();
  await page.goto(`/tx/${tx.uid}/${ACTION_SECRET}/refund`);
  await page.waitForLoadState('networkidle');

  await expect(
    page.getByText('Something went wrong. Please try again. If the issue persists please reach out to our support.', {
      exact: true,
    }),
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
