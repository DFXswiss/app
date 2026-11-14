# Contributing

## Deviating from these guidelines

These guidelines are binding. A pull request that knowingly does not meet one
of them says so **explicitly in its description**, naming the guideline it
departs from and the reason. An undeclared deviation is not a discussion point
— the pull request is rejected.

A declared deviation is the reviewer's call: they may accept it or refuse it at
their own discretion. Declaring one is not the same as being granted one.

The only exception is
[Complete test coverage is mandatory](#complete-test-coverage-is-mandatory):
no deviation from it can be declared or granted.

## Complete test coverage is mandatory

This rule is binding for every pull request and every contributor at DFX. It
takes precedence over any softer wording elsewhere in this repository's
documentation. It is excluded from the deviation process above: no deviation
from this rule can be declared or granted.

### Every function is fully covered

Every function must be fully covered by tests. Every single one, without
exception. A function without complete tests is not done.

### Changing a function means covering it

If you change an existing function that is not yet fully covered, you cover it
completely in the same pull request. "It was untested before" is not an excuse;
touching it makes you responsible for it.

### 100 % is the goal, and everyone works towards it

Complete test coverage is the goal of this repository. Everyone who opens a pull
request actively helps to reach 100 %. Excuses for not having raised the
coverage of an element you changed are not accepted and can lead to sanctions.
Avoid them.

### What 100 % means

100 % test coverage means that the customer's behaviour — clicking buttons,
calling functions — is completely represented by end-to-end tests. For these
tests:

- A **real backend API** and a **real database** run inside the end-to-end test.
- The tests are **self-contained**. They have no dependency on any server,
  hosted API or other running service. Never call `dev.api.dfx.swiss`,
  `api.dfx.swiss` or any other deployed environment; everything runs locally.
- **All external providers are fully mocked**: banks, KYC providers such as
  SumSub, screening and compliance services such as Dilisense and Scorechain,
  exchanges, blockchain nodes, pricing, and every other outbound integration.
  "The provider is switched off in the test environment" is not a mock; a
  disabled provider leaves the function untested.

### Mocks cover every known provider response

Before you write or change a mock, use the DEBUG endpoint (`POST /v1/gs/debug`)
in the PRD environment to check which responses of that external provider are
known — every outcome and every shape the provider has actually returned (for
example pass, fail, pending, error, no coverage). Every known response form must
be simulated by a mock and exercised by a test. Fixtures contain no personal
data: derive the response forms from production, never copy customer data into
the repository.

The full-stack harness under `e2e-stack/` (see
[Full-stack E2E tests](#full-stack-e2e-tests)) is where these end-to-end tests
run.

## Pull requests

### Every pull request is self-contained

A pull request lands complete or it does not land. Findings raised in review on
your own pull request are fixed in that pull request — never deferred to a
follow-up. Deferring a fix requires an explicit exception from the reviewer,
granted in writing on the pull request.

A follow-up that exists only as an intention is a follow-up nobody opens. The
next reviewer then finds the same points again and the work is done twice.

### Releases into main

Open feature pull requests against `develop`. CI rejects a pull request into
`main` unless its head is this repository's `develop` (check name `Main only
from develop`).

### Staging

The `staging` branch deploys to [stg.app.dfx.swiss](https://stg.app.dfx.swiss).
`staging` is a separate branch: merging into `staging` is the exception a
contributor consciously chooses; feature pull requests target `develop` by default
(see above). Which state runs on staging is always a free choice — there
is NO obligation to keep staging up to date. Staging users decide freely when to
sync and rebase onto the latest `develop`. No branch protection on `staging`;
rebasing with force-push to `staging` is allowed.

The Pages project `dfx-app-stg` and its custom domain must exist before the first
`staging` deploy runs.

| Branch    | URL                                            | Pages project | Workflow                    |
| --------- | ---------------------------------------------- | ------------- | --------------------------- |
| `develop` | [dev.app.dfx.swiss](https://dev.app.dfx.swiss) | `dfx-app-dev` | `.github/workflows/dev.yml` |
| `staging` | [stg.app.dfx.swiss](https://stg.app.dfx.swiss) | `dfx-app-stg` | `.github/workflows/stg.yml` |
| `main`    | [app.dfx.swiss](https://app.dfx.swiss)         | `dfx-app-prd` | `.github/workflows/prd.yml` |

### Report every bug you find, including pre-existing ones

A defect in code a pull request touches is reported as a bug — with the same
rigour and the same evidence — whether the change introduced it or it was
already there. Age does not make a defect milder, and "pre-existing" is not a
category that demotes it to an observation or puts it out of scope.

Whether a pre-existing bug is fixed in the same pull request is a separate
decision, and it follows the same route as any other deferral above: the
reviewer grants the exception in writing on the pull request. It is never a
reason to leave the bug unreported.

## Compliance AML UI

Manual `amlCheck = Pass` is **Admin-only**. The Compliance UI hides Pass for non-Admin roles
(`canManuallySetAmlPass`); the API is the source of truth and rejects Pass fail-closed for
Compliance and lower. Prefer Fail or Reset so the automatic AML pipeline can re-decide.

## Testing

### Real tests

Every function of the website is covered by a real test. A function without
that test is not done. Reviewers enforce this with [REVIEW.md](REVIEW.md).

A real test performs the function the way a visitor does. It uses the real
frontend, this service's real API, and this service's real database. It starts
from the screen a visitor sees, carries out the visitor's action, and checks
the result the visitor would see. It does not carry out the function's outcome
for the application, and it does not plant that result. A row written in the
database may be the visitor's starting state. It may not be the outcome.

A fake test is forbidden. A fake test replaces any part of a website function
and is then treated as proof that the function works. Replacing the screen,
the visitor's action, the session, the router, the navigation, this service's
API, or this service's database, and then treating that as the proof, is a
fake test. Opening a screen without performing the function, and then treating
that as the proof, is a fake test. A reality declaration, a comment, a green
unit test, a screenshot of the idle screen, or a route that was only opened
does not make a fake test acceptable.

A handbook baseline that only opens the screen and takes a screenshot, and a
unit test required by the coverage rule below, are not that proof. Adding
them does not by itself reject the pull request. They do not cover the
website function.

A pull request that adds or changes a website function is rejected unless the
same pull request contains a real test of that function and that test has run.
A pull request that adds a fake test, or that presents a fake test as the
coverage of a website function, is rejected. Removing a fake test is allowed.
A green check that did not run the real test does not satisfy this rule. On a
pull request into `develop`, apply `ci:full` so the full-stack harness runs
the test, or pair the pull request with its backend companion as described
under [Paired backend and app pull requests](#paired-backend-and-app-pull-requests);
the paired coordinator runs the one shared stack. A job that records
`mode=none` is not a run. A function this pull request does not touch is not
an excuse to add a fake test, and a fake test that already exists does not
count as the real test of a function this pull request changes.

A unit test of pure logic may exist. It is not coverage of a website function,
and it must not stand in for the real test.

Replacing an external provider does not cover a website function. The
visitor's action still runs through this frontend, this service's API, and
this service's database.

### A38

This repository requires A38 according to the canonical A38 standard in
[DFXswiss/agent](https://github.com/DFXswiss/agent/blob/4a666e836a1acd94be73482b6b10b9fa6f384185/docs/a38.md)
at commit `4a666e836a1acd94be73482b6b10b9fa6f384185`. Repo job selection:
`.github/a38.json`. Target-branch applicability and fork workflow approval:
`.github/pr-guard.json`. `workflow_approval.workflows` stays a required field
there but no longer filters: after a fresh enforce pass the guard approves
every initial held fork `pull_request` run. `dfx pr guard` is
[wired in](https://github.com/DFXswiss/agent/blob/4a666e836a1acd94be73482b6b10b9fa6f384185/docs/a38-guard.md#how-fork-github-actions-are-meant-to-work).
`.github/pr-guard.json` also turns on the held-run drain (`held_run_drain`): on the
all-open reconcile (`schedule`, or `workflow_dispatch` without a pull request number)
the guard deletes never-started held fork `pull_request` runs that no open pull request
on the same fork and branch still needs, with the `actions: write` permission it already
has. Protection rules and bounds are in the pinned guard documentation.

This is a **public** repository. GitHub-hosted runners execute the heavy suite
(Jest, `build:dev`, `widget:dev`, handbook smoke, full-stack E2E, CodeQL).
A38 does not replace those GitHub checks. The author report only covers the
light local jobs in `.github/a38.json` (`npm run lint` and
`npm run format:md:check`). Do not run Jest, production builds, widget
builds, handbook Docker, or full-stack E2E locally for A38.

Draft pull requests run the GitHub PR CI jobs. GitHub holds fork runs from
external contributors as `action_required`. Ready does not start CI. After a
fresh A38 enforce pass on
the current head, `dfx pr guard` approves those waiting initial runs, then sets
Ready when the review rule below is met, required GitHub jobs are green, and
the PR is mergeable.

Two reviews are required before Ready. One review is enough only when the
pull request opener is listed in one_review_authors in the trusted
.github/pr-guard.json on the default branch. A missing file, a missing key,
or an empty list keeps two reviews required. An entry that exists only on
the pull request head does not count.

The newest well-formed second review comment that covers the current head returns a Ready
pull request to draft when its `blocks_merge` is true and it counts at least
one defect; a newer well-formed second review with `blocks_merge` false clears
that. The merger
does not click Approve and run workflows. Do not ask a maintainer to approve
workflow runs. Post the light A38 report on the current head.

### Test architecture

`docs/test-architecture.md` describes the test layers this repository owns, with
measured numbers for the current state, and points at the canonical
cross-repository description in `DFXswiss/backend`. Read it before adding a test
layer, moving a test between layers, or extending the full-stack harness. (Given
as a path rather than a link on purpose: the handbook build renders every markdown
file to HTML, and its integrity check then requires every relative reference
beginning with `docs/`, `assets/` or `screenshots/` to exist in that output — which
a reference to a `.md` file never does, since only the rendered `.html` is there.
References outside those three prefixes are unaffected, which is why the link to
`e2e-stack/README.md` further down is fine.)

Two obligations bind every pull request. They are rules of this file. They do
not follow from `docs/test-architecture.md`, and the reality-declaration
section there does not relax [Real tests](#real-tests).

- **A website function is not pushed down to a lower layer.** The lowest layer
  that can express it by replacing part of it is not coverage. A failure that
  is not a website function, and that is reachable against a real database,
  does not belong in a browser test. The processing chain behind the API is
  not testable from this repository at all.
- **A fake test of a website function is forbidden, not declared.** A reality
  declaration does not permit one. Where the harness replaces something that
  is not the website function — an external provider, a cron job, or the
  migration chain — or writes a starting row, a placeholder, or a suppressed
  side effect, the declaration in `docs/test-architecture.md` changes in the
  same pull request. Each entry says in one plain sentence what a green run
  does **not** prove. That sentence is a limit. It is not coverage, and it
  does not excuse a missing real test.

### Unit tests

A unit test does not cover a website function. Coverage of a website function
is only the real test under [Real tests](#real-tests). A test that replaces
the screen, the session, the router, or this service's API and then claims to
have tested the function is a fake test and is forbidden.

```
npm run test
```

Draft pull requests run the PR CI jobs. GitHub holds fork runs from external
contributors as `action_required`. Ready does not start CI. After a fresh A38
enforce pass on
the current head, `dfx pr guard` approves those waiting initial runs. Do not
ask a maintainer to approve workflow runs. When the job runs, develop PRs
without `ci:full` run Jest `--findRelatedTests` on changed files under `src/`
and `functions/`. A PR with no such files and no full-run trigger records
`mode=none` and skips the suite without failing. Apply `ci:full` to force the
full suite, as do PRs into `main`, a bare `workflow_dispatch`, unsafe path
characters, test/build infrastructure, and deleting or renaming files under
`src/` or `functions/`. Lint, Markdown formatting (`format:md:check`),
`build:dev` and `widget:dev` always run in full when the job runs. A standard
PR into `develop` (no `ci:full` and no active pair) must finish CI in under 10
minutes wall-clock; the full-stack E2E job is an in-job no-op unless `ci:full`
is set or the PR is paired. Full-stack E2E is called from PR CI after Build and
test succeed, so it cannot start while unit tests are still queued. Full runs
(`ci:full`, PRs into `main`, a bare `workflow_dispatch`, and paired runs) may
take longer.

#### Coverage

Every file a pull request touches must reach **100 % statement, branch, function
and line coverage**, for every file Jest instruments — `src/**/*.{ts,tsx,js,jsx}`
minus `src/**/*.d.ts`, the two globs `collectCoverageFrom` in `package.json` is
built from. Translation JSON, lock files, assets, type declarations and
documentation carry no coverage and are not measured. Measure per file:

```
npm run test -- --coverage --collectCoverageFrom='src/screens/example.screen.tsx'
```

Partial coverage hides exactly what a code review cannot see either: error paths,
guard clauses and the state combinations a screen only reaches in production. If
a line genuinely cannot be exercised, delete it rather than excluding it from the
measurement.

CI runs the suite without a coverage gate. The rule is still mandatory (see
[Complete test coverage is mandatory](#complete-test-coverage-is-mandatory)) and
reviewers reject a pull request that leaves a touched file below 100 %: state
the per-file numbers in the pull-request description and let the reviewer check
them against the diff. Most files in this repository are far below the mark
today, so touching a long-neglected one means bringing that whole file up — plan
for it rather than discovering it in review.

### Visual regression tests (Playwright)

The Playwright end-to-end tests under `e2e/` render the app and compare
screenshots against committed baselines in `e2e/screenshots/baseline/`.

**These tests are a local development and code-review aid. They intentionally do
NOT run in CI.**

Their purpose is review quality: when a change affects the UI, the author
regenerates the affected screenshots locally and commits them together with the
change. The reviewer then sees the visual difference (before → after) directly in
the pull-request diff, instead of having to infer it from the code. Running them
in CI would add no value for that purpose and would be flaky — the baselines are
platform-, font- and data-dependent — needlessly blocking PRs.

#### Workflow

1. Start the local stack. See the API repository's README quick start (local
   database via `docker compose up -d`, then `npm run setup`). The API and this
   repository must be checked out as sibling folders.
2. Run the relevant test(s) against the local API:
   ```
   REACT_APP_API_URL=http://localhost:3000 npx playwright test <spec> --project=chromium
   ```
   Specs that log in by mail against the local API reuse the full-stack harness
   fixtures: install their dependencies with `npm ci --prefix e2e-stack` and set
   the `E2E_*` variables the spec lists in its header.
3. When your change affects the UI, regenerate the affected screenshots and commit
   them with the change:
   ```
   npx playwright test <spec> -g "<test title>" --update-snapshots
   ```

#### Rules

- Regenerate only the screenshots your change actually affects — never update all
  baselines at once.
- Baselines are platform-specific (`*-chromium-darwin.png`); generate them on the
  same platform as the existing ones (macOS).
- Baselines for screens you did not touch may not match the current app, because
  the screen or the local seed data has drifted since the baseline was taken. That
  is expected — these tests are not a regression gate and do not fail the build.
- For a clean, reviewable diff, regenerate on a realistic data set so the
  screenshot isolates your actual UI change rather than seed-data noise.

## Handbook

The handbook assembles the committed Playwright baselines, the design tokens and
the Markdown documentation of this repository into a static site. It is built by
`scripts/handbook/build.js`; see `docs/handbook/README.md` for the sources and
the build guards.

**Handbook coverage must be complete.** Every screen or flow a pull request
changes has to be represented there:

- a committed Playwright baseline under `e2e/screenshots/baseline/`, covering each
  visual variant the change introduces — for example both sides of a device or
  mode split, not just the one you happened to look at, and
- an entry in `scripts/handbook/metadata.json` giving the flow a title and a
  description.

If the screen you touched has no baseline yet, create one. That is the case this
rule exists for, and it does not conflict with "regenerate only the screenshots
your change actually affects" above: a screen you changed is affected, whether or
not it had a baseline before. `--update-snapshots` writes missing baselines as
well as changed ones, so the same command covers both. If the screen has no spec
at all, add one next to the existing specs in `e2e/` — a spec that navigates to
the screen and takes one `toHaveScreenshot` per visual variant. That spec is
only the handbook baseline. It is not the real test of the function.

The build itself does not enforce any of this: it guards a global screenshot and
document floor, and a missing `metadata.json` entry is accepted silently, falling
back to a title derived from the file name — only an orphaned entry, one with no
matching screenshots, produces a stderr warning (see `docs/handbook/README.md`).
Completeness is therefore checked in review, and `handbook-check.yaml` does not
even run on a pull request that touches application code under `src/` and nothing
else: its path filter covers `src/static/assets/**` and no other path below `src/`.

## API access goes through the SDK

Every API call that `@dfx.swiss/react` already encapsulates must go through the
SDK. Do not hand-build an API URL and fire it with `fetch`, and do not fall back
to a raw `useApi().call` for a call the SDK covers.

If an SDK hook is missing a parameter or an endpoint, the fix belongs in the SDK
(DFXswiss/packages, `packages/react/src/hooks/`): add it additively so existing
callers stay source-compatible, release it, then consume it here. Working around
it at the call site moves endpoint knowledge — verb, query shape, response type —
into this repository, where it goes stale silently: the SDK gets updated, the call
site does not, and `call<T>()` type-checks against the generic you asserted
yourself, so nothing fails at build time.

## Full-stack E2E tests

The full-stack harness under `e2e-stack/` runs the real frontend, API, and
Postgres together (external providers are mocked). Unlike the visual-regression
suite under `e2e/` — see [Visual regression tests (Playwright)](#visual-regression-tests-playwright)
above, which does not run in CI — this harness is called from PR CI after Build
and test succeed. Draft pull requests run the job after Build and test. GitHub
also holds fork runs from external contributors as `action_required`. Ready
does not start CI. After a
fresh A38 enforce pass on
the current head, `dfx pr guard` approves those waiting initial runs. Do not
ask a maintainer to approve workflow runs. A develop PR without `ci:full`
and without a pair records `mode=none` and does not bring the stack up (the job
still runs). Apply
`ci:full`, target `main`, or run a bare `workflow_dispatch` to force a full run.
A develop pull request that declares a pair instead records
`mode=paired-attested` after the trusted coordinator verified its exact pair; a
release pull request into `main` always runs the full stack; see
[Paired backend and app pull requests](#paired-backend-and-app-pull-requests).
An active pair takes precedence over `ci:full`: the pair records
`mode=paired-attested` and runs once in the coordinator instead of starting a
second stack in either local job. The local stack scope checks the pair before
it checks `ci:full`.

A pull request that adds or changes a website function must add or update the
real test of that function in this harness, and that test must have run. See
[Real tests](#real-tests). Opening the route, or injecting a finished session,
does not meet that rule.

Coverage of the route tree is enforced, not tracked by hand. The suite reads the
route definitions out of `src/App.tsx` and fails if a route is claimed by no test
file or by more than one, and — on a full run (`E2E_FULL_RUN=1`, which CI sets
whenever it brings the stack up) — if a route
was never actually opened by any test. The browser records every navigation it
makes, and the gate compares that recording against the route list, so a claim
pointing at a file that never visits the route does not satisfy it. Adding a route
therefore means adding a claim in `e2e-stack/specs/registry/` and a test that
navigates there. That gate runs only when the stack comes up (`ci:full`, a PR
into `main`, a bare `workflow_dispatch`, or a verified paired run); a standard
develop PR without `ci:full` and without a pair does not enforce it. Opening a
route satisfies only this route gate. It does not satisfy
[Real tests](#real-tests). A green check on a run that records `mode=none` does
not satisfy that rule either; a paired run enforces the same full-run route
gate in the coordinator.

Run locally:

```
npm run e2e:stack
```

Details: [`e2e-stack/README.md`](e2e-stack/README.md).

### Paired backend and app pull requests

A feature that needs one backend pull request and one app pull request is
declared as a pair in code. Add `e2e-companion.json` at the root of each pull
request's repository:

```json
{ "repository": "DFXswiss/backend", "pull_request": 6140 }
```

The app file names `DFXswiss/backend`; the backend file names `DFXswiss/app`.
The object must contain exactly `repository` and `pull_request`, and the number
must be a positive integer. The file is active when the pull request's own diff
changes it, including `added`, `modified`, `renamed`, `copied`, and `changed`
rows. A row with status `removed` or `unchanged` is inactive. An unchanged copy
inherited from `develop` does not pair anything, and deleting it removes the
pairing.

Both companion files must be active and name each other's pull request. Both
pull requests must target `develop`. Every **open** side's exact head must
carry its own repository's complete A38 review state before any paired code
runs; each repository is evaluated with its own pinned guard checkout and the
guard identity from `.github/e2e-pairing/guard-identities.json`. The selected
first-review comment must name exactly that head. A merged companion is
resolved through its immutable merge commit, not through moving `develop`.
The remaining open side is then re-resolved, re-reviewed and re-attested
against the companion's merge commit. A companion closed without merge makes
the pair invalid and the other open side receives a `failure` status.

The one shared run happens in
[`.github/workflows/e2e-paired.yml`](.github/workflows/e2e-paired.yml) on an
ephemeral GitHub-hosted `ubuntu-latest` runner. Its resolve and publish jobs
use a dedicated GitHub App token, while the job that executes the app and
backend heads has only `contents: read` and no App credential. The backend
read-only deploy key is used in exactly one fetch step, with an explicit
per-command `GIT_SSH_COMMAND`, and is removed before any pull-request-controlled
file runs. Before the shared run, the App posts `pending` on every open head
with a description naming both full heads and the run:
`pair app#<A>@<app head> backend#<B>@<backend head> running <run id>`. Each
`<app head>` and `<backend head>` must be exactly 40 lowercase hex characters;
a short prefix is not an attestation. A result is the same description with
`run` instead of `running`, posted as a commit status `Full-stack E2E (paired)`
on every open head of the pair. The whole description stays below GitHub's
140-character limit.
The app-side `verify-attestation` runs in the app's `pull_request` workflow
without a token for the private backend repository. It binds the exact app
head, the app pull request, the backend pull request number, and the newest App
status on that app head; it cannot read the backend head. The backend side
(DFXswiss/backend#6154, `scripts/e2e-pairing` `verify-attestation`) binds both
exact heads. When the backend head moves, the backend notifier dispatches to
the coordinator, which re-resolves and replaces the App status on the app head
(`pending` or `failure`), so the app-side check then fails. The local
`Full-stack E2E` job accepts only a terminal `success`; a `pending` running
marker is not an attestation. The coordinator polls the local run every 30
seconds for at most 60 minutes after posting the result, then reruns its
`Full-stack E2E` job once the run has completed. If the deadline passes, it
warns and leaves the coordinator status posted. The local check never falls
back to an older success and never matches by wildcard. The result is therefore
one run of both exact heads, not two independent stacks.

A push to either pull request invalidates the previous result and reruns the
local jobs; a stale green status cannot be reused. Review comments do not
cancel a running shared run. A backend `repository_dispatch` follows the same
invalidation path as an app push, using the dispatch's `before` head as a hint
to find the previous companion at that SHA. A run is cancelled only after the
re-resolved heads prove that a head of the pair moved; a dispatch does not
cancel unconditionally. If both pull requests are open, merge order is free.
After one side merges, the remaining side resolves against that side's merge
commit and is re-run and re-attested. If a side is closed without merging, the
pair fails closed. A pair whose both sides are already merged is not run.
The coordinator also reconciles every open paired pull request in both
repositories every 30 minutes, on any base, and repairs divergent and stale
pending statuses. It catches a retarget away from `develop`/`main` and any lost
notification. After an invalidation it also reruns the local required
`Full-stack E2E` jobs, and it replaces a running marker whose shared run ended
without a result with a terminal `failure`, then reruns those local jobs so a
later trigger can start a new shared run.

Administrators provision the GitHub App on `DFXswiss/app` and
`DFXswiss/backend` with commit-status read/write, Actions read/write, Contents
read/write, Pull requests read, Issues read, and Metadata read. Both
repositories need the variables `E2E_PAIR_APP_CLIENT_ID` and
`E2E_PAIR_APP_SLUG`. The private key is **not** a repository secret: in
`DFXswiss/app`, create the GitHub Actions environment `e2e-pairing` with a
deployment-branch policy limited to `develop`, and store
`E2E_PAIR_APP_PRIVATE_KEY` as an environment secret there. The `resolve` and
`publish` jobs declare `environment: e2e-pairing`, so no pull-request workflow
— including a same-repository pull request that edits a workflow — can read the
key. No `A38_GUARD_APP_SLUG` variable is used. Contributors cannot provision or
bypass this App.
