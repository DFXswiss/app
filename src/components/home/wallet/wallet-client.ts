import { DfxApiClient } from '@dfx.swiss/core';
import { CredentialCache, PasskeyAuth, PasskeyCeremonies, RP_IDS } from '@dfx.swiss/wallet';
import { Api } from '../../../config/api';
import { walletEnvForHost } from './passkey-host';

export interface WalletClient {
  login: PasskeyAuth['login'];
  register: PasskeyAuth['register'];
  unlock: PasskeyAuth['unlock'];
  link: PasskeyAuth['link'];
  revoke: PasskeyAuth['revoke'];
  exportMnemonic: PasskeyAuth['exportMnemonic'];
  verifyServerAddresses: PasskeyAuth['verifyServerAddresses'];
  wallets: (sessionToken: string) => ReturnType<DfxApiClient['passkey']['wallets']>;
  backupSeen: DfxApiClient['passkey']['backupSeen'];
  credentialStatus: DfxApiClient['passkey']['credentialStatus'];
  diagnostics: DfxApiClient['passkey']['diagnostics'];
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
