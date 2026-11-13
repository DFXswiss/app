import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const moduleRoot = new URL('../../', import.meta.url);

function hasRepositoryFiles(directory) {
  return (
    fs.existsSync(path.join(directory, 'CONTRIBUTING.md')) &&
    fs.existsSync(path.join(directory, '.github', 'workflows', 'e2e-paired.yml'))
  );
}

// The coordinator test harness runs this file from a pairing-only staging
// directory. In a normal checkout the module root is already the app root; when
// staged, walk the parent directories and look for the sibling app checkout.
function repositoryRoot() {
  const starts = [fileURLToPath(moduleRoot), process.cwd()];
  for (const start of starts) {
    let directory = path.resolve(start);
    while (true) {
      for (const candidate of [directory, path.join(directory, 'DFXswiss', 'app'), path.join(directory, 'app')]) {
        if (hasRepositoryFiles(candidate)) {
          return pathToFileURL(`${candidate}${path.sep}`);
        }
      }
      const parent = path.dirname(directory);
      if (parent === directory) {
        break;
      }
      directory = parent;
    }
  }
  throw new Error(`app repository root not found from ${starts.join(', ')}`);
}

const root = repositoryRoot();

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, root), 'utf8');
}

function job(workflow, name) {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  assert.notEqual(start, -1, `job ${name} is present`);
  const lines = workflow.slice(start + 1).split('\n');
  const next = lines.findIndex((line, index) => index > 0 && /^  [a-z][a-z0-9-]*:$/.test(line));
  return lines.slice(0, next === -1 ? undefined : next).join('\n');
}

function step(workflow, name) {
  const start = workflow.indexOf(`      - name: ${name}\n`);
  assert.notEqual(start, -1, `step ${name} is present`);
  const lines = workflow.slice(start + 1).split('\n');
  const next = lines.findIndex((line) => /^      - name: /.test(line));
  assert.notEqual(next, -1, `step ${name} has a following step`);
  return lines.slice(0, next).join('\n');
}

test('paired resolve receives the action and previous head, and privileged jobs use the environment', () => {
  const workflow = read('.github/workflows/e2e-paired.yml');
  const resolveStep = step(workflow, 'Resolve pair and review gates');
  assert.match(resolveStep, /EVENT_ACTION: \$\{\{ steps\.side\.outputs\.action \}\}/);
  assert.match(
    resolveStep,
    /PREVIOUS_SHA: \$\{\{ github\.event\.before \|\| github\.event\.client_payload\.before \|\| '' \}\}/,
  );
  for (const name of ['resolve', 'publish']) {
    const jobText = job(workflow, name);
    assert.match(jobText, /environment: e2e-pairing/, `${name} uses the environment`);
    assert.equal((jobText.match(/private-key:/g) || []).length, 1, `${name} mints one App token`);
  }
  assert.match(job(workflow, 'resolve'), /private-key: \$\{\{ secrets\.E2E_PAIR_APP_PRIVATE_KEY \}\}/);
  assert.match(job(workflow, 'publish'), /private-key: \$\{\{ secrets\.E2E_PAIR_APP_PRIVATE_KEY \}\}/);
  assert.match(job(workflow, 'publish'), /timeout-minutes: 75/);
});

test('pairing unit tests enforce full coverage in PR CI', () => {
  const workflow = read('.github/workflows/pr.yml');
  const runStep = step(workflow, 'Run pairing unit tests');
  assert.match(runStep, /--experimental-test-coverage/);
  assert.match(runStep, /--test-coverage-lines=100/);
  assert.match(runStep, /--test-coverage-branches=100/);
  assert.match(runStep, /--test-coverage-functions=100/);
  assert.match(runStep, /--test-coverage-include='\.github\/e2e-pairing\/\*\.mjs'/);
  assert.match(runStep, /--test-coverage-exclude='\.github\/e2e-pairing\/\*\.test\.mjs'/);
  assert.match(runStep, /"\.github\/e2e-pairing\/\*\.test\.mjs"/);
});

test('stack scope only enters paired mode for a develop pull request', () => {
  const workflow = read('.github/workflows/e2e-stack.yml');
  const scope = step(workflow, 'Determine e2e scope');
  const fetchBase = scope.indexOf('repos/DFXswiss/app/pulls/${PR_NUMBER}" --jq \'[.base.ref, .base.sha] | @tsv\'');
  const developGuard = scope.indexOf('if [ "$BASE" = \'develop\' ]; then');
  const readFiles = scope.indexOf('"repos/DFXswiss/app/pulls/${PR_NUMBER}/files?per_page=100"');
  const paired = scope.indexOf('echo "mode=paired-attested" >> "$GITHUB_OUTPUT"');
  assert.ok(fetchBase >= 0, 'missing BASE is fetched from the PR');
  assert.ok(developGuard >= 0, 'base is checked before pairing');
  assert.ok(readFiles > fetchBase, 'the file list is read only after the base is known');
  assert.ok(readFiles > developGuard, 'the file list is read only for develop');
  assert.ok(paired > developGuard, 'paired mode is not selected before the base guard');
  assert.match(scope, /\.status != "removed" and \.status != "unchanged"/);
  assert.match(scope, /changed_files=/);
  assert.doesNotMatch(scope, /\.changed_files \/\/ 0/);
  assert.match(
    scope,
    /\.changed_files \| if type == "number" and \. >= 0 and \. == floor then tostring else "invalid" end/,
  );
  assert.match(scope, /else "invalid" end/);
  assert.match(scope, /if ! \[\[ "\$changed_files" =~ \^\[0-9\]\+\$ \]\]/);
  assert.match(scope, /::error::pull request changed-file count is not a non-negative integer\./);
  assert.match(scope, /file_count >= 3000/);
  assert.match(scope, /file_count < changed_files/);
  assert.match(scope, /refusing to decide paired E2E scope/);
});

test('the local verifier is checked out at the pull request base commit', () => {
  const workflow = read('.github/workflows/e2e-stack.yml');
  const scope = step(workflow, 'Determine e2e scope');
  assert.match(scope, /EVENT_BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(scope, /BASE_SHA="\$\{EVENT_BASE_SHA:-\}"/);
  assert.match(scope, /if \[ -z "\$\{BASE:-\}" \] \|\| \[ -z "\$\{BASE_SHA\}" \]; then/);
  assert.match(scope, /--jq '\[\.base\.ref, \.base\.sha\] \| @tsv'/);
  assert.match(scope, /echo "base_sha=\$BASE_SHA" >> "\$GITHUB_OUTPUT"/);
  const checkout = step(workflow, 'Check out trusted pairing tooling');
  assert.match(checkout, /repository: DFXswiss\/app/);
  assert.match(checkout, /ref: \$\{\{ steps\.scope\.outputs\.base_sha \}\}/);
  assert.doesNotMatch(checkout, /ref: develop/);
});

test('privileged paired jobs check out the immutable workflow commit', () => {
  const workflow = read('.github/workflows/e2e-paired.yml');
  for (const name of ['resolve', 'publish']) {
    const jobText = job(workflow, name);
    const checkout = step(jobText, 'Check out trusted pairing tooling');
    assert.match(checkout, /ref: \$\{\{ github\.workflow_sha \}\}/, `${name} pins the tooling to the workflow commit`);
    assert.doesNotMatch(checkout, /ref: develop/, `${name} does not follow develop`);
  }
});

test('the backend fetch is isolated, hook-free, key-scoped and moved in safely', () => {
  const workflow = read('.github/workflows/e2e-paired.yml');
  const runJob = job(workflow, 'run');
  const fetchStep = step(runJob, 'Fetch backend pull-request head without a checkout credential');
  assert.match(fetchStep, /backend_dir="\$\(mktemp -d "\$RUNNER_TEMP\/backend\.XXXXXX"\)"/);
  assert.match(fetchStep, /case "\$backend_dir" in\n\s+"\$GITHUB_WORKSPACE"\/\*\)/);
  assert.match(fetchStep, /GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=\/dev\/null/);
  assert.match(fetchStep, /git -c core\.hooksPath=\/dev\/null -c core\.fsmonitor=false/);
  assert.match(fetchStep, /export GIT_SSH_COMMAND="\$git_ssh_command"/);
  assert.match(fetchStep, /run_git init --quiet --template= "\$backend_dir"/);
  assert.match(fetchStep, /\.git\/hooks" -mindepth 1 -maxdepth 1 -print -quit/);
  assert.match(fetchStep, /run_git -C "\$backend_dir" fetch/);
  assert.match(fetchStep, /run_git -C "\$backend_dir" checkout --quiet --detach --no-recurse-submodules FETCH_HEAD/);
  assert.match(fetchStep, /run_git -C "\$backend_dir" rev-parse HEAD/);
  assert.match(fetchStep, /rm -f -- "\$key" "\$known_hosts"/);
  assert.match(fetchStep, /rm -rf -- "\$backend_dir\/\.git"/);
  assert.match(fetchStep, /if \[ -L "\$GITHUB_WORKSPACE\/api-repo" \]; then\n\s+rm -f -- "\$GITHUB_WORKSPACE\/api-repo"/);
  assert.match(fetchStep, /rm -rf -- "\$GITHUB_WORKSPACE\/api-repo"/);
  assert.match(fetchStep, /mv -- "\$backend_dir" "\$GITHUB_WORKSPACE\/api-repo"/);
  assert.doesNotMatch(fetchStep, /git init --quiet api-repo/);
  assert.equal(
    (runJob.match(/secrets\.E2E_API_CHECKOUT_KEY/g) || []).length,
    1,
    'the key is confined to the fetch step',
  );
  assert.doesNotMatch(fetchStep, /api-repo\/\.git/);
});

test('admin docs scope the App private key to the develop-only environment', () => {
  for (const relativePath of ['CONTRIBUTING.md', 'e2e-stack/README.md', 'docs/test-architecture.md']) {
    const text = read(relativePath).replace(/\s+/g, ' ');
    assert.match(text, /environment `e2e-pairing`/, relativePath);
    assert.match(text, /deployment-branch policy limited\s+to\s+`develop`/, relativePath);
    assert.match(text, /`E2E_PAIR_APP_PRIVATE_KEY` as an environment secret/, relativePath);
    assert.match(text, /\*\*not\*\* a repository\s+secret/, relativePath);
  }
});

test('a schedule reconciles paired pull requests without running the paired stack', () => {
  const workflow = read('.github/workflows/e2e-paired.yml');
  assert.match(workflow, /\n  schedule:\n    - cron: '\*\/30 \* \* \* \*'\n/);
  const reconcile = job(workflow, 'reconcile');
  assert.match(reconcile, /if: github\.event_name == 'schedule'/);
  assert.match(reconcile, /runs-on: ubuntu-latest/);
  assert.match(reconcile, /environment: e2e-pairing/);
  assert.match(reconcile, /permissions:\n      contents: read/);
  assert.match(reconcile, /timeout-minutes: 15/);
  assert.match(reconcile, /ref: \$\{\{ github\.workflow_sha \}\}/);
  assert.match(reconcile, /uses: actions\/setup-node@v4/);
  assert.match(reconcile, /node-version: '24'/);
  assert.match(reconcile, /private-key: \$\{\{ secrets\.E2E_PAIR_APP_PRIVATE_KEY \}\}/);
  assert.match(reconcile, /repositories: app,backend/);
  assert.match(reconcile, /cli\.mjs reconcile/);
  assert.match(reconcile, /REVIEW_GATE_PYTHON_APP: \$\{\{ github\.workspace \}\}\/\.a38-venv-app\/bin\/python/);
  assert.match(reconcile, /REVIEW_GATE_PYTHON_BACKEND: \$\{\{ github\.workspace \}\}\/\.a38-venv-backend\/bin\/python/);
  assert.doesNotMatch(reconcile, /actions\/checkout@v4\n        with:\n          repository: DFXswiss\/app/);

  for (const name of ['resolve', 'run', 'publish']) {
    assert.match(job(workflow, name), /github\.event_name != 'schedule'/, `${name} does not run on schedule`);
  }
});

test('review-comment deletion and marker removal re-evaluate the pair from event env', () => {
  const workflow = read('.github/workflows/e2e-paired.yml');
  assert.match(workflow, /issue_comment:\n    types: \[created, edited, deleted\]/);
  const decide = step(workflow, 'Decide the starting side');
  assert.match(decide, /COMMENT_BODY: \$\{\{ github\.event\.comment\.body \}\}/);
  assert.match(decide, /PREVIOUS_COMMENT_BODY: \$\{\{ github\.event\.changes\.body\.from \}\}/);
  assert.match(decide, /if \[ "\$EVENT_ACTION" = 'deleted' \]; then/);
  assert.match(decide, /\[\[ "\$COMMENT_BODY" != \*'<!-- A38-REVIEW:v1 -->'\* \]\]/);
  assert.match(decide, /\[\[ "\$\{PREVIOUS_COMMENT_BODY:-\}" != \*'<!-- A38-REVIEW:v1 -->'\* \]\]/);
  assert.doesNotMatch(decide, /\$\{\{ github\.event\.comment\.body \}\}.*A38-REVIEW/);
});

test('paired docs describe reconcile reruns and stale running markers', () => {
  for (const relativePath of ['CONTRIBUTING.md', 'e2e-stack/README.md', 'docs/test-architecture.md']) {
    const text = read(relativePath);
    assert.match(text, /reruns\s+the\s+local\s+required\s+`Full-stack\s+E2E`\s+jobs/, relativePath);
    assert.match(text, /running\s+marker\s+whose\s+shared\s+run\s+ended\s+without\s+a\s+result/, relativePath);
  }
  const stackReadme = read('e2e-stack/README.md');
  assert.match(stackReadme, /local\s+job\s+verifies\s+the\s+newest\s+App\s+status/);
  assert.doesNotMatch(stackReadme, /waits\s+for\s+the\s+shared\s+coordinator's\s+status/);
});
