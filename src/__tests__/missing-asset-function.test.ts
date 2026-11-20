import { onRequest } from '../../functions/[[path]].js';
import routes from '../../public/_routes.json';

// The deployed Pages Function is not part of the app bundle, so nothing else in the test suite
// reaches it. These cases pin the decision it makes: an asset path answered SUCCESSFULLY with
// HTML — or with no content type at all — is the fallback standing in for a file that no longer
// exists, and must not reach the client as a successful asset. An HTML failure response is a
// different thing and keeps its status.

const ASSET_URL = 'https://app.dfx.swiss/static/js/main.abc123.js';

function contextFor(response: Response): any {
  return { request: new Request(ASSET_URL), env: { ASSETS: { fetch: async () => response } } };
}

// A conditional request needs two answers: the 304, then whatever the unconditional retry finds.
// The recorder also captures the second request, so the test can assert the conditions were dropped
// rather than merely assume it.
function conditionalContext(retry: Response): { context: any; retried: () => Request | undefined } {
  const responses = [new Response(null, { status: 304 }), retry];
  let secondRequest: Request | undefined;

  const context = {
    request: new Request(ASSET_URL, { headers: { 'if-none-match': '"shell-etag"', 'if-modified-since': 'Wed, 30 Jul 2026 00:00:00 GMT' } }),
    env: {
      ASSETS: {
        fetch: async (request: Request) => {
          if (responses.length === 1) secondRequest = request;
          return responses.shift() as Response;
        },
      },
    },
  };

  return { context, retried: () => secondRequest };
}

describe('missing asset function', () => {
  it('answers an asset path served as HTML with 404 and forbids caching it', async () => {
    const fallback = new Response('<!doctype html><html></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=31536000, immutable' },
    });

    const result = await onRequest(contextFor(fallback));

    expect(result.status).toBe(404);
    expect(result.headers.get('cache-control')).toBe('no-store');
  });

  it('passes a real asset through untouched, headers included', async () => {
    const asset = new Response('console.log(1);', {
      status: 200,
      headers: { 'content-type': 'application/javascript', 'cache-control': 'public, max-age=31536000, immutable' },
    });

    const result = await onRequest(contextFor(asset));

    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    await expect(result.text()).resolves.toBe('console.log(1);');
  });

  it('treats a response without a content type as the fallback and fails closed', async () => {
    const untyped = new Response('data', { status: 200 });
    untyped.headers.delete('content-type');

    const result = await onRequest(contextFor(untyped));

    expect(result.status).toBe(404);
    expect(result.headers.get('cache-control')).toBe('no-store');
  });

  it('treats a present but empty content type the same as a missing one and fails closed', async () => {
    // The header has to be emptied after construction: passing '' in the init is discarded and
    // the platform fills in text/plain, so the constructor route cannot produce this case at all.
    const emptyType = new Response('data', { status: 200 });
    emptyType.headers.set('content-type', '');

    const result = await onRequest(contextFor(emptyType));

    expect(result.status).toBe(404);
    expect(result.headers.get('cache-control')).toBe('no-store');
  });

  it('treats a case-different content-type as the fallback', async () => {
    const fallback = new Response('<!doctype html><html></html>', {
      status: 200,
      headers: { 'content-type': 'Text/HTML; charset=UTF-8' },
    });

    const result = await onRequest(contextFor(fallback));

    expect(result.status).toBe(404);
  });

  it('does not treat a content-type with text/html only inside a parameter as the fallback', async () => {
    const asset = new Response('{"note":"not html"}', {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8; description="text/html example"' },
    });

    const result = await onRequest(contextFor(asset));

    expect(result.status).toBe(200);
    await expect(result.text()).resolves.toBe('{"note":"not html"}');
  });

  it('does not turn a non-HTML error response into a 404', async () => {
    const result = await onRequest(contextFor(new Response('nope', { status: 503, headers: { 'content-type': 'text/plain' } })));

    expect(result.status).toBe(503);
  });

  it('catches the fallback on a successful status other than 200', async () => {
    // The check is on success, not on 200 alone, so a partial response carrying the fallback
    // cannot slip past as a valid asset.
    const partial = new Response('<!doctype html><html></html>', {
      status: 206,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });

    const result = await onRequest(contextFor(partial));

    expect(result.status).toBe(404);
  });

  it('does not let a conditional request revalidate a cached app shell', async () => {
    // The client stored the app shell under an asset URL before this function existed. Revalidating
    // must not confirm it as valid, or the poisoned entry lives on.
    const { context, retried } = conditionalContext(
      new Response('<!doctype html><html></html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }),
    );

    const result = await onRequest(context);

    expect(result.status).toBe(404);
    expect(retried()?.headers.get('if-none-match')).toBeNull();
    expect(retried()?.headers.get('if-modified-since')).toBeNull();
  });

  it('still confirms a cached copy of an asset that really exists', async () => {
    const { context } = conditionalContext(
      new Response('console.log(1);', { status: 200, headers: { 'content-type': 'application/javascript' } }),
    );

    const result = await onRequest(context);

    expect(result.status).toBe(304);
    await expect(result.text()).resolves.toBe('');
  });

  it('does not confirm a cached copy when the retry itself fails', async () => {
    // A failure on the second lookup establishes nothing about the path. Answering 304 there would
    // renew whatever the client holds -- including the app shell this exists to get rid of.
    const { context } = conditionalContext(new Response('upstream down', { status: 503, headers: { 'content-type': 'text/plain' } }));

    const result = await onRequest(context);

    expect(result.status).toBe(503);
  });

  it('leaves an HTML error page as the error it is', async () => {
    // An HTML failure page is not a missing asset. Reporting it as 404 would state permanent
    // absence on the strength of what may be a passing fault.
    const outage = new Response('<!doctype html><html>gateway error</html>', {
      status: 503,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });

    const result = await onRequest(contextFor(outage));

    expect(result.status).toBe(503);
  });
});

// public/_routes.json decides whether Cloudflare Pages invokes this Function at all -- it only
// runs for paths matched by the include list below. The handler tests above prove that once
// invoked, it tells a real asset apart from the SPA fallback correctly; they say nothing about
// which paths reach it. A path dropped from include here goes straight to static asset serving
// and falls back to index.html on a miss -- the exact cached-fallback bug this file exists to
// catch, just skipped for that path instead of mishandled by the Function. None of the tests
// above would notice that regression, since they call onRequest() directly and never consult
// this file, so its content is pinned here on its own -- exactly, not just as a lower bound: an
// unnoticed addition would run the Function's content check against a path public/_headers never
// justified for it, so both directions have to fail this test, not only a removal.
describe('public/_routes.json include list', () => {
  it('content-checks exactly /static/*, /widget/*, /favicon.ico, /logo.png, /robots.txt, /manifest.json, /asset-manifest.json and /version.json, and excludes nothing', () => {
    const expectedInclude = [
      '/static/*',
      '/widget/*',
      '/favicon.ico',
      '/logo.png',
      '/robots.txt',
      '/manifest.json',
      '/asset-manifest.json',
      '/version.json',
    ];

    expect([...routes.include].sort()).toEqual([...expectedInclude].sort());
    expect(routes.exclude).toEqual([]);
  });
});
