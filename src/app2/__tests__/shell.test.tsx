import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Shell } from '../components/Shell';
import { LanguageProvider } from '../i18n';

const mockCloseConnect = jest.fn();
const mockOpenConnect = jest.fn();
const mockGetProfile = jest.fn();
const mockUserContext: { user: { accountId: number } | undefined } = { user: undefined };
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
  useUser: () => ({ getProfile: () => mockGetProfile() }),
  useUserContext: () => mockUserContext,
}));

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

function shellTree(path = '/') {
  return (
    <MemoryRouter initialEntries={[path]}>
      <LanguageProvider>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/" element={<div>home</div>} />
            <Route path="/account" element={<div>account</div>} />
          </Route>
        </Routes>
      </LanguageProvider>
    </MemoryRouter>
  );
}

function renderShell(path = '/') {
  return render(shellTree(path));
}

function avatarInitials(): string | null {
  return document.getElementById('leftBtn')?.querySelector('span')?.textContent ?? null;
}

describe('Shell', () => {
  beforeEach(() => {
    mockCloseConnect.mockReset();
    mockOpenConnect.mockReset();
    mockSession.openConnect = mockOpenConnect;
    mockSession.isLoggedIn = false;
    mockSession.address = undefined;
    mockUserContext.user = { accountId: 1 };
    mockGetProfile.mockReset();
    mockGetProfile.mockResolvedValue(undefined);
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

  it('shows customer initials, opens the account and the drawer when logged in', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0xabcdef123456';
    mockGetProfile.mockResolvedValue({ firstName: 'Ada', lastName: 'Lovelace', organizationName: 'DFX AG' });
    renderShell();
    await waitFor(() => expect(avatarInitials()).toBe('AL'));
    fireEvent.click(screen.getByRole('button', { name: 'account' }));
    expect(screen.getByText('account')).toBeInTheDocument();
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

  it('uses one available customer name and a middle-dot for whitespace-only names', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0xabcdef';
    mockGetProfile.mockResolvedValueOnce({ firstName: '  ada  ' });
    const { unmount } = renderShell();
    await waitFor(() => expect(avatarInitials()).toBe('A'));
    unmount();

    mockGetProfile.mockResolvedValueOnce({ firstName: '  ', lastName: '\t' });
    renderShell();
    await waitFor(() => expect(avatarInitials()).toBe('·'));
    expect(screen.queryByText('0X')).not.toBeInTheDocument();
  });

  it('uses a surname initial when the profile has no first name', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0xabcdef';
    mockGetProfile.mockResolvedValue({ firstName: ' ', lastName: '  Lovelace' });
    renderShell();
    await waitFor(() => expect(avatarInitials()).toBe('L'));
  });

  it('uses the first Unicode codepoint of each person name', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0xabcdef';
    mockGetProfile.mockResolvedValue({ firstName: ' 🧑‍💻 Ada', lastName: ' Émile ' });
    renderShell();
    await waitFor(() => expect(avatarInitials()).toBe('🧑É'));
  });

  it('uses organization word initials or two Unicode codepoints for a single word', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0xabcdef';
    mockGetProfile.mockResolvedValueOnce({ organizationName: '  DFX   Swiss AG ' });
    const { unmount } = renderShell();
    await waitFor(() => expect(avatarInitials()).toBe('DS'));
    unmount();

    mockGetProfile.mockResolvedValueOnce({ organizationName: ' über ' });
    const single = renderShell();
    await waitFor(() => expect(avatarInitials()).toBe('ÜB'));
    single.unmount();

    mockGetProfile.mockResolvedValueOnce({ organizationName: ' É ' });
    renderShell();
    await waitFor(() => expect(avatarInitials()).toBe('É'));
  });

  it('keeps the neutral initial on profile failure instead of showing the wallet address', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0xabcdef123456';
    mockGetProfile.mockRejectedValue(new Error('profile unavailable'));
    renderShell();
    await waitFor(() => expect(mockGetProfile).toHaveBeenCalledTimes(1));
    expect(avatarInitials()).toBe('·');
    expect(screen.queryByText('AB')).not.toBeInTheDocument();
    expect(screen.queryByText(/abcdef/i)).not.toBeInTheDocument();
  });

  it('uses the neutral initial when the profile request has no profile', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0xabcdef';
    mockGetProfile.mockResolvedValue(undefined);
    renderShell();
    await waitFor(() => expect(mockGetProfile).toHaveBeenCalledTimes(1));
    expect(avatarInitials()).toBe('·');
  });

  it('clears initials immediately on wallet switch and ignores the prior profile response', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0xaaa';
    const pendingProfiles: Array<{
      resolve: (profile: { firstName: string }) => void;
      reject: (error: Error) => void;
    }> = [];
    mockGetProfile.mockImplementation(
      () => new Promise((resolve, reject) => pendingProfiles.push({ resolve, reject })),
    );
    const view = renderShell();
    await waitFor(() => expect(mockGetProfile).toHaveBeenCalledTimes(1));

    mockSession.address = '0xbbb';
    view.rerender(shellTree());
    expect(avatarInitials()).toBe('·');
    await waitFor(() => expect(mockGetProfile).toHaveBeenCalledTimes(2));

    await act(async () => pendingProfiles[1].resolve({ firstName: 'Berta' }));
    expect(avatarInitials()).toBe('B');
    await act(async () => pendingProfiles[0].reject(new Error('stale profile failure')));
    expect(avatarInitials()).toBe('B');
  });

  it('hides and refreshes the profile when the account scope changes at the same wallet address', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0xaaa';
    const pendingProfiles: Array<(profile: { firstName: string }) => void> = [];
    mockGetProfile.mockImplementation(
      () => new Promise((resolve) => pendingProfiles.push(resolve)),
    );
    const view = renderShell();
    await waitFor(() => expect(mockGetProfile).toHaveBeenCalledTimes(1));
    await act(async () => pendingProfiles[0]({ firstName: 'Alice' }));
    expect(avatarInitials()).toBe('A');

    mockUserContext.user = undefined;
    view.rerender(shellTree());
    expect(avatarInitials()).toBe('·');
    await waitFor(() => expect(mockGetProfile).toHaveBeenCalledTimes(2));

    mockUserContext.user = { accountId: 2 };
    view.rerender(shellTree());
    expect(avatarInitials()).toBe('·');
    await waitFor(() => expect(mockGetProfile).toHaveBeenCalledTimes(3));

    await act(async () => pendingProfiles[2]({ firstName: 'Berta' }));
    expect(avatarInitials()).toBe('B');
    await act(async () => pendingProfiles[1]({ firstName: 'Carol' }));
    expect(avatarInitials()).toBe('B');
  });

  it('clears initials on logout and ignores a profile response after unmount', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0xaaa';
    let resolveProfile: ((profile: { firstName: string }) => void) | undefined;
    mockGetProfile.mockImplementation(
      () => new Promise((resolve) => { resolveProfile = resolve; }),
    );
    const view = renderShell();
    await waitFor(() => expect(mockGetProfile).toHaveBeenCalledTimes(1));
    mockSession.isLoggedIn = false;
    view.rerender(shellTree());
    expect(document.getElementById('leftBtn')).toHaveStyle({ visibility: 'hidden' });
    expect(avatarInitials()).toBe('·');
    view.unmount();
    await act(async () => resolveProfile?.({ firstName: 'Alice' }));
  });

  it('does not refetch when useUser returns a fresh callback after a shell rerender', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0xaaa';
    mockGetProfile.mockResolvedValue({ firstName: 'Ada', lastName: 'Lovelace' });
    renderShell();
    await waitFor(() => expect(avatarInitials()).toBe('AL'));
    fireEvent.click(screen.getByRole('button', { name: 'menu' }));
    expect(mockGetProfile).toHaveBeenCalledTimes(1);
  });

  it('refreshes the profile on route change while keeping the current initials visible during loading', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0xaaa';
    mockGetProfile
      .mockResolvedValueOnce({ firstName: 'Alice' })
      .mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve({ firstName: 'Berta' }), 0)),
      );
    renderShell();
    await waitFor(() => expect(avatarInitials()).toBe('A'));
    fireEvent.click(screen.getByRole('button', { name: 'account' }));
    expect(avatarInitials()).toBe('A');
    await waitFor(() => expect(avatarInitials()).toBe('B'));
    expect(mockGetProfile).toHaveBeenCalledTimes(2);
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
