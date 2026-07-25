// DFX App 2.0 — home (buy/sell/swap) screen.
//
// Markup/classes ported 1:1 from the static preview's `v-buy` view (public/app2/index.html,
// `.seg`/`.panels`/`.quick`/`.fees`/`.pmethod`) — see components/Sheet-based pickers under
// components/pickers/ and screens/trade/ for the pieces this screen wires together. All
// asset/fiat/quote/payment data comes from @dfx.swiss/react (useAssetContext/useFiatContext/
// useBuy/useSell/useSwap/useBankAccountContext) via screens/trade/*; nothing here hand-rolls
// an API call.
//
// Buy/sell/swap keep independent selection + amount state (asset, chain, fiat, amount) instead
// of the static app's single shared `S.token`/`S.amount` re-validated on every tab switch —
// simpler to reason about, and it means switching tabs never loses what you were doing on the
// other one.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Blockchain,
  FiatPaymentMethod,
  useAssetContext,
  useBankAccountContext,
  useFiatContext,
} from '@dfx.swiss/react';
import type { Asset, BankAccount, Buy, Fiat, Sell, Swap } from '@dfx.swiss/react';
import { useLocation } from 'react-router-dom';
import { AssetPicker } from '../components/pickers/AssetPicker';
import { BankAccountPicker } from '../components/pickers/BankAccountPicker';
import { FiatPicker } from '../components/pickers/FiatPicker';
import { PaymentMethodPicker, paymentMethodsFor } from '../components/pickers/PaymentMethodPicker';
import { Spinner, useToast } from '../components/ui';
import { formatAmount, formatFiat, parseAmt, quickChipSymbol } from './trade/amount';
import { assetFor, availableAssets, groupAssets, heldBalance, parseBalances, shownChainsFor } from './trade/asset-pool';
import { chainName, isStableAsset } from './trade/blockchain-meta';
import { currenciesForBuy, currenciesForSell, hasNoDisplayableEstimate } from './trade/capabilities';
import { assetFormatter, fiatFormatter, mapThrownError, mapTransactionError } from './trade/errors';
import { AssetChainGlyph, FiatGlyph } from './trade/glyphs';
import { FeesPanel } from './trade/FeesPanel';
import { PaymentSheet } from './trade/PaymentSheet';
import { Landing } from './parts/Landing';
import type { Capability, Mode, TradeAsset } from './trade/types';
import { useBuyQuote, useSellQuote, useSwapQuote } from './trade/useTradeQuote';
import { useT, type TranslationKey } from '../i18n';
import { useWalletSession } from '../wallets/session';

const MODES: Mode[] = ['buy', 'sell', 'swap'];

const QUICK_FIAT_AMOUNTS = [50, 100, 250, 500];

const CHEVRON_RIGHT = (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const WALLET_ICON = (
  <svg viewBox="0 0 24 24" fill="none" style={{ width: 20, height: 20 }}>
    <rect x={3} y={6} width={18} height={13} rx={3} stroke="#0E3A63" strokeWidth={1.8} />
    <circle cx={16.5} cy={12.5} r={1.6} fill="#0E3A63" />
  </svg>
);

type AssetSlot = 'buyReceive' | 'sellPay' | 'swapFrom' | 'swapTo';
type FiatSlot = 'buyPay' | 'sellReceive';

/** Frozen at the moment the payment sheet opens (finding #2) — the sheet renders exclusively
 * from this snapshot so the 30s quote auto-refresh (paused while the sheet is open, but this
 * also covers the debounce window right after opening / an explicit retry) can never silently
 * swap the displayed IBAN/reference/amount out from under the user. */
interface PaymentSnapshot {
  mode: Mode;
  buy: Buy | null;
  sell: Sell | null;
  swap: Swap | null;
  rawError: unknown;
  loading: boolean;
  payAssetCode: string;
  receiveAssetCode: string;
  receiveBlockchain?: Blockchain;
  currency?: Fiat;
  amount: number;
}

export default function HomeScreen() {
  const { t, language } = useT();
  const { showToast } = useToast();
  const session = useWalletSession();
  const { getAssets } = useAssetContext();
  const { currencies } = useFiatContext();
  const { bankAccounts } = useBankAccountContext();
  const location = useLocation();

  const [mode, setMode] = useState<Mode>('buy');

  // ---- selection state (independent per mode) --------------------------------------------
  const [buyAsset, setBuyAsset] = useState<TradeAsset>();
  const [buyChain, setBuyChain] = useState<Blockchain>();
  const [buyFiat, setBuyFiat] = useState<Fiat>();
  const [buyMethod, setBuyMethod] = useState<FiatPaymentMethod>(FiatPaymentMethod.BANK);
  const [buyRaw, setBuyRaw] = useState('100');

  const [sellAsset, setSellAsset] = useState<TradeAsset>();
  const [sellChain, setSellChain] = useState<Blockchain>();
  const [sellFiat, setSellFiat] = useState<Fiat>();
  const [sellBankAccount, setSellBankAccount] = useState<BankAccount>();
  const [sellRaw, setSellRaw] = useState('');

  const [swapFromAsset, setSwapFromAsset] = useState<TradeAsset>();
  const [swapFromChain, setSwapFromChain] = useState<Blockchain>();
  const [swapToAsset, setSwapToAsset] = useState<TradeAsset>();
  const [swapToChain, setSwapToChain] = useState<Blockchain>();
  const [swapRaw, setSwapRaw] = useState('');

  // ---- sheet visibility --------------------------------------------------------------------
  const [assetPickerOpen, setAssetPickerOpen] = useState<AssetSlot | null>(null);
  const [fiatPickerOpen, setFiatPickerOpen] = useState<FiatSlot | null>(null);
  const [paymentMethodOpen, setPaymentMethodOpen] = useState(false);
  const [bankAccountOpen, setBankAccountOpen] = useState(false);
  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);
  // Frozen quote snapshot the payment sheet renders from (finding #2) — see PaymentSnapshot.
  const [sheetSnapshot, setSheetSnapshot] = useState<PaymentSnapshot | null>(null);
  const sheetWasOpenRef = useRef(false);
  const [sheetRetrying, setSheetRetrying] = useState(false);
  // All three modes ask the authenticated paymentInfos endpoint only once the user moves to
  // pay; the panels themselves run on the public quote endpoints, so account gates (no e-mail
  // on file, KYC, limit, …) can no longer take the rate display down with them.
  // `openAfterPaymentInfo` is the one-shot intent that opens the sheet as soon as that keyed
  // request settles — armed by the CTA, or by picking the payout account the sell CTA asked for.
  const [needPaymentInfo, setNeedPaymentInfo] = useState(false);
  const [openAfterPaymentInfo, setOpenAfterPaymentInfo] = useState(false);

  useEffect(() => {
    const requestedMode =
      new URLSearchParams(location.search).get('mode') ?? new URLSearchParams(window.location.search).get('mode');
    if (requestedMode === 'buy' || requestedMode === 'sell' || requestedMode === 'swap') setMode(requestedMode);
  }, [location.search]);

  // ---- asset pool (real data — useAssetContext(), grouped per ticker; see asset-pool.ts) ---
  const allAssets = useMemo<Asset[]>(() => getAssets(Object.values(Blockchain)), [getAssets]);
  const pool = useMemo(() => groupAssets(allAssets), [allAssets]);
  const balances = useMemo(() => parseBalances(window.location.search), []);
  const buyCurrencies = useMemo(() => currenciesForBuy(currencies), [currencies]);
  const sellCurrencies = useMemo(() => currenciesForSell(currencies), [currencies]);

  const buyPool = useMemo(() => availableAssets(pool, 'buy'), [pool]);
  const sellPoolAll = useMemo(() => availableAssets(pool, 'sell'), [pool]);
  const hasBalances = Object.keys(balances).length > 0;
  const sellPool = useMemo(
    () => (hasBalances ? sellPoolAll.filter((tk) => heldBalance(balances, tk.code) > 0) : sellPoolAll),
    [sellPoolAll, hasBalances, balances],
  );
  const swapAvailable = buyPool.length > 1 && sellPool.length > 0;

  // ---- defaults once the pool/currency list is loaded ---------------------------------------
  useEffect(() => {
    if (!buyPool.length) return;
    const currentChains = buyAsset ? shownChainsFor(buyAsset, 'buy', session.blockchains) : [];
    if (buyAsset && currentChains.length) {
      if (!currentChains.some((chain) => chain.blockchain === buyChain)) setBuyChain(currentChains[0].blockchain);
      return;
    }
    const reachable = buyPool.filter((asset) => shownChainsFor(asset, 'buy', session.blockchains).length > 0);
    const def = reachable.find((tk) => tk.code === 'BTC') ?? reachable[0];
    if (!def) return;
    const chains = shownChainsFor(def, 'buy', session.blockchains);
    setBuyAsset(def);
    setBuyChain(chains[0]?.blockchain);
  }, [buyPool, buyAsset, buyChain, session.blockchains]);

  useEffect(() => {
    if (!sellPool.length) return;
    const currentChains = sellAsset ? shownChainsFor(sellAsset, 'sell', session.blockchains) : [];
    if (sellAsset && currentChains.length) {
      if (!currentChains.some((chain) => chain.blockchain === sellChain)) setSellChain(currentChains[0].blockchain);
      return;
    }
    const reachable = sellPool.filter((asset) => shownChainsFor(asset, 'sell', session.blockchains).length > 0);
    const def = reachable.find((tk) => tk.code === 'BTC') ?? reachable[0];
    if (!def) return;
    const chains = shownChainsFor(def, 'sell', session.blockchains);
    setSellAsset(def);
    setSellChain(chains[0]?.blockchain);
  }, [sellPool, sellAsset, sellChain, session.blockchains]);

  useEffect(() => {
    if (!sellPool.length) return;
    const currentChains = swapFromAsset ? shownChainsFor(swapFromAsset, 'sell', session.blockchains) : [];
    if (swapFromAsset && currentChains.length) {
      if (!currentChains.some((chain) => chain.blockchain === swapFromChain)) {
        setSwapFromChain(currentChains[0].blockchain);
      }
      return;
    }
    const def = sellPool.find((asset) => shownChainsFor(asset, 'sell', session.blockchains).length > 0);
    if (!def) return;
    const chains = shownChainsFor(def, 'sell', session.blockchains);
    setSwapFromAsset(def);
    setSwapFromChain(chains[0]?.blockchain);
  }, [sellPool, swapFromAsset, swapFromChain, session.blockchains]);

  useEffect(() => {
    if (!buyPool.length) return;
    const currentChains = swapToAsset ? shownChainsFor(swapToAsset, 'buy', session.blockchains) : [];
    if (swapToAsset && swapToAsset.code !== swapFromAsset?.code && currentChains.length) {
      if (!currentChains.some((chain) => chain.blockchain === swapToChain)) setSwapToChain(currentChains[0].blockchain);
      return;
    }
    const rest = buyPool.filter(
      (tk) => tk.code !== swapFromAsset?.code && shownChainsFor(tk, 'buy', session.blockchains).length > 0,
    );
    const def = rest[0];
    if (!def) return;
    const chains = shownChainsFor(def, 'buy', session.blockchains);
    setSwapToAsset(def);
    setSwapToChain(chains[0]?.blockchain);
  }, [buyPool, swapToAsset, swapToChain, swapFromAsset, session.blockchains]);

  useEffect(() => {
    if (buyFiat || !buyCurrencies.length) return;
    setBuyFiat(buyCurrencies.find((c) => c.name === 'EUR') ?? buyCurrencies[0]);
  }, [buyCurrencies, buyFiat]);

  useEffect(() => {
    if (sellFiat || !sellCurrencies.length) return;
    setSellFiat(sellCurrencies.find((c) => c.name === 'EUR') ?? sellCurrencies[0]);
  }, [sellCurrencies, sellFiat]);

  useEffect(() => {
    if (!sellBankAccount && bankAccounts?.length) {
      setSellBankAccount(bankAccounts.find((a) => a.default) ?? bankAccounts[0]);
    }
  }, [bankAccounts, sellBankAccount]);

  // ---- resolved API assets + parsed amounts --------------------------------------------------
  const buyApiAsset = buyAsset && buyChain ? assetFor(buyAsset, buyChain, 'buy') : undefined;
  const sellApiAsset = sellAsset && sellChain ? assetFor(sellAsset, sellChain, 'sell') : undefined;
  const swapFromApiAsset = swapFromAsset && swapFromChain ? assetFor(swapFromAsset, swapFromChain, 'sell') : undefined;
  const swapToApiAsset = swapToAsset && swapToChain ? assetFor(swapToAsset, swapToChain, 'buy') : undefined;

  useEffect(() => {
    // only reset when the *fiat*/asset changes, not every time the user picks a method — reading
    // buyMethod here (without depending on it) is intentional, not a stale-closure bug
    if (buyFiat && !paymentMethodsFor(buyFiat, buyApiAsset).some((m) => m.id === buyMethod)) {
      setBuyMethod(FiatPaymentMethod.BANK);
    }
  }, [buyFiat, buyApiAsset]);

  const buyAmount = parseAmt(buyRaw, language);
  const sellAmount = parseAmt(sellRaw, language);
  const swapAmount = parseAmt(swapRaw, language);

  // ---- quotes (debounced + stale-guarded — see useQuoteEngine.ts) ---------------------------
  // Display and transaction are two separate requests, and they stay two separate engines:
  // buyQuote/swapQuote are the public quotes the panel renders (never account-gated), while
  // buyPayment/swapPayment fetch the real payment details and only run once the user taps the
  // CTA. Sharing one engine would mean an account gate (no e-mail on file, KYC, …) blanking
  // the rate the moment the sheet is opened.
  const buyQuote = useBuyQuote({
    enabled: session.isLoggedIn && mode === 'buy' && Boolean(buyRaw.trim()),
    asset: buyApiAsset,
    currency: buyFiat,
    amount: buyAmount,
    paymentMethod: buyMethod,
    // Also paused between CTA tap and sheet opening, so the panel number behind the spinner
    // can't flip to a new 30s quote in that window.
    paused: paymentSheetOpen || openAfterPaymentInfo,
  });
  const buyPayment = useBuyQuote({
    enabled: session.isLoggedIn && mode === 'buy' && needPaymentInfo,
    asset: buyApiAsset,
    currency: buyFiat,
    amount: buyAmount,
    paymentMethod: buyMethod,
    withPaymentInfo: true,
    paused: paymentSheetOpen,
  });
  const sellQuote = useSellQuote({
    // No IBAN on the display engine: the payout account only decides where the money goes, not
    // what the rate is, and asking the authenticated endpoint for it would put the panel back
    // behind the account gates (a user without a confirmed e-mail saw no rate at all).
    enabled: session.isLoggedIn && mode === 'sell' && Boolean(sellRaw.trim()),
    asset: sellApiAsset,
    currency: sellFiat,
    amount: sellAmount,
    paused: paymentSheetOpen || openAfterPaymentInfo,
  });
  const sellPayment = useSellQuote({
    enabled: session.isLoggedIn && mode === 'sell' && needPaymentInfo && Boolean(sellBankAccount?.iban),
    asset: sellApiAsset,
    currency: sellFiat,
    amount: sellAmount,
    iban: sellBankAccount?.iban,
    paused: paymentSheetOpen,
  });
  const swapQuote = useSwapQuote({
    enabled: session.isLoggedIn && mode === 'swap' && Boolean(swapRaw.trim()),
    sourceAsset: swapFromApiAsset,
    targetAsset: swapToApiAsset,
    amount: swapAmount,
    paused: paymentSheetOpen || openAfterPaymentInfo,
  });
  const swapPayment = useSwapQuote({
    enabled: session.isLoggedIn && mode === 'swap' && needPaymentInfo,
    sourceAsset: swapFromApiAsset,
    targetAsset: swapToApiAsset,
    amount: swapAmount,
    withPaymentInfo: true,
    paused: paymentSheetOpen,
  });

  const buyReady = !!buyQuote.data && buyQuote.isFresh && buyQuote.data.isValid !== false;
  const sellReady = !!sellQuote.data && sellQuote.isFresh && sellQuote.data.isValid !== false;
  const swapReady = !!swapQuote.data && swapQuote.isFresh && swapQuote.data.isValid !== false;

  const activeQuote = mode === 'buy' ? buyQuote : mode === 'sell' ? sellQuote : swapQuote;
  /** The engine that produces what the payment sheet shows — the authenticated payment-details
   * request of the active mode (for sell, the IBAN-bound one). */
  const activePayment = mode === 'buy' ? buyPayment : mode === 'sell' ? sellPayment : swapPayment;
  const activeThrownError = activeQuote.errorIsCurrent ? mapThrownError(t, activeQuote.error) : null;
  const activeValidityMessage =
    mode === 'buy' && buyQuote.data?.isValid === false && buyQuote.isFresh
      ? mapTransactionError(
          t,
          buyQuote.data.error,
          buyQuote.data.minVolume,
          buyQuote.data.maxVolume,
          fiatFormatter(buyFiat?.name ?? '', language),
        )
      : mode === 'sell' && sellQuote.data?.isValid === false && sellQuote.isFresh
        ? mapTransactionError(
            t,
            sellQuote.data.error,
            sellQuote.data.minVolume,
            sellQuote.data.maxVolume,
            assetFormatter(sellAsset?.code ?? '', language),
          )
        : mode === 'swap' && swapQuote.data?.isValid === false && swapQuote.isFresh
          ? mapTransactionError(
              t,
              swapQuote.data.error,
              swapQuote.data.minVolume,
              swapQuote.data.maxVolume,
              assetFormatter(swapFromAsset?.code ?? '', language),
            )
          : undefined;
  const canOpenGate = Boolean(activeValidityMessage || activeThrownError);
  /** A tap has been made and the sheet is waiting on the payment-details request it armed —
   * the CTA stays busy until that request settles. */
  const awaitingPaymentInfo = openAfterPaymentInfo;

  // ---- CTA -------------------------------------------------------------------------------
  const ctaEnabled = !session.isLoggedIn
    ? true
    : mode === 'buy'
      ? buyReady || canOpenGate
      : mode === 'swap'
        ? swapReady || canOpenGate
        : !!sellAmount && !!sellApiAsset && !!sellFiat && (sellReady || canOpenGate);

  // ---- payment-sheet snapshot (finding #2) ------------------------------------------------
  // Everything the sheet renders is captured here on open (and re-captured whenever the live
  // fetch this mode is showing finishes loading — see the effect below) instead of the sheet
  // reading buyQuote/sellQuote/swapQuote directly, so the 30s auto-refresh (paused via `paused:
  // paymentSheetOpen` above) can't silently swap the displayed IBAN/reference/amount out from
  // under the user while the sheet is on screen.
  const sheetPayAssetCode =
    mode === 'sell' ? (sellAsset?.code ?? '') : mode === 'swap' ? (swapFromAsset?.code ?? '') : '';
  const sheetReceiveAssetCode =
    mode === 'buy' ? (buyAsset?.code ?? '') : mode === 'swap' ? (swapToAsset?.code ?? '') : '';
  const sheetReceiveBlockchain = mode === 'buy' ? buyChain : mode === 'swap' ? swapToChain : undefined;
  const sheetCurrency = mode === 'buy' ? buyFiat : mode === 'sell' ? sellFiat : undefined;
  const sheetAmount = (mode === 'buy' ? buyAmount : mode === 'sell' ? sellAmount : swapAmount) ?? 0;
  const sheetLoadingLive = activePayment.loading;

  const latchSnapshot = () => {
    setSheetSnapshot({
      mode,
      buy: mode === 'buy' ? buyPayment.data : null,
      sell: mode === 'sell' ? sellPayment.data : null,
      swap: mode === 'swap' ? swapPayment.data : null,
      rawError: activePayment.errorIsCurrent ? activePayment.error : null,
      loading: sheetLoadingLive,
      payAssetCode: sheetPayAssetCode,
      receiveAssetCode: sheetReceiveAssetCode,
      receiveBlockchain: sheetReceiveBlockchain,
      currency: sheetCurrency,
      amount: sheetAmount,
    });
  };

  // One-shot open, armed by the CTA enabling the payment-details engine (for sell, by picking
  // the payout account the CTA asked for). `settled` is keyed, so what gets latched is that
  // exact response — or its account-gate error — never the public quote that was on screen a
  // moment ago, and never the previous missing-IBAN state.
  useEffect(() => {
    if (!openAfterPaymentInfo || !needPaymentInfo || !activePayment.settled) return;
    latchSnapshot();
    setOpenAfterPaymentInfo(false);
    setPaymentSheetOpen(true);
  }, [openAfterPaymentInfo, needPaymentInfo, activePayment.settled]);

  // A payment-details request that never settles (stalled mobile connection — the engine has no
  // request timeout) would otherwise leave the CTA disabled with a spinner forever, with no way
  // out but editing an input. Give up after 20s, release the CTA and say so.
  useEffect(() => {
    if (!awaitingPaymentInfo) return undefined;
    const timer = setTimeout(() => {
      setOpenAfterPaymentInfo(false);
      setNeedPaymentInfo(false);
      showToast(t('requestTimeout'), { assertive: true });
    }, 20_000);
    return () => clearTimeout(timer);
  }, [awaitingPaymentInfo, showToast, t]);

  // The armed intent belongs to the exact inputs that armed it: editing anything (or switching
  // modes) drops back to the public quote instead of opening a sheet the user no longer asked for.
  useEffect(() => {
    setOpenAfterPaymentInfo(false);
    setNeedPaymentInfo(false);
    // `sellBankAccount` is deliberately absent: picking the payout account is what *arms* the
    // sell intent, so listing it here would cancel the intent in the same commit that sets it.
  }, [
    mode,
    buyRaw,
    buyAsset,
    buyChain,
    buyFiat,
    buyMethod,
    sellRaw,
    sellAsset,
    sellChain,
    sellFiat,
    swapRaw,
    swapFromAsset,
    swapFromChain,
    swapToAsset,
    swapToChain,
  ]);

  // A frozen sheet changes only after an explicit Retry. Passive TTL refreshes remain paused,
  // and opening another modal can no longer re-latch live data behind the user's back.
  useEffect(() => {
    if (!sheetRetrying || !paymentSheetOpen || !activePayment.settled) return;
    latchSnapshot();
    setSheetRetrying(false);
  }, [sheetRetrying, paymentSheetOpen, activePayment.settled]);

  // On close: drop the snapshot and resume the engine with an immediate refresh, so the buy/
  // sell/swap panel behind the (now-closed) sheet isn't left showing whatever was current when
  // the sheet opened, possibly a while ago.
  useEffect(() => {
    if (sheetWasOpenRef.current && !paymentSheetOpen) {
      setSheetSnapshot(null);
      setSheetRetrying(false);
      // Stop asking the account-gated endpoint (and stop keeping a payment reference alive)
      // once the sheet is gone; the panel's own public quote keeps running either way.
      setNeedPaymentInfo(false);
      setOpenAfterPaymentInfo(false);
      activeQuote.refresh();
    }
    sheetWasOpenRef.current = paymentSheetOpen;
  }, [paymentSheetOpen]);

  const handleCta = () => {
    if (!session.isLoggedIn) {
      session.openConnect();
      return;
    }
    if (mode === 'sell' && !sellBankAccount) {
      setBankAccountOpen(true);
      return;
    }
    if (!ctaEnabled) return;
    // The panel runs on the public quote, so no payment details exist yet. Start the
    // payment-details request; the effect above opens the sheet on that exact response, which
    // is also what guards against showing numbers that have gone stale in the meantime.
    setNeedPaymentInfo(true);
    setOpenAfterPaymentInfo(true);
  };

  // ---- receive-panel display --------------------------------------------------------------
  // Home only renders once logged in (see the early `<Landing/>` return below), so — matching
  // the static app's own updateQuote() — an empty/zero amount reads "0". Sell shows its live
  // rate before any payout account is chosen (the IBAN is gated at confirm, not here); only
  // settled requests can produce quote errors.
  let receiveValue = '0';
  let receiveMeta = '';
  // True only for the live "Refreshes in Ns" countdown — the static app wraps that (and only that)
  // in `<span class="qcount">` for the tabular/dimmed styling; other meta text stays unwrapped.
  let receiveMetaCountdown = false;
  // A failed quote is a dead end without this: the engine retries itself on a short backoff
  // ladder (useQuoteEngine.ts) and then stops, so a persistent failure needs an explicit way
  // back in rather than leaving the panel stuck on "Rate unavailable" forever.
  let receiveShowRetry = false;
  if (mode === 'buy') {
    if (!buyAmount) receiveValue = '0';
    else if (buyQuote.loading) receiveValue = '…';
    else if (buyQuote.data && buyQuote.isFresh && hasNoDisplayableEstimate(buyQuote.data)) {
      receiveValue = '—';
      if (activeValidityMessage) receiveMeta = activeValidityMessage;
    } else if (buyQuote.data && buyQuote.isFresh) {
      receiveValue = formatAmount(buyQuote.data.estimatedAmount, 8, language);
      if (buyQuote.data.isValid === false) {
        // A real conversion for an order that still can't be placed — say why, never dress it
        // up with a refresh countdown.
        if (activeValidityMessage) receiveMeta = activeValidityMessage;
      } else if (buyQuote.secondsLeft > 0) {
        receiveMeta = t('quoteRefresh', { n: buyQuote.secondsLeft });
        receiveMetaCountdown = true;
      }
    } else {
      receiveValue = '—';
      receiveMeta = t('quoteErr');
      receiveShowRetry = true;
    }
  } else if (mode === 'sell') {
    if (!sellAmount) receiveValue = '0';
    else if (sellQuote.loading) receiveValue = '…';
    else if (sellQuote.data && sellQuote.isFresh && hasNoDisplayableEstimate(sellQuote.data)) {
      receiveValue = '—';
      if (activeValidityMessage) receiveMeta = activeValidityMessage;
    } else if (sellQuote.data && sellQuote.isFresh) {
      receiveValue = formatFiat(sellQuote.data.estimatedAmount, sellFiat?.name ?? '', language);
      if (sellQuote.data.isValid === false) {
        // A real conversion for an order that still can't be placed — say why, never dress it
        // up with a refresh countdown.
        if (activeValidityMessage) receiveMeta = activeValidityMessage;
      } else if (sellQuote.secondsLeft > 0) {
        receiveMeta = t('quoteRefresh', { n: sellQuote.secondsLeft });
        receiveMetaCountdown = true;
      }
    } else {
      receiveValue = '—';
      receiveMeta = t('quoteErr');
      receiveShowRetry = true;
    }
  } else {
    if (!swapAmount) receiveValue = '0';
    else if (swapQuote.loading) receiveValue = '…';
    else if (swapQuote.data && swapQuote.isFresh && hasNoDisplayableEstimate(swapQuote.data)) {
      receiveValue = '—';
      if (activeValidityMessage) receiveMeta = activeValidityMessage;
    } else if (swapQuote.data && swapQuote.isFresh) {
      receiveValue = formatAmount(swapQuote.data.estimatedAmount, 6, language);
      if (swapQuote.data.isValid === false) {
        // A real conversion for an order that still can't be placed — say why, never dress it
        // up with a refresh countdown.
        if (activeValidityMessage) receiveMeta = activeValidityMessage;
      } else if (swapQuote.secondsLeft > 0) {
        receiveMeta = t('quoteRefresh', { n: swapQuote.secondsLeft });
        receiveMetaCountdown = true;
      }
    } else {
      receiveValue = '—';
      receiveMeta = t('quoteErr');
      receiveShowRetry = true;
    }
  }

  const modeIndex = MODES.indexOf(mode);
  const isFiatPay = mode === 'buy';
  const isFiatReceive = mode === 'sell';

  const payRaw = mode === 'buy' ? buyRaw : mode === 'sell' ? sellRaw : swapRaw;
  const setPayRaw = mode === 'buy' ? setBuyRaw : mode === 'sell' ? setSellRaw : setSwapRaw;

  // Switch modes, pre-filling the target panel so a quote fires immediately (mirrors the static
  // app's setMode: `S.amount = mode==='buy' ? 100 : (S.token.stable ? 100 : 0.1)`). Buy already
  // defaults to '100'; here we only seed sell/swap when their (independent) raw is still empty so
  // an in-progress amount on that panel is never clobbered.
  const changeMode = (next: Mode) => {
    if (next === 'sell' && !sellRaw.trim()) {
      setSellRaw(sellAsset && isStableAsset(sellAsset.code) ? '100' : '0.1');
    } else if (next === 'swap' && !swapRaw.trim()) {
      setSwapRaw(swapFromAsset && isStableAsset(swapFromAsset.code) ? '100' : '0.1');
    }
    setMode(next);
    // Mirror the static app's setMode: any non-silent switch to sell/swap toasts the mode name
    // (`if(!silent && mode!=="buy") toast(t(mode))`). The deep-link init above uses setMode()
    // directly, so it stays silent — this only fires on a user tab/flip.
    if (next !== 'buy') showToast(t(next));
  };

  const flip = () => {
    if (mode === 'buy') changeMode('sell');
    else if (mode === 'sell') changeMode('buy');
    else {
      const a = swapFromAsset;
      const ac = swapFromChain;
      setSwapFromAsset(swapToAsset);
      setSwapFromChain(swapToChain);
      setSwapToAsset(a);
      setSwapToChain(ac);
    }
  };

  const buyMethods = paymentMethodsFor(buyFiat, buyApiAsset);
  const currentBuyMethod = buyMethods.find((m) => m.id === buyMethod);
  // Mirrors the static app: only offer the picker when there's a real choice — with a single
  // method the row drops its caret and stops being interactive (no pointless one-item sheet).
  const buyMethodPickable = buyMethods.length > 1;

  // Pre-login home is the landing hero (finding #1) — the trade form below is the logged-in
  // home only, same split as the static app's `#v-login` vs `#v-buy`. All the hooks above still
  // run unconditionally either way (rules of hooks), they just don't fetch while logged out.
  if (!session.isLoggedIn) return <Landing />;

  return (
    <div className="buy">
      <div className="seg" role="tablist" aria-label={t('cta')}>
        <span className="ind" style={{ transform: `translateX(${modeIndex}00%)` }} />
        {MODES.map((m) => (
          <button
            key={m}
            className={mode === m ? 'on' : ''}
            role="tab"
            aria-selected={mode === m}
            style={m === 'swap' && !swapAvailable ? { opacity: 0.38, pointerEvents: 'none' } : undefined}
            onClick={() => changeMode(m)}
          >
            {t(m)}
          </button>
        ))}
      </div>

      {session.isLoggedIn && (
        <button className="walletbar" type="button" onClick={() => session.openSwitcher()}>
          <span className="wbLogo">
            {/* Sizing/fit belongs to `.walletbar .wbLogo img` (23px, object-fit: contain) — an
                inline 100%/cover here used to crop brand marks to the edges of the white tile. */}
            {session.activeWallet?.icon ? <img src={session.activeWallet.icon} alt="" /> : WALLET_ICON}
          </span>
          <span className="wbtx">
            {(() => {
              const short = session.address ? `${session.address.slice(0, 6)}…${session.address.slice(-4)}` : '';
              const name = session.activeWallet?.name;
              const showName = Boolean(name && name !== 'Wallet');
              return (
                <>
                  <b>{showName ? name : short}</b>
                  <small>{showName ? short : (session.blockchain ?? '')}</small>
                </>
              );
            })()}
          </span>
          <span className="wbchg">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M7 10h10l-3-3M17 14H7l3 3"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>{t('change')}</span>
          </span>
        </button>
      )}

      <div className="panels">
        <div className="panel">
          <div className="prow">
            <span className="plabel">{t('youPay')}</span>
            <span className="pmeta" />
          </div>
          <div className="pinput">
            <input
              className="amt"
              inputMode="decimal"
              value={payRaw}
              placeholder="0"
              aria-label="Amount you pay"
              onChange={(e) => setPayRaw(e.target.value)}
            />
            {isFiatPay ? (
              <button className="pill" aria-label="Select pay currency" onClick={() => setFiatPickerOpen('buyPay')}>
                {buyFiat ? (
                  <span className="glyph">
                    <FiatGlyph code={buyFiat.name} />
                  </span>
                ) : null}
                <span className="meta">
                  <b>{buyFiat?.name ?? ''}</b>
                  <s>{buyFiat ? fiatDescription(t, buyFiat.name) : ''}</s>
                </span>
                <span className="caret">{CHEVRON_RIGHT}</span>
              </button>
            ) : (
              <button
                className="pill"
                aria-label="Select pay asset"
                onClick={() => setAssetPickerOpen(mode === 'sell' ? 'sellPay' : 'swapFrom')}
              >
                <PillAsset
                  asset={mode === 'sell' ? sellAsset : swapFromAsset}
                  chain={mode === 'sell' ? sellChain : swapFromChain}
                />
                <span className="caret">{CHEVRON_RIGHT}</span>
              </button>
            )}
          </div>
        </div>

        <button className="fab" aria-label="Flip direction" onClick={flip}>
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M7 4v13m0 0-3-3m3 3 3-3M17 20V7m0 0-3 3m3-3 3 3"
              stroke="currentColor"
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div className="panel recv" aria-live="polite">
          <div className="prow">
            <span className="plabel">{t('youReceive')}</span>
            <span className="pmeta">
              {receiveMetaCountdown ? <span className="qcount">{receiveMeta}</span> : receiveMeta}
              {receiveShowRetry && (
                <>
                  {' · '}
                  <button className="msg-retry" type="button" onClick={() => activeQuote.refresh()}>
                    {t('retry')}
                  </button>
                </>
              )}
            </span>
          </div>
          <div className="pinput">
            <input className="amt" value={receiveValue} readOnly aria-label="Amount you receive" />
            {isFiatReceive ? (
              <button
                className="pill"
                aria-label="Select receive currency"
                onClick={() => setFiatPickerOpen('sellReceive')}
              >
                {sellFiat ? (
                  <span className="glyph">
                    <FiatGlyph code={sellFiat.name} />
                  </span>
                ) : null}
                <span className="meta">
                  <b>{sellFiat?.name ?? ''}</b>
                  <s>{sellFiat ? fiatDescription(t, sellFiat.name) : ''}</s>
                </span>
                <span className="caret">{CHEVRON_RIGHT}</span>
              </button>
            ) : (
              <button
                className="pill"
                aria-label="Select receive asset"
                onClick={() => setAssetPickerOpen(mode === 'buy' ? 'buyReceive' : 'swapTo')}
              >
                <PillAsset
                  asset={mode === 'buy' ? buyAsset : swapToAsset}
                  chain={mode === 'buy' ? buyChain : swapToChain}
                />
                <span className="caret">{CHEVRON_RIGHT}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {mode === 'buy' && buyFiat && (
        <div className="quick">
          {QUICK_FIAT_AMOUNTS.map((v) => (
            <button key={v} onClick={() => setBuyRaw(String(v))}>
              {quickChipSymbol(buyFiat.name)}
              {v}
            </button>
          ))}
        </div>
      )}

      <FeesPanel
        mode={mode}
        quote={mode === 'buy' ? buyQuote.data : mode === 'sell' ? sellQuote.data : swapQuote.data}
        isFresh={mode === 'buy' ? buyQuote.isFresh : mode === 'sell' ? sellQuote.isFresh : swapQuote.isFresh}
        payAssetCode={mode === 'sell' ? (sellAsset?.code ?? '') : mode === 'swap' ? (swapFromAsset?.code ?? '') : ''}
        receiveAssetCode={mode === 'buy' ? (buyAsset?.code ?? '') : mode === 'swap' ? (swapToAsset?.code ?? '') : ''}
        currencyCode={mode === 'buy' ? (buyFiat?.name ?? '') : mode === 'sell' ? (sellFiat?.name ?? '') : ''}
        language={language}
      />

      {mode === 'buy' && (
        <div
          className="pmethod"
          style={buyMethodPickable ? undefined : { cursor: 'default' }}
          role={buyMethodPickable ? 'button' : undefined}
          tabIndex={buyMethodPickable ? 0 : undefined}
          onClick={buyMethodPickable ? () => setPaymentMethodOpen(true) : undefined}
        >
          <span className="ic">
            <svg viewBox="0 0 24 24" fill="none">
              <rect x={3} y={6} width={18} height={12} rx={2.4} stroke="currentColor" strokeWidth={1.7} />
              <path d="M3 10h18" stroke="currentColor" strokeWidth={1.7} />
            </svg>
          </span>
          <span className="tx">
            <b>{currentBuyMethod ? t(currentBuyMethod.nameKey) : t('payMethod')}</b>
            <small>{currentBuyMethod ? t(currentBuyMethod.descKey) : t('payMethodSub')}</small>
          </span>
          {buyMethodPickable && <span className="caret">{CHEVRON_RIGHT}</span>}
        </div>
      )}

      <button
        className="btn-primary cta"
        style={mode === 'buy' ? undefined : { marginTop: 'auto' }}
        // The payment-details request between tap and sheet is short but not instant — without
        // this the CTA looked dead for a moment and invited a second tap.
        disabled={session.isLoggedIn && (!ctaEnabled || awaitingPaymentInfo)}
        aria-busy={awaitingPaymentInfo || undefined}
        onClick={handleCta}
      >
        {session.isLoggedIn ? (
          <>
            <span>{t(mode)}</span>{' '}
            <span>
              {mode === 'swap'
                ? `${swapFromAsset?.code ?? ''} → ${swapToAsset?.code ?? ''}`
                : mode === 'sell'
                  ? (sellAsset?.code ?? '')
                  : (buyAsset?.code ?? '')}
            </span>
          </>
        ) : (
          <span>{t('connect')}</span>
        )}
        {awaitingPaymentInfo ? (
          <Spinner />
        ) : (
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12h14m0 0-6-6m6 6-6 6"
              stroke="#fff"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
      <div className="secure">
        <svg viewBox="0 0 24 24" fill="none">
          <rect x={5} y={11} width={14} height={9} rx={2} stroke="currentColor" strokeWidth={1.6} />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth={1.6} />
        </svg>
        <span>{mode === 'sell' ? t('securedSell') : mode === 'swap' ? t('securedSwap') : t('secured')}</span>
      </div>

      <AssetPickerSlot
        slot={assetPickerOpen}
        onClose={() => setAssetPickerOpen(null)}
        buyPool={buyPool}
        sellPool={sellPool}
        balances={balances}
        sessionBlockchains={session.blockchains}
        swapFromCode={swapFromAsset?.code}
        swapToCode={swapToAsset?.code}
        selectedCode={
          assetPickerOpen === 'buyReceive'
            ? buyAsset?.code
            : assetPickerOpen === 'sellPay'
              ? sellAsset?.code
              : assetPickerOpen === 'swapFrom'
                ? swapFromAsset?.code
                : swapToAsset?.code
        }
        selectedBlockchain={
          assetPickerOpen === 'buyReceive'
            ? buyChain
            : assetPickerOpen === 'sellPay'
              ? sellChain
              : assetPickerOpen === 'swapFrom'
                ? swapFromChain
                : swapToChain
        }
        onSelectBuyReceive={(tk, bc) => {
          setBuyAsset(tk);
          setBuyChain(bc);
        }}
        onSelectSellPay={(tk, bc) => {
          setSellAsset(tk);
          setSellChain(bc);
        }}
        onSelectSwapFrom={(tk, bc) => {
          setSwapFromAsset(tk);
          setSwapFromChain(bc);
        }}
        onSelectSwapTo={(tk, bc) => {
          setSwapToAsset(tk);
          setSwapToChain(bc);
        }}
      />

      <FiatPicker
        open={fiatPickerOpen === 'buyPay'}
        onClose={() => setFiatPickerOpen(null)}
        titleId="buyFiatSheetTitle"
        currencies={buyCurrencies}
        value={buyFiat}
        onSelect={setBuyFiat}
      />
      <FiatPicker
        open={fiatPickerOpen === 'sellReceive'}
        onClose={() => setFiatPickerOpen(null)}
        titleId="sellFiatSheetTitle"
        currencies={sellCurrencies}
        value={sellFiat}
        onSelect={setSellFiat}
      />

      <PaymentMethodPicker
        open={paymentMethodOpen}
        onClose={() => setPaymentMethodOpen(false)}
        titleId="payMethodSheetTitle"
        options={buyMethods}
        value={buyMethod}
        onSelect={setBuyMethod}
      />

      <BankAccountPicker
        open={bankAccountOpen}
        onClose={() => setBankAccountOpen(false)}
        titleId="bankAccountSheetTitle"
        value={sellBankAccount}
        onSelect={(account) => {
          setSellBankAccount(account);
          // The user only reached this picker by tapping the sell CTA, so selecting an account
          // continues that intent: fetch the payment details for it and open the sheet.
          setNeedPaymentInfo(true);
          setOpenAfterPaymentInfo(true);
        }}
      />

      <PaymentSheet
        open={paymentSheetOpen}
        onClose={() => setPaymentSheetOpen(false)}
        onDone={() => setPaymentSheetOpen(false)}
        mode={sheetSnapshot?.mode ?? mode}
        loading={sheetSnapshot?.loading ?? sheetLoadingLive}
        rawError={sheetSnapshot?.rawError ?? null}
        buy={sheetSnapshot?.buy ?? null}
        sell={sheetSnapshot?.sell ?? null}
        swap={sheetSnapshot?.swap ?? null}
        payAssetCode={sheetSnapshot?.payAssetCode ?? sheetPayAssetCode}
        receiveAssetCode={sheetSnapshot?.receiveAssetCode ?? sheetReceiveAssetCode}
        receiveBlockchain={sheetSnapshot?.receiveBlockchain ?? sheetReceiveBlockchain}
        currency={sheetSnapshot?.currency ?? sheetCurrency}
        amount={sheetSnapshot?.amount ?? sheetAmount}
        sessionAddress={session.address}
        onRetry={() => {
          setSheetSnapshot((snapshot) => (snapshot ? { ...snapshot, loading: true } : snapshot));
          setSheetRetrying(true);
          // Must be the engine the sheet renders from: refreshing the panel's public quote would
          // never re-run paymentInfos, so a gate the user just cleared (e-mail confirmed, KYC
          // done) could never be re-checked from inside the sheet. Re-arming the flag keeps that
          // engine enabled — `refresh()` is a no-op on a disabled engine — and applies to all
          // three modes now that sell asks for its payment details the same way.
          setNeedPaymentInfo(true);
          activePayment.refresh();
        }}
        onReconnect={() => session.openConnect()}
      />
    </div>
  );
}

function PillAsset({ asset, chain }: { asset: TradeAsset | undefined; chain: Blockchain | undefined }) {
  if (!asset) {
    return (
      <span className="meta">
        <b>—</b>
      </span>
    );
  }
  return (
    <>
      <AssetChainGlyph code={asset.code} blockchain={chain} />
      <span className="meta">
        <b>{asset.code}</b>
        <s>{chain ? chainName(chain) : asset.description}</s>
      </span>
    </>
  );
}

function fiatDescription(t: (key: TranslationKey) => string, code: string): string {
  // Only EUR/CHF get a spelled-out name; everything else (USD, …) shows its raw code, mirroring
  // the static app's fiatName() (`FIAT_LABEL={EUR,CHF}` → t(); else the currency's own name/code).
  const key = code === 'EUR' ? 'curEur' : code === 'CHF' ? 'curChf' : undefined;
  return key ? t(key) : code;
}

interface AssetPickerSlotProps {
  slot: AssetSlot | null;
  onClose: () => void;
  buyPool: TradeAsset[];
  sellPool: TradeAsset[];
  balances: Record<string, number>;
  sessionBlockchains?: readonly string[];
  swapFromCode?: string;
  swapToCode?: string;
  selectedCode?: string;
  selectedBlockchain?: Blockchain;
  onSelectBuyReceive: (asset: TradeAsset, chain: Blockchain) => void;
  onSelectSellPay: (asset: TradeAsset, chain: Blockchain) => void;
  onSelectSwapFrom: (asset: TradeAsset, chain: Blockchain) => void;
  onSelectSwapTo: (asset: TradeAsset, chain: Blockchain) => void;
}

/** A single AssetPicker sheet reused for every asset-selecting pill — its pool/capability/
 * onSelect are computed from whichever pill triggered it (`slot`). Keeps props valid even
 * while `open` is false so the sheet's close transition doesn't flash empty content. */
function AssetPickerSlot({
  slot,
  onClose,
  buyPool,
  sellPool,
  balances,
  sessionBlockchains,
  swapFromCode,
  swapToCode,
  selectedCode,
  selectedBlockchain,
  onSelectBuyReceive,
  onSelectSellPay,
  onSelectSwapFrom,
  onSelectSwapTo,
}: AssetPickerSlotProps) {
  const effective = slot ?? 'buyReceive';
  const config: {
    pool: TradeAsset[];
    cap: Capability;
    excludeCode?: string;
    sortByBalance?: boolean;
    onSelect: (asset: TradeAsset, chain: Blockchain) => void;
  } =
    effective === 'buyReceive'
      ? { pool: buyPool, cap: 'buy', onSelect: onSelectBuyReceive }
      : effective === 'sellPay'
        ? { pool: sellPool, cap: 'sell', sortByBalance: true, onSelect: onSelectSellPay }
        : effective === 'swapFrom'
          ? { pool: sellPool, cap: 'sell', excludeCode: swapToCode, sortByBalance: true, onSelect: onSelectSwapFrom }
          : { pool: buyPool, cap: 'buy', excludeCode: swapFromCode, onSelect: onSelectSwapTo };

  return (
    <AssetPicker
      open={slot !== null}
      onClose={onClose}
      titleId="assetSheetTitle"
      titleKey="chooseAsset"
      pool={config.pool}
      cap={config.cap}
      sessionBlockchains={sessionBlockchains}
      balances={balances}
      sortByBalance={config.sortByBalance}
      excludeCode={config.excludeCode}
      selectedCode={selectedCode}
      selectedBlockchain={selectedBlockchain}
      onSelect={config.onSelect}
    />
  );
}
