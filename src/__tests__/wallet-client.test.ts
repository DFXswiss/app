const mockAuth = {
  login: jest.fn(),
  register: jest.fn(),
  syncAddresses: jest.fn(),
  revoke: jest.fn(),
  credentials: jest.fn(),
  exportMnemonic: jest.fn(),
};
const mockDiagnostics = jest.fn();
const mockHttpCreated = jest.fn((_options: unknown, _instance: unknown) => undefined);
const mockWalletApiCreated = jest.fn((_http: unknown, _instance: unknown) => undefined);
const mockCacheCreated = jest.fn((_storage: unknown, _key: unknown, _rpId: unknown) => undefined);
const mockAuthCreated = jest.fn((_deps: unknown) => undefined);
const mockCeremoniesCreated = jest.fn((_env: unknown) => undefined);
const mockSendCreated = jest.fn((_deps: unknown) => undefined);
const mockNetwork = jest.fn((_env: unknown) => 'regtest');
const mockWalletEnvForHost = jest.fn((_hostname: unknown) => 'stg');

jest.mock('@dfx.swiss/wallet', () => ({
  RP_IDS: { stg: 'stg.app.dfx.swiss', prd: 'app.dfx.swiss' },
  CredentialCache: function CredentialCache(storage: unknown, key: unknown, rpId: unknown) {
    mockCacheCreated(storage, key, rpId);
    return { cache: true };
  },
  PasskeyCeremonies: function PasskeyCeremonies(env: unknown) {
    mockCeremoniesCreated(env);
    return { ceremonies: true };
  },
  WalletApiAuth: function WalletApiAuth(deps: unknown) {
    mockAuthCreated(deps);
    return mockAuth;
  },
  BitcoinSend: function BitcoinSend(deps: unknown) {
    mockSendCreated(deps);
    return { deps };
  },
  walletApiBitcoinNetwork: (env: unknown) => mockNetwork(env),
}));

jest.mock('@dfx.swiss/core', () => ({
  DfxHttpClient: function DfxHttpClient(options: unknown) {
    const http = { http: true };
    mockHttpCreated(options, http);
    return http;
  },
  WalletApi: function WalletApi(http: unknown) {
    const api = { diagnostics: mockDiagnostics };
    mockWalletApiCreated(http, api);
    return api;
  },
}));

jest.mock('../components/home/wallet/passkey-host', () => ({
  walletEnvForHost: (hostname: unknown) => mockWalletEnvForHost(hostname),
}));

import { credentialBytes } from '../components/home/wallet/passkey-bytes';
import type { OpenPasskey } from '../components/home/wallet/passkey-session';
import { createWalletApi, createWalletClient } from '../components/home/wallet/wallet-client';
import { Api } from '../config/api';

const apiConfig = Api as { url: string };
const originalApiUrl = apiConfig.url;
const keys = { wipe: jest.fn() } as unknown as NonNullable<OpenPasskey['keys']>;
const session: OpenPasskey = { token: 'wallet-token', credentialId: 'AQID', keys, bitcoinNetwork: 'regtest' };

describe('createWalletClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNetwork.mockReturnValue('regtest');
    mockWalletEnvForHost.mockReturnValue('stg');
    apiConfig.url = originalApiUrl;
  });

  afterAll(() => {
    apiConfig.url = originalApiUrl;
  });

  it('builds the wallet-api client on <api>/<version> without a customer token', () => {
    apiConfig.url = 'https://api.example.test/';
    const api = createWalletApi();
    expect(mockHttpCreated.mock.calls[0][0]).toEqual({ apiUrl: `https://api.example.test/${Api.version}` });
    expect(mockWalletApiCreated.mock.calls[0][0]).toBe(mockHttpCreated.mock.calls[0][1]);
    expect(api).toBe(mockWalletApiCreated.mock.calls[0][1]);
  });

  it('wires WalletApiAuth with the host environment, its relying party and the regtest network', () => {
    const client = createWalletClient();
    expect(mockWalletEnvForHost).toHaveBeenCalledWith(window.location.hostname);
    expect(mockCacheCreated).toHaveBeenCalledWith(undefined, 'dfx.wallet.credentials.v1', 'stg.app.dfx.swiss');
    expect(mockCeremoniesCreated).toHaveBeenCalledWith('stg');
    expect(mockAuthCreated).toHaveBeenCalledWith({
      api: mockWalletApiCreated.mock.calls[0][1],
      ceremonies: { ceremonies: true },
      env: 'stg',
      cache: { cache: true },
    });
    expect(mockNetwork).toHaveBeenCalledWith('stg');
    expect(client.bitcoinNetwork).toBe('regtest');
  });

  it('opens a session from login and register with the wallet token, never a customer token', async () => {
    mockAuth.login.mockResolvedValue({ token: 'login-token', credentialId: 'cred-1', keys, extra: 1 });
    mockAuth.register.mockResolvedValue({ token: 'register-token', credentialId: 'cred-2' });
    const client = createWalletClient();

    await expect(client.login()).resolves.toEqual({
      token: 'login-token',
      credentialId: 'cred-1',
      keys,
      bitcoinNetwork: 'regtest',
    });
    await expect(client.register()).resolves.toEqual({
      token: 'register-token',
      credentialId: 'cred-2',
      keys: undefined,
      bitcoinNetwork: 'regtest',
    });
    expect(mockAuth.login).toHaveBeenCalledWith();
    expect(mockAuth.register).toHaveBeenCalledWith();
  });

  it('passes the wallet token and the credential bytes to the session routes', async () => {
    mockAuth.syncAddresses.mockResolvedValue('synced');
    mockAuth.revoke.mockResolvedValue('revoked');
    mockAuth.credentials.mockResolvedValue(['one']);
    mockAuth.exportMnemonic.mockResolvedValue(['word']);
    mockDiagnostics.mockResolvedValue(undefined);
    const client = createWalletClient();

    await expect(client.syncAddresses(session, keys)).resolves.toBe('synced');
    expect(mockAuth.syncAddresses).toHaveBeenCalledWith('wallet-token', keys);
    await expect(client.revoke(session)).resolves.toBe('revoked');
    expect(mockAuth.revoke).toHaveBeenCalledWith('wallet-token', credentialBytes('AQID'));
    await expect(client.credentials(session)).resolves.toEqual(['one']);
    expect(mockAuth.credentials).toHaveBeenCalledWith('wallet-token');
    await expect(client.exportMnemonic(session)).resolves.toEqual(['word']);
    expect(mockAuth.exportMnemonic).toHaveBeenCalledWith(credentialBytes('AQID'));
    await client.diagnostics(session, { stage: 'Capability' } as never);
    expect(mockDiagnostics).toHaveBeenCalledWith({ stage: 'Capability' }, 'wallet-token');
  });

  it('creates BitcoinSend on the same wallet api with the session token and ring', () => {
    const client = createWalletClient();
    client.bitcoinSend(session, keys);
    expect(mockSendCreated).toHaveBeenCalledWith({
      api: mockWalletApiCreated.mock.calls[0][1],
      keys,
      token: 'wallet-token',
    });
  });
});
