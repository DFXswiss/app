import { onRequest } from '../../functions/csp-report.js';

// The deployed Pages Function is not part of the app bundle, so nothing else in the test suite
// reaches it. These cases pin what it accepts, what it refuses, and that a logged line carries the
// policy decision without the user data a URL can hold.

const ENDPOINT = 'https://app.dfx.swiss/csp-report';

function post(body: string, contentType: string, headers: Record<string, string> = {}): any {
  return {
    request: new Request(ENDPOINT, { method: 'POST', body, headers: { 'content-type': contentType, ...headers } }),
  };
}

function cspReport(fields: Record<string, unknown>): string {
  return JSON.stringify({ 'csp-report': fields });
}

function reportingBatch(reports: unknown[]): string {
  return JSON.stringify(reports);
}

function cspViolation(body: Record<string, unknown>): Record<string, unknown> {
  return { type: 'csp-violation', age: 10, url: 'https://app.dfx.swiss/buy', user_agent: 'Test', body };
}

let log: jest.SpyInstance;

beforeEach(() => {
  log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  log.mockRestore();
});

function logged(): Record<string, unknown>[] {
  return log.mock.calls.map(([line]) => JSON.parse(line));
}

describe('csp report function', () => {
  it('logs a report-uri report with query, fragment and credentials removed, and answers 204', async () => {
    const result = await onRequest(
      post(
        cspReport({
          'document-uri': 'https://app.dfx.swiss/kyc?code=secret-code#step',
          referrer: 'https://partner.example/shop/checkout?order=42',
          'violated-directive': 'img-src',
          'effective-directive': 'img-src',
          'original-policy': "default-src 'self'",
          disposition: 'report',
          'blocked-uri': 'https://user:pass@images.example/pixel.gif?uid=1',
          'line-number': 12,
          'column-number': 7,
          'source-file': 'https://app.dfx.swiss/static/js/main.abc.js?v=1',
          'status-code': 200,
          'script-sample': 'secret',
        }),
        'application/csp-report',
      ),
    );

    expect(result.status).toBe(204);
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(logged()).toEqual([
      {
        event: 'csp-violation',
        directive: 'img-src',
        disposition: 'report',
        documentUrl: 'https://app.dfx.swiss/kyc',
        blockedUrl: 'https://images.example/pixel.gif',
        sourceFile: 'https://app.dfx.swiss/static/js/main.abc.js',
        line: 12,
        column: 7,
        statusCode: 200,
        referrer: 'https://partner.example/shop/checkout',
      },
    ]);
  });

  it('takes the directive name from violated-directive when a browser sends no effective-directive', async () => {
    await onRequest(
      post(
        cspReport({ 'violated-directive': "script-src 'self' 'wasm-unsafe-eval'", disposition: 'enforce' }),
        'application/csp-report',
      ),
    );

    expect(logged()).toEqual([{ event: 'csp-violation', directive: 'script-src', disposition: 'enforce' }]);
  });

  it('logs every csp-violation of a Reporting API batch and skips everything else in it', async () => {
    const result = await onRequest(
      post(
        reportingBatch([
          cspViolation({
            documentURL: 'https://app.dfx.swiss/sell?address=bc1q#x',
            blockedURL: 'wss://relay.example/socket?token=1',
            effectiveDirective: 'connect-src',
            disposition: 'report',
            sourceFile: 'chrome-extension://abcdef/content.js',
            lineNumber: 1,
            columnNumber: 2,
            statusCode: 0,
            referrer: '',
          }),
          cspViolation({
            documentURL: 'https://app.dfx.swiss/',
            blockedURL: 'inline',
            effectiveDirective: 'script-src-elem',
          }),
          { type: 'deprecation', body: { id: 'x' } },
          { type: 'csp-violation' },
          'not a report',
          null,
        ]),
        'application/reports+json',
      ),
    );

    expect(result.status).toBe(204);
    expect(logged()).toEqual([
      {
        event: 'csp-violation',
        directive: 'connect-src',
        disposition: 'report',
        documentUrl: 'https://app.dfx.swiss/sell',
        blockedUrl: 'wss://relay.example/socket',
        sourceFile: 'chrome-extension',
        line: 1,
        column: 2,
        statusCode: 0,
      },
      {
        event: 'csp-violation',
        directive: 'script-src-elem',
        documentUrl: 'https://app.dfx.swiss/',
        blockedUrl: 'inline',
      },
    ]);
  });

  it('keeps only the scheme of a URL that is not a web address', async () => {
    await onRequest(
      post(
        reportingBatch([
          cspViolation({ blockedURL: 'data:image/png;base64,c2VjcmV0', documentURL: 'about:blank' }),
          cspViolation({ blockedURL: 'blob:https://app.dfx.swiss/0b1c' }),
        ]),
        'application/reports+json',
      ),
    );

    expect(logged().map(({ blockedUrl, documentUrl }) => ({ blockedUrl, documentUrl }))).toEqual([
      { blockedUrl: 'data', documentUrl: 'about' },
      { blockedUrl: 'blob', documentUrl: undefined },
    ]);
  });

  it('logs neither free text nor malformed values from a report', async () => {
    await onRequest(
      post(
        cspReport({
          'effective-directive': 'img-src;{"forged":true}',
          disposition: 'block everything',
          'blocked-uri': 'not a url at all',
          'document-uri': 42,
          'line-number': '12',
          'column-number': 1.5,
        }),
        'application/csp-report',
      ),
    );

    expect(logged()).toEqual([{ event: 'csp-violation', directive: 'unrecognised', blockedUrl: 'unparseable' }]);
  });

  it('drops a directive name that is not text', async () => {
    await onRequest(post(cspReport({ 'effective-directive': ['img-src'] }), 'application/csp-report'));

    expect(logged()).toEqual([{ event: 'csp-violation' }]);
  });

  it('shortens a very long path', async () => {
    await onRequest(
      post(cspReport({ 'blocked-uri': `https://images.example/${'a'.repeat(1000)}` }), 'application/csp-report'),
    );

    expect(String(logged()[0].blockedUrl)).toHaveLength(512);
  });

  it('accepts a content type with parameters, in any case', async () => {
    const result = await onRequest(
      post(cspReport({ 'effective-directive': 'img-src' }), 'Application/CSP-Report; charset=utf-8'),
    );

    expect(result.status).toBe(204);
    expect(logged()).toHaveLength(1);
  });

  it('logs at most 100 violations of one batch', async () => {
    const batch = Array.from({ length: 150 }, () => cspViolation({ effectiveDirective: 'img-src' }));

    const result = await onRequest(post(reportingBatch(batch), 'application/reports+json'));

    expect(result.status).toBe(204);
    expect(logged()).toHaveLength(100);
  });

  it('refuses every method but POST', async () => {
    const result = await onRequest({ request: new Request(ENDPOINT) });

    expect(result.status).toBe(405);
    expect(result.headers.get('allow')).toBe('POST');
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(log).not.toHaveBeenCalled();
  });

  it.each(['application/json', 'constructor', '__proto__'])('refuses the content type %s', async (contentType) => {
    const result = await onRequest(post(cspReport({ 'effective-directive': 'img-src' }), contentType));

    expect(result.status).toBe(415);
    expect(log).not.toHaveBeenCalled();
  });

  it('refuses a request without a content type', async () => {
    const context = post('{}', 'application/csp-report');
    context.request.headers.delete('content-type');

    const result = await onRequest(context);

    expect(result.status).toBe(415);
  });

  it('refuses a body declared larger than the limit before reading it', async () => {
    const context = post(cspReport({}), 'application/csp-report', { 'content-length': String(256 * 1024 + 1) });
    const text = jest.spyOn(context.request, 'text');

    const result = await onRequest(context);

    expect(result.status).toBe(413);
    expect(text).not.toHaveBeenCalled();
  });

  it('refuses a body larger than the limit that did not declare its length', async () => {
    const result = await onRequest(post(`"${'a'.repeat(256 * 1024)}"`, 'application/csp-report'));

    expect(result.status).toBe(413);
    expect(log).not.toHaveBeenCalled();
  });

  it('refuses a body that is not JSON', async () => {
    const result = await onRequest(post('{"csp-report":', 'application/csp-report'));

    expect(result.status).toBe(400);
  });

  it.each([
    [
      'a report-uri body without a csp-report object',
      cspReport('text' as unknown as Record<string, unknown>),
      'application/csp-report',
    ],
    ['a report-uri body that is an array', '[]', 'application/csp-report'],
    ['a report-uri body that is null', 'null', 'application/csp-report'],
    ['a Reporting API body that is no batch', '{"type":"csp-violation"}', 'application/reports+json'],
  ])('refuses %s', async (_case, body, contentType) => {
    const result = await onRequest(post(body, contentType));

    expect(result.status).toBe(400);
    expect(log).not.toHaveBeenCalled();
  });
});
