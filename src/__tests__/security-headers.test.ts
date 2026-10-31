import { DEFAULT_DOMAIN } from '@trezor/connect/lib/data/version';
import fs from 'fs';
import path from 'path';
import { onRequest } from '../../functions/csp-report.js';
import routes from '../../public/_routes.json';

// public/_headers is read by Cloudflare Pages at deploy time and by nothing in the app bundle, so no
// other test sees it. These cases parse the file the way Pages does and pin every directive of the
// security headers, the rule structure that keeps embedding working, and the build inputs the
// Content Security Policy relies on.

const ROOT = path.join(__dirname, '..', '..');

function read(file: string): string {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

interface Rule {
  pattern: string;
  headers: [string, string][];
  detached: string[];
}

// Pages syntax: an unindented line starts a rule for a URL pattern, indented lines below it are
// `Name: value` headers or `! Name` detachments, and lines starting with # are comments.
function parseHeadersFile(text: string): Rule[] {
  const rules: Rule[] = [];

  for (const line of text.split('\n')) {
    const entry = line.trim();
    if (entry === '' || entry.startsWith('#')) continue;

    if (!/^\s/.test(line)) {
      rules.push({ pattern: entry, headers: [], detached: [] });
      continue;
    }

    const rule = rules[rules.length - 1];
    if (entry.startsWith('! ')) {
      rule.detached.push(entry.slice(2).trim().toLowerCase());
      continue;
    }

    const colon = entry.indexOf(':');
    rule.headers.push([entry.slice(0, colon).trim().toLowerCase(), entry.slice(colon + 1).trim()]);
  }

  return rules;
}

const HEADERS_FILE = read('public/_headers');
const RULES = parseHeadersFile(HEADERS_FILE);

function header(pattern: string, name: string): string | undefined {
  return RULES.find((rule) => rule.pattern === pattern)?.headers.find(([key]) => key === name)?.[1];
}

function cspDirectives(policy: string): Record<string, string[]> {
  return Object.fromEntries(
    policy
      .split(';')
      .map((directive) => directive.trim().split(/\s+/))
      .filter(([name]) => name !== '')
      .map(([name, ...sources]) => [name, sources]),
  );
}

function permissions(policy: string): Record<string, string[]> {
  return Object.fromEntries(
    policy.split(',').map((entry) => {
      const [feature, allowlist] = entry.trim().split('=');
      const inner = allowlist.replace(/^\(/, '').replace(/\)$/, '').trim();
      return [feature, inner === '' ? [] : inner.split(/\s+/).map((item) => item.replace(/^"|"$/g, ''))];
    }),
  );
}

const SECURITY_HEADERS = [
  'content-security-policy-report-only',
  'reporting-endpoints',
  'permissions-policy',
  'strict-transport-security',
  'x-content-type-options',
  'referrer-policy',
];

const SUMSUB = 'https://api.sumsub.com';
const TREZOR_CONNECT = 'https://connect.trezor.io';

describe('public/_headers security headers', () => {
  const csp = header('/*', 'content-security-policy-report-only') ?? '';
  const permissionsPolicy = header('/*', 'permissions-policy') ?? '';

  it('ships the Content Security Policy report-only, with exactly these directives', () => {
    expect(cspDirectives(csp)).toEqual({
      'default-src': ["'self'"],
      'script-src': ["'self'", "'wasm-unsafe-eval'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': [
        "'self'",
        'data:',
        'blob:',
        'https://dfx.swiss',
        'https://assets.website-files.com',
        'https://uploads-ssl.webflow.com',
        'https://explorer-api.walletconnect.com',
        'https://miro.medium.com',
        'https://logowik.com',
      ],
      'font-src': ["'self'"],
      'connect-src': ["'self'", 'https:', 'wss:'],
      'frame-src': ["'self'", 'https:'],
      'worker-src': ["'self'", 'blob:'],
      'manifest-src': ["'self'"],
      'media-src': ["'self'", 'blob:'],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'frame-ancestors': ["'self'", 'https:'],
      'report-uri': ['/csp-report'],
      'report-to': ['csp-endpoint'],
    });
  });

  it('enforces no Content Security Policy yet, in any rule', () => {
    // Partners embed the app; enforcing frame-ancestors or any other directive before the
    // report-only window has produced the inventory could break them.
    expect(RULES.flatMap((rule) => rule.headers.map(([name]) => name))).not.toContain('content-security-policy');
  });

  it('sends reports from both report mechanisms to the Pages Function that logs them', () => {
    expect(header('/*', 'reporting-endpoints')).toBe('csp-endpoint="/csp-report"');
    expect(routes.include).toContain('/csp-report');
    expect(typeof onRequest).toBe('function');
  });

  it('enforces this Permissions-Policy', () => {
    expect(permissions(permissionsPolicy)).toEqual({
      'publickey-credentials-get': ['self'],
      'publickey-credentials-create': ['self'],
      'clipboard-read': ['self'],
      'clipboard-write': ['self', SUMSUB],
      camera: ['self', SUMSUB],
      microphone: ['self', SUMSUB],
      fullscreen: ['self', SUMSUB],
      geolocation: [SUMSUB],
      hid: ['self'],
      usb: [TREZOR_CONNECT],
      serial: [],
      bluetooth: [],
      payment: [],
      'display-capture': [],
      midi: [],
      accelerometer: [],
      gyroscope: [],
      magnetometer: [],
    });
  });

  it('allows the Sumsub ident frame every feature it delegates to itself', () => {
    // The frame gets a feature only if the page's policy allows it for the frame's origin, so a
    // feature the SDK asks for and this policy withholds breaks identification.
    const sdk = fs.readFileSync(require.resolve('@sumsub/websdk-react/dist/index.esm.js'), 'utf8');
    const origin = sdk.match(/getCurrentBaseUrl\("([^"]+)"/)?.[1];
    const requested = (sdk.match(/\.allow="([^"]+)"/)?.[1] ?? '').split(';').map((feature) => feature.trim());

    expect(origin).toBe(SUMSUB);
    expect(requested).toEqual(['camera', 'microphone', 'geolocation', 'clipboard-write']);

    const policy = permissions(permissionsPolicy);
    for (const feature of requested) expect(policy[feature]).toContain(SUMSUB);
  });

  it('allows WebUSB for the Trezor Connect frame, which reaches the device through it', () => {
    const iframe = fs.readFileSync(require.resolve('@trezor/connect-web/lib/iframe/index.js'), 'utf8');

    expect(new URL(DEFAULT_DOMAIN).origin).toBe(TREZOR_CONNECT);
    expect(iframe).toContain("setAttribute('allow', 'usb')");
    expect(permissions(permissionsPolicy).usb).toContain(TREZOR_CONNECT);
  });

  it('sets HSTS for a year with subdomains and without preload', () => {
    expect(header('/*', 'strict-transport-security')).toBe('max-age=31536000; includeSubDomains');
  });

  it('sets nosniff and the referrer policy', () => {
    expect(header('/*', 'x-content-type-options')).toBe('nosniff');
    expect(header('/*', 'referrer-policy')).toBe('strict-origin-when-cross-origin');
  });

  it('sets every security header in the /* rule once and nowhere else', () => {
    // Pages joins the values of a header set by several matching rules with commas.
    for (const name of SECURITY_HEADERS) {
      const sources = RULES.flatMap((rule) => rule.headers.filter(([key]) => key === name).map(() => rule.pattern));
      expect({ name, sources }).toEqual({ name, sources: ['/*'] });
    }
  });

  it('keeps nosniff off the widget script, which is served without a JavaScript content type', () => {
    expect(RULES.filter((rule) => rule.detached.length > 0)).toEqual([
      expect.objectContaining({ pattern: '/widget/*', detached: ['x-content-type-options'] }),
    ]);
  });

  it('sets no header that refuses framing', () => {
    expect(RULES.flatMap((rule) => rule.headers.map(([name]) => name))).not.toContain('x-frame-options');
  });

  it('stays within the Pages limits of 100 rules and 2,000 characters per line', () => {
    expect(RULES.length).toBeLessThanOrEqual(100);
    for (const line of HEADERS_FILE.split('\n')) expect(line.length).toBeLessThanOrEqual(2000);
  });
});

describe('inputs the Content Security Policy relies on', () => {
  it('builds the app without an inline runtime script', () => {
    expect(read('scripts/build.sh')).toMatch(/^INLINE_RUNTIME_CHUNK=false CI=false react-app-rewired build$/m);
  });

  it('keeps scripts and third-party stylesheets out of the app shell', () => {
    const shell = read('public/index.html');

    expect(shell).not.toMatch(/<script/i);
    expect(shell).not.toContain('fonts.googleapis.com');
  });

  it('renders text in the self-hosted Inter first', () => {
    const css = read('src/index.css');
    const stack = css
      .match(/font-family:\s*([^;]+);/)?.[1]
      .split(',')
      .map((family) => family.trim());

    expect(stack?.slice(0, 2)).toEqual(["'Inter Variable'", "'Inter'"]);
    expect(read('src/index.tsx')).toContain("import '@fontsource-variable/inter';");
  });
});
