// DFX App 2.0 — asset + network picker (2-step bottom sheet).
//
// Ported from the static app's `#sheet` (public/app2/index.html: `stepTokens`/`stepChains`,
// `buildFilters()`, `buildCoins()`, `pickToken()`) — same markup/classes (`.frow`/`.fchip`,
// `.slist`/`.crow`, `.netgrid`/`.netcard`) so styles.css applies unchanged. Real API data only:
// pool/asset info comes from useAssetContext() via asset-pool.ts, nothing hardcoded except the
// small "Popular"/"Stablecoins"/"Swiss" UI curation lists (see blockchain-meta.ts — the static
// app hardcoded the same curation, it was never API data).

import { useMemo, useState } from 'react';
import type { Blockchain } from '@dfx.swiss/react';
import { chainName, isStableAsset, isSwissAsset, POPULAR_ASSETS } from '../../screens/trade/blockchain-meta';
import { formatAmount } from '../../screens/trade/amount';
import { chainsFor, heldBalance, shownChainsFor } from '../../screens/trade/asset-pool';
import type { Capability, TradeAsset } from '../../screens/trade/types';
import { AssetChainGlyph, AssetGlyph } from '../../screens/trade/glyphs';
import { Sheet, SheetHeader, onActivate } from '../ui';
import { useT, type Language, type TranslationKey } from '../../i18n';

type Filter = 'all' | 'popular' | 'stable' | 'swiss' | `chain:${string}`;

interface AssetPickerProps {
  open: boolean;
  onClose: () => void;
  titleId: string;
  titleKey: TranslationKey;
  pool: TradeAsset[];
  cap: Capability;
  sessionBlockchain?: string;
  balances?: Record<string, number>;
  sortByBalance?: boolean;
  excludeCode?: string;
  onSelect: (asset: TradeAsset, blockchain: Blockchain) => void;
}

function matchesFilter(
  token: TradeAsset,
  filter: Filter,
  cap: Capability,
  sessionBlockchain: string | undefined,
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'popular':
      return POPULAR_ASSETS.includes(token.code.toUpperCase());
    case 'stable':
      return isStableAsset(token.code);
    case 'swiss':
      return isSwissAsset(token.code);
    default:
      return shownChainsFor(token, cap, sessionBlockchain).some((c) => `chain:${c.blockchain}` === filter);
  }
}

export function AssetPicker({
  open,
  onClose,
  titleId,
  titleKey,
  pool,
  cap,
  sessionBlockchain,
  balances,
  sortByBalance,
  excludeCode,
  onSelect,
}: AssetPickerProps) {
  const { t, language } = useT();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [chainStepFor, setChainStepFor] = useState<TradeAsset | null>(null);

  const candidatePool = useMemo(
    () => (excludeCode ? pool.filter((tk) => tk.code !== excludeCode) : pool),
    [pool, excludeCode],
  );

  const availableChains = useMemo(() => {
    const seen = new Map<string, Blockchain>();
    candidatePool.forEach((tk) =>
      shownChainsFor(tk, cap, sessionBlockchain).forEach((c) => seen.set(c.blockchain, c.blockchain)),
    );
    return Array.from(seen.values());
  }, [candidatePool, cap, sessionBlockchain]);

  const hasPopular = candidatePool.some((tk) => matchesFilter(tk, 'popular', cap, sessionBlockchain));
  const hasStable = candidatePool.some((tk) => matchesFilter(tk, 'stable', cap, sessionBlockchain));
  const hasSwiss = candidatePool.some((tk) => matchesFilter(tk, 'swiss', cap, sessionBlockchain));
  const showFilters = candidatePool.length > 1 && (hasPopular || hasStable || hasSwiss || availableChains.length > 0);

  const query = search.trim().toLowerCase();
  const filtered = candidatePool
    .filter((tk) => matchesFilter(tk, filter, cap, sessionBlockchain))
    .filter((tk) => !query || tk.code.toLowerCase().includes(query) || tk.description.toLowerCase().includes(query));

  const sorted =
    sortByBalance && balances
      ? [...filtered].sort((a, b) => heldBalance(balances, b.code) - heldBalance(balances, a.code))
      : filtered;

  const close = () => {
    setChainStepFor(null);
    setSearch('');
    setFilter('all');
    onClose();
  };

  const pick = (token: TradeAsset) => {
    const chains = shownChainsFor(token, cap, sessionBlockchain);
    if (chains.length <= 1) {
      const chain = chains[0] ?? chainsFor(token, cap)[0];
      if (chain) onSelect(token, chain.blockchain);
      close();
      return;
    }
    setChainStepFor(token);
  };

  const chains = chainStepFor ? shownChainsFor(chainStepFor, cap, sessionBlockchain) : [];

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
          {showFilters && (
            <div className="frow-wrap">
              <div className="frow">
                <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label={t('allAssets')} />
                {hasPopular && (
                  <FilterChip active={filter === 'popular'} onClick={() => setFilter('popular')} label={t('popular')} />
                )}
                {hasStable && (
                  <FilterChip active={filter === 'stable'} onClick={() => setFilter('stable')} label={t('stable')} />
                )}
                {hasSwiss && (
                  <FilterChip active={filter === 'swiss'} onClick={() => setFilter('swiss')} label={t('swiss')} />
                )}
                {availableChains.map((bc) => (
                  <FilterChip
                    key={bc}
                    active={filter === `chain:${bc}`}
                    onClick={() => setFilter(`chain:${bc}`)}
                    label={chainName(bc)}
                  />
                ))}
              </div>
            </div>
          )}
          <div className="slist">
            {sorted.map((tk) => (
              <AssetRow
                key={tk.code}
                token={tk}
                cap={cap}
                sessionBlockchain={sessionBlockchain}
                balance={balances ? heldBalance(balances, tk.code) : undefined}
                language={language}
                onPick={() => pick(tk)}
              />
            ))}
            {!sorted.length && <EmptyState hasQuery={!!query} />}
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
            {chains.map((c) => (
              <div
                key={c.blockchain}
                className="netcard"
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
                <AssetGlyph code={c.blockchain} size={30} />
                <div className="ni">
                  <b>{chainName(c.blockchain)}</b>
                </div>
              </div>
            ))}
          </div>
          <div style={{ height: 16 }} />
        </>
      )}
    </Sheet>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button className={`fchip${active ? ' on' : ''}`} type="button" onClick={onClick}>
      {label}
    </button>
  );
}

function AssetRow({
  token,
  cap,
  sessionBlockchain,
  balance,
  language,
  onPick,
}: {
  token: TradeAsset;
  cap: Capability;
  sessionBlockchain: string | undefined;
  balance?: number;
  language: Language;
  onPick: () => void;
}) {
  const chains = shownChainsFor(token, cap, sessionBlockchain);
  const single = chains.length === 1;
  const netTxt = single ? chainName(chains[0].blockchain) : `${chains.length} networks`;

  return (
    <div className="crow" role="button" tabIndex={0} onClick={onPick} onKeyDown={onActivate(onPick)}>
      <AssetChainGlyph code={token.code} blockchain={single ? chains[0].blockchain : undefined} />
      <div className="ci">
        <b>{token.code}</b>
        <div className="net">{netTxt}</div>
      </div>
      {balance != null && balance > 0 && (
        <div
          style={{
            marginLeft: 'auto',
            textAlign: 'right',
            fontSize: 13.5,
            fontWeight: 600,
            color: '#fff',
            flex: '0 0 auto',
          }}
        >
          {formatAmount(balance, 6, language)}
        </div>
      )}
    </div>
  );
}

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  const { t } = useT();
  return (
    <div className="sec" style={{ textAlign: 'center', padding: '30px 22px' }}>
      {hasQuery ? t('noResults') : t('noAssets')}
    </div>
  );
}
