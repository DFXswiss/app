import {
  DfxHttpClient,
  PasskeyApi,
  type DfxApiClient,
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
  WalletError,
  type AuthResult,
  type KeyRing,
  type RegisterExtras,
} from '@dfx.swiss/wallet';
import { Api } from '../../../config/api';
import { credentialBytes, credentialIdText, sameBytes } from './passkey-bytes';
import { walletEnvForHost } from './passkey-host';

export interface WalletClient {
  login(): Promise<AuthResult>;
  register(extras: RegisterExtras): Promise<AuthResult>;
  link(
    family: 'evm' | 'bitcoin',
    sessionToken: string,
    keys: KeyRing,
    evmIndex?: number,
  ): Promise<{
    accessToken: string;
    address: PasskeyAddress;
  }>;
  revoke(reason: 'Lost' | 'Compromised', credentialId: string): Promise<PasskeyWallet>;
  exportMnemonic(credentialId?: Uint8Array): Promise<string[]>;
  verifyServerAddresses(wallet: PasskeyWallet, keys: KeyRing): { address: string; family: string; matches: boolean }[];
  wallets(sessionToken: string): Promise<PasskeyWallet[]>;
  credentialStatus(ids: string[]): Promise<PasskeyCredentialStatusResult[]>;
  diagnostics(input: PasskeyDiagnosticParams): Promise<void>;
}

// DFXswiss/wallet-api will connect here; until then calls use the DFX API passkey routes.
export function createWalletClient(): WalletClient {
  const env = walletEnvForHost(window.location.hostname);
  const http = new DfxHttpClient({ apiUrl: `${Api.url.replace(/\/$/, '')}/${Api.version}` });
  const passkey = new PasskeyApi(http);
  const cache = new CredentialCache(undefined, 'dfx.wallet.credentials.v1', RP_IDS[env]);
  const ceremonies = new PasskeyCeremonies(env);
  const api: Pick<DfxApiClient, 'passkey'> = { passkey };
  // PasskeyAuth reads only api.passkey. Its type in this package version still requires a full DfxApiClient.
  const auth = new PasskeyAuth({ api: api as DfxApiClient, ceremonies, env, cache });

  return {
    login: (...args) => auth.login(...args),
    register: (...args) => auth.register(...args),
    link: (...args) => auth.link(...args),
    revoke: (reason, credentialId) => revokePasskey(reason, credentialId),
    exportMnemonic: (...args) => auth.exportMnemonic(...args),
    verifyServerAddresses: (...args) => auth.verifyServerAddresses(...args),
    wallets: (...args) => passkey.wallets(...args),
    credentialStatus: (...args) => passkey.credentialStatus(...args),
    diagnostics: (...args) => passkey.diagnostics(...args),
  };

  async function revokePasskey(reason: 'Lost' | 'Compromised', credentialId: string): Promise<PasskeyWallet> {
    const challenge = await passkey.revokeBegin();
    const expectedRpId = RP_IDS[env];
    if (challenge.rpId !== expectedRpId) {
      throw new WalletError(
        'wrong-origin',
        `The server expects RP ID ${challenge.rpId}, this wallet uses ${expectedRpId}`,
      );
    }
    const pinned = credentialBytes(credentialId);
    const assertion = await ceremonies.assert({
      challenge: credentialBytes(challenge.challenge),
      credentialId: pinned,
    });
    if (!sameBytes(assertion.credentialId, pinned)) {
      throw new WalletError('credential-mismatch', 'The authenticator returned a different passkey');
    }
    const wallet = await passkey.revokeFinish({
      challengeId: challenge.challengeId,
      credential: assertion.assertion,
      reason,
    });
    if (wallet.status !== 'Active') {
      cache.update(credentialIdText(assertion.credentialId), { state: 'revoked' });
    }
    return wallet;
  }
}
