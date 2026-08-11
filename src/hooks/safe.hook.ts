import { ApiError, Asset, Blockchain, CustodyAddressType, CustodyPdfQuery, CustodyValueCurrency, toCustodyAccountId, useCustody, CustodyAccount, CustodyAsset, CustodyBalance, CustodyHistory, CustodyHistoryEntry, CustodyOrder, CustodyOrderHistory, CustodyOrderType, Fiat, SignIn, useAssetContext, useAuthContext, useBuy, useSessionContext, useUser, useUserContext } from '@dfx.swiss/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { canActOn, isOwnAccount } from 'src/util/safe-account';
import { downloadPdfFromString } from 'src/util/utils';
import { OrderFormData } from './order.hook';

const DEPOSIT_PAIRS: Record<string, string> = {
  EUR: 'dEURO',
  CHF: 'ZCHF',
};

const WITHDRAW_PAIRS: Record<string, string> = Object.entries(DEPOSIT_PAIRS).reduce(
  (acc, [fiat, custody]) => ({ ...acc, [custody]: fiat }),
  {},
);

/** The loads that follow the selected account; each tracks its own generation. */
type LoadKind = 'portfolio' | 'history' | 'orders';

/** Stable identity for an account, including the legacy Safe, which has no id. */
function accountKey(account: CustodyAccount): string {
  return account.isLegacy ? 'legacy' : String(account.id);
}

export interface SendOrderFormData {
  asset: Asset;
  amount?: string;
  targetAmount?: string;
  address: string;
}

export interface PdfDownloadParams {
  date: string;
  currency: CustodyValueCurrency;
}

export interface UseSafeResult {
  isInitialized: boolean;
  isLoadingPortfolio: boolean;
  isLoadingHistory: boolean;
  isLoadingOrderHistory: boolean;
  portfolio: CustodyBalance;
  history: CustodyHistoryEntry[];
  orderHistory: CustodyOrderHistory[];
  error?: string;
  custodyAddress?: string;
  custodyBlockchains?: Blockchain[];
  availableCurrencies?: Fiat[];
  availableAssets?: CustodyAsset[];
  receiveableAssets?: Asset[];
  withdrawableAssets?: Asset[];
  withdrawableCurrencies?: Fiat[];
  sendableAssets?: Asset[];
  swappableSourceAssets?: Asset[];
  swappableTargetAssets?: Asset[];
  custodyAccounts: CustodyAccount[];
  selectedAccount?: CustodyAccount;
  isAccountsLoaded: boolean;
  canTransact: boolean;
  selectAccount: (account: CustodyAccount) => void;
  setSelectedSourceAsset: (asset: string) => void;
  fetchPaymentInfo: (data: OrderFormData) => Promise<CustodyOrder>;
  fetchReceiveInfo: (data: OrderFormData) => Promise<CustodyOrder>;
  fetchSwapInfo: (data: OrderFormData) => Promise<CustodyOrder>;
  fetchWithdrawInfo: (data: OrderFormData) => Promise<CustodyOrder>;
  fetchSendInfo: (data: SendOrderFormData) => Promise<CustodyOrder>;
  confirmPayment: () => Promise<void>;
  confirmReceive: () => Promise<void>;
  confirmSwap: () => Promise<void>;
  confirmWithdraw: () => Promise<void>;
  confirmSend: () => Promise<void>;
  reloadOrderHistory: () => void;
  pairMap: (asset: string) => Asset | Fiat | undefined;
  downloadPdf: (params: PdfDownloadParams) => Promise<void>;
}

export function useSafe(): UseSafeResult {
  const custody = useCustody();
  const { currencies } = useBuy();
  const { session } = useAuthContext();
  const { changeUserAddress } = useUser();
  const { getAssets } = useAssetContext();
  const { user, isUserLoading, reloadUser, custodyAddresses } = useUserContext();
  const { isLoggedIn, tokenStore } = useSessionContext();

  const currentOrderId = useRef<number>();

  const [error, setError] = useState<string>();
  const [isInitialized, setIsInitialized] = useState(false);
  const [custodyAddress, setCustodyAddress] = useState<string>();
  const [custodyBlockchains, setCustodyBlockchains] = useState<Blockchain[]>([]);
  const [portfolio, setPortfolio] = useState<CustodyBalance>({ totalValue: { chf: 0, eur: 0, usd: 0 }, balances: [] });
  const [history, setHistory] = useState<CustodyHistoryEntry[]>([]);
  const [orderHistory, setOrderHistory] = useState<CustodyOrderHistory[]>([]);
  const [isLoadingPortfolio, setIsLoadingPortfolio] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isLoadingOrderHistory, setIsLoadingOrderHistory] = useState(true);
  const [selectedSourceAsset, setSelectedSourceAsset] = useState<string>();
  const [custodyAccounts, setCustodyAccounts] = useState<CustodyAccount[]>([]);
  const [isAccountsLoaded, setIsAccountsLoaded] = useState(false);
  // Keyed by a stable string, not by the account object: an object in an effect's dependency
  // list is a new reference on every render and would re-fetch forever. The legacy Safe has a
  // null id, so it needs a key of its own rather than being addressed by id.
  const [selectedAccountKey, setSelectedAccountKey] = useState<string>();

  const selectedAccount = useMemo(
    () => custodyAccounts.find((a) => accountKey(a) === selectedAccountKey),
    [custodyAccounts, selectedAccountKey],
  );

  /** Same predicate the picker labels by, so the list cannot promise what the screen refuses. */
  const canTransact = isAccountsLoaded && selectedAccount !== undefined && canActOn(selectedAccount);

  // ---- Safe Screen Initialization ----

  useEffect(() => {
    async function createCustodyOrSwitch(): Promise<void> {
      const custodyAddr = custodyAddresses.at(0);
      if (!custodyAddr) {
        const { accessToken } = await createCustodyUser();
        tokenStore.set('custody', accessToken);
        await reloadUser();
      } else {
        setCustodyAddress(custodyAddr.address);
        setCustodyBlockchains([Blockchain.ETHEREUM, Blockchain.CITREA]);
        if (!tokenStore.get('custody') && session?.address !== custodyAddr.address) {
          const custodyToken = (await changeUserAddress(custodyAddr.address)).accessToken;
          tokenStore.set('custody', custodyToken);
        }
      }
    }

    if (!isUserLoading && session && user && isLoggedIn) {
      createCustodyOrSwitch()
        .catch((error: ApiError) => setError(error.message ?? 'Unknown error'))
        .finally(() => setIsInitialized(true));
    }
  }, [isUserLoading, user, isLoggedIn, session, reloadUser, changeUserAddress, tokenStore]);

  useEffect(() => {
    if (!isInitialized || !user || !isLoggedIn) return;
    let cancelled = false;
    getCustodyAccounts()
      .then((accounts) => {
        if (cancelled) return;
        setCustodyAccounts(accounts);
        // Prefer the caller's own Safe; with access to other people's only, take the first.
        const ownAccount = accounts.find(isOwnAccount);
        const defaultAccount = ownAccount ?? accounts.at(0);
        setSelectedAccountKey(defaultAccount !== undefined ? accountKey(defaultAccount) : undefined);
        setIsAccountsLoaded(true);
      })
      .catch((error: ApiError) => !cancelled && setError(error.message ?? 'Unknown error'));
    return () => {
      cancelled = true;
    };
  }, [isInitialized, user, isLoggedIn]);

  /**
   * Accepts a result only if no newer request of the same kind has been started since.
   *
   * Comparing against the current selection is not enough: switching away and back leaves the
   * same selection in place, so a slow first answer would still be accepted and would overwrite
   * the fresher one that arrived meanwhile. A counter per kind of load has no such gap.
   */
  const generations = useRef<Record<LoadKind, number>>({ portfolio: 0, history: 0, orders: 0 });

  // A manual reload is not an effect, so nothing would cancel it on the way out. This does.
  // Set on the way in as well as cleared on the way out: an effect that is torn down and run
  // again — as StrictMode does on mount — would otherwise leave the screen permanently deaf.
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  /**
   * Starts a request and returns a function that invalidates it, which effects use on cleanup
   * so a request never outlives a newer one of its kind. Leaving the screen is caught
   * separately, because the manual reload after an order has no cleanup to hang that on.
   *
   * The setters live inside, so adding a kind forces a decision here instead of silently
   * leaving that spinner running forever. They are state setters, whose identity React keeps
   * stable, so the callback needs no dependencies.
   */
  const runLatest = useCallback(function <T>(
    kind: LoadKind,
    request: Promise<T>,
    apply: (value: T) => void,
  ): () => void {
    const setLoading: Record<LoadKind, (isLoading: boolean) => void> = {
      portfolio: setIsLoadingPortfolio,
      history: setIsLoadingHistory,
      orders: setIsLoadingOrderHistory,
    };

    const generation = generations.current[kind] + 1;
    generations.current[kind] = generation;
    const isLatest = (): boolean => isMounted.current && generations.current[kind] === generation;

    request
      .then((value) => isLatest() && apply(value))
      .catch((error: ApiError) => isLatest() && setError(error.message ?? 'Unknown error'))
      .finally(() => isLatest() && setLoading[kind](false));

    return () => {
      if (isLatest()) generations.current[kind] = generation + 1;
    };
  }, []);

  useEffect(() => {
    if (!user || !isLoggedIn || !isAccountsLoaded) return;
    setIsLoadingPortfolio(true);
    return runLatest('portfolio', getBalances(selectedAccount), setPortfolio);
  }, [user, isLoggedIn, isAccountsLoaded, selectedAccountKey, custodyAccounts, runLatest]);

  useEffect(() => {
    if (!user || !isLoggedIn || !isAccountsLoaded) return;
    setIsLoadingHistory(true);
    return runLatest('history', getHistory(selectedAccount), ({ totalValue }) => setHistory(totalValue));
  }, [user, isLoggedIn, isAccountsLoaded, selectedAccountKey, custodyAccounts, runLatest]);

  function reloadOrderHistory(): void {
    setIsLoadingOrderHistory(true);
    runLatest('orders', getOrderHistory(selectedAccount), setOrderHistory);
  }

  useEffect(() => {
    if (!user || !isLoggedIn || !isAccountsLoaded) return;
    setIsLoadingOrderHistory(true);
    return runLatest('orders', getOrderHistory(selectedAccount), setOrderHistory);
  }, [user, isLoggedIn, isAccountsLoaded, selectedAccountKey, custodyAccounts, runLatest]);

  // ---- Available Deposit Pairs ----

  const availableCurrencies = useMemo(() => {
    return currencies?.filter((c) => Object.keys(DEPOSIT_PAIRS).includes(c.name));
  }, [currencies]);

  const availableAssets = useMemo(() => {
    return getAssets([Blockchain.ETHEREUM, Blockchain.CITREA], { buyable: true, comingSoon: false }).filter((a) =>
      Object.values(DEPOSIT_PAIRS).includes(a.name),
    );
  }, [getAssets]);

  const receiveableAssets = useMemo(() => {
    return custodyBlockchains.length > 0
      ? getAssets(custodyBlockchains, { sellable: true, buyable: true, comingSoon: false })
      : [];
  }, [getAssets, custodyBlockchains]);

  const withdrawableAssets = useMemo(() => {
    const assets =
      custodyBlockchains.length > 0 ? getAssets(custodyBlockchains, { sellable: true, comingSoon: false }) : [];
    return assets.filter(
      (a) =>
        Object.keys(WITHDRAW_PAIRS).includes(a.name) &&
        portfolio.balances.find((b) => b.asset.name === a.name && b.balance > 0),
    );
  }, [getAssets, custodyBlockchains, portfolio.balances]);

  const withdrawableCurrencies = useMemo(() => {
    return (availableCurrencies ?? []).filter((currency) =>
      portfolio.balances.some(
        (balance) => balance.asset.name === DEPOSIT_PAIRS[currency.name as keyof typeof DEPOSIT_PAIRS],
      ),
    );
  }, [availableCurrencies, portfolio.balances]);

  const swappableSourceAssets = useMemo(() => {
    const sourceAssets =
      custodyBlockchains.length > 0 ? getAssets(custodyBlockchains, { sellable: true, comingSoon: false }) : [];
    return sourceAssets.filter((a) => portfolio.balances.find((b) => b.asset.name === a.name && b.balance > 0));
  }, [getAssets, custodyBlockchains, portfolio.balances]);

  const swappableTargetAssets = useMemo(() => {
    const targetAssets =
      custodyBlockchains.length > 0 ? getAssets(custodyBlockchains, { buyable: true, comingSoon: false }) : [];
    return targetAssets?.filter((a) => a.name !== selectedSourceAsset);
  }, [getAssets, custodyBlockchains, selectedSourceAsset]);

  const sendableAssets = useMemo(() => {
    const assets =
      custodyBlockchains.length > 0 ? getAssets(custodyBlockchains, { sellable: true, comingSoon: false }) : [];
    return assets.filter((a) => portfolio.balances.find((b) => b.asset.name === a.name && b.balance > 0));
  }, [getAssets, custodyBlockchains, portfolio.balances]);

  const pairMap = useCallback(
    (asset: string) =>
      availableAssets?.find((a) => a.name === DEPOSIT_PAIRS[asset]) ||
      availableCurrencies?.find((c) => c.name === WITHDRAW_PAIRS[asset]),
    [availableAssets, availableCurrencies],
  );

  function selectAccount(account: CustodyAccount): void {
    setSelectedAccountKey(accountKey(account));
  }

  // ---- API Calls ----

  /**
   * Orders are placed against the custody address, not the address the caller signed in with.
   * Without that token the request would go out as the session and be refused by the API, so
   * fail here rather than there.
   */
  /**
   * The API prices from one side or the other, never from both and never from neither. Deciding
   * that here keeps a request that cannot be answered from going out at all.
   */
  function orderAmount(source?: string, target?: string): { sourceAmount: number } | { targetAmount: number } {
    if (source) return { sourceAmount: Number(source) };
    if (target) return { targetAmount: Number(target) };
    throw new Error('Order needs an amount');
  }

  /** A withdrawal has to name the account it pays out to; the API rejects it otherwise. */
  function withdrawalIban(iban?: string): string {
    if (!iban) throw new Error('Withdrawal needs a bank account');
    return iban;
  }

  function custodyToken(): string {
    const token = tokenStore.get('custody');
    if (!token) throw new Error('Custody session is not available');
    return token;
  }

  async function createCustodyUser(): Promise<SignIn> {
    return custody.signup({ addressType: CustodyAddressType.EVM });
  }

  async function getCustodyAccounts(): Promise<CustodyAccount[]> {
    return custody.getAccounts();
  }

  /**
   * No account at all means the list has not been resolved to one; the plain endpoints read the
   * caller's own Safe, which is the closest thing to a correct answer and the pre-existing
   * behaviour. Acting is refused separately in that state (see canTransact).
   */
  async function getBalances(account?: CustodyAccount): Promise<CustodyBalance> {
    return account ? custody.getAccountBalance(toCustodyAccountId(account)) : custody.getBalance();
  }

  async function getHistory(account?: CustodyAccount): Promise<CustodyHistory> {
    return account ? custody.getAccountHistory(toCustodyAccountId(account)) : custody.getHistory();
  }

  async function getOrderHistory(account?: CustodyAccount): Promise<CustodyOrderHistory[]> {
    return account ? custody.getAccountOrders(toCustodyAccountId(account)) : custody.getOrders();
  }

  async function fetchPaymentInfo(data: OrderFormData): Promise<CustodyOrder> {
    const order = await custody.createOrder({
        type: CustodyOrderType.DEPOSIT,
        sourceAsset: data.sourceAsset.name,
        targetAsset: DEPOSIT_PAIRS[data.sourceAsset.name],
        sourceAmount: Number(data.sourceAmount),
        paymentMethod: data.paymentMethod,
      }, custodyToken());

    currentOrderId.current = order.orderId;
    return order;
  }

  async function fetchReceiveInfo(data: OrderFormData): Promise<CustodyOrder> {
    const order = await custody.createOrder({
        type: CustodyOrderType.RECEIVE,
        sourceAsset: data.sourceAsset.name,
        targetAsset: data.sourceAsset.name,
        sourceAmount: Number(data.sourceAmount),
      }, custodyToken());

    currentOrderId.current = order.orderId;
    return order;
  }

  async function fetchSwapInfo(data: OrderFormData): Promise<CustodyOrder> {
    const order = await custody.createOrder({
        type: CustodyOrderType.SWAP,
        sourceAsset: data.sourceAsset.name,
        targetAsset: data.targetAsset.name,
        ...orderAmount(data.sourceAmount, data.targetAmount),
      }, custodyToken());

    currentOrderId.current = order.orderId;
    return order;
  }

  async function fetchWithdrawInfo(data: OrderFormData): Promise<CustodyOrder> {
    const order = await custody.createOrder({
        type: CustodyOrderType.WITHDRAWAL,
        sourceAsset: data.sourceAsset.name,
        targetAsset: WITHDRAW_PAIRS[data.sourceAsset.name],
        ...orderAmount(data.sourceAmount, data.targetAmount),
        targetIban: withdrawalIban(data.bankAccount?.iban),
      }, custodyToken());

    currentOrderId.current = order.orderId;
    return order;
  }

  async function fetchSendInfo(data: SendOrderFormData): Promise<CustodyOrder> {
    const order = await custody.createOrder({
        type: CustodyOrderType.SEND,
        sourceAsset: data.asset.name,
        targetAsset: data.asset.name,
        ...orderAmount(data.amount, data.targetAmount),
        targetAddress: data.address,
        targetBlockchain: data.asset.blockchain,
      }, custodyToken());

    currentOrderId.current = order.orderId;
    return order;
  }

  async function confirmPayment(): Promise<void> {
    if (!currentOrderId.current) return;

    await custody.confirmOrder(currentOrderId.current, custodyToken());
    currentOrderId.current = undefined;
  }

  async function confirmReceive(): Promise<void> {
    return confirmPayment();
  }

  async function confirmSwap(): Promise<void> {
    return confirmPayment();
  }

  async function confirmWithdraw(): Promise<void> {
    return confirmPayment();
  }

  async function confirmSend(): Promise<void> {
    return confirmPayment();
  }

  async function downloadPdf(params: PdfDownloadParams): Promise<void> {
    // Refuse rather than guess: before the list has arrived we do not know which account the
    // statement would be about, and quietly serving the caller's own would be a wrong answer.
    if (!isAccountsLoaded) {
      throw new Error('Accounts are still loading');
    }

    const query: CustodyPdfQuery = { currency: params.currency, date: new Date(params.date) };
    const response = selectedAccount
      ? await custody.getAccountPdf(toCustodyAccountId(selectedAccount), query)
      : await custody.getPdf(query);

    const filename = `${params.date}_DFX_Safe_Balance_Report.pdf`;
    downloadPdfFromString(response.pdfData, filename);
  }

  return useMemo<UseSafeResult>(
    () => ({
      isInitialized,
      isLoadingPortfolio,
      isLoadingHistory,
      isLoadingOrderHistory,
      portfolio,
      history,
      orderHistory,
      error,
      custodyAddress,
      custodyBlockchains,
      availableCurrencies,
      availableAssets,
      receiveableAssets,
      withdrawableAssets,
      withdrawableCurrencies,
      sendableAssets,
      swappableSourceAssets,
      swappableTargetAssets,
      custodyAccounts,
      selectedAccount,
      isAccountsLoaded,
      canTransact,
      selectAccount,
      setSelectedSourceAsset,
      fetchPaymentInfo,
      fetchReceiveInfo,
      fetchSwapInfo,
      fetchWithdrawInfo,
      fetchSendInfo,
      confirmPayment,
      confirmReceive,
      confirmSwap,
      confirmWithdraw,
      confirmSend,
      reloadOrderHistory,
      pairMap,
      downloadPdf,
    }),
    [
      isInitialized,
      isLoadingPortfolio,
      isLoadingHistory,
      isLoadingOrderHistory,
      portfolio,
      history,
      orderHistory,
      error,
      custodyAddress,
      custodyBlockchains,
      availableCurrencies,
      availableAssets,
      receiveableAssets,
      withdrawableAssets,
      withdrawableCurrencies,
      sendableAssets,
      swappableSourceAssets,
      swappableTargetAssets,
      custodyAccounts,
      selectedAccount,
      isAccountsLoaded,
      selectedSourceAsset,
      pairMap,
    ],
  );
}
