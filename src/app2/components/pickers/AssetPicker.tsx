// DFX App 2.0 — asset + network picker (2-step bottom sheet).
//
// Ported from the static app's `#sheet` (public/app2/index.html: `stepTokens`/`stepChains`,
// `buildFilters()`, `buildCoins()`, `pickToken()`) — same markup/classes (`.frow`/`.fchip`,
// `.slist`/`.crow`, `.netgrid`/`.netcard`) so styles.css applies unchanged. Real API data only:
// pool/asset info comes from useAssetContext() via asset-pool.ts, nothing hardcoded except the
// small "Popular"/"Stablecoins"/"Swiss" UI curation lists (see blockchain-meta.ts — the static
// app hardcoded the same curation, it was never API data).

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Blockchain } from '@dfx.swiss/react';
import {
  chainName,
  isBtcAsset,
  isStableAsset,
  isSwissAsset,
  POPULAR_ASSETS,
} from '../../screens/trade/blockchain-meta';
import { shownChainsFor } from '../../screens/trade/asset-pool';
import type { Capability, TradeAsset } from '../../screens/trade/types';
import { AssetChainGlyph, AssetGlyph, NetworkCardGlyph, chainIcon } from '../../screens/trade/glyphs';
import { Sheet, SheetHeader, onActivate } from '../ui';
import { useT, type TranslationKey } from '../../i18n';

// Chain-chip order — mirrors the static app's CH map declaration order (mainstream EVMs lead),
// excluding Bitcoin/Lightning/Monero which get their own fixed chips (see ORIG_app2.html CH map /
// `chainsOfChips()`). Kept here rather than reordering the shared CHAIN_NAME map.
const CHAIN_CHIP_ORDER: Blockchain[] = [
  Blockchain.ETHEREUM,
  Blockchain.ARBITRUM,
  Blockchain.OPTIMISM,
  Blockchain.POLYGON,
  Blockchain.BASE,
  Blockchain.BINANCE_SMART_CHAIN,
  Blockchain.GNOSIS,
  Blockchain.HAQQ,
  Blockchain.SOLANA,
  Blockchain.TRON,
  Blockchain.CARDANO,
  Blockchain.INTERNET_COMPUTER,
  Blockchain.CITREA,
  Blockchain.FIRO,
];

type Filter = 'favorites' | 'btc' | 'stable' | 'monero' | 'swiss' | `chain:${string}`;

/** Favorites rank — index in the curated POPULAR_ASSETS list (non-favorites sort last). Compared
 * against the raw ticker (e.g. "cBTC"), mirroring the static app's `favRank`. */
function favRank(code: string): number {
  const i = POPULAR_ASSETS.indexOf(code);
  return i < 0 ? 999 : i;
}

interface AssetPickerProps {
  open: boolean;
  onClose: () => void;
  titleId: string;
  titleKey: TranslationKey;
  pool: TradeAsset[];
  cap: Capability;
  sessionBlockchains?: readonly string[];
  /** Accepted for caller compatibility but intentionally unused — the static picker shows no
   * held-balance column and never sorts by balance (only favRank → chains → code). */
  balances?: Record<string, number>;
  sortByBalance?: boolean;
  excludeCode?: string;
  /** Currently-selected asset/chain for this slot — the matching network card gets the `sel` class. */
  selectedCode?: string;
  selectedBlockchain?: Blockchain;
  onSelect: (asset: TradeAsset, blockchain: Blockchain) => void;
}

function matchesFilter(
  token: TradeAsset,
  filter: Filter,
  cap: Capability,
  sessionBlockchains: readonly string[] | undefined,
): boolean {
  const available = shownChainsFor(token, cap, sessionBlockchains);
  if (!available.length) return false;
  switch (filter) {
    case 'favorites':
      return POPULAR_ASSETS.includes(token.code);
    case 'btc':
      return isBtcAsset(token.code);
    case 'stable':
      return isStableAsset(token.code);
    case 'monero':
      return available.some((c) => c.blockchain === Blockchain.MONERO);
    case 'swiss':
      return isSwissAsset(token.code);
    default:
      return available.some((c) => `chain:${c.blockchain}` === filter);
  }
}

export function AssetPicker({
  open,
  onClose,
  titleId,
  titleKey,
  pool,
  cap,
  sessionBlockchains,
  excludeCode,
  selectedCode,
  selectedBlockchain,
  onSelect,
}: AssetPickerProps) {
  const { t } = useT();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('favorites');
  const [chainStepFor, setChainStepFor] = useState<TradeAsset | null>(null);

  const candidatePool = useMemo(
    () => (excludeCode ? pool.filter((tk) => tk.code !== excludeCode) : pool),
    [pool, excludeCode],
  );

  // Dynamic chain chips: chains present in the pool, ordered by the static app's CH declaration
  // order (mainstream EVMs lead) and excluding Bitcoin/Lightning/Monero (those get their own fixed
  // chips). Mirrors `chainsOfChips()`.
  const availableChains = useMemo(() => {
    const seen = new Set<Blockchain>();
    candidatePool.forEach((tk) => shownChainsFor(tk, cap, sessionBlockchains).forEach((c) => seen.add(c.blockchain)));
    return CHAIN_CHIP_ORDER.filter((c) => seen.has(c));
  }, [candidatePool, cap, sessionBlockchains]);

  // Logged-in wallets restrict the pool to reachable chains; a guest sees everything (see
  // isReachable). No token being receivable → the "no assets for this wallet" empty state.
  const loggedIn = !!sessionBlockchains?.length;
  const walletCanReceive = candidatePool.some((tk) => shownChainsFor(tk, cap, sessionBlockchains).length > 0);

  const query = search.trim().toLowerCase();
  const filtered = candidatePool
    .filter((tk) => matchesFilter(tk, filter, cap, sessionBlockchains))
    .filter((tk) => !query || tk.code.toLowerCase().includes(query) || tk.description.toLowerCase().includes(query));

  // Favorites first, then more-chains-first, then alphabetical — mirrors the static app's
  // `buildCoins()` sort (no balance sort — the static picker never re-orders by held balance).
  const sorted = [...filtered].sort(
    (a, b) => favRank(a.code) - favRank(b.code) || b.chains.length - a.chains.length || a.code.localeCompare(b.code),
  );

  const close = () => {
    setChainStepFor(null);
    setSearch('');
    setFilter('favorites');
    onClose();
  };

  const pick = (token: TradeAsset) => {
    const chains = shownChainsFor(token, cap, sessionBlockchains);
    if (chains.length <= 1) {
      const chain = chains[0];
      if (chain) onSelect(token, chain.blockchain);
      close();
      return;
    }
    setChainStepFor(token);
  };

  const chains = chainStepFor ? shownChainsFor(chainStepFor, cap, sessionBlockchains) : [];

  // Horizontal scroll arrows + left-edge fade for the filter row (desktop). Mirrors the static
  // app's `updateFrowArrows()` / #frowLeft / #frowRight: hide the left arrow at the start, the
  // right arrow at the end, and add `.scrolled` (drives the left gradient) once scrolled past.
  const frowRef = useRef<HTMLDivElement>(null);
  const [frowLeftHidden, setFrowLeftHidden] = useState(true);
  const [frowRightHidden, setFrowRightHidden] = useState(false);
  const [frowScrolled, setFrowScrolled] = useState(false);

  const updateFrowArrows = useCallback(() => {
    const f = frowRef.current;
    if (!f) return;
    const max = f.scrollWidth - f.clientWidth;
    const x = f.scrollLeft;
    setFrowLeftHidden(x <= 4);
    setFrowRightHidden(max <= 4 || x >= max - 4);
    setFrowScrolled(x > 4);
  }, []);

  useEffect(() => {
    updateFrowArrows();
  }, [updateFrowArrows, open, chainStepFor, availableChains]);

  const scrollFrow = (dx: number) => {
    frowRef.current?.scrollBy({ left: dx });
    setTimeout(updateFrowArrows, 320);
  };

  return (
    <Sheet open={open} onClose={close} titleId={titleId} showGrab>
      {!chainStepFor ? (
        <>
          <div className="shead">
            <div className="r1">
              <h3 id={titleId}>{t(titleKey)}</h3>
              <button className="rbtn" aria-label="Close" style={{ width: 44, height: 44 }} onClick={close}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="search">
              <svg viewBox="0 0 24 24" fill="none">
                <circle cx={11} cy={11} r={7} stroke="currentColor" strokeWidth={1.8} />
                <path d="M20 20l-3.2-3.2" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('search')}
                aria-label={t('search')}
              />
            </div>
          </div>
          <div className={`frow-wrap${frowScrolled ? ' scrolled' : ''}`}>
            <div className="frow" ref={frowRef} onScroll={updateFrowArrows}>
              <FilterChip
                active={filter === 'favorites'}
                onClick={() => setFilter('favorites')}
                label={t('favorites')}
                icon={STAR_ICON}
              />
              <FilterChip
                active={filter === 'btc'}
                onClick={() => setFilter('btc')}
                label={t('bitcoin')}
                icon={chipImg(chainIcon(Blockchain.BITCOIN))}
              />
              <FilterChip active={filter === 'stable'} onClick={() => setFilter('stable')} label={t('stable')} />
              <FilterChip
                active={filter === 'monero'}
                onClick={() => setFilter('monero')}
                label={t('monero')}
                icon={chipImg(chainIcon(Blockchain.MONERO))}
              />
              <FilterChip
                active={filter === 'swiss'}
                onClick={() => setFilter('swiss')}
                label={t('swiss')}
                icon={<span aria-hidden="true">🇨🇭</span>}
              />
              {availableChains.map((bc) => (
                <FilterChip
                  key={bc}
                  active={filter === `chain:${bc}`}
                  onClick={() => setFilter(`chain:${bc}`)}
                  label={chainName(bc)}
                  icon={chipImg(chainIcon(bc))}
                />
              ))}
            </div>
            <button
              className={`frow-arrow left${frowLeftHidden ? ' hide' : ''}`}
              type="button"
              aria-label="Scroll categories left"
              onClick={() => scrollFrow(-170)}
            >
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M15 6l-6 6 6 6"
                  stroke="currentColor"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              className={`frow-arrow right${frowRightHidden ? ' hide' : ''}`}
              type="button"
              aria-label="Scroll categories right"
              onClick={() => scrollFrow(170)}
            >
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M9 6l6 6-6 6"
                  stroke="currentColor"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
          <div className="slist">
            {sorted.map((tk) => (
              <AssetRow
                key={tk.code}
                token={tk}
                cap={cap}
                sessionBlockchains={sessionBlockchains}
                onPick={() => pick(tk)}
              />
            ))}
            {!sorted.length && <EmptyState noWalletAssets={loggedIn && !walletCanReceive} />}
          </div>
        </>
      ) : (
        <>
          <SheetHeader titleId={titleId} title={t('chooseNet')} onClose={close} />
          <div
            className="backrow"
            role="button"
            tabIndex={0}
            onClick={() => setChainStepFor(null)}
            onKeyDown={onActivate(() => setChainStepFor(null))}
          >
            <svg width={17} height={17} viewBox="0 0 24 24" fill="none">
              <path
                d="M15 18l-6-6 6-6"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>{t('allAssets')}</span>
          </div>
          <div className="thead">
            <span className="glyph">
              <AssetGlyph code={chainStepFor.code} size={34} />
            </span>
            <b>
              {chainStepFor.description} · {chainStepFor.code}
            </b>
          </div>
          <p className="tnote">{t('netNote')}</p>
          <div className="netgrid">
            {chains.map((c) => {
              const isSel = selectedCode === chainStepFor.code && selectedBlockchain === c.blockchain;
              return (
                <div
                  key={c.blockchain}
                  className={`netcard${isSel ? ' sel' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    onSelect(chainStepFor, c.blockchain);
                    close();
                  }}
                  onKeyDown={onActivate(() => {
                    onSelect(chainStepFor, c.blockchain);
                    close();
                  })}
                >
                  <NetworkCardGlyph blockchain={c.blockchain} size={30} />
                  <div className="ni">
                    <b>{chainName(c.blockchain)}</b>
                    <small>{t('network')}</small>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ height: 16 }} />
        </>
      )}
    </Sheet>
  );
}

// Leading star glyph for the Favorites chip — inline SVG (uses currentColor), matching the static
// app's `buildFilters()` markup. Sized in-line since it is an <svg>, not the `.fchip img` rule.
const STAR_ICON = (
  <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 14, height: 14 }} aria-hidden="true">
    <path d="M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 17.3 5.8 20.9l1.6-6.8L2.2 8.9l6.9-.6z" />
  </svg>
);

// A brand-logo chip icon (network/token SVG) via the shared `.fchip img` rule; omitted when the
// chain has no bundled icon.
function chipImg(src: string | undefined): ReactNode {
  return src ? <img src={src} alt="" /> : undefined;
}

function FilterChip({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: ReactNode;
}) {
  return (
    <button className={`fchip${active ? ' on' : ''}`} type="button" onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function AssetRow({
  token,
  cap,
  sessionBlockchains,
  onPick,
}: {
  token: TradeAsset;
  cap: Capability;
  sessionBlockchains: readonly string[] | undefined;
  onPick: () => void;
}) {
  const { t } = useT();
  const chains = shownChainsFor(token, cap, sessionBlockchains);
  const single = chains.length === 1;
  const singleChainName = single ? chainName(chains[0].blockchain) : '';
  const netTxt = single
    ? token.description === singleChainName
      ? singleChainName
      : `${token.description} · ${singleChainName}`
    : `${token.description} · ${chains.length} ${t('networks')}`;

  return (
    <div className="crow" role="button" tabIndex={0} onClick={onPick} onKeyDown={onActivate(onPick)}>
      <AssetChainGlyph code={token.code} blockchain={single ? chains[0].blockchain : undefined} />
      <div className="ci">
        <b>
          {token.code}
          {isSwissAsset(token.code) && (
            <>
              {' '}
              <span className="tag swiss">SWISS</span>
            </>
          )}
        </b>
        <div className="net">{netTxt}</div>
      </div>
    </div>
  );
}

// Two-way empty state, matching the static app's `buildCoins()`: logged-in with no wallet-reachable
// asset → "no assets for this wallet"; every other empty case (incl. an unmatched search/filter) →
// "no results". The static picker never shows a third "no assets" copy here.
function EmptyState({ noWalletAssets }: { noWalletAssets: boolean }) {
  const { t } = useT();
  return (
    <div className="sec" style={{ textAlign: 'center', padding: '30px 22px' }}>
      {noWalletAssets ? t('noAssetsForWallet') : t('noResults')}
    </div>
  );
}
