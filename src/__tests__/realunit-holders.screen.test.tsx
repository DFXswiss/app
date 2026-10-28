const mockUseRealunitGuard = jest.fn();
const mockGetAdminHolders = jest.fn();
const mockNavigate = jest.fn();
const mockCopy = jest.fn();

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', MD: 'md', LG: 'lg' },
  IconColor: { GRAY: 'gray' },
  StyledLoadingSpinner: ({ size }: { size?: string }) => <div data-testid="loading-spinner" data-size={size} />,
  StyledButton: ({ label, onClick, disabled }: { label: string; onClick?: () => void; disabled?: boolean }) => (
    <button type="button" onClick={disabled ? undefined : onClick} disabled={disabled}>
      {label}
    </button>
  ),
  StyledButtonWidth: { MIN: 'min' },
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

jest.mock('src/hooks/realunit-api.hook', () => ({
  useRealunitApi: () => ({ getAdminHolders: mockGetAdminHolders }),
}));

jest.mock('src/util/utils', () => ({
  blankedAddress: (address: string) => address,
}));

import { act, fireEvent, render, screen } from '@testing-library/react';
import { AdminHoldersResponse, PaginationDirection } from 'src/dto/realunit.dto';
import RealunitHoldersScreen from 'src/screens/realunit-holders.screen';

const EMPTY_PAGE = {
  hasNextPage: false,
  hasPreviousPage: false,
  startCursor: '',
  endCursor: '',
};

const WITH_MAIL = {
  address: '0xabc0000000000000000000000000000000008001',
  balance: '100',
  percentage: 1.5,
  mail: 'ada@example.com',
};

const NULL_MAIL = {
  address: '0xabc0000000000000000000000000000000008002',
  balance: '50',
  percentage: 0.5,
  mail: null,
};

const BLANK_MAIL = {
  address: '0xabc0000000000000000000000000000000008003',
  balance: '25',
  percentage: 0.25,
  mail: '   ',
};

const FIRST_PAGE: AdminHoldersResponse = {
  holders: [
    {
      address: '0xabc0000000000000000000000000000000008101',
      balance: '10',
      percentage: 1,
      mail: 'First',
    },
  ],
  pageInfo: {
    hasNextPage: true,
    hasPreviousPage: true,
    startCursor: 's',
    endCursor: 'e',
  },
  totalCount: 1,
};

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function holderPage(mail: string, address: string, totalCount: number): AdminHoldersResponse {
  return {
    holders: [
      {
        address,
        balance: '10',
        percentage: 1,
        mail,
      },
    ],
    pageInfo: EMPTY_PAGE,
    totalCount,
  };
}

function mailCell(address: string): HTMLElement {
  const row = screen.getByText(address).closest('tr');
  if (!row) throw new Error(`missing row for ${address}`);
  const cell = row.querySelectorAll('td')[3];
  if (!(cell instanceof HTMLElement)) throw new Error(`missing mail cell for ${address}`);
  return cell;
}

function expectRegistrationSelect(): void {
  const select = screen.getByRole('combobox') as HTMLSelectElement;
  expect(select).toHaveAttribute('class', 'px-2 py-1 border border-dfxGray-400 rounded bg-white text-dfxBlue-800');
  expect(select).toHaveValue('all');
  expect(Array.from(select.options).map((option) => [option.value, option.textContent])).toEqual([
    ['all', 'All'],
    ['registered', 'Registered'],
    ['unregistered', 'Not registered'],
  ]);
}

describe('RealunitHoldersScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAdminHolders.mockResolvedValue({
      holders: [WITH_MAIL, NULL_MAIL, BLANK_MAIL],
      pageInfo: EMPTY_PAGE,
      totalCount: 3,
    });
  });

  it('shows the large spinner and the registration select while the first page has no rows yet', () => {
    mockGetAdminHolders.mockImplementation(() => new Promise(() => undefined));
    render(<RealunitHoldersScreen />);
    expect(screen.getByTestId('loading-spinner')).toHaveAttribute('data-size', 'lg');
    expect(screen.queryByText('User data')).not.toBeInTheDocument();
    expect(screen.queryByText('E-mail')).not.toBeInTheDocument();
    expectRegistrationSelect();
    expect(mockUseRealunitGuard).toHaveBeenCalled();
  });

  it('shows E-mail and the mail, and an empty cell when mail is null or whitespace', async () => {
    render(<RealunitHoldersScreen />);
    expect(await screen.findByText('E-mail')).toBeInTheDocument();
    expect(screen.queryByText('User data')).not.toBeInTheDocument();
    expect(mailCell(WITH_MAIL.address).textContent).toBe('ada@example.com');
    expect(mailCell(NULL_MAIL.address).textContent).toBe('');
    expect(mailCell(BLANK_MAIL.address).textContent).toBe('');
    expect(mailCell(WITH_MAIL.address).querySelector('a')).toBeNull();
    expect(screen.queryByText('\u2014')).not.toBeInTheDocument();
    expect(screen.queryByText('Verified Ada')).not.toBeInTheDocument();
    expect(screen.queryByText('Failed to load holders.')).not.toBeInTheDocument();
    expectRegistrationSelect();
    expect(mockGetAdminHolders).toHaveBeenCalled();
  });

  it('shows the table without the failure sentence when the request succeeds with zero holders', async () => {
    mockGetAdminHolders.mockResolvedValue({ holders: [], pageInfo: EMPTY_PAGE, totalCount: 0 });
    render(<RealunitHoldersScreen />);
    expect(await screen.findByRole('heading', { name: 'All Holders (0)' })).toBeInTheDocument();
    expect(screen.getByText('E-mail')).toBeInTheDocument();
    expect(screen.queryByText('User data')).not.toBeInTheDocument();
    expect(screen.queryByText('Failed to load holders.')).not.toBeInTheDocument();
    expectRegistrationSelect();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('shows Failed to load holders. when the request rejects and does not throw', async () => {
    mockGetAdminHolders.mockRejectedValue(new Error('unavailable'));
    expect(() => render(<RealunitHoldersScreen />)).not.toThrow();
    expect(await screen.findByText('Failed to load holders.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /All Holders/ })).toBeInTheDocument();
    expect(screen.getByText('Address')).toBeInTheDocument();
    expect(screen.getByText('Balance')).toBeInTheDocument();
    expect(screen.getByText('Percentage')).toBeInTheDocument();
    expect(screen.getByText('E-mail')).toBeInTheDocument();
    expect(screen.queryByText('User data')).not.toBeInTheDocument();
    expect(screen.queryByText('\u2014')).not.toBeInTheDocument();
    expectRegistrationSelect();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.queryByText('ada@example.com')).not.toBeInTheDocument();
  });

  it('reloads from the first page when the registration select changes', async () => {
    mockGetAdminHolders.mockResolvedValue({
      holders: [WITH_MAIL],
      pageInfo: {
        hasNextPage: true,
        hasPreviousPage: false,
        startCursor: 'start-cursor',
        endCursor: 'end-cursor',
      },
      totalCount: 8,
    });
    render(<RealunitHoldersScreen />);
    await screen.findByText('ada@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(mockGetAdminHolders).toHaveBeenLastCalledWith('end-cursor', PaginationDirection.NEXT, 'all');

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'registered' } });
    expect(mockGetAdminHolders).toHaveBeenLastCalledWith(undefined, undefined, 'registered');

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'unregistered' } });
    expect(mockGetAdminHolders).toHaveBeenLastCalledWith(undefined, undefined, 'unregistered');

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'all' } });
    const call = mockGetAdminHolders.mock.calls[mockGetAdminHolders.mock.calls.length - 1];
    expect(call[0]).toBeUndefined();
    expect(call[1]).toBeUndefined();
    expect(call[2] === 'all' || call[2] === undefined).toBe(true);
  });

  it('does not request the previous cursor while a registration change waits for the first page', async () => {
    mockGetAdminHolders.mockResolvedValue({
      holders: [WITH_MAIL],
      pageInfo: {
        hasNextPage: true,
        hasPreviousPage: true,
        startCursor: 'start-cursor',
        endCursor: 'end-cursor',
      },
      totalCount: 8,
    });
    render(<RealunitHoldersScreen />);
    expect(await screen.findByText('ada@example.com')).toBeInTheDocument();

    const pending = deferred<AdminHoldersResponse>();
    mockGetAdminHolders.mockImplementation((cursor?: string) => {
      if (cursor === undefined) return pending.promise;
      return new Promise(() => undefined);
    });

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'registered' } });
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    const calls = mockGetAdminHolders.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(mockGetAdminHolders).toHaveBeenCalledTimes(calls);
    expect(mockGetAdminHolders.mock.calls.some((call) => call[0] === 'end-cursor' && call[2] === 'registered')).toBe(
      false,
    );

    await act(async () => {
      pending.resolve({
        holders: [
          {
            address: '0xabc0000000000000000000000000000000008004',
            balance: '1',
            percentage: 1,
            mail: 'bob@example.com',
          },
        ],
        pageInfo: EMPTY_PAGE,
        totalCount: 1,
      });
    });

    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
    expect(screen.queryByText('ada@example.com')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'All Holders (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('keeps the later holder when a slower next response resolves afterwards', async () => {
    const nextPage = deferred<AdminHoldersResponse>();
    const previousPage = deferred<AdminHoldersResponse>();
    mockGetAdminHolders.mockImplementation((_cursor?: string, direction?: PaginationDirection) => {
      if (direction === PaginationDirection.NEXT) return nextPage.promise;
      if (direction === PaginationDirection.PREV) return previousPage.promise;
      return Promise.resolve(FIRST_PAGE);
    });

    render(<RealunitHoldersScreen />);
    expect(await screen.findByText('First')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await act(async () => {
      previousPage.resolve(holderPage('Later', '0xabc0000000000000000000000000000000008102', 3));
    });

    expect(screen.getByText('Later')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'All Holders (3)' })).toBeInTheDocument();

    await act(async () => {
      nextPage.resolve(holderPage('Stale', '0xabc0000000000000000000000000000000008103', 99));
    });
    expect(screen.getByText('Later')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'All Holders (3)' })).toBeInTheDocument();
    expect(screen.queryByText('Stale')).not.toBeInTheDocument();
  });

  it('keeps the later holder when a slower next response rejects afterwards', async () => {
    const nextPage = deferred<AdminHoldersResponse>();
    const previousPage = deferred<AdminHoldersResponse>();
    mockGetAdminHolders.mockImplementation((_cursor?: string, direction?: PaginationDirection) => {
      if (direction === PaginationDirection.NEXT) return nextPage.promise;
      if (direction === PaginationDirection.PREV) return previousPage.promise;
      return Promise.resolve(FIRST_PAGE);
    });

    render(<RealunitHoldersScreen />);
    expect(await screen.findByText('First')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await act(async () => {
      previousPage.resolve(holderPage('Later', '0xabc0000000000000000000000000000000008102', 3));
    });

    expect(screen.getByText('Later')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'All Holders (3)' })).toBeInTheDocument();

    await act(async () => {
      nextPage.reject(new Error('Stale'));
    });
    expect(screen.getByText('Later')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'All Holders (3)' })).toBeInTheDocument();
    expect(screen.queryByText('Failed to load holders.')).not.toBeInTheDocument();
    expect(screen.queryByText('Stale')).not.toBeInTheDocument();
  });

  it('keeps the load error when a slower next response resolves afterwards', async () => {
    const nextPage = deferred<AdminHoldersResponse>();
    const previousPage = deferred<AdminHoldersResponse>();
    mockGetAdminHolders.mockImplementation((_cursor?: string, direction?: PaginationDirection) => {
      if (direction === PaginationDirection.NEXT) return nextPage.promise;
      if (direction === PaginationDirection.PREV) return previousPage.promise;
      return Promise.resolve(FIRST_PAGE);
    });

    render(<RealunitHoldersScreen />);
    expect(await screen.findByText('First')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await act(async () => {
      previousPage.reject(new Error('unavailable'));
    });

    expect(await screen.findByText('Failed to load holders.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'All Holders (0)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await act(async () => {
      nextPage.resolve(holderPage('Stale', '0xabc0000000000000000000000000000000008103', 99));
    });
    expect(screen.getByText('Failed to load holders.')).toBeInTheDocument();
    expect(screen.queryByText('Stale')).not.toBeInTheDocument();
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
  });

  it('requests the next and previous page with the cursors from pageInfo', async () => {
    mockGetAdminHolders.mockResolvedValue({
      holders: [WITH_MAIL],
      pageInfo: {
        hasNextPage: true,
        hasPreviousPage: true,
        startCursor: 'start-cursor',
        endCursor: 'end-cursor',
      },
      totalCount: 8,
    });
    render(<RealunitHoldersScreen />);
    await screen.findByText('ada@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(mockGetAdminHolders).toHaveBeenLastCalledWith('end-cursor', PaginationDirection.NEXT, 'all');
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(mockGetAdminHolders).toHaveBeenLastCalledWith('start-cursor', PaginationDirection.PREV, 'all');
  });

  it('navigates to the holder and copies the address', async () => {
    render(<RealunitHoldersScreen />);
    fireEvent.click(await screen.findByText(WITH_MAIL.address));
    expect(mockNavigate).toHaveBeenCalledWith(`/realunit/user/${encodeURIComponent(WITH_MAIL.address)}`);
    fireEvent.click(screen.getAllByTestId('copy-button')[0]);
    expect(mockCopy).toHaveBeenCalledWith(WITH_MAIL.address);
  });
});
