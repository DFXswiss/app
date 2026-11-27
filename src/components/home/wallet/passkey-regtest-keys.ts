import * as walletPackage from '@dfx.swiss/wallet';
import { KeyRing, type KeyRingOptions } from '@dfx.swiss/wallet';
import { Api } from '../../../config/api';
import { BITCOIN_REGTEST, testWalletEnv, type TestWalletEnv } from '../../../util/test-network';
import { getOpenPasskey } from './passkey-session';

// Bitcoin regtest comes with the @dfx.swiss/wallet release of DFXswiss/packages#270 (`bitcoinNetwork: 'regtest'`,
// `env`, `EsploraClient`). The pinned 0.1.1-beta.3 has none of it, so these options and the client are described
// here and looked up at run time; the probe below keeps every regtest element hidden until that release is installed.
type RegtestKeyRingOptions = Omit<KeyRingOptions, 'bitcoinNetwork'> & { bitcoinNetwork: 'regtest'; env: TestWalletEnv };

export interface RegtestBalance {
  /** Satoshis in confirmed outputs. */
  confirmed: number;
  /** Satoshis the mempool adds or removes. */
  unconfirmed: number;
}

interface RegtestEsplora {
  balance(address: string): Promise<RegtestBalance>;
}

type EsploraClientConstructor = new (
  baseUrl: string,
  options: { network: 'regtest'; env: TestWalletEnv },
) => RegtestEsplora;

// BIP-84 receive address m/84'/1'/0'/0/0 of the public "abandon … about" test vector on regtest (HRP bcrt). The
// probe compares the whole address, so a package that derives another path or coin type does not pass.
const PROBE_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const PROBE_ADDRESS = 'bcrt1q6rz28mcfaxtmd6v789l9rrlrusdprr9pz3cppk';
const REGTEST_PREFIX = 'bcrt1';

let probed: boolean | undefined;

function esploraClientConstructor(): EsploraClientConstructor | undefined {
  const value: unknown = Reflect.get(walletPackage, 'EsploraClient');
  return typeof value === 'function' ? (value as EsploraClientConstructor) : undefined;
}

function deriveRegtestAddress(mnemonic: string, env: TestWalletEnv): string {
  const options: RegtestKeyRingOptions = { bitcoinNetwork: 'regtest', env };
  const ring = KeyRing.fromMnemonic(mnemonic, options as unknown as KeyRingOptions);
  try {
    return ring.bitcoinAddress(0, 0).address;
  } finally {
    ring.wipe();
  }
}

// True once the installed wallet package derives the regtest test vector exactly and ships the Esplora client.
// An older package throws for the unknown network or lacks the client, which hides every regtest element.
export function walletSupportsRegtest(env: TestWalletEnv): boolean {
  if (probed === undefined) {
    try {
      probed = esploraClientConstructor() !== undefined && deriveRegtestAddress(PROBE_MNEMONIC, env) === PROBE_ADDRESS;
    } catch {
      probed = false;
    }
  }
  return probed;
}

export function resetRegtestProbe(): void {
  probed = undefined;
}

// Regtest is shown on DEV, STG and LOC builds with a wallet package that supports it, never on PRD.
export function regtestAvailable(): boolean {
  const env = testWalletEnv();
  return env !== undefined && walletSupportsRegtest(env);
}

function requireEnv(): TestWalletEnv {
  const env = testWalletEnv();
  if (env === undefined) throw new Error('Bitcoin regtest is not available in this build.');
  return env;
}

// Receive address m/84'/1'/0'/0/0 of the open passkey on regtest. The keys stay in tab memory. As in the desk's
// own receive panel, a session with keys is usable; without keys it is locked.
export function readRegtestReceive(): string {
  const session = getOpenPasskey();
  if (!session?.keys) throw new Error('locked');
  const address = deriveRegtestAddress(session.keys.mnemonic(), requireEnv());
  if (!address.startsWith(REGTEST_PREFIX)) throw new Error('This wallet cannot derive a regtest address.');
  return address;
}

// Balance of a regtest address as the wallet package computes it, read through the DFX API Esplora forward
// walletData/esplora/BitcoinRegtest (the named R1 exception for test networks on DEV and STG; PRD never reaches
// this code because regtestAvailable() is false there).
export async function readRegtestBalance(address: string): Promise<RegtestBalance> {
  const EsploraClient = esploraClientConstructor();
  if (!EsploraClient) throw new Error('Bitcoin regtest is not available in this build.');
  const env = requireEnv();
  const baseUrl = `${Api.url.replace(/\/$/, '')}/${Api.version}/walletData/esplora/${BITCOIN_REGTEST}`;
  return new EsploraClient(baseUrl, { network: 'regtest', env }).balance(address);
}
