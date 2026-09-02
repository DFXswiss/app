/**
 * Proves the ident-complete continue race against the real API and Postgres.
 *
 * Production failure: after Sumsub ident finished, the client fired many overlapping
 * PUT /v2/kyc calls; one FinancialData insert won and the rest hit the unique index.
 *
 * Lowest layer that can express that: 13 parallel continues against a live API and
 * Postgres. FinancialData has a NULL type, so the unique index only conflicts when it is
 * NULLS NOT DISTINCT (production). The harness schema comes from synchronize, so this file
 * recreates that index before the burst. All HTTP 200 plus COUNT=1 would also pass on the
 * old duplicate-key retry path; xact_rollback must stay flat because a unique-violation
 * aborts the initiateStep transaction.
 */

import {
  cleanupCreatedData,
  createKycStep,
  createUser,
  expect,
  queryOne,
  queryRows,
  test,
  withDb,
} from './fixtures';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await ensureKycStepUniqueNullsNotDistinct();
});

test.afterAll(async () => {
  await cleanupCreatedData();
});

const PARALLEL_CONTINUES = 13;
/** Trusted client IP for loc realIp middleware (`cf-connecting-ip`). */
const TFA_IP = '203.0.113.7';
/** Production unique index on kyc_step (userDataId, name, type, sequenceNumber). */
const KYC_STEP_UNIQUE_INDEX = 'IDX_3a1150791476264753a67212a1';

function apiBase(): string {
  return process.env.E2E_API_URL ?? 'http://api:3000';
}

async function kycHashOf(userDataId: number): Promise<string> {
  const row = await queryOne<{ kycHash: string }>(`SELECT "kycHash" FROM user_data WHERE id = $1`, [userDataId]);
  if (!row?.kycHash) throw new Error(`user_data.kycHash missing for userDataId ${userDataId}`);
  return row.kycHash;
}

async function countSteps(userDataId: number, name: string): Promise<number> {
  const row = await queryOne<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM kyc_step WHERE "userDataId" = $1 AND name = $2`,
    [userDataId, name],
  );
  return Number(row?.n ?? 0);
}

async function rollbackCount(): Promise<number> {
  const row = await queryOne<{ n: string }>(
    `SELECT xact_rollback::text AS n FROM pg_stat_database WHERE datname = current_database()`,
  );
  return Number(row?.n ?? 0);
}

/**
 * Synchronize does not apply FixNullableUniqueIndexes. Recreate the production unique index
 * so NULL `type` on FinancialData actually conflicts (otherwise COUNT=1 is the only signal
 * and xact_rollback never moves).
 */
async function ensureKycStepUniqueNullsNotDistinct(): Promise<void> {
  await withDb(async (client) => {
    const { rows } = await client.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'kyc_step'`,
    );
    for (const idx of rows) {
      const def = idx.indexdef.toLowerCase();
      if (
        def.includes('unique') &&
        def.includes('userdataid') &&
        def.includes('sequencenumber') &&
        (def.includes('"type"') || def.includes(', type,') || def.includes('(type'))
      ) {
        await client.query(`DROP INDEX IF EXISTS "${idx.indexname}"`);
      }
    }
    await client.query(
      `CREATE UNIQUE INDEX "${KYC_STEP_UNIQUE_INDEX}" ON "kyc_step" ("userDataId", "name", "type", "sequenceNumber") NULLS NOT DISTINCT`,
    );
  });
  const row = await queryOne<{ indexdef: string }>(`SELECT indexdef FROM pg_indexes WHERE indexname = $1`, [
    KYC_STEP_UNIQUE_INDEX,
  ]);
  expect(row?.indexdef ?? '').toMatch(/NULLS NOT DISTINCT/i);
}

async function ensureCompletedStep(
  userDataId: number,
  name: string,
  extra: { type?: string | null; result?: string | null } = {},
): Promise<void> {
  const existing = await queryOne<{ id: number }>(
    `SELECT id FROM kyc_step WHERE "userDataId" = $1 AND name = $2 ORDER BY id LIMIT 1`,
    [userDataId, name],
  );
  if (existing) {
    await withDb(async (client) => {
      await client.query(
        `UPDATE kyc_step SET status = 'Completed', result = COALESCE($2, result), updated = NOW() WHERE id = $1`,
        [existing.id, extra.result ?? null],
      );
    });
    return;
  }
  await createKycStep(userDataId, {
    name,
    status: 'Completed',
    sequenceNumber: 0,
    type: extra.type,
    result: extra.result,
  });
}

async function seedPriorSteps(userDataId: number): Promise<void> {
  // Signup/mail already inserts ContactData. Re-inserting the same NULL-type row only
  // succeeds on the synchronize unique index; production NULLS NOT DISTINCT rejects it.
  await ensureCompletedStep(userDataId, 'ContactData');
  await ensureCompletedStep(userDataId, 'PersonalData');
  await ensureCompletedStep(userDataId, 'NationalityData', {
    result: JSON.stringify({ nationality: { symbol: 'CH' } }),
  });
  await withDb(async (client) => {
    await client.query(`UPDATE user_data SET "tradeApprovalDate" = NOW() WHERE id = $1`, [userDataId]);
  });
}

async function seedIdentCompleted(tag: string): Promise<{ userDataId: number; kycHash: string }> {
  const user = await createUser({
    tag,
    language: 'EN',
    country: 'CH',
    kycLevel: 30,
    completePersonalData: true,
  });
  await seedPriorSteps(user.userDataId);
  await ensureCompletedStep(user.userDataId, 'Ident', { type: 'SumsubAuto' });
  return { userDataId: user.userDataId, kycHash: await kycHashOf(user.userDataId) };
}

async function markStrictTfa(userDataId: number): Promise<void> {
  // continue() requires a STRICT TfaLog for the request IP once FinancialData/Ident is in progress.
  await withDb(async (client) => {
    for (const ip of [TFA_IP, '127.0.0.1', '::1', '::ffff:127.0.0.1', 'unknown']) {
      await client.query(
        `INSERT INTO kyc_log (type, comment, "userDataId", "ipAddress", created, updated)
         VALUES ('TfaLog', 'Strict (App)', $1, $2, NOW(), NOW())`,
        [userDataId, ip],
      );
    }
  });
}

async function putContinue(kycHash: string): Promise<{ status: number }> {
  const res = await fetch(`${apiBase()}/v2/kyc`, {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'x-kyc-code': kycHash,
      'cf-connecting-ip': TFA_IP,
    },
  });
  return { status: res.status };
}

test('13 parallel PUT /v2/kyc after ident create exactly one FinancialData step', async () => {
  const user = await seedIdentCompleted('continue-race-api');
  await markStrictTfa(user.userDataId);
  expect(await countSteps(user.userDataId, 'FinancialData')).toBe(0);

  const rollbacksBefore = await rollbackCount();
  const results = await Promise.all(Array.from({ length: PARALLEL_CONTINUES }, () => putContinue(user.kycHash)));

  const statuses = results.map((r) => r.status);
  expect(
    statuses.every((s) => s === 200),
    `continue statuses: ${statuses.join(',')}`,
  ).toBe(true);
  expect(await countSteps(user.userDataId, 'FinancialData')).toBe(1);

  const rows = await queryRows<{ id: number; status: string }>(
    `SELECT id, status FROM kyc_step WHERE "userDataId" = $1 AND name = 'FinancialData' ORDER BY id`,
    [user.userDataId],
  );
  expect(rows).toHaveLength(1);

  const rollbacksAfter = await rollbackCount();
  expect(rollbacksAfter - rollbacksBefore).toBe(0);
});

test('a fourteenth continue after the burst still leaves one FinancialData step', async () => {
  const user = await seedIdentCompleted('continue-race-fourteenth');
  await markStrictTfa(user.userDataId);

  const burst = await Promise.all(Array.from({ length: PARALLEL_CONTINUES }, () => putContinue(user.kycHash)));
  const fourteenth = await putContinue(user.kycHash);
  const statuses = [...burst.map((r) => r.status), fourteenth.status];

  expect(
    statuses.every((s) => s === 200),
    `continue statuses: ${statuses.join(',')}`,
  ).toBe(true);
  expect(await countSteps(user.userDataId, 'FinancialData')).toBe(1);
});

test('two users racing 13 continues each still get one FinancialData step apiece', async () => {
  // Still one FinancialData per user under load. Does not distinguish a per-user advisory
  // lock from a process-wide mutex; the production incident is one user, 13 continues.
  const userA = await seedIdentCompleted('continue-race-two-a');
  const userB = await seedIdentCompleted('continue-race-two-b');
  await markStrictTfa(userA.userDataId);
  await markStrictTfa(userB.userDataId);

  const results = await Promise.all([
    ...Array.from({ length: PARALLEL_CONTINUES }, () => putContinue(userA.kycHash)),
    ...Array.from({ length: PARALLEL_CONTINUES }, () => putContinue(userB.kycHash)),
  ]);

  const statuses = results.map((r) => r.status);
  expect(
    statuses.every((s) => s === 200),
    `continue statuses: ${statuses.join(',')}`,
  ).toBe(true);
  expect(await countSteps(userA.userDataId, 'FinancialData')).toBe(1);
  expect(await countSteps(userB.userDataId, 'FinancialData')).toBe(1);
});
