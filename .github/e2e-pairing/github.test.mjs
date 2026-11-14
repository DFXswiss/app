import assert from 'node:assert/strict';
import test from 'node:test';

import { GitHubClient, GitHubError } from './github.mjs';

const ORIGIN = 'https://api.github.com';

function response({ data = null, status = 200, link = null, text = undefined } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'link' ? link : null) },
    text: async () => (text !== undefined ? text : data === null ? '' : JSON.stringify(data)),
  };
}

function clientWith(handler, options = {}) {
  const calls = [];
  const client = new GitHubClient({
    token: 'tok',
    apiOrigin: ORIGIN,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return handler(url, init);
    },
    ...options,
  });
  return { client, calls };
}

test('GitHubClient validates token and fetch injection', () => {
  const error = new GitHubError('plain');
  assert.equal(error.name, 'GitHubError');
  assert.equal(error.status, 0);
  assert.equal(error.path, '');
  assert.throws(() => new GitHubClient({ token: '' , fetchImpl: () => {} }), /token unavailable/);
  assert.throws(() => new GitHubClient({ token: 1, fetchImpl: () => {} }), /token unavailable/);
  assert.throws(() => new GitHubClient({ token: 't', fetchImpl: null }), /fetch unavailable/);
  assert.equal(new GitHubClient({ token: 't', fetchImpl: () => {} }).token, 't');
});

test('request sends GitHub headers, JSON bodies and decodes JSON or text', async () => {
  const { client, calls } = clientWith(() => response({ data: { ok: true }, status: 201 }));
  const result = await client.request('/repos/a/b', { method: 'post', body: { x: 1 }, accept: 'application/json' });
  assert.equal(result.status, 201);
  assert.deepEqual(result.data, { ok: true });
  assert.equal(calls[0].url, `${ORIGIN}/repos/a/b`);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal(calls[0].init.headers.Accept, 'application/json');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.equal(calls[0].init.body, '{"x":1}');

  const textClient = clientWith(() => response({ text: 'plain' })).client;
  assert.equal(await textClient.getJson('/x'), 'plain');
  const emptyClient = clientWith(() => response()).client;
  assert.equal(await emptyClient.getJson('/x'), null);
});

test('request rejects foreign or insecure API targets', async () => {
  const { client } = clientWith(() => response({}));
  await assert.rejects(() => client.request('https://evil.example/x'), /refusing non-GitHub API URL/);
  await assert.rejects(() => client.request('http://api.github.com/x'), /refusing non-GitHub API URL/);
  const custom = new GitHubClient({ token: 't', apiOrigin: 'https://ghe.example', fetchImpl: () => response({}) });
  await assert.rejects(() => custom.request('/x'), /refusing non-GitHub API URL/);
});

test('a failed request reports API message or a fallback, and supports 404 optional reads', async () => {
  const apiError = clientWith(() => response({ data: { message: 'nope' }, status: 422 })).client;
  await assert.rejects(() => apiError.request('/x'), (error) => {
    assert.equal(error instanceof GitHubError, true);
    assert.equal(error.status, 422);
    assert.equal(error.path, '/x');
    assert.match(error.message, /failed \(422\): nope/);
    return true;
  });
  const fallback = clientWith(() => response({ data: [1], status: 500 })).client;
  await assert.rejects(() => fallback.request('/y'), /request failed/);

  const missing = clientWith(() => response({ status: 404 })).client;
  assert.deepEqual(await missing.getOptional('/missing'), { status: 404, data: null, headers: null });
  const server = clientWith(() => response({ status: 500 })).client;
  await assert.rejects(() => server.getOptional('/bad'), /failed \(500\)/);
});

test('paginate follows next links and enforces page, item and shape bounds', async () => {
  const pages = {
    [`${ORIGIN}/a`]: response({ data: [1], link: '<https://api.github.com/b>; rel="next"' }),
    [`${ORIGIN}/b`]: response({ data: [2], link: '<https://api.github.com/c>; rel="next", <https://api.github.com/z>; rel="last"' }),
    [`${ORIGIN}/c`]: response({ data: [3] }),
  };
  const { client } = clientWith((url) => pages[url]);
  assert.deepEqual(await client.paginate('/a'), [1, 2, 3]);

  const one = clientWith(() => response({ data: [1] })).client;
  assert.deepEqual(await one.paginate('/a', { maxPages: 1 }), [1]);
  assert.deepEqual(await one.paginate('/a', { maxItems: 1 }), [1]);

  const looping = clientWith(() => response({ data: [1], link: '<https://api.github.com/a>; rel="next"' })).client;
  await assert.rejects(() => looping.paginate('/a', { maxPages: 1 }), /page bound/);
  await assert.rejects(() => one.paginate('/a', { maxItems: 0 }), /item bound/);
  const notArray = clientWith(() => response({ data: {} })).client;
  await assert.rejects(() => notArray.paginate('/a'), /not an array/);
  const relOther = clientWith(() => response({ data: [], link: '<https://api.github.com/a>; rel="prev"' })).client;
  assert.deepEqual(await relOther.paginate('/a'), []);
  const relNoMatchValue = clientWith(() => response({ data: [], link: 'rel="next"' })).client;
  assert.deepEqual(await relNoMatchValue.paginate('/a'), []);
});

test('paginateList follows pages and validates the keyed array', async () => {
  const pages = {
    [`${ORIGIN}/a`]: response({ data: { items: [1] }, link: '<https://api.github.com/b>; rel="next"' }),
    [`${ORIGIN}/b`]: response({ data: { items: [2] } }),
  };
  const { client } = clientWith((url) => pages[url]);
  assert.deepEqual(await client.paginateList('/a', 'items'), [1, 2]);
  const looping = clientWith(() => response({ data: { items: [1] }, link: '<https://api.github.com/a>; rel="next"' })).client;
  await assert.rejects(() => looping.paginateList('/a', 'items', { maxPages: 1 }), /page bound/);
  await assert.rejects(() => looping.paginateList('/a', 'items', { maxItems: 0 }), /item bound/);
  const missing = clientWith(() => response({ data: {} })).client;
  await assert.rejects(() => missing.paginateList('/a', 'items'), /no items array/);
  const nullData = clientWith(() => response({ data: null })).client;
  await assert.rejects(() => nullData.paginateList('/a', 'items'), /no items array/);
});

test('getContentJson decodes content, handles 404 and rejects malformed responses', async () => {
  const good = clientWith((url, init) => {
    assert.match(url, /contents\/dir%2Fname%20x/);
    assert.match(url, /ref=feature%2Fone/);
    return response({ data: { encoding: 'base64', content: Buffer.from('hello').toString('base64') } });
  }).client;
  assert.equal(await good.getContentJson('o/r', 'dir/name x', 'feature/one'), 'hello');

  const missing = clientWith(() => response({ status: 404 })).client;
  assert.equal(await missing.getContentJson('o/r', 'x', 'y'), null);
  const badEncoding = clientWith(() => response({ data: { encoding: 'utf8', content: 'x' } })).client;
  await assert.rejects(() => badEncoding.getContentJson('o/r', 'x', 'y'), /contents response/);
  const badShape = clientWith(() => response({ data: null })).client;
  await assert.rejects(() => badShape.getContentJson('o/r', 'x', 'y'), /contents response/);
});

test('postStatus, postRerun and cancelRun send the expected POST requests', async () => {
  const { client, calls } = clientWith((url) => response({ data: { url } }));
  await client.postStatus('o/r', 'sha', { state: 'success', context: 'ctx', description: 'd', targetUrl: 'u' });
  await client.postRerun('o/r', 7);
  await client.cancelRun('o/r', 8);
  assert.equal(calls[0].url, `${ORIGIN}/repos/o/r/statuses/sha`);
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body), { state: 'success', context: 'ctx', description: 'd', target_url: 'u' });
  assert.equal(calls[1].url, `${ORIGIN}/repos/o/r/actions/jobs/7/rerun`);
  assert.equal(calls[1].init.method, 'POST');
  assert.equal(calls[2].url, `${ORIGIN}/repos/o/r/actions/runs/8/cancel`);
  assert.equal(calls[2].init.method, 'POST');
});
