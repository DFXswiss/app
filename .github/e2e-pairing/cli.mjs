import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { GitHubClient } from './github.mjs';
import {
  APP_REPO,
  BACKEND_REPO,
  COMPANION_PATH,
  PairingError,
  STATUS_CONTEXT,
  attestationStateForRun,
  buildPairDescription,
  buildRunningDescription,
  companionsPointAtEachOther,
  effectivePullHead,
  isCompanionActive,
  pairKey,
  parseCompanion,
  parsePairDescription,
  parseRunningDescription,
  samePair,
  selectAttestedStatus,
  truncateStatusDescription,
  verifyPairAttestation,
  verifyAttestationStatus,
} from './pairing.mjs';

const DEFAULT_REVIEW_GATE_SCRIPT = new URL('./review-gate.py', import.meta.url);
const SHA_RE = /^[0-9a-f]{40}$/;
const ACTIVE_RUN_STATUSES = new Set(['in_progress', 'queued']);

function requirePositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new PairingError(`${label} is not a positive integer`);
  }
  return number;
}

function boolValue(value) {
  return value === true || value === 'true';
}

function otherRepository(repo) {
  if (repo === APP_REPO) {
    return BACKEND_REPO;
  }
  if (repo === BACKEND_REPO) {
    return APP_REPO;
  }
  throw new PairingError(`unsupported repository ${repo}`);
}

function pullHeadSha(pull) {
  return pull && pull.head && typeof pull.head.sha === 'string' ? pull.head.sha : '';
}

// PREVIOUS_SHA comes from an event payload or dispatch hint. It is only a
// lookup key for a superseded marker; anything that is not an exact commit id
// is ignored before it reaches an API path.
function previousSha(env) {
  const value = env.PREVIOUS_SHA || '';
  return SHA_RE.test(value) ? value : '';
}

function isPullObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sideList(result) {
  return [
    {
      repo: APP_REPO,
      pr: result.app_pr,
      sha: result.app_sha,
      merged: result.app_merged,
      pull: result.app_pull,
      effective: result.app_effective,
    },
    {
      repo: BACKEND_REPO,
      pr: result.backend_pr,
      sha: result.backend_sha,
      merged: result.backend_merged,
      pull: result.backend_pull,
      effective: result.backend_effective,
    },
  ];
}

function openSides(result) {
  return sideList(result).filter(
    (side) =>
      Number.isInteger(side.pr) &&
      side.pr > 0 &&
      side.pull?.state === 'open' &&
      side.effective?.ok === true &&
      typeof side.sha === 'string' &&
      side.sha,
  );
}

function attestableSides(result) {
  const open = openSides(result);
  if (result.mutual === true) {
    return open;
  }
  // A companion that does not point back is only a hint. Never let the App
  // write a status onto an unrelated head named by a public app PR.
  return open.filter((side) => side.repo === result.start_repo && side.pr === result.start_pr);
}

async function getPullOrNull(client, repo, number) {
  const response = await client.getOptional(`/repos/${repo}/pulls/${number}`);
  if (response.status === 404) {
    return null;
  }
  if (!isPullObject(response.data)) {
    throw new PairingError(`pull response for ${repo}#${number} is not an object`);
  }
  return response.data;
}

async function pullFiles(client, repo, number) {
  return client.paginate(`/repos/${repo}/pulls/${number}/files?per_page=100`);
}

async function companionText(client, repo, ref) {
  return client.getContentJson(repo, COMPANION_PATH, ref);
}

// An open companion only counts when its current head carries an active
// companion file that points back at this pull request and targets develop.
async function openMutualCompanion(client, repo, number, expectedRepository, expectedNumber) {
  const pull = await getPullOrNull(client, repo, number);
  if (!pull || pull.state !== 'open' || pull.base?.ref !== 'develop') {
    return null;
  }
  const sha = pullHeadSha(pull);
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    return null;
  }
  const files = await pullFiles(client, repo, number);
  if (!isCompanionActive(files)) {
    return null;
  }
  const text = await companionText(client, repo, sha);
  if (text === null) {
    return null;
  }
  let companion;
  try {
    companion = parseCompanion(text, expectedRepository);
  } catch {
    return null;
  }
  if (companion.pull_request !== Number(expectedNumber)) {
    return null;
  }
  return { pull, sha };
}

async function failOpenCompanion(client, env, deps, startRepo, startPr, { repend = false } = {}) {
  let startPull = await getPullOrNull(client, startRepo, startPr);
  if (
    !startPull ||
    startPull.state !== 'closed' ||
    startPull.merged === true ||
    startPull.base?.ref !== 'develop'
  ) {
    return false;
  }
  const startSha = pullHeadSha(startPull);
  if (!SHA_RE.test(startSha)) {
    return false;
  }
  const startFiles = await pullFiles(client, startRepo, startPr);
  if (!isCompanionActive(startFiles)) {
    return false;
  }
  const text = await companionText(client, startRepo, startSha);
  if (text === null) {
    return false;
  }
  const companionRepo = otherRepository(startRepo);
  let companion;
  try {
    companion = parseCompanion(text, companionRepo);
  } catch {
    return false;
  }
  const openCompanion = await openMutualCompanion(client, companionRepo, companion.pull_request, startRepo, startPr);
  if (!openCompanion) {
    return false;
  }
  // The companion checks take several API round trips. A reopen or merge can
  // land in that window, so the closed-unmerged decision belongs to a fresh
  // read immediately before publishing the failure.
  startPull = await getPullOrNull(client, startRepo, startPr);
  if (
    !startPull ||
    startPull.state !== 'closed' ||
    startPull.merged === true ||
    startPull.base?.ref !== 'develop'
  ) {
    return false;
  }
  const targetUrl = statusTargetUrl(env);
  if (!targetUrl) {
    throw new PairingError('status target URL unavailable');
  }
  if (repend) {
    await client.postStatus(companionRepo, openCompanion.sha, {
      state: 'pending',
      context: STATUS_CONTEXT,
      description: 'pair re-evaluation pending',
      targetUrl,
    });
  }
  // Post the failure last so the newest App status on the open companion is
  // failure, not a pending marker that could hide the closed-unmerged pair.
  await client.postStatus(companionRepo, openCompanion.sha, {
    state: 'failure',
    context: STATUS_CONTEXT,
    description: 'companion closed without merge',
    targetUrl,
  });
  await rerunLocalWorkflow(client, companionRepo, openCompanion.sha);
  deps.log(`failed open companion ${companionRepo}#${openCompanion.pull.number} after a closed-unmerged pair`);
  return true;
}

function setSide(result, repo, pull) {
  if (repo === APP_REPO) {
    result.app_pull = pull;
  } else {
    result.backend_pull = pull;
  }
}

function setEffective(result, repo, effective) {
  if (repo === APP_REPO) {
    result.app_effective = effective;
    result.app_sha = effective.sha || pullHeadSha(result.app_pull);
    result.app_merged = effective.merged === true;
  } else {
    result.backend_effective = effective;
    result.backend_sha = effective.sha || pullHeadSha(result.backend_pull);
    result.backend_merged = effective.merged === true;
  }
}

function invalidateResult(result, reason, { reviewPending = false } = {}) {
  result.valid = false;
  result.reason = reason;
  result.review_pending = reviewPending;
  return result;
}

async function newestPairStatus(client, { appPr, appSha, backendPr, backendSha, creatorLogin }) {
  if (!SHA_RE.test(appSha || '') || !SHA_RE.test(backendSha || '')) {
    return null;
  }
  const namesPair = (status) => {
    if (!isPullObject(status) || typeof status.description !== 'string') {
      return false;
    }
    let parsed;
    try {
      parsed = parsePairDescription(status.description);
    } catch {
      try {
        parsed = parseRunningDescription(status.description);
      } catch {
        return false;
      }
    }
    return (
      parsed.app_pr === Number(appPr) &&
      parsed.app_sha === appSha &&
      parsed.backend_pr === Number(backendPr) &&
      parsed.backend_sha === backendSha
    );
  };
  const heads = new Map([
    [APP_REPO, appSha],
    [BACKEND_REPO, backendSha],
  ]);
  const pages = await Promise.all(
    [...heads].map(([repo, sha]) => client.paginate(`/repos/${repo}/commits/${sha}/statuses?per_page=100`)),
  );
  return selectAttestedStatus(pages.flat().filter(namesPair), { context: STATUS_CONTEXT, creatorLogin });
}

async function runIsActive(client, repo, runId) {
  const response = await client.getOptional(`/repos/${repo}/actions/runs/${runId}`);
  if (response.status === 404) {
    return false;
  }
  if (!isPullObject(response.data)) {
    throw new PairingError(`run response for ${repo} run ${runId} is not an object`);
  }
  return ACTIVE_RUN_STATUSES.has(response.data.status);
}

// A chatty trigger must not start a second shared run for an exact pair that
// already has a valid success or whose recorded run is still active.
export async function pairEvaluationSkipped(client, result, env) {
  const slug = env.E2E_PAIR_APP_SLUG || '';
  if (!slug) {
    throw new PairingError('pairing app slug unavailable');
  }
  const pair = {
    appPr: result.app_pr,
    appSha: result.app_sha,
    backendPr: result.backend_pr,
    backendSha: result.backend_sha,
    creatorLogin: `${slug}[bot]`,
  };
  const newest = await newestPairStatus(client, pair);
  if (!newest) {
    return false;
  }
  if (verifyPairAttestation(newest, pair).ok) {
    return true;
  }
  if (newest.state !== 'pending') {
    return false;
  }
  let running;
  try {
    running = parseRunningDescription(newest.description);
  } catch {
    return false;
  }
  return runIsActive(client, env.GITHUB_REPOSITORY || APP_REPO, running.run_id);
}

// Only a pushed head supersedes an in-progress run: an app synchronize event or
// a backend dispatch whose before head differs from the backend PR's current
// head. Comments and manual dispatches never cancel. GitHub's cancellation then
// replaces exactly that run, never a sibling or an unrelated run.
async function cancelSupersededRuns(client, result, env) {
  if (!result.valid) {
    return;
  }
  const appPush = env.EVENT_NAME === 'pull_request_target' && env.EVENT_ACTION === 'synchronize';
  const backendPush = env.EVENT_NAME === 'repository_dispatch';
  if (!appPush && !backendPush) {
    return;
  }
  const before = previousSha(env);
  const changedRepo = backendPush ? BACKEND_REPO : APP_REPO;
  const changedPull = backendPush ? result.backend_pull : result.app_pull;
  const changedCurrentSha = pullHeadSha(changedPull);
  if (!before || before === changedCurrentSha) {
    return;
  }
  const slug = env.E2E_PAIR_APP_SLUG || '';
  if (!slug) {
    throw new PairingError('pairing app slug unavailable');
  }
  const statuses = await client.paginate(`/repos/${changedRepo}/commits/${before}/statuses?per_page=100`);
  const runIds = new Set();
  for (const status of statuses) {
    if (!isPullObject(status) || status.state !== 'pending') {
      continue;
    }
    if (status.creator?.login !== `${slug}[bot]` || status.creator?.type !== 'Bot') {
      continue;
    }
    let running;
    try {
      running = parseRunningDescription(status.description);
    } catch {
      continue;
    }
    const changedSha = backendPush ? running.backend_sha : running.app_sha;
    if (running.app_pr !== Number(result.app_pr) || running.backend_pr !== Number(result.backend_pr)) {
      continue;
    }
    if (changedSha !== before) {
      continue;
    }
    runIds.add(running.run_id);
  }
  const workflowRepo = env.GITHUB_REPOSITORY || APP_REPO;
  for (const runId of runIds) {
    if (String(runId) === String(env.GITHUB_RUN_ID || '')) {
      continue;
    }
    if (await runIsActive(client, workflowRepo, runId)) {
      await client.cancelRun(workflowRepo, runId);
    }
  }
}

// A merged close with an open companion must run the merged side and publish
// on the companion head that is open now. Re-resolve from the companion so a
// companion that moved while the merge happened is never reused.
async function reopenAfterCompanionMerge(client, result, reviewGate) {
  if (!result.paired || !result.app_pr || !result.backend_pr) {
    return result;
  }
  const appMerged = result.app_pull?.state === 'closed' && result.app_pull.merged === true;
  const backendMerged = result.backend_pull?.state === 'closed' && result.backend_pull.merged === true;
  if (appMerged) {
    const backendPull = await getPullOrNull(client, BACKEND_REPO, result.backend_pr);
    if (backendPull?.state === 'open') {
      return resolvePair({ client, startRepo: BACKEND_REPO, startPr: result.backend_pr, reviewGate });
    }
  }
  if (backendMerged) {
    const appPull = await getPullOrNull(client, APP_REPO, result.app_pr);
    if (appPull?.state === 'open') {
      return resolvePair({ client, startRepo: APP_REPO, startPr: result.app_pr, reviewGate });
    }
  }
  return result;
}

export async function inspectPair({ client, startRepo, startPr }) {
  const startNumber = requirePositiveInteger(startPr, 'start pull request');
  if (startRepo !== APP_REPO && startRepo !== BACKEND_REPO) {
    throw new PairingError(`unsupported start repository ${startRepo}`);
  }
  const result = {
    app_pr: startRepo === APP_REPO ? startNumber : null,
    backend_pr: startRepo === BACKEND_REPO ? startNumber : null,
    app_sha: '',
    backend_sha: '',
    app_merged: false,
    backend_merged: false,
    app_pull: null,
    backend_pull: null,
    app_effective: null,
    backend_effective: null,
    paired: false,
    mutual: false,
    valid: false,
    reason: '',
    review_pending: false,
    start_repo: startRepo,
    start_pr: startNumber,
  };
  const startPull = await getPullOrNull(client, startRepo, startNumber);
  if (!startPull) {
    return invalidateResult(result, `${startRepo}#${startNumber} not found`);
  }
  setSide(result, startRepo, startPull);
  const startFiles = await pullFiles(client, startRepo, startNumber);
  if (!isCompanionActive(startFiles)) {
    return invalidateResult(result, `${COMPANION_PATH} is not active for ${startRepo}#${startNumber}`);
  }
  result.paired = true;
  const startEffective = effectivePullHead(startPull);
  setEffective(result, startRepo, startEffective);
  const companionRepo = otherRepository(startRepo);
  if (!startEffective.ok) {
    // A closed-unmerged companion still names the other side. Resolve that
    // number so invalidation can post the required failure there.
    const readableSha = startEffective.sha || pullHeadSha(startPull);
    const text = readableSha ? await companionText(client, startRepo, readableSha) : null;
    if (text !== null) {
      try {
        const companion = parseCompanion(text, companionRepo);
        if (startRepo === APP_REPO) {
          result.backend_pr = companion.pull_request;
        } else {
          result.app_pr = companion.pull_request;
        }
        const companionPull = await getPullOrNull(client, companionRepo, companion.pull_request);
        if (companionPull) {
          setSide(result, companionRepo, companionPull);
          setEffective(result, companionRepo, effectivePullHead(companionPull));
        }
      } catch {
        // The failure reason stays "closed without merge"; no trusted pair is published.
      }
    }
    return invalidateResult(result, startEffective.reason);
  }
  const startText = await companionText(client, startRepo, startEffective.sha);
  if (startText === null) {
    return invalidateResult(result, 'invalid e2e-companion.json');
  }
  let startCompanion;
  try {
    startCompanion = parseCompanion(startText, companionRepo);
  } catch (error) {
    return invalidateResult(result, error.message);
  }
  const companionPr = startCompanion.pull_request;
  if (startRepo === APP_REPO) {
    result.backend_pr = companionPr;
  } else {
    result.app_pr = companionPr;
  }
  const companionPull = await getPullOrNull(client, companionRepo, companionPr);
  if (!companionPull) {
    return invalidateResult(result, `${companionRepo}#${companionPr} not found`);
  }
  setSide(result, companionRepo, companionPull);
  const companionEffective = effectivePullHead(companionPull);
  setEffective(result, companionRepo, companionEffective);
  const companionFiles = await pullFiles(client, companionRepo, companionPr);
  if (!isCompanionActive(companionFiles)) {
    return invalidateResult(result, `${COMPANION_PATH} is not active for ${companionRepo}#${companionPr}`);
  }
  if (!companionEffective.ok) {
    return invalidateResult(result, companionEffective.reason);
  }
  const companionTextValue = await companionText(client, companionRepo, companionEffective.sha);
  if (companionTextValue === null) {
    return invalidateResult(result, 'invalid e2e-companion.json');
  }
  let companion;
  try {
    companion = parseCompanion(companionTextValue, startRepo);
  } catch (error) {
    return invalidateResult(result, error.message);
  }
  const appCompanion = startRepo === APP_REPO ? startCompanion : companion;
  const backendCompanion = startRepo === BACKEND_REPO ? startCompanion : companion;
  result.mutual = companionsPointAtEachOther({
    appCompanion,
    backendCompanion,
    appPr: result.app_pr,
    backendPr: result.backend_pr,
  });
  if (result.app_pull.base?.ref !== 'develop') {
    return invalidateResult(result, `${APP_REPO}#${result.app_pr} base is not develop`);
  }
  if (result.backend_pull.base?.ref !== 'develop') {
    return invalidateResult(result, `${BACKEND_REPO}#${result.backend_pr} base is not develop`);
  }
  if (!result.mutual) {
    return invalidateResult(result, 'companion files do not point at each other');
  }
  result.valid = true;
  return result;
}

export async function applyReviewGate(result, { reviewGate }) {
  if (!result.valid) {
    return result;
  }
  const failures = [];
  for (const side of openSides(result)) {
    const gate = await reviewGate({ repo: side.repo, pr: side.pr, head: side.sha });
    if (!gate || gate.ok !== true) {
      const reasons = Array.isArray(gate?.reasons) && gate.reasons.length > 0 ? gate.reasons : ['review gate failed'];
      failures.push(`${side.repo}#${side.pr}: ${reasons.join('; ')}`);
    }
  }
  if (failures.length > 0) {
    return invalidateResult(result, `review gate not satisfied: ${failures.join(' | ')}`, { reviewPending: true });
  }
  return result;
}

export async function resolvePair({ client, startRepo, startPr, reviewGate }) {
  const result = await inspectPair({ client, startRepo, startPr });
  return applyReviewGate(result, { reviewGate });
}

export function outputValues(result) {
  return {
    app_pr: result.app_pr ?? '',
    app_sha: result.app_sha || '',
    backend_pr: result.backend_pr ?? '',
    backend_sha: result.backend_sha || '',
    backend_merged: result.backend_merged === true ? 'true' : 'false',
    app_merged: result.app_merged === true ? 'true' : 'false',
    valid: result.valid === true ? 'true' : 'false',
    reason: result.reason || '',
    paired: result.paired === true ? 'true' : 'false',
    mutual: result.mutual === true ? 'true' : 'false',
    review_pending: result.review_pending === true ? 'true' : 'false',
  };
}

export function defaultWriteOutputs(values, env) {
  const outputPath = env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }
  const lines = Object.entries(values).map(([key, value]) => {
    const text = String(value ?? '').replace(/[\r\n]+/g, ' ');
    return `${key}=${text}`;
  });
  fs.appendFileSync(outputPath, `${lines.join('\n')}\n`);
}

export function defaultReviewGate({ spawn = spawnSync, env = process.env } = {}) {
  return ({ repo, pr, head }) => {
    const script = env.REVIEW_GATE_SCRIPT || DEFAULT_REVIEW_GATE_SCRIPT;
    // Each repository has its own pinned guard checkout, so each side's gate
    // runs in that side's venv.
    const pinnedPython = repo === BACKEND_REPO ? env.REVIEW_GATE_PYTHON_BACKEND : env.REVIEW_GATE_PYTHON_APP;
    const python = pinnedPython || env.REVIEW_GATE_PYTHON || 'python';
    const completed = spawn(
      python,
      [script instanceof URL ? script.pathname : script, '--repo', repo, '--pr', String(pr), '--head', head],
      {
        env: { ...env, GH_TOKEN: env.GH_TOKEN || '' },
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
      },
    );
    if (completed.error) {
      throw new PairingError(`review gate could not start: ${completed.error.message}`);
    }
    if (completed.status !== 0) {
      throw new PairingError(`review gate exited ${completed.status}: ${(completed.stderr || '').trim()}`);
    }
    const lines = String(completed.stdout || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      throw new PairingError('review gate returned no verdict');
    }
    let verdict;
    try {
      verdict = JSON.parse(lines[lines.length - 1]);
    } catch {
      throw new PairingError('review gate returned invalid JSON');
    }
    if (!verdict || typeof verdict.ok !== 'boolean' || !Array.isArray(verdict.reasons)) {
      throw new PairingError('review gate verdict is invalid');
    }
    return { ok: verdict.ok, reasons: verdict.reasons.map(String) };
  };
}

function statusTargetUrl(env) {
  if (env.RUN_URL) {
    return env.RUN_URL;
  }
  if (env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID) {
    return `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
  }
  return '';
}

async function postOnOpenSides(client, result, { state, description, targetUrl }) {
  if (!targetUrl) {
    throw new PairingError('status target URL unavailable');
  }
  const posted = [];
  for (const side of attestableSides(result)) {
    await client.postStatus(side.repo, side.sha, {
      state,
      context: STATUS_CONTEXT,
      description: truncateStatusDescription(description),
      targetUrl,
    });
    posted.push(`${side.repo}#${side.pr}@${side.sha}`);
  }
  return posted;
}

async function invalidateOpenPair(client, result, env) {
  if (!result?.paired) {
    return;
  }
  await postOnOpenSides(client, result, {
    state: 'pending',
    description: 'pair re-evaluation pending',
    targetUrl: statusTargetUrl(env),
  });
  await rerunOpenSides(client, result);
}

export async function finalizeResolution(client, result, env, deps, { rerun = true } = {}) {
  if (result.already_handled) {
    deps.writeOutputs(outputValues(result), env);
    deps.log(`Pair already handled: ${result.reason || 'no action needed'}`);
    return 0;
  }
  if (result.valid) {
    const runId = requirePositiveInteger(env.GITHUB_RUN_ID, 'GITHUB_RUN_ID');
    await postOnOpenSides(client, result, {
      state: 'pending',
      description: buildRunningDescription({
        appPr: result.app_pr,
        appSha: result.app_sha,
        backendPr: result.backend_pr,
        backendSha: result.backend_sha,
        runId,
      }),
      targetUrl: statusTargetUrl(env),
    });
    if (rerun) {
      await rerunOpenSides(client, result);
    }
  }
  await postResolutionState(client, result, env);
  const outputs = outputValues(result);
  deps.writeOutputs(outputs, env);
  deps.log(
    `Pair ${outputs.valid === 'true' ? 'resolved' : 'invalid'}: app#${outputs.app_pr}@${outputs.app_sha} backend#${outputs.backend_pr}@${outputs.backend_sha} (${outputs.reason || 'valid'})`,
  );
  return 0;
}

async function invalidatePreviousCompanion(client, env, deps, startRepo, startPr, current) {
  const before = previousSha(env);
  if (!before) {
    return;
  }
  const previousText = await companionText(client, startRepo, before);
  if (previousText === null) {
    return;
  }
  let previous;
  try {
    previous = parseCompanion(previousText, otherRepository(startRepo));
  } catch {
    return;
  }
  const currentCompanionNumber = startRepo === APP_REPO ? current?.backend_pr : current?.app_pr;
  if (previous.pull_request === currentCompanionNumber) {
    return;
  }
  const previousRepo = otherRepository(startRepo);
  const previousPull = await getPullOrNull(client, previousRepo, previous.pull_request);
  if (!previousPull || previousPull.state !== 'open') {
    return;
  }
  if (previousPull.base?.ref !== 'develop') {
    return;
  }
  const previousHead = pullHeadSha(previousPull);
  if (!SHA_RE.test(previousHead)) {
    return;
  }
  const previousFiles = await pullFiles(client, previousRepo, previous.pull_request);
  if (!isCompanionActive(previousFiles)) {
    return;
  }
  const previousBackText = await companionText(client, previousRepo, previousHead);
  if (previousBackText === null) {
    return;
  }
  let previousBack;
  try {
    previousBack = parseCompanion(previousBackText, startRepo);
  } catch {
    return;
  }
  if (previousBack.pull_request !== startPr) {
    return;
  }
  const targetUrl = statusTargetUrl(env);
  if (!targetUrl) {
    throw new PairingError('status target URL unavailable');
  }
  await client.postStatus(previousRepo, previousHead, {
    state: 'pending',
    context: STATUS_CONTEXT,
    description: 'pair re-evaluation pending',
    targetUrl,
  });
  await rerunLocalWorkflow(client, previousRepo, previousHead);
  deps.log(`invalidated previous companion ${previousRepo}#${previous.pull_request}`);
}

function workflowPathMatches(actual, expected) {
  if (typeof actual !== 'string') {
    return false;
  }
  const withoutRef = actual.split('@', 1)[0];
  return withoutRef === expected || withoutRef.endsWith(`/${expected}`);
}

function newestRun(runs) {
  return [...runs].sort((left, right) => {
    const byTime = String(right.created_at || '').localeCompare(String(left.created_at || ''));
    return byTime !== 0 ? byTime : Number(right.id || 0) - Number(left.id || 0);
  })[0];
}

export async function rerunLocalWorkflow(client, repo, sha) {
  if (!sha) {
    return false;
  }
  const expectedPath = repo === APP_REPO ? '.github/workflows/pr.yml' : '.github/workflows/api-pr.yaml';
  const runs = await client.paginateList(
    `/repos/${repo}/actions/runs?head_sha=${encodeURIComponent(sha)}&event=pull_request&per_page=100`,
    'workflow_runs',
  );
  const run = newestRun(
    runs.filter(
      (candidate) =>
        candidate &&
        candidate.event === 'pull_request' &&
        candidate.head_sha === sha &&
        workflowPathMatches(candidate.path, expectedPath),
    ),
  );
  if (!run) {
    return false;
  }
  if (run.status !== 'completed') {
    return false;
  }
  const jobs = await client.paginateList(
    `/repos/${repo}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`,
    'jobs',
  );
  const job = jobs.find(
    (candidate) =>
      candidate &&
      (candidate.name === 'Full-stack E2E' || String(candidate.name || '').endsWith(' / Full-stack E2E')),
  );
  if (!job) {
    throw new PairingError(`Full-stack E2E job not found in ${repo} run ${run.id}`);
  }
  await client.postRerun(repo, job.id);
  return true;
}

async function rerunOpenSides(client, result) {
  for (const side of attestableSides(result)) {
    await rerunLocalWorkflow(client, side.repo, side.sha);
  }
}

async function postResolutionState(client, result, env) {
  if (!result.paired || result.valid) {
    return;
  }
  const state = result.review_pending ? 'pending' : 'failure';
  await postOnOpenSides(client, result, {
    state,
    description: result.reason || (result.review_pending ? 'review gate not satisfied' : 'pair invalid'),
    targetUrl: statusTargetUrl(env),
  });
  if (!result.review_pending) {
    await rerunOpenSides(client, result);
  }
}

// The chatty trigger paths (review comments, pairing dispatches) only skip a
// new shared run when the newest exact-pair status is a valid success or names
// an active run. Both checks fail closed: a lookup error aborts the evaluation.
async function evaluateChattyTrigger(client, result, env, deps) {
  if (!result.valid) {
    return;
  }
  let skip = false;
  try {
    skip = await pairEvaluationSkipped(client, result, env);
  } catch (error) {
    // Without a trustworthy answer, starting another shared run could
    // duplicate a result that already exists. Fail the evaluation instead.
    throw new PairingError(`could not prove the pair has no result yet: ${error.message}`);
  }
  if (skip) {
    result.valid = false;
    result.reason = 'pair already attested or running';
    result.already_handled = true;
    deps.log(`Skipped: ${result.reason} (${pairKey({ appPr: result.app_pr, backendPr: result.backend_pr })}).`);
  }
}

// A closed-unmerged dispatch must fail the mutual open companion. The same
// close on the app side is handled by the invalidation step of that event.
async function failClosedStartCompanion(client, result, env, deps, startRepo, startPr, options = {}) {
  // The dispatch names the backend PR. Read its state again so a stale event
  // payload cannot decide this.
  const fresh = await getPullOrNull(client, startRepo, startPr);
  if (!fresh || fresh.state !== 'closed' || fresh.merged === true) {
    return false;
  }
  return failOpenCompanion(client, env, deps, startRepo, startPr, options);
}

async function resolveCommand(client, env, deps, reviewGate) {
  const startRepo = env.START_REPO;
  const startPr = requirePositiveInteger(env.START_PR, 'START_PR');
  let result = await resolvePair({ client, startRepo, startPr, reviewGate });
  let closedCompanionFailed = false;
  let openPairInvalidated = false;
  if (env.EVENT_NAME === 'repository_dispatch') {
    closedCompanionFailed = await failClosedStartCompanion(client, result, env, deps, startRepo, startPr, { repend: true });
    // failOpenCompanion has just proven mutuality from both current heads.
    result.mutual = result.mutual || closedCompanionFailed;
  }
  result = await reopenAfterCompanionMerge(client, result, reviewGate);
  if (env.EVENT_NAME === 'repository_dispatch' || env.EVENT_NAME === 'pull_request_target') {
    await cancelSupersededRuns(client, result, env);
  }
  if (closedCompanionFailed) {
    await invalidatePreviousCompanion(client, env, deps, startRepo, startPr, result);
    deps.writeOutputs(outputValues(invalidateResult(result, 'companion closed without merge')), env);
    deps.log('Pair invalid: companion closed without merge');
    return 0;
  }
  if (env.EVENT_NAME === 'issue_comment') {
    await evaluateChattyTrigger(client, result, env, deps);
    if (!result.already_handled && result.valid) {
      // A stale or absent shared result is re-evaluated by invalidating the
      // current open pair once. A proven active run was skipped above.
      await invalidateOpenPair(client, result, env);
      openPairInvalidated = true;
    }
  }
  if (env.EVENT_NAME === 'pull_request_target' && env.EVENT_ACTION === 'closed' && result.valid) {
    await invalidateOpenPair(client, result, env);
    openPairInvalidated = true;
  }
  if (result.already_handled) {
    return finalizeResolution(client, result, env, deps);
  }
  if (env.EVENT_NAME === 'repository_dispatch') {
    await evaluateChattyTrigger(client, result, env, deps);
    if (result.already_handled) {
      return finalizeResolution(client, result, env, deps);
    }
    await invalidateOpenPair(client, result, env);
    openPairInvalidated = result.paired === true;
    await invalidatePreviousCompanion(client, env, deps, startRepo, startPr, result);
  }
  if (result.valid && attestableSides(result).length === 0) {
    result.valid = false;
    result.reason = 'both pull requests are merged; nothing to attest';
    result.already_handled = true;
    return finalizeResolution(client, result, env, deps);
  }
  return finalizeResolution(client, result, env, deps, { rerun: !openPairInvalidated });
}

async function publishCommand(client, env, deps, reviewGate) {
  const expected = {
    app_pr: requirePositiveInteger(env.APP_PR, 'APP_PR'),
    app_sha: env.APP_SHA || '',
    backend_pr: requirePositiveInteger(env.BACKEND_PR, 'BACKEND_PR'),
    backend_sha: env.BACKEND_SHA || '',
    app_merged: boolValue(env.APP_MERGED),
    backend_merged: boolValue(env.BACKEND_MERGED),
    mutual: boolValue(env.MUTUAL),
  };
  const startRepo = env.START_REPO || APP_REPO;
  const startPr = requirePositiveInteger(env.START_PR || expected.app_pr, 'START_PR');
  const fresh = await resolvePair({
    client,
    startRepo,
    startPr,
    reviewGate,
  });
  if (!fresh.valid || !samePair(expected, fresh)) {
    deps.log('superseded: the pair or its heads changed while the shared run was executing');
    return 0;
  }
  const runId = requirePositiveInteger(env.RUN_ID, 'RUN_ID');
  const description = buildPairDescription({
    appPr: fresh.app_pr,
    appSha: fresh.app_sha,
    backendPr: fresh.backend_pr,
    backendSha: fresh.backend_sha,
    runId,
  });
  const state = attestationStateForRun(env.RUN_RESULT || 'error');
  const targetUrl = env.RUN_URL || statusTargetUrl(env);
  if (!targetUrl) {
    throw new PairingError('run URL unavailable');
  }
  const open = attestableSides(fresh);
  for (const side of open) {
    await client.postStatus(side.repo, side.sha, {
      state,
      context: STATUS_CONTEXT,
      description,
      targetUrl,
    });
  }
  await rerunOpenSides(client, fresh);
  deps.log(`published ${state} for ${description}`);
  return 0;
}

async function invalidateCommand(client, env, deps) {
  const startRepo = env.START_REPO;
  const startPr = requirePositiveInteger(env.START_PR, 'START_PR');
  if (boolValue(env.CLOSED)) {
    if (boolValue(env.MERGED)) {
      deps.log('closed companion merged: no invalidation');
      return 0;
    }
    otherRepository(startRepo);
    await failOpenCompanion(client, env, deps, startRepo, startPr);
    return 0;
  }

  let current = null;
  try {
    current = await inspectPair({ client, startRepo, startPr });
  } catch (error) {
    deps.log(`current pair could not be inspected during invalidation: ${error.message}`);
  }
  await invalidateOpenPair(client, current, env);
  await invalidatePreviousCompanion(client, env, deps, startRepo, startPr, current);
  return 0;
}

async function verifyAttestationCommand(client, env, deps) {
  try {
    const appPr = requirePositiveInteger(env.APP_PR, 'APP_PR');
    const pull = await getPullOrNull(client, APP_REPO, appPr);
    if (!pull || pull.state !== 'open') {
      throw new PairingError('app pull request is not open');
    }
    if (pull.base?.ref !== 'develop') {
      throw new PairingError('app pull request base is not develop');
    }
    // The freshly fetched head is authoritative. A stale event SHA must not
    // verify a status that belongs to a different commit.
    const head = pullHeadSha(pull);
    if (!/^[0-9a-f]{40}$/.test(head)) {
      throw new PairingError('app head is invalid');
    }
    if (env.APP_SHA && env.APP_SHA !== head) {
      throw new PairingError('pull request head moved during the run');
    }
    const files = await pullFiles(client, APP_REPO, appPr);
    if (!isCompanionActive(files)) {
      throw new PairingError(`${COMPANION_PATH} is not active`);
    }
    const text = await companionText(client, APP_REPO, head);
    if (text === null) {
      throw new PairingError('invalid e2e-companion.json');
    }
    const companion = parseCompanion(text, BACKEND_REPO);
    const slug = env.E2E_PAIR_APP_SLUG || '';
    if (!slug) {
      throw new PairingError('pairing app slug unavailable');
    }
    const statuses = await client.paginate(`/repos/${APP_REPO}/commits/${head}/statuses?per_page=100`);
    const newest = selectAttestedStatus(statuses, {
      context: STATUS_CONTEXT,
      creatorLogin: `${slug}[bot]`,
    });
    const verdict = verifyAttestationStatus(newest, {
      appPr,
      appSha: head,
      backendPr: companion.pull_request,
    });
    if (!verdict.ok) {
      throw new PairingError(verdict.reason);
    }
    deps.log(`Paired attestation: ${newest.target_url}`);
    return 0;
  } catch (error) {
    deps.error(`::error::waiting for paired attestation: ${error.message}`);
    return 1;
  }
}

function commandHandler(command, client, env, deps) {
  const reviewGate = deps.reviewGate || defaultReviewGate({ env });
  switch (command) {
    case 'resolve':
      return resolveCommand(client, env, deps, reviewGate);
    case 'publish':
      return publishCommand(client, env, deps, reviewGate);
    case 'invalidate':
      return invalidateCommand(client, env, deps);
    case 'verify-attestation':
      return verifyAttestationCommand(client, env, deps);
    default:
      throw new PairingError(`unknown command ${command || '(missing)'}`);
  }
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const env = deps.env || process.env;
  const output = {
    log: deps.log || ((message) => console.log(message)),
    error: deps.error || ((message) => console.error(message)),
    writeOutputs: deps.writeOutputs || defaultWriteOutputs,
  };
  try {
    const client =
      deps.client ||
      new GitHubClient({
        token: env.GH_TOKEN,
        fetchImpl: deps.fetch || globalThis.fetch,
      });
    return await commandHandler(argv[0], client, env, { ...output, reviewGate: deps.reviewGate });
  } catch (error) {
    const message = String(error?.message || error).replaceAll(env.GH_TOKEN || '\u0000', '***');
    output.error(`::error::${message}`);
    return 1;
  }
}

export function runEntry(moduleUrl, argvPath, run = () => main(), { processRef = process } = {}) {
  if (!argvPath) {
    return null;
  }
  const entry = pathToFileURL(path.resolve(argvPath)).href;
  if (moduleUrl !== entry) {
    return null;
  }
  return Promise.resolve(run()).then((code) => {
    processRef.exitCode = code;
    return code;
  });
}

runEntry(import.meta.url, process.argv[1]);
