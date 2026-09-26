const mockNavigate = jest.fn();
const mockCopy = jest.fn();
const mockUseRealunitGuard = jest.fn();
const mockFetchHolders = jest.fn();
const mockFetchPriceHistory = jest.fn();
const mockFetchTokenInfo = jest.fn();
const mockFetchQuotes = jest.fn();
const mockFetchTransactions = jest.fn();
const mockFetchBuyVolume = jest.fn();
const mockFetchHolderCount = jest.fn();
const mockFetchRegistrationStats = jest.fn();

let mockContext: Record<string, unknown>;

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', MD: 'md', LG: 'lg' },
  IconColor: { GRAY: 'gray' },
  StyledLoadingSpinner: ({ size }: { size?: string }) => <div data-testid="loading-spinner" data-size={size} />,
  CopyButton: ({ onCopy }: { onCopy?: () => void }) => (
    <button type="button" data-testid="copy-button" onClick={onCopy}>
      copy
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

jest.mock('src/components/realunit/payouts-panel', () => ({
  PayoutsPanel: () => <div data-testid="payouts-panel" />,
}));

jest.mock('src/util/utils', () => ({
  blankedAddress: (address: string) => address,
  formatSwissDateTimeWithSeconds: (value: string) => value,
}));

import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  userAddress: '0x1234567890abcdef1234567890abcdef12345678',
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

function renderScreen() {
  return render(<RealunitScreen />);
}

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
    buyVolume: [],
    buyVolumeLoading: false,
    buyVolumeError: false,
    holderCount: [],
    holderCountLoading: false,
    holderCountError: false,
    registrationStats: undefined,
    registrationLoading: false,
    registrationError: false,
    fetchBuyVolume: mockFetchBuyVolume,
    fetchHolderCount: mockFetchHolderCount,
    fetchRegistrationStats: mockFetchRegistrationStats,
    buyVolumeTimeframe: 'All',
    holderCountTimeframe: 'All',
    registrationTimeframe: 'All',
    ...overrides,
  };
}

describe('RealunitScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setContext();
  });

  it('calls the realunit guard on render and shows referral and bonus payouts', () => {
    renderScreen();
    expect(mockUseRealunitGuard).toHaveBeenCalledWith();
    expect(screen.getByTestId('payouts-panel')).toBeInTheDocument();
  });

  it('shows a large spinner when holders and tokenInfo are empty', () => {
    setContext({ holders: [], tokenInfo: undefined });
    renderScreen();
    expect(screen.getByTestId('loading-spinner')).toHaveAttribute('data-size', 'lg');
  });

  it('fetches empty collections on mount and skips fetches when data already exists', async () => {
    setContext({
      holders: [],
      tokenInfo: TOKEN_INFO,
      priceHistory: [],
      quotes: [],
      transactions: [],
    });
    const { unmount } = renderScreen();
    await waitFor(() => expect(mockFetchHolders).toHaveBeenCalled());
    expect(mockFetchTokenInfo).not.toHaveBeenCalled();
    expect(mockFetchPriceHistory).not.toHaveBeenCalled();
    expect(mockFetchQuotes).toHaveBeenCalled();
    expect(mockFetchTransactions).toHaveBeenCalled();
    expect(mockFetchBuyVolume).not.toHaveBeenCalled();
    expect(mockFetchHolderCount).not.toHaveBeenCalled();
    expect(mockFetchRegistrationStats).not.toHaveBeenCalled();
    unmount();

    jest.clearAllMocks();
    setContext();
    renderScreen();
    expect(mockFetchHolders).not.toHaveBeenCalled();
    expect(mockFetchTokenInfo).not.toHaveBeenCalled();
    expect(mockFetchQuotes).not.toHaveBeenCalled();
    expect(mockFetchTransactions).not.toHaveBeenCalled();
    expect(mockFetchPriceHistory).not.toHaveBeenCalled();
    expect(mockFetchBuyVolume).not.toHaveBeenCalled();
    expect(mockFetchHolderCount).not.toHaveBeenCalled();
    expect(mockFetchRegistrationStats).not.toHaveBeenCalled();
  });

  it('bootstraps lists only once when StrictMode re-invokes effects', async () => {
    setContext({
      holders: [],
      tokenInfo: undefined,
      priceHistory: [],
      quotes: [],
      transactions: [],
    });
    render(
      <StrictMode>
        <RealunitScreen />
      </StrictMode>,
    );
    await waitFor(() => expect(mockFetchHolders).toHaveBeenCalledTimes(1));
    expect(mockFetchTokenInfo).toHaveBeenCalledTimes(1);
    expect(mockFetchQuotes).toHaveBeenCalledTimes(1);
    expect(mockFetchTransactions).toHaveBeenCalledTimes(1);
    expect(mockFetchPriceHistory).not.toHaveBeenCalled();
    expect(mockFetchBuyVolume).not.toHaveBeenCalled();
    expect(mockFetchHolderCount).not.toHaveBeenCalled();
    expect(mockFetchRegistrationStats).not.toHaveBeenCalled();
  });

  it('shows token overview, totalCount fallback and timestamp', () => {
    setContext({ totalCount: undefined });
    renderScreen();
    expect(screen.getByText('Holders')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('1,000')).toBeInTheDocument();
    expect(screen.getByText(/2,000 REALU/)).toBeInTheDocument();
    expect(screen.getByText('2026-01-02T00:00:00.000Z')).toBeInTheDocument();
  });

  it('shows the medium spinner while token info is loading', () => {
    setContext({ isLoading: true, tokenInfo: undefined, holders: [HOLDER] });
    renderScreen();
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
    renderScreen();
    const holderButton = screen.getAllByRole('button').find((b) => b.textContent?.includes('0xabcd'));
    if (!holderButton) {
      throw new Error('holder address button missing');
    }
    fireEvent.click(holderButton);
    expect(mockNavigate).toHaveBeenCalledWith(`/realunit/user/${encodeURIComponent(HOLDER.address)}`);
    const holderRow = holderButton.closest('tr');
    if (!holderRow) {
      throw new Error('holder row missing');
    }
    fireEvent.click(within(holderRow).getByTestId('copy-button'));
    expect(mockCopy).toHaveBeenCalledWith(HOLDER.address);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(mockNavigate).toHaveBeenCalledWith('/realunit/holders');
  });

  it('shows address and userName on pending quotes and hides deactivated ones', () => {
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
    renderScreen();
    expect(screen.getAllByText('Address').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('User')).not.toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getAllByText(QUOTE.userAddress as string).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('42')).not.toBeInTheDocument();
    expect(screen.queryByText('Cancelled Person')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByText(QUOTE.userAddress as string)[0]);
    expect(mockCopy).toHaveBeenCalledWith(QUOTE.userAddress);
    expect(screen.getByText('Copied')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Ada Lovelace'));
    expect(mockNavigate).toHaveBeenCalledWith('/realunit/quotes/42');
  });

  it('shows dashes when pending quote userAddress and userName are missing', () => {
    setContext({ quotes: [{ ...QUOTE, userAddress: undefined, userName: undefined, amount: undefined }] });
    renderScreen();
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(2);
  });

  it('shows empty pending copy and a small spinner while quotes load', () => {
    setContext({ quotes: [], quotesLoading: true });
    renderScreen();
    expect(screen.getByTestId('loading-spinner')).toHaveAttribute('data-size', 'sm');
  });

  it('shows empty pending copy when only deactivated quotes exist', () => {
    setContext({
      quotes: [{ ...QUOTE, deactivatedAt: '2026-02-02T12:00:00.000Z' }],
      quotesLoading: false,
    });
    renderScreen();
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
    renderScreen();
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
    renderScreen();
    expect(screen.getByText('Sell')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
    expect(screen.getByText('-')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Other'));
    expect(mockNavigate).toHaveBeenCalledWith('/realunit/transactions/2');
  });

  it('shows empty received copy and a small spinner while transactions load', () => {
    setContext({ transactions: [], transactionsLoading: true, quotes: [QUOTE] });
    renderScreen();
    expect(screen.getByTestId('loading-spinner')).toHaveAttribute('data-size', 'sm');
  });

  it('shows empty received copy when there are no transactions', () => {
    setContext({ transactions: [], transactionsLoading: false });
    renderScreen();
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
    renderScreen();
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
    renderScreen();
    expect(screen.getByText('Buy')).toBeInTheDocument();
    expect(screen.getByText('Sell')).toBeInTheDocument();
    expect(screen.getByText('Swap')).toBeInTheDocument();
  });

  it('fetches tokenInfo on mount when it is missing and holders already exist', async () => {
    setContext({ tokenInfo: undefined, holders: [HOLDER], isLoading: false });
    renderScreen();
    await waitFor(() => expect(mockFetchTokenInfo).toHaveBeenCalled());
  });
});
