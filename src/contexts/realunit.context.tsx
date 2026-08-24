import { PropsWithChildren, createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import {
  AccountHistory,
  AccountSummary,
  Holder,
  PageInfo,
  PaginationDirection,
  PriceHistoryEntry,
  RealUnitBuyVolumePoint,
  RealUnitHolderCountPoint,
  RealUnitQuote,
  RealUnitRegistrationStats,
  RealUnitTransaction,
  RealunitContextInterface,
  TokenInfo,
  TokenPrice,
} from 'src/dto/realunit.dto';
import { useRealunitApi } from 'src/hooks/realunit-api.hook';
import { Timeframe } from 'src/util/chart';

const RealunitContext = createContext<RealunitContextInterface>(undefined as any);

export function useRealunitContext(): RealunitContextInterface {
  return useContext(RealunitContext);
}

export function RealunitContextProvider({ children }: PropsWithChildren): JSX.Element {
  const [accountSummary, setAccountSummary] = useState<AccountSummary | undefined>();
  const [history, setHistory] = useState<AccountHistory | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [holders, setHolders] = useState<Holder[]>([]);
  const [totalCount, setTotalCount] = useState<number | undefined>();
  const [pageInfo, setPageInfo] = useState<PageInfo>({
    hasNextPage: false,
    hasPreviousPage: false,
    startCursor: '',
    endCursor: '',
  });
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | undefined>();
  const [tokenPrice, setTokenPrice] = useState<TokenPrice | undefined>();
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([]);
  const [timeframe, setTimeframe] = useState<Timeframe>(Timeframe.ALL);
  const [quotes, setQuotes] = useState<RealUnitQuote[]>([]);
  const [transactions, setTransactions] = useState<RealUnitTransaction[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [quotesError, setQuotesError] = useState(false);
  const [transactionsError, setTransactionsError] = useState(false);
  const [priceHistoryError, setPriceHistoryError] = useState(false);
  const [buyVolume, setBuyVolume] = useState<RealUnitBuyVolumePoint[]>([]);
  const [buyVolumeLoading, setBuyVolumeLoading] = useState(false);
  const [buyVolumeError, setBuyVolumeError] = useState(false);
  const [holderCount, setHolderCount] = useState<RealUnitHolderCountPoint[]>([]);
  const [holderCountLoading, setHolderCountLoading] = useState(false);
  const [holderCountError, setHolderCountError] = useState(false);
  const [registrationStats, setRegistrationStats] = useState<RealUnitRegistrationStats | undefined>();
  const [registrationLoading, setRegistrationLoading] = useState(false);
  const [registrationError, setRegistrationError] = useState(false);
  const [buyVolumeTimeframe, setBuyVolumeTimeframe] = useState(Timeframe.ALL);
  const [holderCountTimeframe, setHolderCountTimeframe] = useState(Timeframe.ALL);
  const [registrationTimeframe, setRegistrationTimeframe] = useState(Timeframe.ALL);
  const buyVolumeRequest = useRef(0);
  const holderCountRequest = useRef(0);
  const registrationRequest = useRef(0);

  const {
    getAccountSummary,
    getAccountHistory,
    getHolders,
    getPriceHistory,
    getTokenInfo,
    getTokenPrice,
    getAdminQuotes,
    getAdminTransactions,
    confirmPayment,
    deactivateQuote,
    getBuyVolume,
    getRegistrationStats,
    getHolderCount,
  } = useRealunitApi();

  const fetchAccountSummary = useCallback(
    (address: string) => {
      setIsLoading(true);
      getAccountSummary(address)
        .then((accountData) => {
          setAccountSummary(accountData);
        })
        .catch(() => {
          setAccountSummary(undefined);
        })
        .finally(() => setIsLoading(false));
    },
    [setAccountSummary, setIsLoading],
  );

  const fetchAccountHistory = useCallback(
    (address: string, cursor?: string, direction?: PaginationDirection) => {
      getAccountHistory(address, cursor, direction).then((accountHistory) => {
        setHistory(accountHistory);
      });
    },
    [setHistory],
  );

  const fetchHolders = useCallback(
    (cursor?: string, direction?: PaginationDirection) => {
      if (!cursor && holders.length > 0) {
        return;
      }
      getHolders(cursor, direction).then((holdersData) => {
        setHolders(holdersData.holders);
        setPageInfo(holdersData.pageInfo);
        if (!cursor) {
          setTotalCount(holdersData.totalCount);
        }
      });
    },
    [holders.length, setHolders, setPageInfo, setTotalCount],
  );

  const fetchPriceHistory = useCallback(
    (timeframe = Timeframe.ALL) => {
      setPriceHistoryError(false);
      getPriceHistory(timeframe)
        .then((priceData) => {
          setPriceHistory(priceData);
          setTimeframe(timeframe);
        })
        .catch(() => setPriceHistoryError(true));
    },
    [setPriceHistory, setTimeframe],
  );

  const fetchTokenInfo = useCallback(() => {
    getTokenInfo().then((tokenData) => {
      setTokenInfo(tokenData);
    });
  }, [setTokenInfo]);

  const fetchTokenPrice = useCallback(() => {
    getTokenPrice().then((tokenPrice) => {
      setTokenPrice(tokenPrice);
    });
  }, [setTokenPrice]);

  const fetchQuotes = useCallback(() => {
    setQuotesLoading(true);
    setQuotesError(false);
    getAdminQuotes(50, quotes.length)
      .then((data) => {
        setQuotes((prev) => [...prev, ...data]);
      })
      .catch(() => setQuotesError(true))
      .finally(() => setQuotesLoading(false));
  }, [quotes.length]);

  const resetQuotes = useCallback(() => {
    setQuotes([]);
  }, []);

  const fetchTransactions = useCallback(() => {
    setTransactionsLoading(true);
    setTransactionsError(false);
    getAdminTransactions(50, transactions.length)
      .then((data) => {
        setTransactions((prev) => [...prev, ...data]);
      })
      .catch(() => setTransactionsError(true))
      .finally(() => setTransactionsLoading(false));
  }, [transactions.length]);

  const fetchBuyVolume = useCallback(
    (nextTimeframe = Timeframe.ALL) => {
      const requestId = ++buyVolumeRequest.current;
      setBuyVolumeLoading(true);
      setBuyVolumeError(false);
      getBuyVolume(nextTimeframe)
        .then((data) => {
          if (requestId !== buyVolumeRequest.current) return;
          setBuyVolume(data);
          setBuyVolumeTimeframe(nextTimeframe);
        })
        .catch(() => {
          if (requestId !== buyVolumeRequest.current) return;
          setBuyVolumeError(true);
        })
        .finally(() => {
          if (requestId !== buyVolumeRequest.current) return;
          setBuyVolumeLoading(false);
        });
    },
    [getBuyVolume],
  );

  const fetchHolderCount = useCallback(
    (nextTimeframe = Timeframe.ALL) => {
      const requestId = ++holderCountRequest.current;
      setHolderCountLoading(true);
      setHolderCountError(false);
      getHolderCount(nextTimeframe)
        .then((data) => {
          if (requestId !== holderCountRequest.current) return;
          setHolderCount(data);
          setHolderCountTimeframe(nextTimeframe);
        })
        .catch(() => {
          if (requestId !== holderCountRequest.current) return;
          setHolderCountError(true);
        })
        .finally(() => {
          if (requestId !== holderCountRequest.current) return;
          setHolderCountLoading(false);
        });
    },
    [getHolderCount],
  );

  const fetchRegistrationStats = useCallback(
    (nextTimeframe = Timeframe.ALL) => {
      const requestId = ++registrationRequest.current;
      setRegistrationLoading(true);
      setRegistrationError(false);
      getRegistrationStats(nextTimeframe)
        .then((data) => {
          if (requestId !== registrationRequest.current) return;
          setRegistrationStats(data);
          setRegistrationTimeframe(nextTimeframe);
        })
        .catch(() => {
          if (requestId !== registrationRequest.current) return;
          setRegistrationError(true);
        })
        .finally(() => {
          if (requestId !== registrationRequest.current) return;
          setRegistrationLoading(false);
        });
    },
    [getRegistrationStats],
  );

  const context = useMemo(
    () => ({
      accountSummary,
      history,
      isLoading,
      holders,
      totalCount,
      pageInfo,
      tokenInfo,
      tokenPrice,
      priceHistory,
      timeframe,
      quotes,
      transactions,
      quotesLoading,
      transactionsLoading,
      quotesError,
      transactionsError,
      priceHistoryError,
      buyVolume,
      buyVolumeLoading,
      buyVolumeError,
      holderCount,
      holderCountLoading,
      holderCountError,
      registrationStats,
      registrationLoading,
      registrationError,
      fetchAccountSummary,
      fetchAccountHistory,
      fetchHolders,
      fetchTokenInfo,
      fetchPriceHistory,
      fetchTokenPrice,
      fetchQuotes,
      resetQuotes,
      fetchTransactions,
      confirmPayment,
      deactivateQuote,
      buyVolumeTimeframe,
      holderCountTimeframe,
      registrationTimeframe,
      fetchBuyVolume,
      fetchHolderCount,
      fetchRegistrationStats,
    }),
    [
      accountSummary,
      history,
      isLoading,
      holders,
      totalCount,
      pageInfo,
      tokenInfo,
      tokenPrice,
      priceHistory,
      timeframe,
      quotes,
      transactions,
      quotesLoading,
      transactionsLoading,
      quotesError,
      transactionsError,
      priceHistoryError,
      buyVolume,
      buyVolumeLoading,
      buyVolumeError,
      holderCount,
      holderCountLoading,
      holderCountError,
      registrationStats,
      registrationLoading,
      registrationError,
      buyVolumeTimeframe,
      holderCountTimeframe,
      registrationTimeframe,
      fetchAccountSummary,
      fetchAccountHistory,
      fetchHolders,
      fetchTokenInfo,
      fetchTokenPrice,
      fetchPriceHistory,
      fetchQuotes,
      resetQuotes,
      fetchTransactions,
      confirmPayment,
      deactivateQuote,
      fetchBuyVolume,
      fetchHolderCount,
      fetchRegistrationStats,
    ],
  );

  return <RealunitContext.Provider value={context}>{children}</RealunitContext.Provider>;
}
