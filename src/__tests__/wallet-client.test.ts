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
  await client.login();
  await client.register({ mail: 'wallet@example.com' });
  await client.unlock();
  await client.link('evm', 'wallet-token', keys, 2);
  await client.revoke('Compromised');
  await client.exportMnemonic(bytes);
  client.verifyServerAddresses(wallet, keys);
  await client.wallets('wallet-token');
  await client.backupSeen(7, 'wallet-token');
  await client.credentialStatus(['credential']);
  await client.diagnostics(diagnostic);
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
