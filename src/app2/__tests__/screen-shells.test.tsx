import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../i18n';
import { NotFound } from '../screens/parts/NotFound';
import { LoggedOutState } from '../screens/parts/LoggedOutState';
import { QrBill } from '../screens/trade/QrBill';

const mockNavigate = jest.fn();
const mockOpenConnect = jest.fn();

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

jest.mock('../wallets/session', () => ({
  useWalletSession: () => ({ openConnect: mockOpenConnect }),
}));

jest.mock('react-qr-code', () => ({
  __esModule: true,
  default: ({ value }: { value: string }) => <div data-testid="qr">{value}</div>,
}));

describe('screen shells', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockOpenConnect.mockReset();
  });

  it('sends an unmatched route back home', () => {
    render(
      <MemoryRouter>
        <LanguageProvider>
          <NotFound />
        </LanguageProvider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /back|home|accueil|start/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('opens connect from a logged-out secondary screen', () => {
    render(
      <LanguageProvider>
        <LoggedOutState title="Account" />
      </LanguageProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Account' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /connect|verbinden|connetti|connecter/i }));
    expect(mockOpenConnect).toHaveBeenCalled();
  });

  it('renders a Swiss QR-bill image and a text QR', () => {
    const { rerender } = render(<QrBill payload={'<svg xmlns="http://www.w3.org/2000/svg"></svg>'} caption="Bill" />);
    expect(screen.getByAltText('Swiss QR-bill')).toBeInTheDocument();
    expect(screen.getByText('Bill')).toBeInTheDocument();
    rerender(<QrBill payload="bitcoin:abc" />);
    expect(screen.getByTestId('qr')).toHaveTextContent('bitcoin:abc');
  });
});
