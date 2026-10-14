// Screen tests for ComplianceScreen when opened with a tag query parameter: the hidden tag list
// loads matching customers into the existing table, stays idle without a tag, and yields to a
// search parameter when both are present.

const mockUseComplianceGuard = jest.fn();
const mockNavigate = jest.fn();
const mockSearch = jest.fn();
let mockGetTaggedUsers = jest.fn();
const mockDownloadUserFiles = jest.fn();
const mockGetPendingReviews = jest.fn();
const mockGetPendingTransactions = jest.fn();
const mockGetCallQueues = jest.fn();
const mockLocation = { search: '' };

jest.mock('@dfx.swiss/react', () => ({
  KycStatus: { NA: 'NA', CHECK: 'Check', REJECTED: 'Rejected', COMPLETED: 'Completed' },
  Utils: {
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
    getTaggedUsers: mockGetTaggedUsers,
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
  cacheBankTx: jest.fn(),
}));

import { act, render, screen, waitFor } from '@testing-library/react';
import type { ComplianceSearchResult, UserSearchResult } from 'src/hooks/compliance.hook';
import ComplianceScreen from 'src/screens/compliance.screen';

function user(partial: Partial<UserSearchResult> = {}): UserSearchResult {
  return { id: 1, kycStatus: 'Completed', ...partial } as UserSearchResult;
}

function result(partial: Partial<ComplianceSearchResult> = {}): ComplianceSearchResult {
  return { type: 'Tag', userDatas: [], bankTx: [], ...partial } as ComplianceSearchResult;
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

async function renderScreen() {
  const view = render(<ComplianceScreen />);
  await waitFor(() => expect(screen.getByTestId('pending-reviews')).toHaveTextContent('1'));
  return view;
}

describe('ComplianceScreen tag list', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocation.search = '';
    mockSearch.mockResolvedValue(result({ type: 'Name' }));
    mockGetTaggedUsers = jest.fn();
    mockGetTaggedUsers.mockResolvedValue(result());
    mockDownloadUserFiles.mockResolvedValue(undefined);
    mockGetPendingReviews.mockResolvedValue([{ id: 1 }]);
    mockGetPendingTransactions.mockResolvedValue([]);
    mockGetCallQueues.mockResolvedValue([]);
  });

  it('loads tagged users from the tag query parameter into the customers table', async () => {
    mockLocation.search = '?tag=abc';
    mockGetTaggedUsers.mockResolvedValue(
      result({
        userDatas: [
          user({ id: 1, name: 'Ada', mail: 'ada@example.com' }),
          user({ id: 2, name: 'Ben', mail: 'ben@example.com' }),
        ],
      }),
    );

    await renderScreen();

    await waitFor(() => expect(mockGetTaggedUsers).toHaveBeenCalledTimes(1));
    expect(mockGetTaggedUsers).toHaveBeenCalledWith('abc');
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByText('Ben')).toBeInTheDocument();
    expect(screen.getByText('ben@example.com')).toBeInTheDocument();
  });

  it('does not load tagged users without a tag query parameter', async () => {
    await renderScreen();

    expect(mockGetTaggedUsers).not.toHaveBeenCalled();
  });

  it('lets a search query parameter take precedence over a tag', async () => {
    mockLocation.search = '?search=foo&tag=abc';
    mockSearch.mockResolvedValue(result({ type: 'Name', userDatas: [user({ id: 9, name: 'Fay' })] }));

    await renderScreen();

    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith('foo'));
    expect(mockGetTaggedUsers).not.toHaveBeenCalled();
  });

  it('shows the error when tagged users cannot be loaded', async () => {
    mockLocation.search = '?tag=abc';
    mockGetTaggedUsers.mockRejectedValue(new Error('Tag not found'));

    await renderScreen();

    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('Tag not found'));
  });

  it('does not apply a stale tagged-users response after the tag query changes', async () => {
    mockLocation.search = '?tag=a';
    const deferred = createDeferred<ComplianceSearchResult>();
    mockGetTaggedUsers.mockImplementation((tag: string) => {
      if (tag === 'a') return deferred.promise;
      return Promise.resolve(result({ userDatas: [user({ id: 2, name: 'Bea B' })] }));
    });

    const { rerender } = await renderScreen();
    await waitFor(() => expect(mockGetTaggedUsers).toHaveBeenCalledWith('a'));

    mockLocation.search = '?tag=b';
    rerender(<ComplianceScreen />);

    await waitFor(() => expect(screen.getByText('Bea B')).toBeInTheDocument());

    await act(async () => {
      deferred.resolve(result({ userDatas: [user({ id: 1, name: 'Al A' })] }));
      await Promise.resolve();
    });

    expect(screen.getByText('Bea B')).toBeInTheDocument();
    expect(screen.queryByText('Al A')).not.toBeInTheDocument();
  });

  it('does not apply a late tagged-users error after a search query takes over', async () => {
    mockLocation.search = '?tag=a';
    const deferred = createDeferred<ComplianceSearchResult>();
    mockGetTaggedUsers.mockReturnValue(deferred.promise);
    mockSearch.mockResolvedValue(result({ type: 'Name', userDatas: [user({ id: 8, name: 'Sam S' })] }));

    const { rerender } = await renderScreen();
    await waitFor(() => expect(mockGetTaggedUsers).toHaveBeenCalledWith('a'));

    mockLocation.search = '?search=foo&tag=a';
    rerender(<ComplianceScreen />);

    await waitFor(() => expect(screen.getByText('Sam S')).toBeInTheDocument());

    await act(async () => {
      deferred.reject(new Error('late'));
      await Promise.resolve();
    });

    expect(screen.queryByText('late')).not.toBeInTheDocument();
    expect(screen.getByText('Sam S')).toBeInTheDocument();
  });

  it('loads tagged users when a search query is removed and the tag stays', async () => {
    mockLocation.search = '?search=foo&tag=abc';
    const deferredSearch = createDeferred<ComplianceSearchResult>();
    mockSearch.mockReturnValue(deferredSearch.promise);
    mockGetTaggedUsers.mockResolvedValue(result({ userDatas: [user({ id: 2, name: 'Tia T' })] }));

    const { rerender } = await renderScreen();
    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith('foo'));
    expect(mockGetTaggedUsers).not.toHaveBeenCalled();

    mockLocation.search = '?tag=abc';
    rerender(<ComplianceScreen />);

    await waitFor(() => expect(mockGetTaggedUsers).toHaveBeenCalledTimes(1));
    expect(mockGetTaggedUsers).toHaveBeenCalledWith('abc');
    await waitFor(() => expect(screen.getByText('Tia T')).toBeInTheDocument());

    await act(async () => {
      deferredSearch.resolve(result({ type: 'Name', userDatas: [user({ id: 9, name: 'Sam S' })] }));
      await Promise.resolve();
    });

    expect(screen.getByText('Tia T')).toBeInTheDocument();
    expect(screen.queryByText('Sam S')).not.toBeInTheDocument();
  });

  it('does not apply a late search error after the search query is removed and the tag stays', async () => {
    mockLocation.search = '?search=foo&tag=abc';
    const deferredSearch = createDeferred<ComplianceSearchResult>();
    mockSearch.mockReturnValue(deferredSearch.promise);
    mockGetTaggedUsers.mockResolvedValue(result({ userDatas: [user({ id: 2, name: 'Tia T' })] }));

    const { rerender } = await renderScreen();
    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith('foo'));
    expect(mockGetTaggedUsers).not.toHaveBeenCalled();

    mockLocation.search = '?tag=abc';
    rerender(<ComplianceScreen />);

    await waitFor(() => expect(screen.getByText('Tia T')).toBeInTheDocument());

    await act(async () => {
      deferredSearch.reject(new Error('late search'));
      await Promise.resolve();
    });

    expect(screen.queryByText('late search')).not.toBeInTheDocument();
    expect(screen.getByText('Tia T')).toBeInTheDocument();
  });

  it('clears loading when a tag query is removed without a search', async () => {
    mockLocation.search = '?tag=a';
    const deferred = createDeferred<ComplianceSearchResult>();
    mockGetTaggedUsers.mockReturnValue(deferred.promise);

    const { rerender } = await renderScreen();
    await waitFor(() => expect(mockGetTaggedUsers).toHaveBeenCalledWith('a'));

    mockLocation.search = '';
    rerender(<ComplianceScreen />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Search' })).toHaveAttribute('data-loading', 'false'),
    );

    await act(async () => {
      deferred.resolve(result({ userDatas: [user({ id: 1, name: 'Al A' })] }));
      await Promise.resolve();
    });

    expect(screen.queryByText('Al A')).not.toBeInTheDocument();
  });

  it('clears tagged users from the table when the tag query is removed', async () => {
    mockLocation.search = '?tag=abc';
    mockGetTaggedUsers.mockResolvedValue(result({ userDatas: [user({ id: 1, name: 'Ada A' })] }));

    const { rerender } = await renderScreen();
    await waitFor(() => expect(screen.getByText('Ada A')).toBeInTheDocument());

    mockLocation.search = '';
    rerender(<ComplianceScreen />);

    await waitFor(() => expect(screen.queryByText('Ada A')).not.toBeInTheDocument());
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('clears the tag error when the tag query is removed', async () => {
    mockLocation.search = '?tag=abc';
    mockGetTaggedUsers.mockRejectedValue(new Error('Tag not found'));

    const { rerender } = await renderScreen();
    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('Tag not found'));

    mockLocation.search = '';
    rerender(<ComplianceScreen />);

    await waitFor(() => expect(screen.queryByText('Tag not found')).not.toBeInTheDocument());
  });

  it('does not reload tagged users when getTaggedUsers identity changes', async () => {
    mockLocation.search = '?tag=abc';
    mockGetTaggedUsers.mockResolvedValue(result({ userDatas: [user({ id: 1, name: 'Ada A' })] }));

    const { rerender } = await renderScreen();
    await waitFor(() => expect(screen.getByText('Ada A')).toBeInTheDocument());
    expect(mockGetTaggedUsers).toHaveBeenCalledTimes(1);
    expect(mockGetTaggedUsers).toHaveBeenCalledWith('abc');

    const originalGetTaggedUsers = mockGetTaggedUsers;
    mockGetTaggedUsers = jest.fn().mockResolvedValue(result({ userDatas: [user({ id: 1, name: 'Ada A' })] }));
    rerender(<ComplianceScreen />);

    expect(originalGetTaggedUsers).toHaveBeenCalledTimes(1);
    expect(mockGetTaggedUsers).not.toHaveBeenCalled();
    expect(screen.getByText('Ada A')).toBeInTheDocument();
  });
});
