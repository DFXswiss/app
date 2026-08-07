# Contributing

## Deviating from these guidelines

These guidelines are binding. A pull request that knowingly does not meet one
of them says so **explicitly in its description**, naming the guideline it
departs from and the reason. An undeclared deviation is not a discussion point
— the pull request is rejected.

A declared deviation is the reviewer's call: they may accept it or refuse it at
their own discretion. Declaring one is not the same as being granted one.

## Pull requests

### Every pull request is self-contained

A pull request lands complete or it does not land. Findings raised in review on
your own pull request are fixed in that pull request — never deferred to a
follow-up. Deferring a fix requires an explicit exception from the reviewer,
granted in writing on the pull request.

A follow-up that exists only as an intention is a follow-up nobody opens. The
next reviewer then finds the same points again and the work is done twice.

### Report every bug you find, including pre-existing ones

A defect in code a pull request touches is reported as a bug — with the same
rigour and the same evidence — whether the change introduced it or it was
already there. Age does not make a defect milder, and "pre-existing" is not a
category that demotes it to an observation or puts it out of scope.

Whether a pre-existing bug is fixed in the same pull request is a separate
decision, and it follows the same route as any other deferral above: the
reviewer grants the exception in writing on the pull request. It is never a
reason to leave the bug unreported.

## Testing

### Unit tests

```
npm run test
```

Unit tests run in CI on every pull request against `develop` or `main` and must
pass. The one exception is the release pull request, whose head branch is
`develop` — there the build job is skipped by design.

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

CI runs the suite without a coverage gate, so this is a review gate, not an
automated one: state the per-file numbers in the pull-request description and let
the reviewer check them against the diff. Most files in this repository are far
below the mark today, so touching a long-neglected one means bringing that whole
file up — plan for it rather than discovering it in review.

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
the screen and takes one `toHaveScreenshot` per visual variant is enough.

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
above, which does not run in CI — this harness runs on every pull request in CI.

A pull request that changes a screen or an API contract should bring or update
the matching full-stack test.

Coverage of the route tree is enforced, not tracked by hand: the suite reads the
route definitions out of `src/App.tsx` and fails if a route is claimed by no test
file, or by more than one. Adding a route therefore means adding a claim in
`e2e-stack/specs/registry/` and a test to back it up — otherwise CI goes red on
the new route, not on some unrelated assertion.

Run locally:

```
npm run e2e:stack
```

Details: [`e2e-stack/README.md`](e2e-stack/README.md).
