const { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require('fs');
const { join } = require('path');
const {
  hasAbsoluteAppleTouchIcon,
  hasGoogleFontsLink,
  hasManifestJsonLink,
  removeSharedIdentityLinks,
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

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  [
    "connect-src 'self'",
    selectedApiOrigin,
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
  ].join(' '),
  "frame-src 'self' https://verify.walletconnect.com https://verify.walletconnect.org",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join('; ');

let html = readFileSync(htmlPath, 'utf8');
html = removeSharedIdentityLinks(html)
  .replace(/<style>[\s\S]*?<\/style>/, '')
  .replace(
    /<div id="root">\s*<div class="loader-container">\s*<div class="loader">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/,
    '<div id="root"></div>',
  )
  .replace(/<title>[\s\S]*?<\/title>/, '<title>DFX — Buy crypto directly into your wallet</title>')
  .replace(
    /<meta name="description" content="[^"]*"\s*\/?>/,
    '<meta name="description" content="Buy, sell and swap crypto directly with your own wallet — Swiss and non-custodial."/>',
  );

const app2Head = [
  `<meta http-equiv="Content-Security-Policy" content="${csp}"/>`,
  '<meta name="referrer" content="strict-origin-when-cross-origin"/>',
  '<meta name="theme-color" content="#0A3055"/>',
  '<meta name="color-scheme" content="dark"/>',
  '<meta name="robots" content="noindex, nofollow"/>',
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

writeFileSync(htmlPath, html);
console.log('App2 artifact staged with its own CSP and PWA identity.');
