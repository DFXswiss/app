# Review

Read [CONTRIBUTING.md](CONTRIBUTING.md) first. These checks reject the pull
request. An undeclared deviation is rejected. A declared deviation is the
reviewer's to grant or refuse, in writing on the pull request. Declaring one
is not the same as being granted one.

## Website functions

Every function of the website is covered by a real test, as defined under
[Real tests](CONTRIBUTING.md#real-tests). A fake test is forbidden.

Reject the pull request when any of these is true:

- It adds or changes a function a visitor can use, and the same pull request
  has no real test of that function.
- The real test did not run. A job that records `mode=none`, or a suite that
  does not run in CI, is not a run of the real test. On a same-repository
  pull request into `develop` or `main`, the workflow brings the full-stack
  harness up when the API checkout key is available and fails when a full
  stack is requested without it. The `ci:full` label does not make a fork
  pull request run the stack. A fork does not receive the API checkout key,
  so it records `mode=none` and a green full-stack check does not prove the
  suite ran. A caller that requested a full stack without that key fails. A
  manual dispatch of the full-stack workflow without that key fails. A
  reusable call (`called=true`) that has the API checkout key and does not
  pass `full=true` fails when the base is `develop`, `main`, or empty. Any
  other base records `mode=none` and exits 0, including a same-repository
  pull request into another base (for example `staging`).
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
