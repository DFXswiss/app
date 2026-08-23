// Component tests for RealunitQuotesScreen: loading, empty, error, rows, pagination.

const mockNavigate = jest.fn();
const mockFetchQuotes = jest.fn();
const mockUseRealunitQuotesGuard = jest.fn();

let mockContext: {
  quotes: any[];
  quotesLoading: boolean;
  quotesError: boolean;
  fetchQuotes: typeof mockFetchQuotes;
};

jest.mock('@dfx.swiss/react', () => ({
  UserRole: {
    ADMIN: 'Admin',
    REALUNIT: 'RealUnit',
    COMPLIANCE: 'Compliance',
    SUPPORT: 'Support',
  },
}));

const mockCopy = jest.fn();

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', LG: 'lg' },
  IconColor: { GRAY: 'gray' },
  StyledLoadingSpinner: ({ size }: { size?: string }) => <div data-testid="loading-spinner" data-size={size} />,
  StyledButton: ({ label, onClick, disabled }: { label: string; onClick?: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {label}
    </button>
  ),
  StyledButtonWidth: { FULL: 'full' },
  CopyButton: ({ onCopy }: { onCopy?: () => void }) => (
    <button type="button" data-testid="copy-button" onClick={onCopy}>
      copy
    </button>
  ),
}));

jest.mock('src/hooks/clipboard.hook', () => ({
  useClipboard: () => ({ copy: mockCopy, isCopying: false }),
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
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

jest.mock('src/contexts/realunit.context', () => ({
  useRealunitContext: () => mockContext,
}));

import { fireEvent, render, screen } from '@testing-library/react';
import RealunitQuotesScreen from 'src/screens/realunit-quotes.screen';

const QUOTE = {
  id: 42,
  uid: 'Q42',
  type: 'Buy',
  status: 'WaitingForPayment',
  amount: 250,
  estimatedAmount: 25,
  created: '2026-01-15T10:00:00.000Z',
  userAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
  userId: 42,
  userName: 'Ada Lovelace',
};

function setContext(overrides: Partial<typeof mockContext> = {}) {
  mockContext = {
    quotes: [],
    quotesLoading: false,
    quotesError: false,
    fetchQuotes: mockFetchQuotes,
    ...overrides,
  };
}

describe('RealunitQuotesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setContext();
  });

  it('calls the quotes guard on render', () => {
    render(<RealunitQuotesScreen />);
    expect(mockUseRealunitQuotesGuard).toHaveBeenCalledWith();
  });

  it('shows the loading spinner when loading and empty', () => {
    setContext({ quotesLoading: true, quotes: [] });
    render(<RealunitQuotesScreen />);
    expect(screen.getByTestId('loading-spinner')).toHaveAttribute('data-size', 'lg');
  });

  it('shows empty copy when there are no quotes', () => {
    setContext({ quotes: [], quotesLoading: false, quotesError: false });
    render(<RealunitQuotesScreen />);
    expect(screen.getByText('No pending transactions found')).toBeInTheDocument();
  });

  it('shows ErrorHint when quotesError is set', () => {
    setContext({ quotesError: true });
    render(<RealunitQuotesScreen />);
    expect(screen.getByTestId('error-hint')).toHaveTextContent('Failed to load pending transactions.');
  });

  it('renders a row and navigates to the detail on click', () => {
    setContext({ quotes: [QUOTE] });
    render(<RealunitQuotesScreen />);
    fireEvent.click(screen.getByText('Buy'));
    expect(mockNavigate).toHaveBeenCalledWith('/realunit/quotes/42');
  });

  it('maps displayType BuyCrypto to Buy, BuyFiat to Sell, and passes other values through', () => {
    setContext({
      quotes: [
        { ...QUOTE, id: 1, type: 'BuyCrypto' },
        { ...QUOTE, id: 2, type: 'BuyFiat' },
        { ...QUOTE, id: 3, type: 'Other' },
      ],
    });
    render(<RealunitQuotesScreen />);
    expect(screen.getByText('Buy')).toBeInTheDocument();
    expect(screen.getByText('Sell')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
  });

  it('shows address and userName and the Address header', () => {
    setContext({ quotes: [QUOTE] });
    render(<RealunitQuotesScreen />);
    expect(screen.getByText('Address')).toBeInTheDocument();
    expect(screen.queryByText('User')).not.toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('0xabcde...fabcd')).toBeInTheDocument();
    expect(screen.queryByText('42')).not.toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    fireEvent.click(screen.getByText('0xabcde...fabcd'));
    expect(mockCopy).toHaveBeenCalledWith(QUOTE.userAddress);
    expect(screen.getByText('Copied')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('hides deactivated quotes from the pending list', () => {
    setContext({
      quotes: [
        QUOTE,
        {
          ...QUOTE,
          id: 99,
          amount: 999,
          userId: 99,
          userName: 'Cancelled Person',
          deactivatedAt: '2026-02-02T12:00:00.000Z',
        },
      ],
    });
    render(<RealunitQuotesScreen />);
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.queryByText('Cancelled Person')).not.toBeInTheDocument();
    expect(screen.queryByText('999')).not.toBeInTheDocument();
  });

  it('shows "-" when userAddress and userName are missing', () => {
    setContext({ quotes: [{ ...QUOTE, userAddress: undefined, userName: undefined }] });
    render(<RealunitQuotesScreen />);
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(2);
  });

  it('shows empty copy when the only quotes are deactivated', () => {
    setContext({
      quotes: [{ ...QUOTE, deactivatedAt: '2026-02-02T12:00:00.000Z' }],
      quotesLoading: false,
      quotesError: false,
    });
    render(<RealunitQuotesScreen />);
    expect(screen.getByText('No pending transactions found')).toBeInTheDocument();
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
  });

  it('More button calls fetchQuotes and is disabled while loading', () => {
    setContext({ quotes: [QUOTE], quotesLoading: false });
    const { rerender } = render(<RealunitQuotesScreen />);
    const more = screen.getByRole('button', { name: 'More' });
    fireEvent.click(more);
    expect(mockFetchQuotes).toHaveBeenCalled();

    setContext({ quotes: [QUOTE], quotesLoading: true });
    rerender(<RealunitQuotesScreen />);
    expect(screen.getByRole('button', { name: 'More' })).toBeDisabled();
  });

  it('shows a small spinner when loading with existing quotes', () => {
    setContext({ quotes: [QUOTE], quotesLoading: true });
    render(<RealunitQuotesScreen />);
    expect(screen.getByTestId('loading-spinner')).toHaveAttribute('data-size', 'sm');
  });

  it('fetches quotes on mount when empty, and does not fetch when quotes already exist', () => {
    setContext({ quotes: [] });
    const { unmount } = render(<RealunitQuotesScreen />);
    expect(mockFetchQuotes).toHaveBeenCalled();
    unmount();

    mockFetchQuotes.mockClear();
    setContext({ quotes: [QUOTE] });
    render(<RealunitQuotesScreen />);
    expect(mockFetchQuotes).not.toHaveBeenCalled();
  });
});
