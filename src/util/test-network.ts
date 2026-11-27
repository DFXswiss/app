import { Api } from '../config/api';

export type TestWalletEnv = 'dev' | 'stg' | 'loc';

// API hosts of the DEV, STG and LOC builds and the wallet environment each one is. The production build compiles
// https://api.dfx.swiss into REACT_APP_API_URL (scripts/build.sh), which is not listed, so every test tool stays
// hidden there. An unknown or unparsable URL counts as production: the check fails closed.
const TEST_API_HOSTS: Readonly<Record<string, TestWalletEnv>> = Object.freeze({
  'dev.api.dfx.swiss': 'dev',
  'stg.api.dfx.swiss': 'stg',
  localhost: 'loc',
  '127.0.0.1': 'loc',
});

// The Bitcoin regtest chain of the DFX API. It exists outside PRD only and carries no real value.
export const BITCOIN_REGTEST = 'BitcoinRegtest';

export function testWalletEnvOf(apiUrl: string): TestWalletEnv | undefined {
  let hostname: string;
  try {
    hostname = new URL(apiUrl).hostname;
  } catch {
    return undefined;
  }
  return Object.prototype.hasOwnProperty.call(TEST_API_HOSTS, hostname) ? TEST_API_HOSTS[hostname] : undefined;
}

export function isTestApiUrl(apiUrl: string): boolean {
  return testWalletEnvOf(apiUrl) !== undefined;
}

// Wallet environment of this build for the test networks, from the compiled API URL; undefined on PRD.
export function testWalletEnv(): TestWalletEnv | undefined {
  return testWalletEnvOf(Api.url);
}

export function isTestEnvironment(): boolean {
  return testWalletEnv() !== undefined;
}
