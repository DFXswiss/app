const mockLogin = jest.fn();
const mockRegister = jest.fn();
const mockUnlock = jest.fn();
const mockLink = jest.fn();
const mockRevoke = jest.fn();
const mockExport = jest.fn();
const mockVerify = jest.fn();
const mockWallets = jest.fn();
const mockBackup = jest.fn();
const mockStatus = jest.fn();
const mockDiagnostics = jest.fn();
const mockHttpCreated = jest.fn((_options: unknown, _instance: unknown) => undefined);
const mockPasskeyCreated = jest.fn((_http: unknown, _passkey: unknown) => undefined);
const mockCacheCreated = jest.fn((_storage: unknown, _key: unknown, _rpId: unknown, _instance: unknown) => undefined);
const mockAuthCreated = jest.fn((_options: unknown) => undefined);

jest.mock('@dfx.swiss/wallet', () => ({
  RP_IDS: { loc: 'localhost', prd: 'app.dfx.swiss' },
  CredentialCache: function CredentialCache(storage: unknown, key: unknown, rpId: unknown) {
    const cache = {};
    mockCacheCreated(storage, key, rpId, cache);
    return cache;
  },
  PasskeyCeremonies: function PasskeyCeremonies() {
    return {};
  },
  PasskeyAuth: function PasskeyAuth(options: unknown) {
    mockAuthCreated(options);
    return {
      login: mockLogin,
      register: mockRegister,
      unlock: mockUnlock,
      link: mockLink,
      revoke: mockRevoke,
      exportMnemonic: mockExport,
      verifyServerAddresses: mockVerify,
    };
  },
}));

jest.mock('@dfx.swiss/core', () => ({
  DfxHttpClient: function DfxHttpClient(options: unknown) {
    const http = { setToken: jest.fn() };
    mockHttpCreated(options, http);
    return http;
  },
  PasskeyApi: function PasskeyApi(http: unknown) {
    const passkey = {
      wallets: mockWallets,
      backupSeen: mockBackup,
      credentialStatus: mockStatus,
      diagnostics: mockDiagnostics,
    };
    mockPasskeyCreated(http, passkey);
    return passkey;
  },
  DfxApiClient: function DfxApiClient() {
    throw new Error('DfxApiClient must not be constructed');
  },
}));

import { createWalletClient } from '../components/home/wallet/wallet-client';
import type { KeyRing } from '@dfx.swiss/wallet';
import { RP_IDS } from '@dfx.swiss/wallet';
import type { PasskeyWallet } from '@dfx.swiss/core';
import { Api } from '../config/api';

const originalLocation = window.location;
const apiConfig = Api as { url: string };
const originalApiUrl = apiConfig.url;

function setHostname(hostname: string): void {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...originalLocation, hostname },
  });
}

function httpInstance(): { setToken: jest.Mock } {
  return mockHttpCreated.mock.calls[0][1] as { setToken: jest.Mock };
}

function passkeyInstance(): unknown {
  return mockPasskeyCreated.mock.calls[0][1];
}

function authOptions(): { api: Record<string, unknown>; cache: unknown; env: string } {
  return mockAuthCreated.mock.calls[0][0] as { api: Record<string, unknown>; cache: unknown; env: string };
}

describe('createWalletClient', () => {
  beforeEach(() => {
    mockLogin.mockClear();
    mockRegister.mockClear();
    mockUnlock.mockClear();
    mockLink.mockClear();
    mockRevoke.mockClear();
    mockExport.mockClear();
    mockVerify.mockClear();
    mockWallets.mockClear();
    mockBackup.mockClear();
    mockStatus.mockClear();
    mockDiagnostics.mockClear();
    mockHttpCreated.mockClear();
    mockPasskeyCreated.mockClear();
    mockCacheCreated.mockClear();
    mockAuthCreated.mockClear();
    apiConfig.url = originalApiUrl;
    setHostname('localhost');
  });

  afterAll(() => {
    apiConfig.url = originalApiUrl;
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('constructs one DfxHttpClient with the normalized Api url', () => {
    apiConfig.url = 'https://api.example.test';
    createWalletClient();

    expect(mockHttpCreated).toHaveBeenCalledTimes(1);
    expect(mockHttpCreated.mock.calls[0][0]).toEqual({ apiUrl: `https://api.example.test/${Api.version}` });
  });

  it('constructs one DfxHttpClient with the normalized Api url when Api.url ends with a slash', () => {
    apiConfig.url = 'https://api.example.test/';
    createWalletClient();

    expect(mockHttpCreated).toHaveBeenCalledTimes(1);
    expect(mockHttpCreated.mock.calls[0][0]).toEqual({ apiUrl: `https://api.example.test/${Api.version}` });
  });

  it('constructs one PasskeyApi with that DfxHttpClient instance', () => {
    createWalletClient();

    expect(mockHttpCreated).toHaveBeenCalledTimes(1);
    expect(mockPasskeyCreated).toHaveBeenCalledTimes(1);
    expect(mockPasskeyCreated.mock.calls[0][0]).toBe(httpInstance());
  });

  it('does not call setToken on the DfxHttpClient', async () => {
    const client = createWalletClient();
    const http = httpInstance();
    const keys = {} as KeyRing;
    const diagnostic = { stage: 'Authentication', outcome: 'Success' } as const;
    mockLink.mockResolvedValueOnce({ tag: 'link' });
    mockWallets.mockResolvedValueOnce({ tag: 'wallets' });
    mockBackup.mockResolvedValueOnce({ tag: 'backup' });
    mockStatus.mockResolvedValueOnce({ tag: 'status' });
    mockDiagnostics.mockResolvedValueOnce({ tag: 'diagnostics' });

    expect(http.setToken).not.toHaveBeenCalled();
    await client.link('evm', 'wallet-token', keys, 2);
    await client.wallets('wallet-token');
    await client.backupSeen(7, 'wallet-token');
    await client.credentialStatus(['credential']);
    await client.diagnostics(diagnostic);
    expect(http.setToken).not.toHaveBeenCalled();
  });

  it('passes PasskeyAuth an api object whose only property is the PasskeyApi instance', () => {
    createWalletClient();
    const options = authOptions();

    expect(mockAuthCreated).toHaveBeenCalledTimes(1);
    expect(Object.keys(options.api)).toEqual(['passkey']);
    expect(options.api.passkey).toBe(passkeyInstance());
  });

  it('passes the localhost relying party and env to the credential cache and PasskeyAuth', () => {
    setHostname('localhost');
    createWalletClient();
    const cache = mockCacheCreated.mock.calls[0][3];

    expect(mockCacheCreated).toHaveBeenCalledTimes(1);
    expect(mockCacheCreated).toHaveBeenCalledWith(undefined, 'dfx.wallet.credentials.v1', RP_IDS.loc, cache);
    expect(authOptions().cache).toBe(cache);
    expect(authOptions().env).toBe('loc');
  });

  it('passes the production relying party and env to the credential cache and PasskeyAuth', () => {
    setHostname('app.dfx.swiss');
    createWalletClient();
    const cache = mockCacheCreated.mock.calls[0][3];

    expect(mockCacheCreated).toHaveBeenCalledTimes(1);
    expect(mockCacheCreated).toHaveBeenCalledWith(undefined, 'dfx.wallet.credentials.v1', RP_IDS.prd, cache);
    expect(authOptions().cache).toBe(cache);
    expect(authOptions().env).toBe('prd');
  });

  it('returns the PasskeyAuth login result and calls login with no arguments', async () => {
    const client = createWalletClient();
    const result = { tag: 'login' };
    mockLogin.mockResolvedValueOnce(result);

    expect(await client.login()).toBe(result);
    expect(mockLogin).toHaveBeenCalledTimes(1);
    expect(mockLogin).toHaveBeenCalledWith();
  });

  it('returns each PasskeyAuth register result for the two extras objects', async () => {
    const client = createWalletClient();
    const first = { mail: 'wallet@example.com', language: 'de' };
    const second = { mail: 'other@example.com', language: 'fr', usedRef: 'ref-2' };
    const firstResult = { tag: 'register-first' };
    const secondResult = { tag: 'register-second' };
    mockRegister.mockResolvedValueOnce(firstResult);
    mockRegister.mockResolvedValueOnce(secondResult);

    expect(await client.register(first)).toBe(firstResult);
    expect(await client.register(second)).toBe(secondResult);
    expect(mockRegister).toHaveBeenCalledTimes(2);
    expect(mockRegister).toHaveBeenCalledWith(first);
    expect(mockRegister).toHaveBeenCalledWith(second);
  });

  it('returns the PasskeyAuth unlock result and calls unlock with no arguments', async () => {
    const client = createWalletClient();
    const result = { tag: 'unlock' };
    mockUnlock.mockResolvedValueOnce(result);

    expect(await client.unlock()).toBe(result);
    expect(mockUnlock).toHaveBeenCalledTimes(1);
    expect(mockUnlock).toHaveBeenCalledWith();
  });

  it('returns each PasskeyAuth link result for the two argument lists', async () => {
    const client = createWalletClient();
    const firstKeys = { id: 'keys' } as KeyRing;
    const secondKeys = { id: 'other-keys' } as KeyRing;
    const firstResult = { tag: 'link-first' };
    const secondResult = { tag: 'link-second' };
    mockLink.mockResolvedValueOnce(firstResult);
    mockLink.mockResolvedValueOnce(secondResult);

    expect(await client.link('bitcoin', 'session-token', firstKeys, 5)).toBe(firstResult);
    expect(await client.link('evm', 'other-token', secondKeys)).toBe(secondResult);
    expect(mockLink).toHaveBeenCalledTimes(2);
    expect(mockLink).toHaveBeenCalledWith('bitcoin', 'session-token', firstKeys, 5);
    expect(mockLink).toHaveBeenCalledWith('evm', 'other-token', secondKeys);
  });

  it('returns each PasskeyAuth revoke result for Lost and for Compromised', async () => {
    const client = createWalletClient();
    const lost = { tag: 'revoke-lost' };
    const compromised = { tag: 'revoke-compromised' };
    mockRevoke.mockResolvedValueOnce(lost);
    mockRevoke.mockResolvedValueOnce(compromised);

    expect(await client.revoke('Lost')).toBe(lost);
    expect(await client.revoke('Compromised')).toBe(compromised);
    expect(mockRevoke).toHaveBeenCalledTimes(2);
    expect(mockRevoke).toHaveBeenCalledWith('Lost');
    expect(mockRevoke).toHaveBeenCalledWith('Compromised');
  });

  it('returns each PasskeyAuth exportMnemonic result for the two credential ids', async () => {
    const client = createWalletClient();
    const firstId = new Uint8Array([4, 5, 6]);
    const secondId = new Uint8Array([7]);
    const firstResult = ['word-one', 'word-two'];
    const secondResult = ['other-word'];
    mockExport.mockResolvedValueOnce(firstResult);
    mockExport.mockResolvedValueOnce(secondResult);

    expect(await client.exportMnemonic(firstId)).toBe(firstResult);
    expect(await client.exportMnemonic(secondId)).toBe(secondResult);
    expect(mockExport).toHaveBeenCalledTimes(2);
    expect(mockExport).toHaveBeenCalledWith(firstId);
    expect(mockExport).toHaveBeenCalledWith(secondId);
  });

  it('returns each PasskeyAuth verifyServerAddresses result for the two wallet and key pairs', () => {
    const client = createWalletClient();
    const firstWallet = { id: 'wallet' } as PasskeyWallet;
    const secondWallet = { id: 'other-wallet' } as PasskeyWallet;
    const firstKeys = { id: 'keys' } as KeyRing;
    const secondKeys = { id: 'other-keys' } as KeyRing;
    const firstResult = [{ address: 'bc1qexample', family: 'bitcoin', matches: true }];
    const secondResult = [{ address: '0xabc', family: 'evm', matches: false }];
    mockVerify.mockReturnValueOnce(firstResult);
    mockVerify.mockReturnValueOnce(secondResult);

    expect(client.verifyServerAddresses(firstWallet, firstKeys)).toBe(firstResult);
    expect(client.verifyServerAddresses(secondWallet, secondKeys)).toBe(secondResult);
    expect(mockVerify).toHaveBeenCalledTimes(2);
    expect(mockVerify).toHaveBeenCalledWith(firstWallet, firstKeys);
    expect(mockVerify).toHaveBeenCalledWith(secondWallet, secondKeys);
  });

  it('returns each PasskeyApi wallets result for the two session tokens', async () => {
    const client = createWalletClient();
    const firstResult = [{ id: 'wallet' }];
    const secondResult = [{ id: 'other-wallet' }];
    mockWallets.mockResolvedValueOnce(firstResult);
    mockWallets.mockResolvedValueOnce(secondResult);

    expect(await client.wallets('wallet-token')).toBe(firstResult);
    expect(await client.wallets('other-token')).toBe(secondResult);
    expect(mockWallets).toHaveBeenCalledTimes(2);
    expect(mockWallets).toHaveBeenCalledWith('wallet-token');
    expect(mockWallets).toHaveBeenCalledWith('other-token');
  });

  it('returns each PasskeyApi backupSeen result for the two id and token pairs', async () => {
    const client = createWalletClient();
    const firstResult = { id: 7 };
    const secondResult = { id: 9 };
    mockBackup.mockResolvedValueOnce(firstResult);
    mockBackup.mockResolvedValueOnce(secondResult);

    expect(await client.backupSeen(7, 'wallet-token')).toBe(firstResult);
    expect(await client.backupSeen(9, 'other-token')).toBe(secondResult);
    expect(mockBackup).toHaveBeenCalledTimes(2);
    expect(mockBackup).toHaveBeenCalledWith(7, 'wallet-token');
    expect(mockBackup).toHaveBeenCalledWith(9, 'other-token');
  });

  it('returns each PasskeyApi credentialStatus result for the two id lists', async () => {
    const client = createWalletClient();
    const firstIds = ['credential-a', 'credential-b'];
    const secondIds = ['credential-c'];
    const firstResult = [{ credentialId: 'credential-a', status: 'Active' }];
    const secondResult = [{ credentialId: 'credential-c', status: 'Unknown' }];
    mockStatus.mockResolvedValueOnce(firstResult);
    mockStatus.mockResolvedValueOnce(secondResult);

    expect(await client.credentialStatus(firstIds)).toBe(firstResult);
    expect(await client.credentialStatus(secondIds)).toBe(secondResult);
    expect(mockStatus).toHaveBeenCalledTimes(2);
    expect(mockStatus).toHaveBeenCalledWith(firstIds);
    expect(mockStatus).toHaveBeenCalledWith(secondIds);
  });

  it('returns each PasskeyApi diagnostics result for the two records', async () => {
    const client = createWalletClient();
    const first = { stage: 'Registration', outcome: 'Aborted' } as const;
    const second = { stage: 'Authentication', outcome: 'Failure' } as const;
    const firstResult = { tag: 'diagnostics-first' };
    const secondResult = { tag: 'diagnostics-second' };
    mockDiagnostics.mockResolvedValueOnce(firstResult);
    mockDiagnostics.mockResolvedValueOnce(secondResult);

    expect(await client.diagnostics(first)).toBe(firstResult);
    expect(await client.diagnostics(second)).toBe(secondResult);
    expect(mockDiagnostics).toHaveBeenCalledTimes(2);
    expect(mockDiagnostics).toHaveBeenCalledWith(first);
    expect(mockDiagnostics).toHaveBeenCalledWith(second);
  });
});
