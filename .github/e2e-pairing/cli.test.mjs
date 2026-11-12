import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  applyReviewGate,
  defaultReviewGate,
  defaultWriteOutputs,
  finalizeResolution,
  inspectPair,
  main,
  outputValues,
  pairEvaluationSkipped,
  rerunLocalWorkflow,
  resolvePair,
  runEntry,
} from './cli.mjs';

const APP_REPO = 'DFXswiss/app';
const BACKEND_REPO = 'DFXswiss/backend';
const APP_SHA = 'a'.repeat(40);
const BACKEND_SHA = 'b'.repeat(40);
const MERGE_SHA = 'c'.repeat(40);
const PREVIOUS_SHA = 'd'.repeat(40);
const PREVIOUS_BACKEND_SHA = 'e'.repeat(40);
const OTHER_APP_SHA = 'f'.repeat(40);
const RUN_URL = 'https://github.com/DFXswiss/app/actions/runs/77';
const STATUS = 'Full-stack E2E (paired)';
const SLUG = 'dfx-pair';
const BOT = { login: `${SLUG}[bot]`, type: 'Bot' };

function response(data, status = 200, link = null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'link' ? link : null) },
    text: async () => (data === null || data === undefined ? '' : JSON.stringify(data)),
  };
}

function pull({ number, state = 'open', merged = false, sha, base = 'develop' }) {
  return { number, state, merged, head: { sha }, base: { ref: base }, merge_commit_sha: MERGE_SHA };
}

function appPull(number = 12, options = {}) {
  return pull({ number, sha: APP_SHA, ...options });
}

function backendPull(number = 34, options = {}) {
  return pull({ number, sha: BACKEND_SHA, ...options });
}

function companion(repository, pullRequest) {
  return JSON.stringify({ repository, pull_request: pullRequest });
}

function content(text) {
  return { encoding: 'base64', content: Buffer.from(text, 'utf8').toString('base64') };
}

function status({ state = 'success', description, createdAt = '2026-01-01T00:00:00Z', id = 1, creator = BOT } = {}) {
  return { id, state, context: STATUS, description, created_at: createdAt, creator, target_url: RUN_URL };
}

function run(status) {
  return { data: { status } };
}

function pairDescription(runId = 77) {
  return `pair app#12@aaaaaaa backend#34@bbbbbbb run ${runId}`;
}

function runningDescription(runId = 77) {
  return `pair app#12@aaaaaaa backend#34@bbbbbbb running ${runId}`;
}

function runningFor(appSha, backendSha, runId) {
  return `pair app#12@${appSha.slice(0, 7)} backend#34@${backendSha.slice(0, 7)} running ${runId}`;
}

class FakeGitHub {
  constructor(routes = {}) {
    this.routes = routes;
    this.calls = [];
  }

  static key(url, method) {
    const parsed = new URL(url);
    return `${method.toUpperCase()} ${parsed.pathname}${parsed.search}`;
  }

  async fetch(url, options = {}) {
    const method = options.method || 'GET';
    const key = FakeGitHub.key(url, method);
    this.calls.push({ key, url, options });
    const route = this.routes[key];
    if (route === undefined) {
      return response({ message: `unexpected ${key}` }, 404);
    }
    if (route instanceof Error) {
      throw route;
    }
    if (route && typeof route === 'object' && !Array.isArray(route) && ('data' in route || 'status' in route || 'link' in route)) {
      return response(route.data ?? null, route.status ?? 200, route.link ?? null);
    }
    return response(route);
  }

  statusPosts() {
    return this.calls
      .filter((call) => call.key.startsWith('POST ') && call.key.includes('/statuses/'))
      .map((call) => ({ key: call.key, body: JSON.parse(call.options.body) }));
  }

  reruns() {
    return this.calls.filter((call) => call.key.startsWith('POST ') && call.key.endsWith('/rerun'));
  }

  cancels() {
    return this.calls.filter((call) => call.key.startsWith('POST ') && call.key.endsWith('/cancel'));
  }
}

function deps(fake, extra = {}) {
  const writes = [];
  const logs = [];
  const errors = [];
  return {
    deps: {
      fetch: fake.fetch.bind(fake),
      env: { GH_TOKEN: 'secret-token', E2E_PAIR_APP_SLUG: SLUG, RUN_URL, ...extra.env },
      writeOutputs: (values, env) => writes.push([values, env]),
      log: (message) => logs.push(message),
      error: (message) => errors.push(message),
      reviewGate: extra.reviewGate || (async () => ({ ok: true, reasons: [] })),
    },
    writes,
    logs,
    errors,
  };
}

function validPairRoutes({ app = appPull(), backend = backendPull(), appFiles, backendFiles } = {}) {
  const appRef = app.state === 'open' || app.merged !== true ? app.head.sha : app.merge_commit_sha;
  const backendRef = backend.state === 'open' || backend.merged !== true ? backend.head.sha : backend.merge_commit_sha;
  return {
    'GET /repos/DFXswiss/app/pulls/12': app,
    'GET /repos/DFXswiss/app/pulls/12/files?per_page=100': appFiles || [{ filename: 'e2e-companion.json', status: 'modified' }],
    [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${appRef}`]: content(companion(BACKEND_REPO, 34)),
    'GET /repos/DFXswiss/backend/pulls/34': backend,
    'GET /repos/DFXswiss/backend/pulls/34/files?per_page=100': backendFiles || [{ filename: 'e2e-companion.json', status: 'added' }],
    [`GET /repos/DFXswiss/backend/contents/e2e-companion.json?ref=${backendRef}`]: content(companion(APP_REPO, 12)),
  };
}

function localRunRoutes({ repo, sha, runId, path, jobId = 100, runStatus = 'completed', runName = 'Full-stack E2E', jobs = null }) {
  return {
    [`GET /repos/${repo}/actions/runs?head_sha=${sha}&event=pull_request&per_page=100`]: {
      workflow_runs: [{ id: runId, status: runStatus, event: 'pull_request', head_sha: sha, path, created_at: '2026-01-01T00:00:00Z' }],
    },
    [`GET /repos/${repo}/actions/runs/${runId}/jobs?filter=latest&per_page=100`]: {
      jobs: jobs || [{ id: jobId, name: runName }],
    },
    [`POST /repos/${repo}/actions/jobs/${jobId}/rerun`]: { id: jobId },
  };
}

function openPairWithLocalRuns(extra = {}) {
  return {
    ...validPairRoutes(),
    ...localRunRoutes({ repo: APP_REPO, sha: APP_SHA, runId: 10, jobId: 101, path: '.github/workflows/pr.yml@refs/pull/12/merge', runName: 'Build / Full-stack E2E' }),
    ...localRunRoutes({ repo: BACKEND_REPO, sha: BACKEND_SHA, runId: 20, jobId: 201, path: '.github/workflows/api-pr.yaml@refs/pull/34/merge' }),
    ...extra,
  };
}

function resolveEnv(extra = {}) {
  return { START_REPO: APP_REPO, START_PR: '12', GITHUB_RUN_ID: '77', RUN_URL, ...extra };
}

test('inspectPair resolves an open pair through paginated file lists', async () => {
  const fake = new FakeGitHub({
    ...validPairRoutes(),
    'GET /repos/DFXswiss/app/pulls/12/files?per_page=100': {
      data: [{ filename: 'README.md', status: 'modified' }],
      link: '<https://api.github.com/repos/DFXswiss/app/pulls/12/files?per_page=100&page=2>; rel="next"',
    },
    'GET /repos/DFXswiss/app/pulls/12/files?per_page=100&page=2': [{ filename: 'e2e-companion.json', status: 'added' }],
  });
  const { deps: injected } = deps(fake);
  const { GitHubClient } = await import('./github.mjs');
  const result = await inspectPair({
    client: new GitHubClient({ token: 't', fetchImpl: fake.fetch.bind(fake) }),
    startRepo: APP_REPO,
    startPr: '12',
    reviewGate: injected.reviewGate,
  });
  assert.equal(result.valid, true);
  assert.equal(result.paired, true);
  assert.equal(result.mutual, true);
  assert.equal(result.app_sha, APP_SHA);
  assert.equal(result.backend_sha, BACKEND_SHA);
  assert.equal(result.app_merged, false);
  assert.equal(result.backend_merged, false);
});

test('inspectPair starts from the backend and reads the same pair', async () => {
  const { GitHubClient } = await import('./github.mjs');
  const fake = new FakeGitHub(validPairRoutes());
  const result = await inspectPair({
    client: new GitHubClient({ token: 't', fetchImpl: fake.fetch.bind(fake) }),
    startRepo: BACKEND_REPO,
    startPr: 34,
  });
  assert.equal(result.valid, true);
  assert.equal(result.app_pr, 12);
  assert.equal(result.backend_pr, 34);
});

test('inspectPair rejects bad inputs and non-object pull responses', async () => {
  const { GitHubClient } = await import('./github.mjs');
  const fake = new FakeGitHub({ 'GET /repos/DFXswiss/app/pulls/12': [] });
  const client = new GitHubClient({ token: 't', fetchImpl: fake.fetch.bind(fake) });
  await assert.rejects(() => inspectPair({ client, startRepo: 'other/repo', startPr: 12 }), /unsupported start repository/);
  await assert.rejects(() => inspectPair({ client, startRepo: APP_REPO, startPr: 'bad' }), /not a positive integer/);
  await assert.rejects(() => inspectPair({ client, startRepo: APP_REPO, startPr: 12 }), /not an object/);

  const companionFake = new FakeGitHub({
    'GET /repos/DFXswiss/app/pulls/12': appPull(),
    'GET /repos/DFXswiss/app/pulls/12/files?per_page=100': [{ filename: 'e2e-companion.json', status: 'modified' }],
    [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${APP_SHA}`]: content(companion(BACKEND_REPO, 34)),
    'GET /repos/DFXswiss/backend/pulls/34': [],
  });
  await assert.rejects(
    () => inspectPair({ client: new GitHubClient({ token: 't', fetchImpl: companionFake.fetch.bind(companionFake) }), startRepo: APP_REPO, startPr: 12 }),
    /DFXswiss\/backend#34 is not an object/,
  );
});

test('close validation still yields to a closed non-develop start', async () => {
  const closedApp = appPull(12, { state: 'closed', merged: false, base: 'main' });
  const fake = new FakeGitHub(validPairRoutes({ app: closedApp }));
  const { deps: injected } = deps(fake);
  assert.equal(await main(['invalidate'], { ...injected, env: { ...injected.env, START_REPO: APP_REPO, START_PR: '12', CLOSED: 'true', MERGED: 'false', RUN_URL } }), 0);
  assert.equal(fake.statusPosts().length, 0);
});

test('inspectPair fails closed for every invalid resolution branch', async () => {
  const cases = [
    { name: 'missing pull', routes: {}, reason: /not found/ },
    { name: 'inactive app file', routes: validPairRoutes({ appFiles: [{ filename: 'e2e-companion.json', status: 'removed' }] }), reason: /not active/ },
    { name: 'missing app companion', routes: { ...validPairRoutes(), [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${APP_SHA}`]: { status: 404 } }, reason: /invalid e2e-companion/ },
    { name: 'invalid app companion', routes: { ...validPairRoutes(), [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${APP_SHA}`]: content('{"repository":"wrong","pull_request":34}') }, reason: /invalid e2e-companion/ },
    { name: 'missing backend pull', routes: { ...validPairRoutes(), 'GET /repos/DFXswiss/backend/pulls/34': { status: 404 } }, reason: /not found/ },
    { name: 'inactive backend file', routes: validPairRoutes({ backendFiles: [{ filename: 'e2e-companion.json', status: 'removed' }] }), reason: /not active/ },
    { name: 'missing backend companion', routes: { ...validPairRoutes(), [`GET /repos/DFXswiss/backend/contents/e2e-companion.json?ref=${BACKEND_SHA}`]: { status: 404 } }, reason: /invalid e2e-companion/ },
    { name: 'invalid backend companion', routes: { ...validPairRoutes(), [`GET /repos/DFXswiss/backend/contents/e2e-companion.json?ref=${BACKEND_SHA}`]: content('{"repository":"wrong","pull_request":12}') }, reason: /invalid e2e-companion/ },
    { name: 'not mutual', routes: { ...validPairRoutes(), [`GET /repos/DFXswiss/backend/contents/e2e-companion.json?ref=${BACKEND_SHA}`]: content(companion(APP_REPO, 13)) }, reason: /do not point/ },
    { name: 'app base', routes: validPairRoutes({ app: appPull(12, { base: 'main' }) }), reason: /base is not develop/ },
    { name: 'backend base', routes: validPairRoutes({ backend: backendPull(34, { base: 'main' }) }), reason: /base is not develop/ },
  ];
  const { GitHubClient } = await import('./github.mjs');
  for (const item of cases) {
    const fake = new FakeGitHub(item.routes);
    const result = await inspectPair({
      client: new GitHubClient({ token: 't', fetchImpl: fake.fetch.bind(fake) }),
      startRepo: APP_REPO,
      startPr: 12,
    });
    assert.equal(result.valid, false, item.name);
    assert.match(result.reason, item.reason, item.name);
  }
});

test('inspectPair uses merged companion commits and resolves closed-unmerged companions', async () => {
  const { GitHubClient } = await import('./github.mjs');
  const mergedBackend = backendPull(34, { state: 'closed', merged: true });
  const mergedFake = new FakeGitHub(validPairRoutes({ backend: mergedBackend }));
  const merged = await inspectPair({
    client: new GitHubClient({ token: 't', fetchImpl: mergedFake.fetch.bind(mergedFake) }),
    startRepo: APP_REPO,
    startPr: 12,
  });
  assert.equal(merged.valid, true);
  assert.equal(merged.backend_merged, true);
  assert.equal(merged.backend_sha, MERGE_SHA);

  const closedBackend = backendPull(34, { state: 'closed', merged: false });
  const closedFake = new FakeGitHub({
    ...validPairRoutes({ backend: closedBackend }),
    [`GET /repos/DFXswiss/backend/contents/e2e-companion.json?ref=${BACKEND_SHA}`]: content(companion(APP_REPO, 12)),
  });
  const closed = await inspectPair({
    client: new GitHubClient({ token: 't', fetchImpl: closedFake.fetch.bind(closedFake) }),
    startRepo: APP_REPO,
    startPr: 12,
  });
  assert.equal(closed.valid, false);
  assert.equal(closed.reason, 'companion closed without merge');
  assert.equal(closed.backend_pr, 34);
  assert.equal(closed.backend_pull.state, 'closed');
});

test('a closed-unmerged start resolves its companion but tolerates unreadable hints', async () => {
  const { GitHubClient } = await import('./github.mjs');
  const closedApp = appPull(12, { state: 'closed', merged: false });
  const fake = new FakeGitHub(validPairRoutes({ app: closedApp }));
  const result = await inspectPair({
    client: new GitHubClient({ token: 't', fetchImpl: fake.fetch.bind(fake) }),
    startRepo: APP_REPO,
    startPr: 12,
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'companion closed without merge');
  assert.equal(result.backend_pr, 34);

  const noHint = new FakeGitHub({
    ...validPairRoutes({ app: closedApp }),
    [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${APP_SHA}`]: { status: 404 },
  });
  const noHintResult = await inspectPair({
    client: new GitHubClient({ token: 't', fetchImpl: noHint.fetch.bind(noHint) }),
    startRepo: APP_REPO,
    startPr: 12,
  });
  assert.equal(noHintResult.valid, false);
  assert.equal(noHintResult.backend_pr, null);

  const badHint = new FakeGitHub({
    ...validPairRoutes({ app: closedApp }),
    [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${APP_SHA}`]: content('bad'),
  });
  const badHintResult = await inspectPair({
    client: new GitHubClient({ token: 't', fetchImpl: badHint.fetch.bind(badHint) }),
    startRepo: APP_REPO,
    startPr: 12,
  });
  assert.equal(badHintResult.valid, false);
  assert.equal(badHintResult.backend_pr, null);

  const unreadableCompanion = new FakeGitHub({
    ...validPairRoutes({ app: closedApp }),
    'GET /repos/DFXswiss/backend/pulls/34': { status: 404 },
  });
  const unreadableResult = await inspectPair({
    client: new GitHubClient({ token: 't', fetchImpl: unreadableCompanion.fetch.bind(unreadableCompanion) }),
    startRepo: APP_REPO,
    startPr: 12,
  });
  assert.equal(unreadableResult.valid, false);
  assert.equal(unreadableResult.backend_pull, null);
});

test('closed-unmerged heads keep an invalid fallback head and tolerate a missing hint', async () => {
  const { GitHubClient } = await import('./github.mjs');
  const invalidStart = new FakeGitHub({
    ...validPairRoutes({ app: appPull(12, { state: 'closed', merged: false, sha: 'bad' }) }),
    [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=bad`]: content(companion(BACKEND_REPO, 34)),
  });
  const startResult = await inspectPair({
    client: new GitHubClient({ token: 't', fetchImpl: invalidStart.fetch.bind(invalidStart) }),
    startRepo: APP_REPO,
    startPr: 12,
  });
  assert.equal(startResult.valid, false);
  assert.equal(startResult.app_sha, 'bad');
  assert.equal(startResult.backend_pr, 34);

  const noReadableHead = new FakeGitHub(
    validPairRoutes({ app: appPull(12, { state: 'closed', merged: false, sha: 1 }) }),
  );
  const noHeadResult = await inspectPair({
    client: new GitHubClient({ token: 't', fetchImpl: noReadableHead.fetch.bind(noReadableHead) }),
    startRepo: APP_REPO,
    startPr: 12,
  });
  assert.equal(noHeadResult.valid, false);
  assert.equal(noHeadResult.app_sha, '');
  assert.equal(noHeadResult.backend_pr, null);

  const invalidCompanion = new FakeGitHub(
    validPairRoutes({ backend: backendPull(34, { state: 'closed', merged: false, sha: 'bad' }) }),
  );
  const companionResult = await inspectPair({
    client: new GitHubClient({ token: 't', fetchImpl: invalidCompanion.fetch.bind(invalidCompanion) }),
    startRepo: APP_REPO,
    startPr: 12,
  });
  assert.equal(companionResult.valid, false);
  assert.equal(companionResult.backend_sha, 'bad');
  assert.equal(companionResult.reason, 'companion closed without merge');

  const noReadableBackend = new FakeGitHub(
    validPairRoutes({ backend: backendPull(34, { state: 'closed', merged: false, sha: 1 }) }),
  );
  const backendResult = await inspectPair({
    client: new GitHubClient({ token: 't', fetchImpl: noReadableBackend.fetch.bind(noReadableBackend) }),
    startRepo: BACKEND_REPO,
    startPr: 34,
  });
  assert.equal(backendResult.valid, false);
  assert.equal(backendResult.backend_sha, '');
});

test('a non-mutual pair posts its failure only on the starting side', async () => {
  const fake = new FakeGitHub({
    ...validPairRoutes(),
    [`GET /repos/DFXswiss/backend/contents/e2e-companion.json?ref=${BACKEND_SHA}`]: content(companion(APP_REPO, 13)),
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    ...localRunRoutes({ repo: APP_REPO, sha: APP_SHA, runId: 10, path: '.github/workflows/pr.yml' }),
  });
  const { deps: injected, writes } = deps(fake);
  assert.equal(await main(['resolve'], { ...injected, env: { ...injected.env, ...resolveEnv() } }), 0);
  assert.equal(writes[0][0].valid, 'false');
  assert.equal(fake.statusPosts().length, 1);
  assert.equal(fake.statusPosts()[0].key, `POST /repos/DFXswiss/app/statuses/${APP_SHA}`);
});

test('a non-mutual pair from the backend start posts only on the backend side', async () => {
  const fake = new FakeGitHub({
    ...validPairRoutes(),
    [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${APP_SHA}`]: content(companion(BACKEND_REPO, 35)),
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 1 },
    ...localRunRoutes({ repo: BACKEND_REPO, sha: BACKEND_SHA, runId: 20, path: '.github/workflows/api-pr.yaml' }),
  });
  const { deps: injected, writes } = deps(fake);
  assert.equal(
    await main(['resolve'], {
      ...injected,
      env: { ...injected.env, ...resolveEnv(), START_REPO: BACKEND_REPO, START_PR: '34' },
    }),
    0,
  );
  assert.equal(writes[0][0].valid, 'false');
  assert.equal(fake.statusPosts().length, 1);
  assert.equal(fake.statusPosts()[0].key, `POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`);
});

test('a closed dispatch side reopens without inventing a missing PR number', async () => {
  const cases = [
    ['backend start', BACKEND_REPO, 34, 'GET /repos/DFXswiss/backend/pulls/34', BACKEND_REPO, BACKEND_SHA],
    ['app start', APP_REPO, 12, 'GET /repos/DFXswiss/app/pulls/12', APP_REPO, APP_SHA],
  ];
  for (const [name, startRepo, startPr, pullRoute, fileRepo, sha] of cases) {
    const fake = new FakeGitHub({
      [pullRoute]: pull({ number: startPr, state: 'closed', merged: false, sha }),
      [`GET /repos/${fileRepo}/pulls/${startPr}/files?per_page=100`]: [
        { filename: 'e2e-companion.json', status: 'modified' },
      ],
    });
    const { deps: injected, writes } = deps(fake);
    assert.equal(
      await main(['resolve'], {
        ...injected,
        env: {
          ...injected.env,
          ...resolveEnv(),
          EVENT_NAME: 'repository_dispatch',
          START_REPO: startRepo,
          START_PR: String(startPr),
        },
      }),
      0,
      name,
    );
    assert.equal(writes[0][0].valid, 'false', name);
  }
});

test('closed-unmerged dispatch sides tolerate incomplete companion hints', async () => {
  const cases = [
    { startRepo: BACKEND_REPO, startPr: 34, pullRoute: 'GET /repos/DFXswiss/backend/pulls/34', sha: BACKEND_SHA, companionNumber: 12 },
    { startRepo: APP_REPO, startPr: 12, pullRoute: 'GET /repos/DFXswiss/app/pulls/12', sha: APP_SHA, companionNumber: 34 },
  ];
  for (const item of cases) {
    const closed = pull({ number: item.startPr, state: 'closed', merged: false, sha: item.sha });
    const missingPull = new FakeGitHub({
      [item.pullRoute]: closed,
      [`${item.pullRoute}/files?per_page=100`]: [{ filename: 'e2e-companion.json', status: 'modified' }],
      [`GET /repos/${item.startRepo}/contents/e2e-companion.json?ref=${item.sha}`]: content(
        companion(item.startRepo === APP_REPO ? BACKEND_REPO : APP_REPO, item.companionNumber),
      ),
      [`GET /repos/${item.startRepo === APP_REPO ? BACKEND_REPO : APP_REPO}/pulls/${item.companionNumber}/files?per_page=100`]: [
        { filename: 'e2e-companion.json', status: 'modified' },
      ],
    });
    const { deps: injected, writes } = deps(missingPull);
    assert.equal(
      await main(['resolve'], {
        ...injected,
        env: { ...injected.env, ...resolveEnv(), EVENT_NAME: 'repository_dispatch', START_REPO: item.startRepo, START_PR: String(item.startPr) },
      }),
      0,
    );
    assert.equal(writes[0][0].valid, 'false');

    const noCompanionFile = new FakeGitHub({
      [item.pullRoute]: closed,
      [`${item.pullRoute}/files?per_page=100`]: [{ filename: 'e2e-companion.json', status: 'modified' }],
      [`GET /repos/${item.startRepo}/contents/e2e-companion.json?ref=${item.sha}`]: { status: 404 },
    });
    const { deps: noFileDeps, writes: noFileWrites } = deps(noCompanionFile);
    assert.equal(
      await main(['resolve'], {
        ...noFileDeps,
        env: { ...noFileDeps.env, ...resolveEnv(), EVENT_NAME: 'repository_dispatch', START_REPO: item.startRepo, START_PR: String(item.startPr) },
      }),
      0,
    );
    assert.equal(noFileWrites[0][0].valid, 'false');

    const nonObjectPull = new FakeGitHub({
      [item.pullRoute]: closed,
      [`${item.pullRoute}/files?per_page=100`]: [{ filename: 'e2e-companion.json', status: 'modified' }],
      [`GET /repos/${item.startRepo}/contents/e2e-companion.json?ref=${item.sha}`]: content(
        companion(item.startRepo === APP_REPO ? BACKEND_REPO : APP_REPO, item.companionNumber),
      ),
      [`GET /repos/${item.startRepo === APP_REPO ? BACKEND_REPO : APP_REPO}/pulls/${item.companionNumber}`]: [],
    });
    const { deps: nonObjectDeps, errors: nonObjectErrors } = deps(nonObjectPull);
    assert.equal(
      await main(['resolve'], {
        ...nonObjectDeps,
        env: { ...nonObjectDeps.env, ...resolveEnv(), EVENT_NAME: 'repository_dispatch', START_REPO: item.startRepo, START_PR: String(item.startPr) },
      }),
      1,
    );
    assert.match(nonObjectErrors[0], /is not an object/);
  }
});

test('reopen after merge skips closed companions', async () => {
  const appMerged = appPull(12, { state: 'closed', merged: true });
  const appMergedRoutes = validPairRoutes({ app: appMerged });
  const cases = [
    {
      name: 'backend side closed',
      routes: { ...appMergedRoutes, 'GET /repos/DFXswiss/backend/pulls/34': backendPull(34, { state: 'closed' }) },
      startRepo: APP_REPO,
      startPr: 12,
    },
    {
      name: 'app side closed',
      routes: { ...validPairRoutes({ backend: backendPull(34, { state: 'closed', merged: true }) }), 'GET /repos/DFXswiss/app/pulls/12': appPull(12, { state: 'closed' }) },
      startRepo: BACKEND_REPO,
      startPr: 34,
    },
  ];
  for (const item of cases) {
    const fake = new FakeGitHub(item.routes);
    const { deps: injected, writes } = deps(fake);
    assert.equal(
      await main(['resolve'], {
        ...injected,
        env: { ...injected.env, ...resolveEnv(), EVENT_NAME: 'pull_request_target', START_REPO: item.startRepo, START_PR: String(item.startPr) },
      }),
      0,
      item.name,
    );
    assert.equal(writes.length, 1, item.name);
  }
});

test('applyReviewGate checks each open side and skips a settled result', async () => {
  const fake = new FakeGitHub(validPairRoutes());
  const { GitHubClient } = await import('./github.mjs');
  const client = new GitHubClient({ token: 't', fetchImpl: fake.fetch.bind(fake) });
  const invalid = await inspectPair({ client, startRepo: APP_REPO, startPr: 12 });
  const calls = [];
  const skipped = await applyReviewGate({ ...invalid, valid: false }, { reviewGate: async (args) => { calls.push(args); return { ok: true }; } });
  assert.equal(skipped.valid, false);
  assert.equal(calls.length, 0);

  const pending = await applyReviewGate({ ...invalid, valid: true }, { reviewGate: async ({ repo }) => (repo === APP_REPO ? { ok: false, reasons: [] } : { ok: false, reasons: ['missing'] }) });
  assert.equal(pending.valid, false);
  assert.equal(pending.review_pending, true);
  assert.match(pending.reason, /review gate failed/);
  assert.match(pending.reason, /missing/);

  const nullGate = await applyReviewGate({ ...invalid, valid: true }, { reviewGate: async () => null });
  assert.match(nullGate.reason, /review gate failed/);

  const resolved = await resolvePair({ client, startRepo: APP_REPO, startPr: 12, reviewGate: async () => ({ ok: true, reasons: [] }) });
  assert.equal(resolved.valid, true);
});

test('resolve posts a running marker on every open head and writes outputs', async () => {
  const fake = new FakeGitHub({
    ...openPairWithLocalRuns(),
    [`GET /repos/DFXswiss/app/commits/${APP_SHA}/statuses?per_page=100`]: [],
    [`GET /repos/DFXswiss/backend/commits/${BACKEND_SHA}/statuses?per_page=100`]: [],
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
  });
  const { deps: injected, writes, logs } = deps(fake);
  const code = await main(['resolve'], { ...injected, env: { ...injected.env, ...resolveEnv() } });
  assert.equal(code, 0);
  assert.equal(writes[0][0].valid, 'true');
  const posted = fake.statusPosts();
  assert.equal(posted.length, 2);
  assert.equal(posted[0].body.state, 'pending');
  assert.equal(posted[0].body.description, runningDescription(77));
  assert.equal(posted[1].body.description, runningDescription(77));
  assert.equal(fake.reruns().length, 2);
  assert.match(logs.at(-1), /Pair resolved/);
});

test('resolve turns review-gate misses into pending and does not rerun', async () => {
  const fake = new FakeGitHub({
    ...validPairRoutes(),
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
  });
  const { deps: injected, writes, errors } = deps(fake, {
    reviewGate: async ({ repo }) => ({ ok: repo !== BACKEND_REPO, reasons: ['second review comment missing'] }),
  });
  const code = await main(['resolve'], { ...injected, env: { ...injected.env, ...resolveEnv() } });
  assert.equal(code, 0);
  assert.equal(errors.length, 0);
  assert.equal(writes[0][0].valid, 'false');
  assert.equal(writes[0][0].review_pending, 'true');
  const posted = fake.statusPosts();
  assert.equal(posted.length, 2);
  assert.equal(posted[0].body.state, 'pending');
  assert.equal(posted[0].body.description, 'review gate not satisfied: DFXswiss/backend#34: second review comment missing');
  assert.equal(fake.reruns().length, 0);
});

test('resolve posts failure and reruns for a non-review invalid pair', async () => {
  const fake = new FakeGitHub({});
  const { deps: injected, writes } = deps(fake);
  const code = await main(['resolve'], { ...injected, env: { ...injected.env, ...resolveEnv() } });
  assert.equal(code, 0);
  assert.equal(writes[0][0].valid, 'false');
  assert.equal(writes[0][0].review_pending, 'false');
  assert.equal(fake.statusPosts().length, 0);
});

test('resolve rejects a missing target URL for a partially open pair', async () => {
  const partial = new FakeGitHub({
    ...validPairRoutes(),
    [`GET /repos/DFXswiss/backend/contents/e2e-companion.json?ref=${BACKEND_SHA}`]: content(companion(APP_REPO, 13)),
  });
  const { deps: partialDeps, errors: partialErrors } = deps(partial);
  assert.equal(
    await main(['resolve'], { ...partialDeps, env: { ...partialDeps.env, ...resolveEnv(), RUN_URL: '', GITHUB_RUN_ID: '' } }),
    1,
  );
  assert.match(partialErrors[0], /status target URL unavailable/);
});

test('post-resolution failure tolerates a pair with no open side', async () => {
  const { GitHubClient } = await import('./github.mjs');
  const writes = [];
  const logs = [];
  const fake = new FakeGitHub({
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
  });
  const code = await finalizeResolution(
    new GitHubClient({ token: 't', fetchImpl: fake.fetch.bind(fake) }),
    { paired: true, valid: false, reason: 'pair invalid', app_pr: 12, app_sha: APP_SHA, app_pull: { state: 'open' }, app_effective: { ok: false } },
    { RUN_URL },
    { writeOutputs: (values) => writes.push(values), log: (message) => logs.push(message) },
  );
  assert.equal(code, 0);
  assert.equal(writes.length, 1);
  assert.equal(fake.statusPosts().length, 0);
  assert.match(logs.at(-1), /pair invalid/);
});

test('post-resolution failure uses the generic descriptions without a reason', async () => {
  const { GitHubClient } = await import('./github.mjs');
  const fake = new FakeGitHub({
    ...localRunRoutes({ repo: APP_REPO, sha: APP_SHA, runId: 10, path: '.github/workflows/pr.yml' }),
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
  });
  const client = new GitHubClient({ token: 't', fetchImpl: fake.fetch.bind(fake) });
  const base = {
    paired: true,
    valid: false,
    app_pr: 12,
    app_sha: APP_SHA,
    app_pull: { state: 'open' },
    app_effective: { ok: true },
    start_repo: APP_REPO,
    start_pr: 12,
  };
  await finalizeResolution(client, base, { RUN_URL }, { writeOutputs: () => {}, log: () => {} });
  await finalizeResolution(client, { ...base, review_pending: true }, { RUN_URL }, { writeOutputs: () => {}, log: () => {} });
  const descriptions = fake.statusPosts().map((post) => post.body.description);
  assert.equal(descriptions.includes('pair invalid'), true);
  assert.equal(descriptions.includes('review gate not satisfied'), true);
});

test('resolve rejects bad start input and missing run identity', async () => {
  const fake = new FakeGitHub({
    ...openPairWithLocalRuns(),
    [`GET /repos/DFXswiss/app/commits/${APP_SHA}/statuses?per_page=100`]: [],
    [`GET /repos/DFXswiss/backend/commits/${BACKEND_SHA}/statuses?per_page=100`]: [],
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
  });
  const { deps: injected, errors } = deps(fake);
  assert.equal(await main(['resolve'], { ...injected, env: { ...injected.env, ...resolveEnv(), START_PR: '0' } }), 1);
  assert.match(errors[0], /START_PR is not a positive integer/);
  const { deps: noRun } = deps(fake);
  assert.equal(await main(['resolve'], { ...noRun, env: { ...noRun.env, ...resolveEnv(), GITHUB_RUN_ID: '' } }), 1);
});

test('resolve handles a merged companion by rerunning from the open side', async () => {
  const mergedBackend = backendPull(34, { state: 'closed', merged: true });
  const fake = new FakeGitHub({
    ...validPairRoutes({ backend: mergedBackend }),
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    [`GET /repos/DFXswiss/app/commits/${APP_SHA}/statuses?per_page=100`]: [],
    ...localRunRoutes({ repo: APP_REPO, sha: APP_SHA, runId: 10, path: '.github/workflows/pr.yml' }),
  });
  const { deps: injected, writes } = deps(fake);
  const code = await main(['resolve'], { ...injected, env: { ...injected.env, ...resolveEnv() } });
  assert.equal(code, 0);
  assert.equal(writes[0][0].backend_merged, 'true');
  assert.equal(writes[0][0].valid, 'true');
  assert.equal(fake.statusPosts().length, 1);
  assert.equal(fake.statusPosts()[0].key, `POST /repos/DFXswiss/app/statuses/${APP_SHA}`);
});

test('resolve does not run when both sides are already merged', async () => {
  const mergedApp = appPull(12, { state: 'closed', merged: true });
  const mergedBackend = backendPull(34, { state: 'closed', merged: true });
  const fake = new FakeGitHub(validPairRoutes({ app: mergedApp, backend: mergedBackend }));
  const { deps: injected, writes } = deps(fake);
  const code = await main(['resolve'], { ...injected, env: { ...injected.env, ...resolveEnv() } });
  assert.equal(code, 0);
  assert.equal(writes[0][0].valid, 'false');
  assert.match(writes[0][0].reason, /nothing to attest/);
  assert.equal(fake.statusPosts().length, 0);
});

test('a closed app pull request does not post on its closed head', async () => {
  const fake = new FakeGitHub(validPairRoutes({ app: appPull(12, { state: 'closed', merged: false }) }));
  const { deps: injected, writes } = deps(fake, { reviewGate: async () => ({ ok: true, reasons: [] }) });
  const code = await main(['resolve'], {
    ...injected,
    env: { ...injected.env, ...resolveEnv(), EVENT_NAME: 'pull_request_target', EVENT_ACTION: 'closed' },
  });
  assert.equal(code, 0);
  assert.equal(writes[0][0].valid, 'false');
  assert.equal(writes[0][0].reason, 'companion closed without merge');
  assert.equal(fake.statusPosts().length, 0);
});

test('a dispatch cancels only a proven previous-head run and invalidates the open pair', async () => {
  const previousMarker = status({
    state: 'pending',
    description: runningFor(APP_SHA, PREVIOUS_BACKEND_SHA, 88),
    creator: BOT,
  });
  const fake = new FakeGitHub({
    ...openPairWithLocalRuns(),
    [`GET /repos/DFXswiss/app/commits/${APP_SHA}/statuses?per_page=100`]: [],
    [`GET /repos/DFXswiss/backend/commits/${BACKEND_SHA}/statuses?per_page=100`]: [],
    [`GET /repos/DFXswiss/backend/commits/${PREVIOUS_BACKEND_SHA}/statuses?per_page=100`]: [
      previousMarker,
      status({ state: 'pending', description: runningFor(APP_SHA, PREVIOUS_BACKEND_SHA, 89), creator: { login: 'human', type: 'User' } }),
      status({ state: 'pending', description: 'pair re-evaluation pending', creator: BOT }),
      status({ state: 'success', description: runningDescription(90), creator: BOT }),
      null,
      status({ state: 'pending', description: 'pair app#13@aaaaaaa backend#35@bbbbbbb running 91', creator: BOT }),
    ],
    'GET /repos/DFXswiss/app/actions/runs/88': run('in_progress'),
    'GET /repos/DFXswiss/app/actions/runs/89': run('in_progress'),
    'POST /repos/DFXswiss/app/actions/runs/88/cancel': { id: 88 },
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
  });
  const { deps: injected, writes } = deps(fake);
  const code = await main(['resolve'], {
    ...injected,
    env: {
      ...injected.env,
      ...resolveEnv(),
      EVENT_NAME: 'repository_dispatch',
      START_REPO: BACKEND_REPO,
      START_PR: '34',
      PREVIOUS_SHA: PREVIOUS_BACKEND_SHA,
    },
  });
  assert.equal(code, 0);
  assert.equal(writes[0][0].valid, 'true');
  assert.equal(fake.cancels().length, 1);
  assert.equal(fake.cancels()[0].key, 'POST /repos/DFXswiss/app/actions/runs/88/cancel');
  assert.equal(fake.statusPosts().filter((post) => post.body.description === 'pair re-evaluation pending').length, 2);
  assert.equal(fake.statusPosts().filter((post) => post.body.description === runningDescription(77)).length, 2);
  assert.equal(fake.reruns().length, 2);
});

test('cancellation rejects a marker that still names the current changed head', async () => {
  const fake = new FakeGitHub({
    ...openPairWithLocalRuns(),
    [`GET /repos/DFXswiss/app/commits/${PREVIOUS_SHA}/statuses?per_page=100`]: [
      status({ state: 'pending', description: runningFor(APP_SHA, BACKEND_SHA, 88), creator: BOT }),
    ],
    'GET /repos/DFXswiss/app/actions/runs/88': run('in_progress'),
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
  });
  const { deps: injected } = deps(fake);
  assert.equal(await main(['resolve'], {
    ...injected,
    env: { ...injected.env, ...resolveEnv(), EVENT_NAME: 'pull_request_target', EVENT_ACTION: 'synchronize', PREVIOUS_SHA },
  }), 0);
  assert.equal(fake.cancels().length, 0);
});

test('cancellation rejects a marker for another pull-request number', async () => {
  const fake = new FakeGitHub({
    ...openPairWithLocalRuns(),
    [`GET /repos/DFXswiss/app/commits/${PREVIOUS_SHA}/statuses?per_page=100`]: [
      status({ state: 'pending', description: `pair app#13@${PREVIOUS_SHA.slice(0, 7)} backend#35@${BACKEND_SHA.slice(0, 7)} running 88`, creator: BOT }),
    ],
    'GET /repos/DFXswiss/app/actions/runs/88': run('in_progress'),
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
  });
  const { deps: injected } = deps(fake);
  assert.equal(await main(['resolve'], {
    ...injected,
    env: { ...injected.env, ...resolveEnv(), EVENT_NAME: 'pull_request_target', EVENT_ACTION: 'synchronize', PREVIOUS_SHA },
  }), 0);
  assert.equal(fake.cancels().length, 0);
});

test('repository dispatch cancellation uses the backend previous head', async () => {
  const fake = new FakeGitHub({
    ...openPairWithLocalRuns(),
    [`GET /repos/DFXswiss/app/commits/${APP_SHA}/statuses?per_page=100`]: [],
    [`GET /repos/DFXswiss/backend/commits/${BACKEND_SHA}/statuses?per_page=100`]: [],
    [`GET /repos/DFXswiss/backend/commits/${PREVIOUS_BACKEND_SHA}/statuses?per_page=100`]: [
      status({ state: 'pending', description: runningFor(APP_SHA, PREVIOUS_BACKEND_SHA, 88), creator: BOT }),
    ],
    'GET /repos/DFXswiss/app/actions/runs/88': run('in_progress'),
    'POST /repos/DFXswiss/app/actions/runs/88/cancel': { id: 88 },
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
  });
  const { deps: injected } = deps(fake);
  assert.equal(await main(['resolve'], {
    ...injected,
    env: {
      ...injected.env,
      ...resolveEnv(),
      EVENT_NAME: 'repository_dispatch',
      START_REPO: BACKEND_REPO,
      START_PR: '34',
      PREVIOUS_SHA: PREVIOUS_BACKEND_SHA,
    },
  }), 0);
  assert.equal(fake.cancels().length, 1);
});

test('a dispatch cancels a previous run even without the current run id', async () => {
  const fake = new FakeGitHub({
    ...openPairWithLocalRuns(),
    [`GET /repos/DFXswiss/app/commits/${APP_SHA}/statuses?per_page=100`]: [status({ description: pairDescription() })],
    [`GET /repos/DFXswiss/backend/commits/${BACKEND_SHA}/statuses?per_page=100`]: [],
    [`GET /repos/DFXswiss/backend/commits/${PREVIOUS_BACKEND_SHA}/statuses?per_page=100`]: [
      status({ state: 'pending', description: runningFor(APP_SHA, PREVIOUS_BACKEND_SHA, 88), creator: BOT }),
    ],
    'GET /repos/DFXswiss/app/actions/runs/88': run('in_progress'),
    'POST /repos/DFXswiss/app/actions/runs/88/cancel': { id: 88 },
  });
  const { deps: injected, writes } = deps(fake);
  const code = await main(['resolve'], {
    ...injected,
    env: {
      ...injected.env,
      ...resolveEnv(),
      GITHUB_RUN_ID: '',
      EVENT_NAME: 'repository_dispatch',
      START_REPO: BACKEND_REPO,
      START_PR: '34',
      PREVIOUS_SHA: PREVIOUS_BACKEND_SHA,
    },
  });
  assert.equal(code, 0);
  assert.equal(fake.cancels().length, 1);
  assert.equal(writes[0][0].reason, 'pair already attested or running');
});

test('a dispatch skips the previous companion after invalidating the current pair', async () => {
  const fake = new FakeGitHub({
    ...openPairWithLocalRuns(),
    [`GET /repos/DFXswiss/app/commits/${APP_SHA}/statuses?per_page=100`]: [],
    [`GET /repos/DFXswiss/backend/commits/${BACKEND_SHA}/statuses?per_page=100`]: [],
    [`GET /repos/DFXswiss/backend/commits/${PREVIOUS_BACKEND_SHA}/statuses?per_page=100`]: [],
    [`GET /repos/DFXswiss/backend/contents/e2e-companion.json?ref=${PREVIOUS_BACKEND_SHA}`]: content(companion(APP_REPO, 12)),
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
  });
  const { deps: injected } = deps(fake);
  const code = await main(['resolve'], {
    ...injected,
    env: {
      ...injected.env,
      ...resolveEnv(),
      EVENT_NAME: 'repository_dispatch',
      START_REPO: BACKEND_REPO,
      START_PR: '34',
      PREVIOUS_SHA: PREVIOUS_BACKEND_SHA,
    },
  });
  assert.equal(code, 0);
  assert.equal(fake.statusPosts().length, 4);
  assert.equal(fake.reruns().length, 2);
});

test('a dispatch invalidates a previous companion whose head moved', async () => {
  const fake = new FakeGitHub({
    ...openPairWithLocalRuns(),
    [`GET /repos/DFXswiss/app/commits/${APP_SHA}/statuses?per_page=100`]: [],
    [`GET /repos/DFXswiss/backend/commits/${BACKEND_SHA}/statuses?per_page=100`]: [],
    [`GET /repos/DFXswiss/backend/commits/${PREVIOUS_BACKEND_SHA}/statuses?per_page=100`]: [],
    [`GET /repos/DFXswiss/backend/contents/e2e-companion.json?ref=${PREVIOUS_BACKEND_SHA}`]: content(companion(APP_REPO, 13)),
    'GET /repos/DFXswiss/app/pulls/13': appPull(13, { sha: PREVIOUS_SHA }),
    'GET /repos/DFXswiss/app/pulls/13/files?per_page=100': [{ filename: 'e2e-companion.json', status: 'modified' }],
    [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${PREVIOUS_SHA}`]: content(companion(BACKEND_REPO, 34)),
    ...localRunRoutes({ repo: APP_REPO, sha: PREVIOUS_SHA, runId: 30, path: '/.github/workflows/pr.yml' }),
    [`POST /repos/DFXswiss/app/statuses/${PREVIOUS_SHA}`]: { id: 3 },
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
  });
  const { deps: injected, logs } = deps(fake);
  const code = await main(['resolve'], {
    ...injected,
    env: {
      ...injected.env,
      ...resolveEnv(),
      EVENT_NAME: 'repository_dispatch',
      START_REPO: BACKEND_REPO,
      START_PR: '34',
      PREVIOUS_SHA: PREVIOUS_BACKEND_SHA,
    },
  });
  assert.equal(code, 0);
  assert.equal(fake.statusPosts().filter((post) => post.key.includes(PREVIOUS_SHA)).length, 1);
  assert.match(logs.join('\n'), /invalidated previous companion/);
  assert.equal(fake.statusPosts().filter((post) => post.body.description === 'pair re-evaluation pending').length, 3);
  assert.equal(fake.reruns().length, 3);
});

test('dispatch invalidation tolerates every non-actionable previous-companion shape', async () => {
  const base = openPairWithLocalRuns();
  const appStatus = [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`];
  const backendStatus = [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`];
  const cases = [
    { name: 'bad sha', routes: base, previous: 'bad' },
    { name: 'missing previous file', routes: base, previous: PREVIOUS_BACKEND_SHA },
    { name: 'invalid previous file', routes: { ...base, [`GET /repos/DFXswiss/backend/contents/e2e-companion.json?ref=${PREVIOUS_BACKEND_SHA}`]: content('bad') }, previous: PREVIOUS_BACKEND_SHA },
    { name: 'missing previous pull', routes: { ...base, [`GET /repos/DFXswiss/backend/contents/e2e-companion.json?ref=${PREVIOUS_BACKEND_SHA}`]: content(companion(APP_REPO, 13)) }, previous: PREVIOUS_BACKEND_SHA },
    { name: 'previous pull closed', routes: { ...base, [`GET /repos/DFXswiss/backend/contents/e2e-companion.json?ref=${PREVIOUS_BACKEND_SHA}`]: content(companion(APP_REPO, 13)), 'GET /repos/DFXswiss/app/pulls/13': appPull(13, { state: 'closed' }) }, previous: PREVIOUS_BACKEND_SHA },
    { name: 'previous base main', routes: { ...base, [`GET /repos/DFXswiss/backend/contents/e2e-companion.json?ref=${PREVIOUS_BACKEND_SHA}`]: content(companion(APP_REPO, 13)), 'GET /repos/DFXswiss/app/pulls/13': appPull(13, { base: 'main' }) }, previous: PREVIOUS_BACKEND_SHA },
    { name: 'previous invalid head', routes: { ...base, [`GET /repos/DFXswiss/backend/contents/e2e-companion.json?ref=${PREVIOUS_BACKEND_SHA}`]: content(companion(APP_REPO, 13)), 'GET /repos/DFXswiss/app/pulls/13': appPull(13, { sha: 'bad' }) }, previous: PREVIOUS_BACKEND_SHA },
    { name: 'previous inactive files', routes: { ...base, [`GET /repos/DFXswiss/backend/contents/e2e-companion.json?ref=${PREVIOUS_BACKEND_SHA}`]: content(companion(APP_REPO, 13)), 'GET /repos/DFXswiss/app/pulls/13': appPull(13, { sha: PREVIOUS_SHA }), 'GET /repos/DFXswiss/app/pulls/13/files?per_page=100': [] }, previous: PREVIOUS_BACKEND_SHA },
    { name: 'previous missing back file', routes: { ...base, [`GET /repos/DFXswiss/backend/contents/e2e-companion.json?ref=${PREVIOUS_BACKEND_SHA}`]: content(companion(APP_REPO, 13)), 'GET /repos/DFXswiss/app/pulls/13': appPull(13, { sha: PREVIOUS_SHA }), 'GET /repos/DFXswiss/app/pulls/13/files?per_page=100': [{ filename: 'e2e-companion.json', status: 'modified' }] }, previous: PREVIOUS_BACKEND_SHA },
    { name: 'previous invalid back file', routes: { ...base, [`GET /repos/DFXswiss/backend/contents/e2e-companion.json?ref=${PREVIOUS_BACKEND_SHA}`]: content(companion(APP_REPO, 13)), 'GET /repos/DFXswiss/app/pulls/13': appPull(13, { sha: PREVIOUS_SHA }), 'GET /repos/DFXswiss/app/pulls/13/files?per_page=100': [{ filename: 'e2e-companion.json', status: 'modified' }], [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${PREVIOUS_SHA}`]: content('bad') }, previous: PREVIOUS_BACKEND_SHA },
    { name: 'previous back points elsewhere', routes: { ...base, [`GET /repos/DFXswiss/backend/contents/e2e-companion.json?ref=${PREVIOUS_BACKEND_SHA}`]: content(companion(APP_REPO, 13)), 'GET /repos/DFXswiss/app/pulls/13': appPull(13, { sha: PREVIOUS_SHA }), 'GET /repos/DFXswiss/app/pulls/13/files?per_page=100': [{ filename: 'e2e-companion.json', status: 'modified' }], [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${PREVIOUS_SHA}`]: content(companion(BACKEND_REPO, 35)) }, previous: PREVIOUS_BACKEND_SHA },
  ];
  for (const item of cases) {
    const fake = new FakeGitHub({
      ...item.routes,
      [`GET /repos/DFXswiss/app/commits/${APP_SHA}/statuses?per_page=100`]: [],
      [`GET /repos/DFXswiss/backend/commits/${BACKEND_SHA}/statuses?per_page=100`]: [],
      [`GET /repos/DFXswiss/backend/commits/${PREVIOUS_BACKEND_SHA}/statuses?per_page=100`]: [],
      [`GET /repos/DFXswiss/app/commits/${PREVIOUS_SHA}/statuses?per_page=100`]: [],
      [appStatus]: { id: 1 },
      [backendStatus]: { id: 2 },
    });
    const { deps: injected } = deps(fake);
    const code = await main(['resolve'], {
      ...injected,
      env: { ...injected.env, ...resolveEnv(), EVENT_NAME: 'repository_dispatch', START_REPO: BACKEND_REPO, START_PR: '34', PREVIOUS_SHA: item.previous },
    });
    assert.equal(code, 0, item.name);
  }
});

test('a dispatch handles a closed-unmerged backend and leaves failure as the newest companion status', async () => {
  const closedBackend = backendPull(34, { state: 'closed', merged: false });
  const fake = new FakeGitHub({
    'GET /repos/DFXswiss/backend/pulls/34': closedBackend,
    'GET /repos/DFXswiss/backend/pulls/34/files?per_page=100': [{ filename: 'e2e-companion.json', status: 'modified' }],
    [`GET /repos/DFXswiss/backend/contents/e2e-companion.json?ref=${BACKEND_SHA}`]: content(companion(APP_REPO, 12)),
    'GET /repos/DFXswiss/app/pulls/12': appPull(12),
    'GET /repos/DFXswiss/app/pulls/12/files?per_page=100': [{ filename: 'e2e-companion.json', status: 'modified' }],
    [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${APP_SHA}`]: content(companion(BACKEND_REPO, 34)),
    ...localRunRoutes({ repo: APP_REPO, sha: APP_SHA, runId: 10, path: '.github/workflows/pr.yml' }),
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
  });
  const { deps: injected, writes, logs } = deps(fake);
  const code = await main(['resolve'], {
    ...injected,
    env: { ...injected.env, ...resolveEnv(), EVENT_NAME: 'repository_dispatch', START_REPO: BACKEND_REPO, START_PR: '34' },
  });
  assert.equal(code, 0);
  assert.equal(writes[0][0].reason, 'companion closed without merge');
  const posted = fake.statusPosts();
  assert.equal(posted.length, 2);
  assert.equal(posted[0].body.state, 'pending');
  assert.equal(posted[0].body.description, 'pair re-evaluation pending');
  assert.equal(posted[1].body.state, 'failure');
  assert.equal(posted[1].body.description, 'companion closed without merge');
  assert.equal(posted.at(-1).body.state, 'failure');
  assert.match(logs.join('\n'), /failed open companion/);

});

test('dispatch closed handling does nothing for a merged, open or missing start', async () => {
  for (const [name, pullValue] of [['merged', backendPull(34, { state: 'closed', merged: true })], ['open', backendPull()], ['missing', null]]) {
    const routes = pullValue ? { ...openPairWithLocalRuns(), ...validPairRoutes({ backend: pullValue }) } : {};
    if (!pullValue) {
      routes['GET /repos/DFXswiss/backend/pulls/34'] = { status: 404 };
    }
    const fake = new FakeGitHub({
      ...routes,
      [`GET /repos/DFXswiss/app/commits/${APP_SHA}/statuses?per_page=100`]: [],
      [`GET /repos/DFXswiss/backend/commits/${BACKEND_SHA}/statuses?per_page=100`]: [],
      [`GET /repos/DFXswiss/backend/commits/${MERGE_SHA}/statuses?per_page=100`]: [],
      [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
      [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
    });
    const { deps: injected } = deps(fake);
    const code = await main(['resolve'], {
      ...injected,
      env: { ...injected.env, ...resolveEnv(), EVENT_NAME: 'repository_dispatch', START_REPO: BACKEND_REPO, START_PR: '34' },
    });
    assert.equal(code, 0, name);
  }
});

test('comments skip a valid newest success and publish nothing', async () => {
  const fake = new FakeGitHub({
    ...validPairRoutes(),
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
    [`GET /repos/DFXswiss/app/commits/${APP_SHA}/statuses?per_page=100`]: [status({ description: pairDescription() })],
    [`GET /repos/DFXswiss/backend/commits/${BACKEND_SHA}/statuses?per_page=100`]: [],
  });
  const { deps: injected, writes, logs } = deps(fake);
  const code = await main(['resolve'], { ...injected, env: { ...injected.env, ...resolveEnv(), EVENT_NAME: 'issue_comment' } });
  assert.equal(code, 0);
  assert.equal(writes[0][0].reason, 'pair already attested or running');
  assert.match(logs[0], /Skipped/);
  assert.equal(fake.statusPosts().length, 0);
});

test('comments skip a newest running marker only while its run is active', async () => {
  const active = new FakeGitHub({
    ...validPairRoutes(),
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
    [`GET /repos/DFXswiss/app/commits/${APP_SHA}/statuses?per_page=100`]: [status({ state: 'pending', description: runningDescription(88) })],
    [`GET /repos/DFXswiss/backend/commits/${BACKEND_SHA}/statuses?per_page=100`]: [],
    'GET /repos/DFXswiss/app/actions/runs/88': run('queued'),
  });
  const { deps: activeDeps, writes: activeWrites } = deps(active);
  assert.equal(await main(['resolve'], { ...activeDeps, env: { ...activeDeps.env, ...resolveEnv(), EVENT_NAME: 'issue_comment' } }), 0);
  assert.equal(activeWrites[0][0].reason, 'pair already attested or running');

  const inactive = new FakeGitHub({
    ...validPairRoutes(),
    [`GET /repos/DFXswiss/app/commits/${APP_SHA}/statuses?per_page=100`]: [status({ state: 'pending', description: runningDescription(88) })],
    [`GET /repos/DFXswiss/backend/commits/${BACKEND_SHA}/statuses?per_page=100`]: [],
    'GET /repos/DFXswiss/app/actions/runs/88': run('completed'),
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
    ...localRunRoutes({ repo: APP_REPO, sha: APP_SHA, runId: 10, path: '.github/workflows/pr.yml' }),
    ...localRunRoutes({ repo: BACKEND_REPO, sha: BACKEND_SHA, runId: 20, path: '.github/workflows/api-pr.yaml' }),
  });
  const { deps: inactiveDeps, writes: inactiveWrites } = deps(inactive);
  assert.equal(await main(['resolve'], { ...inactiveDeps, env: { ...inactiveDeps.env, ...resolveEnv(), EVENT_NAME: 'issue_comment' } }), 0);
  assert.equal(inactiveWrites[0][0].valid, 'true');
  assert.equal(inactive.statusPosts().filter((post) => post.body.description === 'pair re-evaluation pending').length, 2);
});

test('comments treat malformed pending markers and missing run responses as no result', async () => {
  const cases = [
    ['bad marker', { 'GET /repos/DFXswiss/app/actions/runs/88': run('in_progress') }, status({ state: 'pending', description: 'bad' })],
    ['missing run', {}, status({ state: 'pending', description: runningDescription(88) })],
    ['invalid run object', { 'GET /repos/DFXswiss/app/actions/runs/88': [] }, status({ state: 'pending', description: runningDescription(88) })],
  ];
  for (const [name, extra, marker] of cases) {
    const fake = new FakeGitHub({
      ...openPairWithLocalRuns(),
      [`GET /repos/DFXswiss/app/commits/${APP_SHA}/statuses?per_page=100`]: [marker],
      [`GET /repos/DFXswiss/backend/commits/${BACKEND_SHA}/statuses?per_page=100`]: [],
      [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
      [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
      ...extra,
    });
    const { deps: injected, writes, errors } = deps(fake);
    const code = await main(['resolve'], { ...injected, env: { ...injected.env, ...resolveEnv(), EVENT_NAME: 'issue_comment' } });
    if (name === 'invalid run object') {
      assert.equal(code, 1, name);
      assert.match(errors[0], /is not an object/, name);
    } else {
      assert.equal(code, 0, name);
      assert.equal(writes[0][0].valid, 'true', name);
    }
  }
});

test('pair evaluation ignores invalid heads and non-marker status shapes', async () => {
  let calls = 0;
  const client = {
    async paginate() {
      calls += 1;
      return [];
    },
  };
  const pair = { app_pr: 12, app_sha: APP_SHA, backend_pr: 34, backend_sha: BACKEND_SHA };
  assert.equal(await pairEvaluationSkipped(client, { ...pair, app_sha: 'bad' }, { E2E_PAIR_APP_SLUG: SLUG }), false);
  assert.equal(await pairEvaluationSkipped(client, { ...pair, backend_sha: 'bad' }, { E2E_PAIR_APP_SLUG: SLUG }), false);
  assert.equal(await pairEvaluationSkipped(client, { ...pair, app_sha: '' }, { E2E_PAIR_APP_SLUG: SLUG }), false);
  assert.equal(await pairEvaluationSkipped(client, { ...pair, backend_sha: '' }, { E2E_PAIR_APP_SLUG: SLUG }), false);
  assert.equal(calls, 0);

  const statusClient = {
    async paginate(url) {
      if (url.includes(APP_SHA)) {
        return [null, { description: 1 }];
      }
      return [];
    },
  };
  assert.equal(await pairEvaluationSkipped(statusClient, pair, { E2E_PAIR_APP_SLUG: SLUG }), false);
  const failed = {
    async paginate(url) {
      return url.includes(APP_SHA) ? [status({ state: 'failure', description: pairDescription() })] : [];
    },
  };
  assert.equal(await pairEvaluationSkipped(failed, pair, { E2E_PAIR_APP_SLUG: SLUG }), false);
  const malformed = {
    async paginate(url) {
      return url.includes(APP_SHA) ? [status({ state: 'pending', description: pairDescription() })] : [];
    },
  };
  assert.equal(await pairEvaluationSkipped(malformed, pair, { E2E_PAIR_APP_SLUG: SLUG }), false);
  await assert.rejects(() => pairEvaluationSkipped(client, pair, { E2E_PAIR_APP_SLUG: '' }), /slug unavailable/);
});

test('comments keep an invalid open pair invalid without publishing', async () => {
  const fake = new FakeGitHub({});
  const { deps: injected, writes } = deps(fake);
  assert.equal(
    await main(['resolve'], { ...injected, env: { ...injected.env, ...resolveEnv(), EVENT_NAME: 'issue_comment' } }),
    0,
  );
  assert.equal(writes[0][0].valid, 'false');
  assert.equal(fake.statusPosts().length, 0);
});

test('push cancellation tolerates unchanged heads, missing markers and inactive runs', async () => {
  const base = {
    ...openPairWithLocalRuns(),
    [`GET /repos/DFXswiss/app/commits/${PREVIOUS_SHA}/statuses?per_page=100`]: [
      status({ state: 'pending', description: runningFor(PREVIOUS_SHA, BACKEND_SHA, 88), creator: BOT }),
    ],
    'GET /repos/DFXswiss/app/actions/runs/88': run('completed'),
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
  };
  const cases = [
    ['unchanged head', { PREVIOUS_SHA: APP_SHA }],
    ['invalid head', { PREVIOUS_SHA: 'bad' }],
    ['inactive run', { PREVIOUS_SHA }],
  ];
  for (const [name, override] of cases) {
    const fake = new FakeGitHub(base);
    const { deps: injected } = deps(fake);
    const code = await main(['resolve'], {
      ...injected,
      env: { ...injected.env, ...resolveEnv(), EVENT_NAME: 'pull_request_target', EVENT_ACTION: 'synchronize', ...override },
    });
    assert.equal(code, 0, name);
    assert.equal(fake.cancels().length, 0, name);
  }
});

test('a repository dispatch does not cancel when the backend head did not change', async () => {
  const fake = new FakeGitHub({
    ...openPairWithLocalRuns(),
    [`GET /repos/DFXswiss/app/commits/${APP_SHA}/statuses?per_page=100`]: [],
    [`GET /repos/DFXswiss/backend/commits/${BACKEND_SHA}/statuses?per_page=100`]: [
      status({ state: 'pending', description: runningFor(APP_SHA, BACKEND_SHA, 88), creator: BOT }),
    ],
    'GET /repos/DFXswiss/app/actions/runs/88': run('in_progress'),
    'POST /repos/DFXswiss/app/actions/runs/88/cancel': { id: 88 },
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
  });
  const { deps: injected } = deps(fake);
  assert.equal(
    await main(['resolve'], {
      ...injected,
      env: {
        ...injected.env,
        ...resolveEnv(),
        EVENT_NAME: 'repository_dispatch',
        START_REPO: BACKEND_REPO,
        START_PR: '34',
        PREVIOUS_SHA: BACKEND_SHA,
      },
    }),
    0,
  );
  assert.equal(fake.cancels().length, 0);
});

test('a synchronize event does not cancel when the app head did not change', async () => {
  const fake = new FakeGitHub({
    ...openPairWithLocalRuns(),
    [`GET /repos/DFXswiss/app/commits/${APP_SHA}/statuses?per_page=100`]: [
      status({ state: 'pending', description: runningFor(APP_SHA, BACKEND_SHA, 88), creator: BOT }),
    ],
    'GET /repos/DFXswiss/app/actions/runs/88': run('in_progress'),
    'POST /repos/DFXswiss/app/actions/runs/88/cancel': { id: 88 },
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
  });
  const { deps: injected } = deps(fake);
  assert.equal(
    await main(['resolve'], {
      ...injected,
      env: {
        ...injected.env,
        ...resolveEnv(),
        EVENT_NAME: 'pull_request_target',
        EVENT_ACTION: 'synchronize',
        PREVIOUS_SHA: APP_SHA,
      },
    }),
    0,
  );
  assert.equal(fake.cancels().length, 0);
});

test('comments and manual dispatches never cancel a shared run', async () => {
  const cases = [
    ['issue_comment', { EVENT_NAME: 'issue_comment', PAIR_ALREADY_ATTESTED: true }],
    ['workflow_dispatch', { EVENT_NAME: 'workflow_dispatch', PAIR_ALREADY_ATTESTED: false }],
  ];
  for (const [name, event] of cases) {
    const { PAIR_ALREADY_ATTESTED, ...envOverride } = event;
    const fake = new FakeGitHub({
      ...openPairWithLocalRuns(),
      [`GET /repos/DFXswiss/app/commits/${PREVIOUS_SHA}/statuses?per_page=100`]: [
        status({ state: 'pending', description: runningFor(PREVIOUS_SHA, BACKEND_SHA, 88), creator: BOT }),
      ],
      'GET /repos/DFXswiss/app/actions/runs/88': run('in_progress'),
      'POST /repos/DFXswiss/app/actions/runs/88/cancel': { id: 88 },
      [`GET /repos/DFXswiss/app/commits/${APP_SHA}/statuses?per_page=100`]: PAIR_ALREADY_ATTESTED
        ? [status({ description: pairDescription() })]
        : [],
      [`GET /repos/DFXswiss/backend/commits/${BACKEND_SHA}/statuses?per_page=100`]: [],
      [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
      [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
    });
    const { deps: injected } = deps(fake);
    assert.equal(
      await main(['resolve'], {
        ...injected,
        env: { ...injected.env, ...resolveEnv(), PREVIOUS_SHA, ...envOverride },
      }),
      0,
      name,
    );
    assert.equal(fake.cancels().length, 0, name);
  }
});

test('cancellation never uses a malformed PREVIOUS_SHA in an API path', async () => {
  const fake = new FakeGitHub({
    ...openPairWithLocalRuns(),
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
  });
  const { deps: injected } = deps(fake);
  assert.equal(
    await main(['resolve'], {
      ...injected,
      env: {
        ...injected.env,
        ...resolveEnv(),
        EVENT_NAME: 'pull_request_target',
        EVENT_ACTION: 'synchronize',
        PREVIOUS_SHA: '../../commits/not-a-sha',
      },
    }),
    0,
  );
  assert.equal(fake.calls.some((call) => call.key.includes('not-a-sha')), false);
  assert.equal(fake.cancels().length, 0);
});

test('push cancellation ignores foreign and same-run markers and skips off-synchronize events', async () => {
  const markers = [
    null,
    status({ state: 'pending', description: 'pair re-evaluation pending' }),
    status({ state: 'success', description: runningFor(APP_SHA, BACKEND_SHA, 88) }),
    status({ state: 'pending', description: runningFor(APP_SHA, BACKEND_SHA, 88), creator: { login: 'human', type: 'User' } }),
    status({ state: 'pending', description: runningFor(PREVIOUS_SHA, BACKEND_SHA, 77), creator: BOT }),
    status({ state: 'pending', description: runningFor(OTHER_APP_SHA, BACKEND_SHA, 90), creator: BOT }),
  ];
  const fake = new FakeGitHub({
    ...openPairWithLocalRuns(),
    [`GET /repos/DFXswiss/app/commits/${PREVIOUS_SHA}/statuses?per_page=100`]: markers,
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
  });
  const { deps: injected } = deps(fake);
  assert.equal(await main(['resolve'], { ...injected, env: { ...injected.env, ...resolveEnv(), EVENT_NAME: 'pull_request_target', EVENT_ACTION: 'synchronize', PREVIOUS_SHA } }), 0);
  assert.equal(fake.cancels().length, 0);

  const reopened = new FakeGitHub({
    ...validPairRoutes(),
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
    ...localRunRoutes({ repo: APP_REPO, sha: APP_SHA, runId: 10, path: '.github/workflows/pr.yml' }),
    ...localRunRoutes({ repo: BACKEND_REPO, sha: BACKEND_SHA, runId: 20, path: '.github/workflows/api-pr.yaml' }),
  });
  const { deps: reopenedDeps } = deps(reopened);
  assert.equal(await main(['resolve'], { ...reopenedDeps, env: { ...reopenedDeps.env, ...resolveEnv(), EVENT_NAME: 'pull_request_target', EVENT_ACTION: 'reopened', PREVIOUS_SHA } }), 0);
  assert.equal(reopened.cancels().length, 0);
});

test('push cancellation cancels the exact old run when a head moved', async () => {
  const fake = new FakeGitHub({
    ...openPairWithLocalRuns(),
    [`GET /repos/DFXswiss/app/commits/${PREVIOUS_SHA}/statuses?per_page=100`]: [
      status({ state: 'pending', description: runningFor(PREVIOUS_SHA, BACKEND_SHA, 88), creator: BOT }),
    ],
    'GET /repos/DFXswiss/app/actions/runs/88': run('queued'),
    'POST /repos/DFXswiss/app/actions/runs/88/cancel': { id: 88 },
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
  });
  const { deps: injected } = deps(fake);
  assert.equal(await main(['resolve'], {
    ...injected,
    env: { ...injected.env, ...resolveEnv(), EVENT_NAME: 'pull_request_target', EVENT_ACTION: 'synchronize', PREVIOUS_SHA },
  }), 0);
  assert.equal(fake.cancels().length, 1);
  assert.equal(fake.cancels()[0].key, 'POST /repos/DFXswiss/app/actions/runs/88/cancel');
});

test('cancellation never cancels the current run or an unrelated pair', async () => {
  const current = new FakeGitHub({
    ...openPairWithLocalRuns(),
    [`GET /repos/DFXswiss/app/commits/${PREVIOUS_SHA}/statuses?per_page=100`]: [
      status({ state: 'pending', description: runningFor(PREVIOUS_SHA, BACKEND_SHA, 77), creator: BOT }),
    ],
    'GET /repos/DFXswiss/app/actions/runs/77': run('in_progress'),
    'POST /repos/DFXswiss/app/actions/runs/77/cancel': { id: 77 },
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
  });
  const { deps: currentDeps } = deps(current);
  assert.equal(
    await main(['resolve'], {
      ...currentDeps,
      env: { ...currentDeps.env, ...resolveEnv(), EVENT_NAME: 'pull_request_target', EVENT_ACTION: 'synchronize', PREVIOUS_SHA },
    }),
    0,
  );
  assert.equal(current.cancels().length, 0);

  const unrelated = new FakeGitHub({
    ...openPairWithLocalRuns(),
    [`GET /repos/DFXswiss/app/commits/${PREVIOUS_SHA}/statuses?per_page=100`]: [
      status({ state: 'pending', description: runningFor(PREVIOUS_SHA, BACKEND_SHA, 88), creator: BOT }),
    ],
    'GET /repos/DFXswiss/app/actions/runs/88': run('in_progress'),
    'POST /repos/DFXswiss/app/actions/runs/88/cancel': { id: 88 },
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
  });
  const { deps: unrelatedDeps } = deps(unrelated);
  assert.equal(
    await main(['resolve'], {
      ...unrelatedDeps,
      env: { ...unrelatedDeps.env, ...resolveEnv(), EVENT_NAME: 'pull_request_target', EVENT_ACTION: 'synchronize', PREVIOUS_SHA, GITHUB_RUN_ID: '88' },
    }),
    0,
  );
  assert.equal(unrelated.cancels().length, 0);
});

test('push cancellation requires a pairing slug', async () => {
  const fake = new FakeGitHub(openPairWithLocalRuns());
  const { deps: injected, errors } = deps(fake, { env: { E2E_PAIR_APP_SLUG: '' } });
  assert.equal(await main(['resolve'], { ...injected, env: { ...injected.env, E2E_PAIR_APP_SLUG: '', ...resolveEnv(), EVENT_NAME: 'pull_request_target', EVENT_ACTION: 'synchronize', PREVIOUS_SHA } }), 1);
  assert.match(errors[0], /pairing app slug unavailable/);
});

test('a dispatch skips a pair whose newest exact status is already successful', async () => {
  const fake = new FakeGitHub({
    ...openPairWithLocalRuns(),
    [`GET /repos/DFXswiss/app/commits/${APP_SHA}/statuses?per_page=100`]: [status({ description: pairDescription() })],
    [`GET /repos/DFXswiss/backend/commits/${BACKEND_SHA}/statuses?per_page=100`]: [],
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
  });
  const { deps: injected, writes, logs } = deps(fake);
  const code = await main(['resolve'], {
    ...injected,
    env: { ...injected.env, ...resolveEnv(), EVENT_NAME: 'repository_dispatch', START_REPO: BACKEND_REPO, START_PR: '34' },
  });
  assert.equal(code, 0);
  assert.equal(writes[0][0].reason, 'pair already attested or running');
  assert.equal(fake.statusPosts().filter((post) => post.body.description === 'pair re-evaluation pending').length, 0);
  assert.equal(fake.statusPosts().filter((post) => post.body.description === runningDescription(77)).length, 0);
  assert.equal(fake.reruns().length, 0);
  assert.match(logs.join('\n'), /Skipped: pair already attested or running/);
});

test('comments do not fall back to an older success and fail closed on lookup errors', async () => {
  const olderSuccess = status({ id: 1, description: pairDescription(), createdAt: '2026-01-01T00:00:00Z' });
  const newerFailure = status({ id: 2, state: 'failure', description: pairDescription(), createdAt: '2026-01-02T00:00:00Z' });
  const fake = new FakeGitHub({
    ...validPairRoutes(),
    [`GET /repos/DFXswiss/app/commits/${APP_SHA}/statuses?per_page=100`]: [olderSuccess, newerFailure],
    [`GET /repos/DFXswiss/backend/commits/${BACKEND_SHA}/statuses?per_page=100`]: [],
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
    ...localRunRoutes({ repo: APP_REPO, sha: APP_SHA, runId: 10, path: '.github/workflows/pr.yml' }),
    ...localRunRoutes({ repo: BACKEND_REPO, sha: BACKEND_SHA, runId: 20, path: '.github/workflows/api-pr.yaml' }),
  });
  const { deps: injected, writes } = deps(fake);
  assert.equal(await main(['resolve'], { ...injected, env: { ...injected.env, ...resolveEnv(), EVENT_NAME: 'issue_comment' } }), 0);
  assert.equal(writes[0][0].valid, 'true');

  const broken = new FakeGitHub({
    ...validPairRoutes(),
    [`GET /repos/DFXswiss/app/commits/${APP_SHA}/statuses?per_page=100`]: new Error('offline'),
  });
  const { deps: brokenDeps, errors } = deps(broken);
  assert.equal(await main(['resolve'], { ...brokenDeps, env: { ...brokenDeps.env, ...resolveEnv(), EVENT_NAME: 'issue_comment' } }), 1);
  assert.match(errors[0], /could not prove the pair has no result yet/);

  const noSlug = new FakeGitHub(validPairRoutes());
  const { deps: noSlugDeps, errors: noSlugErrors } = deps(noSlug, { env: { E2E_PAIR_APP_SLUG: '' } });
  assert.equal(await main(['resolve'], { ...noSlugDeps, env: { ...noSlugDeps.env, E2E_PAIR_APP_SLUG: '', ...resolveEnv(), EVENT_NAME: 'issue_comment' } }), 1);
  assert.match(noSlugErrors[0], /pairing app slug unavailable/);
});

test('comment selections require valid 40-hex heads before reading statuses', async () => {
  const fake = new FakeGitHub({
    ...validPairRoutes(),
    [`GET /repos/DFXswiss/app/commits/${APP_SHA}/statuses?per_page=100`]: [],
    [`GET /repos/DFXswiss/backend/commits/${BACKEND_SHA}/statuses?per_page=100`]: [],
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
    ...localRunRoutes({ repo: APP_REPO, sha: APP_SHA, runId: 10, path: '.github/workflows/pr.yml' }),
    ...localRunRoutes({ repo: BACKEND_REPO, sha: BACKEND_SHA, runId: 20, path: '.github/workflows/api-pr.yaml' }),
  });
  const { deps: injected, writes } = deps(fake);
  assert.equal(await main(['resolve'], { ...injected, env: { ...injected.env, ...resolveEnv(), EVENT_NAME: 'issue_comment', START_PR: '12' } }), 0);
  assert.equal(writes[0][0].valid, 'true');
  assert.equal(fake.statusPosts().filter((post) => post.body.description === 'pair re-evaluation pending').length, 2);
  assert.equal(fake.reruns().length, 2);
});

test('publish supersedes without posting when a head changed', async () => {
  const fake = new FakeGitHub(validPairRoutes());
  const { deps: injected, logs } = deps(fake);
  const code = await main(['publish'], {
    ...injected,
    env: {
      ...injected.env,
      APP_PR: '12',
      APP_SHA: 'f'.repeat(40),
      BACKEND_PR: '34',
      BACKEND_SHA,
      APP_MERGED: 'false',
      BACKEND_MERGED: 'false',
      MUTUAL: 'true',
      RUN_RESULT: 'success',
      RUN_ID: '77',
      RUN_URL,
    },
  });
  assert.equal(code, 0);
  assert.equal(fake.statusPosts().length, 0);
  assert.match(logs.at(-1), /superseded/);

  const missingShas = new FakeGitHub(validPairRoutes());
  const { deps: missingDeps, logs: missingLogs } = deps(missingShas);
  assert.equal(
    await main(['publish'], {
      ...missingDeps,
      env: { ...missingDeps.env, APP_PR: '12', BACKEND_PR: '34', MUTUAL: 'true', RUN_RESULT: 'success', RUN_ID: '77', RUN_URL },
    }),
    0,
  );
  assert.equal(missingShas.statusPosts().length, 0);
  assert.match(missingLogs.at(-1), /superseded/);
});

test('publish posts the exact description on open heads and reruns local jobs', async () => {
  const fake = new FakeGitHub({
    ...openPairWithLocalRuns(),
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
  });
  const { deps: injected, logs } = deps(fake);
  const code = await main(['publish'], {
    ...injected,
    env: {
      ...injected.env,
      APP_PR: '12',
      APP_SHA,
      BACKEND_PR: '34',
      BACKEND_SHA,
      APP_MERGED: 'false',
      BACKEND_MERGED: 'false',
      MUTUAL: 'true',
      RUN_RESULT: 'success',
      RUN_ID: '77',
      RUN_URL,
    },
  });
  assert.equal(code, 0);
  const posted = fake.statusPosts();
  assert.equal(posted.length, 2);
  assert.equal(posted[0].body.description, pairDescription());
  assert.equal(posted[0].body.state, 'success');
  assert.equal(fake.reruns().length, 2);
  assert.match(logs.at(-1), /published success/);
});

test('publish on a merged companion posts only the remaining open head', async () => {
  const fake = new FakeGitHub({
    ...validPairRoutes({ backend: backendPull(34, { state: 'closed', merged: true }) }),
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    ...localRunRoutes({ repo: APP_REPO, sha: APP_SHA, runId: 10, path: '.github/workflows/pr.yml' }),
  });
  const { deps: injected } = deps(fake);
  const code = await main(['publish'], {
    ...injected,
    env: { ...injected.env, APP_PR: '12', APP_SHA, BACKEND_PR: '34', BACKEND_SHA: MERGE_SHA, BACKEND_MERGED: 'true', MUTUAL: 'true', RUN_RESULT: 'failure', RUN_ID: '77', RUN_URL },
  });
  assert.equal(code, 0);
  assert.equal(fake.statusPosts().length, 1);
  assert.equal(fake.statusPosts()[0].body.state, 'failure');
});

test('publish validates run output and target URL', async () => {
  const fake = new FakeGitHub(openPairWithLocalRuns());
  const { deps: injected, errors } = deps(fake);
  const base = { ...injected.env, APP_PR: '12', APP_SHA, BACKEND_PR: '34', BACKEND_SHA, MUTUAL: 'true', RUN_ID: '77', RUN_URL: '' };
  assert.equal(await main(['publish'], { ...injected, env: { ...base, GITHUB_RUN_ID: '' } }), 1);
  assert.match(errors[0], /run URL unavailable/);
  assert.equal(
    await main(['publish'], { ...injected, env: { ...base, GITHUB_SERVER_URL: 'https://github.com' } }),
    1,
  );
  assert.equal(
    await main(['publish'], {
      ...injected,
      env: { ...base, GITHUB_SERVER_URL: 'https://github.com', GITHUB_REPOSITORY: APP_REPO },
    }),
    1,
  );
  const { deps: missingRun } = deps(fake);
  assert.equal(await main(['publish'], { ...missingRun, env: { ...base, RUN_ID: '0' } }), 1);
});

test('publish derives the target URL from the GitHub run environment', async () => {
  const fake = new FakeGitHub({
    ...openPairWithLocalRuns(),
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
  });
  const { deps: injected } = deps(fake);
  const code = await main(['publish'], {
    ...injected,
    env: {
      ...injected.env,
      APP_PR: '12',
      APP_SHA,
      BACKEND_PR: '34',
      BACKEND_SHA,
      MUTUAL: 'true',
      RUN_RESULT: 'success',
      RUN_ID: '77',
      RUN_URL: '',
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_REPOSITORY: APP_REPO,
      GITHUB_RUN_ID: '77',
    },
  });
  assert.equal(code, 0);
  const expected = `https://github.com/${APP_REPO}/actions/runs/77`;
  assert.equal(fake.statusPosts().length, 2);
  assert.equal(fake.statusPosts()[0].body.target_url, expected);
  assert.equal(fake.statusPosts()[1].body.target_url, expected);
});

test('invalidate on close posts failure to the open mutual companion only when both target develop', async () => {
  const closedApp = appPull(12, { state: 'closed', merged: false });
  const fake = new FakeGitHub({
    ...validPairRoutes({ app: closedApp }),
    [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${APP_SHA}`]: content(companion(BACKEND_REPO, 34)),
    [`GET /repos/DFXswiss/backend/contents/e2e-companion.json?ref=${BACKEND_SHA}`]: content(companion(APP_REPO, 12)),
    ...localRunRoutes({ repo: BACKEND_REPO, sha: BACKEND_SHA, runId: 20, path: '.github/workflows/api-pr.yaml' }),
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 1 },
  });
  const { deps: injected, logs } = deps(fake);
  const code = await main(['invalidate'], {
    ...injected,
    env: { ...injected.env, START_REPO: APP_REPO, START_PR: '12', CLOSED: 'true', MERGED: 'false', RUN_URL },
  });
  assert.equal(code, 0);
  const posted = fake.statusPosts();
  assert.equal(posted.length, 1);
  assert.equal(posted[0].body.state, 'failure');
  assert.equal(posted[0].body.description, 'companion closed without merge');
  assert.equal(fake.reruns().length, 1);
  assert.match(logs.join('\n'), /failed open companion DFXswiss\/backend#34/);
});

test('invalidate on close does nothing without a valid mutual open companion', async () => {
  const closedApp = appPull(12, { state: 'closed', merged: false });
  const variations = [
    {},
    { 'GET /repos/DFXswiss/app/pulls/12': closedApp, [`GET /repos/DFXswiss/app/pulls/12/files?per_page=100`]: [] },
    { ...validPairRoutes({ app: closedApp }), [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${APP_SHA}`]: { status: 404 } },
    { ...validPairRoutes({ app: closedApp }), [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${APP_SHA}`]: content('bad') },
    { ...validPairRoutes({ app: closedApp }), 'GET /repos/DFXswiss/backend/pulls/34': { status: 404 } },
    { ...validPairRoutes({ app: closedApp }), 'GET /repos/DFXswiss/backend/pulls/34': backendPull(34, { state: 'closed' }) },
    { ...validPairRoutes({ app: closedApp }), 'GET /repos/DFXswiss/backend/pulls/34': backendPull(34, { base: 'main' }) },
    { ...validPairRoutes({ app: closedApp }), [`GET /repos/DFXswiss/backend/contents/e2e-companion.json?ref=${BACKEND_SHA}`]: { status: 404 } },
    { ...validPairRoutes({ app: closedApp }), [`GET /repos/DFXswiss/backend/contents/e2e-companion.json?ref=${BACKEND_SHA}`]: content('bad') },
    { ...validPairRoutes({ app: closedApp }), [`GET /repos/DFXswiss/backend/contents/e2e-companion.json?ref=${BACKEND_SHA}`]: content(companion(APP_REPO, 13)) },
    { ...validPairRoutes({ app: closedApp }), 'GET /repos/DFXswiss/app/pulls/12': appPull(12, { state: 'closed', merged: false, base: 'main' }) },
    { ...validPairRoutes({ app: closedApp }), 'GET /repos/DFXswiss/app/pulls/12': appPull(12, { state: 'closed', merged: false, sha: 'bad' }) },
    { ...validPairRoutes({ app: closedApp }), 'GET /repos/DFXswiss/backend/pulls/34': backendPull(34, { sha: 'bad' }) },
    { ...validPairRoutes({ app: closedApp, backendFiles: [] }) },
  ];
  for (const routes of variations) {
    const fake = new FakeGitHub(routes);
    const { deps: injected } = deps(fake);
    assert.equal(await main(['invalidate'], { ...injected, env: { ...injected.env, START_REPO: APP_REPO, START_PR: '12', CLOSED: 'true', MERGED: 'false', RUN_URL } }), 0);
    assert.equal(fake.statusPosts().length, 0);
  }
});

test('invalidate on close re-fetches the start and only fails it when closed unmerged', async () => {
  const closedStart = appPull(12, { state: 'closed', merged: false });
  const cases = [
    ['reopened start', appPull(12)],
    ['merged start', appPull(12, { state: 'closed', merged: true })],
    ['deleted start', null],
    ['base changed', appPull(12, { state: 'closed', merged: false, base: 'main' })],
  ];
  for (const [name, freshStart] of cases) {
    const fake = new FakeGitHub(validPairRoutes({ app: closedStart }));
    const { deps: injected } = deps(fake);
    const originalFetch = fake.fetch.bind(fake);
    let startReads = 0;
    const fetch = async (url, options) => {
      if (FakeGitHub.key(url, options.method || 'GET') === 'GET /repos/DFXswiss/app/pulls/12') {
        startReads += 1;
        if (freshStart === null) {
          return startReads === 1 ? response(closedStart) : response(null, 404);
        }
        return response(startReads === 1 ? closedStart : freshStart);
      }
      return originalFetch(url, options);
    };
    assert.equal(
      await main(['invalidate'], {
        ...injected,
        fetch,
        env: { ...injected.env, START_REPO: APP_REPO, START_PR: '12', CLOSED: 'true', MERGED: 'false', RUN_URL },
      }),
      0,
      name,
    );
    assert.equal(startReads, 2, name);
    assert.equal(fake.statusPosts().length, 0, name);
  }
});

test('invalidate on close fails closed for an unsupported start repository', async () => {
  const fake = new FakeGitHub({
    'GET /repos/other/repo/pulls/12': pull({ number: 12, sha: APP_SHA }),
    'GET /repos/other/repo/pulls/12/files?per_page=100': [{ filename: 'e2e-companion.json', status: 'modified' }],
    [`GET /repos/other/repo/contents/e2e-companion.json?ref=${APP_SHA}`]: content(companion(BACKEND_REPO, 34)),
  });
  const { deps: injected } = deps(fake);
  assert.equal(
    await main(['invalidate'], {
      ...injected,
      env: { ...injected.env, START_REPO: 'other/repo', START_PR: '12', CLOSED: 'true', MERGED: 'false', RUN_URL },
    }),
    1,
  );
  assert.equal(fake.statusPosts().length, 0);
});

test('invalidate on close falls back when the start has no readable head', async () => {
  const fake = new FakeGitHub({
    'GET /repos/DFXswiss/app/pulls/12': appPull(12, { state: 'closed', merged: false, sha: 1 }),
  });
  const { deps: injected } = deps(fake);
  assert.equal(
    await main(['invalidate'], {
      ...injected,
      env: { ...injected.env, START_REPO: APP_REPO, START_PR: '12', CLOSED: 'true', MERGED: 'false', RUN_URL },
    }),
    0,
  );
  assert.equal(fake.statusPosts().length, 0);
});

test('resolve reopens from the open backend when the app companion merged', async () => {
  const mergedApp = appPull(12, { state: 'closed', merged: true });
  const fake = new FakeGitHub({
    ...validPairRoutes({ app: mergedApp }),
    [`GET /repos/DFXswiss/backend/commits/${BACKEND_SHA}/statuses?per_page=100`]: [],
    [`GET /repos/DFXswiss/app/commits/${MERGE_SHA}/statuses?per_page=100`]: [],
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 1 },
    ...localRunRoutes({ repo: BACKEND_REPO, sha: BACKEND_SHA, runId: 20, path: '.github/workflows/api-pr.yaml' }),
  });
  const { deps: injected, writes } = deps(fake);
  const code = await main(['resolve'], {
    ...injected,
    env: { ...injected.env, ...resolveEnv(), EVENT_NAME: 'pull_request_target', EVENT_ACTION: 'closed' },
  });
  assert.equal(code, 0);
  assert.equal(writes[0][0].valid, 'true');
  assert.equal(writes[0][0].app_merged, 'true');
  assert.equal(
    fake.statusPosts().filter((post) => post.body.description === 'pair re-evaluation pending').length,
    1,
  );
  const running = fake.statusPosts().filter((post) => post.body.description.includes(' running 77'));
  assert.equal(running.length, 1);
  assert.equal(
    running[0].body.description,
    `pair app#12@${MERGE_SHA.slice(0, 7)} backend#34@${BACKEND_SHA.slice(0, 7)} running 77`,
  );
});

test('invalidate on close rejects a missing target URL', async () => {
  const closedApp = appPull(12, { state: 'closed', merged: false });
  const fake = new FakeGitHub({
    ...validPairRoutes({ app: closedApp }),
    [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${APP_SHA}`]: content(companion(BACKEND_REPO, 34)),
  });
  const { deps: injected, errors } = deps(fake);
  assert.equal(await main(['invalidate'], { ...injected, env: { ...injected.env, START_REPO: APP_REPO, START_PR: '12', CLOSED: 'true', MERGED: 'false', RUN_URL: '' } }), 1);
  assert.match(errors[0], /status target URL unavailable/);
});

test('invalidate does nothing when the companion merged', async () => {
  const fake = new FakeGitHub({});
  const { deps: injected, logs } = deps(fake);
  const code = await main(['invalidate'], {
    ...injected,
    env: { ...injected.env, START_REPO: APP_REPO, START_PR: '12', CLOSED: true, MERGED: 'true' },
  });
  assert.equal(code, 0);
  assert.equal(fake.calls.length, 0);
  assert.match(logs[0], /no invalidation/);
});

test('invalidate on a push marks the open pair pending and reruns both heads', async () => {
  const fake = new FakeGitHub({
    ...openPairWithLocalRuns(),
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
  });
  const { deps: injected } = deps(fake);
  assert.equal(await main(['invalidate'], { ...injected, env: { ...injected.env, START_REPO: APP_REPO, START_PR: '12', RUN_URL } }), 0);
  assert.equal(fake.statusPosts().length, 2);
  assert.equal(fake.statusPosts()[0].body.description, 'pair re-evaluation pending');
  assert.equal(fake.reruns().length, 2);
});

test('invalidate on a push skips current invalidation for an unpaired result', async () => {
  const fake = new FakeGitHub({});
  const { deps: injected } = deps(fake);
  assert.equal(await main(['invalidate'], { ...injected, env: { ...injected.env, START_REPO: APP_REPO, START_PR: '12', RUN_URL } }), 0);
  assert.equal(fake.statusPosts().length, 0);
  assert.equal(fake.reruns().length, 0);
  assert.equal(
    await main(['invalidate'], {
      ...injected,
      env: { ...injected.env, START_REPO: 'other/repo', START_PR: '12', RUN_URL },
    }),
    0,
  );
});

test('invalidate on a push tolerates an unreadable previous companion file', async () => {
  const fake = new FakeGitHub({
    ...validPairRoutes(),
    [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${PREVIOUS_SHA}`]: new Error('offline'),
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
    ...localRunRoutes({ repo: APP_REPO, sha: APP_SHA, runId: 10, path: '.github/workflows/pr.yml' }),
    ...localRunRoutes({ repo: BACKEND_REPO, sha: BACKEND_SHA, runId: 20, path: '.github/workflows/api-pr.yaml' }),
  });
  const { deps: injected, errors } = deps(fake);
  assert.equal(await main(['invalidate'], { ...injected, env: { ...injected.env, START_REPO: APP_REPO, START_PR: '12', PREVIOUS_SHA, RUN_URL } }), 1);
  assert.match(errors[0], /offline/);
});

test('invalidate on a push rejects a missing target URL', async () => {
  const fake = new FakeGitHub(validPairRoutes());
  const { deps: injected, errors } = deps(fake);
  assert.equal(await main(['invalidate'], { ...injected, env: { ...injected.env, START_REPO: APP_REPO, START_PR: '12', RUN_URL: '' } }), 1);
  assert.match(errors[0], /status target URL unavailable/);
});

test('invalidate previous companion rejects a missing target URL', async () => {
  const fake = new FakeGitHub({
    [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${PREVIOUS_SHA}`]: content(companion(BACKEND_REPO, 35)),
    'GET /repos/DFXswiss/backend/pulls/35': backendPull(35, { sha: PREVIOUS_BACKEND_SHA }),
    'GET /repos/DFXswiss/backend/pulls/35/files?per_page=100': [{ filename: 'e2e-companion.json', status: 'modified' }],
    [`GET /repos/DFXswiss/backend/contents/e2e-companion.json?ref=${PREVIOUS_BACKEND_SHA}`]: content(companion(APP_REPO, 12)),
  });
  const { deps: injected, errors } = deps(fake);
  assert.equal(
    await main(['invalidate'], {
      ...injected,
      env: { ...injected.env, START_REPO: APP_REPO, START_PR: '12', PREVIOUS_SHA, RUN_URL: '' },
    }),
    1,
  );
  assert.match(errors[0], /status target URL unavailable/);
});

test('invalidate tolerates an uninspectable current pair and missing previous companion', async () => {
  const fake = new FakeGitHub({
    'GET /repos/DFXswiss/app/pulls/12': new Error('offline'),
    [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${PREVIOUS_SHA}`]: { status: 404 },
  });
  const { deps: injected, logs } = deps(fake);
  assert.equal(await main(['invalidate'], { ...injected, env: { ...injected.env, START_REPO: APP_REPO, START_PR: '12', PREVIOUS_SHA, RUN_URL } }), 0);
  assert.match(logs[0], /could not be inspected/);
});

test('invalidate marks a changed previous companion pending and reruns it', async () => {
  const fake = new FakeGitHub({
    ...validPairRoutes(),
    [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${PREVIOUS_SHA}`]: content(companion(BACKEND_REPO, 35)),
    'GET /repos/DFXswiss/backend/pulls/35': backendPull(35, { sha: PREVIOUS_BACKEND_SHA }),
    'GET /repos/DFXswiss/backend/pulls/35/files?per_page=100': [{ filename: 'e2e-companion.json', status: 'modified' }],
    [`GET /repos/DFXswiss/backend/contents/e2e-companion.json?ref=${PREVIOUS_BACKEND_SHA}`]: content(companion(APP_REPO, 12)),
    ...localRunRoutes({ repo: BACKEND_REPO, sha: BACKEND_SHA, runId: 20, path: '.github/workflows/api-pr.yaml' }),
    ...localRunRoutes({ repo: BACKEND_REPO, sha: PREVIOUS_BACKEND_SHA, runId: 21, path: '.github/workflows/api-pr.yaml' }),
    ...localRunRoutes({ repo: APP_REPO, sha: APP_SHA, runId: 10, path: '.github/workflows/pr.yml' }),
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
    [`POST /repos/DFXswiss/backend/statuses/${PREVIOUS_BACKEND_SHA}`]: { id: 3 },
  });
  const { deps: injected, logs } = deps(fake);
  const code = await main(['invalidate'], {
    ...injected,
    env: { ...injected.env, START_REPO: APP_REPO, START_PR: '12', PREVIOUS_SHA, RUN_URL },
  });
  assert.equal(code, 0);
  assert.equal(fake.statusPosts().filter((post) => post.key.includes('statuses/')).length, 3);
  assert.match(logs.join('\n'), /invalidated previous companion/);
});

test('invalidate previous companion covers every no-op guard', async () => {
  const cases = [
    { name: 'invalid sha', extra: {}, previous: 'bad' },
    { name: 'missing file', extra: {}, previous: PREVIOUS_SHA },
    { name: 'invalid file', extra: { [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${PREVIOUS_SHA}`]: content('bad') }, previous: PREVIOUS_SHA },
    { name: 'missing previous pull', extra: { [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${PREVIOUS_SHA}`]: content(companion(BACKEND_REPO, 35)) }, previous: PREVIOUS_SHA },
    { name: 'previous pull closed', extra: { [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${PREVIOUS_SHA}`]: content(companion(BACKEND_REPO, 35)), 'GET /repos/DFXswiss/backend/pulls/35': backendPull(35, { state: 'closed' }) }, previous: PREVIOUS_SHA },
    { name: 'previous base main', extra: { [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${PREVIOUS_SHA}`]: content(companion(BACKEND_REPO, 35)), 'GET /repos/DFXswiss/backend/pulls/35': backendPull(35, { base: 'main' }) }, previous: PREVIOUS_SHA },
    { name: 'previous invalid head', extra: { [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${PREVIOUS_SHA}`]: content(companion(BACKEND_REPO, 35)), 'GET /repos/DFXswiss/backend/pulls/35': backendPull(35, { sha: 'bad' }) }, previous: PREVIOUS_SHA },
    { name: 'previous files inactive', extra: { [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${PREVIOUS_SHA}`]: content(companion(BACKEND_REPO, 35)), 'GET /repos/DFXswiss/backend/pulls/35': backendPull(35, { sha: PREVIOUS_BACKEND_SHA }), 'GET /repos/DFXswiss/backend/pulls/35/files?per_page=100': [] }, previous: PREVIOUS_SHA },
    { name: 'previous back missing', extra: { [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${PREVIOUS_SHA}`]: content(companion(BACKEND_REPO, 35)), 'GET /repos/DFXswiss/backend/pulls/35': backendPull(35, { sha: PREVIOUS_BACKEND_SHA }), 'GET /repos/DFXswiss/backend/pulls/35/files?per_page=100': [{ filename: 'e2e-companion.json', status: 'modified' }] }, previous: PREVIOUS_SHA },
    { name: 'previous back invalid', extra: { [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${PREVIOUS_SHA}`]: content(companion(BACKEND_REPO, 35)), 'GET /repos/DFXswiss/backend/pulls/35': backendPull(35, { sha: PREVIOUS_BACKEND_SHA }), 'GET /repos/DFXswiss/backend/pulls/35/files?per_page=100': [{ filename: 'e2e-companion.json', status: 'modified' }], [`GET /repos/DFXswiss/backend/contents/e2e-companion.json?ref=${PREVIOUS_BACKEND_SHA}`]: content('bad') }, previous: PREVIOUS_SHA },
    { name: 'previous back points elsewhere', extra: { [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${PREVIOUS_SHA}`]: content(companion(BACKEND_REPO, 35)), 'GET /repos/DFXswiss/backend/pulls/35': backendPull(35, { sha: PREVIOUS_BACKEND_SHA }), 'GET /repos/DFXswiss/backend/pulls/35/files?per_page=100': [{ filename: 'e2e-companion.json', status: 'modified' }], [`GET /repos/DFXswiss/backend/contents/e2e-companion.json?ref=${PREVIOUS_BACKEND_SHA}`]: content(companion(APP_REPO, 13)) }, previous: PREVIOUS_SHA },
  ];
  for (const item of cases) {
    const fake = new FakeGitHub({
      ...validPairRoutes(),
      ...item.extra,
      ...localRunRoutes({ repo: APP_REPO, sha: APP_SHA, runId: 10, path: '.github/workflows/pr.yml' }),
      ...localRunRoutes({ repo: BACKEND_REPO, sha: BACKEND_SHA, runId: 20, path: '.github/workflows/api-pr.yaml' }),
      [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
      [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
    });
    const { deps: injected } = deps(fake);
    assert.equal(await main(['invalidate'], { ...injected, env: { ...injected.env, START_REPO: APP_REPO, START_PR: '12', PREVIOUS_SHA: item.previous, RUN_URL } }), 0, item.name);
  }
});

test('rerunLocalWorkflow covers selection, missing jobs and non-completed runs', async () => {
  const missingSha = await rerunLocalWorkflow({ paginateList: async () => [] }, APP_REPO, '');
  assert.equal(missingSha, false);

  const noRun = { paginateList: async () => [] };
  assert.equal(await rerunLocalWorkflow(noRun, APP_REPO, APP_SHA), false);

  const wrongPath = new FakeGitHub(localRunRoutes({ repo: APP_REPO, sha: APP_SHA, runId: 10, path: '.github/workflows/other.yml' }));
  const { GitHubClient } = await import('./github.mjs');
  assert.equal(await rerunLocalWorkflow(new GitHubClient({ token: 't', fetchImpl: wrongPath.fetch.bind(wrongPath) }), APP_REPO, APP_SHA), false);

  const noPath = new FakeGitHub(localRunRoutes({ repo: APP_REPO, sha: APP_SHA, runId: 10, path: undefined }));
  assert.equal(await rerunLocalWorkflow(new GitHubClient({ token: 't', fetchImpl: noPath.fetch.bind(noPath) }), APP_REPO, APP_SHA), false);

  const noCandidateName = {
    async paginateList(url) {
      if (url.includes('&event=')) {
        return [{ id: 10, status: 'completed', event: 'pull_request', head_sha: APP_SHA, path: '.github/workflows/pr.yml' }];
      }
      return [null, { name: undefined }];
    },
  };
  await assert.rejects(() => rerunLocalWorkflow(noCandidateName, APP_REPO, APP_SHA), /job not found/);

  const notCompleted = new FakeGitHub(localRunRoutes({ repo: APP_REPO, sha: APP_SHA, runId: 10, path: '.github/workflows/pr.yml', runStatus: 'in_progress' }));
  assert.equal(await rerunLocalWorkflow(new GitHubClient({ token: 't', fetchImpl: notCompleted.fetch.bind(notCompleted) }), APP_REPO, APP_SHA), false);

  const noJob = new FakeGitHub(localRunRoutes({ repo: APP_REPO, sha: APP_SHA, runId: 10, path: '.github/workflows/pr.yml', jobs: [] }));
  await assert.rejects(() => rerunLocalWorkflow(new GitHubClient({ token: 't', fetchImpl: noJob.fetch.bind(noJob) }), APP_REPO, APP_SHA), /job not found/);
});

test('rerunLocalWorkflow picks the newest matching run and accepts a path without a ref', async () => {
  const calls = [];
  const client = {
    async paginateList(url) {
      if (url.includes('&event=')) {
        return [
          null,
          { id: 9, status: 'completed', event: 'push', head_sha: APP_SHA, path: '.github/workflows/pr.yml', created_at: '2026-01-03T00:00:00Z' },
          { id: 1, status: 'completed', event: 'pull_request', head_sha: APP_SHA, path: '.github/workflows/pr.yml', created_at: '2026-01-01T00:00:00Z' },
          { id: 2, status: 'completed', event: 'pull_request', head_sha: APP_SHA, path: '.github/workflows/pr.yml', created_at: '2026-01-02T00:00:00Z' },
        ];
      }
      calls.push(url);
      return [{ id: 202, name: 'Full-stack E2E' }];
    },
    async postRerun(repo, jobId) {
      calls.push(`${repo}:${jobId}`);
    },
  };
  assert.equal(await rerunLocalWorkflow(client, APP_REPO, APP_SHA), true);
  assert.equal(calls.at(-1), `${APP_REPO}:202`);

  const tiedCalls = [];
  const tiedClient = {
    async paginateList(url) {
      if (url.includes('&event=')) {
        return [
          { id: 1, status: 'completed', event: 'pull_request', head_sha: APP_SHA, path: '.github/workflows/pr.yml', created_at: '2026-01-01T00:00:00Z' },
          { id: 2, status: 'completed', event: 'pull_request', head_sha: APP_SHA, path: '.github/workflows/pr.yml', created_at: '2026-01-01T00:00:00Z' },
        ];
      }
      tiedCalls.push(url);
      return [{ id: 203, name: 'Build / Full-stack E2E' }];
    },
    async postRerun() {},
  };
  assert.equal(await rerunLocalWorkflow(tiedClient, APP_REPO, APP_SHA), true);
  assert.match(tiedCalls[0], /actions\/runs\/2\/jobs/);

  const fallbackCalls = [];
  const fallbackClient = {
    async paginateList(url) {
      if (url.includes('&event=')) {
        return [
          { status: 'completed', event: 'pull_request', head_sha: APP_SHA, path: '.github/workflows/pr.yml' },
          { status: 'completed', event: 'pull_request', head_sha: APP_SHA, path: '.github/workflows/pr.yml' },
        ];
      }
      fallbackCalls.push(url);
      return [{ id: 204, name: 'Full-stack E2E' }];
    },
    async postRerun(repo, jobId) {
      fallbackCalls.push(`${repo}:${jobId}`);
    },
  };
  assert.equal(await rerunLocalWorkflow(fallbackClient, APP_REPO, APP_SHA), true);
  assert.match(fallbackCalls[0], /actions\/runs\/undefined\/jobs/);
  assert.equal(fallbackCalls.at(-1), `${APP_REPO}:204`);
});

test('finalizeResolution handles an already-handled result without a reason', async () => {
  const writes = [];
  const logs = [];
  const code = await finalizeResolution(
    {},
    { already_handled: true },
    {},
    { writeOutputs: (values) => writes.push(values), log: (message) => logs.push(message) },
  );
  assert.equal(code, 0);
  assert.equal(writes.length, 1);
  assert.match(logs[0], /no action needed/);
});

test('verify-attestation accepts a matching App status', async () => {
  const fake = new FakeGitHub({
    'GET /repos/DFXswiss/app/pulls/12': appPull(),
    'GET /repos/DFXswiss/app/pulls/12/files?per_page=100': [{ filename: 'e2e-companion.json', status: 'modified' }],
    [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${APP_SHA}`]: content(companion(BACKEND_REPO, 34)),
    [`GET /repos/DFXswiss/app/commits/${APP_SHA}/statuses?per_page=100`]: [status({ description: pairDescription() })],
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
  });
  const { deps: injected, logs, errors } = deps(fake);
  const code = await main(['verify-attestation'], {
    ...injected,
    env: { ...injected.env, APP_PR: '12', E2E_PAIR_APP_SLUG: SLUG },
  });
  assert.equal(code, 0);
  assert.equal(errors.length, 0);
  assert.equal(logs[0], `Paired attestation: ${RUN_URL}`);

  const stale = new FakeGitHub({
    'GET /repos/DFXswiss/app/pulls/12': appPull(12, { sha: 'f'.repeat(40) }),
    'GET /repos/DFXswiss/app/pulls/12/files?per_page=100': [{ filename: 'e2e-companion.json', status: 'modified' }],
    [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${'f'.repeat(40)}`]: content(companion(BACKEND_REPO, 34)),
    [`GET /repos/DFXswiss/app/commits/${'f'.repeat(40)}/statuses?per_page=100`]: [status({ description: pairDescription() })],
  });
  const { deps: staleDeps, errors: staleErrors } = deps(stale);
  assert.equal(
    await main(['verify-attestation'], { ...staleDeps, env: { ...staleDeps.env, APP_PR: '12', APP_SHA } }),
    1,
  );
  assert.match(staleErrors[0], /head moved/);
});

test('verify-attestation selects only the newest App Bot status', async () => {
  const newerFailure = status({ id: 2, state: 'failure', description: pairDescription(), createdAt: '2026-01-02T00:00:00Z' });
  const olderSuccess = status({ id: 1, description: pairDescription(), createdAt: '2026-01-01T00:00:00Z' });
  const fake = new FakeGitHub({
    'GET /repos/DFXswiss/app/pulls/12': appPull(),
    'GET /repos/DFXswiss/app/pulls/12/files?per_page=100': [{ filename: 'e2e-companion.json', status: 'modified' }],
    [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${APP_SHA}`]: content(companion(BACKEND_REPO, 34)),
    [`GET /repos/DFXswiss/app/commits/${APP_SHA}/statuses?per_page=100`]: [olderSuccess, newerFailure],
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
  });
  const { deps: injected, errors } = deps(fake);
  assert.equal(await main(['verify-attestation'], { ...injected, env: { ...injected.env, APP_PR: '12' } }), 1);
  assert.match(errors[0], /paired status is failure/);

  const otherRepository = new FakeGitHub({
    'GET /repos/DFXswiss/app/pulls/12': appPull(),
    'GET /repos/DFXswiss/app/pulls/12/files?per_page=100': [{ filename: 'e2e-companion.json', status: 'modified' }],
    [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${APP_SHA}`]: content(companion(BACKEND_REPO, 34)),
    [`GET /repos/DFXswiss/app/commits/${APP_SHA}/statuses?per_page=100`]: [
      status({ description: pairDescription(), creator: { login: 'other[bot]', type: 'Bot' } }),
    ],
  });
  const { deps: otherDeps, errors: otherErrors } = deps(otherRepository);
  assert.equal(await main(['verify-attestation'], { ...otherDeps, env: { ...otherDeps.env, APP_PR: '12' } }), 1);
  assert.match(otherErrors[0], /no status from the pairing app/);
});

test('verify-attestation rejects an app pull request that does not target develop', async () => {
  const fake = new FakeGitHub({
    'GET /repos/DFXswiss/app/pulls/12': appPull(12, { base: 'main' }),
    'GET /repos/DFXswiss/app/pulls/12/files?per_page=100': [{ filename: 'e2e-companion.json', status: 'modified' }],
    [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${APP_SHA}`]: content(companion(BACKEND_REPO, 34)),
    [`GET /repos/DFXswiss/app/commits/${APP_SHA}/statuses?per_page=100`]: [status({ description: pairDescription() })],
  });
  const { deps: injected, errors } = deps(fake);
  assert.equal(await main(['verify-attestation'], { ...injected, env: { ...injected.env, APP_PR: '12' } }), 1);
  assert.match(errors[0], /base is not develop/);
});

test('verify-attestation rejects every stale or malformed input', async () => {
  const base = {
    'GET /repos/DFXswiss/app/pulls/12': appPull(),
    'GET /repos/DFXswiss/app/pulls/12/files?per_page=100': [{ filename: 'e2e-companion.json', status: 'modified' }],
    [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${APP_SHA}`]: content(companion(BACKEND_REPO, 34)),
    [`GET /repos/DFXswiss/app/commits/${APP_SHA}/statuses?per_page=100`]: [status({ description: pairDescription() })],
  };
  const cases = [
    ['not open', { ...base, 'GET /repos/DFXswiss/app/pulls/12': appPull(12, { state: 'closed' }) }],
    ['invalid head', { ...base, 'GET /repos/DFXswiss/app/pulls/12': appPull(12, { sha: 'bad' }) }],
    ['moved head', { ...base, 'GET /repos/DFXswiss/app/pulls/12': appPull(12, { sha: 'f'.repeat(40) }) }],
    ['inactive file', { ...base, 'GET /repos/DFXswiss/app/pulls/12/files?per_page=100': [] }],
    ['missing companion', { ...base, [`GET /repos/DFXswiss/app/contents/e2e-companion.json?ref=${APP_SHA}`]: { status: 404 } }],
    ['no statuses', { ...base, [`GET /repos/DFXswiss/app/commits/${APP_SHA}/statuses?per_page=100`]: [] }],
    ['wrong status', { ...base, [`GET /repos/DFXswiss/app/commits/${APP_SHA}/statuses?per_page=100`]: [status({ description: 'pair app#13@aaaaaaa backend#34@bbbbbbb run 77' })] }],
  ];
  for (const [name, routes] of cases) {
    const fake = new FakeGitHub(routes);
    const { deps: injected, errors } = deps(fake);
    assert.equal(await main(['verify-attestation'], { ...injected, env: { ...injected.env, APP_PR: '12', APP_SHA: 'f'.repeat(40) } }), 1, name);
    assert.match(errors[0], /::error::waiting for paired attestation:/, name);
  }

  const noSlug = new FakeGitHub(base);
  const { deps: noSlugDeps, errors: noSlugErrors } = deps(noSlug, { env: { E2E_PAIR_APP_SLUG: '' } });
  assert.equal(await main(['verify-attestation'], { ...noSlugDeps, env: { ...noSlugDeps.env, APP_PR: '12', E2E_PAIR_APP_SLUG: '' } }), 1);
  assert.match(noSlugErrors[0], /pairing app slug unavailable/);

  const inactive = new FakeGitHub({
    ...base,
    'GET /repos/DFXswiss/app/pulls/12/files?per_page=100': [],
  });
  const { deps: inactiveDeps, errors: inactiveErrors } = deps(inactive);
  assert.equal(await main(['verify-attestation'], { ...inactiveDeps, env: { ...inactiveDeps.env, APP_PR: '12', APP_SHA: '' } }), 1);
  assert.match(inactiveErrors[0], /is not active/);

  const missing = new FakeGitHub({});
  const { deps: missingDeps, errors: missingErrors } = deps(missing);
  assert.equal(await main(['verify-attestation'], { ...missingDeps, env: { ...missingDeps.env, APP_PR: '12' } }), 1);
  assert.match(missingErrors[0], /app pull request is not open/);
});

test('unknown commands and missing token fail loudly without leaking the token', async () => {
  const fake = new FakeGitHub({});
  const { deps: injected, errors } = deps(fake);
  assert.equal(await main(['unknown'], injected), 1);
  assert.match(errors[0], /unknown command/);
  assert.equal(await main([], injected), 1);
  assert.match(errors.at(-1), /unknown command \(missing\)/);

  const { deps: noToken } = deps(fake, { env: { GH_TOKEN: '' } });
  assert.equal(await main(['resolve'], { ...noToken, env: { GH_TOKEN: '' } }), 1);

  const { deps: thrownDeps, errors: thrownErrors } = deps(new FakeGitHub(validPairRoutes()), {
    reviewGate: async () => {
      throw 'plain failure';
    },
  });
  assert.equal(await main(['resolve'], { ...thrownDeps, env: { ...thrownDeps.env, ...resolveEnv() } }), 1);
  assert.match(thrownErrors[0], /plain failure/);

  const { deps: bareDeps } = deps(fake);
  assert.equal(
    await main(['resolve'], {
      ...bareDeps,
      env: { ...bareDeps.env, ...resolveEnv(), GH_TOKEN: 0 },
      error: () => {},
    }),
    1,
  );
});

test('main defaults environment, fetch and review-gate dependencies', async () => {
  const error = () => {};
  assert.equal(await main(['bogus'], { client: {}, error }), 1);
  assert.equal(await main(['bogus'], { env: { GH_TOKEN: 'tok' }, error }), 1);
});

test('main redacts the token and uses default sinks', async () => {
  const fake = new FakeGitHub({
    ...openPairWithLocalRuns(),
    [`GET /repos/DFXswiss/app/commits/${APP_SHA}/statuses?per_page=100`]: [],
    [`GET /repos/DFXswiss/backend/commits/${BACKEND_SHA}/statuses?per_page=100`]: [],
    [`POST /repos/DFXswiss/app/statuses/${APP_SHA}`]: { id: 1 },
    [`POST /repos/DFXswiss/backend/statuses/${BACKEND_SHA}`]: { id: 2 },
  });
  const originalLog = console.log;
  const originalError = console.error;
  const redirects = [];
  const reviewGate = async () => ({ ok: true, reasons: [] });
  console.log = (message) => redirects.push(['log', message]);
  console.error = (message) => redirects.push(['error', message]);
  try {
    assert.equal(await main(['resolve'], { fetch: fake.fetch.bind(fake), reviewGate, env: { GH_TOKEN: 'tok', START_REPO: APP_REPO, START_PR: '12', GITHUB_RUN_ID: '77', RUN_URL } }), 0);
    assert.equal(await main(['publish'], { fetch: fake.fetch.bind(fake), env: { GH_TOKEN: 'tok' } }), 1);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  console.log = (message) => redirects.push(['log', message]);
  console.error = (message) => redirects.push(['error', message]);
  try {
    assert.equal(
      await main(['resolve'], { fetch: fake.fetch.bind(fake), reviewGate, env: { GH_TOKEN: 'tok', START_REPO: APP_REPO, START_PR: '12', GITHUB_RUN_ID: '77', RUN_URL } }),
      0,
    );
    assert.equal(await main(['bogus'], { env: {} }), 1);
    assert.equal(await main(['resolve'], { fetch: fake.fetch.bind(fake), reviewGate, env: { GH_TOKEN: 'tok', START_REPO: APP_REPO, START_PR: '12', GITHUB_RUN_ID: '77', RUN_URL } }), 0);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  assert.equal(redirects.filter(([kind]) => kind === 'log').length, 3);
  assert.equal(redirects.filter(([kind]) => kind === 'error').length, 2);
});

test('defaultWriteOutputs writes GitHub output lines and tolerates a missing path', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-pair-output-'));
  const outputPath = path.join(directory, 'output');
  try {
    defaultWriteOutputs({ valid: 'true', reason: 'line\nbreak', empty: null }, { GITHUB_OUTPUT: outputPath });
    assert.equal(fs.readFileSync(outputPath, 'utf8'), 'valid=true\nreason=line break\nempty=\n');
    assert.equal(defaultWriteOutputs({ valid: 'true' }, {}), undefined);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('defaultReviewGate maps spawn output and errors to verdicts', () => {
  const env = { GH_TOKEN: 'tok', REVIEW_GATE_PYTHON: 'py' };
  const calls = [];
  const gate = defaultReviewGate({
    env,
    spawn: (command, args, options) => {
      calls.push({ command, args, options });
      return { status: 0, stdout: 'noise\n{"ok":false,"reasons":[1,true]}\n', stderr: '' };
    },
  });
  assert.deepEqual(gate({ repo: APP_REPO, pr: 12, head: APP_SHA }), { ok: false, reasons: ['1', 'true'] });
  assert.equal(calls[0].command, 'py');
  assert.equal(calls[0].args[0], new URL('./review-gate.py', import.meta.url).pathname);

  assert.deepEqual(
    defaultReviewGate({ env: { ...env, REVIEW_GATE_PYTHON_BACKEND: 'bpy', REVIEW_GATE_SCRIPT: 's.py' }, spawn: () => ({ status: 0, stdout: '{"ok":true,"reasons":[]}' }) })({ repo: BACKEND_REPO }),
    { ok: true, reasons: [] },
  );
  assert.equal(
    defaultReviewGate({ env: { ...env, REVIEW_GATE_PYTHON_APP: 'apy' }, spawn: () => ({ status: 0, stdout: '{"ok":true,"reasons":[]}' }) })({ repo: APP_REPO }).ok,
    true,
  );
  assert.deepEqual(
    defaultReviewGate({ env: { ...env, REVIEW_GATE_PYTHON: '' }, spawn: () => ({ status: 0, stdout: '{"ok":true,"reasons":[]}' }) })({ repo: APP_REPO }),
    { ok: true, reasons: [] },
  );

  const failures = [
    [{ error: new Error('nope') }, /could not start/],
    [{ status: 2, stderr: 'bad' }, /exited 2: bad/],
    [{ status: 0, stdout: '' }, /no verdict/],
    [{ status: 0, stdout: 'not json' }, /invalid JSON/],
    [{ status: 0, stdout: 'null' }, /verdict is invalid/],
    [{ status: 0, stdout: '{"ok":"yes","reasons":[]}' }, /verdict is invalid/],
    [{ status: 0, stdout: '{"ok":true}' }, /verdict is invalid/],
    [{ status: 0, stdout: '{"ok":true,"reasons":[]}' }, null],
    [{ status: 2 }, /exited 2:/],
  ];
  for (const [result, pattern] of failures) {
    if (pattern) {
      assert.throws(() => defaultReviewGate({ env, spawn: () => result })({ repo: APP_REPO }), pattern);
    } else {
      assert.deepEqual(defaultReviewGate({ env, spawn: () => result })({ repo: APP_REPO }), { ok: true, reasons: [] });
    }
  }

  const inherited = [];
  defaultReviewGate({
    env: { REVIEW_GATE_PYTHON_APP: 'apy' },
    spawn: (command, args, options) => {
      inherited.push({ command, args, options });
      return { status: 0, stdout: '{"ok":true,"reasons":[]}' };
    },
  })({ repo: APP_REPO, pr: 12, head: APP_SHA });
  assert.equal(inherited[0].options.env.GH_TOKEN, '');
  assert.equal(inherited[0].args.includes('12'), true);
});

test('runEntry only executes for the entry module and assigns the exit code', async () => {
  assert.equal(runEntry('file:///a.mjs', '', () => Promise.resolve(0)), null);
  assert.equal(runEntry(undefined, '/tmp/other.mjs', () => Promise.resolve(0)), null);
  assert.equal(runEntry('file:///a.mjs', '/tmp/other.mjs', () => Promise.resolve(0)), null);
  const processRef = {};
  const promise = runEntry('file:///tmp/cli.mjs', '/tmp/cli.mjs', () => 7, { processRef });
  assert.equal(typeof promise.then, 'function');
  assert.equal(await promise, 7);
  assert.equal(processRef.exitCode, 7);

  const originalLog = console.log;
  const originalError = console.error;
  const originalToken = process.env.GH_TOKEN;
  const originalArgs = process.argv.slice(2);
  const originalExitCode = process.exitCode;
  const redirects = [];
  console.log = (message) => redirects.push(['log', message]);
  console.error = (message) => redirects.push(['error', message]);
  try {
    delete process.env.GH_TOKEN;
    process.argv.splice(2, process.argv.length - 2);
    const defaultProcess = {};
    const defaultRun = runEntry('file:///tmp/cli.mjs', '/tmp/cli.mjs', undefined, { processRef: defaultProcess });
    assert.equal(typeof defaultRun.then, 'function');
    assert.equal(await defaultRun, 1);
    assert.equal(defaultProcess.exitCode, 1);
    assert.equal(await runEntry('file:///tmp/cli.mjs', '/tmp/cli.mjs'), 1);
    assert.equal(process.exitCode, 1);
  } finally {
    console.log = originalLog;
    console.error = originalError;
    if (originalToken === undefined) {
      delete process.env.GH_TOKEN;
    } else {
      process.env.GH_TOKEN = originalToken;
    }
    process.argv.splice(2, process.argv.length - 2, ...originalArgs);
    process.exitCode = originalExitCode;
  }
  assert.equal(redirects.filter(([kind]) => kind === 'log').length, 0);
  assert.match(redirects.find(([kind]) => kind === 'error')[1], /GitHub token unavailable/);
});

test('outputValues is stable and stringifies defaults', () => {
  assert.deepEqual(outputValues({}), {
    app_pr: '',
    app_sha: '',
    backend_pr: '',
    backend_sha: '',
    backend_merged: 'false',
    app_merged: 'false',
    valid: 'false',
    reason: '',
    paired: 'false',
    mutual: 'false',
    review_pending: 'false',
  });
  const values = outputValues({
    app_pr: 12,
    app_sha: APP_SHA,
    backend_pr: 34,
    backend_sha: BACKEND_SHA,
    app_merged: false,
    backend_merged: true,
    valid: true,
    reason: '',
    paired: true,
    mutual: true,
    review_pending: false,
  });
  assert.deepEqual(values, {
    app_pr: 12,
    app_sha: APP_SHA,
    backend_pr: 34,
    backend_sha: BACKEND_SHA,
    backend_merged: 'true',
    app_merged: 'false',
    valid: 'true',
    reason: '',
    paired: 'true',
    mutual: 'true',
    review_pending: 'false',
  });
});
