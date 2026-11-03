jest.mock('@dfx.swiss/react/dist/definitions/auth', () => ({
  AuthWalletType: { METAMASK: 'MetaMask', ALBY: 'Alby', WALLET_BROWSER: 'WalletBrowser', RABBY: 'Rabby' },
}));

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: { ETHEREUM: 'Ethereum', BITCOIN: 'Bitcoin' },
  Utils: { isJwt: () => false },
  useApiSession: () => ({ updateSession: () => undefined }),
  useAuth: () => ({ getSignMessage: () => undefined }),
  useSessionContext: () => ({
    isInitialized: false,
    isLoggedIn: false,
    logout: () => undefined,
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

jest.mock(
  '@dfx.swiss/wallet',
  () => ({
    RP_IDS: { prd: 'app.dfx.swiss', dev: 'dev.app.dfx.swiss', loc: 'localhost' },
    checkPasskeyPlatform: (...args: unknown[]) => mockCheckPasskeyPlatform(...args),
  }),
  { virtual: true },
);

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
  });

  it('shows no platform block when the browser can use passkeys', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });

    renderPasskey();

    await waitFor(() => expect(mockCheckPasskeyPlatform).toHaveBeenCalled());
    expect(screen.queryByText('This browser has no passkey support')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Passkey' })).toHaveAttribute('data-disabled', 'true');
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
    expect(walletEnvForHost('app.dfx.swiss')).toBe('prd');
    expect(walletEnvForHost('example.test')).toBe('prd');
  });

  it('explains only an unavailable platform', () => {
    expect(passkeyPlatformBlock(undefined)).toBeUndefined();
    expect(passkeyPlatformBlock({ available: true, prf: 'yes' })).toBeUndefined();
    expect(passkeyPlatformBlock({ available: false, prf: 'unknown' })).toBeUndefined();
    expect(passkeyPlatformBlock({ available: false, reason: 'no-webauthn', prf: 'unknown' })).toBe(
      'This browser has no passkey support',
    );
    expect(passkeyPlatformBlock({ available: false, reason: 'no-prf', prf: 'no' })).toBe(
      'This browser has no passkey PRF extension',
    );
    expect(passkeyPlatformBlock({ available: false, reason: 'in-app-browser', prf: 'unknown' })).toBe(
      'Passkeys do not run inside this in-app browser',
    );
    expect(passkeyPlatformBlock({ available: false, reason: 'embedded', prf: 'unknown' })).toBe(
      'Passkeys do not run in an embedded frame',
    );
    expect(passkeyPlatformBlock({ available: false, reason: 'wrong-origin', prf: 'unknown' })).toBe(
      'Passkeys are not available on this host',
    );
    expect(passkeyPlatformBlock({ available: false, reason: 'os-too-old', prf: 'unknown', os: '17.5' })).toBe(
      'This operating system is too old for passkeys',
    );
  });
});
