import assert from 'node:assert/strict';
import test from 'node:test';

import {
  APP_REPO,
  BACKEND_REPO,
  COMPANION_PATH,
  PairingError,
  attestationStateForRun,
  buildPairDescription,
  buildRunningDescription,
  companionsPointAtEachOther,
  effectivePullHead,
  isCompanionActive,
  isSha7,
  pairKey,
  parseCompanion,
  parsePairDescription,
  parseRunningDescription,
  samePair,
  selectAttestedStatus,
  truncateStatusDescription,
  verifyAttestationStatus,
  verifyPairAttestation,
} from './pairing.mjs';

const APP_SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const THIRD_SHA = 'c'.repeat(40);
const STATUS = 'Full-stack E2E (paired)';
const BOT = { login: 'dfx-pair[bot]', type: 'Bot' };

function status(overrides = {}) {
  return {
    id: 1,
    context: STATUS,
    state: 'success',
    description: buildPairDescription({ appPr: 12, appSha: APP_SHA, backendPr: 34, backendSha: OTHER_SHA, runId: 99 }),
    target_url: 'https://github.com/DFXswiss/app/actions/runs/99',
    created_at: '2026-01-01T00:00:00Z',
    creator: BOT,
    ...overrides,
  };
}

test('parseCompanion accepts exactly the expected declaration shape', () => {
  assert.deepEqual(parseCompanion('{ "repository": "DFXswiss/backend", "pull_request": 6140 }', BACKEND_REPO), {
    repository: BACKEND_REPO,
    pull_request: 6140,
  });
  assert.deepEqual(parseCompanion('\uFEFF{"pull_request":1,"repository":"DFXswiss/backend"}', BACKEND_REPO), {
    repository: BACKEND_REPO,
    pull_request: 1,
  });
  assert.deepEqual(parseCompanion({ toString: () => '{"repository":"DFXswiss/backend","pull_request":2}' }, BACKEND_REPO), {
    repository: BACKEND_REPO,
    pull_request: 2,
  });
  assert.throws(() => parseCompanion({ toString: () => null }, BACKEND_REPO), PairingError);
});

test('parseCompanion rejects every malformed shape', () => {
  const cases = [
    'not json',
    '[]',
    'null',
    '{"repository":"DFXswiss/app","pull_request":1}',
    '{"repository":"DFXswiss/backend","pull_request":0}',
    '{"repository":"DFXswiss/backend","pull_request":-1}',
    '{"repository":"DFXswiss/backend","pull_request":1.5}',
    '{"repository":"DFXswiss/backend","pull_request":"1"}',
    '{"repository":"DFXswiss/backend","pull_request":1,"extra":true}',
    '{"repository":"DFXswiss/backend"}',
    '{"backend":1,"repository":"DFXswiss/backend"}',
    '{"pull_request":1,"repository_extra":"DFXswiss/backend"}',
    '{"repository":1,"pull_request":1}',
    '{"repository":null,"pull_request":1}',
  ];
  for (const value of cases) {
    assert.throws(() => parseCompanion(value, BACKEND_REPO), PairingError, value);
  }
});

test('isCompanionActive only accepts a changed companion path, custom paths included', () => {
  assert.equal(isCompanionActive([{ filename: COMPANION_PATH, status: 'added' }]), true);
  assert.equal(isCompanionActive([{ filename: COMPANION_PATH, status: 'modified' }]), true);
  assert.equal(isCompanionActive([{ filename: COMPANION_PATH, status: 'renamed' }]), true);
  assert.equal(isCompanionActive([{ filename: 'custom.json', status: 'modified' }], 'custom.json'), true);
  assert.equal(isCompanionActive([{ filename: COMPANION_PATH, status: 'removed' }]), false);
  assert.equal(isCompanionActive([{ filename: COMPANION_PATH, status: 'unchanged' }]), false);
  assert.equal(isCompanionActive([{ filename: 'other.json', status: 'modified' }]), false);
  assert.equal(isCompanionActive([null, 'x', { filename: COMPANION_PATH }]), false);
  assert.equal(isCompanionActive(null), false);
});

test('effectivePullHead distinguishes open, merged and closed-unmerged pulls', () => {
  assert.deepEqual(effectivePullHead({ state: 'open', head: { sha: APP_SHA } }), {
    ok: true,
    merged: false,
    sha: APP_SHA,
  });
  assert.deepEqual(
    effectivePullHead({ state: 'closed', merged: true, head: { sha: OTHER_SHA }, merge_commit_sha: APP_SHA }),
    { ok: true, merged: true, sha: APP_SHA },
  );
  const closed = effectivePullHead({ state: 'closed', merged: false, head: { sha: APP_SHA } });
  assert.equal(closed.ok, false);
  assert.equal(closed.reason, 'companion closed without merge');
  assert.equal(closed.sha, APP_SHA);
  assert.deepEqual(effectivePullHead({ state: 'closed', merged: false, head: { sha: 'bad' } }), {
    ok: false,
    merged: false,
    sha: '',
    reason: 'companion closed without merge',
  });
  assert.deepEqual(effectivePullHead({ state: 'closed', merged: true, head: { sha: APP_SHA } }), {
    ok: false,
    merged: true,
    sha: '',
    reason: 'merged companion has no merge commit',
  });
  assert.match(effectivePullHead({ state: 'closed', merged: true, head: { sha: APP_SHA }, merge_commit_sha: 'bad' }).reason, /merge commit/);
  assert.match(effectivePullHead({ state: 'open', head: { sha: 'bad' } }).reason, /invalid/);
  assert.match(effectivePullHead({ state: 'mystery', head: { sha: APP_SHA } }).reason, /state/);
  assert.match(effectivePullHead(null).reason, /head/);
  assert.match(effectivePullHead({ state: 'open', head: {} }).reason, /head/);
  assert.match(effectivePullHead({ state: 'open', head: { sha: 1 } }).reason, /head/);
});

test('companionsPointAtEachOther requires exact mutuality', () => {
  const appCompanion = { repository: BACKEND_REPO, pull_request: 7 };
  const backendCompanion = { repository: APP_REPO, pull_request: 8 };
  assert.equal(companionsPointAtEachOther({ appCompanion, backendCompanion, appPr: 8, backendPr: 7 }), true);
  assert.equal(companionsPointAtEachOther({ appCompanion, backendCompanion, appPr: 9, backendPr: 7 }), false);
  assert.equal(companionsPointAtEachOther({ appCompanion, backendCompanion, appPr: 8, backendPr: 9 }), false);
  assert.equal(companionsPointAtEachOther({ appCompanion: { ...appCompanion, repository: APP_REPO }, backendCompanion, appPr: 8, backendPr: 7 }), false);
  assert.equal(companionsPointAtEachOther({ appCompanion, backendCompanion: { ...backendCompanion, repository: BACKEND_REPO }, appPr: 8, backendPr: 7 }), false);
  assert.equal(companionsPointAtEachOther({ appCompanion: null, backendCompanion, appPr: 8, backendPr: 7 }), false);
  assert.equal(companionsPointAtEachOther({ appCompanion, backendCompanion: null, appPr: 8, backendPr: 7 }), false);
});

test('pair and running descriptions round-trip the exact pair', () => {
  const args = { appPr: 12, appSha: APP_SHA, backendPr: 34, backendSha: OTHER_SHA, runId: 9012 };
  const description = buildPairDescription(args);
  assert.equal(description, 'pair app#12@aaaaaaa backend#34@bbbbbbb run 9012');
  assert.deepEqual(parsePairDescription(description), {
    app_pr: 12,
    app_sha7: 'aaaaaaa',
    backend_pr: 34,
    backend_sha7: 'bbbbbbb',
    run_id: 9012,
  });
  const running = buildRunningDescription(args);
  assert.equal(running, 'pair app#12@aaaaaaa backend#34@bbbbbbb running 9012');
  assert.deepEqual(parseRunningDescription(running), parsePairDescription(description));
});

test('pair and running description builders reject malformed input', () => {
  const valid = { appPr: 1, appSha: APP_SHA, backendPr: 2, backendSha: OTHER_SHA, runId: 3 };
  assert.throws(() => buildPairDescription({ ...valid, appPr: 0 }), PairingError);
  assert.throws(() => buildPairDescription({ ...valid, backendPr: 0 }), PairingError);
  assert.throws(() => buildPairDescription({ ...valid, runId: 0 }), PairingError);
  assert.throws(() => buildPairDescription({ ...valid, appSha: 1 }), PairingError);
  assert.throws(() => buildPairDescription({ ...valid, backendSha: 1 }), PairingError);
  assert.throws(() => buildPairDescription({ ...valid, appSha: 'bad' }), PairingError);
  assert.throws(() => buildPairDescription({ ...valid, backendSha: 'bad' }), PairingError);
  assert.throws(() => parsePairDescription('pair app#1@aaaaaaa backend#1@bbbbbbb'), PairingError);
  assert.throws(() => parsePairDescription(null), PairingError);
  assert.throws(() => parsePairDescription('anything'), PairingError);
  assert.throws(() => parseRunningDescription('pair app#1@aaaaaaa backend#1@bbbbbbb'), PairingError);
  assert.throws(() => parseRunningDescription(undefined), PairingError);
  assert.throws(() => buildRunningDescription({ ...valid, runId: 'bad' }), PairingError);
});

test('samePair compares heads, numbers, merge state and mutuality', () => {
  const pair = {
    app_pr: 1,
    app_sha: APP_SHA,
    backend_pr: 2,
    backend_sha: OTHER_SHA,
    app_merged: false,
    backend_merged: true,
    mutual: true,
  };
  assert.equal(samePair(pair, { ...pair }), true);
  assert.equal(samePair(pair, { ...pair, app_sha: OTHER_SHA }), false);
  assert.equal(samePair(pair, { ...pair, backend_pr: 3 }), false);
  assert.equal(samePair(pair, { ...pair, app_pr: 3 }), false);
  assert.equal(samePair(pair, { ...pair, backend_sha: THIRD_SHA }), false);
  assert.equal(samePair(pair, { ...pair, app_merged: true }), false);
  assert.equal(samePair(pair, { ...pair, backlash: true }), true);
  assert.equal(samePair(pair, { ...pair, backend_merged: false }), false);
  assert.equal(samePair(pair, { ...pair, mutual: false }), false);
  assert.equal(samePair({ ...pair, app_sha: APP_SHA.toUpperCase() }, pair), true);
  assert.equal(samePair({ ...pair, app_sha: 3 }, pair), false);
  assert.equal(samePair({ ...pair, backend_sha: 3 }, pair), false);
  assert.equal(samePair(null, pair), false);
  assert.equal(samePair(pair, null), false);
});

test('pairKey refuses missing sides and encodes both numbers', () => {
  assert.equal(pairKey({ appPr: 1, backendPr: 2 }), 'e2e-paired-run-app1-backend2');
  assert.throws(() => pairKey({ appPr: 0, backendPr: 2 }), PairingError);
  assert.throws(() => pairKey({ appPr: 1, backendPr: 0 }), PairingError);
});

test('attestationStateForRun only accepts explicit success and failure', () => {
  assert.equal(attestationStateForRun('success'), 'success');
  assert.equal(attestationStateForRun('failure'), 'failure');
  assert.equal(attestationStateForRun('cancelled'), 'error');
  assert.equal(attestationStateForRun('skipped'), 'error');
  assert.equal(attestationStateForRun(undefined), 'error');
});

test('status descriptions are bounded without leaking multiline text', () => {
  assert.equal(truncateStatusDescription('  a\n b  '), 'a b');
  assert.equal(truncateStatusDescription(null), '');
  const long = truncateStatusDescription('x'.repeat(200));
  assert.equal(long.length, 140);
  assert.match(long, /…$/);
});

test('selectAttestedStatus trusts only the newest Bot status with the context', () => {
  const statuses = [
    status({ id: 1, state: 'failure', created_at: '2026-01-01T00:00:00Z' }),
    status({ id: 2, created_at: '2026-01-02T00:00:00Z' }),
    status({ id: 3, created_at: '2026-01-03T00:00:00Z', creator: { login: 'human', type: 'User' } }),
    status({ id: 4, context: 'other', created_at: '2026-01-04T00:00:00Z' }),
    status({ id: 5, created_at: '2026-01-02T00:00:00Z' }),
    status({ id: 6, created_at: 2 }),
    null,
  ];
  assert.equal(selectAttestedStatus(statuses, { creatorLogin: 'dfx-pair[bot]' }).id, 5);
  assert.equal(selectAttestedStatus([], { creatorLogin: 'dfx-pair[bot]' }), null);
  assert.equal(selectAttestedStatus(statuses, { creatorLogin: '' }), null);
  assert.equal(selectAttestedStatus(statuses, {}), null);
  assert.equal(selectAttestedStatus(null, { creatorLogin: 'dfx-pair[bot]' }), null);
  assert.equal(selectAttestedStatus([status({ id: 7 }), status({ id: 8, creator: null })], { creatorLogin: 'dfx-pair[bot]' }).id, 7);
  assert.equal(selectAttestedStatus([status({ id: 9, context: 'other' })], { creatorLogin: 'dfx-pair[bot]' }), null);
  assert.equal(selectAttestedStatus([status({ id: 10 }), status({ id: null })], { creatorLogin: 'dfx-pair[bot]' }).id, 10);
  assert.equal(selectAttestedStatus([status({ id: 11 })], { creatorLogin: 7 }), null);
  assert.equal(
    selectAttestedStatus(
      [
        status({ id: 12, creator: { login: 'other[bot]', type: 'Bot' } }),
        status({ id: 13, creator: { login: 'dfx-pair[bot]', type: 'User' } }),
      ],
      { creatorLogin: 'dfx-pair[bot]' },
    ),
    null,
  );
});

test('verifyAttestationStatus requires success and the exact app pair', () => {
  const base = status();
  const expected = { appPr: 12, appSha: APP_SHA, backendPr: 34 };
  assert.equal(verifyAttestationStatus(base, expected).ok, true);
  assert.match(verifyAttestationStatus({ ...base, state: 'failure' }, expected).reason, /failure/);
  assert.match(verifyAttestationStatus({ ...base, state: undefined }, expected).reason, /unknown/);
  assert.match(verifyAttestationStatus({ ...base, description: 'pair app#13@aaaaaaa backend#34@bbbbbbb run 99' }, expected).reason, /different app/);
  assert.match(verifyAttestationStatus(base, { ...expected, appSha: OTHER_SHA }).reason, /different app head/);
  assert.match(verifyAttestationStatus({ ...base, description: 'pair app#12@aaaaaaa backend#35@bbbbbbb run 99' }, expected).reason, /different backend/);
  assert.match(verifyAttestationStatus({ ...base, target_url: '' }, expected).reason, /target URL/);
  assert.match(verifyAttestationStatus({ ...base, target_url: 1 }, expected).reason, /target URL/);
  assert.match(verifyAttestationStatus(base, { ...expected, appSha: 'bad' }).reason, /head/);
  assert.match(verifyAttestationStatus(base, { ...expected, appSha: null }).reason, /head/);
  assert.match(verifyAttestationStatus(null, expected).reason, /no status/);
  assert.match(verifyAttestationStatus({ ...base, description: 'bad' }, expected).reason, /description/);
});

test('verifyPairAttestation also requires the exact backend head', () => {
  const expected = { appPr: 12, appSha: APP_SHA, backendPr: 34, backendSha: OTHER_SHA };
  assert.equal(verifyPairAttestation(status(), expected).ok, true);
  assert.match(verifyPairAttestation(status(), { ...expected, backendSha: 'bad' }).reason, /backend head/);
  assert.match(verifyPairAttestation(status(), { ...expected, backendSha: null }).reason, /backend head/);
  assert.match(verifyPairAttestation(status(), { ...expected, backendSha: THIRD_SHA }).reason, /different backend head/);
  assert.match(verifyPairAttestation(null, expected).reason, /no status/);
});

test('isSha7 is strict', () => {
  assert.equal(isSha7('abcdef0'), true);
  assert.equal(isSha7('ABCDEF0'), false);
  assert.equal(isSha7('abcdef'), false);
  assert.equal(isSha7(null), false);
});
