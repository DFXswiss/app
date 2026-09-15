// Component-level coverage for ConnectAlby: Alby auth redirect (personal-iban survival),
// pubkey login, install-hint gate via isAvailable, Content error/loading branches, and
// appParams / redirectPath guards.

const mockEnable = jest.fn();
const mockSignMessage = jest.fn();
const mockIsAvailable = jest.fn();
const mockRedirectPath = jest.fn();
const mockAppParams = jest.fn();
const mockOnCancel = jest.fn();
const mockOnLogin = jest.fn();
const mockOnSwitch = jest.fn();
const mockLogin = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: { LIGHTNING: 'Lightning' },
  useAuthContext: () => ({ session: undefined }),
  useSessionContext: () => ({ logout: jest.fn() }),
  useUserContext: () => ({ user: undefined }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', LG: 'lg' },
  StyledButton: ({ label, onClick }: any) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
  StyledButtonColor: { GRAY_OUTLINE: 'gray-outline' },
  StyledButtonWidth: { MIN: 'min', SM: 'sm' },
  StyledLoadingSpinner: () => null,
  StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
  StyledLink: ({ label }: any) => <a>{label}</a>,
}));

jest.mock('react-i18next', () => ({
  Trans: ({ children }: any) => <>{children}</>,
}));

jest.mock('../hooks/report-displayed-error.hook', () => ({
  useReportDisplayedError: () => undefined,
}));

jest.mock('../config/api', () => ({
  Api: { url: 'https://api.example.com', version: 'v1' },
}));

jest.mock('../contexts/app-handling.context', () => ({
  useAppHandlingContext: () => ({
    redirectPath: mockRedirectPath(),
    params: mockAppParams(),
  }),
}));

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_ns: string, key: string) => key,
  }),
}));

jest.mock('../contexts/wallet.context', () => ({
  WalletType: { ALBY: 'Alby' },
  WalletBlockchains: { Alby: ['Lightning'] },
  supportsBlockchain: () => true,
  useWalletContext: () => ({
    login: mockLogin,
    setSession: jest.fn(),
    switchBlockchain: jest.fn(),
    activeWallet: undefined,
  }),
}));

jest.mock('../hooks/wallets/alby.hook', () => ({
  useAlby: () => ({
    isAvailable: mockIsAvailable,
    enable: mockEnable,
    signMessage: mockSignMessage,
  }),
}));

jest.mock('../util/utils', () => {
  const actual = jest.requireActual('../util/utils');
  return {
    ...actual,
    delay: jest.fn(() => Promise.resolve()),
  };
});

import { act, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import ConnectAlby from '../components/home/wallet/connect-alby';
import { WalletType } from '../contexts/wallet.context';

describe('ConnectAlby login redirect', () => {
  let capturedLocation: string | undefined;
  let locationStub: { href: string; search: string; origin: string; pathname: string };

  beforeEach(() => {
    jest.clearAllMocks();
    capturedLocation = undefined;
    mockIsAvailable.mockResolvedValue(true);
    mockEnable.mockResolvedValue({ node: { alias: 'getalby.com' } });
    mockAppParams.mockReturnValue({});
    mockOnCancel.mockClear();
    mockLogin.mockResolvedValue(undefined);

    locationStub = {
      href: 'http://localhost/connect',
      search: '',
      origin: 'http://localhost',
      pathname: '/connect',
    };

    Object.defineProperty(window, 'location', {
      configurable: true,
      get() {
        return locationStub;
      },
      set(value: string) {
        capturedLocation = value;
      },
    });
  });

  function renderConnectAlby() {
    return render(
      <ConnectAlby
        rootRef={createRef<HTMLDivElement>()}
        wallet={WalletType.ALBY}
        blockchain={undefined}
        isConnect={false}
        onLogin={mockOnLogin}
        onCancel={mockOnCancel}
        onSwitch={mockOnSwitch}
      />,
    );
  }

  function getRedirectParamFromCapturedLocation(): string | null {
    expect(capturedLocation).toBeDefined();
    const albyUrl = new URL(capturedLocation as string);
    const redirectUri = albyUrl.searchParams.get('redirectUri');
    expect(redirectUri).toBeTruthy();
    const returnUrl = new URL(redirectUri as string);
    return returnUrl.searchParams.get('redirect');
  }

  it('includes personal-iban in the Alby redirect when redirectPath carries it', async () => {
    mockRedirectPath.mockReturnValue('/buy?personal-iban=frick');

    await act(async () => {
      renderConnectAlby();
    });

    await waitFor(() => expect(capturedLocation).toBeDefined());

    const redirect = getRedirectParamFromCapturedLocation();
    expect(redirect).toBeTruthy();
    expect(redirect).toContain('personal-iban=frick');
    expect(redirect?.startsWith('/buy')).toBe(true);
  });

  it('copies personal-iban from the live search when present, but no other query keys (A4)', async () => {
    mockRedirectPath.mockReturnValue('/buy');
    locationStub.search = '?user=alice@example.com&personal-iban=frick&arbitrary=value';
    locationStub.href = 'http://localhost/connect?user=alice@example.com&personal-iban=frick&arbitrary=value';

    await act(async () => {
      renderConnectAlby();
    });

    await waitFor(() => expect(capturedLocation).toBeDefined());

    const redirect = getRedirectParamFromCapturedLocation();
    expect(redirect).toContain('personal-iban=frick');
    expect(redirect).not.toContain('user=');
    expect(redirect).not.toContain('arbitrary=');
  });

  it('does not append a query string when redirectPath has no extra params', async () => {
    mockRedirectPath.mockReturnValue('/buy');
    locationStub.search = '';
    locationStub.href = 'http://localhost/connect';

    await act(async () => {
      renderConnectAlby();
    });

    await waitFor(() => expect(capturedLocation).toBeDefined());

    const redirect = getRedirectParamFromCapturedLocation();
    expect(redirect).toBe('/buy');
    expect(redirect).not.toContain('?');
  });
});

describe('ConnectAlby', () => {
  let capturedLocation: string | undefined;
  let locationStub: { href: string; search: string; origin: string; pathname: string };

  beforeEach(() => {
    jest.clearAllMocks();
    capturedLocation = undefined;
    mockIsAvailable.mockResolvedValue(true);
    mockEnable.mockResolvedValue({ node: { alias: 'getalby.com' } });
    mockAppParams.mockReturnValue({});
    mockRedirectPath.mockReturnValue('/buy');
    mockLogin.mockResolvedValue(undefined);
    mockSignMessage.mockResolvedValue('signed');

    locationStub = {
      href: 'http://localhost/connect',
      search: '',
      origin: 'http://localhost',
      pathname: '/connect',
    };

    Object.defineProperty(window, 'location', {
      configurable: true,
      get() {
        return locationStub;
      },
      set(value: string) {
        capturedLocation = value;
      },
    });
  });

  function renderConnectAlby() {
    return render(
      <ConnectAlby
        rootRef={createRef<HTMLDivElement>()}
        wallet={WalletType.ALBY}
        blockchain={undefined}
        isConnect={false}
        onLogin={mockOnLogin}
        onCancel={mockOnCancel}
        onSwitch={mockOnSwitch}
      />,
    );
  }

  it('does not auto-connect when isAvailable resolves false', async () => {
    mockIsAvailable.mockResolvedValue(false);

    await act(async () => {
      renderConnectAlby();
    });

    await waitFor(() => expect(mockIsAvailable).toHaveBeenCalled());
    expect(mockEnable).not.toHaveBeenCalled();
  });

  it('shows Permission denied error and Back calls onCancel when enable returns falsy', async () => {
    mockEnable.mockResolvedValue(undefined);

    await act(async () => {
      renderConnectAlby();
    });

    await waitFor(() => expect(screen.getByText('Permission denied or account not verified')).toBeInTheDocument());
    expect(screen.getByText('Connection failed!')).toBeInTheDocument();

    screen.getByText('Back').click();
    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('logs in with LNNID + uppercased pubkey', async () => {
    mockEnable.mockResolvedValue({ node: { pubkey: 'aBcDeF123' } });

    await act(async () => {
      renderConnectAlby();
    });

    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith(
        WalletType.ALBY,
        'LNNIDABCDEF123',
        'Lightning',
        expect.any(Function),
        undefined,
      ),
    );
  });

  it('forwards signMessage through the login signer callback', async () => {
    mockEnable.mockResolvedValue({ node: { pubkey: 'abc' } });
    mockLogin.mockImplementation((_wallet, _address, _blockchain, signer) => signer('some-address', 'some-message'));

    await act(async () => {
      renderConnectAlby();
    });

    await waitFor(() => expect(mockSignMessage).toHaveBeenCalledWith('some-message'));
  });

  it('redirects when alias ends with .getalby.com', async () => {
    mockEnable.mockResolvedValue({ node: { alias: 'foo.getalby.com' } });

    await act(async () => {
      renderConnectAlby();
    });

    await waitFor(() => expect(capturedLocation).toBeDefined());
    expect(capturedLocation).toContain('https://api.example.com/v1/auth/alby');
  });

  it('shows No login method found when alias does not match Alby', async () => {
    mockEnable.mockResolvedValue({ node: { alias: 'other-node.example' } });

    await act(async () => {
      renderConnectAlby();
    });

    await waitFor(() => expect(screen.getByText('No login method found')).toBeInTheDocument());
  });

  it('shows No login method found when node is absent', async () => {
    mockEnable.mockResolvedValue({});

    await act(async () => {
      renderConnectAlby();
    });

    await waitFor(() => expect(screen.getByText('No login method found')).toBeInTheDocument());
  });

  it('omits redirect search param when redirectPath is falsy', async () => {
    mockRedirectPath.mockReturnValue(undefined);
    mockEnable.mockResolvedValue({ node: { alias: 'getalby.com' } });

    await act(async () => {
      renderConnectAlby();
    });

    await waitFor(() => expect(capturedLocation).toBeDefined());
    const albyUrl = new URL(capturedLocation as string);
    const redirectUri = albyUrl.searchParams.get('redirectUri');
    expect(redirectUri).toBeTruthy();
    const returnUrl = new URL(redirectUri as string);
    expect(returnUrl.searchParams.get('redirect')).toBeNull();
  });

  it('forwards appParams wallet and refcode onto the Alby auth URL', async () => {
    mockAppParams.mockReturnValue({ wallet: 'DFX', refcode: 'REF123' });
    mockEnable.mockResolvedValue({ node: { alias: 'getalby.com' } });

    await act(async () => {
      renderConnectAlby();
    });

    await waitFor(() => expect(capturedLocation).toBeDefined());
    const albyUrl = new URL(capturedLocation as string);
    expect(albyUrl.searchParams.get('wallet')).toBe('DFX');
    expect(albyUrl.searchParams.get('usedRef')).toBe('REF123');
  });

  it('shows the confirm-connection spinner text while enable is pending', async () => {
    mockEnable.mockReturnValue(new Promise(() => undefined));

    await act(async () => {
      renderConnectAlby();
    });

    await waitFor(() =>
      expect(screen.getByText('Please confirm the connection in the Alby browser extension.')).toBeInTheDocument(),
    );
  });
});
