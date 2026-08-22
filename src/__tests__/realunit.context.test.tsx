// Unit tests for RealunitContextProvider: every fetch path, error branch, and API passthrough.

const mockGetAccountSummary = jest.fn();
const mockGetAccountHistory = jest.fn();
const mockGetHolders = jest.fn();
const mockGetPriceHistory = jest.fn();
const mockGetTokenInfo = jest.fn();
const mockGetTokenPrice = jest.fn();
const mockGetAdminQuotes = jest.fn();
const mockGetAdminTransactions = jest.fn();
const mockConfirmPayment = jest.fn();
const mockDeactivateQuote = jest.fn();
const mockGetBuyVolume = jest.fn();
const mockGetRegistrationStats = jest.fn();
const mockGetHolderCount = jest.fn();

jest.mock('src/hooks/realunit-api.hook', () => ({
  useRealunitApi: () => ({
    getAccountSummary: mockGetAccountSummary,
    getAccountHistory: mockGetAccountHistory,
    getHolders: mockGetHolders,
    getPriceHistory: mockGetPriceHistory,
    getTokenInfo: mockGetTokenInfo,
    getTokenPrice: mockGetTokenPrice,
    getAdminQuotes: mockGetAdminQuotes,
    getAdminTransactions: mockGetAdminTransactions,
    confirmPayment: mockConfirmPayment,
    deactivateQuote: mockDeactivateQuote,
    getBuyVolume: mockGetBuyVolume,
    getRegistrationStats: mockGetRegistrationStats,
    getHolderCount: mockGetHolderCount,
  }),
}));

import { act, renderHook, waitFor } from '@testing-library/react';
import { PropsWithChildren } from 'react';
import { RealunitContextProvider, useRealunitContext } from 'src/contexts/realunit.context';
import { PaginationDirection } from 'src/dto/realunit.dto';
import { Timeframe } from 'src/util/chart';

function wrapper({ children }: PropsWithChildren) {
  return <RealunitContextProvider>{children}</RealunitContextProvider>;
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
} {
  const controls = {
    resolve: (_value: T) => {
      throw new Error('deferred not initialized');
    },
    reject: (_reason: Error) => {
      throw new Error('deferred not initialized');
    },
  };
  const promise = new Promise<T>((resolve, reject) => {
    controls.resolve = resolve;
    controls.reject = reject;
  });
  return { promise, resolve: controls.resolve, reject: controls.reject };
}

const EMPTY_PAGE = {
  hasNextPage: false,
  hasPreviousPage: false,
  startCursor: '',
  endCursor: '',
};

describe('RealunitContextProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAccountSummary.mockResolvedValue(undefined);
    mockGetAccountHistory.mockResolvedValue(undefined);
    mockGetHolders.mockResolvedValue({ holders: [], pageInfo: EMPTY_PAGE, totalCount: 0 });
    mockGetPriceHistory.mockResolvedValue([]);
    mockGetTokenInfo.mockResolvedValue(undefined);
    mockGetTokenPrice.mockResolvedValue(undefined);
    mockGetAdminQuotes.mockResolvedValue([]);
    mockGetAdminTransactions.mockResolvedValue([]);
    mockGetBuyVolume.mockResolvedValue([]);
    mockGetRegistrationStats.mockResolvedValue({
      snapshot: {
        completed: 0,
        manualReview: 0,
        confirmed: 0,
        usersActive: 0,
        usersNa: 0,
        usersBlocked: 0,
        usersDeleted: 0,
      },
      series: [],
    });
    mockGetHolderCount.mockResolvedValue([]);
  });

  it('fetchAccountSummary sets accountSummary on success and clears it on catch', async () => {
    const summary = {
      address: '0x1',
      addressType: 1,
      balance: '10',
      lastUpdated: '2026-01-01T00:00:00.000Z',
    };
    mockGetAccountSummary.mockResolvedValueOnce(summary);

    const { result } = renderHook(() => useRealunitContext(), { wrapper });

    act(() => {
      result.current.fetchAccountSummary('0x1');
    });
    await waitFor(() => {
      expect(result.current.accountSummary).toEqual(summary);
      expect(result.current.isLoading).toBe(false);
    });

    mockGetAccountSummary.mockRejectedValueOnce(new Error('fail'));
    act(() => {
      result.current.fetchAccountSummary('0x1');
    });
    await waitFor(() => {
      expect(result.current.accountSummary).toBeUndefined();
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('fetchAccountHistory sets history from the API response', async () => {
    const history = {
      address: '0x1',
      addressType: 1,
      history: [],
      totalCount: 0,
      pageInfo: EMPTY_PAGE,
    };
    mockGetAccountHistory.mockResolvedValueOnce(history);

    const { result } = renderHook(() => useRealunitContext(), { wrapper });

    act(() => {
      result.current.fetchAccountHistory('0x1', 'c1', PaginationDirection.NEXT);
    });
    await waitFor(() => {
      expect(result.current.history).toEqual(history);
    });
    expect(mockGetAccountHistory).toHaveBeenCalledWith('0x1', 'c1', PaginationDirection.NEXT);
  });

  it('fetchHolders loads the first page, early-returns when already loaded without cursor, and paginates with cursor', async () => {
    const first = {
      holders: [{ address: '0xa', balance: '1', percentage: 1 }],
      pageInfo: { ...EMPTY_PAGE, endCursor: 'end1', hasNextPage: true },
      totalCount: 3,
    };
    const second = {
      holders: [{ address: '0xb', balance: '2', percentage: 2 }],
      pageInfo: { ...EMPTY_PAGE, startCursor: 'start2' },
      totalCount: 3,
    };
    mockGetHolders.mockResolvedValueOnce(first).mockResolvedValueOnce(second);

    const { result } = renderHook(() => useRealunitContext(), { wrapper });

    act(() => {
      result.current.fetchHolders();
    });
    await waitFor(() => {
      expect(result.current.holders).toEqual(first.holders);
      expect(result.current.totalCount).toBe(3);
      expect(result.current.pageInfo).toEqual(first.pageInfo);
    });

    mockGetHolders.mockClear();
    act(() => {
      result.current.fetchHolders();
    });
    expect(mockGetHolders).not.toHaveBeenCalled();

    act(() => {
      result.current.fetchHolders('end1', PaginationDirection.NEXT);
    });
    await waitFor(() => {
      expect(result.current.holders).toEqual(second.holders);
    });
    expect(mockGetHolders).toHaveBeenCalledWith('end1', PaginationDirection.NEXT);
    // totalCount is only set on the first page (no cursor)
    expect(result.current.totalCount).toBe(3);
  });

  it('fetchPriceHistory sets data and timeframe on success, and flags error on catch; default timeframe is ALL', async () => {
    const prices = [{ timestamp: 't', chf: 1, eur: 1, usd: 1 }];
    mockGetPriceHistory.mockResolvedValueOnce(prices);

    const { result } = renderHook(() => useRealunitContext(), { wrapper });

    act(() => {
      result.current.fetchPriceHistory();
    });
    await waitFor(() => {
      expect(result.current.priceHistory).toEqual(prices);
      expect(result.current.timeframe).toBe(Timeframe.ALL);
      expect(result.current.priceHistoryError).toBe(false);
    });
    expect(mockGetPriceHistory).toHaveBeenCalledWith(Timeframe.ALL);

    mockGetPriceHistory.mockResolvedValueOnce(prices);
    act(() => {
      result.current.fetchPriceHistory(Timeframe.WEEK);
    });
    await waitFor(() => {
      expect(result.current.timeframe).toBe(Timeframe.WEEK);
    });

    mockGetPriceHistory.mockRejectedValueOnce(new Error('price fail'));
    act(() => {
      result.current.fetchPriceHistory(Timeframe.MONTH);
    });
    await waitFor(() => {
      expect(result.current.priceHistoryError).toBe(true);
    });
  });

  it('fetchTokenInfo and fetchTokenPrice set their state from the API', async () => {
    const tokenInfo = {
      totalShares: { total: '1', timestamp: 't', txHash: '0x' },
      totalSupply: { value: '1', timestamp: 't' },
    };
    const tokenPrice = { timestamp: 't', chf: 1, eur: 1, usd: 1 };
    mockGetTokenInfo.mockResolvedValueOnce(tokenInfo);
    mockGetTokenPrice.mockResolvedValueOnce(tokenPrice);

    const { result } = renderHook(() => useRealunitContext(), { wrapper });

    act(() => {
      result.current.fetchTokenInfo();
      result.current.fetchTokenPrice();
    });
    await waitFor(() => {
      expect(result.current.tokenInfo).toEqual(tokenInfo);
      expect(result.current.tokenPrice).toEqual(tokenPrice);
    });
  });

  it('fetchQuotes appends results, sets error on catch, and resetQuotes clears the list', async () => {
    const first = [
      { id: 1, uid: 'a', type: 'Buy', status: 'WaitingForPayment', amount: 1, estimatedAmount: 1, created: 't' },
    ];
    const second = [
      { id: 2, uid: 'b', type: 'Buy', status: 'WaitingForPayment', amount: 2, estimatedAmount: 2, created: 't' },
    ];
    mockGetAdminQuotes.mockResolvedValueOnce(first).mockResolvedValueOnce(second);

    const { result } = renderHook(() => useRealunitContext(), { wrapper });

    act(() => {
      result.current.fetchQuotes();
    });
    await waitFor(() => {
      expect(result.current.quotes).toEqual(first);
      expect(result.current.quotesLoading).toBe(false);
      expect(result.current.quotesError).toBe(false);
    });
    expect(mockGetAdminQuotes).toHaveBeenCalledWith(50, 0);

    act(() => {
      result.current.fetchQuotes();
    });
    await waitFor(() => {
      expect(result.current.quotes).toEqual([...first, ...second]);
    });
    expect(mockGetAdminQuotes).toHaveBeenLastCalledWith(50, 1);

    mockGetAdminQuotes.mockRejectedValueOnce(new Error('quotes fail'));
    act(() => {
      result.current.fetchQuotes();
    });
    await waitFor(() => {
      expect(result.current.quotesError).toBe(true);
      expect(result.current.quotesLoading).toBe(false);
    });

    act(() => {
      result.current.resetQuotes();
    });
    expect(result.current.quotes).toEqual([]);
  });

  it('fetchTransactions appends results and sets error on catch', async () => {
    const first = [{ id: 1, uid: 't1', type: 'Buy', amountInChf: 1, assets: 'REALU', created: 't' }];
    const second = [{ id: 2, uid: 't2', type: 'Buy', amountInChf: 2, assets: 'REALU', created: 't' }];
    mockGetAdminTransactions.mockResolvedValueOnce(first).mockResolvedValueOnce(second);

    const { result } = renderHook(() => useRealunitContext(), { wrapper });

    act(() => {
      result.current.fetchTransactions();
    });
    await waitFor(() => {
      expect(result.current.transactions).toEqual(first);
      expect(result.current.transactionsLoading).toBe(false);
    });
    expect(mockGetAdminTransactions).toHaveBeenCalledWith(50, 0);

    act(() => {
      result.current.fetchTransactions();
    });
    await waitFor(() => {
      expect(result.current.transactions).toEqual([...first, ...second]);
    });

    mockGetAdminTransactions.mockRejectedValueOnce(new Error('tx fail'));
    act(() => {
      result.current.fetchTransactions();
    });
    await waitFor(() => {
      expect(result.current.transactionsError).toBe(true);
      expect(result.current.transactionsLoading).toBe(false);
    });
  });

  it('confirmPayment and deactivateQuote are the same function references returned by the API hook', () => {
    const { result } = renderHook(() => useRealunitContext(), { wrapper });
    expect(result.current.confirmPayment).toBe(mockConfirmPayment);
    expect(result.current.deactivateQuote).toBe(mockDeactivateQuote);
  });

  it('fetchBuyVolume sets series on success and error on catch', async () => {
    const series = [{ timestamp: '2026-08-01T00:00:00.000Z', chf: 10, shares: 7, priceChf: 1.4 }];
    mockGetBuyVolume.mockResolvedValueOnce(series);
    const { result } = renderHook(() => useRealunitContext(), { wrapper });
    act(() => {
      result.current.fetchBuyVolume(Timeframe.WEEK);
    });
    await waitFor(() => {
      expect(result.current.buyVolume).toEqual(series);
      expect(result.current.buyVolumeLoading).toBe(false);
      expect(result.current.buyVolumeTimeframe).toBe(Timeframe.WEEK);
    });
    expect(mockGetBuyVolume).toHaveBeenCalledWith(Timeframe.WEEK);

    mockGetBuyVolume.mockRejectedValueOnce(new Error('fail'));
    act(() => {
      result.current.fetchBuyVolume();
    });
    await waitFor(() => {
      expect(result.current.buyVolumeError).toBe(true);
      expect(result.current.buyVolumeLoading).toBe(false);
    });
  });

  it('fetchHolderCount and fetchRegistrationStats set state and error flags', async () => {
    const holders = [{ timestamp: '2026-08-01T00:00:00.000Z', holders: 9 }];
    const registration = {
      snapshot: {
        completed: 1,
        manualReview: 2,
        confirmed: 1,
        usersActive: 3,
        usersNa: 4,
        usersBlocked: 0,
        usersDeleted: 0,
      },
      series: [{ timestamp: '2026-08-01T00:00:00.000Z', registered: 1, confirmed: 0 }],
    };
    mockGetHolderCount.mockResolvedValueOnce(holders);
    mockGetRegistrationStats.mockResolvedValueOnce(registration);
    const { result } = renderHook(() => useRealunitContext(), { wrapper });
    act(() => {
      result.current.fetchHolderCount(Timeframe.MONTH);
      result.current.fetchRegistrationStats(Timeframe.YEAR);
    });
    await waitFor(() => {
      expect(result.current.holderCount).toEqual(holders);
      expect(result.current.registrationStats).toEqual(registration);
    });

    mockGetHolderCount.mockRejectedValueOnce(new Error('fail'));
    mockGetRegistrationStats.mockRejectedValueOnce(new Error('fail'));
    act(() => {
      result.current.fetchHolderCount();
      result.current.fetchRegistrationStats();
    });
    await waitFor(() => {
      expect(result.current.holderCountError).toBe(true);
      expect(result.current.registrationError).toBe(true);
    });
  });

  it('ignores stale stats success when a newer timeframe request is in flight', async () => {
    const staleVolume = createDeferred<{ timestamp: string; chf: number; shares: number; priceChf: number }[]>();
    const staleHolders = createDeferred<{ timestamp: string; holders: number }[]>();
    const staleRegistration = createDeferred<{
      snapshot: {
        completed: number;
        manualReview: number;
        confirmed: number;
        usersActive: number;
        usersNa: number;
        usersBlocked: number;
        usersDeleted: number;
      };
      series: { timestamp: string; registered: number; confirmed: number }[];
    }>();
    const freshVolume = [{ timestamp: '2026-08-02T00:00:00.000Z', chf: 20, shares: 10, priceChf: 2 }];
    const freshHolders = [{ timestamp: '2026-08-02T00:00:00.000Z', holders: 4 }];
    const freshRegistration = {
      snapshot: {
        completed: 5,
        manualReview: 0,
        confirmed: 5,
        usersActive: 5,
        usersNa: 0,
        usersBlocked: 0,
        usersDeleted: 0,
      },
      series: [{ timestamp: '2026-08-02T00:00:00.000Z', registered: 5, confirmed: 5 }],
    };

    mockGetBuyVolume.mockReturnValueOnce(staleVolume.promise).mockResolvedValueOnce(freshVolume);
    mockGetHolderCount.mockReturnValueOnce(staleHolders.promise).mockResolvedValueOnce(freshHolders);
    mockGetRegistrationStats.mockReturnValueOnce(staleRegistration.promise).mockResolvedValueOnce(freshRegistration);

    const { result } = renderHook(() => useRealunitContext(), { wrapper });
    act(() => {
      result.current.fetchBuyVolume(Timeframe.YEAR);
      result.current.fetchHolderCount(Timeframe.YEAR);
      result.current.fetchRegistrationStats(Timeframe.YEAR);
    });
    act(() => {
      result.current.fetchBuyVolume(Timeframe.WEEK);
      result.current.fetchHolderCount(Timeframe.WEEK);
      result.current.fetchRegistrationStats(Timeframe.WEEK);
    });
    await waitFor(() => {
      expect(result.current.buyVolume).toEqual(freshVolume);
      expect(result.current.holderCount).toEqual(freshHolders);
      expect(result.current.registrationStats).toEqual(freshRegistration);
    });

    await act(async () => {
      staleVolume.resolve([{ timestamp: '2026-01-01T00:00:00.000Z', chf: 1, shares: 1, priceChf: 1 }]);
      staleHolders.resolve([{ timestamp: '2026-01-01T00:00:00.000Z', holders: 99 }]);
      staleRegistration.resolve({
        snapshot: {
          completed: 1,
          manualReview: 1,
          confirmed: 1,
          usersActive: 1,
          usersNa: 1,
          usersBlocked: 1,
          usersDeleted: 1,
        },
        series: [{ timestamp: '2026-01-01T00:00:00.000Z', registered: 1, confirmed: 1 }],
      });
    });

    expect(result.current.buyVolume).toEqual(freshVolume);
    expect(result.current.buyVolumeTimeframe).toBe(Timeframe.WEEK);
    expect(result.current.buyVolumeLoading).toBe(false);
    expect(result.current.holderCount).toEqual(freshHolders);
    expect(result.current.holderCountTimeframe).toBe(Timeframe.WEEK);
    expect(result.current.holderCountLoading).toBe(false);
    expect(result.current.registrationStats).toEqual(freshRegistration);
    expect(result.current.registrationTimeframe).toBe(Timeframe.WEEK);
    expect(result.current.registrationLoading).toBe(false);
  });

  it('ignores stale stats errors when a newer timeframe request succeeds', async () => {
    const staleVolume = createDeferred<{ timestamp: string; chf: number; shares: number; priceChf: number }[]>();
    const staleHolders = createDeferred<{ timestamp: string; holders: number }[]>();
    const staleRegistration = createDeferred<{
      snapshot: {
        completed: number;
        manualReview: number;
        confirmed: number;
        usersActive: number;
        usersNa: number;
        usersBlocked: number;
        usersDeleted: number;
      };
      series: { timestamp: string; registered: number; confirmed: number }[];
    }>();
    const freshVolume = [{ timestamp: '2026-08-03T00:00:00.000Z', chf: 8, shares: 4, priceChf: 2 }];
    const freshHolders = [{ timestamp: '2026-08-03T00:00:00.000Z', holders: 2 }];
    const freshRegistration = {
      snapshot: {
        completed: 2,
        manualReview: 0,
        confirmed: 2,
        usersActive: 2,
        usersNa: 0,
        usersBlocked: 0,
        usersDeleted: 0,
      },
      series: [{ timestamp: '2026-08-03T00:00:00.000Z', registered: 2, confirmed: 2 }],
    };

    mockGetBuyVolume.mockReturnValueOnce(staleVolume.promise).mockResolvedValueOnce(freshVolume);
    mockGetHolderCount.mockReturnValueOnce(staleHolders.promise).mockResolvedValueOnce(freshHolders);
    mockGetRegistrationStats.mockReturnValueOnce(staleRegistration.promise).mockResolvedValueOnce(freshRegistration);

    const { result } = renderHook(() => useRealunitContext(), { wrapper });
    act(() => {
      result.current.fetchBuyVolume(Timeframe.MONTH);
      result.current.fetchHolderCount(Timeframe.MONTH);
      result.current.fetchRegistrationStats(Timeframe.MONTH);
    });
    act(() => {
      result.current.fetchBuyVolume(Timeframe.WEEK);
      result.current.fetchHolderCount(Timeframe.WEEK);
      result.current.fetchRegistrationStats(Timeframe.WEEK);
    });
    await waitFor(() => {
      expect(result.current.buyVolume).toEqual(freshVolume);
      expect(result.current.holderCount).toEqual(freshHolders);
      expect(result.current.registrationStats).toEqual(freshRegistration);
    });

    await act(async () => {
      staleVolume.reject(new Error('stale volume'));
      staleHolders.reject(new Error('stale holders'));
      staleRegistration.reject(new Error('stale registration'));
    });

    expect(result.current.buyVolumeError).toBe(false);
    expect(result.current.holderCountError).toBe(false);
    expect(result.current.registrationError).toBe(false);
    expect(result.current.buyVolume).toEqual(freshVolume);
    expect(result.current.holderCount).toEqual(freshHolders);
    expect(result.current.registrationStats).toEqual(freshRegistration);
    expect(result.current.buyVolumeLoading).toBe(false);
    expect(result.current.holderCountLoading).toBe(false);
    expect(result.current.registrationLoading).toBe(false);
  });
});
