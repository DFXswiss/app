/**
 * Receives Content Security Policy violation reports for the policy in public/_headers and writes
 * one log line per violation, so Cloudflare Workers Logs hold the inventory the report-only policy
 * exists to collect before it is enforced.
 *
 * Two formats arrive here. `report-uri` sends one `application/csp-report` body per violation;
 * `report-to` (Reporting API, Chromium) sends `application/reports+json` with a batch of reports.
 * Only the fields needed to decide on the policy are kept. Every URL loses its query string,
 * fragment and credentials. On this application's own hosts, including the Pages project hosts,
 * the path is reduced to public route words and file names. A transaction path is reduced on
 * every host, because it can carry an id and its secret. A violation report is sent without
 * the user doing anything.
 *
 * public/_routes.json lists /csp-report so this Function runs for it. A specific route takes
 * precedence over functions/[[path]].js, so the missing-asset check never sees this path.
 */

// A Reporting API batch repeats the whole policy in every report (about 1 KB each), so this leaves
// room for a large batch while refusing bodies that are no report at all.
const MAX_BODY_LENGTH = 256 * 1024;
const MAX_REPORTS = 100;
const MAX_URL_LENGTH = 512;

// A Map, so a content type that names an object property (constructor, __proto__) finds nothing.
const FORMATS = new Map([
  ['application/csp-report', fromCspReport],
  ['application/reports+json', fromReportingApi],
]);

// Values browsers put in place of a URL when the blocked resource has none.
const KEYWORDS = new Set([
  'inline',
  'eval',
  'wasm-eval',
  'self',
  'data',
  'blob',
  'trusted-types-policy',
  'trusted-types-sink',
]);
const WEB_PROTOCOLS = new Set(['http:', 'https:', 'ws:', 'wss:']);
const DIRECTIVE = /^[a-z-]+$/;

export async function onRequest(context) {
  const { request } = context;

  if (request.method !== 'POST') return answer(405, { allow: 'POST' });

  const contentType = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const parse = FORMATS.get(contentType);
  if (!parse) return answer(415);

  const body = await readLimited(request);
  if (body === undefined) return answer(413);

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return answer(400);
  }

  const violations = parse(payload);
  if (!violations) return answer(400);

  for (const violation of violations.slice(0, MAX_REPORTS)) {
    console.log(JSON.stringify(violation));
  }

  return answer(204);
}

function fromCspReport(payload) {
  const report = isObject(payload) ? payload['csp-report'] : undefined;
  if (!isObject(report)) return undefined;

  return [
    violation({
      documentUrl: report['document-uri'],
      blockedUrl: report['blocked-uri'],
      // Older browsers send only violated-directive, which may carry the source list after the name.
      directive: report['effective-directive'] ?? report['violated-directive'],
      disposition: report.disposition,
      sourceFile: report['source-file'],
      line: report['line-number'],
      column: report['column-number'],
      statusCode: report['status-code'],
      referrer: report.referrer,
    }),
  ];
}

function fromReportingApi(payload) {
  if (!Array.isArray(payload)) return undefined;

  // The endpoint is named only by the CSP, but a batch may still hold other report types; they are
  // not what this endpoint collects.
  return payload
    .filter((report) => isObject(report) && report.type === 'csp-violation' && isObject(report.body))
    .map(({ body }) =>
      violation({
        documentUrl: body.documentURL,
        blockedUrl: body.blockedURL,
        directive: body.effectiveDirective,
        disposition: body.disposition,
        sourceFile: body.sourceFile,
        line: body.lineNumber,
        column: body.columnNumber,
        statusCode: body.statusCode,
        referrer: body.referrer,
      }),
    );
}

function violation(fields) {
  return {
    event: 'csp-violation',
    directive: directiveName(fields.directive),
    disposition: fields.disposition === 'enforce' || fields.disposition === 'report' ? fields.disposition : undefined,
    documentUrl: sanitizeUrl(fields.documentUrl),
    blockedUrl: sanitizeUrl(fields.blockedUrl),
    sourceFile: sanitizeUrl(fields.sourceFile),
    line: integer(fields.line),
    column: integer(fields.column),
    statusCode: integer(fields.statusCode),
    referrer: sanitizeUrl(fields.referrer),
  };
}

function directiveName(value) {
  if (typeof value !== 'string') return undefined;

  const name = value.trim().split(/\s+/)[0];
  return DIRECTIVE.test(name) ? name : 'unrecognised';
}

// Public route words and asset directories. Any other segment on an application host is an id or a
// secret (a guest link is /tx/<id>/<secret>) and is not logged.
const PUBLIC_SEGMENTS = new Set([
  '2fa',
  'account',
  'account-merge',
  'all',
  'assets',
  'assign',
  'bank-tx',
  'blockchain',
  'buy',
  'buyCrypto',
  'call-queues',
  'chat',
  'compliance',
  'connect',
  'contact',
  'create',
  'css',
  'custody-orders',
  'dashboard',
  'details',
  'download',
  'expenses',
  'failure',
  'file',
  'financial',
  'fonts',
  'history',
  'holders',
  'icons',
  'images',
  'info',
  'insights',
  'invoice',
  'issue',
  'js',
  'kundengelder',
  'kyc',
  'kyc-files',
  'kyc-stats',
  'kyc-step',
  'lines',
  'link',
  'liquidity',
  'live',
  'locales',
  'log',
  'log-validity',
  'login',
  'mail',
  'mail-login',
  'manual',
  'media',
  'mros',
  'notes',
  'overview',
  'payment-link',
  'pending-chargebacks',
  'personal-iban',
  'pl',
  'pos',
  'profile',
  'promo',
  'public',
  'quotes',
  'realunit',
  'recall',
  'recalls',
  'recommendation',
  'recommendations',
  'redirect',
  'referral',
  'refund',
  'result',
  'return',
  'routes',
  'safe',
  'scorechain',
  'sell',
  'sepa',
  'settings',
  'sitemap',
  'staff-kyc-required',
  'static',
  'stickers',
  'success',
  'support',
  'support-issue',
  'swap',
  'templates',
  'tickets',
  'transactions',
  'treasury',
  'tx',
  'unassigned',
  'update',
  'user',
  'wallet',
]);

const APP_HOSTS = new Set(['app.dfx.swiss', 'dev.app.dfx.swiss', 'stg.app.dfx.swiss', 'localhost', '127.0.0.1']);

// The same build is served on the Pages project domain and on one branch or deployment label under it.
const PAGES_HOST = /^(?:[a-z0-9-]+\.)?dfx-app-(?:dev|prd|stg)\.pages\.dev$/;

function isAppHost(hostname) {
  return APP_HOSTS.has(hostname) || PAGES_HOST.test(hostname);
}

const FILE_SEGMENT =
  /^[A-Za-z0-9._-]{1,80}\.(?:js|mjs|css|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|json|txt|html|wasm)$/;

// Keeps origin and the public path of a web URL, the scheme alone of any other URL (a data: URL is
// its own content, an extension URL names the extension), and the keywords browsers send instead of
// a URL. Query, fragment and credentials are already dropped by reading only origin and path.
function sanitizeUrl(value) {
  if (typeof value !== 'string' || value === '') return undefined;
  if (KEYWORDS.has(value)) return value;

  let url;
  try {
    url = new URL(value);
  } catch {
    return 'unparseable';
  }

  if (!WEB_PROTOCOLS.has(url.protocol)) return url.protocol.slice(0, -1);

  const pathname =
    isAppHost(url.hostname) || url.pathname.split('/').includes('tx') ? publicPath(url.pathname) : url.pathname;
  return `${url.origin}${pathname}`.slice(0, MAX_URL_LENGTH);
}

function publicPath(pathname) {
  return pathname
    .split('/')
    .map((segment) => {
      if (segment === '' || PUBLIC_SEGMENTS.has(segment) || FILE_SEGMENT.test(segment)) return segment;
      return ':id';
    })
    .join('/');
}

// Counts bytes as they arrive and stops once the cap is passed. A body with no stream (the unit
// tests hand the bytes to text()) is capped after that read. request.text() is not used when a
// stream is present, because it would buffer an unbounded body before the cap could apply.
async function readLimited(request) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_LENGTH) return undefined;

  const reader = request.body?.getReader?.();
  if (!reader) return readText(request);

  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    received += bytes.byteLength;
    if (received > MAX_BODY_LENGTH) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(bytes);
  }

  if (received === 0) return readText(request);

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function utf8ByteLength(value) {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code < 0xd800 || code > 0xdfff) bytes += 3;
    else {
      bytes += 4;
      index += 1;
    }
  }
  return bytes;
}

async function readText(request) {
  if (typeof request.text !== 'function') return '';
  const text = await request.text();
  // The cap is bytes. A string length counts UTF-16 units, so a multi-byte body can pass it and still be logged.
  if (utf8ByteLength(text) > MAX_BODY_LENGTH) return undefined;
  return text;
}

function integer(value) {
  return Number.isInteger(value) ? value : undefined;
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function answer(status, headers = {}) {
  return new Response(null, { status, headers: { 'cache-control': 'no-store', ...headers } });
}
