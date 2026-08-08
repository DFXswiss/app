/**
 * Pure API/DB smoke tests for the shared e2e factories.
 * No browser — proves each factory lands the expected rows.
 *
 * Run (supervisor):
 *   docker compose -p dfx-e2e-stack -f e2e-stack/compose.yml -f e2e-stack/compose.tests.yml \
 *     run --rm tests factories.spec.ts
 */

import { test, expect } from '@playwright/test';
import { queryOne } from './fixtures/db';
import {
  cleanupCreatedData,
  createBankAccount,
  createBankTx,
  createBuy,
  createCallQueueEntry,
  createKycStep,
  createLimitRequest,
  createMrosCase,
  createPaymentLink,
  createSell,
  createSupportIssue,
  createSwap,
  createTransaction,
  createUser,
  TEST_IBAN,
} from './fixtures/factories';

test.describe.configure({ mode: 'serial' });

test.describe('e2e factories', () => {
  test.afterAll(async () => {
    await cleanupCreatedData();
  });

  test('createUser registers a wallet user and optional KYC level', async () => {
    const user = await createUser({
      tag: 'spec-user',
      mail: undefined,
      language: 'EN',
      country: 'CH',
      kycLevel: 30,
      completePersonalData: true,
    });

    expect(user.userId).toBeGreaterThan(0);
    expect(user.userDataId).toBeGreaterThan(0);
    expect(user.jwt).toBeTruthy();
    expect(user.address).toMatch(/^0x/i);

    const row = await queryOne<{ id: number; kycLevel: number; mail: string }>(
      `SELECT u.id, ud."kycLevel" AS "kycLevel", ud.mail
       FROM "user" u
       JOIN user_data ud ON ud.id = u."userDataId"
       WHERE u.id = $1`,
      [user.userId],
    );
    expect(row).toBeTruthy();
    expect(row!.kycLevel).toBe(30);
    expect(row!.mail).toContain('@dfx.swiss');
  });

  test('createBankAccount stores bank_data with test IBAN', async () => {
    const user = await createUser({ tag: 'spec-ba' });
    const ba = await createBankAccount(user.jwt, { iban: TEST_IBAN, label: 'E2E BA' });

    expect(ba.bankAccountId).toBeGreaterThan(0);
    expect(ba.iban.replace(/\s/g, '')).toBe(TEST_IBAN);

    const row = await queryOne<{ id: number; iban: string }>(`SELECT id, iban FROM bank_data WHERE id = $1`, [
      ba.bankAccountId,
    ]);
    expect(row?.iban.replace(/\s/g, '')).toBe(TEST_IBAN);
  });

  test('createBuy creates a buy route row', async () => {
    const user = await createUser({ tag: 'spec-buy', kycLevel: 30, completePersonalData: true });
    const buy = await createBuy(user.jwt);

    expect(buy.buyId).toBeGreaterThan(0);

    const row = await queryOne<{ id: number; active: boolean }>(`SELECT id, active FROM buy WHERE id = $1`, [
      buy.buyId,
    ]);
    expect(row?.id).toBe(buy.buyId);
    expect(row?.active).toBe(true);
  });

  test('createSell creates a sell (deposit_route) row', async () => {
    const user = await createUser({ tag: 'spec-sell', kycLevel: 30, completePersonalData: true });
    const sell = await createSell(user.jwt, { blockchain: 'Ethereum' });

    expect(sell.sellId).toBeGreaterThan(0);

    const row = await queryOne<{ id: number; type: string; iban: string }>(
      `SELECT id, type, iban FROM deposit_route WHERE id = $1`,
      [sell.sellId],
    );
    expect(row?.type).toBe('Sell');
    expect(row?.iban?.replace(/\s/g, '')).toBe(TEST_IBAN);
  });

  test('createSwap creates a crypto deposit_route row', async () => {
    const user = await createUser({ tag: 'spec-swap', kycLevel: 30, completePersonalData: true });
    const swap = await createSwap(user.jwt, { blockchain: 'Ethereum' });

    expect(swap.swapId).toBeGreaterThan(0);

    const row = await queryOne<{ id: number; type: string }>(`SELECT id, type FROM deposit_route WHERE id = $1`, [
      swap.swapId,
    ]);
    expect(row?.type).toBe('Crypto');
  });

  test('createTransaction writes completed buy_crypto + bank_tx + transaction', async () => {
    const tx = await createTransaction({ state: 'completed_buy', tag: 'spec-tx' });

    expect(tx.transactionId).toBeGreaterThan(0);
    expect(tx.buyCryptoId).toBeGreaterThan(0);
    expect(tx.bankTxId).toBeGreaterThan(0);

    const tRow = await queryOne<{ id: number; uid: string; sourceType: string }>(
      `SELECT id, uid, "sourceType" AS "sourceType" FROM transaction WHERE id = $1`,
      [tx.transactionId],
    );
    expect(tRow?.uid).toBe(tx.uid);
    expect(tRow?.sourceType).toBe('BankTx');

    const bc = await queryOne<{ id: number; isComplete: boolean; status: string }>(
      `SELECT id, "isComplete" AS "isComplete", status FROM buy_crypto WHERE id = $1`,
      [tx.buyCryptoId],
    );
    expect(bc?.isComplete).toBe(true);
    expect(bc?.status).toBe('Complete');

    const btx = await queryOne<{ id: number }>(`SELECT id FROM bank_tx WHERE id = $1`, [tx.bankTxId]);
    expect(btx?.id).toBe(tx.bankTxId);
  });

  test('createBankTx inserts a bank booking row', async () => {
    const btx = await createBankTx({ tag: 'spec-btx', amount: 99 });

    expect(btx.bankTxId).toBeGreaterThan(0);

    const row = await queryOne<{ id: number; accountServiceRef: string; amount: number }>(
      `SELECT id, "accountServiceRef" AS "accountServiceRef", amount FROM bank_tx WHERE id = $1`,
      [btx.bankTxId],
    );
    expect(row?.accountServiceRef).toBe(btx.accountServiceRef);
    expect(Number(row?.amount)).toBe(99);
  });

  test('createSupportIssue creates support_issue + message', async () => {
    const user = await createUser({ tag: 'spec-issue' });
    const issue = await createSupportIssue(user.jwt, {
      name: 'Factory spec ticket',
      message: 'Hello from factories.spec',
    });

    expect(issue.uid).toBeTruthy();

    const row = await queryOne<{ id: number; uid: string; type: string }>(
      `SELECT id, uid, type FROM support_issue WHERE uid = $1`,
      [issue.uid],
    );
    expect(row?.type).toBe('GenericIssue');

    if (issue.supportIssueId) {
      const msg = await queryOne<{ id: number }>(`SELECT id FROM support_message WHERE "issueId" = $1 LIMIT 1`, [
        issue.supportIssueId,
      ]);
      expect(msg).toBeTruthy();
    }
  });

  test('createPaymentLink inserts payment_link and payment', async () => {
    const user = await createUser({ tag: 'spec-pl', kycLevel: 30, completePersonalData: true });
    const pl = await createPaymentLink(user.jwt, { amount: 12.5, tag: 'spec-pl' });

    expect(pl.paymentLinkId).toBeGreaterThan(0);
    expect(pl.uniqueId).toBeTruthy();

    const link = await queryOne<{ id: number; status: string }>(`SELECT id, status FROM payment_link WHERE id = $1`, [
      pl.paymentLinkId,
    ]);
    expect(link?.status).toBe('Active');

    if (pl.paymentId) {
      const pay = await queryOne<{ id: number; amount: number }>(
        `SELECT id, amount FROM payment_link_payment WHERE id = $1`,
        [pl.paymentId],
      );
      expect(Number(pay?.amount)).toBe(12.5);
    }
  });

  test('createKycStep inserts kyc_step for user_data', async () => {
    const user = await createUser({ tag: 'spec-kyc' });
    const step = await createKycStep(user.userDataId, {
      name: 'PersonalData',
      status: 'InProgress',
    });

    expect(step.kycStepId).toBeGreaterThan(0);

    const row = await queryOne<{ id: number; name: string; status: string }>(
      `SELECT id, name, status FROM kyc_step WHERE id = $1`,
      [step.kycStepId],
    );
    expect(row?.name).toBe('PersonalData');
    expect(row?.status).toBe('InProgress');
  });

  test('createLimitRequest creates limit_request (via issue or SQL)', async () => {
    const lr = await createLimitRequest({ tag: 'spec-limit', limit: 75000 });

    expect(lr.limitRequestId).toBeGreaterThan(0);

    const row = await queryOne<{ id: number; limit: number }>(
      `SELECT id, "limit" AS limit FROM limit_request WHERE id = $1`,
      [lr.limitRequestId],
    );
    expect(row?.id).toBe(lr.limitRequestId);
    expect(Number(row?.limit)).toBe(75000);
  });

  test('createMrosCase inserts mros row', async () => {
    const mros = await createMrosCase({ tag: 'spec-mros', reason: 'spec case' });

    expect(mros.mrosId).toBeGreaterThan(0);

    const row = await queryOne<{ id: number; status: string; caseManager: string }>(
      `SELECT id, status, "caseManager" AS "caseManager" FROM mros WHERE id = $1`,
      [mros.mrosId],
    );
    expect(row?.status).toBe('Draft');
    expect(row?.caseManager).toBe('e2e-case-manager');
  });

  test('createCallQueueEntry sets phoneCallStatus on user_data', async () => {
    const entry = await createCallQueueEntry({
      tag: 'spec-callq',
      phoneCallStatus: 'Unavailable',
    });

    expect(entry.userDataId).toBeGreaterThan(0);

    const row = await queryOne<{ phoneCallStatus: string }>(
      `SELECT "phoneCallStatus" AS "phoneCallStatus" FROM user_data WHERE id = $1`,
      [entry.userDataId],
    );
    expect(row?.phoneCallStatus).toBe('Unavailable');
  });
});
