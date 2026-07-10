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

import { useEffect, useMemo, useState } from 'react';
import {
  Blockchain,
  FiatPaymentMethod,
  useAssetContext,
  useBankAccountContext,
  useFiatContext,
} from '@dfx.swiss/react';
import type { Asset, BankAccount, Fiat } from '@dfx.swiss/react';
import { AssetPicker } from '../components/pickers/AssetPicker';
import { BankAccountPicker } from '../components/pickers/BankAccountPicker';
import { FiatPicker } from '../components/pickers/FiatPicker';
import { PaymentMethodPicker, paymentMethodsFor } from '../components/pickers/PaymentMethodPicker';
import { formatAmount, formatFiat, parseAmt, quickChipSymbol } from './trade/amount';
import { assetFor, availableAssets, groupAssets, heldBalance, parseBalances, shownChainsFor } from './trade/asset-pool';
import { chainName } from './trade/blockchain-meta';
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

export default function HomeScreen() {
  const { t, language } = useT();
  const session = useWalletSession();
  const { getAssets } = useAssetContext();
  const { currencies } = useFiatContext();
  const { bankAccounts } = useBankAccountContext();

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

  // ---- asset pool (real data — useAssetContext(), grouped per ticker; see asset-pool.ts) ---
  const allAssets = useMemo<Asset[]>(() => getAssets(Object.values(Blockchain)), [getAssets]);
  const pool = useMemo(() => groupAssets(allAssets), [allAssets]);
  const balances = useMemo(() => parseBalances(window.location.search), []);

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
    if (buyAsset || !buyPool.length) return;
    const def = buyPool.find((tk) => tk.code === 'BTC') ?? buyPool[0];
    const chains = shownChainsFor(def, 'buy', session.blockchain);
    setBuyAsset(def);
    setBuyChain(chains[0]?.blockchain);
  }, [buyPool, buyAsset, session.blockchain]);

  useEffect(() => {
    if (sellAsset || !sellPool.length) return;
    const def = sellPool.find((tk) => tk.code === 'BTC') ?? sellPool[0];
    const chains = shownChainsFor(def, 'sell', session.blockchain);
    setSellAsset(def);
    setSellChain(chains[0]?.blockchain);
  }, [sellPool, sellAsset, session.blockchain]);

  useEffect(() => {
    if (swapFromAsset || !sellPool.length) return;
    const def = sellPool[0];
    const chains = shownChainsFor(def, 'sell', session.blockchain);
    setSwapFromAsset(def);
    setSwapFromChain(chains[0]?.blockchain);
  }, [sellPool, swapFromAsset, session.blockchain]);

  useEffect(() => {
    if (swapToAsset || !buyPool.length) return;
    const rest = buyPool.filter((tk) => tk.code !== swapFromAsset?.code);
    const def = rest[0] ?? buyPool[0];
    if (!def) return;
    const chains = shownChainsFor(def, 'buy', session.blockchain);
    setSwapToAsset(def);
    setSwapToChain(chains[0]?.blockchain);
  }, [buyPool, swapToAsset, swapFromAsset, session.blockchain]);

  useEffect(() => {
    if (buyFiat || !currencies?.length) return;
    setBuyFiat(currencies.find((c) => c.name === 'EUR') ?? currencies[0]);
  }, [currencies, buyFiat]);

  useEffect(() => {
    if (sellFiat || !currencies?.length) return;
    setSellFiat(currencies.find((c) => c.name === 'EUR') ?? currencies[0]);
  }, [currencies, sellFiat]);

  useEffect(() => {
    // only reset when the *fiat* changes, not every time the user picks a method — reading
    // buyMethod here (without depending on it) is intentional, not a stale-closure bug
    if (buyFiat && !paymentMethodsFor(buyFiat).some((m) => m.id === buyMethod)) setBuyMethod(FiatPaymentMethod.BANK);
  }, [buyFiat]);

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

  const buyAmount = parseAmt(buyRaw);
  const sellAmount = parseAmt(sellRaw);
  const swapAmount = parseAmt(swapRaw);

  // ---- quotes (debounced + stale-guarded — see useQuoteEngine.ts) ---------------------------
  const buyQuote = useBuyQuote({
    enabled: session.isLoggedIn,
    asset: buyApiAsset,
    currency: buyFiat,
    amount: buyAmount,
    paymentMethod: buyMethod,
  });
  const sellQuote = useSellQuote({
    enabled: session.isLoggedIn,
    asset: sellApiAsset,
    currency: sellFiat,
    amount: sellAmount,
    iban: sellBankAccount?.iban,
  });
  const swapQuote = useSwapQuote({
    enabled: session.isLoggedIn,
    sourceAsset: swapFromApiAsset,
    targetAsset: swapToApiAsset,
    amount: swapAmount,
  });

  const buyReady = !!buyQuote.data && buyQuote.isFresh && buyQuote.data.isValid !== false;
  const sellReady = !!sellQuote.data && sellQuote.isFresh && sellQuote.data.isValid !== false;
  const swapReady = !!swapQuote.data && swapQuote.isFresh && swapQuote.data.isValid !== false;

  // ---- CTA -------------------------------------------------------------------------------
  const ctaEnabled = !session.isLoggedIn
    ? true
    : mode === 'buy'
      ? buyReady
      : mode === 'swap'
        ? swapReady
        : !!sellAmount && !!sellApiAsset && !!sellFiat && (!sellBankAccount || sellReady);

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
    setPaymentSheetOpen(true);
  };

  // ---- receive-panel display --------------------------------------------------------------
  // Home only renders once logged in (see the early `<Landing/>` return below), so — matching
  // the static app's own updateQuote() — an empty/zero amount reads "0", not a dash; "—" is
  // reserved for a genuine quote error, same as the static app's quoteErr()/`recvAmt` handling.
  let receiveValue = '0';
  let receiveMeta = '';
  if (mode === 'buy') {
    if (!buyAmount) receiveValue = '0';
    else if (buyQuote.loading) receiveValue = '…';
    else if (buyQuote.data && buyQuote.isFresh) {
      receiveValue = formatAmount(buyQuote.data.estimatedAmount, 8, language);
      receiveMeta = buyQuote.secondsLeft > 0 ? t('quoteRefresh', { n: buyQuote.secondsLeft }) : '';
    } else receiveValue = t('quoteErr');
  } else if (mode === 'sell') {
    if (!sellAmount) receiveValue = '0';
    else if (sellQuote.loading) receiveValue = '…';
    else if (sellQuote.data && sellQuote.isFresh) {
      receiveValue = formatFiat(sellQuote.data.estimatedAmount, sellFiat?.name ?? '', language);
      receiveMeta = sellQuote.secondsLeft > 0 ? t('quoteRefresh', { n: sellQuote.secondsLeft }) : '';
    } else receiveValue = t('quoteErr');
  } else {
    if (!swapAmount) receiveValue = '0';
    else if (swapQuote.loading) receiveValue = '…';
    else if (swapQuote.data && swapQuote.isFresh) {
      receiveValue = formatAmount(swapQuote.data.estimatedAmount, 6, language);
      receiveMeta = swapQuote.secondsLeft > 0 ? t('quoteRefresh', { n: swapQuote.secondsLeft }) : '';
    } else receiveValue = t('quoteErr');
  }

  const modeIndex = MODES.indexOf(mode);
  const isFiatPay = mode === 'buy';
  const isFiatReceive = mode === 'sell';

  const payRaw = mode === 'buy' ? buyRaw : mode === 'sell' ? sellRaw : swapRaw;
  const setPayRaw = mode === 'buy' ? setBuyRaw : mode === 'sell' ? setSellRaw : setSwapRaw;

  const flip = () => {
    if (mode === 'buy') setMode('sell');
    else if (mode === 'sell') setMode('buy');
    else {
      const a = swapFromAsset;
      const ac = swapFromChain;
      setSwapFromAsset(swapToAsset);
      setSwapFromChain(swapToChain);
      setSwapToAsset(a);
      setSwapToChain(ac);
    }
  };

  const currentBuyMethod = paymentMethodsFor(buyFiat).find((m) => m.id === buyMethod);

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
            onClick={() => setMode(m)}
          >
            {t(m)}
          </button>
        ))}
      </div>

      {session.isLoggedIn && (
        <button className="walletbar" type="button" onClick={() => session.openConnect()}>
          <span className="wbLogo">{WALLET_ICON}</span>
          <span className="wbtx">
            <b>{session.address ? `${session.address.slice(0, 6)}…${session.address.slice(-4)}` : ''}</b>
            <small>{session.blockchain ?? ''}</small>
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
            <span className="pmeta">{receiveMeta}</span>
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
        <div className="pmethod" role="button" tabIndex={0} onClick={() => setPaymentMethodOpen(true)}>
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
          <span className="caret">{CHEVRON_RIGHT}</span>
        </div>
      )}

      <button
        className="btn-primary cta"
        style={mode === 'buy' ? undefined : { marginTop: 'auto' }}
        disabled={session.isLoggedIn && !ctaEnabled}
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
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M5 12h14m0 0-6-6m6 6-6 6"
            stroke="#fff"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
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
        sessionBlockchain={session.blockchain}
        swapFromCode={swapFromAsset?.code}
        swapToCode={swapToAsset?.code}
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
        currencies={currencies?.filter((c) => c.buyable) ?? []}
        value={buyFiat}
        onSelect={setBuyFiat}
      />
      <FiatPicker
        open={fiatPickerOpen === 'sellReceive'}
        onClose={() => setFiatPickerOpen(null)}
        titleId="sellFiatSheetTitle"
        currencies={currencies?.filter((c) => c.sellable) ?? []}
        value={sellFiat}
        onSelect={setSellFiat}
      />

      <PaymentMethodPicker
        open={paymentMethodOpen}
        onClose={() => setPaymentMethodOpen(false)}
        titleId="payMethodSheetTitle"
        options={paymentMethodsFor(buyFiat)}
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
          setPaymentSheetOpen(true);
        }}
      />

      <PaymentSheet
        open={paymentSheetOpen}
        onClose={() => setPaymentSheetOpen(false)}
        onDone={() => setPaymentSheetOpen(false)}
        mode={mode}
        loading={mode === 'buy' ? buyQuote.loading : mode === 'sell' ? sellQuote.loading : swapQuote.loading}
        rawError={mode === 'buy' ? buyQuote.error : mode === 'sell' ? sellQuote.error : swapQuote.error}
        buy={mode === 'buy' ? buyQuote.data : null}
        sell={mode === 'sell' ? sellQuote.data : null}
        swap={mode === 'swap' ? swapQuote.data : null}
        payAssetCode={mode === 'sell' ? (sellAsset?.code ?? '') : mode === 'swap' ? (swapFromAsset?.code ?? '') : ''}
        receiveAssetCode={mode === 'buy' ? (buyAsset?.code ?? '') : mode === 'swap' ? (swapToAsset?.code ?? '') : ''}
        receiveBlockchain={mode === 'buy' ? buyChain : mode === 'swap' ? swapToChain : undefined}
        currency={mode === 'buy' ? buyFiat : mode === 'sell' ? sellFiat : undefined}
        paymentMethod={buyMethod}
        amount={(mode === 'buy' ? buyAmount : mode === 'sell' ? sellAmount : swapAmount) ?? 0}
        sessionAddress={session.address}
        onRetry={() =>
          mode === 'buy' ? buyQuote.refresh() : mode === 'sell' ? sellQuote.refresh() : swapQuote.refresh()
        }
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
  const key = code === 'EUR' ? 'curEur' : code === 'CHF' ? 'curChf' : code === 'USD' ? 'curUsd' : undefined;
  return key ? t(key) : code;
}

interface AssetPickerSlotProps {
  slot: AssetSlot | null;
  onClose: () => void;
  buyPool: TradeAsset[];
  sellPool: TradeAsset[];
  balances: Record<string, number>;
  sessionBlockchain?: string;
  swapFromCode?: string;
  swapToCode?: string;
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
  sessionBlockchain,
  swapFromCode,
  swapToCode,
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
      sessionBlockchain={sessionBlockchain}
      balances={balances}
      sortByBalance={config.sortByBalance}
      excludeCode={config.excludeCode}
      onSelect={config.onSelect}
    />
  );
}
