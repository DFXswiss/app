// DFX App 2.0 — monochrome coin/chain/fiat badges.
//
// The API types carry no icon URLs (`Asset`/`Fiat` — see blockchain-meta.ts), and bundling
// the static app's `assets/tokens/*` / `assets/networks/*` image set is out of scope for this
// rewrite. This ports the static app's own fallback path instead — `mono()` in
// public/app2/index.html draws a filled circle + the asset's initials as a data-URI SVG for
// any icon that fails to load. We render that same shape as real SVG markup (via JSX, so
// nothing is ever concatenated into HTML/innerHTML) as the *primary* glyph everywhere, which
// keeps every asset/chain/currency visually consistent without image assets.

import { hashColor } from './blockchain-meta';

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
  const fs = fontSize ?? Math.round(size * 0.36);
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ display: 'block', borderRadius: '50%' }}>
      <circle cx={16} cy={16} r={16} fill={color ?? hashColor(label)} />
      <text
        x={16}
        y={16 + fs * 0.34}
        textAnchor="middle"
        fontFamily="Inter, -apple-system, Arial, sans-serif"
        fontSize={fs}
        fontWeight={700}
        fill="#fff"
      >
        {initials(label)}
      </text>
    </svg>
  );
}

/** `.glyph>.coin` — the main asset badge in pills/rows (size defaults to the row size, 38px). */
export function AssetGlyph({ code, size = 38 }: { code: string; size?: number }) {
  return <CoinCircle label={code} size={size} />;
}

/** `.glyph>.badge` — the small network-overlay badge in the bottom-right corner of an asset glyph. */
export function ChainGlyphBadge({ blockchain, size = 15 }: { blockchain: string; size?: number }) {
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
      <CoinCircle label={blockchain} size={size} fontSize={Math.round(size * 0.5)} />
    </span>
  );
}

const FIAT_SYMBOL: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', CHF: 'Fr' };
const FIAT_COLOR: Record<string, string> = { EUR: '#1652d0', CHF: '#d8232a', USD: '#128a4b', GBP: '#4f46e5' };

/** `.glyph>.coin` for a fiat currency — currency symbol on a colored circle, matching the static
 * app's `fiatGlyph()` (EUR/CHF/USD/GBP get their real symbol + brand color; anything else falls
 * back to its first letter). */
export function FiatGlyph({ code, size = 30 }: { code: string; size?: number }) {
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
