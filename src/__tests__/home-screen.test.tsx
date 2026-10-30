import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import HomeScreen from '../screens/home.screen';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockSetOptions = jest.fn();
const mockCloseServices = jest.fn();

interface TestTile {
  id: string;
  img: string;
  disabled?: boolean;
  next?: { page: string; tiles?: string[]; options?: { service?: string } };
  wallet?: { type: string; blockchain?: string };
}

interface TestPage {
  id: string;
  dfxStyle?: boolean;
  header?: string;
  description?: string;
  bottomImage?: string;
  tiles: TestTile[];
}

interface LayoutConfig {
  title?: string;
  backButton?: boolean;
  onBack?: () => void;
}

interface AppParamsState {
  mode?: string;
  blockchain?: string;
  wallets?: string;
  assetOut?: string;
}

const mockState: {
  isLoggedIn: boolean;
  session?: { address?: string; blockchains?: string[] };
  user?: object;
  isUserLoading: boolean;
  hasAddress: boolean;
  hasSession: boolean;
  canClose: boolean;
  service?: string;
  isEmbedded: boolean;
  redirectPath?: string;
  isInitialized: boolean;
  activeWallet?: string;
  suspend: boolean;
  blocked?: string;
  appParams: AppParamsState;
  pages: Record<string, TestPage>;
  layout?: LayoutConfig;
} = {
  isLoggedIn: false,
  session: undefined,
  user: undefined,
  isUserLoading: false,
  hasAddress: false,
  hasSession: false,
  canClose: false,
  service: undefined,
  isEmbedded: false,
  redirectPath: undefined,
  isInitialized: true,
  activeWallet: undefined,
  suspend: false,
  blocked: undefined,
  appParams: {},
  pages: {},
  layout: undefined,
};

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: { BITCOIN: 'Bitcoin', ETHEREUM: 'Ethereum' },
  useAuthContext: () => ({ session: mockState.session }),
  useSessionContext: () => ({ isLoggedIn: mockState.isLoggedIn }),
  useUserContext: () => ({
    user: mockState.user,
    isUserLoading: mockState.isUserLoading,
    hasAddress: mockState.hasAddress,
  }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { LG: 'lg' },
  StyledLoadingSpinner: () => <div>loading</div>,
}));

jest.mock('react-i18next', () => ({
  Trans: ({ children }: { children?: unknown }) => <span>{children as JSX.Element}</span>,
}));

jest.mock('../App', () => ({
  Service: { BUY: 'buy', SELL: 'sell', SWAP: 'swap', CONNECT: 'connect' },
}));

jest.mock('../components/home/connect-wrapper', () => ({
  ConnectWrapper: (props: {
    wallet: string;
    blockchain?: string;
    isConnect: boolean;
    onLogin: () => void;
    onCancel: () => void;
    onSwitch: (type: string) => void;
  }) => {
    if (mockState.suspend) {
      mockState.suspend = false;
      throw new Promise(() => undefined);
    }
    const chain = props.blockchain === undefined ? 'undefined' : props.blockchain;
    return (
      <div>
        <span>{`wallet:${props.wallet}`}</span>
        <span>{`chain:${chain}`}</span>
        <span>{`connect:${props.isConnect ? 'yes' : 'no'}`}</span>
        <button type="button" onClick={props.onLogin}>
          complete-login
        </button>
        <button type="button" onClick={props.onCancel}>
          cancel-connect
        </button>
        <button type="button" onClick={() => props.onSwitch('Mail')}>
          switch-wallet
        </button>
      </div>
    );
  },
}));

jest.mock('../components/home/wallet/connect-address', () => ({
  CustodyAssets: ['ZCHF', 'FPS', 'DEPSPresale'],
}));

jest.mock('../contexts/app-handling.context', () => ({
  CloseType: { BUY: 'buy', SELL: 'sell', SWAP: 'swap', PAYMENT: 'payment', CANCEL: 'cancel' },
  useAppHandlingContext: () => ({
    hasSession: mockState.hasSession,
    canClose: mockState.canClose,
    service: mockState.service,
    isEmbedded: mockState.isEmbedded,
    redirectPath: mockState.redirectPath,
    closeServices: mockCloseServices,
  }),
}));

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_key: string, value: string) => value }),
}));

jest.mock('../contexts/wallet.context', () => ({
  WalletType: { ADDRESS: 'Address', MAIL: 'Mail', META_MASK: 'MetaMask' },
  supportsBlockchain: (wallet: string, blockchain: string) => mockState.blocked !== `${wallet}|${blockchain}`,
  useWalletContext: () => ({ isInitialized: mockState.isInitialized, activeWallet: mockState.activeWallet }),
}));

jest.mock('../contexts/layout.context', () => ({
  useLayoutContext: () => ({ rootRef: { current: null } }),
}));

jest.mock('../hooks/app-params.hook', () => ({
  useAppParams: () => mockState.appParams,
}));

jest.mock('../hooks/feature-tree.hook', () => ({
  isWallet: (tile: { wallet?: unknown }) => tile.wallet != null,
  useFeatureTree: () => ({
    getPage: (pageId?: string, allowedTiles?: string[]) => {
      if (pageId == null) return undefined;
      const found = mockState.pages[pageId];
      if (found == null) return undefined;
      if (allowedTiles == null) return found;
      return { ...found, tiles: found.tiles.filter((tile) => allowedTiles.includes(tile.id)) };
    },
    getWallet: (tile: { wallet: { type: string; blockchain?: string } }) => tile.wallet,
    setOptions: mockSetOptions,
  }),
}));

jest.mock('../hooks/layout-config.hook', () => ({
  useLayoutOptions: (config: LayoutConfig) => {
    mockState.layout = config;
  },
}));

jest.mock('../hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
}));

jest.mock('../hooks/resize-observer.hook', () => ({
  useResizeObserver: (callback: (element: HTMLElement) => void) => (element: HTMLElement | null) => {
    if (element == null) return;
    Object.defineProperty(element, 'offsetHeight', { configurable: true, value: 40 });
    callback(element);
  },
}));

function page(id: string, extra: Omit<TestPage, 'id'>): TestPage {
  return { id, ...extra };
}

function createPages(): Record<string, TestPage> {
  return {
    home: page('home', {
      dfxStyle: true,
      header: 'Home header',
      description: 'Home description',
      bottomImage: 'https://example.invalid/home.jpg',
      tiles: [
        { id: 'to-child', img: 'child.jpg', next: { page: 'child', tiles: ['a'], options: { service: 'buy' } } },
        { id: 'to-plain', img: 'plain.jpg', next: { page: 'plain' } },
        { id: 'to-single-stop', img: 'single-stop.jpg', next: { page: 'single-stop' } },
        { id: 'to-missing', img: 'missing.jpg', next: { page: 'missing' } },
        { id: 'to-mid', img: 'mid.jpg', next: { page: 'mid', tiles: ['m'] } },
        { id: 'to-ghost', img: 'ghost.jpg', next: { page: 'ghost' } },
        { id: 'wallet', img: 'wallet.jpg', wallet: { type: 'MetaMask', blockchain: 'Ethereum' } },
        { id: 'plain-wallet', img: 'plain-wallet.jpg', wallet: { type: 'MetaMask' } },
        { id: 'address-wallet', img: 'address.jpg', wallet: { type: 'Address' } },
        { id: 'dead', img: 'dead.jpg' },
        { id: 'soon', img: 'soon.jpg', disabled: true },
      ],
    }),
    child: page('child', {
      header: 'Child header',
      tiles: [
        { id: 'a', img: 'a.jpg' },
        { id: 'b', img: 'b.jpg', next: { page: 'home' } },
      ],
    }),
    plain: page('plain', {
      description: 'Plain page',
      tiles: [
        { id: 'p', img: 'p.jpg', next: { page: 'home' } },
        { id: 'q', img: 'q.jpg' },
      ],
    }),
    'single-stop': page('single-stop', {
      description: 'Single stop',
      tiles: [{ id: 'stop', img: 'stop.jpg' }],
    }),
    mid: page('mid', {
      tiles: [{ id: 'm', img: 'm.jpg', next: { page: 'single-stop' } }],
    }),
    login: page('login', {
      header: 'Login',
      description: 'Login desc',
      tiles: [
        { id: 'lw', img: 'lw.jpg', wallet: { type: 'MetaMask', blockchain: 'Ethereum' } },
        { id: 'soon', img: 'soon.jpg', disabled: true },
      ],
    }),
    wallets: page('wallets', {
      tiles: [
        { id: 'mm', img: 'mm.jpg', wallet: { type: 'MetaMask', blockchain: 'Bitcoin' } },
        { id: 'alby', img: 'alby.jpg', wallet: { type: 'Alby', blockchain: 'Bitcoin' } },
        { id: 'link', img: 'link.jpg', next: { page: 'child' } },
        { id: 'soon', img: 'soon.jpg', disabled: true },
      ],
    }),
    bare: page('bare', {
      tiles: [
        { id: 'x', img: 'x.jpg', next: { page: 'home' } },
        { id: 'y', img: 'y.jpg' },
      ],
    }),
    styled: page('styled', {
      dfxStyle: true,
      tiles: [
        { id: 's', img: 's.jpg', next: { page: 'home' } },
        { id: 't', img: 't.jpg' },
      ],
    }),
    ghost: page('ghost', {
      description: 'Ghost page',
      tiles: [
        { id: 'g', img: 'g.jpg', next: { page: 'missing' } },
        { id: 'g2', img: 'g2.jpg' },
      ],
    }),
  };
}

let mockRedraw: (() => void) | undefined;

function reset(): void {
  mockState.isLoggedIn = false;
  mockState.session = undefined;
  mockState.user = undefined;
  mockState.isUserLoading = false;
  mockState.hasAddress = false;
  mockState.hasSession = false;
  mockState.canClose = false;
  mockState.service = undefined;
  mockState.isEmbedded = false;
  mockState.redirectPath = undefined;
  mockState.isInitialized = true;
  mockState.activeWallet = undefined;
  mockState.suspend = false;
  mockState.blocked = undefined;
  mockState.appParams = { mode: 'home' };
  mockState.pages = createPages();
  mockState.layout = undefined;
  mockNavigate.mockReset();
  mockGoBack.mockReset();
  mockSetOptions.mockReset();
  mockCloseServices.mockReset();
  mockRedraw = undefined;
}

function MockRoute(): JSX.Element {
  const [, setTick] = useState(0);
  mockRedraw = () => setTick((tick) => tick + 1);
  return <HomeScreen />;
}

function setup(pathname: string) {
  const router = createMemoryRouter([{ path: '*', element: <MockRoute /> }], { initialEntries: [pathname] });
  const view = render(<RouterProvider router={router} />);
  return { ...view, router };
}

function redraw(): void {
  const refresh = mockRedraw;
  if (refresh == null) return;
  act(() => {
    refresh();
  });
}

function image(container: HTMLElement, src: string): HTMLImageElement | null {
  const found = container.querySelector(`img[src="${src}"]`);
  return found instanceof HTMLImageElement ? found : null;
}

function imageClass(container: HTMLElement, src: string): string | undefined {
  const found = image(container, src);
  if (found == null) return undefined;
  return found.className;
}

function clickImage(container: HTMLElement, src: string): void {
  const found = image(container, src);
  if (found == null) throw new Error(`missing image ${src}`);
  fireEvent.click(found);
}

function readLayout(): LayoutConfig {
  const config = mockState.layout;
  if (config == null) throw new Error('no layout');
  return config;
}

function pressBack(): void {
  const onBack = readLayout().onBack;
  if (onBack == null) throw new Error('no back handler');
  act(() => {
    onBack();
  });
}

function navigatedTo(): unknown[] {
  return mockNavigate.mock.calls.map((call) => call[0]);
}

function signIn(container: HTMLElement, src: string): void {
  clickImage(container, src);
  fireEvent.click(screen.getByRole('button', { name: 'complete-login' }));
}

describe('HomeScreen', () => {
  beforeEach(() => {
    reset();
  });

  it('rejects a layout read before the screen has rendered', () => {
    redraw();
    expect(() => readLayout()).toThrow('no layout');
  });

  it('shows the description, custom image and coming-soon label', () => {
    const { container } = setup('/');

    expect(screen.getByText('Home description')).toBeInTheDocument();
    expect(image(container, 'https://example.invalid/home.jpg')).not.toBeNull();
    expect(screen.getByText('Coming Soon')).toBeInTheDocument();
    expect(imageClass(container, 'no-such.jpg')).toBeUndefined();
    expect(imageClass(container, 'wallet.jpg')).toBe('cursor-pointer');
    expect(imageClass(container, 'soon.jpg')).toBe('opacity-60');
    expect(() => clickImage(container, 'no-such.jpg')).toThrow('missing image no-such.jpg');
    expect(screen.queryByText(/Access all/)).not.toBeInTheDocument();
    expect(readLayout().title).toBeUndefined();
    expect(readLayout().backButton).toBe(false);
    expect(readLayout().onBack).toEqual(expect.any(Function));
  });

  it('shows the toolbox hero and the default image for a dfx-styled page without a description', () => {
    mockState.appParams.mode = 'styled';
    mockState.isEmbedded = true;
    const { container } = setup('/');

    expect(screen.getByText(/Access all/)).toBeInTheDocument();
    expect(screen.getByText(/DFX Services/)).toBeInTheDocument();
    expect(image(container, 'https://dfx.swiss/images/app/berge.jpg')).not.toBeNull();
    expect(readLayout().title).toBe('DFX services');
  });

  it('shows neither a description nor a hero when the page has neither', () => {
    mockState.appParams.mode = 'bare';
    const { container } = setup('/');

    expect(screen.queryByText('Home description')).not.toBeInTheDocument();
    expect(screen.queryByText(/Access all/)).not.toBeInTheDocument();
    expect(container.querySelector('img[src^="https://"]')).toBeNull();
  });

  it('shows the spinner until the wallet is initialized', () => {
    mockState.isInitialized = false;
    setup('/');
    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.queryByText('Home description')).not.toBeInTheDocument();
  });

  it('shows the spinner while the user record is loading', () => {
    mockState.isUserLoading = true;
    setup('/');
    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.queryByText('Home description')).not.toBeInTheDocument();
  });

  it('shows the spinner and no back handler when no page is selected', () => {
    mockState.appParams.mode = undefined;
    setup('/buy');
    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(readLayout().onBack).toBeUndefined();
    expect(readLayout().backButton).toBe(false);
    expect(() => pressBack()).toThrow('no back handler');
  });

  it('navigates a /login sign-in without a redirect path to /buy', () => {
    mockState.isLoggedIn = true;
    mockState.user = { id: 1 };
    mockState.session = { address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', blockchains: ['Bitcoin'] };
    const { container } = setup('/login');

    expect(screen.getByText('Login desc')).toBeInTheDocument();
    signIn(container, 'lw.jpg');

    expect(navigatedTo()).toEqual(['/', '/buy']);
  });

  it('navigates a /login sign-in with a redirect path to that path', () => {
    mockState.isLoggedIn = true;
    mockState.user = { id: 1 };
    mockState.session = { address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', blockchains: ['Bitcoin'] };
    mockState.redirectPath = '/settings';
    const { container } = setup('/login');

    signIn(container, 'lw.jpg');

    expect(navigatedTo()).toEqual(['/', '/settings']);
  });

  it('navigates a /connect sign-in to /account', () => {
    mockState.isLoggedIn = true;
    mockState.user = { id: 1 };
    mockState.session = { address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', blockchains: ['Bitcoin'] };
    mockState.appParams.mode = undefined;
    const { container } = setup('/connect');

    signIn(container, 'mm.jpg');

    expect(navigatedTo()).toEqual(['/account']);
    expect(screen.getByText('connect:yes')).toBeInTheDocument();
  });

  it('falls through /login/mail and /login/wallet the same way', () => {
    mockState.isLoggedIn = true;
    mockState.user = { id: 1 };
    mockState.session = { blockchains: [] };

    const mail = setup('/login/mail');
    expect(screen.getByText('wallet:Mail')).toBeInTheDocument();
    expect(screen.getByText('connect:no')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'complete-login' }));
    expect(navigatedTo()).toEqual(['/', '/buy']);
    mail.unmount();

    mockNavigate.mockReset();
    const wallet = setup('/login/wallet');
    signIn(wallet.container, 'mm.jpg');
    expect(navigatedTo()).toEqual(['/', '/buy']);
  });

  it('on the home page keeps a sign-in without a target and follows a redirect path or the account', () => {
    mockState.isLoggedIn = true;
    mockState.user = { id: 1 };
    mockState.session = undefined;
    const missingSession = setup('/');
    signIn(missingSession.container, 'wallet.jpg');
    expect(mockNavigate).not.toHaveBeenCalled();
    missingSession.unmount();

    mockNavigate.mockReset();
    mockState.session = { blockchains: [] };
    const nowhere = setup('/');
    signIn(nowhere.container, 'wallet.jpg');
    expect(mockNavigate).not.toHaveBeenCalled();
    nowhere.unmount();

    mockNavigate.mockReset();
    mockState.redirectPath = '/settings';
    const redirected = setup('/');
    signIn(redirected.container, 'wallet.jpg');
    expect(navigatedTo()).toEqual(['/settings']);
    redirected.unmount();

    mockNavigate.mockReset();
    mockState.redirectPath = undefined;
    mockState.session = { address: 'bc1', blockchains: ['Bitcoin'] };
    const account = setup('/');
    signIn(account.container, 'wallet.jpg');
    expect(navigatedTo()).toEqual(['/account']);
  });

  it('closes a widget connect service instead of navigating', () => {
    mockState.isLoggedIn = true;
    mockState.user = { id: 1 };
    mockState.service = 'connect';
    const { container } = setup('/login');

    signIn(container, 'lw.jpg');

    expect(mockCloseServices).toHaveBeenCalledWith({ type: 'cancel', isComplete: true }, true);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.queryByText(/wallet:/)).not.toBeInTheDocument();
  });

  it('does not navigate before the session, the user and a completed login are all present', () => {
    mockState.isInitialized = false;
    setup('/');
    expect(mockNavigate).not.toHaveBeenCalled();

    mockState.isInitialized = true;
    mockState.isLoggedIn = false;
    redraw();
    expect(screen.getByText('Home description')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();

    mockState.isLoggedIn = true;
    mockState.user = undefined;
    redraw();
    expect(mockNavigate).not.toHaveBeenCalled();

    mockState.user = { id: 1 };
    redraw();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('starts from a wallets page when the session already includes that blockchain', () => {
    mockState.appParams = { mode: 'wallets', blockchain: 'Bitcoin' };
    mockState.session = { address: 'bc1', blockchains: ['Bitcoin'] };
    mockState.isLoggedIn = true;
    setup('/');
    expect(navigatedTo()).toEqual(['/account']);
  });

  it('does not start from a wallets page when the blockchain or the session does not qualify', () => {
    mockState.appParams = { mode: 'wallets' };
    mockState.session = { address: 'bc1', blockchains: ['Bitcoin'] };
    const noChain = setup('/');
    expect(mockNavigate).not.toHaveBeenCalled();
    noChain.unmount();

    mockState.appParams = { mode: 'wallets', blockchain: 'Bitcoin' };
    mockState.session = undefined;
    const noSession = setup('/');
    expect(mockNavigate).not.toHaveBeenCalled();
    noSession.unmount();

    mockState.session = { address: 'bc1', blockchains: ['Ethereum'] };
    const otherChain = setup('/');
    expect(mockNavigate).not.toHaveBeenCalled();
    otherChain.unmount();

    mockState.session = { address: 'bc1', blockchains: ['Bitcoin'] };
    setup('/login/wallet');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('opens the address wallet on /connect and clears it after logout', () => {
    mockState.isLoggedIn = true;
    mockState.hasAddress = true;
    mockState.appParams.mode = undefined;
    const view = setup('/connect');
    expect(screen.getByText('wallet:Address')).toBeInTheDocument();

    mockState.hasAddress = false;
    redraw();
    expect(screen.getByText('wallet:Address')).toBeInTheDocument();

    mockState.isLoggedIn = false;
    redraw();
    expect(screen.queryByText(/wallet:/)).not.toBeInTheDocument();
    expect(image(view.container, 'mm.jpg')).not.toBeNull();
  });

  it('opens the address wallet for a custody asset and skips it otherwise', () => {
    mockState.isLoggedIn = true;
    mockState.session = { blockchains: [] };
    mockState.appParams = { assetOut: 'ZCHF' };
    const custody = setup('/connect');
    expect(screen.getByText('wallet:Address')).toBeInTheDocument();
    custody.unmount();

    mockState.appParams = { assetOut: 'NOPE' };
    const other = setup('/connect');
    expect(screen.queryByText(/wallet:/)).not.toBeInTheDocument();
    other.unmount();

    mockState.appParams = {};
    mockState.session = { address: 'bc1', blockchains: ['Bitcoin'] };
    const skipped = setup('/connect');
    expect(screen.queryByText(/wallet:/)).not.toBeInTheDocument();
    expect(image(skipped.container, 'mm.jpg')).not.toBeNull();
  });

  it('leaves /connect on its tiles when logged out', () => {
    mockState.appParams.mode = undefined;
    const { container } = setup('/connect');
    expect(image(container, 'mm.jpg')).not.toBeNull();
    expect(image(container, 'alby.jpg')).not.toBeNull();
    expect(screen.queryByText(/wallet:/)).not.toBeInTheDocument();
    pressBack();
    expect(mockGoBack).not.toHaveBeenCalled();
    expect(screen.getByText('loading')).toBeInTheDocument();
  });

  it('walks tiles forward, including a single-tile shortcut, a dead tile and a missing page', () => {
    const { container } = setup('/');

    clickImage(container, 'dead.jpg');
    expect(screen.getByText('Home description')).toBeInTheDocument();
    expect(mockSetOptions).not.toHaveBeenCalled();

    mockState.isEmbedded = true;
    clickImage(container, 'child.jpg');
    expect(mockSetOptions).toHaveBeenCalledWith({ service: 'buy' });
    expect(readLayout().title).toBe('Child header');
    expect(screen.queryByText('Child header')).not.toBeInTheDocument();
    expect(image(container, 'a.jpg')).not.toBeNull();
    expect(image(container, 'b.jpg')).toBeNull();

    pressBack();
    expect(screen.getByText('Home description')).toBeInTheDocument();

    mockSetOptions.mockClear();
    clickImage(container, 'plain.jpg');
    expect(mockSetOptions).not.toHaveBeenCalled();
    expect(screen.getByText('Plain page')).toBeInTheDocument();
    pressBack();

    clickImage(container, 'single-stop.jpg');
    expect(screen.getByText('Single stop')).toBeInTheDocument();
    pressBack();

    clickImage(container, 'mid.jpg');
    expect(screen.getByText('Single stop')).toBeInTheDocument();
    pressBack();
    expect(screen.getByText('Home description')).toBeInTheDocument();

    clickImage(container, 'missing.jpg');
    expect(screen.getByText('loading')).toBeInTheDocument();
  });

  it('stops going back when the page underneath cannot be resolved', () => {
    const view = setup('/');
    clickImage(view.container, 'ghost.jpg');
    expect(screen.getByText('Ghost page')).toBeInTheDocument();
    clickImage(view.container, 'g.jpg');
    expect(screen.getByText('loading')).toBeInTheDocument();

    delete mockState.pages.ghost;
    pressBack();
    mockState.pages.ghost = page('ghost', {
      description: 'Ghost page',
      tiles: [
        { id: 'g', img: 'g.jpg', next: { page: 'missing' } },
        { id: 'g2', img: 'g2.jpg' },
      ],
    });
    redraw();
    expect(screen.getByText('Ghost page')).toBeInTheDocument();
    expect(screen.queryByText('Home description')).not.toBeInTheDocument();
  });

  it('stops going back on a page that has no tiles', () => {
    const view = setup('/');
    clickImage(view.container, 'ghost.jpg');
    clickImage(view.container, 'g.jpg');
    expect(screen.getByText('loading')).toBeInTheDocument();

    delete (mockState.pages.ghost as { tiles?: TestTile[] }).tiles;
    pressBack();
    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.queryByText('Ghost page')).not.toBeInTheDocument();
    expect(screen.queryByText('Home description')).not.toBeInTheDocument();
  });

  it('clears a wallet connection, including one remembered only by the back handler', () => {
    const { container } = setup('/');
    clickImage(container, 'wallet.jpg');
    expect(screen.getByText('wallet:MetaMask')).toBeInTheDocument();
    expect(image(container, 'https://example.invalid/home.jpg')).toBeNull();
    expect(readLayout().backButton).toBe(true);

    pressBack();
    expect(screen.getByText('Home description')).toBeInTheDocument();

    clickImage(container, 'wallet.jpg');
    fireEvent.click(screen.getByRole('button', { name: 'cancel-connect' }));
    expect(screen.getByText('Home description')).toBeInTheDocument();
    pressBack();
    expect(screen.getByText('Home description')).toBeInTheDocument();
    pressBack();
    expect(screen.getByText('loading')).toBeInTheDocument();
  });

  it('goes back from an address wallet on /connect and restores it for a custody asset', () => {
    mockState.isLoggedIn = true;
    mockState.hasAddress = true;
    mockState.appParams = {};
    const addressed = setup('/connect');
    expect(screen.getByText('wallet:Address')).toBeInTheDocument();
    pressBack();
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(screen.getByText('wallet:Address')).toBeInTheDocument();
    addressed.unmount();

    mockGoBack.mockReset();
    mockState.hasAddress = false;
    mockState.session = { blockchains: [] };
    mockState.appParams = { assetOut: 'ZCHF' };
    setup('/connect');
    fireEvent.click(screen.getByRole('button', { name: 'cancel-connect' }));
    expect(screen.queryByText(/wallet:/)).not.toBeInTheDocument();
    pressBack();
    expect(mockGoBack).not.toHaveBeenCalled();
    expect(screen.getByText('wallet:Address')).toBeInTheDocument();
  });

  it('goes back from /connect when there is nothing to connect', () => {
    mockState.isLoggedIn = true;
    mockState.session = { blockchains: [] };
    mockState.appParams = {};
    const missing = setup('/connect');
    expect(screen.queryByText(/wallet:/)).not.toBeInTheDocument();
    pressBack();
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    missing.unmount();

    mockGoBack.mockReset();
    mockState.appParams = { assetOut: 'NOPE' };
    setup('/connect');
    pressBack();
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('does nothing on back when an address wallet is open and there is no page to return to', () => {
    const view = setup('/');
    clickImage(view.container, 'address.jpg');
    expect(screen.getByText('wallet:Address')).toBeInTheDocument();

    mockState.appParams = { wallets: 'x' };
    redraw();
    expect(screen.getByText('loading')).toBeInTheDocument();
    pressBack();
    expect(mockGoBack).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByText('loading')).toBeInTheDocument();
  });

  it('filters wallet tiles by blockchain support and by the wallets query', () => {
    mockState.appParams = { mode: 'wallets' };
    const view = setup('/');
    expect(image(view.container, 'mm.jpg')).not.toBeNull();
    expect(image(view.container, 'alby.jpg')).not.toBeNull();
    expect(image(view.container, 'link.jpg')).not.toBeNull();

    mockState.appParams = { mode: 'wallets', blockchain: 'Bitcoin' };
    mockState.blocked = 'Alby|Bitcoin';
    redraw();
    expect(image(view.container, 'mm.jpg')).not.toBeNull();
    expect(image(view.container, 'alby.jpg')).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();

    mockState.appParams = { mode: 'wallets', wallets: 'MetaMask' };
    mockState.blocked = undefined;
    redraw();
    expect(image(view.container, 'mm.jpg')).not.toBeNull();
    expect(image(view.container, 'alby.jpg')).toBeNull();
    expect(image(view.container, 'link.jpg')).not.toBeNull();
  });

  it('shows the chain from the wallet or, when it has none, from the page', () => {
    const { container } = setup('/');
    clickImage(container, 'wallet.jpg');
    expect(screen.getByText('chain:Ethereum')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'switch-wallet' }));
    expect(screen.getByText('wallet:Mail')).toBeInTheDocument();
    expect(screen.getByText('chain:Ethereum')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'cancel-connect' }));

    mockState.appParams = { ...mockState.appParams, blockchain: 'Bitcoin' };
    clickImage(container, 'plain-wallet.jpg');
    expect(screen.getByText('chain:Bitcoin')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'cancel-connect' }));

    mockState.appParams = { mode: 'home' };
    clickImage(container, 'plain-wallet.jpg');
    expect(screen.getByText('chain:undefined')).toBeInTheDocument();
  });

  it('shows the suspense fallback while the connect screen is still loading', () => {
    mockState.suspend = true;
    setup('/login/mail');
    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.queryByText(/wallet:/)).not.toBeInTheDocument();
  });

  it('enables the back button when the screen can close and is not embedded', () => {
    mockState.canClose = true;
    mockState.isEmbedded = false;
    setup('/');
    expect(readLayout().backButton).toBe(true);
    expect(readLayout().title).toBeUndefined();
  });

  it('puts the title in the layout when embedded and skips the back button on the root page', () => {
    mockState.canClose = true;
    mockState.isEmbedded = true;
    const view = setup('/');
    expect(readLayout().backButton).toBe(false);
    expect(readLayout().title).toBe('Home header');

    mockState.canClose = false;
    clickImage(view.container, 'plain.jpg');
    expect(readLayout().backButton).toBe(true);
    expect(screen.getByText('Plain page')).toBeInTheDocument();
  });
});
