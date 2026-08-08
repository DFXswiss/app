# Full-stack E2E harness

## What this is and what it's for

This harness runs the full application in one pass: the frontend, a real API, and a real Postgres database. A pull request is checked against the real interplay of those parts before merge, not only against unit-test mocks. The goal is confidence that screens, API contracts, and persistence still work together after a change.

## What is real and what is mocked

**Real**

- Postgres — freshly created, ephemeral, and schema-built via TypeORM's `synchronize` from
  the entities (not via the real migration chain — see below)
- The API
- The frontend

**Mocked**

- All external providers: banks, KYC/AML, exchanges, blockchain nodes, pricing, storage, and similar outbound integrations

Mocking happens on two levels at once:

1. The API runs with `ENVIRONMENT=loc` and mocks outbound calls itself.
2. The stack sits on a Docker network with `internal: true`, which has no route to the internet at all.

A test therefore cannot structurally reach any real payment provider or other external service, even if application code tried to.

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

| Service  | Env var             | Default host URL          |
| -------- | ------------------- | ------------------------- |
| API      | `E2E_PORT_API`      | http://localhost:3000     |
| Frontend | `E2E_PORT_FRONTEND` | http://localhost:3001     |

## Prerequisites

- Docker with Compose v2
- Node 20
- Either:
  - the API repository checked out as a sibling directory (default `../api`, overridable via `E2E_API_REPO`), or
  - `E2E_API_IMAGE` set to a pre-built API image (skips building from a local checkout)

Relevant environment variables:

| Variable            | Role                                                                 |
| ------------------- | -------------------------------------------------------------------- |
| `E2E_API_IMAGE`     | If set, use this pre-built API image instead of building one         |
| `E2E_API_REPO`      | Path to a checked-out API repo; default `../api` (ignored when `E2E_API_IMAGE` is set) |
| `E2E_PORT_API`      | Host port for the API (default `3000`) — debugging only              |
| `E2E_PORT_FRONTEND` | Host port for the frontend (default `3001`) — debugging only         |
| `E2E_WIDGET_URL`    | Internal URL of the widget host (default `http://frontend-widget`)   |

## Frontend widget service

The harness also builds a separate `frontend-widget` image: an isolated build of the widget/web-component entry point (`src/index-widget.tsx`, custom element `<dfx-services>`), which the normal frontend image does not exercise. It is reachable only on the internal Docker `sandbox` network at `http://frontend-widget` (default; overridable via `E2E_WIDGET_URL`). Like `frontend`, it publishes no host port.

Because the widget uses a closed shadow root (`shadow: 'closed'`), inspection from tests is limited to the outside view — custom element registration, element presence/size, and absence of uncaught exceptions. Shadow DOM internals are not reachable from outside the component by design.

## Writing tests

Specs live under `e2e-stack/specs/`.

Fixtures cover common setup needs such as signature login, email login, and database queries. For the authoritative, up-to-date list of fixtures (names, signatures, import paths), see `e2e-stack/specs/fixtures/` — that directory is the source of truth and may grow as the harness matures.

The tests container starts a `socat`-based TCP forwarder on `127.0.0.1:3000` (override listen port with `E2E_LOOPBACK_PORT`, upstream with `E2E_API_URL`) that relays to the real API service. Under `Environment.LOC` the API builds some URLs (notably KYC-step endpoints) as `http://localhost:3000/...` because it assumes frontend and API share a host; without the forwarder, the browser inside the Playwright container would hit itself and fail with `net::ERR_CONNECTION_REFUSED`.

## Relation to the existing suite under `e2e/`

The suite under `e2e/` is visual-regression testing (screenshot baselines). It deliberately does not run in CI, because baselines are platform- and font-dependent.

This harness checks function, not appearance, and therefore does run in CI on every pull request. Both suites exist side by side and serve different purposes.

## Troubleshooting

**Spec changes not picked up**

If you edit a spec file and start the test run by hand via `docker compose ... run --rm tests` (bypassing `npm run e2e:stack`, which rebuilds the image automatically via `run.sh`), you **must** rebuild the tests image first:

```bash
docker compose -p <project> -f e2e-stack/compose.yml -f e2e-stack/compose.tests.yml build tests
```

Otherwise the **old** spec content runs silently: the image `COPY`s spec files in at build time, and there are no bind mounts in this environment. This exact mistake has already cost several people a full test run each.

**Logs**

```bash
docker compose -p dfx-e2e-stack logs api
docker compose -p dfx-e2e-stack logs frontend
docker compose -p dfx-e2e-stack logs
```

**Traces, screenshots, videos, HTML report**

Playwright writes artifacts inside the `tests` container to `/work/test-results` and `/work/playwright-report`. Those paths are backed by named Docker volumes (bind mounts are not used and are not supported in the environments this harness must run in).

Copy them out before teardown:

```bash
docker compose -p dfx-e2e-stack -f e2e-stack/compose.yml -f e2e-stack/compose.tests.yml cp <tests-container>:/work/test-results ./test-results
docker compose -p dfx-e2e-stack -f e2e-stack/compose.yml -f e2e-stack/compose.tests.yml cp <tests-container>:/work/playwright-report ./playwright-report
```

Or use `docker cp` against the tests container name. In CI the workflow does this automatically and uploads an artifact named `e2e-stack-report`.

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
