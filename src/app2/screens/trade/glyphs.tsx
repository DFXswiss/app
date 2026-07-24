// DFX App 2.0 — token / chain / fiat badges.
//
// The API types carry no icon URLs (`Asset`/`Fiat` — see blockchain-meta.ts). We bundle the
// static preview's real token + network icon set (assets/tokens/*, assets/networks/*, keyed in
// asset-icons.ts) and render the matching brand logo as the primary glyph; anything not in the
// set (e.g. a newly listed asset or an exotic chain) falls back to a filled circle with the
// asset's initials — rendered as real SVG markup (via JSX, so nothing is concatenated into
// HTML/innerHTML), matching the static app's `mono()` fallback shape.

import { Blockchain } from '@dfx.swiss/react';
import { useEffect, useState } from 'react';
import { hashColor } from './blockchain-meta';
import { NETWORK_ICONS, TOKEN_ICONS } from './asset-icons';
import flagEu from '../../assets/flags/eu.svg';
import flagCh from '../../assets/flags/ch.svg';
import flagUs from '../../assets/flags/us.svg';
import flagGb from '../../assets/flags/gb.svg';

// Blockchain enum value → network icon filename (asset-icons.ts key). Chains without an icon
// fall through to the initials circle.
const NETWORK_FILE: Partial<Record<Blockchain, string>> = {
  [Blockchain.BITCOIN]: 'bitcoin',
  [Blockchain.LIGHTNING]: 'lightning',
  [Blockchain.ETHEREUM]: 'ethereum',
  [Blockchain.BINANCE_SMART_CHAIN]: 'binance-smart-chain',
  [Blockchain.OPTIMISM]: 'optimism',
  [Blockchain.ARBITRUM]: 'arbitrum-one',
  [Blockchain.POLYGON]: 'polygon',
  [Blockchain.BASE]: 'base',
  [Blockchain.GNOSIS]: 'gnosis',
  // HAQQ is an EVM chain and reuses Ethereum's network logo (matches the static app's CH map).
  [Blockchain.HAQQ]: 'ethereum',
  [Blockchain.CARDANO]: 'cardano',
  [Blockchain.SOLANA]: 'solana',
  [Blockchain.TRON]: 'tron',
  [Blockchain.CITREA]: 'citrea',
};

// Chains whose brand logo is a token icon (assets/tokens) rather than a dedicated network SVG —
// mirrors the static app's CH map (Monero→XMR, Internet Computer→ICP, Firo→FIRO).
const NETWORK_TOKEN_FILE: Partial<Record<Blockchain, string>> = {
  [Blockchain.MONERO]: 'XMR',
  [Blockchain.INTERNET_COMPUTER]: 'ICP',
  [Blockchain.FIRO]: 'FIRO',
};

function networkIcon(blockchain: string): string | undefined {
  const chain = blockchain as Blockchain;
  const file = NETWORK_FILE[chain];
  if (file) return NETWORK_ICONS[file];
  const token = NETWORK_TOKEN_FILE[chain];
  return token ? TOKEN_ICONS[token] : undefined;
}

/** Leading brand-logo URL for a chain (network SVG or token SVG), for the picker's filter chips.
 * Returns undefined for chains without a bundled icon, so the caller can omit the `<img>`. */
export function chainIcon(blockchain: Blockchain | string): string | undefined {
  return networkIcon(blockchain as string);
}

/** Resolves the real brand logo for a token code OR a blockchain value (AssetGlyph is reused for
 * both — see AssetPicker's network chooser). Returns undefined when neither is bundled. */
function assetIcon(code: string): string | undefined {
  if (!code) return undefined;
  return TOKEN_ICONS[code.toUpperCase()] ?? networkIcon(code);
}

function initials(label: string, max = 4): string {
  return (label || '?').slice(0, max).toUpperCase();
}

interface CoinCircleProps {
  label: string;
  size: number;
  color?: string;
  fontSize?: number;
}

function CoinCircle({ label, size, color, fontSize }: CoinCircleProps) {
  const text = initials(label);
  // The viewBox is 32 units regardless of the rendered `size`, so the font size lives in viewBox
  // units and scales with the character count — otherwise 4-letter tickers (e.g. WBTC, ZCHF)
  // overflow the circle. (The old code sized the font from the px `size`, which clipped them.)
  const fs = fontSize ?? (text.length <= 2 ? 13 : text.length === 3 ? 10.5 : 8.5);
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ display: 'block', borderRadius: '50%' }}>
      <circle cx={16} cy={16} r={16} fill={color ?? hashColor(label)} />
      <text
        x={16}
        y={16}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Inter, -apple-system, Arial, sans-serif"
        fontSize={fs}
        fontWeight={700}
        fill="#fff"
      >
        {text}
      </text>
    </svg>
  );
}

const coinImgStyle = { display: 'block', borderRadius: '50%', background: '#fff' } as const;

// ── CoinGecko brand-logo fallback ──────────────────────────────────────────────────────────────
// Tokens outside the bundled TOKEN_ICONS set (a newly listed asset, an exotic ticker) get their
// real brand logo from CoinGecko, layered over the vendored icons — mirroring the static preview's
// loadLogos()/tokenIcon() (public/app2/index.html). The logo is resolved by CoinGecko coin id
// (CG_ID, authoritative — symbol matching collides across chains) with a symbol fallback, then
// cached in localStorage for ~24h so we don't refetch on every connect. The fetch is async and
// never blocks render: the initials circle shows until (and unless) a logo resolves.

// Explicit CoinGecko coin ids → the correct logo per DFX asset (verbatim from the static preview).
const CG_ID: Record<string, string> = {
  BTC: 'bitcoin',
  CBTC: 'bitcoin',
  LNBTC: 'bitcoin',
  WBTC: 'wrapped-bitcoin',
  TBTC: 'tbtc',
  ETH: 'ethereum',
  WETH: 'weth',
  SETH: 'ethereum',
  USDT: 'tether',
  USDC: 'usd-coin',
  DAI: 'dai',
  EURC: 'euro-coin',
  EUROC: 'euro-coin',
  BUSD: 'binance-usd',
  ZCHF: 'frankencoin',
  XCHF: 'cryptofranc',
  DEURO: 'decentralized-euro',
  FPS: 'frankencoin-pool-share',
  BNB: 'binancecoin',
  WBNB: 'wbnb',
  LINK: 'chainlink',
  UNI: 'uniswap',
  AAVE: 'aave',
  MATIC: 'matic-network',
  POL: 'polygon-ecosystem-token',
  ARB: 'arbitrum',
  OP: 'optimism',
  GMX: 'gmx',
  SAND: 'the-sandbox',
  CRV: 'curve-dao-token',
  MKR: 'maker',
  GNO: 'gnosis',
  SOL: 'solana',
  XMR: 'monero',
  ADA: 'cardano',
  ICP: 'internet-computer',
  TRX: 'tron',
  DFI: 'defichain',
  FIRO: 'zcoin',
  LTC: 'litecoin',
  DOGE: 'dogecoin',
  XRP: 'ripple',
  DOT: 'polkadot',
  AVAX: 'avalanche-2',
  ATOM: 'cosmos',
  SHIB: 'shiba-inu',
  PEPE: 'pepe',
};

const CG_LOGO_CACHE_KEY = 'dfx_app2_cglogo';
const CG_LOGO_TTL = 864e5; // 24h — persisted per-code logo map, avoids a CoinGecko refetch on every connect.

interface CgLogoEntry {
  url: string;
  ts: number;
}

function readCgLogoCache(): Record<string, CgLogoEntry> {
  if (typeof window === 'undefined') return {};
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(CG_LOGO_CACHE_KEY) ?? 'null');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, CgLogoEntry>) : {};
  } catch {
    return {};
  }
}

function cachedCgLogo(code: string): string | undefined {
  const entry = readCgLogoCache()[code];
  return entry && typeof entry.url === 'string' && Date.now() - entry.ts < CG_LOGO_TTL ? entry.url : undefined;
}

function storeCgLogo(code: string, url: string): void {
  if (typeof window === 'undefined') return;
  const cache = readCgLogoCache();
  cache[code] = { url, ts: Date.now() };
  try {
    window.localStorage.setItem(CG_LOGO_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* localStorage full / unavailable — the in-memory state still carries the logo for this session. */
  }
}

async function fetchCgJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url);
    if (res.ok) return await res.json();
  } catch {
    /* offline / blocked — keep the initials fallback. */
  }
  return undefined;
}

async function fetchCgLogo(code: string): Promise<string | undefined> {
  // 1) resolve by coin id (authoritative).
  const id = CG_ID[code];
  if (id) {
    const data = await fetchCgJson(
      `https://api.coingecko.com/api/v3/coins/${id}` +
        '?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false',
    );
    const image = (data as { image?: { thumb?: string; small?: string; large?: string } } | undefined)?.image;
    const url = image?.small ?? image?.large ?? image?.thumb;
    if (typeof url === 'string' && url) return url;
  }
  // 2) symbol fallback for anything not mapped.
  if (/^[A-Z0-9]{2,8}$/.test(code)) {
    const data = await fetchCgJson(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&symbols=${code.toLowerCase()}`,
    );
    if (Array.isArray(data)) {
      for (const coin of data) {
        const img = (coin as { image?: unknown }).image;
        if (typeof img === 'string' && img) return img;
      }
    }
  }
  return undefined;
}

/** Resolves a CoinGecko brand logo for an uncovered token `code` (async, cached). Returns the
 * cached logo synchronously when fresh, otherwise `undefined` until the fetch resolves — the
 * caller keeps rendering the initials circle in the meantime. SSR-safe (client-only effect). */
function useCgLogo(code: string | undefined): string | undefined {
  const norm = code ? code.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
  const [url, setUrl] = useState<string | undefined>(() => (norm ? cachedCgLogo(norm) : undefined));

  useEffect(() => {
    if (!norm) {
      setUrl(undefined);
      return;
    }
    const cached = cachedCgLogo(norm);
    if (cached) {
      setUrl(cached);
      return;
    }
    let active = true;
    void fetchCgLogo(norm).then((resolved) => {
      if (!active || !resolved) return;
      storeCgLogo(norm, resolved);
      setUrl(resolved);
    });
    return () => {
      active = false;
    };
  }, [norm]);

  return url;
}

/** `.glyph>.coin` — the main asset badge in pills/rows (size defaults to the row size, 38px).
 * Also reused to render a chain badge when passed a blockchain value as `code`. */
export function AssetGlyph({ code, size = 38 }: { code: string; size?: number }) {
  const bundled = assetIcon(code);
  // Only reach for a remote logo when nothing is bundled; the hook is inert (no fetch) otherwise.
  const remote = useCgLogo(bundled ? undefined : code);
  const icon = bundled ?? remote;
  if (icon) return <img className="coin" src={icon} width={size} height={size} alt="" style={coinImgStyle} />;
  return <CoinCircle label={code} size={size} />;
}

/** Network logo for a `.netcard` — a plain rounded-square brand logo (no circular crop, no white
 * fill), matching the static app's bare `<img src=chain.img>` styled by `.netcard img{border-radius:8px}`.
 * Falls back to a colored rounded square with the chain initial when no icon is bundled. */
export function NetworkCardGlyph({ blockchain, size = 30 }: { blockchain: string; size?: number }) {
  const icon = networkIcon(blockchain);
  // Plain <img> (no `.coin` inline style): the `.netcard img` CSS rule sizes it to 30px with an
  // 8px radius and no background, exactly like the original.
  if (icon) return <img src={icon} width={size} height={size} alt="" />;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ display: 'block', borderRadius: 8, flexShrink: 0 }}>
      <rect width={32} height={32} rx={8} fill={hashColor(blockchain)} />
      <text
        x={16}
        y={16}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Inter, -apple-system, Arial, sans-serif"
        fontSize={16}
        fontWeight={700}
        fill="#fff"
      >
        {initials(blockchain, 1)}
      </text>
    </svg>
  );
}

/** `.glyph>.badge` — the small network-overlay badge in the bottom-right corner of an asset glyph. */
export function ChainGlyphBadge({ blockchain, size = 15 }: { blockchain: string; size?: number }) {
  const icon = networkIcon(blockchain);
  return (
    <span
      style={{
        position: 'absolute',
        right: -3,
        bottom: -3,
        borderRadius: '50%',
        background: 'var(--app-surface)',
        padding: 1,
        boxShadow: '0 0 0 1.5px var(--app-surface)',
        display: 'block',
        lineHeight: 0,
      }}
    >
      {icon ? (
        <img className="coin" src={icon} width={size} height={size} alt="" style={coinImgStyle} />
      ) : (
        <CoinCircle label={blockchain} size={size} fontSize={Math.round(size * 0.5)} />
      )}
    </span>
  );
}

const FIAT_SYMBOL: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', CHF: 'Fr' };
const FIAT_COLOR: Record<string, string> = { EUR: '#1652d0', CHF: '#d8232a', USD: '#128a4b', GBP: '#4f46e5' };
// Round country flags for the major fiats — matches the static app's `fiatPillHTML`/currency-row
// markup (`<img class="coin" src="assets/flags/…svg">`). Anything else keeps the symbol circle below.
const FIAT_FLAG: Record<string, string> = { EUR: flagEu, CHF: flagCh, USD: flagUs, GBP: flagGb };

/** `.glyph>.coin` for a fiat currency — a round country flag for EUR/CHF/USD/GBP (matching the
 * static app's `fiatPillHTML`/currency picker rows); anything else falls back to the currency
 * symbol on a colored circle (EUR/CHF/USD/GBP symbol + brand color, else its first letter). */
export function FiatGlyph({ code, size = 30 }: { code: string; size?: number }) {
  const flag = FIAT_FLAG[code];
  if (flag) return <img className="coin" src={flag} width={size} height={size} alt="" style={coinImgStyle} />;
  const symbol = FIAT_SYMBOL[code] ?? (code ? code[0] : '¤');
  const color = FIAT_COLOR[code] ?? hashColor(code);
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" style={{ display: 'block', borderRadius: '50%' }}>
      <circle cx={15} cy={15} r={15} fill={color} />
      <text
        x={15}
        y={symbol.length > 1 ? 19.6 : 21}
        textAnchor="middle"
        fontFamily="Inter, -apple-system, Arial, sans-serif"
        fontSize={symbol.length > 1 ? 13 : 18}
        fontWeight={700}
        fill="#fff"
      >
        {symbol}
      </text>
    </svg>
  );
}

/** A composed `<span class="glyph">` with the asset coin + (optional) chain badge, matching the
 * static app's `glyphHTML(tk, bc)` / `assetPillHTML(tk, bc)` markup structure 1:1. */
export function AssetChainGlyph({ code, blockchain, size = 38 }: { code: string; blockchain?: string; size?: number }) {
  return (
    <span className="glyph">
      <AssetGlyph code={code} size={size} />
      {blockchain && <ChainGlyphBadge blockchain={blockchain} size={Math.round(size * 0.4)} />}
    </span>
  );
}
