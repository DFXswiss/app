import { DfxApiClient } from '@dfx.swiss/core';
import {
  CredentialCache,
  PasskeyAuth,
  PasskeyCeremonies,
  RP_IDS,
  type PlatformReport,
  type WalletEnv,
} from '@dfx.swiss/wallet';
import { Api } from '../../../config/api';

const STG_HOST = 'stg.app.dfx.swiss';

export const PASSKEY_PLATFORM_BLOCK = 'This browser has no passkey support';
export const PASSKEY_GENERIC_ERROR = 'Something went wrong. Please try again.';
export const PASSKEY_LOCKED = 'This passkey did not unlock the wallet';
export const PASSKEY_SEED_MISMATCH = 'This passkey does not match the wallet';
export const PASSKEY_NO_ACCOUNT = 'Sign in with mail first. The passkey is added to that account.';

export interface PasskeyClients {
  auth: PasskeyAuth;
  api: DfxApiClient;
}

// Host of this page, mapped onto the wallet package's relying-party environments. Staging is its own
// relying party only when the installed package lists that host. An older package has no such entry, so
// the host stays on the production check and the platform report stays unavailable.
export function walletEnvForHost(hostname: string): WalletEnv {
  if (hostname === RP_IDS.loc || hostname === '127.0.0.1') return 'loc';
  if (hostname === RP_IDS.dev) return 'dev';
  if (hostname === STG_HOST && RP_IDS['stg' as WalletEnv] === STG_HOST) return 'stg' as WalletEnv;
  return 'prd';
}

// One sentence for every unavailable reason. The ceremony does not start when the platform cannot run it.
export function passkeyPlatformBlock(report: PlatformReport | undefined): string | undefined {
  if (!report || report.available || !report.reason) return undefined;
  return PASSKEY_PLATFORM_BLOCK;
}

export function passkeyMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') return error.message;
  return PASSKEY_GENERIC_ERROR;
}

export function createPasskeyClients(): PasskeyClients {
  const env = walletEnvForHost(window.location.hostname);
  const api = new DfxApiClient({ apiUrl: `${Api.url.replace(/\/$/, '')}/${Api.version}` });
  // Public credential list from the wallet package. It holds no seed and no account token, and unlock
  // and the recovery-word export read it after a later ceremony in this tab.
  const cache = new CredentialCache(undefined, 'dfx.wallet.credentials.v1', RP_IDS[env]);
  return { auth: new PasskeyAuth({ api, ceremonies: new PasskeyCeremonies(env), env, cache }), api };
}
