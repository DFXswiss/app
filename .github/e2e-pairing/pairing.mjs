export const APP_REPO = 'DFXswiss/app';
export const BACKEND_REPO = 'DFXswiss/backend';
export const COMPANION_PATH = 'e2e-companion.json';
export const STATUS_CONTEXT = 'Full-stack E2E (paired)';
// The run/publish concurrency group and the human-readable run name share this
// prefix. Each side names its repository, so equal pull-request numbers in
// `app` and `backend` can never collide.
export const PAIR_KEY_PREFIX = 'e2e-paired-run';

const SHA_RE = /^[0-9a-f]{40}$/;
const PAIR_DESCRIPTION_RE = /^pair app#([1-9][0-9]*)@([0-9a-f]{40}) backend#([1-9][0-9]*)@([0-9a-f]{40}) run ([1-9][0-9]*)$/;
const RUNNING_DESCRIPTION_RE = /^pair app#([1-9][0-9]*)@([0-9a-f]{40}) backend#([1-9][0-9]*)@([0-9a-f]{40}) running ([1-9][0-9]*)$/;
const ACTIVE_FILE_STATUSES = new Set(['added', 'modified', 'renamed']);

export class PairingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PairingError';
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function invalidCompanion() {
  throw new PairingError('invalid e2e-companion.json');
}

export function parseCompanion(text, expectedRepository) {
  let value;
  try {
    value = JSON.parse(String(text).replace(/^\uFEFF/, ''));
  } catch {
    invalidCompanion();
  }
  if (!isObject(value)) {
    invalidCompanion();
  }
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== 'pull_request' || keys[1] !== 'repository') {
    invalidCompanion();
  }
  if (value.repository !== expectedRepository || !positiveInteger(value.pull_request)) {
    invalidCompanion();
  }
  return { repository: value.repository, pull_request: value.pull_request };
}

export function isCompanionActive(files, path = COMPANION_PATH) {
  if (!Array.isArray(files)) {
    return false;
  }
  return files.some(
    (file) =>
      isObject(file) &&
      file.filename === path &&
      typeof file.status === 'string' &&
      ACTIVE_FILE_STATUSES.has(file.status),
  );
}

export function effectivePullHead(pull) {
  if (!isObject(pull) || !isObject(pull.head) || typeof pull.head.sha !== 'string') {
    return { ok: false, merged: false, sha: '', reason: 'pull head unavailable' };
  }
  if (pull.state === 'open') {
    if (!SHA_RE.test(pull.head.sha)) {
      return { ok: false, merged: false, sha: '', reason: 'pull head is invalid' };
    }
    return { ok: true, merged: false, sha: pull.head.sha };
  }
  if (pull.state !== 'closed') {
    return { ok: false, merged: false, sha: '', reason: 'pull state unavailable' };
  }
  if (pull.merged !== true) {
    return {
      ok: false,
      merged: false,
      sha: SHA_RE.test(pull.head.sha) ? pull.head.sha : '',
      reason: 'companion closed without merge',
    };
  }
  if (typeof pull.merge_commit_sha !== 'string' || !SHA_RE.test(pull.merge_commit_sha)) {
    return { ok: false, merged: true, sha: '', reason: 'merged companion has no merge commit' };
  }
  return { ok: true, merged: true, sha: pull.merge_commit_sha };
}

export function companionsPointAtEachOther({ appCompanion, backendCompanion, appPr, backendPr }) {
  return (
    isObject(appCompanion) &&
    isObject(backendCompanion) &&
    appCompanion.repository === BACKEND_REPO &&
    appCompanion.pull_request === Number(backendPr) &&
    backendCompanion.repository === APP_REPO &&
    backendCompanion.pull_request === Number(appPr)
  );
}

export function buildPairDescription({ appPr, appSha, backendPr, backendSha, runId }) {
  if (
    !positiveInteger(Number(appPr)) ||
    !positiveInteger(Number(backendPr)) ||
    !positiveInteger(Number(runId)) ||
    typeof appSha !== 'string' ||
    typeof backendSha !== 'string' ||
    !SHA_RE.test(appSha) ||
    !SHA_RE.test(backendSha)
  ) {
    throw new PairingError('invalid pair status description input');
  }
  // Full heads make the attestation bind to one exact commit. The longest
  // realistic values still stay far below GitHub's 140-character limit.
  return `pair app#${Number(appPr)}@${appSha} backend#${Number(backendPr)}@${backendSha} run ${Number(runId)}`;
}

export function buildRunningDescription(args) {
  return buildPairDescription(args).replace(/ run (?=[0-9]+$)/, ' running ');
}

export function parsePairDescription(description) {
  if (typeof description !== 'string') {
    throw new PairingError('pair status description unavailable');
  }
  const match = PAIR_DESCRIPTION_RE.exec(description);
  if (!match) {
    throw new PairingError('pair status description does not name a pair');
  }
  return {
    app_pr: Number(match[1]),
    app_sha: match[2],
    backend_pr: Number(match[3]),
    backend_sha: match[4],
    run_id: Number(match[5]),
  };
}

export function parseRunningDescription(description) {
  if (typeof description !== 'string') {
    throw new PairingError('pair status description unavailable');
  }
  const match = RUNNING_DESCRIPTION_RE.exec(description);
  if (!match) {
    throw new PairingError('pair status description does not name a running pair');
  }
  return {
    app_pr: Number(match[1]),
    app_sha: match[2],
    backend_pr: Number(match[3]),
    backend_sha: match[4],
    run_id: Number(match[5]),
  };
}

function normalizedPair(pair) {
  if (!isObject(pair)) {
    return null;
  }
  return {
    app_pr: Number(pair.app_pr),
    app_sha: typeof pair.app_sha === 'string' ? pair.app_sha : '',
    backend_pr: Number(pair.backend_pr),
    backend_sha: typeof pair.backend_sha === 'string' ? pair.backend_sha : '',
    app_merged: pair.app_merged === true,
    backend_merged: pair.backend_merged === true,
    mutual: pair.mutual === true,
  };
}

export function samePair(left, right) {
  const a = normalizedPair(left);
  const b = normalizedPair(right);
  if (a === null || b === null) {
    return false;
  }
  return (
    a.app_pr === b.app_pr &&
    a.app_sha === b.app_sha &&
    a.backend_pr === b.backend_pr &&
    a.backend_sha === b.backend_sha &&
    a.app_merged === b.app_merged &&
    a.backend_merged === b.backend_merged &&
    a.mutual === b.mutual
  );
}

export function pairKey({ appPr, backendPr }) {
  const app = Number(appPr);
  const backend = Number(backendPr);
  if (!positiveInteger(app) || !positiveInteger(backend)) {
    throw new PairingError('pair key needs two positive pull request numbers');
  }
  return `${PAIR_KEY_PREFIX}-app${app}-backend${backend}`;
}

export function attestationStateForRun(result) {
  if (result === 'success') {
    return 'success';
  }
  if (result === 'failure') {
    return 'failure';
  }
  return 'error';
}

export function truncateStatusDescription(reason) {
  const text = String(reason ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= 140) {
    return text;
  }
  return `${text.slice(0, 139)}…`;
}

function statusTimestamp(status) {
  return typeof status.created_at === 'string' ? status.created_at : '';
}

function statusId(status) {
  return Number.isInteger(status.id) ? status.id : 0;
}

export function selectAttestedStatus(statuses, { context = STATUS_CONTEXT, creatorLogin } = {}) {
  if (!Array.isArray(statuses) || typeof creatorLogin !== 'string' || !creatorLogin) {
    return null;
  }
  const candidates = statuses.filter(
    (status) =>
      isObject(status) &&
      status.context === context &&
      isObject(status.creator) &&
      status.creator.login === creatorLogin &&
      status.creator.type === 'Bot',
  );
  candidates.sort((left, right) => {
    const byTime = statusTimestamp(right).localeCompare(statusTimestamp(left));
    return byTime !== 0 ? byTime : statusId(right) - statusId(left);
  });
  return candidates[0] ?? null;
}

export function verifyAttestationStatus(status, { appPr, appSha, backendPr }) {
  if (!isObject(status)) {
    return { ok: false, reason: 'no status from the pairing app' };
  }
  if (typeof appSha !== 'string' || !SHA_RE.test(appSha)) {
    return { ok: false, reason: 'app head is invalid' };
  }
  let parsed;
  try {
    parsed = parsePairDescription(status.description);
  } catch (error) {
    return { ok: false, reason: error.message };
  }
  if (status.state !== 'success') {
    return { ok: false, reason: `paired status is ${status.state || 'unknown'}` };
  }
  if (parsed.app_pr !== Number(appPr)) {
    return { ok: false, reason: 'paired status names a different app pull request' };
  }
  if (parsed.app_sha !== appSha) {
    return { ok: false, reason: 'paired status names a different app head' };
  }
  if (parsed.backend_pr !== Number(backendPr)) {
    return { ok: false, reason: 'paired status names a different backend pull request' };
  }
  if (typeof status.target_url !== 'string' || !status.target_url) {
    return { ok: false, reason: 'paired status has no target URL' };
  }
  return { ok: true, reason: '', parsed };
}

export function verifyPairAttestation(status, { appPr, appSha, backendPr, backendSha }) {
  const verdict = verifyAttestationStatus(status, { appPr, appSha, backendPr });
  if (!verdict.ok) {
    return verdict;
  }
  if (typeof backendSha !== 'string' || !SHA_RE.test(backendSha)) {
    return { ok: false, reason: 'backend head is invalid' };
  }
  if (verdict.parsed.backend_sha !== backendSha) {
    return { ok: false, reason: 'paired status names a different backend head' };
  }
  return verdict;
}
