jest.mock('@dfx.swiss/react/dist/definitions/auth', () => ({
  AuthWalletType: { METAMASK: 'MetaMask', ALBY: 'Alby', WALLET_BROWSER: 'WalletBrowser', RABBY: 'Rabby' },
}));

const mockLogout = jest.fn(() => Promise.resolve());
const mockGetAuthToken = jest.fn((): string | undefined => undefined);

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: { ETHEREUM: 'Ethereum', BITCOIN: 'Bitcoin' },
  Utils: { isJwt: () => false },
  useApiSession: () => ({ updateSession: () => undefined }),
  useAuth: () => ({ getSignMessage: () => undefined }),
  useAuthContext: () => ({ getAuthToken: () => mockGetAuthToken() }),
  useSessionContext: () => ({
    isInitialized: false,
    isLoggedIn: false,
    logout: () => mockLogout(),
    authenticate: () => undefined,
  }),
  useUserContext: () => ({ addSpecialCode: () => undefined, reloadUser: () => undefined }),
}));

const mockOnLogin = jest.fn();
const mockOnCancel = jest.fn();
const mockOnSwitch = jest.fn();

jest.mock('../hooks/wallets/metamask.hook', () => ({
  WalletType: { META_MASK: 'MetaMask', RABBY: 'Rabby', IN_APP_BROWSER: 'InAppBrowser' },
  useMetaMask: () => ({ getWalletType: () => undefined }),
}));

jest.mock('../hooks/store.hook', () => ({
  useStore: () => ({
    activeWallet: { get: () => undefined, set: () => undefined, remove: () => undefined },
  }),
}));

jest.mock('../contexts/balance.context', () => ({
  useBalanceContext: () => ({ readBalances: () => undefined }),
}));

jest.mock('browser-lang', () => ({
  __esModule: true,
  default: () => 'en',
}));

jest.mock('jwt-decode', () => ({
  jwtDecode: () => ({}),
}));

jest.mock('../contexts/app-handling.context', () => ({
  useAppHandlingContext: () => ({ isInitialized: true, params: {}, setRedirectPath: () => undefined }),
}));

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_key: string, defaultText: string) => defaultText,
  }),
}));

const mockCheckPasskeyPlatform = jest.fn(() => new Promise(() => undefined));
const mockRegister = jest.fn();
const mockLogin = jest.fn();
const mockClaim = jest.fn();
const mockLink = jest.fn();
const mockUnlock = jest.fn();
const mockRevoke = jest.fn();
const mockExport = jest.fn();
const mockVerify = jest.fn();
const mockWallets = jest.fn();
const mockBackupSeen = jest.fn();
const mockRevokeById = jest.fn();
const mockCredentialStatus = jest.fn();
const mockDiagnostics = jest.fn();
const mockSetSession = jest.fn(() => Promise.resolve());
let mockBuildLoginRing = (_mnemonic: unknown): { wipe: () => void } => {
  throw new Error('unexpected login ring');
};

// Plain constructors, not jest.fn(). This Jest drops mock implementations in clearAllMocks,
// which runs before every test and would remove register, login and the account routes.
jest.mock(
  '@dfx.swiss/wallet',
  () => ({
    RP_IDS: { prd: 'app.dfx.swiss', dev: 'dev.app.dfx.swiss', stg: 'stg.app.dfx.swiss', loc: 'localhost' },
    checkPasskeyPlatform: (...args: unknown[]) => mockCheckPasskeyPlatform(...args),
    PasskeyCeremonies: function PasskeyCeremonies() {
      return {};
    },
    CredentialCache: function CredentialCache() {
      return {};
    },
    KeyRing: {
      fromMnemonic: (mnemonic: unknown) => mockBuildLoginRing(mnemonic),
    },
    PasskeyAuth: function PasskeyAuth() {
      return {
        register: (...args: unknown[]) => mockRegister(...args),
        login: (...args: unknown[]) => mockLogin(...args),
        claim: (...args: unknown[]) => mockClaim(...args),
        link: (...args: unknown[]) => mockLink(...args),
        unlock: (...args: unknown[]) => mockUnlock(...args),
        revoke: (...args: unknown[]) => mockRevoke(...args),
        exportMnemonic: (...args: unknown[]) => mockExport(...args),
        verifyServerAddresses: (...args: unknown[]) => mockVerify(...args),
      };
    },
  }),
  { virtual: true },
);

jest.mock(
  '@dfx.swiss/core',
  () => ({
    DfxApiClient: function DfxApiClient() {
      return {
        passkey: {
          wallets: (...args: unknown[]) => mockWallets(...args),
          backupSeen: (...args: unknown[]) => mockBackupSeen(...args),
          revoke: (...args: unknown[]) => mockRevokeById(...args),
          credentialStatus: (...args: unknown[]) => mockCredentialStatus(...args),
          diagnostics: (...args: unknown[]) => mockDiagnostics(...args),
        },
      };
    },
  }),
  { virtual: true },
);

jest.mock('../contexts/wallet.context', () => ({
  WalletType: { PASSKEY: 'Passkey' },
  useWalletContext: () => ({ setSession: (...args: unknown[]) => mockSetSession(...args) }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  StyledVerticalStack: ({ children }: { children?: unknown }) => <div>{children}</div>,
  StyledButton: ({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} data-disabled={disabled ? 'true' : undefined}>
      {label}
    </button>
  ),
  StyledButtonWidth: { FULL: 'FULL' },
  StyledButtonColor: { GRAY: 'GRAY', RED: 'RED' },
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { RP_IDS } from '@dfx.swiss/wallet';
import ConnectPasskey, { passkeyPlatformBlock, walletEnvForHost } from '../components/home/wallet/connect-passkey';
import PasskeyDesk from '../components/home/wallet/passkey-desk';
import * as passkeySession from '../components/home/wallet/passkey-session';
import { setOpenPasskey } from '../components/home/wallet/passkey-session';
import { WalletType } from '../contexts/wallet.context';

const SEED = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';

function ring(address: string) {
  return { evm: () => ({ address }) };
}

function requireWallet() {
  const session = passkeySession.getOpenPasskey();
  if (!session?.wallet) throw new Error('expected an open passkey wallet');
  return { session, wallet: session.wallet };
}

function authResult(state: string, keys?: unknown, includeBitcoin = true) {
  return {
    accessToken: 'token',
    state,
    keys,
    wallet: {
      id: 7,
      credentialId: 'cred',
      status: 'Active',
      created: '2026-11-04',
      derivationVersion: 'V1',
      seedCheckAddress: SEED,
      backupEligible: true,
      backedUp: false,
      backupRequired: true,
      addresses: [
        { address: SEED, family: 'Evm', path: "m/44'/60'/0'/0/0", status: 'Active', blockchains: [] },
        ...(includeBitcoin
          ? [{ address: 'bc1qlogin', family: 'Bitcoin', path: "m/84'/0'/0'/0/0", status: 'Active', blockchains: [] }]
          : []),
      ],
    },
  };
}

describe('ConnectPasskey', () => {
  beforeEach(() => {
    setOpenPasskey(undefined);
    mockBuildLoginRing = () => {
      throw new Error('unexpected login ring');
    };
    jest.clearAllMocks();
    mockGetAuthToken.mockReturnValue(undefined);
    mockCheckPasskeyPlatform.mockImplementation(() => new Promise(() => undefined));
  });

  function renderPasskey() {
    return render(
      <ConnectPasskey
        rootRef={createRef<HTMLDivElement>()}
        wallet={WalletType.PASSKEY}
        isConnect={false}
        onLogin={mockOnLogin}
        onCancel={mockOnCancel}
        onSwitch={mockOnSwitch}
      />,
    );
  }

  it('shows the wallet-beta placeholder and wires the buttons', () => {
    renderPasskey();

    const hint = screen.getByText('Passkey login arrives with the wallet beta');
    expect(hint).toHaveClass('text-dfxGray-700');

    const passkeyButton = screen.getByRole('button', { name: 'Passkey' });
    expect(passkeyButton).toHaveAttribute('data-disabled', 'true');
    expect(() => fireEvent.click(passkeyButton)).not.toThrow();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(mockOnCancel).toHaveBeenCalledTimes(1);

    expect(mockOnLogin).not.toHaveBeenCalled();
    expect(mockOnSwitch).not.toHaveBeenCalled();
    expect(mockCheckPasskeyPlatform).toHaveBeenCalledWith('loc');
  });

  it('keeps the button disabled and shows the platform block when the browser cannot use passkeys', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: false, reason: 'no-webauthn', prf: 'unknown' });

    renderPasskey();

    expect(await screen.findByText('This browser has no passkey support')).toBeInTheDocument();
    expect(screen.getByText('Passkey login arrives with the wallet beta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Passkey' })).toHaveAttribute('data-disabled', 'true');
    expect(mockOnLogin).not.toHaveBeenCalled();
    expect(mockOnSwitch).not.toHaveBeenCalled();
  });

  it('registers a passkey and opens the app only from the desk', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    const keys = { id: 'keys' };
    mockRegister.mockResolvedValue(authResult('unlocked', keys));

    renderPasskey();

    expect(await screen.findByRole('button', { name: 'Create passkey' })).toHaveAttribute('data-disabled', 'true');
    expect(screen.queryByText('Passkey login arrives with the wallet beta')).not.toBeInTheDocument();
    expect(screen.queryByText('This browser has no passkey support')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'user@example.com' } });
    expect(screen.getByRole('button', { name: 'Create passkey' })).not.toHaveAttribute('data-disabled');
    fireEvent.click(screen.getByRole('button', { name: 'Create passkey' }));

    await waitFor(() => expect(mockRegister).toHaveBeenCalledWith({ mail: 'user@example.com' }));
    expect(await screen.findByRole('button', { name: 'Open the app' })).toBeInTheDocument();
    expect(screen.getByRole('list')).toHaveTextContent(SEED);
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(mockOnLogin).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Open the app' }));
    await waitFor(() => expect(mockSetSession).toHaveBeenCalledWith('token', WalletType.PASSKEY));
    expect(mockOnLogin).toHaveBeenCalledTimes(1);
    expect(mockOnCancel).toHaveBeenCalledTimes(1);
    expect(mockOnSwitch).not.toHaveBeenCalled();
  });

  it('logs in with an existing passkey and waits for the app to be opened', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockResolvedValue(authResult('unlocked', { id: 'keys' }));

    renderPasskey();

    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('The wallet is unlocked.')).toBeInTheDocument();
    expect(mockRegister).not.toHaveBeenCalled();
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(mockOnLogin).not.toHaveBeenCalled();
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('keeps a locked passkey on the desk and opens the account only from the app button', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockResolvedValue(authResult('locked'));

    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('This passkey did not unlock the wallet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Link Bitcoin' })).toHaveAttribute('data-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Show recovery words' })).toHaveAttribute('data-disabled', 'true');
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(mockOnLogin).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Link Bitcoin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show recovery words' }));
    expect(mockLink).not.toHaveBeenCalled();
    expect(mockExport).not.toHaveBeenCalled();

    const keys = ring(SEED);
    mockUnlock.mockResolvedValue({ state: 'unlocked', keys });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock wallet' }));
    await waitFor(() => expect(mockUnlock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('The wallet is unlocked.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Link Bitcoin' })).not.toHaveAttribute('data-disabled'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open the app' }));
    await waitFor(() => expect(mockSetSession).toHaveBeenCalledWith('token', WalletType.PASSKEY));
    expect(mockOnLogin).toHaveBeenCalledTimes(1);
    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it('links bitcoin once when the unlocked server list has no bitcoin address', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    const keys = { id: 'keys' };
    mockLogin.mockResolvedValue(authResult('unlocked', keys, false));
    mockLink.mockResolvedValue({
      accessToken: 'linked-token',
      address: { family: 'Bitcoin', address: 'bc1qlogin', path: "m/84'/0'/0'/0/0" },
    });
    mockWallets.mockResolvedValue([authResult('unlocked', keys).wallet]);

    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(mockLink).toHaveBeenCalledTimes(1));
    expect(mockLink).toHaveBeenCalledWith('bitcoin', 'token', keys, 0);
    expect(await screen.findByText('Linked Bitcoin bc1qlogin.')).toBeInTheDocument();
    expect(screen.getByRole('list')).toHaveTextContent('bc1qlogin');
  });

  it('adds a passkey to the signed-in account without logging that account out', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockClaim.mockResolvedValue(authResult('unlocked', { id: 'keys' }));

    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Add passkey to this account' }));
    expect(
      await screen.findByText('Sign in with mail first. The passkey is added to that account.'),
    ).toBeInTheDocument();
    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockLogout).not.toHaveBeenCalled();

    mockGetAuthToken.mockReturnValue('mail-token');
    fireEvent.click(screen.getByRole('button', { name: 'Add passkey to this account' }));
    await waitFor(() => expect(mockClaim).toHaveBeenCalledWith('mail-token'));
    expect(await screen.findByRole('button', { name: 'Open the app' })).toBeInTheDocument();
    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('links bitcoin, records a diagnostic and shows the recovery words once', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    const keys = { id: 'keys' };
    mockLogin.mockResolvedValue(authResult('unlocked', keys));
    mockLink.mockResolvedValue({
      accessToken: 'linked-token',
      address: { family: 'Bitcoin', address: 'tb1qexample', path: "m/84'/1'/0'/0/0" },
    });
    mockWallets.mockResolvedValue([authResult('unlocked', keys).wallet]);
    mockDiagnostics.mockResolvedValue(undefined);
    mockExport.mockResolvedValue(['alpha', 'bravo']);

    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    await screen.findByRole('button', { name: 'Link Bitcoin' });

    fireEvent.click(screen.getByRole('button', { name: 'Link Bitcoin' }));
    await waitFor(() => expect(mockLink).toHaveBeenCalledWith('bitcoin', 'token', keys, 0));
    expect(await screen.findByText('Linked Bitcoin tb1qexample.')).toBeInTheDocument();
    expect(mockWallets).toHaveBeenCalledWith('token');

    fireEvent.click(screen.getByRole('button', { name: 'Record a diagnostic' }));
    await waitFor(() => expect(mockDiagnostics).toHaveBeenCalledWith({ stage: 'Authentication', outcome: 'Success' }));
    expect(await screen.findByText('Diagnostic recorded.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show recovery words' }));
    expect(await screen.findByTestId('passkey-recovery-words')).toHaveTextContent('alpha bravo');
    expect(mockExport).toHaveBeenCalledWith(Uint8Array.from(atob('cred'), (char) => char.charCodeAt(0)));
    fireEvent.click(screen.getByRole('button', { name: 'Hide recovery words' }));
    expect(screen.queryByTestId('passkey-recovery-words')).not.toBeInTheDocument();
  });

  it('links and checks the mainnet login ring when the open wallet uses testnet Bitcoin', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    const wiped = jest.fn();
    const loginRing = { bitcoinNetwork: 'mainnet', wipe: wiped };
    const phrases: unknown[] = [];
    mockBuildLoginRing = (mnemonic: unknown) => {
      phrases.push(mnemonic);
      return loginRing;
    };
    const keys = {
      bitcoinNetwork: 'testnet4',
      mnemonic: () => 'seed phrase',
      wipe: jest.fn(),
    };
    mockLogin.mockResolvedValue(authResult('unlocked', keys));
    mockLink.mockResolvedValue({
      accessToken: 'linked-token',
      address: { family: 'Bitcoin', address: 'bc1qlogin', path: "m/84'/0'/0'/0/0" },
    });
    mockWallets.mockResolvedValue([authResult('unlocked', keys).wallet]);

    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    await screen.findByRole('button', { name: 'Link Bitcoin' });

    fireEvent.click(screen.getByRole('button', { name: 'Link Bitcoin' }));
    await waitFor(() => expect(mockLink).toHaveBeenCalledWith('bitcoin', 'token', loginRing, 0));
    expect(await screen.findByText('Linked Bitcoin bc1qlogin.')).toBeInTheDocument();
    expect(wiped).toHaveBeenCalledTimes(1);
    expect(keys.wipe).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Link Bitcoin' })).not.toHaveAttribute('data-disabled'),
    );

    mockLink.mockRejectedValueOnce(new Error('link failed'));
    fireEvent.click(screen.getByRole('button', { name: 'Link Bitcoin' }));
    expect(await screen.findByText('link failed')).toBeInTheDocument();
    expect(wiped).toHaveBeenCalledTimes(2);
    expect(keys.wipe).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Check server addresses' })).not.toHaveAttribute('data-disabled'),
    );

    mockVerify.mockReturnValue([{ address: 'bc1qlogin', family: 'Bitcoin', matches: true }]);
    fireEvent.click(screen.getByRole('button', { name: 'Check server addresses' }));
    await waitFor(() => expect(mockVerify).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), loginRing));
    expect(await screen.findByText('Checked 1 addresses.')).toBeInTheDocument();
    expect(wiped).toHaveBeenCalledTimes(3);
    expect(phrases).toEqual(['seed phrase', 'seed phrase', 'seed phrase']);
  });

  it('lists wallets, marks the backup and reads credential status', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    const keys = { id: 'keys' };
    const wallet = authResult('unlocked', keys).wallet;
    mockLogin.mockResolvedValue(authResult('unlocked', keys));
    mockWallets.mockResolvedValue([wallet]);
    mockBackupSeen.mockResolvedValue({ ...wallet, backupRequired: false });
    mockCredentialStatus.mockResolvedValue([{ credentialId: 'cred', status: 'Active' }]);

    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    await screen.findByRole('button', { name: 'Refresh wallets' });

    fireEvent.click(screen.getByRole('button', { name: 'Refresh wallets' }));
    await waitFor(() => expect(mockWallets).toHaveBeenCalledWith('token'));
    expect(await screen.findByText('Wallets on this account: 1.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mark backup seen' }));
    await waitFor(() => expect(mockBackupSeen).toHaveBeenCalledWith(7, 'token'));
    expect(await screen.findByText('Backup marked as seen.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Credential status' }));
    await waitFor(() => expect(mockCredentialStatus).toHaveBeenCalledWith(['cred']));
    expect(await screen.findByText('cred: Active')).toBeInTheDocument();
  });

  it('returns to the form after the passkey revokes the wallet', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockResolvedValue(authResult('seed-mismatch', { id: 'keys' }));
    mockRevoke.mockResolvedValue({ status: 'Lost' });

    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('This passkey does not match the wallet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Link EVM account' })).toHaveAttribute('data-disabled', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Revoke with passkey as lost' }));
    expect(await screen.findByText('The passkey wallet was revoked.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    expect(mockRevoke).toHaveBeenCalledWith('Lost');
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('shows the ceremony error and stays on the form', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockRejectedValue(new Error('The authenticator returned no credential'));

    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('The authenticator returned no credential')).toBeInTheDocument();
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Log in' })).not.toHaveAttribute('data-disabled');
  });

  it('keeps the account token after a link and refuses a second passkey on unlock', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    const keys = ring(SEED);
    mockLogin.mockResolvedValue(authResult('locked'));
    mockUnlock.mockResolvedValueOnce({ state: 'unlocked', keys: ring(OTHER) });

    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    await screen.findByRole('button', { name: 'Unlock wallet' });

    fireEvent.click(screen.getByRole('button', { name: 'Unlock wallet' }));
    expect(await screen.findByText('This passkey does not match the wallet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Link Bitcoin' })).toHaveAttribute('data-disabled', 'true');

    mockUnlock.mockResolvedValueOnce({ state: 'unlocked', keys });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock wallet' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Link Bitcoin' })).not.toHaveAttribute('data-disabled'),
    );

    fireEvent.change(screen.getByLabelText('EVM account index'), { target: { value: 'nope' } });
    expect(screen.getByRole('button', { name: 'Link EVM account' })).toHaveAttribute('data-disabled', 'true');
    fireEvent.change(screen.getByLabelText('EVM account index'), { target: { value: '100' } });
    expect(screen.getByRole('button', { name: 'Link EVM account' })).toHaveAttribute('data-disabled', 'true');
    fireEvent.change(screen.getByLabelText('EVM account index'), { target: { value: '2' } });

    mockLink.mockResolvedValue({
      accessToken: 'linked-token',
      address: { family: 'Evm', address: OTHER, path: "m/44'/60'/0'/0/2" },
    });
    mockWallets.mockRejectedValueOnce(new Error('list failed'));
    fireEvent.click(screen.getByRole('button', { name: 'Link EVM account' }));
    await waitFor(() => expect(mockLink).toHaveBeenCalledWith('evm', 'token', keys, 2));
    expect(
      await screen.findByText('Linked Evm 0x2222222222222222222222222222222222222222. list failed'),
    ).toBeInTheDocument();
    expect(mockWallets).toHaveBeenCalledWith('token');
  });

  it('revokes by id only with a fresh login token', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockResolvedValue(authResult('unlocked', ring(SEED)));
    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    await screen.findByRole('button', { name: 'Revoke this wallet by id as lost' });

    fireEvent.click(screen.getByRole('button', { name: 'Revoke this wallet by id as lost' }));
    expect(await screen.findByText('Revoke by id needs a fresh mail or wallet login.')).toBeInTheDocument();
    expect(mockRevokeById).not.toHaveBeenCalled();

    mockGetAuthToken.mockReturnValue('mail-token');
    mockRevokeById.mockResolvedValueOnce({ ...authResult('unlocked').wallet, status: 'Active' });
    fireEvent.click(screen.getByRole('button', { name: 'Revoke this wallet by id as compromised' }));
    await waitFor(() => expect(mockRevokeById).toHaveBeenCalledWith(7, 'Compromised', 'mail-token'));
    expect(await screen.findByText('Wallet status is Active.')).toBeInTheDocument();

    mockRevokeById.mockResolvedValueOnce({ status: 'Lost' });
    fireEvent.click(screen.getByRole('button', { name: 'Revoke this wallet by id as lost' }));
    expect(await screen.findByText('The passkey wallet was revoked.')).toBeInTheDocument();
  });

  it('names the other wallet states, compares addresses and leaves the desk', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockResolvedValueOnce(authResult('compromised', ring(SEED)));
    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('This passkey was revoked as compromised')).toBeInTheDocument();

    act(() => {
      setOpenPasskey(undefined);
    });
    mockLogin.mockResolvedValueOnce(authResult('open-elsewhere', ring(SEED)));
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('This wallet is open in another tab')).toBeInTheDocument();

    mockVerify.mockReturnValue([{ address: SEED, family: 'Evm', matches: false }]);
    mockUnlock.mockResolvedValue({ state: 'unlocked', keys: ring(SEED) });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock wallet' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Check server addresses' })).not.toHaveAttribute('data-disabled'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Check server addresses' }));
    expect(await screen.findByText('Checked 1 addresses.')).toBeInTheDocument();
    expect(screen.getByRole('list')).toHaveTextContent('differs');

    fireEvent.click(screen.getByRole('button', { name: 'Start another ceremony' }));
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
  });

  it('stays on the desk when opening the app is refused', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockResolvedValue(authResult('unlocked', ring(SEED)));
    mockSetSession.mockRejectedValueOnce(new Error('The session was refused'));
    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open the app' }));
    expect(await screen.findByText('The session was refused')).toBeInTheDocument();
    expect(mockOnCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Open the app' })).toBeInTheDocument();
  });

  it('uses the generic sentence when the ceremony rejects without an error', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockRejectedValue('nope');
    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument();
  });

  it('does not log out when the tile is already a connect step', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockResolvedValue(authResult('unlocked', ring(SEED)));
    render(
      <ConnectPasskey
        rootRef={createRef<HTMLDivElement>()}
        wallet={WalletType.PASSKEY}
        isConnect
        onLogin={mockOnLogin}
        onCancel={mockOnCancel}
        onSwitch={mockOnSwitch}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('button', { name: 'Open the app' })).toBeInTheDocument();
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('ignores a platform report that arrives after the tile unmounts', async () => {
    let settle: (report: { available: boolean; reason: string; prf: string }) => void = () => undefined;
    mockCheckPasskeyPlatform.mockImplementation(
      () =>
        new Promise((resolve) => {
          settle = resolve;
        }),
    );

    const { unmount } = renderPasskey();
    unmount();

    await act(async () => {
      settle({ available: false, reason: 'no-webauthn', prf: 'unknown' });
    });
  });

  it('covers the remaining ceremony and desk branches', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockRejectedValueOnce(new Error('   '));
    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create passkey' }));
    expect(mockRegister).not.toHaveBeenCalled();

    let releaseLogin: (value: ReturnType<typeof authResult>) => void = () => undefined;
    mockLogin.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseLogin = resolve;
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await act(async () => {
      releaseLogin(authResult('unlocked', ring(SEED)));
    });
    await screen.findByRole('button', { name: 'Open the app' });
    expect(mockLogin).toHaveBeenCalledTimes(2);

    let releaseSession: () => void = () => undefined;
    mockSetSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseSession = resolve;
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open the app' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open the app' }));
    await act(async () => {
      releaseSession();
    });
    expect(mockSetSession).toHaveBeenCalledTimes(1);
    expect(mockOnCancel).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open the app' })).toBeInTheDocument());

    const closedSession = jest.spyOn(passkeySession, 'getOpenPasskey').mockReturnValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Open the app' }));
    closedSession.mockRestore();
    expect(mockSetSession).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('EVM account index'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Link EVM account' }));
    fireEvent.change(screen.getByLabelText('EVM account index'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Link EVM account' }));
    fireEvent.change(screen.getByLabelText('EVM account index'), { target: { value: '9007199254740993' } });
    fireEvent.click(screen.getByRole('button', { name: 'Link EVM account' }));
    expect(mockLink).not.toHaveBeenCalled();

    mockLink.mockRejectedValueOnce(new Error('link failed'));
    fireEvent.click(screen.getByRole('button', { name: 'Link Bitcoin' }));
    expect(await screen.findByText('link failed')).toBeInTheDocument();

    mockWallets.mockResolvedValueOnce([{ id: 8 }]);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh wallets' }));
    expect(await screen.findByText('Wallets on this account: 1.')).toBeInTheDocument();

    mockVerify.mockReturnValue([{ address: SEED, family: 'Evm', matches: true }]);
    fireEvent.click(screen.getByRole('button', { name: 'Check server addresses' }));
    expect(await screen.findByText('Checked 1 addresses.')).toBeInTheDocument();
    expect(screen.getByRole('list')).toHaveTextContent('matches');

    mockCredentialStatus.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole('button', { name: 'Credential status' }));
    expect(await screen.findByText('No credential status.')).toBeInTheDocument();

    const open = requireWallet();
    act(() => {
      setOpenPasskey({
        ...open.session,
        wallet: { ...open.wallet, credentialId: '' },
      });
    });
    mockExport.mockResolvedValueOnce(['one', 'two']);
    fireEvent.click(screen.getByRole('button', { name: 'Show recovery words' }));
    expect(await screen.findByTestId('passkey-recovery-words')).toHaveTextContent('one two');
    await waitFor(() => expect(mockExport).toHaveBeenCalledWith(undefined));
    fireEvent.click(screen.getByRole('button', { name: 'Hide recovery words' }));
    expect(screen.queryByTestId('passkey-recovery-words')).not.toBeInTheDocument();

    act(() => {
      const current = requireWallet();
      setOpenPasskey({ ...current.session, state: 'locked', keys: undefined });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Check server addresses' }));
    expect(mockVerify).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Unlock wallet' })).not.toHaveAttribute('data-disabled'),
    );

    mockUnlock.mockResolvedValueOnce({ state: 'locked' });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock wallet' }));
    await waitFor(() => expect(mockUnlock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Unlock wallet' })).not.toHaveAttribute('data-disabled'),
    );

    mockUnlock.mockResolvedValueOnce({
      state: 'unlocked',
      keys: {
        evm: () => {
          throw new Error('missing');
        },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock wallet' }));
    expect(await screen.findByText('Wallet 7, Active, seed-mismatch.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Unlock wallet' })).not.toHaveAttribute('data-disabled'),
    );

    act(() => {
      const current = requireWallet();
      setOpenPasskey({
        ...current.session,
        state: 'locked',
        keys: undefined,
        wallet: { ...current.wallet, seedCheckAddress: 'not-hex' },
      });
    });
    mockUnlock.mockResolvedValueOnce({ state: 'unlocked', keys: ring(SEED) });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock wallet' }));
    await waitFor(() => expect(mockUnlock).toHaveBeenCalledTimes(3));
    expect(await screen.findByText('Wallet 7, Active, seed-mismatch.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Unlock wallet' })).not.toHaveAttribute('data-disabled'),
    );

    let releaseDiagnostic: () => void = () => undefined;
    mockDiagnostics.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseDiagnostic = resolve;
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Record a diagnostic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start another ceremony' }));
    expect(screen.getByRole('button', { name: 'Open the app' })).toBeInTheDocument();
    await act(async () => {
      releaseDiagnostic();
    });

    const missingSession = jest.spyOn(passkeySession, 'getOpenPasskey').mockReturnValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Record a diagnostic' }));
    missingSession.mockRestore();
    expect(mockDiagnostics).toHaveBeenCalledTimes(1);

    mockUnlock.mockImplementationOnce(async () => {
      setOpenPasskey(undefined);
      return { state: 'unlocked', keys: ring(SEED) };
    });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock wallet' }));
    expect(await screen.findByLabelText('Email address')).toBeInTheDocument();

    mockLogin.mockResolvedValueOnce(authResult('unlocked', ring(SEED)));
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await screen.findByRole('button', { name: 'Revoke with passkey as compromised' });
    mockRevoke.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Revoke with passkey as compromised' }));
    expect(await screen.findByText('The passkey wallet was revoked.')).toBeInTheDocument();
    expect(mockRevoke).toHaveBeenCalledWith('Compromised');
  });

  it('renders no desk without a session and ignores routes after the session is gone', async () => {
    const empty = render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    expect(screen.queryByText('Passkey wallet')).not.toBeInTheDocument();
    empty.unmount();

    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockResolvedValueOnce(authResult('unlocked', ring(SEED)));
    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    await screen.findByRole('button', { name: 'Refresh wallets' });

    const gone = jest.spyOn(passkeySession, 'getOpenPasskey').mockReturnValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Revoke this wallet by id as lost' }));
    gone.mockRestore();
    expect(mockRevokeById).not.toHaveBeenCalled();

    act(() => {
      const current = requireWallet();
      setOpenPasskey({
        ...current.session,
        wallet: { ...current.wallet, status: undefined as unknown as string, addresses: undefined },
      });
    });
    expect(screen.getByText('Wallet 7, unknown, unlocked.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Refresh wallets' })).not.toHaveAttribute('data-disabled'),
    );

    const current = requireWallet();
    act(() => {
      setOpenPasskey({ ...current.session, wallet: undefined });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Revoke this wallet by id as lost' }));
    expect(mockRevokeById).not.toHaveBeenCalled();

    act(() => {
      setOpenPasskey(current.session);
    });
    mockWallets.mockImplementationOnce(() => {
      setOpenPasskey(undefined);
      return [{ id: 7 }];
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh wallets' }));
    expect(await screen.findByLabelText('Email address')).toBeInTheDocument();
  });
});

describe('passkey platform helpers', () => {
  it('maps the page host onto the wallet environment', () => {
    expect(walletEnvForHost('localhost')).toBe('loc');
    expect(walletEnvForHost('127.0.0.1')).toBe('loc');
    expect(walletEnvForHost('dev.app.dfx.swiss')).toBe('dev');
    expect(String(walletEnvForHost('stg.app.dfx.swiss'))).toBe('stg');
    expect(walletEnvForHost('app.dfx.swiss')).toBe('prd');
    expect(walletEnvForHost('example.test')).toBe('prd');
  });

  it('keeps an older wallet package on the production check for the staging host', () => {
    const ids = RP_IDS as { stg?: string };
    const previous = ids.stg;
    delete ids.stg;
    expect(walletEnvForHost('stg.app.dfx.swiss')).toBe('prd');
    ids.stg = previous;
  });

  it('explains only an unavailable platform', () => {
    expect(passkeyPlatformBlock(undefined)).toBeUndefined();
    expect(passkeyPlatformBlock({ available: true, prf: 'yes' })).toBeUndefined();
    expect(passkeyPlatformBlock({ available: false, prf: 'unknown' })).toBeUndefined();
    expect(passkeyPlatformBlock({ available: false, reason: 'no-webauthn', prf: 'unknown' })).toBe(
      'This browser has no passkey support',
    );
    expect(passkeyPlatformBlock({ available: false, reason: 'no-prf', prf: 'no' })).toBe(
      'This browser has no passkey support',
    );
    expect(passkeyPlatformBlock({ available: false, reason: 'in-app-browser', prf: 'unknown' })).toBe(
      'This browser has no passkey support',
    );
    expect(passkeyPlatformBlock({ available: false, reason: 'embedded', prf: 'unknown' })).toBe(
      'This browser has no passkey support',
    );
    expect(passkeyPlatformBlock({ available: false, reason: 'wrong-origin', prf: 'unknown' })).toBe(
      'This browser has no passkey support',
    );
    expect(passkeyPlatformBlock({ available: false, reason: 'os-too-old', prf: 'unknown', os: '17.5' })).toBe(
      'This browser has no passkey support',
    );
  });
});
