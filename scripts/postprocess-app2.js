const { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } = require('fs');
const { join } = require('path');
const {
  findUnexpectedRootEntries,
  hasAbsoluteAppleTouchIcon,
  hasGoogleFontsLink,
  hasManifestJsonLink,
  hasMainAppIdentity,
  removeSharedIdentityLinks,
  removeSharedIdentityMeta,
  replaceDescriptionMeta,
  replaceTitle,
} = require('../src/app2/build/html-links');

const root = join(__dirname, '..');
const dist = join(root, 'app2-dist');
const htmlPath = join(dist, 'index.html');
const publicAssets = join(root, 'src', 'app2', 'public');

if (!existsSync(htmlPath)) throw new Error(`Missing App2 build output: ${htmlPath}`);

function apiOrigin(rawUrl) {
  if (!rawUrl) throw new Error('REACT_APP_API_URL is required when staging the App2 artifact');
  const url = new URL(rawUrl);
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) {
    throw new Error(`Unsafe App2 API origin: ${url.origin}`);
  }
  return url.origin;
}

const selectedApiOrigin = apiOrigin(process.env.REACT_APP_API_URL);

// CRA copies the shared `public/` directory wholesale. App2 owns a deliberately small public
// surface, so remove the main app's identity and any legacy nested preview before staging it.
for (const stale of [
  'app2',
  'asset-manifest.json',
  'favicon.ico',
  'logo.png',
  'manifest.json',
  'robots.txt',
  'version.json',
]) {
  rmSync(join(dist, stale), { recursive: true, force: true });
}

cpSync(publicAssets, dist, { recursive: true });
cpSync(join(root, 'src', 'app2', 'assets', 'brand', 'icon.svg'), join(dist, 'favicon.svg'));
cpSync(join(root, 'src', 'app2', 'THIRD-PARTY-NOTICES.md'), join(dist, 'THIRD-PARTY-NOTICES.md'));
mkdirSync(join(dist, 'icons'), { recursive: true });
mkdirSync(join(dist, 'licenses'), { recursive: true });
cpSync(join(root, 'src', 'app2', 'assets', 'fonts', 'OFL.txt'), join(dist, 'licenses', 'Inter-OFL.txt'));
// Country flags (assets/flags/) — circle-flags by HatScripts, MIT.
cpSync(join(root, 'src', 'app2', 'assets', 'flags', 'LICENSE.txt'), join(dist, 'licenses', 'circle-flags-MIT.txt'));
// Token/network/wallet glyphs carrying class="web3icons" (assets/networks/, assets/tokens/,
// assets/wallets/) — web3icons by 0xa3k5, MIT.
cpSync(join(root, 'src', 'app2', 'assets', 'web3icons-LICENSE.txt'), join(dist, 'licenses', 'web3icons-MIT.txt'));

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  // static.sumsub.com hosts the Ident (KYC) WebSDK loader script.
  // connect.trezor.io serves the Trezor Connect popup/iframe app that drives the
  // Trezor hardware wallet (src/app2/wallets/hardware-providers.ts). This is an
  // additive, scoped shared-security-surface change: Trezor Connect runs its
  // device flow in an officially-hosted context at connect.trezor.io only.
  "script-src 'self' 'wasm-unsafe-eval' https://static.sumsub.com https://connect.trezor.io",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  // coin-images / assets.coingecko.com host the token brand logos layered over the bundled icons.
  "img-src 'self' data: blob: https://coin-images.coingecko.com https://assets.coingecko.com",
  [
    "connect-src 'self'",
    selectedApiOrigin,
    // CoinGecko logo resolution (glyphs.tsx AssetGlyph fallback, 24h cached).
    'https://api.coingecko.com',
    'wss://relay.walletconnect.com',
    'wss://relay.walletconnect.org',
    'https://rpc.walletconnect.com',
    'https://rpc.walletconnect.org',
    'https://verify.walletconnect.com',
    'https://verify.walletconnect.org',
    'https://*.walletconnect.com',
    'wss://*.walletconnect.com',
    'https://*.walletconnect.org',
    'wss://*.walletconnect.org',
    'https://*.reown.com',
    'wss://*.reown.com',
    // Sumsub Ident WebSDK (XHR + websocket telemetry).
    'https://*.sumsub.com',
    'wss://*.sumsub.com',
    // Trezor Connect: the hosted popup/iframe posts device messages back to connect.trezor.io.
    'https://connect.trezor.io',
  ].join(' '),
  "frame-src 'self' https://verify.walletconnect.com https://verify.walletconnect.org https://*.sumsub.com https://connect.trezor.io",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join('; ');

// Single source of truth for both the visible <title>/<meta name="description"> and the
// twitter:title/twitter:description a link-preview unfurl (Slack/X/Telegram/Signal) actually
// reads — keeping them identical is deliberate, not incidental.
const APP2_TITLE = 'DFX — Buy crypto directly into your wallet';
const APP2_DESCRIPTION = 'Buy, sell and swap crypto directly with your own wallet — Swiss and non-custodial.';

let html = readFileSync(htmlPath, 'utf8');
html = removeSharedIdentityLinks(html)
  .replace(/<style>[\s\S]*?<\/style>/, '')
  .replace(
    /<div id="root">\s*<div class="loader-container">\s*<div class="loader">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/,
    '<div id="root"></div>',
  );
// Strip the inherited twitter:*/og:*/alby:* social-preview identity entirely — a link-preview
// unfurl reads those tags, not <title>, so leaving them in place made every shared /app2 link
// unfurl as the *old* app (wrong title, description, and screenshot). Re-injected below with
// App2's own values. Both replacements below throw instead of silently no-op'ing if the CRA
// template no longer has a matching tag — a template change must fail the build, not ship stale
// identity.
html = removeSharedIdentityMeta(html);
html = replaceTitle(html, APP2_TITLE);
html = replaceDescriptionMeta(html, APP2_DESCRIPTION);

const app2Head = [
  `<meta http-equiv="Content-Security-Policy" content="${csp}"/>`,
  '<meta name="referrer" content="strict-origin-when-cross-origin"/>',
  '<meta name="theme-color" content="#0A3055"/>',
  '<meta name="color-scheme" content="dark"/>',
  '<meta name="robots" content="noindex, nofollow"/>',
  // App2's own social-preview identity. No App2-specific screenshot exists yet — omitting
  // twitter:image entirely (rather than pointing at the main app's screenshot) means a shared
  // link unfurls as a plain card instead of a visibly wrong one. twitter:site/creator still name
  // DFX's real X account, which is accurate for this product too, not inherited-app-specific.
  '<meta name="twitter:card" content="summary"/>',
  '<meta name="twitter:site" content="@dfx_swiss"/>',
  '<meta name="twitter:creator" content="@dfx_swiss"/>',
  `<meta name="twitter:title" content="${APP2_TITLE}"/>`,
  `<meta name="twitter:description" content="${APP2_DESCRIPTION}"/>`,
  '<meta name="alby:name" content="DFX"/>',
  '<link rel="icon" href="./favicon.svg" type="image/svg+xml"/>',
  '<link rel="icon" href="./favicon-32.png" sizes="32x32" type="image/png"/>',
  '<link rel="apple-touch-icon" href="./apple-touch-icon.png"/>',
  '<link rel="manifest" href="./manifest.webmanifest"/>',
].join('');

html = html.replace(/(<meta charset="utf-8"\s*\/?>)/i, `$1${app2Head}`);

if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) throw new Error('App2 CSP requires an external-only script build');
if (!html.includes('Content-Security-Policy')) throw new Error('Failed to inject the App2 CSP');
if (!html.includes('<div id="root"></div>')) throw new Error('Failed to remove the shared inline loader');
if (html.includes('loader-container')) throw new Error('Failed to remove all shared loader markup');
if (hasManifestJsonLink(html)) throw new Error('Failed to remove the shared main-app manifest');
if (hasGoogleFontsLink(html)) throw new Error('Failed to remove the shared remote font stylesheet');
if (hasAbsoluteAppleTouchIcon(html)) throw new Error('Failed to remove the shared absolute apple-touch icon');
if (hasMainAppIdentity(html)) throw new Error("App2 artifact still carries the main app's social-preview identity");

writeFileSync(htmlPath, html);

// R10: the `public/` strip above (the `stale` loop) is a hardcoded deny-list — a file added to
// the shared public/ later would silently ride along into the App2 artifact with a green build.
// Flip that around: after every known step has run, the artifact's *root* must contain nothing
// but what App2 itself is known to produce. Only the top level is checked (nested content, e.g.
// under static/ or icons/, is CRA/App2's own build output, not the shared public/ payload this
// guards against).
const KNOWN_APP2_ROOT_ENTRIES = new Set([
  'index.html', // CRA build output (postprocessed above)
  'static', // CRA's content-hashed js/css/media bundle output
  'favicon.svg', // src/app2/assets/brand/icon.svg
  'THIRD-PARTY-NOTICES.md', // src/app2/THIRD-PARTY-NOTICES.md
  'licenses', // Inter/circle-flags/web3icons license texts
  'apple-touch-icon.png', // src/app2/public/
  'favicon-32.png', // src/app2/public/
  'manifest.webmanifest', // src/app2/public/
  'icons', // src/app2/public/icons/
]);
const unexpectedRootEntries = findUnexpectedRootEntries(
  readdirSync(dist),
  KNOWN_APP2_ROOT_ENTRIES,
  (entry) => /\.wasm$/i.test(entry), // CRA's content-hashed wasm module(s), name varies by build
);
if (unexpectedRootEntries.length > 0) {
  throw new Error(
    `Unexpected entr${unexpectedRootEntries.length === 1 ? 'y' : 'ies'} staged into the App2 artifact root: ${unexpectedRootEntries.join(', ')}. ` +
      'If this is a deliberate new App2 asset, add it to KNOWN_APP2_ROOT_ENTRIES above.',
  );
}

console.log('App2 artifact staged with its own CSP, PWA identity, and social-preview metadata.');
