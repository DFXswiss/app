import {
  DfxApiClient,
  type PasskeyAddress,
  type PasskeyCredentialStatusResult,
  type PasskeyDiagnosticParams,
  type PasskeyWallet,
} from '@dfx.swiss/core';
import {
  CredentialCache,
  PasskeyAuth,
  PasskeyCeremonies,
  RP_IDS,
  type AuthResult,
  type KeyRing,
  type RegisterExtras,
  type WalletState,
} from '@dfx.swiss/wallet';
import { Api } from '../../../config/api';
import { walletEnvForHost } from './passkey-host';

export interface WalletClient {
  login(): Promise<AuthResult>;
  register(extras: RegisterExtras): Promise<AuthResult>;
  unlock(): Promise<{ keys?: KeyRing; state: WalletState }>;
  link(family: 'evm' | 'bitcoin', sessionToken: string, keys: KeyRing, evmIndex?: number): Promise<{
    accessToken: string;
    address: PasskeyAddress;
  }>;
  revoke(reason: 'Lost' | 'Compromised'): Promise<PasskeyWallet>;
  exportMnemonic(credentialId?: Uint8Array): Promise<string[]>;
  verifyServerAddresses(wallet: PasskeyWallet, keys: KeyRing): { address: string; family: string; matches: boolean }[];
  wallets(sessionToken: string): Promise<PasskeyWallet[]>;
  backupSeen(walletId: number, sessionToken: string): Promise<PasskeyWallet>;
  credentialStatus(ids: string[]): Promise<PasskeyCredentialStatusResult[]>;
  diagnostics(input: PasskeyDiagnosticParams): Promise<void>;
}

// DFXswiss/wallet-api will connect here; until then calls use the DFX API passkey routes.
export function createWalletClient(): WalletClient {
  const env = walletEnvForHost(window.location.hostname);
  const api = new DfxApiClient({ apiUrl: `${Api.url.replace(/\/$/, '')}/${Api.version}` });
  const cache = new CredentialCache(undefined, 'dfx.wallet.credentials.v1', RP_IDS[env]);
  const auth = new PasskeyAuth({ api, ceremonies: new PasskeyCeremonies(env), env, cache });
  return {
    login: (...args) => auth.login(...args),
    register: (...args) => auth.register(...args),
    unlock: (...args) => auth.unlock(...args),
    link: (...args) => auth.link(...args),
    revoke: (...args) => auth.revoke(...args),
    exportMnemonic: (...args) => auth.exportMnemonic(...args),
    verifyServerAddresses: (...args) => auth.verifyServerAddresses(...args),
    wallets: (...args) => api.passkey.wallets(...args),
    backupSeen: (...args) => api.passkey.backupSeen(...args),
    credentialStatus: (...args) => api.passkey.credentialStatus(...args),
    diagnostics: (...args) => api.passkey.diagnostics(...args),
  };
}
