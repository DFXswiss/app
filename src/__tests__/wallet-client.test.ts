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
const mockApiCreated = jest.fn((_options: unknown, _instance: unknown) => undefined);
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
  DfxApiClient: function DfxApiClient(options: unknown) {
    const api = {
      passkey: {
        wallets: mockWallets,
        backupSeen: mockBackup,
        credentialStatus: mockStatus,
        diagnostics: mockDiagnostics,
      },
    };
    mockApiCreated(options, api);
    return api;
  },
}));

import { createWalletClient } from '../components/home/wallet/wallet-client';
import type { KeyRing } from '@dfx.swiss/wallet';
import { RP_IDS } from '@dfx.swiss/wallet';
import type { PasskeyWallet } from '@dfx.swiss/core';
import { Api } from '../config/api';
import { walletEnvForHost } from '../components/home/wallet/passkey-host';

it('forwards each wallet operation and its arguments to the existing adapters', async () => {
  const client = createWalletClient();
  const env = walletEnvForHost(window.location.hostname);
  const api = mockApiCreated.mock.calls[0][1];
  const cache = mockCacheCreated.mock.calls[0][3];
  const authOptions = mockAuthCreated.mock.calls[0][0] as { api: unknown; cache: unknown; env: string };
  expect(mockApiCreated).toHaveBeenCalledWith({ apiUrl: `${Api.url.replace(/\/$/, '')}/${Api.version}` }, api);
  expect(mockCacheCreated).toHaveBeenCalledWith(undefined, 'dfx.wallet.credentials.v1', RP_IDS[env], cache);
  expect(mockAuthCreated).toHaveBeenCalledWith(expect.objectContaining({ api, cache, env }));
  expect(authOptions.api).toBe(api);
  expect(authOptions.cache).toBe(cache);
  const keys = {} as KeyRing;
  const wallet = {} as PasskeyWallet;
  const bytes = new Uint8Array([1]);
  const diagnostic = { stage: 'Authentication', outcome: 'Success' } as const;
  const results = {
    login: { value: 'login' },
    register: { value: 'register' },
    unlock: { value: 'unlock' },
    link: { value: 'link' },
    revoke: { value: 'revoke' },
    exportMnemonic: { value: 'export' },
    verify: { value: 'verify' },
    wallets: { value: 'wallets' },
    backup: { value: 'backup' },
    status: { value: 'status' },
    diagnostics: { value: 'diagnostics' },
  };
  mockLogin.mockResolvedValueOnce(results.login);
  mockRegister.mockResolvedValueOnce(results.register);
  mockUnlock.mockResolvedValueOnce(results.unlock);
  mockLink.mockResolvedValueOnce(results.link);
  mockRevoke.mockResolvedValueOnce(results.revoke);
  mockExport.mockResolvedValueOnce(results.exportMnemonic);
  mockVerify.mockReturnValueOnce(results.verify);
  mockWallets.mockResolvedValueOnce(results.wallets);
  mockBackup.mockResolvedValueOnce(results.backup);
  mockStatus.mockResolvedValueOnce(results.status);
  mockDiagnostics.mockResolvedValueOnce(results.diagnostics);
  expect(await client.login()).toBe(results.login);
  expect(await client.register({ mail: 'wallet@example.com' })).toBe(results.register);
  expect(await client.unlock()).toBe(results.unlock);
  expect(await client.link('evm', 'wallet-token', keys, 2)).toBe(results.link);
  expect(await client.revoke('Compromised')).toBe(results.revoke);
  expect(await client.exportMnemonic(bytes)).toBe(results.exportMnemonic);
  expect(client.verifyServerAddresses(wallet, keys)).toBe(results.verify);
  expect(await client.wallets('wallet-token')).toBe(results.wallets);
  expect(await client.backupSeen(7, 'wallet-token')).toBe(results.backup);
  expect(await client.credentialStatus(['credential'])).toBe(results.status);
  expect(await client.diagnostics(diagnostic)).toBe(results.diagnostics);
  expect(mockLogin).toHaveBeenCalledWith();
  expect(mockRegister).toHaveBeenCalledWith({ mail: 'wallet@example.com' });
  expect(mockUnlock).toHaveBeenCalledWith();
  expect(mockLink).toHaveBeenCalledWith('evm', 'wallet-token', keys, 2);
  expect(mockRevoke).toHaveBeenCalledWith('Compromised');
  expect(mockExport).toHaveBeenCalledWith(bytes);
  expect(mockVerify).toHaveBeenCalledWith(wallet, keys);
  expect(mockWallets).toHaveBeenCalledWith('wallet-token');
  expect(mockBackup).toHaveBeenCalledWith(7, 'wallet-token');
  expect(mockStatus).toHaveBeenCalledWith(['credential']);
  expect(mockDiagnostics).toHaveBeenCalledWith(diagnostic);
});
