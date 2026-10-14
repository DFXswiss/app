// Unit tests for ComplianceScreen: the database search with its result tables (customers incl.
// the KYC level column, bank transactions), the search hints, the file download, and the dashboard
// sections below the search. Heavy deps are mocked so the screen renders under
// @testing-library/react without the full app shell.

const mockUseComplianceGuard = jest.fn();
const mockNavigate = jest.fn();
let mockSearch = jest.fn();
const mockDownloadUserFiles = jest.fn();
const mockGetPendingReviews = jest.fn();
const mockGetPendingTransactions = jest.fn();
const mockGetCallQueues = jest.fn();
const mockCacheBankTx = jest.fn();
const mockLocation = { search: '' };

jest.mock('@dfx.swiss/react', () => ({
  KycStatus: { NA: 'NA', CHECK: 'Check', REJECTED: 'Rejected', COMPLETED: 'Completed' },
  Utils: {
    // Passthrough that drops undefined field rules, matching the real Utils.createRules.
    createRules: (rules: Record<string, unknown>) => {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(rules)) if (rules[key] !== undefined) out[key] = rules[key];
      return out;
    },
  },
  Validations: {
    Required: { required: { value: true, message: 'required' } },
  },
}));

jest.mock('@dfx.swiss/react-components', () => {
  // babel-plugin-jest-hoist runs this factory before file imports — require React / RHF here.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  const { Children, cloneElement, isValidElement } = React;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Controller } = require('react-hook-form');

  function enrichChildren(children: any, control: any, rules: any): any {
    return Children.map(children, (child: any) => {
      if (!isValidElement(child)) return child;
      const childProps: any = child.props ?? {};
      const nextChildren = enrichChildren(childProps.children, control, rules);
      if (childProps.name) {
        return cloneElement(child, { control, rules: rules?.[childProps.name], children: nextChildren });
      }
      return cloneElement(child, { children: nextChildren });
    });
  }

  function Form({ children, control, rules }: any) {
    return <form>{enrichChildren(children, control, rules)}</form>;
  }

  function StyledInput({ control, name, rules, placeholder }: any) {
    return (
      <Controller
        control={control}
        name={name}
        rules={rules}
        render={({ field: { onChange, value } }: any) => (
          <input placeholder={placeholder} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
        )}
      />
    );
  }

  return {
    Form,
    StyledInput,
    StyledButton: ({ label, onClick, isLoading, disabled }: any) => (
      <button type="button" onClick={onClick} disabled={disabled || isLoading} data-loading={String(!!isLoading)}>
        {label}
      </button>
    ),
    StyledIconButton: ({ icon, onClick, isLoading }: any) => (
      <button type="button" data-testid={`icon-${icon}`} data-loading={String(!!isLoading)} onClick={onClick} />
    ),
    StyledInfoText: ({ children }: any) => <div data-testid="info-text">{children}</div>,
    StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
    IconColor: { BLUE: 'blue', DARK_GRAY: 'dark-gray' },
    IconSize: { SM: 'sm' },
    IconVariant: { FILE: 'file', FORWARD: 'forward', INFO: 'info', INFO_OUTLINE: 'info-outline' },
    StyledButtonWidth: { FULL: 'full' },
  };
});

jest.mock('react-router-dom', () => ({
  useLocation: () => mockLocation,
}));

jest.mock('src/components/compliance/call-queues-section', () => ({
  CallQueuesSection: ({ entries }: { entries: unknown[] }) => <div data-testid="call-queues">{entries.length}</div>,
}));
jest.mock('src/components/compliance/pending-reviews-section', () => ({
  PendingReviewsSection: ({ entries }: { entries: unknown[] }) => (
    <div data-testid="pending-reviews">{entries.length}</div>
  ),
}));
jest.mock('src/components/compliance/pending-transactions-section', () => ({
  PendingTransactionsSection: ({ entries }: { entries: unknown[] }) => (
    <div data-testid="pending-transactions">{entries.length}</div>
  ),
}));
jest.mock('src/components/compliance/quick-links-section', () => ({
  QuickLinksSection: () => <div data-testid="quick-links" />,
}));
jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_ns: string, key: string, params?: Record<string, string | number>) =>
      params ? Object.entries(params).reduce((text, [k, v]) => text.replace(`{{${k}}}`, String(v)), key) : key,
    translateError: (key: string) => key,
  }),
}));

jest.mock('src/hooks/compliance.hook', () => ({
  useCompliance: () => ({
    search: mockSearch,
    downloadUserFiles: mockDownloadUserFiles,
    getPendingReviews: mockGetPendingReviews,
    getPendingTransactions: mockGetPendingTransactions,
    getCallQueues: mockGetCallQueues,
  }),
}));
jest.mock('src/hooks/guard.hook', () => ({
  useComplianceGuard: (...args: unknown[]) => mockUseComplianceGuard(...args),
}));
jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));
jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('src/util/bank-tx-cache', () => ({
  cacheBankTx: (...args: unknown[]) => mockCacheBankTx(...args),
}));

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { BankTxSearchResult, ComplianceSearchResult, UserSearchResult } from 'src/hooks/compliance.hook';
import ComplianceScreen from 'src/screens/compliance.screen';

function user(partial: Partial<UserSearchResult> = {}): UserSearchResult {
  return { id: 2897, kycStatus: 'Completed', accountType: 'Personal', ...partial } as UserSearchResult;
}

function bankTx(partial: Partial<BankTxSearchResult> = {}): BankTxSearchResult {
  return { id: 55, accountServiceRef: 'REF-1', amount: 100, currency: 'CHF', type: 'Credit', ...partial };
}

function result(partial: Partial<ComplianceSearchResult> = {}): ComplianceSearchResult {
  return { type: 'Name', userDatas: [], bankTx: [], ...partial } as ComplianceSearchResult;
}

function rowOf(text: string): HTMLElement {
  const row = screen.getByText(text).closest('tr');
  if (!row) throw new Error(`row "${text}" not found`);
  return row;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Renders the screen and lets the dashboard sections finish loading, so their state updates do
// not land outside act() later in a test.
async function renderScreen(): Promise<void> {
  render(<ComplianceScreen />);
  await waitFor(() => expect(screen.getByTestId('pending-reviews')).toHaveTextContent('1'));
}

async function submitSearch(key: string): Promise<void> {
  fireEvent.change(screen.getByPlaceholderText('example@mail.com'), { target: { value: key } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Search' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  await waitFor(() => expect(mockSearch).toHaveBeenCalled());
}

describe('ComplianceScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocation.search = '';
    mockSearch = jest.fn();
    mockSearch.mockResolvedValue(result());
    mockDownloadUserFiles.mockResolvedValue(undefined);
    mockGetPendingReviews.mockResolvedValue([{ id: 1 }]);
    mockGetPendingTransactions.mockResolvedValue([{ txId: 1 }, { txId: 2 }]);
    mockGetCallQueues.mockResolvedValue([]);
  });

  it('guards the screen, loads the dashboard sections and disables Search until a key is typed', async () => {
    render(<ComplianceScreen />);
    expect(mockUseComplianceGuard).toHaveBeenCalledWith();

    await waitFor(() => expect(screen.getByTestId('pending-reviews')).toHaveTextContent('1'));
    expect(screen.getByTestId('pending-transactions')).toHaveTextContent('2');
    expect(screen.getByTestId('call-queues')).toHaveTextContent('0');
    expect(screen.getByTestId('quick-links')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('shows a dashboard load failure without blocking the search', async () => {
    mockGetCallQueues.mockRejectedValueOnce(new Error('queues down'));
    render(<ComplianceScreen />);
    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('queues down'));
  });

  it('toggles the search hints', async () => {
    await renderScreen();
    expect(screen.queryByTestId('info-text')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('icon-info-outline'));
    expect(screen.getByTestId('info-text')).toHaveTextContent('Blockchain address');

    fireEvent.click(screen.getByTestId('icon-info'));
    expect(screen.queryByTestId('info-text')).not.toBeInTheDocument();
  });

  it('lists customers with the KYC level column and marks Check/Rejected rows', async () => {
    mockSearch.mockResolvedValue(
      result({
        userDatas: [
          user({ id: 2897, kycLevel: 50, name: 'Severin Zahner', mail: 's@example.com', kycStatus: 'Check' }),
          user({ id: 218905, accountType: undefined, kycLevel: undefined, name: undefined, mail: undefined }),
        ],
      }),
    );
    await renderScreen();
    await submitSearch('Zahner');

    expect(mockNavigate).toHaveBeenCalledWith({ search: 'search=Zahner' });
    expect(mockSearch).toHaveBeenCalledWith('Zahner');
    await waitFor(() => expect(screen.getByText('Customers')).toBeInTheDocument());
    expect(screen.getByText('(found by Name)')).toBeInTheDocument();

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['ID', 'Account Type', 'KYC Level', 'Name', 'Email', '']);

    const first = rowOf('Severin Zahner');
    expect(within(first).getByText('50')).toBeInTheDocument();
    expect(within(first).getByText('Personal')).toBeInTheDocument();
    expect(within(first).getByText('s@example.com')).toBeInTheDocument();
    expect(first.className).toContain('bg-dfxRed-100');

    const second = rowOf('218905');
    expect(within(second).getAllByText('-')).toHaveLength(4);
    expect(second.className).not.toContain('bg-dfxRed-100');
  });

  it('navigates to KYC and Details and downloads the user files', async () => {
    mockSearch.mockResolvedValue(result({ userDatas: [user({ id: 7, name: 'Anna' })] }));
    await renderScreen();
    await submitSearch('Anna');
    await waitFor(() => expect(screen.getByText('Anna')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'KYC' }));
    expect(mockNavigate).toHaveBeenCalledWith('compliance/user/7/kyc');
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(mockNavigate).toHaveBeenCalledWith('compliance/user/7');

    let finishDownload: () => void = () => undefined;
    mockDownloadUserFiles.mockImplementationOnce(() => new Promise<void>((resolve) => (finishDownload = resolve)));
    fireEvent.click(screen.getByTestId('icon-file'));
    expect(mockDownloadUserFiles).toHaveBeenCalledWith([7]);
    expect(screen.getByTestId('icon-file')).toHaveAttribute('data-loading', 'true');
    finishDownload();
    await waitFor(() => expect(screen.getByTestId('icon-file')).toHaveAttribute('data-loading', 'false'));

    mockDownloadUserFiles.mockRejectedValueOnce(new Error('download failed'));
    fireEvent.click(screen.getByTestId('icon-file'));
    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('download failed'));
  });

  it('lists bank transactions and opens one through the cache', async () => {
    const tx = bankTx({ id: 55, name: 'Max Muster' });
    mockSearch.mockResolvedValue(result({ type: 'BankRef', bankTx: [tx, bankTx({ id: 56, name: undefined })] }));
    await renderScreen();
    await submitSearch('REF-1');
    await waitFor(() => expect(screen.getByText('Bank Transactions')).toBeInTheDocument());

    expect(screen.queryByText('Customers')).not.toBeInTheDocument();
    expect(within(rowOf('Max Muster')).getByText('100 CHF')).toBeInTheDocument();
    expect(within(rowOf('56')).getByText('-')).toBeInTheDocument();

    fireEvent.click(within(rowOf('Max Muster')).getByTestId('icon-forward'));
    expect(mockCacheBankTx).toHaveBeenCalledWith(tx);
    expect(mockNavigate).toHaveBeenCalledWith('compliance/bank-tx/55');
  });

  it('reports an empty result and a failed search', async () => {
    await renderScreen();
    await submitSearch('nobody');
    await waitFor(() => expect(screen.getByText('No entries found')).toBeInTheDocument());

    mockSearch.mockRejectedValueOnce(new Error('search down'));
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('search down'));
    expect(screen.queryByText('No entries found')).not.toBeInTheDocument();
  });

  it('runs the search from the URL parameter on mount', async () => {
    mockLocation.search = '?search=338759';
    mockSearch.mockResolvedValue(result({ type: 'Id', userDatas: [user({ id: 338759, name: 'Jana' })] }));
    await renderScreen();

    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith('338759'));
    await waitFor(() => expect(screen.getByText('Jana')).toBeInTheDocument());
    expect(screen.getByPlaceholderText('example@mail.com')).toHaveValue('338759');
  });

  it('does not apply a stale search response after a later search', async () => {
    mockLocation.search = '?search=first';
    const first = createDeferred<ComplianceSearchResult>();
    const second = createDeferred<ComplianceSearchResult>();
    mockSearch.mockImplementation((key: string) => (key === 'first' ? first.promise : second.promise));

    const { rerender } = render(<ComplianceScreen />);
    await waitFor(() => expect(screen.getByTestId('pending-reviews')).toHaveTextContent('1'));
    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith('first'));

    mockLocation.search = '?search=second';
    rerender(<ComplianceScreen />);
    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith('second'));

    await act(async () => {
      second.resolve(result({ userDatas: [user({ id: 2, name: 'New Name' })] }));
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText('New Name')).toBeInTheDocument());

    await act(async () => {
      first.resolve(result({ userDatas: [user({ id: 1, name: 'Old Name' })] }));
      await Promise.resolve();
    });

    expect(screen.getByText('New Name')).toBeInTheDocument();
    expect(screen.queryByText('Old Name')).not.toBeInTheDocument();
  });

  it('does not rerun the URL search when the search function identity changes', async () => {
    mockLocation.search = '?search=foo';
    mockSearch.mockResolvedValue(result({ type: 'Name', userDatas: [user({ id: 1, name: 'Fay F' })] }));

    const { rerender } = render(<ComplianceScreen />);
    await waitFor(() => expect(screen.getByTestId('pending-reviews')).toHaveTextContent('1'));
    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith('foo'));
    await waitFor(() => expect(screen.getByText('Fay F')).toBeInTheDocument());
    expect(mockSearch).toHaveBeenCalledTimes(1);

    const originalSearch = mockSearch;
    mockSearch = jest.fn().mockResolvedValue(result({ type: 'Name', userDatas: [user({ id: 1, name: 'Fay F' })] }));
    rerender(<ComplianceScreen />);

    expect(originalSearch).toHaveBeenCalledTimes(1);
    expect(mockSearch).not.toHaveBeenCalled();
    expect(screen.getByText('Fay F')).toBeInTheDocument();
  });
});
