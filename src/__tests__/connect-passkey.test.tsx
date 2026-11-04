jest.mock('@dfx.swiss/react/dist/definitions/auth', () => ({
  AuthWalletType: { METAMASK: 'MetaMask', ALBY: 'Alby', WALLET_BROWSER: 'WalletBrowser', RABBY: 'Rabby' },
}));

const mockLogout = jest.fn(() => Promise.resolve());

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: { ETHEREUM: 'Ethereum', BITCOIN: 'Bitcoin' },
  Utils: { isJwt: () => false },
  useApiSession: () => ({ updateSession: () => undefined }),
  useAuth: () => ({ getSignMessage: () => undefined }),
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
const mockSetSession = jest.fn(() => Promise.resolve());

jest.mock(
  '@dfx.swiss/wallet',
  () => ({
    RP_IDS: { prd: 'app.dfx.swiss', dev: 'dev.app.dfx.swiss', stg: 'stg.app.dfx.swiss', loc: 'localhost' },
    checkPasskeyPlatform: (...args: unknown[]) => mockCheckPasskeyPlatform(...args),
    PasskeyCeremonies: jest.fn(),
    PasskeyAuth: jest.fn().mockImplementation(() => ({
      register: (...args: unknown[]) => mockRegister(...args),
      login: (...args: unknown[]) => mockLogin(...args),
    })),
  }),
  { virtual: true },
);

jest.mock(
  '@dfx.swiss/core',
  () => ({
    DfxApiClient: jest.fn(),
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
import { WalletType } from '../contexts/wallet.context';

describe('ConnectPasskey', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('registers a passkey and opens the session when the browser can use passkeys', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockRegister.mockResolvedValue({ accessToken: 'token', state: 'unlocked' });

    renderPasskey();

    expect(await screen.findByRole('button', { name: 'Create passkey' })).toHaveAttribute('data-disabled', 'true');
    expect(screen.queryByText('Passkey login arrives with the wallet beta')).not.toBeInTheDocument();
    expect(screen.queryByText('This browser has no passkey support')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'user@example.com' } });
    expect(screen.getByRole('button', { name: 'Create passkey' })).not.toHaveAttribute('data-disabled');
    fireEvent.click(screen.getByRole('button', { name: 'Create passkey' }));

    await waitFor(() => expect(mockRegister).toHaveBeenCalledWith({ mail: 'user@example.com' }));
    await waitFor(() => expect(mockSetSession).toHaveBeenCalledWith('token', WalletType.PASSKEY));
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockOnLogin).toHaveBeenCalledTimes(1);
    expect(mockOnSwitch).not.toHaveBeenCalled();
  });

  it('logs in with an existing passkey', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockResolvedValue({ accessToken: 'token', state: 'unlocked' });

    renderPasskey();

    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockSetSession).toHaveBeenCalledWith('token', WalletType.PASSKEY));
    expect(mockRegister).not.toHaveBeenCalled();
    expect(mockOnLogin).toHaveBeenCalledTimes(1);
  });

  it('does not open a session when the passkey stays locked', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockResolvedValue({ accessToken: 'token', state: 'locked' });

    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('This passkey did not unlock the wallet')).toBeInTheDocument();
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(mockOnLogin).not.toHaveBeenCalled();
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
