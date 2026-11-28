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

// What WalletApiAuth.login() and register() hand back (WalletApiAuthResult). Taking the session fields
// from the SDK type makes a shape change in the package a compile error here instead of a silent
// undefined at runtime.
type WalletApiAuthResult =
  | Awaited<ReturnType<WalletApiAuth['login']>>
  | Awaited<ReturnType<WalletApiAuth['register']>>;
type WalletApiLogin = Pick<WalletApiAuthResult, 'token' | 'keys'>;

export const MISSING_CREDENTIAL_ID = 'The wallet session has no passkey credential id.';

// wallet-api answers register/finish and authenticate/finish with the session token and the id of the
// passkey that opened it; WalletApiAuthResult carries that answer but does not declare the id. Revoke and
// the recovery-word export need it, so a session without one is refused instead of opened half-usable.
function credentialIdOf(result: WalletApiAuthResult): string {
  const id: unknown = 'credentialId' in result ? result.credentialId : undefined;
  if (typeof id !== 'string' || !id) throw new Error(MISSING_CREDENTIAL_ID);
  return id;
}

type DiagnosticPayload = Parameters<WalletApi['diagnostics']>[0];
export type BitcoinSendParams = Parameters<BitcoinSend['send']>[0];
export type BitcoinSendConfirm = NonNullable<Parameters<BitcoinSend['send']>[1]>;
// What BitcoinSend hands to confirm(): the wallet-api prepare response plus the verified summary.
export type PreparedBitcoinSend = Parameters<BitcoinSendConfirm>[0];

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

  function open(result: WalletApiAuthResult): OpenPasskey {
    const credentialId = credentialIdOf(result);
    const session: WalletApiLogin = result;
    return { token: session.token, credentialId, keys: session.keys, bitcoinNetwork };
  }

  return {
    bitcoinNetwork,
    login: async (): Promise<OpenPasskey> => open(await auth.login()),
    register: async (): Promise<OpenPasskey> => open(await auth.register()),
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
