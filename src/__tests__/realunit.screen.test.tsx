const mockNavigate = jest.fn();
const mockCopy = jest.fn();
const mockUseRealunitGuard = jest.fn();
const mockFetchHolders = jest.fn();
const mockFetchPriceHistory = jest.fn();
const mockFetchTokenInfo = jest.fn();
const mockFetchQuotes = jest.fn();
const mockFetchTransactions = jest.fn();

let mockContext: Record<string, unknown>;

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', MD: 'md', LG: 'lg' },
  IconColor: { GRAY: 'gray' },
  StyledLoadingSpinner: ({ size }: { size?: string }) => <div data-testid="loading-spinner" data-size={size} />,
  StyledButton: ({ label, onClick, disabled }: { label: string; onClick?: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {label}
    </button>
  ),
  StyledButtonWidth: { MIN: 'min', FULL: 'full' },
  StyledButtonColor: { STURDY_WHITE: 'sturdy-white' },
  CopyButton: ({ onCopy }: { onCopy?: () => void }) => (
    <button type="button" data-testid="copy-button" onClick={onCopy}>
      copy
    </button>
  ),
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

jest.mock('src/components/realunit/price-history-chart', () => ({
  PriceHistoryChart: ({ onTimeframeChange }: { onTimeframeChange?: () => void }) => (
    <button type="button" data-testid="price-history-chart" onClick={onTimeframeChange}>
      chart
    </button>
  ),
}));

jest.mock('src/hooks/guard.hook', () => ({
  useRealunitGuard: (...args: unknown[]) => mockUseRealunitGuard(...args),
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

jest.mock('src/hooks/clipboard.hook', () => ({
  useClipboard: () => ({ copy: mockCopy }),
}));

jest.mock('src/contexts/realunit.context', () => ({
  useRealunitContext: () => mockContext,
}));

jest.mock('src/util/utils', () => ({
  blankedAddress: (address: string) => address,
  formatSwissDateTimeWithSeconds: (value: string) => value,
}));

import { fireEvent, render, screen } from '@testing-library/react';
import RealunitScreen from 'src/screens/realunit.screen';

const HOLDER = {
  address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
  balance: '10',
  percentage: 1.5,
};

const TOKEN_INFO = {
  totalShares: { total: '1000', timestamp: '2026-01-01T00:00:00.000Z', txHash: '0x1' },
  totalSupply: { value: '2000', timestamp: '2026-01-02T00:00:00.000Z' },
};

const QUOTE = {
  id: 42,
  uid: 'Q42',
  type: 'Buy',
  status: 'WaitingForPayment',
  amount: 250,
  estimatedAmount: 25,
  created: '2026-01-15T10:00:00.000Z',
  userId: 42,
  userName: 'Ada Lovelace',
};

const TX = {
  id: 7,
  uid: 'T7',
  type: 'BuyCrypto',
  amountInChf: 80,
  assets: 'REALU',
  created: '2026-01-16T10:00:00.000Z',
  outputDate: '2026-01-17T10:00:00.000Z',
  userAddress: '0x1234567890abcdef1234567890abcdef12345678',
};

function setContext(overrides: Record<string, unknown> = {}) {
  mockContext = {
    holders: [HOLDER],
    totalCount: 12,
    tokenInfo: TOKEN_INFO,
    isLoading: false,
    priceHistory: [{ timestamp: '2026-01-01T00:00:00.000Z', chf: 1, eur: 1, usd: 1 }],
    priceHistoryError: false,
    timeframe: 'ALL',
    quotes: [QUOTE],
    transactions: [TX],
    quotesLoading: false,
    transactionsLoading: false,
    fetchHolders: mockFetchHolders,
    fetchPriceHistory: mockFetchPriceHistory,
    fetchTokenInfo: mockFetchTokenInfo,
    fetchQuotes: mockFetchQuotes,
    fetchTransactions: mockFetchTransactions,
    ...overrides,
  };
}

describe('RealunitScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setContext();
  });

  it('calls the realunit guard on render', () => {
    render(<RealunitScreen />);
    expect(mockUseRealunitGuard).toHaveBeenCalledWith();
  });

  it('shows a large spinner when holders and tokenInfo are empty', () => {
    setContext({ holders: [], tokenInfo: undefined });
    render(<RealunitScreen />);
    expect(screen.getByTestId('loading-spinner')).toHaveAttribute('data-size', 'lg');
  });

  it('fetches empty collections on mount and skips fetches when data already exists', () => {
    setContext({
      holders: [],
      tokenInfo: TOKEN_INFO,
      priceHistory: [],
      quotes: [],
      transactions: [],
    });
    const { unmount } = render(<RealunitScreen />);
    expect(mockFetchHolders).toHaveBeenCalled();
    expect(mockFetchTokenInfo).not.toHaveBeenCalled();
    expect(mockFetchPriceHistory).toHaveBeenCalled();
    expect(mockFetchQuotes).toHaveBeenCalled();
    expect(mockFetchTransactions).toHaveBeenCalled();
    unmount();

    jest.clearAllMocks();
    setContext();
    render(<RealunitScreen />);
    expect(mockFetchHolders).not.toHaveBeenCalled();
    expect(mockFetchTokenInfo).not.toHaveBeenCalled();
    expect(mockFetchQuotes).not.toHaveBeenCalled();
    expect(mockFetchTransactions).not.toHaveBeenCalled();
  });

  it('shows token overview, totalCount fallback, price-history error, and support/compliance links', () => {
    setContext({ totalCount: undefined, priceHistoryError: true });
    render(<RealunitScreen />);
    expect(screen.getByText('Holders')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('1,000')).toBeInTheDocument();
    expect(screen.getByText(/2,000 REALU/)).toBeInTheDocument();
    expect(screen.getByTestId('error-hint')).toHaveTextContent('Failed to load price history.');
    fireEvent.click(screen.getByRole('button', { name: 'RealUnit Support' }));
    expect(mockNavigate).toHaveBeenCalledWith('/realunit/support');
    fireEvent.click(screen.getByRole('button', { name: 'RealUnit Compliance' }));
    expect(mockNavigate).toHaveBeenCalledWith('/realunit/compliance');
    fireEvent.click(screen.getByTestId('price-history-chart'));
    expect(mockFetchPriceHistory).toHaveBeenCalled();
  });

  it('shows the medium spinner while token info is loading', () => {
    setContext({ isLoading: true, tokenInfo: undefined, holders: [HOLDER] });
    render(<RealunitScreen />);
    expect(screen.getByTestId('loading-spinner')).toHaveAttribute('data-size', 'md');
    expect(screen.queryByText('Overview')).not.toBeInTheDocument();
  });

  it('navigates from a holder address and copies it, and shows More holders', () => {
    setContext({
      holders: [
        HOLDER,
        { address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', balance: '2', percentage: 0.2 },
        { address: '0xcccccccccccccccccccccccccccccccccccccccc', balance: '3', percentage: 0.3 },
        { address: '0xdddddddddddddddddddddddddddddddddddddddd', balance: '4', percentage: 0.4 },
      ],
    });
    render(<RealunitScreen />);
    const holderButton = screen.getAllByRole('button').find((b) => b.textContent?.includes('0xabcd'));
    if (!holderButton) {
      throw new Error('holder address button missing');
    }
    fireEvent.click(holderButton);
    expect(mockNavigate).toHaveBeenCalledWith(`/realunit/user/${encodeURIComponent(HOLDER.address)}`);
    fireEvent.click(screen.getAllByTestId('copy-button')[0]);
    expect(mockCopy).toHaveBeenCalledWith(HOLDER.address);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(mockNavigate).toHaveBeenCalledWith('/realunit/holders');
  });

  it('shows userId and userName on pending quotes and hides deactivated ones', () => {
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
    render(<RealunitScreen />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.queryByText('Cancelled Person')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Ada Lovelace'));
    expect(mockNavigate).toHaveBeenCalledWith('/realunit/quotes/42');
  });

  it('shows dashes when pending quote userId and userName are missing', () => {
    setContext({ quotes: [{ ...QUOTE, userId: undefined, userName: undefined, amount: undefined }] });
    render(<RealunitScreen />);
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(2);
  });

  it('shows empty pending copy and a small spinner while quotes load', () => {
    setContext({ quotes: [], quotesLoading: true });
    render(<RealunitScreen />);
    expect(screen.getByTestId('loading-spinner')).toHaveAttribute('data-size', 'sm');
  });

  it('shows empty pending copy when only deactivated quotes exist', () => {
    setContext({
      quotes: [{ ...QUOTE, deactivatedAt: '2026-02-02T12:00:00.000Z' }],
      quotesLoading: false,
    });
    render(<RealunitScreen />);
    expect(screen.getByText('No pending transactions found')).toBeInTheDocument();
  });

  it('navigates to the full quotes list when more than three pending quotes exist', () => {
    setContext({
      quotes: [
        { ...QUOTE, id: 1, userId: 1, userName: 'A' },
        { ...QUOTE, id: 2, userId: 2, userName: 'B' },
        { ...QUOTE, id: 3, userId: 3, userName: 'C' },
        { ...QUOTE, id: 4, userId: 4, userName: 'D' },
      ],
    });
    render(<RealunitScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(mockNavigate).toHaveBeenCalledWith('/realunit/quotes');
  });

  it('maps received transaction types, falls back to created date, and navigates to detail', () => {
    setContext({
      quotes: [],
      transactions: [
        { ...TX, id: 1, type: 'BuyFiat', userAddress: undefined, amountInChf: undefined, outputDate: undefined },
        { ...TX, id: 2, type: 'Other' },
      ],
    });
    render(<RealunitScreen />);
    expect(screen.getByText('Sell')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
    expect(screen.getByText('-')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Other'));
    expect(mockNavigate).toHaveBeenCalledWith('/realunit/transactions/2');
  });

  it('shows empty received copy and a small spinner while transactions load', () => {
    setContext({ transactions: [], transactionsLoading: true, quotes: [QUOTE] });
    render(<RealunitScreen />);
    expect(screen.getByTestId('loading-spinner')).toHaveAttribute('data-size', 'sm');
  });

  it('shows empty received copy when there are no transactions', () => {
    setContext({ transactions: [], transactionsLoading: false });
    render(<RealunitScreen />);
    expect(screen.getByText('No received transactions found')).toBeInTheDocument();
  });

  it('navigates to the full transactions list when more than three exist', () => {
    setContext({
      quotes: [],
      transactions: [
        { ...TX, id: 1 },
        { ...TX, id: 2 },
        { ...TX, id: 3 },
        { ...TX, id: 4 },
      ],
    });
    render(<RealunitScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(mockNavigate).toHaveBeenCalledWith('/realunit/transactions');
  });

  it('maps pending quote displayType BuyCrypto, BuyFiat and passthrough', () => {
    setContext({
      quotes: [
        { ...QUOTE, id: 1, type: 'BuyCrypto', userId: 1, userName: 'One' },
        { ...QUOTE, id: 2, type: 'BuyFiat', userId: 2, userName: 'Two' },
        { ...QUOTE, id: 3, type: 'Swap', userId: 3, userName: 'Three' },
      ],
      transactions: [],
    });
    render(<RealunitScreen />);
    expect(screen.getByText('Buy')).toBeInTheDocument();
    expect(screen.getByText('Sell')).toBeInTheDocument();
    expect(screen.getByText('Swap')).toBeInTheDocument();
  });

  it('fetches tokenInfo on mount when it is missing and holders already exist', () => {
    setContext({ tokenInfo: undefined, holders: [HOLDER], isLoading: false });
    render(<RealunitScreen />);
    expect(mockFetchTokenInfo).toHaveBeenCalled();
  });
});
