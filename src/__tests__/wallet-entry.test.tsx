import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HomeScreen from '../screens/home.screen';

const mockSessionState = { isLoggedIn: false, isInitialized: true };

jest.mock('../App', () => ({
  Service: { BUY: 'buy', SELL: 'sell', SWAP: 'swap', CONNECT: 'connect' },
}));

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: {},
  useSessionContext: () => mockSessionState,
  useAuthContext: () => ({ session: undefined }),
  useUserContext: () => ({ user: undefined, isUserLoading: false, hasAddress: false }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { LG: 'lg' },
  StyledLoadingSpinner: () => <div>loading</div>,
}));

jest.mock('../components/home/connect-wrapper', () => ({
  ConnectWrapper: ({ wallet }: { wallet: string }) => <div data-testid="connect">{wallet}</div>,
}));

jest.mock('../components/home/wallet/connect-address', () => ({
  CustodyAssets: [],
}));

jest.mock('../contexts/layout.context', () => ({
  useLayoutContext: () => ({ rootRef: { current: null } }),
}));

jest.mock('../hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));

jest.mock('../contexts/app-handling.context', () => ({
  CloseType: { CANCEL: 'cancel' },
  useAppHandlingContext: () => ({
    hasSession: false,
    canClose: false,
    service: undefined,
    isEmbedded: false,
    redirectPath: undefined,
    closeServices: () => undefined,
  }),
}));

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_namespace: string, key: string) => key,
  }),
}));

jest.mock('../contexts/wallet.context', () => ({
  WalletType: { PASSKEY: 'Passkey', MAIL: 'Mail', ADDRESS: 'Address' },
  supportsBlockchain: () => true,
  useWalletContext: () => ({ isInitialized: true, activeWallet: undefined }),
}));

jest.mock('../hooks/app-params.hook', () => ({
  useAppParams: () => ({ mode: undefined, wallets: undefined, blockchain: undefined, assetOut: undefined }),
}));

jest.mock('../hooks/feature-tree.hook', () => ({
  isWallet: (tile: { wallet?: unknown }) => tile?.wallet != null,
  useFeatureTree: () => ({
    getPage: () => ({
      id: 'home',
      description: 'Home',
      tiles: [{ id: 'buy', img: '/buy.jpg', next: { page: 'buy' } }],
    }),
    getWallet: (tile: { wallet: unknown }) => tile.wallet,
    setOptions: () => undefined,
  }),
}));

jest.mock('../hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: () => undefined, goBack: () => undefined }),
}));

jest.mock('../hooks/resize-observer.hook', () => ({
  useResizeObserver: () => () => undefined,
}));

function renderWallet() {
  return render(
    <MemoryRouter initialEntries={['/wallet']}>
      <HomeScreen />
    </MemoryRouter>,
  );
}

describe('/wallet passkey entry', () => {
  beforeEach(() => {
    mockSessionState.isLoggedIn = false;
    mockSessionState.isInitialized = true;
  });

  it('opens the passkey screen when the session is ready and logged out', () => {
    renderWallet();

    expect(screen.getByTestId('connect')).toHaveTextContent('Passkey');
  });

  it('closes the passkey screen when the session signs in', () => {
    const view = renderWallet();

    expect(screen.getByTestId('connect')).toHaveTextContent('Passkey');

    mockSessionState.isLoggedIn = true;
    view.rerender(
      <MemoryRouter initialEntries={['/wallet']}>
        <HomeScreen />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId('connect')).not.toBeInTheDocument();
    expect(document.querySelector('img[src="/buy.jpg"]')).not.toBeNull();
  });

  it('shows the home tiles when the session is already logged in', () => {
    mockSessionState.isLoggedIn = true;

    renderWallet();

    expect(screen.queryByTestId('connect')).not.toBeInTheDocument();
    expect(document.querySelector('img[src="/buy.jpg"]')).not.toBeNull();
  });

  it('waits for the session before choosing the passkey screen', () => {
    mockSessionState.isInitialized = false;

    renderWallet();

    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.queryByTestId('connect')).not.toBeInTheDocument();
  });
});
