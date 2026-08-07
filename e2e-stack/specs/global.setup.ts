/**
 * Playwright 1.56 project-dependency setup project pattern:
 * playwright.config.ts declares projects[name=setup] with testMatch: /global\.setup\.ts/
 * and the chromium project depends on it. Seeding logic below does not use expect();
 * only the thin `setup(...)` wrapper is required by the project-as-test convention.
 */
import { test as setup } from '@playwright/test';
import { ethers } from 'ethers';
import { Client } from 'pg';

const EVM_BLOCKCHAINS =
  'Ethereum;Sepolia;BinanceSmartChain;Arbitrum;Optimism;Polygon;Base;Gnosis;Haqq';

function apiBase(): string {
  return process.env.E2E_API_URL ?? 'http://api:3000';
}

function depositMnemonic(): string {
  const seed = process.env.E2E_EVM_DEPOSIT_SEED;
  if (!seed) {
    throw new Error(
      'E2E_EVM_DEPOSIT_SEED is not set (expected the public Hardhat/Anvil test mnemonic via compose.tests.yml)',
    );
  }
  return seed;
}

function dbConfig() {
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
 * Mirrors api/scripts/setup.js:256-339:
 * 1) Signature-login an admin wallet derived from E2E_EVM_DEPOSIT_SEED at index 0
 * 2) UPDATE "user" SET role = 'Admin' for that address
 * 3) Idempotently insert deposit addresses for indices 0..4
 */
async function seedDepositAddresses(): Promise<void> {
  const mnemonic = depositMnemonic();
  const adminWallet = ethers.Wallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0/0");
  const base = apiBase();

  const signRes = await fetch(
    `${base}/v1/auth/signMessage?address=${encodeURIComponent(adminWallet.address)}`,
  );
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
    await client.query('UPDATE "user" SET role = $1 WHERE address = $2', [
      'Admin',
      adminWallet.address,
    ]);

    for (let i = 0; i < 5; i++) {
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

setup('seed deposit addresses for e2e stack', async () => {
  await seedDepositAddresses();
});
