import { DfxHttpClient, WalletApi } from '@dfx.swiss/core';
import {
  BitcoinSend,
  CredentialCache,
  PasskeyCeremonies,
  RP_IDS,
  WalletApiAuth,
  walletApiBitcoinNetwork,
  type KeyRing,
} from '@dfx.swiss/wallet';
import { Api } from '../../../config/api';
import type { PasskeyBitcoinNetwork } from './passkey-bitcoin';
import { credentialBytes } from './passkey-bytes';
import { walletEnvForHost } from './passkey-host';
import type { OpenPasskey } from './passkey-session';

// What WalletApiAuth.login() and register() hand back. Assigning the SDK result to this type makes a
// shape change in the package a compile error here instead of a silent undefined at runtime.
interface WalletApiLogin {
  token: string;
  credentialId: string;
  keys?: KeyRing;
}

type DiagnosticPayload = Parameters<WalletApi['diagnostics']>[0];
export type BitcoinSendParams = Parameters<BitcoinSend['send']>[0];
export type BitcoinSendConfirm = NonNullable<Parameters<BitcoinSend['send']>[1]>;

// wallet-api sits behind front-api at <api>/v1/wallet/*. The client carries no DFX customer token:
// WalletApi keeps the wallet session token itself and sends nothing on the public routes.
export function createWalletApi(): WalletApi {
  const http = new DfxHttpClient({ apiUrl: `${Api.url.replace(/\/$/, '')}/${Api.version}` });
  return new WalletApi(http);
}

export function createWalletClient() {
  const env = walletEnvForHost(window.location.hostname);
  const api = createWalletApi();
  const cache = new CredentialCache(undefined, 'dfx.wallet.credentials.v1', RP_IDS[env]);
  const ceremonies = new PasskeyCeremonies(env);
  const auth = new WalletApiAuth({ api, ceremonies, env, cache });
  const bitcoinNetwork: PasskeyBitcoinNetwork = walletApiBitcoinNetwork(env);

  function open(result: WalletApiLogin): OpenPasskey {
    return { token: result.token, credentialId: result.credentialId, keys: result.keys, bitcoinNetwork };
  }

  return {
    bitcoinNetwork,
    login: async (): Promise<OpenPasskey> => {
      const result: WalletApiLogin = await auth.login();
      return open(result);
    },
    register: async (): Promise<OpenPasskey> => {
      const result: WalletApiLogin = await auth.register();
      return open(result);
    },
    // Registers the addresses of the families GET /v1/wallet/config enables; nothing else is derived.
    syncAddresses: (session: OpenPasskey, keys: KeyRing) => auth.syncAddresses(session.token, keys),
    revoke: (session: OpenPasskey) => auth.revoke(session.token, credentialBytes(session.credentialId)),
    credentials: (session: OpenPasskey) => auth.credentials(session.token),
    exportMnemonic: (session: OpenPasskey) => auth.exportMnemonic(credentialBytes(session.credentialId)),
    diagnostics: (session: OpenPasskey, payload: DiagnosticPayload) => api.diagnostics(payload, session.token),
    // Prepare, verify, confirm, sign and submit run inside the SDK; the seed never leaves this ring.
    bitcoinSend: (session: OpenPasskey, keys: KeyRing) => new BitcoinSend({ api, keys, token: session.token }),
  };
}

export type WalletClient = ReturnType<typeof createWalletClient>;
