// Component tests for RealunitQuoteDetailScreen: loading/error/not-found, display, and
// role-gated confirm-payment / deactivate actions.

let mockRole: string | undefined = 'Admin';
const mockNavigate = jest.fn();
const mockFetchQuotes = jest.fn();
const mockResetQuotes = jest.fn();
const mockConfirmPayment = jest.fn();
const mockDeactivateQuote = jest.fn();
const mockUseRealunitQuotesGuard = jest.fn();

let mockParams: { id?: string } = { id: '1' };
let mockContext: {
  quotes: any[];
  quotesLoading: boolean;
  quotesError: boolean;
  fetchQuotes: typeof mockFetchQuotes;
  resetQuotes: typeof mockResetQuotes;
  confirmPayment: typeof mockConfirmPayment;
  deactivateQuote: typeof mockDeactivateQuote;
};

jest.mock('@dfx.swiss/react', () => ({
  UserRole: {
    ADMIN: 'Admin',
    REALUNIT: 'RealUnit',
    COMPLIANCE: 'Compliance',
    SUPPORT: 'Support',
    MARKETING: 'Marketing',
    USER: 'User',
  },
  useAuthContext: () => ({ session: mockRole ? { role: mockRole } : undefined }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', LG: 'lg' },
  StyledLoadingSpinner: ({ size }: { size?: string }) => <div data-testid="loading-spinner" data-size={size} />,
  StyledButton: ({ label, onClick, disabled }: { label: string; onClick?: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {label}
    </button>
  ),
  StyledButtonWidth: { FULL: 'full' },
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

jest.mock('src/components/overlay/confirmation-overlay', () => ({
  ConfirmationOverlay: ({
    message,
    cancelLabel,
    confirmLabel,
    onCancel,
    onConfirm,
  }: {
    message: string;
    cancelLabel: string;
    confirmLabel: string;
    onCancel: () => void;
    onConfirm: () => void | Promise<void>;
  }) => (
    <div data-testid="confirmation-overlay">
      <p>{message}</p>
      <button type="button" onClick={onCancel}>
        {cancelLabel}
      </button>
      <button type="button" onClick={() => onConfirm()}>
        {confirmLabel}
      </button>
    </div>
  ),
}));

jest.mock('src/hooks/guard.hook', () => ({
  useRealunitQuotesGuard: (...args: unknown[]) => mockUseRealunitQuotesGuard(...args),
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));

jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('react-router-dom', () => ({
  useParams: () => mockParams,
}));

jest.mock('src/contexts/realunit.context', () => ({
  useRealunitContext: () => mockContext,
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RealunitQuoteDetailScreen from 'src/screens/realunit-quote-detail.screen';

const BASE_QUOTE = {
  id: 1,
  uid: 'Q1',
  type: 'Buy',
  status: 'WaitingForPayment',
  amount: 100,
  estimatedAmount: 10,
  created: '2026-01-15T10:00:00.000Z',
  userAddress: '0x1234567890abcdef1234567890abcdef12345678',
};

function setContext(overrides: Partial<typeof mockContext> = {}) {
  mockContext = {
    quotes: [BASE_QUOTE],
    quotesLoading: false,
    quotesError: false,
    fetchQuotes: mockFetchQuotes,
    resetQuotes: mockResetQuotes,
    confirmPayment: mockConfirmPayment,
    deactivateQuote: mockDeactivateQuote,
    ...overrides,
  };
}

describe('RealunitQuoteDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRole = 'Admin';
    mockParams = { id: '1' };
    mockConfirmPayment.mockResolvedValue(undefined);
    mockDeactivateQuote.mockResolvedValue(undefined);
    setContext();
  });

  it('calls the quotes guard on render', () => {
    render(<RealunitQuoteDetailScreen />);
    expect(mockUseRealunitQuotesGuard).toHaveBeenCalledWith();
  });

  it('shows the loading spinner when quotes are loading and empty', () => {
    setContext({ quotes: [], quotesLoading: true });
    render(<RealunitQuoteDetailScreen />);
    expect(screen.getByTestId('loading-spinner')).toHaveAttribute('data-size', 'lg');
  });

  it('shows ErrorHint when fetch failed and the quote is missing', () => {
    setContext({ quotes: [], quotesError: true });
    render(<RealunitQuoteDetailScreen />);
    expect(screen.getByTestId('error-hint')).toHaveTextContent('Failed to load quote details.');
  });

  it('shows Quote not found when fetch succeeded but the id is missing', () => {
    setContext({ quotes: [], quotesError: false, quotesLoading: false });
    render(<RealunitQuoteDetailScreen />);
    expect(screen.getByText('Quote not found')).toBeInTheDocument();
  });

  it('renders type, status, amount, estimated amount, user and created for a found quote', () => {
    render(<RealunitQuoteDetailScreen />);
    expect(screen.getByText('Buy')).toBeInTheDocument();
    expect(screen.getByText('WaitingForPayment')).toBeInTheDocument();
    expect(screen.getByText(BASE_QUOTE.amount.toLocaleString())).toBeInTheDocument();
    expect(screen.getByText(BASE_QUOTE.estimatedAmount.toLocaleString())).toBeInTheDocument();
    expect(screen.getByText('Address')).toBeInTheDocument();
    expect(screen.queryByText('User')).not.toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
  });

  it('maps displayType BuyCrypto to Buy, BuyFiat to Sell, and passes other values through', () => {
    setContext({ quotes: [{ ...BASE_QUOTE, type: 'BuyCrypto' }] });
    const { unmount } = render(<RealunitQuoteDetailScreen />);
    expect(screen.getByText('Buy')).toBeInTheDocument();
    unmount();

    setContext({ quotes: [{ ...BASE_QUOTE, type: 'BuyFiat' }] });
    const { unmount: unmount2 } = render(<RealunitQuoteDetailScreen />);
    expect(screen.getByText('Sell')).toBeInTheDocument();
    unmount2();

    setContext({ quotes: [{ ...BASE_QUOTE, type: 'OtherType' }] });
    render(<RealunitQuoteDetailScreen />);
    expect(screen.getByText('OtherType')).toBeInTheDocument();
  });

  it('navigates to the user page when the address is present, and shows "-" when absent', () => {
    const { unmount } = render(<RealunitQuoteDetailScreen />);
    fireEvent.click(screen.getByRole('button', { name: /0x/i }));
    expect(mockNavigate).toHaveBeenCalledWith(`/realunit/user/${encodeURIComponent(BASE_QUOTE.userAddress)}`);
    unmount();

    setContext({ quotes: [{ ...BASE_QUOTE, userAddress: undefined }] });
    render(<RealunitQuoteDetailScreen />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('shows Confirm Payment for ADMIN when WaitingForPayment and not deactivated', () => {
    mockRole = 'Admin';
    render(<RealunitQuoteDetailScreen />);
    expect(screen.getByRole('button', { name: 'Confirm Payment Received' })).toBeInTheDocument();
  });

  it('shows Confirm Payment for REALUNIT and COMPLIANCE', () => {
    mockRole = 'RealUnit';
    const { unmount } = render(<RealunitQuoteDetailScreen />);
    expect(screen.getByRole('button', { name: 'Confirm Payment Received' })).toBeInTheDocument();
    unmount();

    mockRole = 'Compliance';
    render(<RealunitQuoteDetailScreen />);
    expect(screen.getByRole('button', { name: 'Confirm Payment Received' })).toBeInTheDocument();
  });

  it('hides Confirm Payment for SUPPORT even when WaitingForPayment and not deactivated', () => {
    mockRole = 'Support';
    render(<RealunitQuoteDetailScreen />);
    expect(screen.queryByRole('button', { name: 'Confirm Payment Received' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deactivate Quote' })).toBeInTheDocument();
  });

  it('hides Confirm Payment when session is missing, and still shows Deactivate for an active Buy', () => {
    mockRole = undefined;
    render(<RealunitQuoteDetailScreen />);
    expect(screen.queryByRole('button', { name: 'Confirm Payment Received' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deactivate Quote' })).toBeInTheDocument();
  });

  it('hides Confirm Payment when deactivatedAt is set', () => {
    setContext({
      quotes: [{ ...BASE_QUOTE, deactivatedAt: '2026-02-01T12:00:00.000Z' }],
    });
    render(<RealunitQuoteDetailScreen />);
    expect(screen.queryByRole('button', { name: 'Confirm Payment Received' })).not.toBeInTheDocument();
    expect(screen.getByText('Deactivated At')).toBeInTheDocument();
  });

  it('hides Confirm Payment when status is not WaitingForPayment', () => {
    setContext({ quotes: [{ ...BASE_QUOTE, status: 'Completed' }] });
    render(<RealunitQuoteDetailScreen />);
    expect(screen.queryByRole('button', { name: 'Confirm Payment Received' })).not.toBeInTheDocument();
  });

  it('Confirm Payment confirm calls confirmPayment, resetQuotes, and navigate to quotes; cancel closes without API', async () => {
    render(<RealunitQuoteDetailScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Payment Received' }));
    expect(screen.getByText('Are you sure you want to confirm the payment receipt?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('confirmation-overlay')).not.toBeInTheDocument();
    expect(mockConfirmPayment).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Payment Received' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => {
      expect(mockConfirmPayment).toHaveBeenCalledWith(1);
      expect(mockResetQuotes).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/realunit/quotes');
    });
  });

  it('keeps the overlay open if Cancel is pressed while the action is in flight', async () => {
    let resolveConfirm: () => void = () => undefined;
    mockConfirmPayment.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveConfirm = resolve;
      }),
    );
    render(<RealunitQuoteDetailScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Payment Received' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByTestId('confirmation-overlay')).toBeInTheDocument();
    resolveConfirm();
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/realunit/quotes');
    });
  });

  it('shows Deactivate when Buy, not completed, and not deactivated', () => {
    render(<RealunitQuoteDetailScreen />);
    expect(screen.getByRole('button', { name: 'Deactivate Quote' })).toBeInTheDocument();
  });

  it('hides Deactivate when deactivatedAt is set, status is Completed, or type is not Buy', () => {
    setContext({
      quotes: [{ ...BASE_QUOTE, deactivatedAt: '2026-02-01T12:00:00.000Z' }],
    });
    const { unmount } = render(<RealunitQuoteDetailScreen />);
    expect(screen.queryByRole('button', { name: 'Deactivate Quote' })).not.toBeInTheDocument();
    unmount();

    setContext({ quotes: [{ ...BASE_QUOTE, status: 'Completed' }] });
    const { unmount: u2 } = render(<RealunitQuoteDetailScreen />);
    expect(screen.queryByRole('button', { name: 'Deactivate Quote' })).not.toBeInTheDocument();
    u2();

    setContext({ quotes: [{ ...BASE_QUOTE, type: 'Sell' }] });
    const { unmount: u3 } = render(<RealunitQuoteDetailScreen />);
    expect(screen.queryByRole('button', { name: 'Deactivate Quote' })).not.toBeInTheDocument();
    u3();

    setContext({ quotes: [{ ...BASE_QUOTE, type: 'BuyFiat' }] });
    const { unmount: u4 } = render(<RealunitQuoteDetailScreen />);
    expect(screen.queryByRole('button', { name: 'Deactivate Quote' })).not.toBeInTheDocument();
    u4();

    setContext({ quotes: [{ ...BASE_QUOTE, type: 'BuyCrypto' }] });
    render(<RealunitQuoteDetailScreen />);
    expect(screen.queryByRole('button', { name: 'Deactivate Quote' })).not.toBeInTheDocument();
  });

  it('Deactivate confirm calls deactivateQuote, resetQuotes, and navigate to quotes; cancel closes without API', async () => {
    render(<RealunitQuoteDetailScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate Quote' }));
    expect(screen.getByText('Are you sure you want to deactivate this quote?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('confirmation-overlay')).not.toBeInTheDocument();
    expect(mockDeactivateQuote).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate Quote' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => {
      expect(mockDeactivateQuote).toHaveBeenCalledWith(1);
      expect(mockResetQuotes).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/realunit/quotes');
    });
  });

  it('does not open a Deactivate overlay while Confirm is already pending', () => {
    render(<RealunitQuoteDetailScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Payment Received' }));
    expect(screen.getByText('Are you sure you want to confirm the payment receipt?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate Quote' }));
    expect(screen.getAllByTestId('confirmation-overlay')).toHaveLength(1);
    expect(screen.getByText('Are you sure you want to confirm the payment receipt?')).toBeInTheDocument();
    expect(screen.queryByText('Are you sure you want to deactivate this quote?')).not.toBeInTheDocument();
  });

  it('does not open a Confirm overlay while Deactivate is already pending', () => {
    render(<RealunitQuoteDetailScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate Quote' }));
    expect(screen.getByText('Are you sure you want to deactivate this quote?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Payment Received' }));
    expect(screen.getAllByTestId('confirmation-overlay')).toHaveLength(1);
    expect(screen.getByText('Are you sure you want to deactivate this quote?')).toBeInTheDocument();
    expect(screen.queryByText('Are you sure you want to confirm the payment receipt?')).not.toBeInTheDocument();
  });

  it('fetches quotes on mount when the list is empty', () => {
    setContext({ quotes: [], quotesLoading: false });
    render(<RealunitQuoteDetailScreen />);
    expect(mockFetchQuotes).toHaveBeenCalled();
  });
});
