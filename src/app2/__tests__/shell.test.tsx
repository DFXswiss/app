import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { LanguageProvider } from '../i18n';

const mockNavigate = jest.fn();
const mockCloseConnect = jest.fn();
const mockOpenConnect = jest.fn();
const mockSession = {
  isLoggedIn: false,
  address: undefined as string | undefined,
  closeConnect: mockCloseConnect,
  openConnect: mockOpenConnect,
  connectSheet: {
    open: false,
    view: 'list',
    onSelectWallet: jest.fn(),
    onSelectHwChain: jest.fn(),
    onSubmitRecommendation: jest.fn(),
    requestSignMessage: jest.fn(),
    onCliConnect: jest.fn(),
    onBackToList: jest.fn(),
  },
};

jest.mock('@dfx.swiss/react', () => ({
  AuthWalletType: {
    METAMASK: 'MetaMask',
    LEDGER: 'Ledger',
    CLI: 'CLI',
    WALLET_CONNECT: 'WalletConnect',
  },
}));

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

jest.mock('../wallets/session', () => ({
  useWalletSession: () => mockSession,
}));

jest.mock('../wallets/ConnectSheet', () => ({
  ConnectSheet: () => <div data-testid="connect-sheet" />,
}));

jest.mock('../components/Drawer', () => ({
  Drawer: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <button type="button" data-testid="drawer" onClick={onClose}>
        drawer
      </button>
    ) : null,
}));

jest.mock('../components/LanguageSheet', () => ({
  LanguageMenu: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <button type="button" data-testid="lang-menu" onClick={onClose}>
        lang
      </button>
    ) : null,
}));

jest.mock('../wallets/WalletSwitcher', () => ({
  WalletSwitcher: () => null,
}));

function renderShell(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LanguageProvider>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/" element={<div>home</div>} />
            <Route path="/account" element={<div>account</div>} />
          </Route>
        </Routes>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

describe('Shell', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockCloseConnect.mockReset();
    mockOpenConnect.mockReset();
    mockSession.openConnect = mockOpenConnect;
    mockSession.isLoggedIn = false;
    mockSession.address = undefined;
    document.body.className = '';
  });

  afterEach(() => {
    document.body.className = '';
  });

  it('hides the avatar while logged out and toggles the language menu', () => {
    renderShell();
    expect(document.getElementById('leftBtn')).toHaveStyle({ visibility: 'hidden' });
    fireEvent.click(screen.getByRole('button', { name: /change language|sprache|lingua|langue/i }));
    expect(screen.getByTestId('lang-menu')).toBeInTheDocument();
    expect(document.title).toBe('DFX');
  });

  it('shows initials, opens the account and the drawer when logged in', () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0xabcdef123456';
    renderShell();
    expect(screen.getByText('AB')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'account' }));
    expect(mockNavigate).toHaveBeenCalledWith('/account');
    fireEvent.click(screen.getByRole('button', { name: 'menu' }));
    expect(screen.getByTestId('drawer')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('drawer'));
    expect(screen.queryByTestId('drawer')).not.toBeInTheDocument();
  });

  it('falls back to a middle-dot initial without an address', () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '';
    renderShell();
    expect(screen.getByText('·')).toBeInTheDocument();
  });

  it('derives initials from a non-0x address and treats a bare 0x as a middle-dot', () => {
    mockSession.isLoggedIn = true;
    mockSession.address = 'bc1qabcd';
    const { unmount } = renderShell();
    expect(screen.getByText('BC')).toBeInTheDocument();
    unmount();

    mockSession.address = '0x';
    renderShell();
    expect(screen.getByText('·')).toBeInTheDocument();
  });

  it('closes the language menu through onClose', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: /change language|sprache|lingua|langue/i }));
    fireEvent.click(screen.getByTestId('lang-menu'));
    expect(screen.queryByTestId('lang-menu')).not.toBeInTheDocument();
  });

  it('puts the hashed headless class on body when headless=true, and not when it is absent', () => {
    const { unmount } = renderShell('/?headless=true');
    expect(document.body.className.split(/\s+/)).toContain('headless');
    unmount();
    expect(document.body.className.split(/\s+/)).not.toContain('headless');

    renderShell('/');
    expect(document.body.className.split(/\s+/)).not.toContain('headless');
  });

  it('does not put the hashed headless class on body for headless=1', () => {
    const { unmount } = renderShell('/?headless=1');
    expect(document.body.className.split(/\s+/)).not.toContain('headless');
    unmount();
  });

  it('puts the hashed borderless class on body when borderless=true, and not when it is absent', () => {
    const { unmount } = renderShell('/?borderless=true');
    expect(document.body.className.split(/\s+/)).toContain('borderless');
    unmount();
    expect(document.body.className.split(/\s+/)).not.toContain('borderless');

    renderShell('/');
    expect(document.body.className.split(/\s+/)).not.toContain('borderless');
  });

  it('puts the hashed borderless class on body for borderless=1', () => {
    const { unmount } = renderShell('/?borderless=1');
    expect(document.body.className.split(/\s+/)).toContain('borderless');
    unmount();
  });

  it('opens connect when service=connect, and not when the param is absent', () => {
    const absent = renderShell('/');
    expect(mockOpenConnect).not.toHaveBeenCalled();
    absent.unmount();

    renderShell('/?service=connect');
    expect(mockOpenConnect).toHaveBeenCalledTimes(1);
  });

  it('opens connect only once when the session callback identity changes', () => {
    function Harness() {
      const [, bump] = useState(0);
      return (
        <>
          <button type="button" onClick={() => bump((n) => n + 1)}>
            bump
          </button>
          <MemoryRouter initialEntries={['/?service=connect']}>
            <LanguageProvider>
              <Routes>
                <Route element={<Shell />}>
                  <Route path="/" element={<div>home</div>} />
                </Route>
              </Routes>
            </LanguageProvider>
          </MemoryRouter>
        </>
      );
    }

    render(<Harness />);
    expect(mockOpenConnect).toHaveBeenCalledTimes(1);
    const nextOpen = jest.fn();
    mockSession.openConnect = nextOpen;
    fireEvent.click(screen.getByRole('button', { name: 'bump' }));
    expect(nextOpen).not.toHaveBeenCalled();
    expect(mockOpenConnect).toHaveBeenCalledTimes(1);
  });
});
