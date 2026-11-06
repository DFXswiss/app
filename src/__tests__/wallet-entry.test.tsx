import { act, fireEvent, render, screen } from '@testing-library/react';
import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { CustodyAssets } from '../components/home/wallet/connect-address';
import HomeScreen from '../screens/home.screen';
import { setOpenPasskey, type OpenPasskey } from '../components/home/wallet/passkey-session';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockCloseServices = jest.fn();
const mockSetOptions = jest.fn();

let mockResizeCallback: ((element: { offsetHeight: number }) => void) | undefined;
let mockLayoutOptions: { title?: string; backButton?: boolean; onBack?: () => void } | undefined;

const mockSessionState = { isLoggedIn: false, isInitialized: true };
const mockAuthState: { session?: { address?: string; blockchains: string[] } } = { session: undefined };
const mockUserState: { user?: { id: number }; isUserLoading: boolean; hasAddress: boolean } = {
  user: undefined,
  isUserLoading: false,
  hasAddress: false,
};
const mockHandlingState = {
  hasSession: false,
  canClose: false,
  service: undefined as string | undefined,
  isEmbedded: false,
  redirectPath: undefined as string | undefined,
};
const mockWalletState = { isInitialized: true, activeWallet: undefined as string | undefined };
const mockParamsState = {
  mode: undefined as string | undefined,
  wallets: undefined as string | undefined,
  blockchain: undefined as string | undefined,
  assetOut: undefined as string | undefined,
};
let mockSupports = true;
let mockMissingPage = false;
let mockHomePage: {
  id: string;
  header?: string;
  description?: string;
  dfxStyle?: boolean;
  bottomImage?: string;
  tiles: Array<Record<string, unknown>>;
} = {
  id: 'home',
  description: 'Home',
  tiles: [{ id: 'buy', img: '/buy.jpg', next: { page: 'buy' } }],
};
const mockPages: Record<string, typeof mockHomePage> = {};

jest.mock('../App', () => ({
  Service: { BUY: 'buy', SELL: 'sell', SWAP: 'swap', CONNECT: 'connect' },
}));

jest.mock('react-i18next', () => ({
  Trans: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: { ETHEREUM: 'Ethereum' },
  useSessionContext: () => mockSessionState,
  useAuthContext: () => mockAuthState,
  useUserContext: () => mockUserState,
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { LG: 'lg' },
  StyledLoadingSpinner: () => <div>loading</div>,
}));

jest.mock('../components/home/connect-wrapper', () => ({
  ConnectWrapper: ({
    wallet,
    blockchain,
    isConnect,
    onLogin,
    onCancel,
    onSwitch,
  }: {
    wallet: string;
    blockchain?: string;
    isConnect?: boolean;
    onLogin: () => void;
    onCancel: () => void;
    onSwitch: (type: string) => void;
  }) => (
    <div data-testid="connect">
      <span>{wallet}</span>
      <span>{blockchain ?? ''}</span>
      <span>{String(isConnect)}</span>
      <button onClick={onLogin}>finish-login</button>
      <button onClick={onCancel}>cancel-connect</button>
      <button onClick={() => onSwitch('Mail')}>switch-wallet</button>
      <button onClick={() => onSwitch('Address')}>switch-address</button>
      <button
        onClick={() =>
          jest
            .requireActual<typeof import('../components/home/wallet/passkey-session')>(
              '../components/home/wallet/passkey-session',
            )
            .setOpenPasskey(undefined)
        }
      >
        Use another passkey
      </button>
    </div>
  ),
}));

jest.mock('../components/home/wallet/connect-address', () => ({
  CustodyAssets: [],
}));

jest.mock('../contexts/layout.context', () => ({
  useLayoutContext: () => ({ rootRef: { current: null } }),
}));

jest.mock('../hooks/layout-config.hook', () => ({
  useLayoutOptions: (options: { title?: string; backButton?: boolean; onBack?: () => void }) => {
    mockLayoutOptions = options;
  },
}));

jest.mock('../contexts/app-handling.context', () => ({
  CloseType: { CANCEL: 'cancel' },
  useAppHandlingContext: () => ({ ...mockHandlingState, closeServices: mockCloseServices }),
}));

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_namespace: string, key: string) => key,
  }),
}));

jest.mock('../contexts/wallet.context', () => ({
  WalletType: { PASSKEY: 'Passkey', MAIL: 'Mail', ADDRESS: 'Address', META_MASK: 'MetaMask' },
  supportsBlockchain: () => mockSupports,
  useWalletContext: () => mockWalletState,
}));

jest.mock('../hooks/app-params.hook', () => ({
  useAppParams: () => mockParamsState,
}));

jest.mock('../hooks/feature-tree.hook', () => ({
  isWallet: (tile: { wallet?: unknown }) => tile?.wallet != null,
  useFeatureTree: () => ({
    getPage: (id?: string) => {
      if (mockMissingPage) return undefined;
      if (id && mockPages[id]) return mockPages[id];
      return mockHomePage;
    },
    getWallet: (tile: { wallet: unknown }) => tile.wallet,
    setOptions: mockSetOptions,
  }),
}));

jest.mock('../hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
}));

jest.mock('../hooks/resize-observer.hook', () => ({
  useResizeObserver: (callback: (element: { offsetHeight: number }) => void) => {
    mockResizeCallback = callback;
    return { current: null };
  },
}));

function resetWorld(): void {
  setOpenPasskey(undefined);
  mockSessionState.isLoggedIn = false;
  mockSessionState.isInitialized = true;
  mockAuthState.session = undefined;
  mockUserState.user = undefined;
  mockUserState.isUserLoading = false;
  mockUserState.hasAddress = false;
  mockHandlingState.hasSession = false;
  mockHandlingState.canClose = false;
  mockHandlingState.service = undefined;
  mockHandlingState.isEmbedded = false;
  mockHandlingState.redirectPath = undefined;
  mockWalletState.isInitialized = true;
  mockWalletState.activeWallet = undefined;
  mockParamsState.mode = undefined;
  mockParamsState.wallets = undefined;
  mockParamsState.blockchain = undefined;
  mockParamsState.assetOut = undefined;
  mockSupports = true;
  mockMissingPage = false;
  CustodyAssets.splice(0, CustodyAssets.length);
  mockHomePage = {
    id: 'home',
    description: 'Home',
    tiles: [{ id: 'buy', img: '/buy.jpg', next: { page: 'buy' } }],
  };
  for (const key of Object.keys(mockPages)) delete mockPages[key];
  mockNavigate.mockClear();
  mockGoBack.mockClear();
  mockCloseServices.mockClear();
  mockSetOptions.mockClear();
  mockResizeCallback = undefined;
  mockLayoutOptions = undefined;
}

function Harness({ path }: { path: string }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <HomeScreen />
    </MemoryRouter>
  );
}

function renderAt(path: string) {
  return render(<Harness path={path} />);
}

describe('/wallet passkey entry', () => {
  beforeEach(() => {
    resetWorld();
  });

  it('opens the passkey screen when the session is ready and logged out', () => {
    renderAt('/wallet');

    expect(screen.getByTestId('connect')).toHaveTextContent('Passkey');
  });

  it('closes the passkey screen when the session signs in', () => {
    const view = renderAt('/wallet');

    expect(screen.getByTestId('connect')).toHaveTextContent('Passkey');

    mockSessionState.isLoggedIn = true;
    view.rerender(<Harness path="/wallet" />);

    expect(screen.queryByTestId('connect')).not.toBeInTheDocument();
    expect(document.querySelector('img[src="/buy.jpg"]')).not.toBeNull();
  });

  it('keeps an open passkey visible with a DFX session', () => {
    mockSessionState.isLoggedIn = true;
    setOpenPasskey({ state: 'locked' } as OpenPasskey);
    const view = renderAt('/wallet');
    expect(screen.getByTestId('connect')).toHaveTextContent('Passkey');
    expect(mockLayoutOptions).toMatchObject({ noHeader: true });
    view.unmount();
    setOpenPasskey(undefined);
  });

  it('keeps the passkey form open when an already signed-in user chooses another passkey', () => {
    mockSessionState.isLoggedIn = true;
    setOpenPasskey({ state: 'unlocked' } as OpenPasskey);
    renderAt('/wallet');
    expect(screen.getByTestId('connect')).toHaveTextContent('Passkey');
    fireEvent.click(screen.getByRole('button', { name: 'Use another passkey' }));
    expect(screen.getByTestId('connect')).toHaveTextContent('Passkey');
  });

  it('shows the home tiles when the session is already logged in', () => {
    mockSessionState.isLoggedIn = true;

    renderAt('/wallet');

    expect(screen.queryByTestId('connect')).not.toBeInTheDocument();
    expect(document.querySelector('img[src="/buy.jpg"]')).not.toBeNull();
  });

  it('waits for the session before choosing the passkey screen', () => {
    mockSessionState.isInitialized = false;

    renderAt('/wallet');

    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.queryByTestId('connect')).not.toBeInTheDocument();
  });

  it('keeps the form closed after cancel, and switches the wallet type from the form', () => {
    renderAt('/wallet');

    fireEvent.click(screen.getByText('switch-wallet'));
    expect(screen.getByTestId('connect')).toHaveTextContent('Mail');

    fireEvent.click(screen.getByText('cancel-connect'));
    expect(screen.queryByTestId('connect')).not.toBeInTheDocument();
  });

  it('opens mail login, address connect, and the plain home grid', () => {
    const mail = renderAt('/login/mail');
    expect(screen.getByTestId('connect')).toHaveTextContent('Mail');
    mail.unmount();

    mockSessionState.isLoggedIn = true;
    mockUserState.hasAddress = true;
    const connect = renderAt('/connect');
    expect(screen.getByTestId('connect')).toHaveTextContent('Address');
    expect(screen.getByTestId('connect')).toHaveTextContent('true');
    connect.unmount();

    mockAuthState.session = { address: 'bc1q', blockchains: [] };
    mockUserState.hasAddress = false;
    mockParamsState.assetOut = 'BTC';
    const skipped = renderAt('/connect');
    expect(screen.queryByTestId('connect')).not.toBeInTheDocument();
    skipped.unmount();

    mockSessionState.isLoggedIn = false;
    const home = renderAt('/');
    expect(screen.getByText('Home')).toBeInTheDocument();
    home.unmount();

    const wallets = renderAt('/login/wallet');
    expect(screen.getByText('Home')).toBeInTheDocument();
    wallets.unmount();

    const login = renderAt('/login');
    expect(screen.getByText('Home')).toBeInTheDocument();
    login.unmount();
  });

  it('leaves connect closed when there is no address and no custody asset', () => {
    mockSessionState.isLoggedIn = true;

    const view = renderAt('/connect');

    expect(screen.queryByTestId('connect')).not.toBeInTheDocument();
    act(() => {
      mockLayoutOptions?.onBack?.();
    });
    expect(mockGoBack).toHaveBeenCalled();
    view.unmount();
  });

  it('does nothing on back when an address form is open outside connect', () => {
    renderAt('/wallet');
    fireEvent.click(screen.getByText('switch-address'));

    act(() => {
      mockLayoutOptions?.onBack?.();
    });

    expect(screen.getByTestId('connect')).toHaveTextContent('Address');
  });

  it('opens the address form for a custody asset when the account has no address yet', () => {
    mockSessionState.isLoggedIn = true;
    CustodyAssets.push('ZCHF');
    mockParamsState.assetOut = 'ZCHF';

    renderAt('/connect');

    expect(screen.getByTestId('connect')).toHaveTextContent('Address');
  });

  it('clears an address form once the session logs out', () => {
    mockSessionState.isLoggedIn = true;
    mockUserState.hasAddress = true;
    const view = renderAt('/connect');
    expect(screen.getByTestId('connect')).toHaveTextContent('Address');

    mockSessionState.isLoggedIn = false;
    view.rerender(<Harness path="/connect" />);

    expect(screen.queryByTestId('connect')).not.toBeInTheDocument();
  });

  it('shows the spinner until the wallet, the user, and the page are ready', () => {
    mockWalletState.isInitialized = false;
    const wallet = renderAt('/');
    expect(screen.getByText('loading')).toBeInTheDocument();
    wallet.unmount();

    mockWalletState.isInitialized = true;
    mockUserState.isUserLoading = true;
    const user = renderAt('/');
    expect(screen.getByText('loading')).toBeInTheDocument();
    user.unmount();

    mockUserState.isUserLoading = false;
    mockMissingPage = true;
    const missing = renderAt('/');
    expect(screen.getByText('loading')).toBeInTheDocument();
    missing.unmount();
  });

  it('renders the service title, the fallback header, and the bottom image', () => {
    mockHomePage = {
      id: 'home',
      dfxStyle: true,
      tiles: [{ id: 'buy', img: '/buy.jpg' }],
    };
    const styled = renderAt('/');
    expect(screen.getByText('DFX Services')).toBeInTheDocument();
    expect(document.querySelector('img[src="https://dfx.swiss/images/app/berge.jpg"]')).not.toBeNull();
    styled.unmount();

    mockHomePage = {
      id: 'home',
      header: 'Custom',
      bottomImage: '/custom.jpg',
      tiles: [{ id: 'buy', img: '/buy.jpg' }],
    };
    const custom = renderAt('/');
    expect(document.querySelector('img[src="/custom.jpg"]')).not.toBeNull();
    custom.unmount();

    mockHomePage = { id: 'home', tiles: [{ id: 'buy', img: '/buy.jpg' }] };
    renderAt('/');
    expect(document.querySelector('img[src="https://dfx.swiss/images/app/berge.jpg"]')).toBeNull();
  });

  it('hides the bottom image while a connect form is open', () => {
    mockHomePage = { id: 'home', dfxStyle: true, bottomImage: '/custom.jpg', tiles: [] };
    renderAt('/wallet');

    expect(screen.getByTestId('connect')).toBeInTheDocument();
    expect(document.querySelector('img[src="/custom.jpg"]')).toBeNull();
  });

  it('filters wallet tiles by blockchain support and the wallet list', () => {
    mockHomePage = {
      id: 'home',
      description: 'Home',
      tiles: [
        { id: 'plain', img: '/plain.jpg' },
        { id: 'meta', img: '/meta.jpg', wallet: { type: 'MetaMask', blockchain: 'Ethereum' } },
      ],
    };
    mockParamsState.mode = 'home';
    mockParamsState.blockchain = 'Ethereum';
    mockParamsState.wallets = 'MetaMask';
    const shown = renderAt('/');
    expect(document.querySelector('img[src="/plain.jpg"]')).not.toBeNull();
    expect(document.querySelector('img[src="/meta.jpg"]')).not.toBeNull();
    shown.unmount();

    mockSupports = false;
    const blocked = renderAt('/');
    expect(document.querySelector('img[src="/meta.jpg"]')).toBeNull();
    blocked.unmount();

    mockSupports = true;
    mockParamsState.blockchain = undefined;
    mockParamsState.wallets = 'Alby';
    const listed = renderAt('/');
    expect(document.querySelector('img[src="/meta.jpg"]')).toBeNull();
    listed.unmount();

    mockParamsState.mode = undefined;
    mockParamsState.wallets = 'MetaMask';
    const allowed = renderAt('/');
    expect(document.querySelector('img[src="/meta.jpg"]')).not.toBeNull();
    allowed.unmount();
  });

  it('opens a wallet tile, follows a single child, and marks a disabled tile', () => {
    mockPages.child = {
      id: 'child',
      description: 'Child',
      tiles: [{ id: 'leaf', img: '/leaf.jpg', next: { page: 'leaf' } }],
    };
    mockPages.leaf = { id: 'leaf', description: 'Leaf', tiles: [{ id: 'end', img: '/end.jpg' }] };
    mockPages.wide = {
      id: 'wide',
      description: 'Wide',
      tiles: [
        { id: 'a', img: '/a.jpg' },
        { id: 'b', img: '/b.jpg' },
      ],
    };
    mockHomePage = {
      id: 'home',
      description: 'Home',
      tiles: [
        { id: 'meta', img: '/meta.jpg', wallet: { type: 'MetaMask', blockchain: 'Ethereum' } },
        { id: 'soon', img: '/soon.jpg', disabled: true },
        { id: 'swap', img: '/swap.jpg', next: { page: 'child', options: { service: 'swap' } } },
        { id: 'stay', img: '/stay.jpg' },
      ],
    };
    mockParamsState.blockchain = 'Ethereum';

    renderAt('/');
    fireEvent.click(document.querySelector('img[src="/meta.jpg"]') as Element);
    expect(screen.getByTestId('connect')).toHaveTextContent('MetaMask');
    expect(screen.getByTestId('connect')).toHaveTextContent('Ethereum');
    fireEvent.click(screen.getByText('cancel-connect'));

    fireEvent.click(document.querySelector('img[src="/soon.jpg"]') as Element);
    expect(screen.getByText('Coming Soon')).toBeInTheDocument();
    mockResizeCallback?.({ offsetHeight: 80 });
    expect(screen.getByText('Coming Soon')).toBeInTheDocument();

    fireEvent.click(document.querySelector('img[src="/stay.jpg"]') as Element);
    expect(screen.getByText('Home')).toBeInTheDocument();

    fireEvent.click(document.querySelector('img[src="/swap.jpg"]') as Element);
    expect(mockSetOptions).toHaveBeenCalledWith({ service: 'swap' });
    expect(screen.getByText('Leaf')).toBeInTheDocument();
  });

  it('walks back from a form, from connect, and through a one-tile page', () => {
    const wallet = renderAt('/wallet');
    act(() => {
      mockLayoutOptions?.onBack?.();
    });
    expect(screen.queryByTestId('connect')).not.toBeInTheDocument();
    wallet.unmount();

    mockSessionState.isLoggedIn = true;
    mockAuthState.session = { address: 'bc1q', blockchains: ['Ethereum'] };
    CustodyAssets.push('ZCHF');
    mockParamsState.assetOut = 'ZCHF';
    const connect = renderAt('/connect');
    act(() => {
      mockLayoutOptions?.onBack?.();
    });
    expect(screen.getByTestId('connect')).toHaveTextContent('Address');
    connect.unmount();

    mockParamsState.assetOut = 'BTC';
    const back = renderAt('/connect');
    act(() => {
      mockLayoutOptions?.onBack?.();
    });
    expect(mockGoBack).toHaveBeenCalled();
    back.unmount();

    mockAuthState.session = { blockchains: ['Ethereum'] };
    mockUserState.hasAddress = true;
    const address = renderAt('/connect');
    expect(screen.getByTestId('connect')).toHaveTextContent('Address');
    act(() => {
      mockLayoutOptions?.onBack?.();
    });
    expect(mockGoBack).toHaveBeenCalled();
    address.unmount();

    mockPages.only = {
      id: 'only',
      description: 'Only',
      tiles: [{ id: 'one', img: '/one.jpg', next: { page: 'stop' } }],
    };
    mockPages.stop = { id: 'stop', description: 'Stop', tiles: [{ id: 'done', img: '/done.jpg' }] };
    mockHomePage = {
      id: 'home',
      description: 'Home',
      tiles: [{ id: 'next', img: '/next.jpg', next: { page: 'only', tiles: ['one'] } }],
    };
    mockSessionState.isLoggedIn = false;
    mockAuthState.session = undefined;
    const stack = renderAt('/login');
    fireEvent.click(document.querySelector('img[src="/next.jpg"]') as Element);
    act(() => {
      mockLayoutOptions?.onBack?.();
    });
    expect(screen.getByText('Home')).toBeInTheDocument();
    stack.unmount();

    mockHandlingState.canClose = true;
    renderAt('/');
    expect(mockLayoutOptions?.backButton).toBe(true);
    expect(mockLayoutOptions?.onBack).toBeUndefined();
  });

  it('starts the service after login and when the wallet page already matches', () => {
    mockSessionState.isLoggedIn = true;
    mockUserState.user = { id: 1 };
    mockHandlingState.redirectPath = '/buy';
    const mail = renderAt('/login/mail');
    fireEvent.click(screen.getByText('finish-login'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
    expect(mockNavigate).toHaveBeenCalledWith('/buy');
    mail.unmount();

    mockNavigate.mockClear();
    mockHandlingState.redirectPath = undefined;
    mockAuthState.session = { address: 'bc1q', blockchains: [] };
    mockHomePage = {
      id: 'home',
      description: 'Home',
      tiles: [{ id: 'meta', img: '/meta.jpg', wallet: { type: 'MetaMask' } }],
    };
    const wallets = renderAt('/login/wallet');
    fireEvent.click(document.querySelector('img[src="/meta.jpg"]') as Element);
    fireEvent.click(screen.getByText('finish-login'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
    expect(mockNavigate).toHaveBeenCalledWith('/account');
    wallets.unmount();

    mockNavigate.mockClear();
    mockAuthState.session = { blockchains: [] };
    const login = renderAt('/login');
    fireEvent.click(document.querySelector('img[src="/meta.jpg"]') as Element);
    fireEvent.click(screen.getByText('finish-login'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
    expect(mockNavigate).not.toHaveBeenCalledWith('/account');
    login.unmount();

    mockNavigate.mockClear();
    mockHandlingState.service = 'connect';
    const closing = renderAt('/login');
    fireEvent.click(document.querySelector('img[src="/meta.jpg"]') as Element);
    fireEvent.click(screen.getByText('finish-login'));
    expect(mockCloseServices).toHaveBeenCalledWith({ type: 'cancel', isComplete: true }, true);
    closing.unmount();

    mockCloseServices.mockClear();
    mockUserState.user = undefined;
    const unsigned = renderAt('/login');
    fireEvent.click(document.querySelector('img[src="/meta.jpg"]') as Element);
    fireEvent.click(screen.getByText('finish-login'));
    expect(mockCloseServices).not.toHaveBeenCalled();
    unsigned.unmount();

    mockUserState.user = { id: 1 };
    mockHomePage = { id: 'wallets', description: 'Wallets', tiles: [{ id: 'meta', img: '/meta.jpg' }] };
    mockAuthState.session = { address: 'bc1q', blockchains: ['Ethereum'] };
    mockParamsState.blockchain = 'Ethereum';
    mockParamsState.mode = 'other';
    mockNavigate.mockClear();
    const matched = renderAt('/');
    expect(mockNavigate).toHaveBeenCalledWith('/account');
    matched.unmount();

    mockNavigate.mockClear();
    mockAuthState.session = { blockchains: ['Bitcoin'] };
    const otherChain = renderAt('/');
    expect(mockNavigate).not.toHaveBeenCalled();
    otherChain.unmount();

    mockNavigate.mockClear();
    mockParamsState.blockchain = undefined;
    const missingChain = renderAt('/');
    expect(screen.getByText('Wallets')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
    missingChain.unmount();

    mockAuthState.session = { address: 'bc1q', blockchains: ['Ethereum'] };
    mockParamsState.blockchain = 'Ethereum';
    mockNavigate.mockClear();
    const loginWallet = renderAt('/login/wallet');
    expect(screen.getByText('Wallets')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
    loginWallet.unmount();

    mockAuthState.session = undefined;
    mockParamsState.blockchain = undefined;
    mockHomePage = { id: 'home', description: 'Home', tiles: [] };
    renderAt('/');
    expect(screen.getByText('Home')).toBeInTheDocument();
  });

  it('uses the embedded title and skips the back button when the page is the mode', () => {
    mockHandlingState.isEmbedded = true;
    mockHandlingState.canClose = true;
    mockParamsState.mode = 'home';
    mockHomePage = { id: 'home', header: 'Embedded', tiles: [] };

    renderAt('/');

    expect(mockLayoutOptions?.title).toBe('Embedded');
    expect(mockLayoutOptions?.backButton).toBe(false);
  });

  it('opens a page with several tiles and stops back on a page that is not a single tile', () => {
    mockPages.wide = {
      id: 'wide',
      description: 'Wide',
      tiles: [
        { id: 'a', img: '/a.jpg' },
        { id: 'b', img: '/b.jpg' },
      ],
    };
    mockPages.leaf = { id: 'leaf', description: 'Leaf', tiles: [{ id: 'end', img: '/end.jpg' }] };
    mockHomePage = {
      id: 'home',
      description: 'Home',
      tiles: [
        { id: 'to-wide', img: '/wide.jpg', next: { page: 'wide' } },
        { id: 'to-leaf', img: '/leaf.jpg', next: { page: 'leaf' } },
      ],
    };
    mockParamsState.mode = 'home';

    renderAt('/');
    fireEvent.click(document.querySelector('img[src="/wide.jpg"]') as Element);
    expect(screen.getByText('Wide')).toBeInTheDocument();
    act(() => {
      mockLayoutOptions?.onBack?.();
    });
    expect(screen.getByText('Home')).toBeInTheDocument();

    fireEvent.click(document.querySelector('img[src="/leaf.jpg"]') as Element);
    expect(screen.getByText('Leaf')).toBeInTheDocument();
    act(() => {
      mockLayoutOptions?.onBack?.();
    });
    expect(screen.getByText('Home')).toBeInTheDocument();
  });
});
