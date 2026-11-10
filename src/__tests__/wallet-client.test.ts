const mockLogin = jest.fn();
const mockRegister = jest.fn();
const mockLink = jest.fn();
const mockExport = jest.fn();
const mockVerify = jest.fn();
const mockWallets = jest.fn();
const mockStatus = jest.fn();
const mockDiagnostics = jest.fn();
const mockAssert = jest.fn();
const mockRevokeBegin = jest.fn();
const mockRevokeFinish = jest.fn();
const mockCacheUpdate = jest.fn();
const mockHttpCreated = jest.fn((_options: unknown, _instance: unknown) => undefined);
const mockPasskeyCreated = jest.fn((_http: unknown, _passkey: unknown) => undefined);
const mockCacheCreated = jest.fn((_storage: unknown, _key: unknown, _rpId: unknown, _instance: unknown) => undefined);
const mockAuthCreated = jest.fn((_options: unknown) => undefined);
const mockCeremoniesCreated = jest.fn((_env: unknown) => undefined);
const mockWalletEnvForHost = jest.fn((_hostname: unknown) => 'loc');

jest.mock('@dfx.swiss/wallet', () => ({
  RP_IDS: { loc: 'localhost', prd: 'app.dfx.swiss' },
  WalletError: class WalletError extends Error {
    code: string;
    constructor(code: string, message?: string) {
      super(message);
      this.code = code;
      this.name = 'WalletError';
    }
  },
  CredentialCache: function CredentialCache(storage: unknown, key: unknown, rpId: unknown) {
    const cache = { update: mockCacheUpdate };
    mockCacheCreated(storage, key, rpId, cache);
    return cache;
  },
  PasskeyCeremonies: function PasskeyCeremonies(env: unknown) {
    mockCeremoniesCreated(env);
    return { assert: mockAssert };
  },
  PasskeyAuth: function PasskeyAuth(options: unknown) {
    mockAuthCreated(options);
    return {
      login: mockLogin,
      register: mockRegister,
      link: mockLink,
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
      credentialStatus: mockStatus,
      diagnostics: mockDiagnostics,
      revokeBegin: mockRevokeBegin,
      revokeFinish: mockRevokeFinish,
    };
    mockPasskeyCreated(http, passkey);
    return passkey;
  },
  DfxApiClient: function DfxApiClient() {
    throw new Error('DfxApiClient must not be constructed');
  },
}));

jest.mock('../components/home/wallet/passkey-host', () => ({
  walletEnvForHost: (hostname: unknown) => mockWalletEnvForHost(hostname),
}));

import { credentialBytes, credentialIdText } from '../components/home/wallet/passkey-bytes';
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
    mockLink.mockClear();
    mockExport.mockClear();
    mockVerify.mockClear();
    mockWallets.mockClear();
    mockStatus.mockClear();
    mockDiagnostics.mockClear();
    mockAssert.mockClear();
    mockRevokeBegin.mockClear();
    mockRevokeFinish.mockClear();
    mockCacheUpdate.mockClear();
    mockHttpCreated.mockClear();
    mockPasskeyCreated.mockClear();
    mockCacheCreated.mockClear();
    mockAuthCreated.mockClear();
    mockCeremoniesCreated.mockClear();
    mockWalletEnvForHost.mockReset();
    mockWalletEnvForHost.mockReturnValue('loc');
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
    mockStatus.mockResolvedValueOnce({ tag: 'status' });
    mockDiagnostics.mockResolvedValueOnce({ tag: 'diagnostics' });

    expect(http.setToken).not.toHaveBeenCalled();
    await client.link('evm', 'wallet-token', keys, 2);
    await client.wallets('wallet-token');
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

  it('calls walletEnvForHost once with the hostname and forwards loc to auth, ceremonies and the rp id', () => {
    setHostname('localhost');
    mockWalletEnvForHost.mockReturnValue('loc');
    createWalletClient();
    const cache = mockCacheCreated.mock.calls[0][3];

    expect(mockWalletEnvForHost).toHaveBeenCalledTimes(1);
    expect(mockWalletEnvForHost).toHaveBeenCalledWith('localhost');
    expect(mockCeremoniesCreated).toHaveBeenCalledTimes(1);
    expect(mockCeremoniesCreated).toHaveBeenCalledWith('loc');
    expect(mockCacheCreated).toHaveBeenCalledTimes(1);
    expect(mockCacheCreated).toHaveBeenCalledWith(undefined, 'dfx.wallet.credentials.v1', RP_IDS.loc, cache);
    expect(authOptions().cache).toBe(cache);
    expect(authOptions().env).toBe('loc');
  });

  it('calls walletEnvForHost once with the hostname and forwards prd to auth, ceremonies and the rp id', () => {
    setHostname('app.dfx.swiss');
    mockWalletEnvForHost.mockReturnValue('prd');
    createWalletClient();
    const cache = mockCacheCreated.mock.calls[0][3];

    expect(mockWalletEnvForHost).toHaveBeenCalledTimes(1);
    expect(mockWalletEnvForHost).toHaveBeenCalledWith('app.dfx.swiss');
    expect(mockCeremoniesCreated).toHaveBeenCalledTimes(1);
    expect(mockCeremoniesCreated).toHaveBeenCalledWith('prd');
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

  it('pins the stored credential id when revoking and updates the cache only if the wallet is not Active', async () => {
    const client = createWalletClient();
    const pinned = credentialBytes('cred');
    const ceremonies = (authOptions() as { ceremonies: { assert: jest.Mock } }).ceremonies;
    const lost = { id: 7, status: 'Lost' };
    const compromised = { id: 7, status: 'Compromised' };
    const active = { id: 7, status: 'Active' };
    mockRevokeBegin.mockResolvedValue({
      rpId: 'localhost',
      challenge: 'Y2hhbGxlbmdl',
      challengeId: 'challenge-1',
    });
    mockAssert.mockResolvedValue({ credentialId: pinned, assertion: { id: 'assertion-body' } });
    mockRevokeFinish.mockResolvedValueOnce(lost);
    mockRevokeFinish.mockResolvedValueOnce(compromised);
    mockRevokeFinish.mockResolvedValueOnce(active);

    expect(ceremonies.assert).toBe(mockAssert);
    expect(await client.revoke('Lost', 'cred')).toBe(lost);
    expect(mockCacheUpdate).toHaveBeenCalledTimes(1);
    expect(mockCacheUpdate).toHaveBeenLastCalledWith(credentialIdText(pinned), { state: 'revoked' });
    expect(await client.revoke('Compromised', 'cred')).toBe(compromised);
    expect(mockCacheUpdate).toHaveBeenCalledTimes(2);
    expect(mockCacheUpdate).toHaveBeenLastCalledWith(credentialIdText(pinned), { state: 'revoked' });
    expect(await client.revoke('Lost', 'cred')).toBe(active);
    expect(mockCacheUpdate).toHaveBeenCalledTimes(2);
    expect(mockCeremoniesCreated).toHaveBeenCalledTimes(1);
    expect(mockAssert).toHaveBeenCalledWith({
      challenge: credentialBytes('Y2hhbGxlbmdl'),
      credentialId: pinned,
    });
    expect(mockRevokeFinish).toHaveBeenNthCalledWith(1, {
      challengeId: 'challenge-1',
      credential: { id: 'assertion-body' },
      reason: 'Lost',
    });
    expect(mockRevokeFinish).toHaveBeenNthCalledWith(2, {
      challengeId: 'challenge-1',
      credential: { id: 'assertion-body' },
      reason: 'Compromised',
    });
  });

  it('rejects a revoke assertion for a different credential and does not finish it', async () => {
    const client = createWalletClient();
    const pinned = credentialBytes('cred');
    const differentLength = new Uint8Array([9]);
    const differentBytes = new Uint8Array(pinned);
    differentBytes[0] ^= 0xff;
    const differentLastByte = new Uint8Array(pinned);
    differentLastByte[pinned.length - 1] ^= 0xff;
    mockRevokeBegin.mockResolvedValue({
      rpId: 'localhost',
      challenge: 'Y2hhbGxlbmdl',
      challengeId: 'challenge-1',
    });
    mockAssert.mockResolvedValueOnce({ credentialId: differentLength, assertion: { id: 'other' } });
    mockAssert.mockResolvedValueOnce({ credentialId: differentBytes, assertion: { id: 'other' } });
    mockAssert.mockResolvedValueOnce({ credentialId: differentLastByte, assertion: { id: 'other' } });

    await expect(client.revoke('Lost', 'cred')).rejects.toMatchObject({
      code: 'credential-mismatch',
      message: 'The authenticator returned a different passkey',
    });
    await expect(client.revoke('Compromised', 'cred')).rejects.toMatchObject({
      code: 'credential-mismatch',
      message: 'The authenticator returned a different passkey',
    });
    await expect(client.revoke('Lost', 'cred')).rejects.toMatchObject({
      code: 'credential-mismatch',
      message: 'The authenticator returned a different passkey',
    });
    expect(mockAssert).toHaveBeenCalledWith({
      challenge: credentialBytes('Y2hhbGxlbmdl'),
      credentialId: pinned,
    });
    expect(mockRevokeFinish).not.toHaveBeenCalled();
    expect(mockCacheUpdate).not.toHaveBeenCalled();
  });

  it('rejects a revoke challenge for the wrong relying party before asserting', async () => {
    const client = createWalletClient();
    mockRevokeBegin.mockResolvedValueOnce({
      rpId: 'evil.example',
      challenge: 'Y2hhbGxlbmdl',
      challengeId: 'challenge-1',
    });

    await expect(client.revoke('Lost', 'cred')).rejects.toMatchObject({
      code: 'wrong-origin',
      message: 'The server expects RP ID evil.example, this wallet uses localhost',
    });
    expect(mockAssert).not.toHaveBeenCalled();
    expect(mockRevokeFinish).not.toHaveBeenCalled();
    expect(mockCacheUpdate).not.toHaveBeenCalled();
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
