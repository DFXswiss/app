/**
 * Pure API/DB smoke tests for the shared e2e factories.
 * No browser — proves each factory lands the expected rows.
 *
 * Run (supervisor):
 *   docker compose -p dfx-e2e-stack -f e2e-stack/compose.yml -f e2e-stack/compose.tests.yml \
 *     run --rm tests factories.spec.ts
 */

import { test, expect } from '@playwright/test';
import { required } from './fixtures';
import { queryOne, withDb } from './fixtures/db';
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
  getForeignKeys,
  resetForeignKeysCache,
  TEST_IBAN,
  trackRow,
} from './fixtures/factories';

test.describe.configure({ mode: 'serial' });

test.describe('e2e factories', () => {
  test.afterAll(async () => {
    await cleanupCreatedData();
  });

  test('trackRow rejects invalid ids before registering cleanup data', () => {
    const invalidIds: Array<{ label: string; value: number }> = [
      { label: 'zero', value: 0 },
      { label: 'negative', value: -7 },
      { label: 'string', value: 'not-an-id' as unknown as number },
    ];

    for (const { label, value } of invalidIds) {
      expect(
        () => trackRow('table_that_does_not_exist_for_require_id_test', value),
        `${label} id must be rejected`,
      ).toThrow(/expected a finite positive integer/);
    }
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
    const createdUser = required(row, 'createUser must insert a user with a user_data row');
    expect(createdUser.kycLevel).toBe(30);
    expect(createdUser.mail).toContain('@dfx.swiss');
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
    expect(issue.supportIssueId, 'createSupportIssue must return a numeric supportIssueId').toBeTruthy();
    expect(required(issue.supportIssueId, 'createSupportIssue must return a supportIssueId')).toBeGreaterThan(0);

    const row = await queryOne<{ id: number; uid: string; type: string }>(
      `SELECT id, uid, type FROM support_issue WHERE uid = $1`,
      [issue.uid],
    );
    expect(row?.type).toBe('GenericIssue');

    const msg = await queryOne<{ id: number }>(`SELECT id FROM support_message WHERE "issueId" = $1 LIMIT 1`, [
      issue.supportIssueId,
    ]);
    expect(msg, 'support_message row must exist for the created issue').toBeTruthy();
  });

  test('createPaymentLink inserts payment_link and payment', async () => {
    const user = await createUser({ tag: 'spec-pl', kycLevel: 30, completePersonalData: true });
    const pl = await createPaymentLink(user.jwt, { amount: 12.5, tag: 'spec-pl' });

    expect(pl.paymentLinkId).toBeGreaterThan(0);
    expect(pl.uniqueId).toBeTruthy();
    expect(pl.paymentId, 'createPaymentLink must return a numeric paymentId').toBeTruthy();
    expect(required(pl.paymentId, 'createPaymentLink must return a paymentId')).toBeGreaterThan(0);

    const link = await queryOne<{ id: number; status: string }>(`SELECT id, status FROM payment_link WHERE id = $1`, [
      pl.paymentLinkId,
    ]);
    expect(link?.status).toBe('Active');

    const pay = await queryOne<{ id: number; amount: number }>(
      `SELECT id, amount FROM payment_link_payment WHERE id = $1`,
      [pl.paymentId],
    );
    expect(pay, 'payment_link_payment row must exist').toBeTruthy();
    expect(Number(pay?.amount)).toBe(12.5);
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

  // Without this regression test, joining key_column_usage to constraint_column_usage only by
  // constraint name could reintroduce a four-entry cross product instead of preserving the two
  // ordinal child-to-parent column pairs in a composite foreign key.
  test('getForeignKeys preserves composite foreign-key column ordinality', async () => {
    try {
      await withDb(async (client) => {
        await client.query(
          `CREATE TABLE e2e_spec_fk_ordinal_parent (
             x integer NOT NULL,
             y integer NOT NULL,
             PRIMARY KEY (x, y)
           )`,
        );
        await client.query(
          `CREATE TABLE e2e_spec_fk_ordinal_child (
             a integer NOT NULL,
             b integer NOT NULL,
             FOREIGN KEY (a, b) REFERENCES e2e_spec_fk_ordinal_parent (x, y)
           )`,
        );
      });

      resetForeignKeysCache();
      const foreignKeys = await getForeignKeys();
      const childPairs = foreignKeys
        .filter((foreignKey) => foreignKey.table === 'e2e_spec_fk_ordinal_child')
        .map((foreignKey) => ({
          column: foreignKey.column,
          referencedColumn: foreignKey.referencedColumn,
        }))
        .sort((left, right) => left.column.localeCompare(right.column));

      expect(childPairs).toEqual([
        { column: 'a', referencedColumn: 'x' },
        { column: 'b', referencedColumn: 'y' },
      ]);
    } finally {
      await withDb(async (client) => {
        await client.query(`DROP TABLE IF EXISTS e2e_spec_fk_ordinal_child`);
        await client.query(`DROP TABLE IF EXISTS e2e_spec_fk_ordinal_parent`);
      });
      resetForeignKeysCache();
    }
  });

  // The raw inserts below bypass createTransaction() on purpose, and that is the whole point of the
  // test: every factory tracks each row it writes, so a chain built through them would be deleted
  // by its own top-level registrations even if the recursion were broken. Writing the children
  // directly reproduces what the application does in production — rows appear under a tracked row
  // that no test registered — and only the descent into the foreign keys can remove them.
  //
  // The cleanup-focused tests must stay at the end of the block: they call cleanupCreatedData()
  // themselves, which empties the process-wide registry that the earlier tests share.
  test('cleanup recursively deletes untracked database children of a tracked user', async () => {
    const user = await createUser({ tag: 'spec-recursive-cleanup' });

    const { transactionId, bankTxId } = await withDb(async (client) => {
      const transactionInsert = await client.query<{ id: number }>(
        `INSERT INTO transaction
           ("sourceType", type, uid, "amountInChf", assets, "amlCheck", "userId", "userDataId", "eventDate", "outputDate")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          'BankTx',
          'BuyCrypto',
          `T${String(user.userId).padStart(16, '0')}`,
          100,
          'CHF',
          'Pass',
          user.userId,
          user.userDataId,
          new Date(),
          new Date(),
        ],
      );
      const transactionId = required(
        transactionInsert.rows[0],
        'raw transaction insert must return an id',
      ).id;

      const bankTxInsert = await client.query<{ id: number }>(
        `INSERT INTO bank_tx
           ("accountServiceRef", amount, currency, "creditDebitIndicator", iban, type,
            "bookingDate", "valueDate", "transactionId", name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          `e2e-recursive-cleanup-${transactionId}`,
          100,
          'CHF',
          'CRDT',
          TEST_IBAN,
          'BuyCrypto',
          new Date(),
          new Date(),
          transactionId,
          'E2E Recursive Cleanup',
        ],
      );
      const bankTxId = required(bankTxInsert.rows[0], 'raw bank_tx insert must return an id').id;

      return { transactionId, bankTxId };
    });

    await cleanupCreatedData();

    const transaction = await queryOne<{ id: number }>(`SELECT id FROM transaction WHERE id = $1`, [
      transactionId,
    ]);
    const bankTx = await queryOne<{ id: number }>(`SELECT id FROM bank_tx WHERE id = $1`, [bankTxId]);
    expect(transaction).toBeUndefined();
    expect(bankTx).toBeUndefined();
  });

  // Without this regression test, the mere schema presence of a self-referencing foreign key
  // could block a safe bulk delete even though none of the candidate rows is actually referenced.
  test('cleanup bulk-deletes a non-id-addressable child with an unused self foreign key', async () => {
    let parentId: number | undefined;
    let registryDrained = false;

    try {
      await withDb(async (client) => {
        await client.query(
          `CREATE TABLE e2e_spec_unused_self_parent (
             id serial PRIMARY KEY
           )`,
        );
        await client.query(
          `CREATE TABLE e2e_spec_unused_self_child (
             parent_id integer NOT NULL REFERENCES e2e_spec_unused_self_parent (id),
             code text NOT NULL UNIQUE,
             predecessor_code text REFERENCES e2e_spec_unused_self_child (code),
             PRIMARY KEY (parent_id, code)
           )`,
        );
      });
      resetForeignKeysCache();

      parentId = await withDb(async (client) => {
        const parentInsert = await client.query<{ id: number }>(
          `INSERT INTO e2e_spec_unused_self_parent DEFAULT VALUES RETURNING id`,
        );
        const insertedParentId = required(
          parentInsert.rows[0],
          'self-reference parent insert must return an id',
        ).id;
        await client.query(
          `INSERT INTO e2e_spec_unused_self_child (parent_id, code, predecessor_code)
           VALUES ($1, $2, $3)`,
          [insertedParentId, 'A', null],
        );
        return insertedParentId;
      });

      trackRow('e2e_spec_unused_self_parent', parentId);
      await cleanupCreatedData();
      registryDrained = true;

      const parent = await queryOne<{ id: number }>(
        `SELECT id FROM e2e_spec_unused_self_parent WHERE id = $1`,
        [parentId],
      );
      const child = await queryOne<{ code: string }>(
        `SELECT code FROM e2e_spec_unused_self_child WHERE parent_id = $1`,
        [parentId],
      );
      expect(parent).toBeUndefined();
      expect(child).toBeUndefined();
    } finally {
      try {
        if (!registryDrained && parentId !== undefined) {
          await withDb(async (client) => {
            await client.query(
              `DELETE FROM e2e_spec_unused_self_child WHERE parent_id = $1`,
              [parentId],
            );
            await client.query(
              `DELETE FROM e2e_spec_unused_self_parent WHERE id = $1`,
              [parentId],
            );
          });
          await cleanupCreatedData();
        }
      } finally {
        await withDb(async (client) => {
          await client.query(`DROP TABLE IF EXISTS e2e_spec_unused_self_child`);
          await client.query(`DROP TABLE IF EXISTS e2e_spec_unused_self_parent`);
        });
        resetForeignKeysCache();
      }
    }
  });

  // Without this regression test, an overly permissive row check could allow a bulk delete even
  // though a candidate row is genuinely referenced through the table's self foreign key.
  test('cleanup rejects a non-id-addressable child with an actual self reference', async () => {
    let parentId: number | undefined;
    let registryDrained = false;

    try {
      await withDb(async (client) => {
        await client.query(
          `CREATE TABLE e2e_spec_actual_self_parent (
             id serial PRIMARY KEY
           )`,
        );
        await client.query(
          `CREATE TABLE e2e_spec_actual_self_child (
             parent_id integer NOT NULL REFERENCES e2e_spec_actual_self_parent (id),
             code text NOT NULL UNIQUE,
             predecessor_code text REFERENCES e2e_spec_actual_self_child (code),
             PRIMARY KEY (parent_id, code)
           )`,
        );
      });
      resetForeignKeysCache();

      parentId = await withDb(async (client) => {
        const parentInsert = await client.query<{ id: number }>(
          `INSERT INTO e2e_spec_actual_self_parent DEFAULT VALUES RETURNING id`,
        );
        const insertedParentId = required(
          parentInsert.rows[0],
          'self-reference parent insert must return an id',
        ).id;
        await client.query(
          `INSERT INTO e2e_spec_actual_self_child (parent_id, code, predecessor_code)
           VALUES ($1, $2, $3), ($1, $4, $5)`,
          [insertedParentId, 'A', null, 'B', 'A'],
        );
        return insertedParentId;
      });

      trackRow('e2e_spec_actual_self_parent', parentId);
      let cleanupError: unknown;
      try {
        await cleanupCreatedData();
      } catch (error) {
        cleanupError = error;
      }

      expect(cleanupError).toBeInstanceOf(AggregateError);
      if (!(cleanupError instanceof AggregateError)) {
        throw new Error('cleanup must throw AggregateError for an actual self reference');
      }
      expect(cleanupError.message).toContain(
        'referenced by itself via a self-referencing foreign key',
      );

      const parent = await queryOne<{ id: number }>(
        `SELECT id FROM e2e_spec_actual_self_parent WHERE id = $1`,
        [parentId],
      );
      const childCount = await queryOne<{ count: number }>(
        `SELECT count(*)::integer AS count
         FROM e2e_spec_actual_self_child
         WHERE parent_id = $1`,
        [parentId],
      );
      expect(parent?.id).toBe(parentId);
      expect(childCount?.count).toBe(2);

      await withDb(async (client) => {
        await client.query(
          `DELETE FROM e2e_spec_actual_self_child WHERE parent_id = $1`,
          [parentId],
        );
        await client.query(
          `DELETE FROM e2e_spec_actual_self_parent WHERE id = $1`,
          [parentId],
        );
      });
      await cleanupCreatedData();
      registryDrained = true;
    } finally {
      try {
        if (!registryDrained && parentId !== undefined) {
          await withDb(async (client) => {
            await client.query(
              `DELETE FROM e2e_spec_actual_self_child WHERE parent_id = $1`,
              [parentId],
            );
            await client.query(
              `DELETE FROM e2e_spec_actual_self_parent WHERE id = $1`,
              [parentId],
            );
          });
          await cleanupCreatedData();
        }
      } finally {
        await withDb(async (client) => {
          await client.query(`DROP TABLE IF EXISTS e2e_spec_actual_self_child`);
          await client.query(`DROP TABLE IF EXISTS e2e_spec_actual_self_parent`);
        });
        resetForeignKeysCache();
      }
    }
  });
});
