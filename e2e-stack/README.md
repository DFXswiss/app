# Full-stack E2E harness

## What this is and what it's for

This harness runs the full application in one pass: the frontend, a real API, and a real Postgres database. A pull request is checked against the real interplay of those parts before merge, not only against unit-test mocks. The goal is confidence that screens, API contracts, and persistence still work together after a change.

## What is real and what is mocked

**Real**

- Postgres — freshly created, ephemeral, and schema-built via TypeORM's `synchronize` from
  the entities (not via the real migration chain — see below). The data directory is the named
  volume `e2e-db`, removed by `down -v`, because an anonymous volume is replaced when the
  container is recreated.
- The API
- The frontend

**Mocked**

- All external providers: banks, KYC/AML (for example SumSub, Dilisense, Scorechain), exchanges, blockchain nodes, pricing, storage, and similar outbound integrations

Mocking happens on two levels at once:

1. The API runs with `ENVIRONMENT=loc` and mocks outbound calls itself.
2. The stack sits on a Docker network with `internal: true`, which has no route to the internet at all.

A test therefore cannot structurally reach any real payment provider or other external service, even if application code tried to.
Scorechain is mocked this way: see `SCORECHAIN_LOC_MOCK` in `env/api.env`.

A provider that is only switched off here — for example through
`DISABLED_PROCESSES=*` — is not mocked, and the functions that depend on it are
not covered. Such a provider gets a mock in the API's `loc` mode that simulates
every response form known from production. See "Complete test coverage is
mandatory" in CONTRIBUTING.md.

### Schema: synchronize, not migrations

Postgres schema is created via TypeORM's `synchronize: true` (`SQL_SYNCHRONIZE=true` in
`env/api.env`), directly from the API's entity definitions. The real migration chain does
**not** run here (`SQL_MIGRATE=false`) — a fresh database fails partway through it, because
one migration (`1784807670011-AddRealUnitWalletApp.js`) requires a seed row that the loc
seed step has not created yet at migration time. See `env/api.env` for the full account of
why `SQL_MIGRATE=true` was tried and reverted.

This means the harness does **not** exercise the migration chain and gives no assurance that
migrations apply cleanly to an existing database. Migrations are verified by the API
repository's own test suites, which run against a real Postgres instance there.

## Quickstart

One-shot run (bring the stack up, run the tests, tear everything down):

```bash
npm run e2e:stack
```

Manual exploration (leave the stack up, poke around, then tear down):

```bash
npm run e2e:stack:up
# … use the app …
npm run e2e:stack:down
```

After `e2e:stack:up`, the following host ports are available for debugging (override with env vars if needed):

| Service  | Env var             | Default host URL      |
| -------- | ------------------- | --------------------- |
| API      | `E2E_PORT_API`      | http://localhost:3000 |
| Frontend | `E2E_PORT_FRONTEND` | http://localhost:3001 |

Open `http://localhost:3001` (default `E2E_PORT_FRONTEND`) in a host browser to load the
frontend. The frontend's API base URL is baked into its JS bundle at build time
(`REACT_APP_API_URL`, default `http://localhost:3000`) — the **same** address works for a
host browser and for the browser running inside the `tests` container: on the host it hits
the published proxy port that forwards to the API; inside `tests` it hits the `socat`
loopback forwarder described below that relays to the same API. One address, two networks,
no branching needed.

That base URL is fixed at `http://localhost:3000` and cannot be changed from the outside:
`compose.yml` passes no `args` to the frontend build, so the image always gets the Dockerfile
default, and `up.sh` rebuilds the frontend image on every run, so an image you built by hand
with a different `--build-arg` is overwritten before the stack starts.

Overriding `E2E_PORT_API` therefore does not move the API for anyone but the host. The tests are
unaffected — they run inside the container network and reach the API through the `socat`
forwarder on `127.0.0.1:3000` described under "Writing tests", never through a published host
port. A host browser is affected: the bundle it loads still calls `http://localhost:3000`, which
no longer forwards to the API once you move the published port elsewhere. Leave `E2E_PORT_API`
at its default when you want to explore the app from a host browser; override it only to dodge a
port conflict when you are not doing so.

The browser inside the `tests` container opens the frontend at `http://frontend.e2e.test` (a
`sandbox` alias, because `@IsUrl()` rejects a host without a top-level domain), which does not
resolve on the host, so manual exploration stays on `http://localhost:3001`.

## Prerequisites

- Docker with Compose v2
- Node 20
- Either:
  - the API repository checked out as a sibling directory (default `../api`, overridable via `E2E_API_REPO`), or
  - `E2E_API_IMAGE` set to a pre-built API image (skips building from a local checkout)

Relevant environment variables:

| Variable            | Role                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------- |
| `E2E_API_IMAGE`     | If set, use this pre-built API image instead of building one                           |
| `E2E_API_REPO`      | Path to a checked-out API repo; default `../api` (ignored when `E2E_API_IMAGE` is set) |
| `E2E_PORT_API`      | Host port for the API (default `3000`) — debugging only                                |
| `E2E_PORT_FRONTEND` | Host port for the frontend (default `3001`) — debugging only                           |
| `E2E_WIDGET_URL`    | Internal URL of the widget host (default `http://frontend-widget`)                     |

## Frontend widget service

The harness also builds a separate `frontend-widget` image: an isolated build of the widget/web-component entry point (`src/index-widget.tsx`, custom element `<dfx-services>`), which the normal frontend image does not exercise. It is reachable only on the internal Docker `sandbox` network at `http://frontend-widget` (default; overridable via `E2E_WIDGET_URL`). Like `frontend`, it publishes no host port.

`frontend-widget` is declared only in `compose.tests.yml`, as a dependency of the `tests` service — it is not part of `compose.yml`. That means `npm run e2e:stack:up` (which brings up only `compose.yml`) does **not** start it; only a full `npm run e2e:stack` / `docker compose ... run --rm tests` invocation does. If you are following "Manual exploration" above and expect to find `frontend-widget` running, you will not — bring up the `tests` service (or extend your manual `compose up` with `-f compose.tests.yml frontend-widget`) if you need it standalone.

Because the widget uses a closed shadow root (`shadow: 'closed'`), inspection from tests is limited to the outside view — custom element registration, element presence/size, and absence of uncaught exceptions. Shadow DOM internals are not reachable from outside the component by design.

## Writing tests

Specs live under `e2e-stack/specs/`.

Fixtures cover common setup needs such as signature login, email login, and database queries. For the authoritative, up-to-date list of fixtures (names, signatures, import paths), see `e2e-stack/specs/fixtures/` — that directory is the source of truth and may grow as the harness matures.

The harness does not use the `@dfx.swiss/react` SDK that `CONTRIBUTING.md` otherwise requires for API access: the SDK is a React hooks package built around the component lifecycle and cannot run outside a mounted component tree, while this code runs as plain Node.js in the Playwright test process. It builds requests with raw `fetch` instead. That reasoning covers the whole harness, and the harness uses it accordingly: `fetch` is called from 13 places across 8 files — `fixtures/api-client.ts`, `fixtures/auth.ts`, `fixtures/mail.ts`, `global.setup.ts`, `cross-cutting.spec.ts`, `kyc.spec.ts`, `sell-swap.spec.ts` and `smoke.spec.ts`. `fixtures/api-client.ts` is the preferred entry point for authenticated calls, not the only permitted one; the exception to the SDK rule is scoped to `e2e-stack/` and does not extend to application code under `src/`.

The tests container starts a `socat`-based TCP forwarder on `127.0.0.1:3000` (override listen port with `E2E_LOOPBACK_PORT`, upstream with `E2E_API_URL`) that relays to the real API service. Under `Environment.LOC` the API builds some URLs (notably KYC-step endpoints) as `http://localhost:3000/...` because it assumes frontend and API share a host; without the forwarder, the browser inside the Playwright container would hit itself and fail with `net::ERR_CONNECTION_REFUSED`.

## Relation to the existing suite under `e2e/`

The suite under `e2e/` is visual-regression testing (screenshot baselines). It deliberately does not run in CI, because baselines are platform- and font-dependent.

This harness checks function, not appearance. Draft pull requests run the
job after Build and test. GitHub may hold fork runs as `action_required`.
Ready does not start CI. After a fresh A38 enforce pass, `dfx pr guard`
approves those waiting initial runs. A develop PR
without `ci:full` and without a pair records `mode=none` and does
not bring the stack up. There is no selected/partial mode: `ci:full`, PRs
into `main`, and a bare `workflow_dispatch` (empty `base_ref`) force a full
run. A develop pull request that declares a pair instead records
`mode=paired-attested`; the local job verifies the newest App status, and the
coordinator reruns the local job once the shared run posts its result. A release
pull request into `main` always runs the full stack. Both
suites exist side by side and serve different purposes.

## Paired app and backend pull requests

The app repository hosts the trusted coordinator in
[`.github/workflows/e2e-paired.yml`](../.github/workflows/e2e-paired.yml). It
uses `e2e-companion.json` in the root of each repository to pair one app pull
request with one backend pull request. The file is active only when that pull
request's own diff changes it, including `added`, `modified`, `renamed`,
`copied`, and `changed` rows; `removed` and `unchanged` are inactive. Both files
must name each other and both pull requests must target `develop`. Every open side must carry
its own repository's complete A38 review state at its exact head before the
coordinator runs any pull-request code. Each repository is checked with its
own pinned A38 checkout and the guard identity from
`.github/e2e-pairing/guard-identities.json`.

The coordinator runs once on an ephemeral GitHub-hosted `ubuntu-latest`
runner. Resolve and publish are privileged jobs that use a dedicated GitHub
App token on both repositories. Execution is a separate job with only
`contents: read`; it checks out both exact heads, verifies each unmerged head
against `refs/pull/<n>/head`, uses the backend deploy key only in the single
fetch step that removes it before any PR code runs, and then runs the same
stack steps as this workflow. Before the run, the App posts `pending` on every
open head with a description naming both full heads and the run:
`pair app#<A>@<app head> backend#<B>@<backend head> running <run id>`. Each
head must be exactly 40 lowercase hex characters, so a 7-character prefix never
matches. The attestation replaces `running` with `run`; the full description
stays under GitHub's 140-character limit. The app-side `verify-attestation`
runs in the app's `pull_request` workflow without a token for the private
backend repository. It binds the exact app head, the app pull request, the
backend pull request number, and the newest App status on that app head; it
cannot read the backend head. The backend side (DFXswiss/backend#6154,
`scripts/e2e-pairing` `verify-attestation`) binds both exact heads. When the
backend head moves, the backend notifier dispatches to the coordinator, which
re-resolves and replaces the App status on the app head (`pending` or
`failure`), so the app-side check then fails. A `pending` running marker is not
an attestation. The coordinator polls that local run every 30 seconds for at
most 60 minutes after posting the result, then reruns its `Full-stack E2E` job
once the run has completed. After the deadline it warns without replacing the
posted status. It never falls back to an older success and never matches by
wildcard, so no second stack is started. A develop pull request that declares a
pair also takes precedence over `ci:full`: the local stack scope checks the pair
first and records `mode=paired-attested`.

A push to either side posts `pending`, reruns the local jobs, and invalidates
the old result. Review comments do not cancel a running shared run. A backend
`repository_dispatch` takes the same invalidation path, using its `before` head
as a hint to find the previous companion at that SHA. The coordinator cancels
a run only after the re-resolved heads prove that a head of the pair moved.
Merge order is free: a merged companion is resolved through its merge commit,
and the remaining open side is re-run and re-attested. A companion closed
without merge posts `failure` on the open companion. If both sides are merged,
nothing is run. A green paired run proves that the exact app and backend heads
started together against a real Postgres database and passed the full suite and
route gate. It does not prove external providers, money movement, the migration
chain, or a future merge result.
The coordinator also reconciles every open paired pull request every 30
minutes, which catches a backend retarget to a branch other than
`develop`/`main` and any lost notification. After it invalidates a pair, it also
reruns the local required `Full-stack E2E` jobs so branch protection cannot keep
seeing their previous green result. A running marker whose shared run ended
without a result is replaced with a terminal `failure`, and the local jobs are
rerun so a later trigger can start a new shared run.

Administrators install the pairing GitHub App on both repositories with commit
status read/write, Actions read/write, Contents read/write, Pull requests read,
Issues read, and Metadata read. Both repositories set `E2E_PAIR_APP_CLIENT_ID`
and `E2E_PAIR_APP_SLUG` as variables. The private key is **not** a repository
secret: in `DFXswiss/app`, create the GitHub Actions environment `e2e-pairing`
with a deployment-branch policy limited to `develop`, and store
`E2E_PAIR_APP_PRIVATE_KEY` as an environment secret there. The `resolve` and
`publish` jobs declare `environment: e2e-pairing`, so no pull-request workflow
— including a same-repository pull request that edits a workflow — can read it.
No `A38_GUARD_APP_SLUG` variable is used; the guard identity is the committed
per-repository map.

## Relationship with the API repository

The API repository has its own workflow that checks out this repository (`DFXswiss/app`)
to obtain `e2e-stack/`. Conversely, this harness builds the API image from a checked-out API
repo (`E2E_API_REPO`, default `../api`) or uses a pre-built image (`E2E_API_IMAGE`). The two
repos therefore depend on each other for full-stack CI: the harness lives here; the API image
and the workflow that drives the stack against API changes live in the API repository.

## Troubleshooting

**Spec changes not picked up**

`up.sh` rebuilds the `tests` image on every stack start. Compose never rebuilds an existing
image on its own, and the image `COPY`s specs at build time with no bind mounts — so without
that step a reused Compose project (including a CI path that starts the stack with `up.sh`
and runs tests from a separate shell) silently keeps the old specs. `npm run e2e:stack` /
`e2e:stack:up` go through `up.sh`, so they are covered. If you start tests by hand with
`docker compose ... run --rm tests` and skip `up.sh`, rebuild explicitly first:

```bash
docker compose -p <project> -f e2e-stack/compose.yml -f e2e-stack/compose.tests.yml build tests
```

Otherwise the **old** spec content runs silently.

**frontend-widget image not rebuilt**

`frontend-widget` is declared only in `compose.tests.yml`, as a dependency of `tests` — Compose
builds a _missing_ image automatically but never rebuilds an _existing_ one on its own. `up.sh`
therefore rebuilds it explicitly, right after the `frontend` image, once per stack lifetime. If
you bring the stack up some other way and then change `src/index-widget.tsx` or any file it
imports, the widget-affecting code changes but the image does not: `widget.spec.ts` keeps
testing the old bundle and stays green for a reason that has nothing to do with the current
code. Rebuild explicitly if you suspect this:

```bash
docker compose -p <project> -f e2e-stack/compose.yml -f e2e-stack/compose.tests.yml build frontend-widget
```

**Logs**

```bash
docker compose -p dfx-e2e-stack logs api
docker compose -p dfx-e2e-stack logs frontend
docker compose -p dfx-e2e-stack logs
```

**Traces, screenshots, videos, HTML report**

Playwright writes artifacts inside the `tests` container to `/work/test-results` and `/work/playwright-report`. Those paths are backed by named Docker volumes (`e2e-test-results`, `e2e-playwright-report` in `compose.tests.yml`). Bind mounts are not used and are not supported in the environments this harness must run in.

`scripts/run.sh` starts tests with `compose run --rm tests`, so the container is already gone when you want to copy artifacts. Read the named volumes instead (they outlive the `--rm` container). Do this **before** teardown: `down.sh` / the EXIT trap in `run.sh` run `docker compose down -v` and remove the volumes.

Volume names include the Compose project prefix (`<project>_<name>`; default project `dfx-e2e-stack`). Confirm with `docker volume ls | grep e2e-` if unsure.

```bash
project=dfx-e2e-stack   # or $E2E_PROJECT, if overridden
docker run --rm -v "${project}_e2e-test-results:/vol" -v "$(pwd)/test-results:/dest" alpine cp -a /vol/. /dest/
docker run --rm -v "${project}_e2e-playwright-report:/vol" -v "$(pwd)/playwright-report:/dest" alpine cp -a /vol/. /dest/
```

In CI the workflow does this automatically on a full run and uploads an artifact named `e2e-stack-report`. Skipped stack runs (`mode=none`) produce no artifact.

**Stack does not become healthy**

1. Confirm Docker is running and Compose v2 is available (`docker compose version`).
2. Confirm the API source is reachable: either `E2E_API_REPO` points at a valid checkout, or `E2E_API_IMAGE` is set.
3. Inspect service health and recent logs (commands above). Look for failed migrations, a port conflict on `E2E_PORT_API` / `E2E_PORT_FRONTEND`, or an image build error.
4. Tear down and retry from a clean state: `npm run e2e:stack:down`, then `npm run e2e:stack:up` (or `npm run e2e:stack`).

## Cleanup

```bash
npm run e2e:stack:down
```

This runs `docker compose down -v --remove-orphans` for the `dfx-e2e-stack` project and is safe to run even if nothing is up.
