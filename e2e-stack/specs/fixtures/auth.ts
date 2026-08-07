import { ethers } from 'ethers';
import type { Page } from '@playwright/test';
import { withDb } from './db';
import { ROLE_WALLET_INDEX, TEST_WALLET_MNEMONIC } from './test-data';

export interface TestWallet {
  address: string;
  privateKey: string;
  mnemonic: string;
}

/**
 * Role values match the DB `role` column and JWT `role` claim 1:1.
 * Source: api/src/shared/auth/user-role.enum.ts lines 1–22
 *   User='User', Admin='Admin', Compliance='Compliance',
 *   Support='Support', Marketing='Marketing', RealUnit='RealUnit'.
 * Keys of ROLE_WALLET_INDEX keep this union in lockstep with test-data.ts.
 */
export type TestRole = keyof typeof ROLE_WALLET_INDEX;

function apiBase(): string {
  return process.env.E2E_API_URL ?? 'http://api:3000';
}

/** Deterministic EVM wallet derived from TEST_WALLET_MNEMONIC at index `i` (default 0). */
export function testWallet(index = 0): TestWallet {
  const hdPath = `m/44'/60'/0'/0/${index}`;
  const wallet = ethers.Wallet.fromMnemonic(TEST_WALLET_MNEMONIC, hdPath);
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: TEST_WALLET_MNEMONIC,
  };
}

/** Full signature login: GET /v1/auth/signMessage -> sign with ethers v5 -> POST /v1/auth. Returns the JWT. */
export async function signatureLogin(wallet: TestWallet): Promise<string> {
  const base = apiBase();
  const signRes = await fetch(
    `${base}/v1/auth/signMessage?address=${encodeURIComponent(wallet.address)}`,
  );
  if (!signRes.ok) {
    const body = await signRes.text();
    throw new Error(`signMessage failed: ${signRes.status} ${body}`);
  }
  const { message } = (await signRes.json()) as { message: string };
  // Always sign the server-returned message as-is (loc prefixes [loc]_ server-side).
  const signer = new ethers.Wallet(wallet.privateKey);
  const signature = await signer.signMessage(message);

  const authRes = await fetch(`${base}/v1/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: wallet.address, signature }),
  });
  if (!authRes.ok) {
    const body = await authRes.text();
    throw new Error(`POST /v1/auth failed: ${authRes.status} ${body}`);
  }
  const { accessToken } = (await authRes.json()) as { accessToken: string };
  if (!accessToken) {
    throw new Error('POST /v1/auth returned no accessToken');
  }
  return accessToken;
}

/**
 * Opens `path` with `?session=<jwt>`, waits for navigation, and asserts the frontend stored
 * the token in localStorage["dfx.authenticationToken"] (handleParamSession in wallet.context).
 */
export async function gotoWithSession(page: Page, path: string, jwt: string): Promise<void> {
  const separator = path.includes('?') ? '&' : '?';
  const target = `${path}${separator}session=${encodeURIComponent(jwt)}`;
  await page.goto(target);
  await page.waitForLoadState('domcontentloaded');

  try {
    await page.waitForFunction(
      () => {
        return Boolean(window.localStorage.getItem('dfx.authenticationToken'));
      },
      { timeout: 15000 },
    );
  } catch {
    const actual = await page.evaluate(() => window.localStorage.getItem('dfx.authenticationToken'));
    throw new Error(
      `gotoWithSession: expected localStorage["dfx.authenticationToken"] to be set after navigating to "${path}" with session JWT, but got: ${JSON.stringify(actual)}`,
    );
  }
}

/** Decode the middle (payload) segment of a JWT without verifying the signature. */
export function decodeJwtPayload(jwt: string): { role?: string; user?: number; address?: string } {
  const parts = jwt.split('.');
  if (parts.length < 2) {
    throw new Error(`decodeJwtPayload: expected 3 JWT segments, got ${parts.length}`);
  }
  const json = Buffer.from(parts[1], 'base64url').toString('utf8');
  return JSON.parse(json) as { role?: string; user?: number; address?: string };
}

/**
 * Logs in a deterministic per-role wallet, elevates its DB role, then re-logs-in so the
 * returned JWT carries the new role claim (tokens bake role at mint time).
 */
export async function loginAs(
  role: TestRole,
  walletIndex?: number,
): Promise<{ jwt: string; wallet: TestWallet; userId: number }> {
  const index = walletIndex ?? ROLE_WALLET_INDEX[role];
  const wallet = testWallet(index);

  // (1) First login registers / finds the user row if needed.
  await signatureLogin(wallet);

  // (2) Elevate role — UPDATE is idempotent; always run so a stale role is corrected.
  await withDb(async (client) => {
    await client.query('UPDATE "user" SET role = $1 WHERE address = $2', [role, wallet.address]);
  });

  // (3) Fresh login so the JWT is minted with the updated role claim.
  const jwt = await signatureLogin(wallet);

  // (4) Assert the role claim matches (silent role mismatch must not hide).
  const payload = decodeJwtPayload(jwt);
  if (payload.role !== role) {
    throw new Error(
      `loginAs: JWT role claim is "${payload.role}" but expected "${role}" for address ${wallet.address}`,
    );
  }

  // (5) user id from the JWT `user` claim.
  const userId = payload.user;
  if (typeof userId !== 'number') {
    throw new Error(
      `loginAs: JWT payload missing numeric "user" claim (got ${JSON.stringify(payload.user)})`,
    );
  }

  return { jwt, wallet, userId };
}
