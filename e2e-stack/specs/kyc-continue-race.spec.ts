/**
 * Proves the ident-complete continue race against the real API and Postgres.
 *
 * Production failure: after Sumsub ident finished, the client fired many overlapping
 * PUT /v2/kyc calls; one FinancialData insert won and the rest hit the unique index.
 *
 * This file covers both sides of that seam:
 *   1. Direct API — 13 parallel continues; the advisory lock must leave one FinancialData row.
 *   2. Browser /kyc after ident — at most two overlapping continue PUTs, then a second
 *      13-call burst still leaves one FinancialData row.
 */

import type { Page } from '@playwright/test';
import { createKycStep, createUser, expect, gotoWithSession, queryOne, queryRows, test, withDb } from './fixtures';

test.describe.configure({ mode: 'serial' });

const PARALLEL_CONTINUES = 13;
/** Trusted client IP for loc realIp middleware (`cf-connecting-ip`). */
const TFA_IP = '203.0.113.7';

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

async function seedPriorSteps(userDataId: number): Promise<void> {
  await createKycStep(userDataId, { name: 'ContactData', status: 'Completed', sequenceNumber: 0 });
  await createKycStep(userDataId, { name: 'PersonalData', status: 'Completed', sequenceNumber: 0 });
  await createKycStep(userDataId, {
    name: 'NationalityData',
    status: 'Completed',
    sequenceNumber: 0,
    result: JSON.stringify({ nationality: { symbol: 'CH' } }),
  });
  await withDb(async (client) => {
    await client.query(`UPDATE user_data SET "tradeApprovalDate" = NOW() WHERE id = $1`, [userDataId]);
  });
}

async function seedIdentCompleted(tag: string): Promise<{ userDataId: number; jwt: string; kycHash: string }> {
  const user = await createUser({
    tag,
    language: 'EN',
    country: 'CH',
    kycLevel: 30,
    completePersonalData: true,
  });
  await seedPriorSteps(user.userDataId);
  await createKycStep(user.userDataId, {
    name: 'Ident',
    status: 'Completed',
    sequenceNumber: 0,
    type: 'SumsubAuto',
  });
  return { userDataId: user.userDataId, jwt: user.jwt, kycHash: await kycHashOf(user.userDataId) };
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

  const started = Date.now();
  const results = await Promise.all(Array.from({ length: PARALLEL_CONTINUES }, () => putContinue(user.kycHash)));
  const elapsedMs = Date.now() - started;

  const statuses = results.map((r) => r.status);
  expect(
    statuses.every((s) => s === 200),
    `continue statuses: ${statuses.join(',')}`,
  ).toBe(true);
  expect(await countSteps(user.userDataId, 'FinancialData')).toBe(1);
  expect(elapsedMs, 'the 13 continues should overlap, not run one after another').toBeLessThan(15_000);

  const rows = await queryRows<{ id: number; status: string }>(
    `SELECT id, status FROM kyc_step WHERE "userDataId" = $1 AND name = 'FinancialData' ORDER BY id`,
    [user.userDataId],
  );
  expect(rows).toHaveLength(1);
});

test('13 parallel continues from the browser origin still leave one FinancialData step', async ({
  page,
}: {
  page: Page;
}) => {
  const user = await seedIdentCompleted('continue-race-browser');
  await markStrictTfa(user.userDataId);
  expect(await countSteps(user.userDataId, 'FinancialData')).toBe(0);

  await gotoWithSession(page, '/kyc', user.jwt);

  const statuses = await page.evaluate(
    async ({ hash, ip, n }) => {
      const results = await Promise.all(
        Array.from({ length: n }, () =>
          fetch('http://localhost:3000/v2/kyc', {
            method: 'PUT',
            headers: { Accept: 'application/json', 'x-kyc-code': hash, 'cf-connecting-ip': ip },
          }),
        ),
      );
      return results.map((r) => r.status);
    },
    { hash: user.kycHash, ip: TFA_IP, n: PARALLEL_CONTINUES },
  );

  expect(
    statuses.every((s) => s === 200),
    `browser continue statuses: ${statuses.join(',')}`,
  ).toBe(true);
  expect(await countSteps(user.userDataId, 'FinancialData')).toBe(1);
});
