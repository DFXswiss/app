import { bech32 } from 'bech32';
import { Buffer } from 'buffer';
import { createRequire } from 'module';
import * as bip39 from '@scure/bip39';
import { HDKey } from '@scure/bip32';
import { createBitcoinCredentials } from '../test-wallet';

const API_ORIGIN = 'http://localhost:31380';
const FRONTEND_ORIGIN = 'http://localhost:31381';
const PG_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const SAFE_TEST_IBAN = 'CH3600000000000000000';
const LNURL_ID = 'e2e-native-swap-ln';
const LNURL_TARGET = `http://localhost:3000/v1/lnurlp/${LNURL_ID}`;
const SHARED_SECRET_BODY = 'e2enativeswapsharedsecret';
const SHARED_SECRET = `${SHARED_SECRET_BODY}${'a'.repeat(140 - SHARED_SECRET_BODY.length)}`;

export interface LocalSwapSession {
  evmToken: string;
  bitcoinToken: string;
  lightningToken: string;
  evmAddress: string;
  bitcoinAddress: string;
  lightningAddress: string;
  bitcoinDepositAddress: string;
  lightningDepositAddress: string;
}

let prepared: Promise<LocalSwapSession> | undefined;

function requireOrigin(name: string, raw: string | undefined, expectedOrigin: string): string {
  if (!raw) {
    throw new Error(`${name} must be set to ${expectedOrigin}`);
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${name} must be set to ${expectedOrigin}`);
  }
  const host = parsed.hostname.toLowerCase();
  const loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (
    parsed.origin !== expectedOrigin ||
    parsed.protocol !== 'http:' ||
    !loopback ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    (parsed.pathname !== '/' && parsed.pathname !== '')
  ) {
    throw new Error(`${name} must be set to ${expectedOrigin}`);
  }
  return parsed.origin;
}

/**
 * Fail closed before any sign-in, database, or factory import.
 * factories.ts queries Postgres while the module is loading.
 */
function assertLocalTargets(): void {
  const reactApi = requireOrigin('REACT_APP_API_URL', process.env.REACT_APP_API_URL, API_ORIGIN);
  const e2eApi = requireOrigin('E2E_API_URL', process.env.E2E_API_URL, API_ORIGIN);
  if (reactApi !== e2eApi) {
    throw new Error('REACT_APP_API_URL and E2E_API_URL must both be http://localhost:31380');
  }
  requireOrigin('REACT_APP_PUBLIC_URL', process.env.REACT_APP_PUBLIC_URL, FRONTEND_ORIGIN);

  const pgHost = process.env.E2E_PG_HOST;
  if (!pgHost || !PG_HOSTS.has(pgHost)) {
    throw new Error('E2E_PG_HOST must be 127.0.0.1, localhost, or ::1');
  }
  if (process.env.E2E_PG_PORT !== '31382') {
    throw new Error('E2E_PG_PORT must be 31382');
  }
  if (process.env.E2E_PG_DATABASE !== 'dfx') {
    throw new Error('E2E_PG_DATABASE must be dfx');
  }
  if (process.env.TEST_IBAN !== SAFE_TEST_IBAN) {
    throw new Error('TEST_IBAN must be the local test IBAN CH3600000000000000000');
  }
  if (!process.env.TEST_SEED) {
    throw new Error('TEST_SEED is required');
  }
  if (!process.env.E2E_EVM_DEPOSIT_SEED) {
    throw new Error('E2E_EVM_DEPOSIT_SEED is required');
  }
  if (!/^[a-z0-9]{140,146}$/.test(SHARED_SECRET)) {
    throw new Error('local Lightning shared secret has the wrong shape');
  }
}

function compressedPublicKeyHex(mnemonic: string): string {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const derivedKey = HDKey.fromMasterSeed(seed).derive("m/84'/0'/0'/0/0");
  const publicKey = derivedKey.publicKey;
  if (!publicKey || publicKey.length !== 33) {
    throw new Error('Bitcoin derivation did not yield a compressed 33-byte public key');
  }
  const hex = Buffer.from(publicKey).toString('hex').toUpperCase();
  if (!/^[A-Z0-9]{66}$/.test(hex)) {
    throw new Error('compressed public key is not 66 alphanumeric characters');
  }
  return hex;
}

function lightningDepositLnurl(): string {
  const words = bech32.toWords(Buffer.from(LNURL_TARGET, 'utf8'));
  return bech32.encode('LNURL', words, 1023).toUpperCase();
}

async function postAuth(body: { address: string; signature: string }, bearer?: string): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  const response = await fetch(`${API_ORIGIN}/v1/auth`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`POST /v1/auth failed with status ${response.status}`);
  }
  const data = (await response.json()) as { accessToken?: unknown };
  if (typeof data.accessToken !== 'string' || data.accessToken.length === 0) {
    throw new Error('POST /v1/auth returned no accessToken');
  }
  return data.accessToken;
}

/**
 * Playwright runs this helper as CommonJS and transforms .ts on require.
 * A native import() of factories.ts is a SyntaxError because that package is
 * CommonJS. factories.ts queries Postgres while the module evaluates, so this
 * load stays after assertLocalTargets. The __filename declaration is type-only;
 * the CommonJS worker binding is what createRequire resolves against.
 */
type SwapFactories = Pick<
  typeof import('../../e2e-stack/specs/fixtures/factories'),
  'createUser' | 'ensureNativeSwapDeposits'
>;

declare const __filename: string;

function loadSwapFactories(): SwapFactories {
  const requireFactory = createRequire(__filename);
  return requireFactory('../../e2e-stack/specs/fixtures/factories.ts') as SwapFactories;
}

async function prepare(): Promise<LocalSwapSession> {
  assertLocalTargets();

  const { createUser, ensureNativeSwapDeposits } = loadSwapFactories();
  const user = await createUser({
    walletIndex: 0,
    kycLevel: 30,
    completePersonalData: true,
    language: 'DE',
  });

  const seed = process.env.TEST_SEED as string;
  const bitcoin = await createBitcoinCredentials(seed);
  const bitcoinToken = await postAuth({ address: bitcoin.address, signature: bitcoin.signature }, user.jwt);

  const lightningAddress = `LNNID${compressedPublicKeyHex(seed)}`;
  const lightningToken = await postAuth({ address: lightningAddress, signature: SHARED_SECRET }, bitcoinToken);

  const depositBitcoin = await createBitcoinCredentials(process.env.E2E_EVM_DEPOSIT_SEED as string);
  if (depositBitcoin.address === bitcoin.address) {
    throw new Error('Bitcoin deposit address must differ from the linked user address');
  }
  const lightningDepositAddress = lightningDepositLnurl();
  await ensureNativeSwapDeposits({
    bitcoinAddress: depositBitcoin.address,
    lightningAddress: lightningDepositAddress,
  });

  return {
    evmToken: user.jwt,
    bitcoinToken,
    lightningToken,
    evmAddress: user.address,
    bitcoinAddress: bitcoin.address,
    lightningAddress,
    bitcoinDepositAddress: depositBitcoin.address,
    lightningDepositAddress,
  };
}

/** Local EVM, Bitcoin, and custodial Lightning session for the legacy swap visuals. */
export function prepareLocalSwapVisuals(): Promise<LocalSwapSession> {
  if (!prepared) {
    prepared = prepare().catch((error: unknown) => {
      prepared = undefined;
      throw error;
    });
  }
  return prepared;
}
