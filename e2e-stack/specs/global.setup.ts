/**
 * Playwright 1.56 project-dependency setup project pattern:
 * playwright.config.ts declares projects[name=setup] with testMatch: /global\.setup\.ts/
 * and the chromium project depends on it. Seeding logic below does not use expect();
 * only the thin `setup(...)` wrapper is required by the project-as-test convention.
 */
import { test as setup } from '@playwright/test';
import { ethers } from 'ethers';
import { Client } from 'pg';
import type { ClientConfig } from 'pg';
import { loginAs } from './fixtures/auth';
import { queryOne, withDb } from './fixtures/db';

const EVM_BLOCKCHAINS = 'Ethereum;Sepolia;BinanceSmartChain;Arbitrum;Optimism;Polygon;Base;Gnosis;Haqq';

function apiBase(): string {
  return process.env.E2E_API_URL ?? 'http://api:3000';
}

function depositMnemonic(): string {
  const seed = process.env.E2E_EVM_DEPOSIT_SEED;
  if (!seed) {
    throw new Error(
      'E2E_EVM_DEPOSIT_SEED is not set (expected a dedicated, deterministic test mnemonic set via compose.tests.yml — not the well-known public Hardhat/Anvil test mnemonic)',
    );
  }
  return seed;
}

function dbConfig(): ClientConfig {
  return {
    host: process.env.E2E_PG_HOST ?? 'sql-dfx-api-loc',
    port: Number(process.env.E2E_PG_PORT ?? '5432'),
    user: process.env.E2E_PG_USER ?? 'sa',
    password: process.env.E2E_PG_PASSWORD ?? 'LocalDev2026',
    database: process.env.E2E_PG_DATABASE ?? 'dfx',
    ssl: false as const,
  };
}

/**
 * Number of EVM deposit addresses to seed. api/scripts/setup.js seeds only 5 (indices 0..4),
 * enough for manual local dev, but that pool is shared read/write by every spec file in a single
 * e2e run — 11 suites, several calling createSell/createSwap, each of which consumes one unused
 * deposit via requireUnusedDeposit() — and 5 is exhausted after a handful of calls. Each address
 * costs one HD derivation plus one idempotent INSERT, so 200 is still cheap up front and takes
 * "ran out of deposits mid-suite" off the table for the foreseeable size of this suite.
 */
const DEPOSIT_ADDRESS_POOL_SIZE = 200;

/**
 * Mirrors api/scripts/setup.js:256-339, with one deliberate difference:
 * 1) Signature-login an admin wallet derived from E2E_EVM_DEPOSIT_SEED at index 0
 * 2) UPDATE "user" SET role = 'Admin' for that address
 * 3) Idempotently insert deposit addresses for indices 0..DEPOSIT_ADDRESS_POOL_SIZE-1 — the api
 *    script only seeds 5 (enough for manual local dev); this harness seeds a much larger pool
 *    (see DEPOSIT_ADDRESS_POOL_SIZE) because 11 e2e suites share one pool in a single run.
 */
async function seedDepositAddresses(): Promise<void> {
  const mnemonic = depositMnemonic();
  const adminWallet = ethers.Wallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0/0");
  const base = apiBase();

  const signRes = await fetch(`${base}/v1/auth/signMessage?address=${encodeURIComponent(adminWallet.address)}`);
  if (!signRes.ok) {
    throw new Error(`global.setup signMessage failed: ${signRes.status} ${await signRes.text()}`);
  }
  const { message } = (await signRes.json()) as { message: string };
  const signature = await adminWallet.signMessage(message);

  const authRes = await fetch(`${base}/v1/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: adminWallet.address, signature }),
  });
  if (!authRes.ok) {
    throw new Error(`global.setup POST /v1/auth failed: ${authRes.status} ${await authRes.text()}`);
  }

  const client = new Client(dbConfig());
  await client.connect();
  try {
    await client.query('UPDATE "user" SET role = $1 WHERE address = $2', ['Admin', adminWallet.address]);

    for (let i = 0; i < DEPOSIT_ADDRESS_POOL_SIZE; i++) {
      const hdPath = `m/44'/60'/0'/0/${i}`;
      const wallet = ethers.Wallet.fromMnemonic(mnemonic, hdPath);
      await client.query(
        `INSERT INTO deposit (address, blockchains, "accountIndex", created, updated)
         SELECT $1::text, $2::text, $3::int, NOW(), NOW()
         WHERE NOT EXISTS (SELECT 1 FROM deposit WHERE address = $1)`,
        [wallet.address, EVM_BLOCKCHAINS, i],
      );
    }
  } finally {
    await client.end();
  }
}

/**
 * Staff KYC clearance for all six harness roles.
 *
 * Elevated endpoints (Admin/Compliance/Support/RealUnit/Debug) require both a non-empty
 * user_data.verifiedName (set by loginAs) AND the account's user_data.id in the in-memory
 * HasStaffKycClearance set. That set is populated by ProcessService.resyncStaffKycClearance
 * every ~30s from the staffKycClearance setting row. We write that setting ourselves (instead
 * of waiting for the once-a-minute StaffKycClearanceService.syncStaffKycClearance cron) and
 * poll GET /v1/userData until the Admin JWT no longer gets STAFF_KYC_REQUIRED.
 */
async function seedStaffKycClearance(): Promise<void> {
  const roles = ['User', 'Admin', 'Compliance', 'Support', 'Marketing', 'RealUnit'] as const;
  const userDataIds = new Set<number>();
  let adminJwt: string | undefined;

  for (const role of roles) {
    const { jwt, userId } = await loginAs(role);
    if (role === 'Admin') {
      adminJwt = jwt;
    }
    const row = await queryOne<{ userDataId: number }>(
      `SELECT "userDataId" AS "userDataId" FROM "user" WHERE id = $1`,
      [userId],
    );
    if (!row?.userDataId) {
      throw new Error(`seedStaffKycClearance: no userDataId for role ${role} (user id ${userId}) after loginAs`);
    }
    userDataIds.add(row.userDataId);
  }

  if (!adminJwt) {
    throw new Error('seedStaffKycClearance: Admin JWT missing after loginAs loop');
  }

  const clearanceValue = JSON.stringify([...userDataIds]);
  await withDb(async (client) => {
    await client.query(
      `INSERT INTO setting (key, value) VALUES ('staffKycClearance', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [clearanceValue],
    );
  });

  // resyncStaffKycClearance runs every 30s with up to ~15s jitter → poll up to 90s.
  const pollIntervalMs = 2500;
  const timeoutMs = 90000;
  const deadline = Date.now() + timeoutMs;
  const base = apiBase();

  while (Date.now() < deadline) {
    const res = await fetch(`${base}/v1/userData`, {
      headers: { Authorization: `Bearer ${adminJwt}` },
    });
    const body = await res.text();
    if (!(res.status === 403 && body.includes('STAFF_KYC_REQUIRED'))) {
      if (!res.ok) {
        throw new Error(`seedStaffKycClearance: GET /v1/userData returned unexpected ${res.status}: ${body}`);
      }
      return;
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  throw new Error(
    'seedStaffKycClearance timed out after 90s waiting for GET /v1/userData to stop returning ' +
      'STAFF_KYC_REQUIRED. global.setup wrote the staffKycClearance setting directly (to avoid ' +
      'waiting for the once-a-minute StaffKycClearanceService.syncStaffKycClearance cron); ' +
      'ProcessService.resyncStaffKycClearance (api/src/shared/services/process.service.ts) should ' +
      'copy that setting into the in-memory Set used by HasStaffKycClearance ' +
      '(api/src/shared/auth/staff-kyc-clearance.ts) every ~30s. If this timeout is hit, resync ' +
      "stopped running or the setting write did not take — every later loginAs('Support') etc. " +
      'would otherwise fail confusingly at /staff-kyc-required instead of here.',
  );
}

/**
 * Works around a gap in the API's own master-data seed: the fee table has Base rows but never
 * a ChargebackBase row, so GET /transaction/:id/refund always 500s with "Chargeback base fee
 * is missing" (see api/src/subdomains/supporting/payment/services/fee.service.ts). If the API
 * seed ever adds its own ChargebackBase row, this insert becomes a harmless no-op (WHERE NOT
 * EXISTS) and may then be deleted.
 */
async function seedChargebackBaseFee(): Promise<void> {
  await withDb(async (client) => {
    await client.query(
      `INSERT INTO fee (label, type, rate, fixed, "blockchainFactor", "payoutRefBonus", active, usages, "txUsages")
       SELECT 'E2E-ChargebackBase', 'ChargebackBase', 0.01, 0, 1, true, true, 0, 0
       WHERE NOT EXISTS (SELECT 1 FROM fee WHERE type = 'ChargebackBase')`,
    );
  });
}

/**
 * Works around a gap in the API's own master-data seed: migration/seed/seed.js's column
 * whitelist for price_rule omits priceTimestamp and referenceId even though both are present
 * in the seed CSV, so every seeded price is born already "stale" (currentPrice set,
 * priceTimestamp NULL). PriceRule.isPriceValid then fails, PricingService falls through to a
 * live external fetch (e.g. Kraken GET /0/public/AssetPairs) that the sandboxed test network
 * cannot reach — which made PUT /v1/buy/paymentInfos hang/fail with "No valid price found".
 *
 * priceTimestamp is set a few hours in the FUTURE rather than now(): Util.secondsDiff returns
 * (Date.now() - from.getTime()) / 1000, so a future timestamp yields a negative elapsed value
 * that always satisfies isPriceValid's `<= priceValiditySeconds + 15` window. That is safe
 * because this setup project runs once fresh per separate `docker compose run --rm tests
 * <file>` process, so the timestamp is renewed at the start of every spec-file invocation
 * and comfortably outlives that run without any mid-suite refresh.
 *
 * referenceId is also backfilled (not just priceTimestamp) for correctness of multi-hop
 * cross-rate chains in PricingService.getPriceRules — a missing referenceId can silently
 * produce a wrong joined rate for pairs that need the chain, not merely slow/fail the
 * request. Values match migration/seed/price_rule.csv exactly (53 of 61 priced rows have a
 * reference; the other 8 are terminal USD→USDT anchors with no further hop).
 *
 * If migration/seed/seed.js is ever fixed to include these columns, this function becomes
 * redundant (idempotent refresh of already-seeded values) and may then be deleted.
 */
async function seedFreshPrices(): Promise<void> {
  // price_rule.id -> asset.id referenceId from migration/seed/price_rule.csv (rows that have one)
  const referenceByPriceRuleId: Record<number, number> = {
    2: 123,
    3: 251,
    6: 123,
    7: 123,
    8: 123,
    9: 123,
    10: 123,
    11: 123,
    12: 123,
    13: 123,
    14: 123,
    16: 123,
    17: 123,
    18: 123,
    19: 123,
    20: 123,
    21: 123,
    22: 123,
    23: 123,
    24: 123,
    25: 123,
    26: 123,
    27: 123,
    28: 123,
    29: 123,
    30: 123,
    31: 123,
    32: 123,
    33: 123,
    34: 123,
    36: 123,
    37: 123,
    39: 123,
    41: 123,
    42: 123,
    43: 123,
    44: 123,
    45: 123,
    46: 123,
    47: 123,
    48: 123,
    49: 334,
    50: 123,
    51: 337,
    52: 123,
    53: 123,
    54: 123,
    55: 123,
    56: 123,
    57: 123,
    58: 123,
    61: 251,
    63: 123,
  };

  await withDb(async (client) => {
    await client.query(
      `UPDATE price_rule
       SET "priceTimestamp" = now() + interval '4 hours'
       WHERE "currentPrice" IS NOT NULL`,
    );

    for (const [id, referenceId] of Object.entries(referenceByPriceRuleId)) {
      await client.query(`UPDATE price_rule SET "referenceId" = $1 WHERE id = $2`, [referenceId, Number(id)]);
    }
  });
}

setup('seed deposit addresses for e2e stack', async () => {
  await seedDepositAddresses();
});

setup('seed staff KYC clearance for e2e roles', async () => {
  await seedStaffKycClearance();
});

setup('seed ChargebackBase fee row for refunds', async () => {
  await seedChargebackBaseFee();
});

setup('seed fresh price_rule timestamps for e2e stack', async () => {
  await seedFreshPrices();
});
