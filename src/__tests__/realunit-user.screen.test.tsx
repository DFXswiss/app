const mockCopy = jest.fn();
const mockUseRealunitGuard = jest.fn();
const mockFetchAccountSummary = jest.fn();
const mockFetchAccountHistory = jest.fn();
const mockFetchTokenPrice = jest.fn();
let mockContext: Record<string, any>;
let mockRouteAddress: string | undefined = '0xaccount';

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', LG: 'lg' },
  IconColor: { GRAY: 'gray' },
  StyledButtonWidth: { MIN: 'min' },
  StyledLoadingSpinner: ({ size }: { size?: string }) => <div data-testid="loading-spinner" data-size={size} />,
  StyledButton: ({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled}>{label}</button>
  ),
  CopyButton: ({ onCopy }: { onCopy?: () => void }) => <button type="button" onClick={onCopy}>Copy</button>,
}));
jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <p role="alert">{message}</p>,
}));
jest.mock('src/components/realunit/balance-chart', () => {
  const actual = jest.requireActual('src/components/realunit/balance-chart');
  return { ...actual, BalanceChart: () => <div data-testid="balance-chart" /> };
});
jest.mock('src/components/safe/button-group', () => ({
  ButtonGroupSize: { SM: 'sm' },
  ButtonGroup: ({ items, buttonLabel, onClick }: { items: string[]; buttonLabel: (item: string) => string; onClick: (item: string) => void }) => (
    <div>{items.map((item) => <button key={item} type="button" onClick={() => onClick(item)}>{buttonLabel(item)}</button>)}</div>
  ),
}));
jest.mock('src/hooks/guard.hook', () => ({ useRealunitGuard: (...args: unknown[]) => mockUseRealunitGuard(...args) }));
jest.mock('src/contexts/settings.context', () => ({ useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }) }));
jest.mock('src/hooks/layout-config.hook', () => ({ useLayoutOptions: () => undefined }));
jest.mock('src/hooks/clipboard.hook', () => ({ useClipboard: () => ({ copy: mockCopy }) }));
jest.mock('src/contexts/realunit.context', () => ({ useRealunitContext: () => mockContext }));
jest.mock('src/util/utils', () => ({
  blankedAddress: (address: string) => address,
  formatCurrency: (value: number) => value.toFixed(2),
  formatSwissDateTimeWithSeconds: (value: string) => value,
}));
jest.mock('react-router-dom', () => ({ useParams: () => ({ address: mockRouteAddress }) }));

import { fireEvent, render, screen, within } from '@testing-library/react';
import RealunitUserScreen from 'src/screens/realunit-user.screen';
import { PaginationDirection } from 'src/dto/realunit.dto';

const SUMMARY = {
  address: '0xaccount',
  addressType: 2,
  balance: '42.5',
  lastUpdated: '2026-09-01T00:00:00.000Z',
  historicalBalances: [{ balance: '40', timestamp: '2026-08-01T00:00:00.000Z', valueChf: 50 }],
};
const EMPTY_PAGE = { startCursor: 'start', endCursor: 'end', hasPreviousPage: true, hasNextPage: true };

function setContext(overrides: Record<string, unknown> = {}) {
  mockContext = {
    accountSummary: SUMMARY,
    history: { address: '0xaccount', addressType: 2, history: [], totalCount: 0, pageInfo: EMPTY_PAGE },
    isLoading: false,
    accountSummaryError: false,
    historyLoading: false,
    historyError: false,
    tokenPrice: { timestamp: 't', chf: 2, eur: 2, usd: 2 },
    tokenPriceLoading: false,
    tokenPriceError: false,
    fetchAccountSummary: mockFetchAccountSummary,
    fetchAccountHistory: mockFetchAccountHistory,
    fetchTokenPrice: mockFetchTokenPrice,
    ...overrides,
  };
}

describe('RealunitUserScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteAddress = '0xaccount';
    setContext();
  });

  it('guards the screen and requests token price, account summary, and history for the route address', () => {
    render(<RealunitUserScreen />);
    expect(mockUseRealunitGuard).toHaveBeenCalled();
    expect(mockFetchTokenPrice).toHaveBeenCalledTimes(1);
    expect(mockFetchAccountSummary).toHaveBeenCalledWith('0xaccount');
    expect(mockFetchAccountHistory).toHaveBeenCalledWith('0xaccount');
  });

  it('does not request account resources or paginate without a route address', () => {
    mockRouteAddress = undefined;
    setContext({
      history: {
        address: '0xaccount',
        addressType: 2,
        history: [{ timestamp: 't', eventType: 'Transfer', txHash: '' }],
        totalCount: 1,
        pageInfo: EMPTY_PAGE,
      },
    });
    render(<RealunitUserScreen />);
    expect(mockFetchTokenPrice).toHaveBeenCalledTimes(1);
    expect(mockFetchAccountSummary).not.toHaveBeenCalled();
    expect(mockFetchAccountHistory).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(mockFetchAccountHistory).not.toHaveBeenCalled();
  });

  it('shows the account loading state and the no-data result after a successful empty lookup', () => {
    setContext({ accountSummary: undefined, isLoading: true });
    const { rerender } = render(<RealunitUserScreen />);
    expect(screen.getByTestId('loading-spinner')).toHaveAttribute('data-size', 'lg');
    setContext({ accountSummary: undefined, isLoading: false, accountSummaryError: false });
    rerender(<RealunitUserScreen />);
    expect(screen.getByText('No data available')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows account and history failures as errors and retries each failed request', () => {
    setContext({
      accountSummary: undefined,
      history: undefined,
      isLoading: false,
      accountSummaryError: true,
      historyError: true,
      tokenPrice: undefined,
      tokenPriceError: true,
    });
    render(<RealunitUserScreen />);
    expect(screen.getByText('Failed to load account summary.')).toBeInTheDocument();
    expect(screen.getByText('Failed to load transaction history.')).toBeInTheDocument();
    expect(screen.getByText('Failed to load token price.')).toBeInTheDocument();
    expect(screen.queryByText('No data available')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Retry' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Retry' })[1]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Retry' })[2]);
    expect(mockFetchAccountSummary).toHaveBeenCalledWith('0xaccount');
    expect(mockFetchAccountHistory).toHaveBeenCalledWith('0xaccount');
    expect(mockFetchTokenPrice).toHaveBeenCalled();
  });

  it('renders account details and balance history, including the REALU balance and copy action', () => {
    render(<RealunitUserScreen />);
    expect(screen.getByRole('heading', { name: 'Account Details' })).toBeInTheDocument();
    expect(screen.getByText('0xaccount')).toBeInTheDocument();
    const accountDetails = screen.getAllByRole('table')[0];
    expect(within(accountDetails).getByText(/42\.5/)).toBeInTheDocument();
    expect(screen.getByTestId('balance-chart')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Copy' })[0]);
    expect(mockCopy).toHaveBeenCalledWith('0xaccount');
  });

  it('shows token-price loading and error states without displaying a false zero CHF balance', () => {
    setContext({ tokenPrice: undefined, tokenPriceLoading: true, tokenPriceError: false });
    const { unmount } = render(<RealunitUserScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'CHF' }));
    expect(screen.getByTestId('loading-spinner')).toHaveAttribute('data-size', 'sm');

    unmount();
    setContext({ tokenPrice: undefined, tokenPriceLoading: false, tokenPriceError: true });
    const { rerender } = render(<RealunitUserScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'CHF' }));
    rerender(<RealunitUserScreen />);
    expect(screen.getByText('Failed to load token price.')).toBeInTheDocument();
    expect(screen.queryByText('0.00')).not.toBeInTheDocument();
    const priceError = screen.getByText('Failed to load token price.');
    const chart = screen.getByTestId('balance-chart');
    expect(chart.parentElement).toHaveClass('relative', 'mt-4');
    expect(priceError.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mockFetchTokenPrice).toHaveBeenCalled();
  });

  it('does not substitute a zero CHF balance while the price is unavailable without an error', () => {
    setContext({ tokenPrice: undefined, tokenPriceLoading: false, tokenPriceError: false });
    render(<RealunitUserScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'CHF' }));
    expect(screen.getAllByText('CHF', { exact: true })).toHaveLength(2);
    expect(screen.queryByText('0.00')).not.toBeInTheDocument();
  });

  it('converts the balance to CHF when a token price is available', () => {
    render(<RealunitUserScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'CHF' }));
    expect(screen.getByText('85.00')).toBeInTheDocument();
  });

  it('hides the chart and metric controls when history balances are absent', () => {
    setContext({ accountSummary: { ...SUMMARY, historicalBalances: undefined } });
    render(<RealunitUserScreen />);
    expect(screen.queryByTestId('balance-chart')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'CHF' })).not.toBeInTheDocument();
  });

  it('shows history loading, rejection, successful empty results, and retries failures', () => {
    setContext({ history: undefined, historyLoading: true });
    const { rerender } = render(<RealunitUserScreen />);
    expect(screen.getByTestId('loading-spinner')).toHaveAttribute('data-size', 'lg');

    setContext({ history: undefined, historyLoading: false, historyError: true });
    rerender(<RealunitUserScreen />);
    expect(screen.getByText('Failed to load transaction history.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mockFetchAccountHistory).toHaveBeenCalledWith('0xaccount');

    setContext({ history: { address: '0xaccount', addressType: 2, history: [], totalCount: 0, pageInfo: EMPTY_PAGE } });
    rerender(<RealunitUserScreen />);
    expect(screen.getByText('Transaction History (0)')).toBeInTheDocument();
    expect(screen.getByText('No transactions found')).toBeInTheDocument();
  });

  it('uses the zero history-count fallback when a response omits its count', () => {
    setContext({
      history: {
        address: '0xaccount',
        addressType: 2,
        history: [{ timestamp: 't', eventType: 'Transfer', txHash: '' }],
        totalCount: undefined,
        pageInfo: EMPTY_PAGE,
      },
    });
    render(<RealunitUserScreen />);
    expect(screen.getByText('Transaction History (0)')).toBeInTheDocument();
    expect(screen.getByText('Transfer')).toBeInTheDocument();
  });

  it('shows the pagination spinner while retaining the previous history page in context', () => {
    setContext({ historyLoading: true });
    render(<RealunitUserScreen />);
    expect(screen.getByText('Transaction History (0)')).toBeInTheDocument();
    expect(screen.getByTestId('loading-spinner')).toHaveAttribute('data-size', 'lg');
    expect(screen.queryByText('No transactions found')).not.toBeInTheDocument();
  });

  it('omits transaction history only when no result, load, or error state exists', () => {
    setContext({ history: undefined, historyLoading: false, historyError: false });
    render(<RealunitUserScreen />);
    expect(screen.queryByText('Transaction History')).not.toBeInTheDocument();
  });

  it('renders transaction event variants, copies addresses, and paginates', () => {
    const transfer = {
      timestamp: '2026-09-01T00:00:00.000Z', eventType: 'Transfer', txHash: '0xtx',
      transfer: { from: '0xfrom', to: '0xto', value: '3.5' },
    };
    const approval = {
      timestamp: '2026-09-02T00:00:00.000Z', eventType: 'Approval', txHash: '',
      approval: { spender: '0xspender', value: '4' },
    };
    const other = {
      timestamp: '2026-09-03T00:00:00.000Z', eventType: 'Update', txHash: '0xother',
      tokensDeclaredInvalid: { amount: '5', message: 'invalid' }, addressTypeUpdate: { addressType: 'Contract' },
    };
    const bare = { timestamp: '2026-09-04T00:00:00.000Z', eventType: 'Other', txHash: '' };
    const missingTransferAddresses = {
      timestamp: '2026-09-05T00:00:00.000Z',
      eventType: 'Transfer',
      txHash: '',
      transfer: { from: undefined, to: undefined, value: '0' },
    };
    const missingApprovalSpender = {
      timestamp: '2026-09-06T00:00:00.000Z',
      eventType: 'Approval',
      txHash: '',
      approval: { spender: undefined, value: '0' },
    };
    setContext({
      history: {
        address: '0xaccount',
        addressType: 2,
        history: [transfer, approval, other, bare, missingTransferAddresses, missingApprovalSpender],
        totalCount: 6,
        pageInfo: EMPTY_PAGE,
      },
    });
    render(<RealunitUserScreen />);
    expect(screen.getByText('Transaction History (6)')).toBeInTheDocument();
    expect(screen.getAllByText('Transfer')).toHaveLength(2);
    expect(screen.getByText('3.50')).toBeInTheDocument();
    expect(screen.getByText(/Amount: 5Type: Contract/)).toBeInTheDocument();
    const historyTable = screen.getAllByRole('table')[1];
    const bareEventRow = within(historyTable).getByRole('row', { name: /Other/ });
    expect(within(bareEventRow).getByText('-', { exact: true })).toBeInTheDocument();
    const transactionTable = historyTable;
    fireEvent.click(within(transactionTable).getAllByRole('button', { name: 'Copy' })[0]);
    expect(mockCopy).toHaveBeenNthCalledWith(1, '0xfrom');
    fireEvent.click(within(transactionTable).getAllByRole('button', { name: 'Copy' })[1]);
    expect(mockCopy).toHaveBeenNthCalledWith(2, '0xto');
    fireEvent.click(within(transactionTable).getAllByRole('button', { name: 'Copy' })[2]);
    expect(mockCopy).toHaveBeenNthCalledWith(3, '0xtx');
    fireEvent.click(within(transactionTable).getAllByRole('button', { name: 'Copy' })[3]);
    expect(mockCopy).toHaveBeenNthCalledWith(4, '0xspender');
    fireEvent.click(within(transactionTable).getAllByRole('button', { name: 'Copy' })[4]);
    expect(mockCopy).toHaveBeenNthCalledWith(5, '0xother');
    fireEvent.click(within(transactionTable).getAllByRole('button', { name: 'Copy' })[5]);
    expect(mockCopy).toHaveBeenNthCalledWith(6, '');
    fireEvent.click(within(transactionTable).getAllByRole('button', { name: 'Copy' })[6]);
    expect(mockCopy).toHaveBeenNthCalledWith(7, '');
    fireEvent.click(within(transactionTable).getAllByRole('button', { name: 'Copy' })[7]);
    expect(mockCopy).toHaveBeenNthCalledWith(8, '');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(mockFetchAccountHistory).toHaveBeenLastCalledWith('0xaccount', 'end', PaginationDirection.NEXT);
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(mockFetchAccountHistory).toHaveBeenLastCalledWith('0xaccount', 'start', PaginationDirection.PREV);
  });

  it('disables history pagination when no earlier or later page exists', () => {
    setContext({ history: { address: '0xaccount', addressType: 2, history: [{ timestamp: 't', eventType: 'Other' }], totalCount: 1, pageInfo: { ...EMPTY_PAGE, hasPreviousPage: false, hasNextPage: false } } });
    render(<RealunitUserScreen />);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });
});
