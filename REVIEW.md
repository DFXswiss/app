# Review

Read [CONTRIBUTING.md](CONTRIBUTING.md) first. These checks reject the pull
request. An undeclared deviation is rejected. A declared deviation is the
reviewer's to grant or refuse, in writing on the pull request. Declaring one
is not the same as being granted one.

No deviation from
[Complete test coverage is mandatory](CONTRIBUTING.md#complete-test-coverage-is-mandatory)
can be declared or granted. Reject a pull request that leaves a function it adds
or changes without complete tests.

## Website functions

Every function of the website is covered by a real test, as defined under
[Real tests](CONTRIBUTING.md#real-tests). A fake test is forbidden.

Reject the pull request when any of these is true:

- It adds or changes a function a visitor can use, and the same pull request
  has no real test of that function.
- The real test did not run. A job that records `mode=none`, or a suite that
  does not run in CI, is not a run of the real test. On a pull request into
  `develop`, the full-stack harness has to have run, which means the `ci:full`
  label, a run that brings the stack up, or `mode=paired-attested` after the job
  verified the newest `Full-stack E2E (paired)` status from the pairing App for
  this exact pair. The app-side `verify-attestation` runs in
  the app's `pull_request` workflow without a token for the private backend
  repository: it binds the exact app head, the app pull request, the backend
  pull request number, and the newest App status; it cannot read the backend
  head. The backend side (DFXswiss/backend#6154, `scripts/e2e-pairing`
  `verify-attestation`) binds both exact heads. When the backend head moves, the
  backend notifier dispatches to the coordinator, which re-resolves and replaces
  the App status on the app head (`pending` or `failure`), so the app-side check
  then fails. The status description must name both full heads
  (`pair app#<A>@<app head> backend#<B>@<backend head> run <run id>`); a
  7-character prefix is not an attestation. Only a terminal `success` attests;
  a `pending` running marker is not an attestation. The coordinator polls for up
  to 30 minutes and then reruns that local `Full-stack E2E` job after it posts
  the result. Each
  repository's review state is checked with its own guard pin and the guard
  identity from `.github/e2e-pairing/guard-identities.json`; a merged companion
  is matched through its merge commit, and a companion closed without merge is
  a failure.
- The test offered as coverage of the function replaces the screen, the
  visitor's action, the session, the router, the navigation, this service's
  API, or this service's database.
- The only test offered as coverage of the function opens the screen, takes a
  screenshot, injects a finished session or a finished result, or asserts
  against a stub, a fixture, or a memory router.
- The pull request adds a fake test, or presents a fake test as the coverage
  of a website function. Removing a fake test is allowed. A handbook baseline,
  and a unit test that does not claim to cover the function, are not this
  rejection.

A row written in the database may be the visitor's starting state. It may not
be the outcome. Replacing an external provider does not cover the function.
The visitor's action still has to run through the real frontend, this
service's API, and this service's database.

Do not accept a reality declaration as permission to skip the real test. A
declaration may describe a limit of the harness. It is not coverage. A unit
test, a handbook baseline, and a route that was only opened are not coverage
either. A fake test that already exists does not count as the real test of a
function this pull request changes.

## What else the review still checks

The other duties in CONTRIBUTING.md stay in force: the pull request is
self-contained, files it touches meet the coverage bar, screens it changes
have handbook baselines, and an API call the SDK already covers goes through
the SDK. None of those duties replaces the real test of a website function.
