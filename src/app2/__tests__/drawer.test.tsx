import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Drawer } from '../components/Drawer';
import { LanguageProvider } from '../i18n';

const mockNavigate = jest.fn();
const mockLogout = jest.fn();
const mockSession = {
  address: '0x1234567890abcdef',
  blockchain: 'Ethereum',
  logout: mockLogout,
};

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

jest.mock('../wallets/session', () => ({
  useWalletSession: () => mockSession,
}));

function renderDrawer(activePath = '/') {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <Drawer open onClose={jest.fn()} activePath={activePath} />
      </LanguageProvider>
    </MemoryRouter>,
  );
}

describe('Drawer', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockLogout.mockReset();
    mockSession.address = '0x1234567890abcdef';
    mockSession.blockchain = 'Ethereum';
    jest.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    (window.open as jest.Mock).mockRestore();
  });

  it('navigates trade routes, opens an external link and logs out', () => {
    const onClose = jest.fn();
    render(
      <MemoryRouter>
        <LanguageProvider>
          <Drawer open onClose={onClose} activePath="/" />
        </LanguageProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /^buy$|^kaufen$|^compra$|^acheter$/i }));
    expect(onClose).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/', search: '?mode=buy' });

    fireEvent.click(screen.getByRole('button', { name: /^sell$|^verkaufen$|^vendi$|^vendre$/i }));
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/', search: '?mode=sell' });

    fireEvent.click(screen.getByRole('button', { name: /imprint|impressum|colophon|mentions/i }));
    expect(window.open).toHaveBeenCalledWith('https://docs.dfx.swiss/en/imprint.html', '_blank', 'noopener');

    fireEvent.click(screen.getByRole('button', { name: /sign out|abmelden|esci|déconnexion/i }));
    expect(mockLogout).toHaveBeenCalled();
  });

  it('activates a route with a sub-view via the keyboard and shortens a long address', () => {
    renderDrawer('/ocp');
    expect(screen.getByText(/0x1234…cdef/)).toBeInTheDocument();
    expect(screen.getByText('Ethereum')).toBeInTheDocument();

    const ocp = screen.getByRole('button', { name: /opencryptopay|kasse|caisse/i });
    fireEvent.keyDown(ocp, { key: 'Enter' });
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/ocp', search: '' });

    fireEvent.click(screen.getByRole('button', { name: /payment routes|zahlungswege|metodi|moyens/i }));
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/ocp', search: '?sub=routes' });

    fireEvent.keyDown(screen.getByRole('button', { name: /sign out|abmelden|esci|déconnexion/i }), { key: 'Enter' });
    expect(mockLogout).toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('button', { name: /sign out|abmelden|esci|déconnexion/i }), { key: ' ' });
    expect(mockLogout).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(ocp, { key: 'Tab' });
    fireEvent.keyDown(screen.getByRole('button', { name: /sign out|abmelden|esci|déconnexion/i }), { key: 'Tab' });
  });

  it('renders a dash when no address is set', () => {
    mockSession.address = '';
    mockSession.blockchain = undefined as unknown as string;
    renderDrawer('/');
    expect(screen.getByText('—')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /close menu|schließen|chiudi|fermer/i }));
  });

  it('renders a closed drawer, a short address and a route without search params', () => {
    mockSession.address = 'abc';
    const onClose = jest.fn();
    render(
      <MemoryRouter>
        <LanguageProvider>
          <Drawer open={false} onClose={onClose} activePath="/account" />
        </LanguageProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText('abc')).toBeInTheDocument();
    const accountBtn = Array.from(document.querySelectorAll('[role="button"]')).find((el) =>
      /my account|mein konto|il mio conto|mon compte/i.test(el.textContent ?? ''),
    );
    fireEvent.click(accountBtn as HTMLElement);
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/account', search: '' });
  });
});
