# Test architecture

This document describes the test layers **this repository** owns, with measured numbers for the
current state. The canonical, cross-repository description of all layers — what each one proves, what
it deliberately does not prove, and the reality-declaration requirement — lives in
`DFXswiss/api` under `docs/test-architecture.md`. Read that one first if you need the whole picture.

Current state and target are kept apart on purpose. Sections marked _target_ describe what is not
built yet; nothing here may describe a capability as existing when it does not.

## The layers this repository owns

| Layer                             | Location                             | What it proves                                                               | What it cannot prove                                                     | Runs in CI                |
| --------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------- |
| Unit                              | `src/`                               | the logic of a component, hook or utility, with its surroundings replaced    | that any two parts fit together                                          | yes                       |
| Full-stack E2E _(not yet merged)_ | `e2e-stack/` — absent on this branch | the seam between frontend, API and database: screens, contracts, persistence | any money movement — all background jobs are switched off during the run | only once #1288 is merged |
| Visual regression                 | `e2e/`                               | appearance against committed screenshot baselines                            | function                                                                 | no                        |

The processing chain behind the API — incoming transfers, AML, purchase calculation, liquidity,
payout, ledger booking — is **not** testable from this repository. It belongs to the integration
layer in `DFXswiss/api`, which runs against a real database. Do not try to cover it from here.

## Current state — measured

### Unit suite — `npm run test`

Measured on `develop` at `3ca38b33`, 2026-08-10, Node 20, with
`npm test -- --coverage`:

| Metric     | Coverage | Absolute     |
| ---------- | -------- | ------------ |
| Statements | 18.12 %  | 2 572/14 191 |
| Branches   | 17.31 %  | 2 054/11 861 |
| Functions  | 14.42 %  | 667/4 624    |
| Lines      | 18.60 %  | 2 369/12 736 |

947 tests passing across 80 suites, 352 files instrumented.

Read that number together with the coverage rule in
[CONTRIBUTING.md](../CONTRIBUTING.md#coverage): every file a pull request touches must reach 100 % on
all four metrics, and CI does not enforce it — it is a review gate. With the repository at 18 %, that
means touching a long-neglected file makes its whole coverage your obligation. Plan for it rather
than discovering it in review.

### Full-stack E2E — `npm run e2e:stack`

**This layer does not exist on this branch.** It arrives with pull request #1288; `e2e-stack/`, its
registry and its route-coverage gate are absent until that merges. Everything in this section
describes the state on that pull request, not the state here, and each paragraph below is written
accordingly.

Measured on the pull-request head `acb6814a` in CI: 223 tests, 219 passing, 3 skipped, 1 failing, in
9.6 minutes on a single worker. The failing one is the route gate, correctly: the merge target has a
route the registry does not claim yet.

On that pull request the harness runs the following for real: Postgres, the API, this frontend, a
browser. It fakes every external provider, on two levels — the API mocks its own outbound calls, and
the Docker network it sits on has no route to the internet at all. The second level is the
load-bearing one, because around twenty integrations use vendor SDKs, `graphql-request`, ethers
providers or bare `fetch` and bypass the API's central HTTP wrapper entirely.

Once #1288 is merged, the details — the factories and the states that are deliberately not
achievable — will live in `e2e-stack/README.md` and `e2e-stack/docs/test-data.md`. Neither path
resolves before then.

### Route coverage, once #1288 is merged

_The gate described here ships with #1288 and does not run on this branch._ It reads the route
definitions out of `src/App.tsx` — which does already carry the nested, exported route list — resolves
nested paths, and fails when a route is claimed by no test file or by more than one, and on a full run
also when a claimed route was never actually opened by the browser. Adding a route will therefore mean
adding a claim in `e2e-stack/specs/registry/` and a test that navigates there.

That gate is the pattern the reality declaration follows: **measure the run, do not trust the
declaration.** Anything its parser cannot resolve is a hard failure rather than a silent omission.

## Reality declaration — hard requirement

Full definition, including all seven categories that count as a fake and the five mandatory fields
per entry, is in `DFXswiss/api` under `docs/test-architecture.md`. The short form that binds every
pull request here:

Whenever you introduce, remove or change a fake — a faked external provider, a disabled cron job, a
schema built without the migration chain, state written directly with SQL, a placeholder value that
looks real, a suppressed side effect, or a seed correction that bends reality — the declaration
changes in the same pull request, and each entry says in one plain sentence what a green run does
**not** prove. A pull request that adds a fake without its declaration is incomplete regardless of
whether CI is green.

Write the declaration entry **before** building the fake. Reversed, it becomes documentation written
from memory, with omissions.

## Known gaps

All four points below concern the full-stack harness from #1288 and therefore describe that pull
request's state rather than this branch, where the layer is absent altogether — which makes the first
point true here in an even stronger sense.

- **No layer here verifies a payment end to end.** Every cron job is disabled in the harness, so the
  processing chain never executes; transaction states are inserted with SQL instead. What is verified
  is the synchronous path: interaction, HTTP, validation, authorisation, persistence, display.
- **The harness does not exercise the migration chain.** It builds the schema from the entities,
  because one migration requires a seed row that does not exist at migration time on a fresh
  database. Migrations are covered in `DFXswiss/api` instead.
- **The harness lives in the wrong repository.** It tests the API as much as this frontend, and
  `DFXswiss/api` has to check this repository out to obtain it. See the target below.
- **The suite is serialised.** All specs share one database and one API instance with no per-test
  isolation, so it runs on a single worker with retries disabled — deliberately, since a retry would
  mask exactly the order-dependent failure this arrangement produces. It bounds how far the suite can
  grow.

## Target architecture

_Target — not built yet._ In the order the work should happen:

1. **Per-worker isolation** (a schema or database per worker), so the suite can be parallelised. Cheap
   while it is small.
2. **Move the harness out of this repository** — into `DFXswiss/api` or a repository of its own,
   consuming published frontend and API images by tag instead of sibling checkouts. The stage depends
   on the applications, never the reverse.
3. **Adopt a coverage ratchet for the unit layer**, replacing a rule that CI cannot enforce with one
   that can only move upward.

Each step is additive; none requires discarding what exists.

## Keeping this document honest

Every number carries the commit it was measured on and the command that produces it. When a layer
changes what it proves, or a fake is added, removed or altered, this document changes in the same
pull request.
