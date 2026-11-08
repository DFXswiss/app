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

jest.mock('@dfx.swiss/wallet', () => ({
  RP_IDS: { loc: 'localhost', prd: 'app.dfx.swiss' },
  CredentialCache: function CredentialCache() {
    return {};
  },
  PasskeyCeremonies: function PasskeyCeremonies() {
    return {};
  },
  PasskeyAuth: function PasskeyAuth() {
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
  DfxApiClient: function DfxApiClient() {
    return {
      passkey: {
        wallets: mockWallets,
        backupSeen: mockBackup,
        credentialStatus: mockStatus,
        diagnostics: mockDiagnostics,
      },
    };
  },
}));

import { createWalletClient } from '../components/home/wallet/wallet-client';
import type { KeyRing } from '@dfx.swiss/wallet';
import type { PasskeyWallet } from '@dfx.swiss/core';

it('forwards each wallet operation and its arguments to the existing adapters', async () => {
  const client = createWalletClient();
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
