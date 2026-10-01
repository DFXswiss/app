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
  const [accountSummaryError, setAccountSummaryError] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [holders, setHolders] = useState<Holder[]>([]);
  const [holdersLoading, setHoldersLoading] = useState(false);
  const [holdersError, setHoldersError] = useState(false);
  const [totalCount, setTotalCount] = useState<number | undefined>();
  const [pageInfo, setPageInfo] = useState<PageInfo>({
    hasNextPage: false,
    hasPreviousPage: false,
    startCursor: '',
    endCursor: '',
  });
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | undefined>();
  const [tokenInfoLoading, setTokenInfoLoading] = useState(false);
  const [tokenInfoError, setTokenInfoError] = useState(false);
  const [tokenPrice, setTokenPrice] = useState<TokenPrice | undefined>();
  const [tokenPriceLoading, setTokenPriceLoading] = useState(false);
  const [tokenPriceError, setTokenPriceError] = useState(false);
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
  const accountSummaryRequest = useRef(0);
  const historyRequest = useRef(0);
  const holdersRequest = useRef(0);
  const tokenInfoRequest = useRef(0);
  const tokenPriceRequest = useRef(0);
  const historyAddress = useRef<string | undefined>(undefined);

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
      const requestId = ++accountSummaryRequest.current;
      setIsLoading(true);
      setAccountSummary(undefined);
      setAccountSummaryError(false);
      getAccountSummary(address)
        .then((accountData) => {
          if (requestId !== accountSummaryRequest.current) return;
          setAccountSummary(accountData);
        })
        .catch(() => {
          if (requestId !== accountSummaryRequest.current) return;
          setAccountSummary(undefined);
          setAccountSummaryError(true);
        })
        .finally(() => {
          if (requestId !== accountSummaryRequest.current) return;
          setIsLoading(false);
        });
    },
    [getAccountSummary],
  );

  const fetchAccountHistory = useCallback(
    (address: string, cursor?: string, direction?: PaginationDirection) => {
      const requestId = ++historyRequest.current;
      setHistoryLoading(true);
      setHistoryError(false);
      if (historyAddress.current !== address) {
        setHistory(undefined);
        historyAddress.current = address;
      }
      getAccountHistory(address, cursor, direction)
        .then((accountHistory) => {
          if (requestId !== historyRequest.current) return;
          setHistory(accountHistory);
        })
        .catch(() => {
          if (requestId !== historyRequest.current) return;
          setHistory(undefined);
          historyAddress.current = undefined;
          setHistoryError(true);
        })
        .finally(() => {
          if (requestId !== historyRequest.current) return;
          setHistoryLoading(false);
        });
    },
    [getAccountHistory],
  );

  const fetchHolders = useCallback(
    (cursor?: string, direction?: PaginationDirection) => {
      if (!cursor && holders.length > 0) {
        return;
      }
      const requestId = ++holdersRequest.current;
      setHoldersLoading(true);
      setHoldersError(false);
      getHolders(cursor, direction)
        .then((holdersData) => {
          if (requestId !== holdersRequest.current) return;
          setHolders(holdersData.holders);
          setPageInfo(holdersData.pageInfo);
          if (!cursor) {
            setTotalCount(holdersData.totalCount);
          }
        })
        .catch(() => {
          if (requestId !== holdersRequest.current) return;
          setHolders([]);
          setPageInfo({ hasNextPage: false, hasPreviousPage: false, startCursor: '', endCursor: '' });
          setTotalCount(undefined);
          setHoldersError(true);
        })
        .finally(() => {
          if (requestId !== holdersRequest.current) return;
          setHoldersLoading(false);
        });
    },
    [getHolders, holders.length],
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
    const requestId = ++tokenInfoRequest.current;
    setTokenInfoLoading(true);
    setTokenInfoError(false);
    getTokenInfo()
      .then((tokenData) => {
        if (requestId !== tokenInfoRequest.current) return;
        setTokenInfo(tokenData);
      })
      .catch(() => {
        if (requestId !== tokenInfoRequest.current) return;
        setTokenInfo(undefined);
        setTokenInfoError(true);
      })
      .finally(() => {
        if (requestId !== tokenInfoRequest.current) return;
        setTokenInfoLoading(false);
      });
  }, [getTokenInfo]);

  const fetchTokenPrice = useCallback(() => {
    const requestId = ++tokenPriceRequest.current;
    setTokenPriceLoading(true);
    setTokenPriceError(false);
    getTokenPrice()
      .then((price) => {
        if (requestId !== tokenPriceRequest.current) return;
        setTokenPrice(price);
      })
      .catch(() => {
        if (requestId !== tokenPriceRequest.current) return;
        setTokenPrice(undefined);
        setTokenPriceError(true);
      })
      .finally(() => {
        if (requestId !== tokenPriceRequest.current) return;
        setTokenPriceLoading(false);
      });
  }, [getTokenPrice]);

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
      accountSummaryError,
      historyLoading,
      historyError,
      holders,
      holdersLoading,
      holdersError,
      totalCount,
      pageInfo,
      tokenInfo,
      tokenInfoLoading,
      tokenInfoError,
      tokenPrice,
      tokenPriceLoading,
      tokenPriceError,
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
      accountSummaryError,
      historyLoading,
      historyError,
      holders,
      holdersLoading,
      holdersError,
      totalCount,
      pageInfo,
      tokenInfo,
      tokenInfoLoading,
      tokenInfoError,
      tokenPrice,
      tokenPriceLoading,
      tokenPriceError,
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
