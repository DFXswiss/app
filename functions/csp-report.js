/**
 * Receives Content Security Policy violation reports for the policy in public/_headers and writes
 * one log line per violation, so Cloudflare Workers Logs hold the inventory the report-only policy
 * exists to collect before it is enforced.
 *
 * Two formats arrive here. `report-uri` sends one `application/csp-report` body per violation;
 * `report-to` (Reporting API, Chromium) sends `application/reports+json` with a batch of reports.
 * Only the fields needed to decide on the policy are kept, and every URL loses its query string,
 * fragment and credentials: those can carry session codes, addresses or other user data, and a
 * violation report is sent without the user doing anything.
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

  if (Number(request.headers.get('content-length')) > MAX_BODY_LENGTH) return answer(413);

  const body = await request.text();
  if (body.length > MAX_BODY_LENGTH) return answer(413);

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

// Keeps origin and path of a web URL, the scheme alone of any other URL (a data: URL is its own
// content, an extension URL names the extension), and the keywords browsers send instead of a URL.
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

  return `${url.origin}${url.pathname}`.slice(0, MAX_URL_LENGTH);
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
