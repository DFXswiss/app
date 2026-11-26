# Test architecture

This document describes the test layers **this repository** owns, with measured numbers for the
current state. The canonical, cross-repository description of all layers — what each one proves, what
it deliberately does not prove, and the reality-declaration requirement — lives in
`DFXswiss/backend` under `docs/test-architecture.md`. Read that one first if you need the whole picture.

Current state and target are kept apart on purpose. Sections marked _target_ describe what is not
built yet; nothing here may describe a capability as existing when it does not.

## The layers this repository owns

| Layer               | Location                                                     | What it proves                                                                                                                                  | What it cannot prove                                                                        | Runs in CI                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                | `src/`                                                       | the logic of a component, hook or utility, with its surroundings replaced                                                                       | that any two parts fit together                                                             | drafts run (forks may wait as `action_required`); suite full / related / none                                                                                                    |
| Handbook deep-link  | `scripts/handbook/deep-link.js`                              | `?shot=` / `?group=` / hash isolate one handbook card in a fake document                                                                        | the browser after Basic Auth, or that nginx serves the query                                | `handbook-check.yaml` (drafts that touch handbook paths; Ready does not start CI)                                                                                                |
| Pairing coordinator | `.github/e2e-pairing/` (`*.test.mjs`, `test_review_gate.py`) | pair resolution, review-gate handling, status attestation and fail-closed invalidation of the paired E2E coordinator, against a fake GitHub API | real GitHub permissions, App installation, runner behaviour, or the shared stack run itself | `pr.yml` on every pull request: `node --test` with 100 % lines/branches/functions for `.github/e2e-pairing/*.mjs`, and `coverage` with 100 % lines/branches for `review-gate.py` |
| Full-stack E2E      | `e2e-stack/`                                                 | the seam between frontend, API and database: screens, contracts, persistence                                                                    | any money movement — every process-gated job except Scorechain is off during the run        | drafts run (mode=none without ci:full and without a pair); paired: local mode=paired-attested, stack once in the coordinator; else ci:full / main / bare dispatch                |
| Visual regression   | `e2e/`                                                       | appearance against committed screenshot baselines                                                                                               | function                                                                                    | no                                                                                                                                                                               |

A develop app/backend pull request that declares a pair runs the same stack once in the trusted
coordinator instead of starting it in either repository's local job; a release pull request into
`main` always runs the full stack. See
[Paired app and backend pull requests](#paired-app-and-backend-pull-requests).

The processing chain behind the API — incoming transfers, AML, purchase calculation, liquidity,
payout, ledger booking — is **not** testable from this repository. It belongs to the integration
layer in `DFXswiss/backend`, which runs against a real database. Do not try to cover it from here.

## Current state — measured

### Unit suite — `npm run test`

Measured on `develop` at `4e9544a9`, 2026-08-10, Node 20, with
`npm test -- --coverage`:

| Metric     | Coverage | Absolute     |
| ---------- | -------- | ------------ |
| Statements | 18.15 %  | 2 578/14 198 |
| Branches   | 17.31 %  | 2 054/11 861 |
| Functions  | 14.44 %  | 668/4 626    |
| Lines      | 18.63 %  | 2 375/12 742 |

950 tests passing across 81 suites, 353 files instrumented.

Read that number together with the coverage rule in `CONTRIBUTING.md`, section
"Coverage": every file a pull request touches must reach 100 % on all four
metrics. CI enforces 100 % lines, branches and functions for the pairing Node
suite and lines and branches for the review-gate Python suite, but not for Jest.
The rule is still mandatory: reviewers reject a pull request that leaves a
touched file below 100 %, and no deviation from it can be declared or granted
(`CONTRIBUTING.md`, section "Complete test coverage is mandatory"). With the
repository at 18 %, that means touching a long-neglected file makes its whole
coverage your obligation. Plan for it rather than discovering it in review.

### Pairing coordinator — `.github/e2e-pairing/`

Pairing coordinator, measured on this branch at `8fa1ca64`, 2026-11-16, Node 24.20.0: 229 Node tests
passing, 100 % lines, branches and functions for `cli.mjs`, `github.mjs` and `pairing.mjs`; 13 Python
review-gate tests passing, 100 % lines (99 statements) and branches (32) for `review-gate.py`, with only
the `__main__` entry line excluded.

### Handbook deep-link — `node --test scripts/handbook/deep-link.node-test.cjs`

Five cases in `scripts/handbook/deep-link.node-test.cjs`: query over hash, `?group=`, id prefixes,
isolate, and clearing a previous `handbook-target`. This is not the Jest suite. It runs in
`handbook-check.yaml` before the image build. A green run does not prove the live page after
Basic Auth.

### Full-stack E2E — `npm run e2e:stack`

This layer arrived with #1288 and lives in `e2e-stack/`.

Measured on the head of that pull request, `acb6814a`, in CI: 223 tests, of which 219 passed, 3 were
skipped and 1 failed, in 9.6 minutes on a single worker. The failure was the route gate doing its job —
the merge target had gained a route the registry did not claim yet. Re-measure after any change to the
suite; the number of tests is not pinned anywhere.

The harness runs the following for real: Postgres, the API, this frontend, a browser. It fakes every
external provider through two independent mechanisms: the API mocks its own outbound calls, and the
Docker network it sits on has no route to the internet at all. The second is what carries the guarantee,
and `e2e-stack/env/api.env` says so itself: the `loc` mock "only covers calls made through the API's
central HTTP wrapper", while "[w]hat guarantees no external system is ever contacted is the network the
API sits on". Any call that reaches out without going through that wrapper is therefore outside the
mock's scope. Which calls those are, and how many, is a property of the API and not verifiable from this
repository.

The details — the factories and the states that are deliberately not achievable — are in
`e2e-stack/README.md` and `e2e-stack/docs/test-data.md`.

### Route coverage is enforced, not tracked by hand

The gate reads the route definitions out of `src/App.tsx`, resolves nested paths, and fails when a route
has no registry claim or more than one — including two claims inside the same registry file — or when
the spec file a claim names does not exist. When `E2E_FULL_RUN=1` is set, it additionally fails for a
claimed route the browser never opened. That flag is declared by the run, not measured from it, so it may
only be set when the run really covers every spec: `e2e-stack/scripts/run.sh` sets it when it was given
no arguments and clears it otherwise — clearing matters because `e2e-stack/compose.tests.yml` forwards
whatever the caller's environment holds — and the CI workflow sets it when it brings the stack up (full run).
A local develop PR without `ci:full` and without a pair never sets it; `ci:full`, PRs into `main`, and
a bare `workflow_dispatch` (empty `base_ref`) force that full invocation. A paired run sets it in the
trusted coordinator, which executes both exact pull-request heads once.
Adding a route therefore means adding a claim in `e2e-stack/specs/registry/` and a test that navigates
there.

That gate is the pattern the reality declaration follows: **measure the run, do not trust the
declaration.** Anything its parser cannot resolve is a hard failure rather than a silent omission.

### Paired app and backend pull requests

The trusted coordinator
[`.github/workflows/e2e-paired.yml`](../.github/workflows/e2e-paired.yml) pairs
one app PR with one backend PR through `e2e-companion.json`. Both files must be
active in their own pull request's diff, name each other, and both pull requests
must target `develop`. A row is active for `added`, `modified`, `renamed`,
`copied`, and `changed`; `removed` and `unchanged` are inactive. Every open side's exact head must carry its own
repository's complete A38 review state, including a first-review comment that
names that exact head, before any paired code runs. Each side is checked with
its repository's own pinned A38 checkout and its guard identity from
`.github/e2e-pairing/guard-identities.json`.

Resolution and publication are privileged jobs that use a dedicated GitHub App
installed on both repositories. Execution is a separate job on an ephemeral
GitHub-hosted `ubuntu-latest` runner with only `contents: read`; it receives no
App token, checks out both exact heads, verifies each unmerged head against
`refs/pull/<n>/head`, and uses the backend deploy key in only the single fetch
step that removes it before any pull-request-controlled file executes. Before
the shared run, the App posts `pending` on every open head with a description
naming both full heads and the run:
`pair app#<A>@<app head> backend#<B>@<backend head> running <run id>`. Each
head must be exactly 40 lowercase hex characters, so a 7-character prefix never
matches. The attestation replaces `running` with `run`; the full description
stays under GitHub's 140-character limit. It posts
`Full-stack E2E (paired)` on every open head of the pair. The app-side
`verify-attestation` runs in the app's `pull_request` workflow without a token
for the private backend repository. It binds the exact app head, the app pull
request, the backend pull request number, and the newest App status on that app
head; it cannot read the backend head. The backend side
(DFXswiss/backend#6154, `scripts/e2e-pairing` `verify-attestation`) binds both
exact heads. When the backend head moves, the backend notifier dispatches to
the coordinator, which re-resolves and replaces the App status on the app head
(`pending` or `failure`), so the app-side check then fails. A `pending` running
marker is not an attestation. The coordinator polls that local run every 30
seconds for at most 60 minutes after posting the result, then reruns its
`Full-stack E2E` job once the run has completed. After the deadline it warns
without replacing the posted status. It never falls back to an older success
and never matches by wildcard, so it verifies one shared run rather than
starting a second stack. A develop pull request that declares a pair takes
precedence over `ci:full`: the local stack scope checks the pair first and
records `mode=paired-attested`.

A push to either side posts `pending`, reruns the local required jobs, and
invalidates the old result. Review comments do not cancel a running shared run.
A backend `repository_dispatch` takes the same invalidation path: its `before`
head is a hint used to find the previous companion at that SHA. The coordinator
cancels a run only after the re-resolved heads prove that a head of the pair
moved. Merge order is free for merges into `develop`: a merged companion
resolves through its immutable merge commit, and the remaining open side is
then re-resolved, re-reviewed and re-attested. A companion closed without
merge or merged into `main` or any other base posts `failure` on the open
companion. If both sides are merged, nothing is run. A green paired run
proves that the exact app and backend heads started together against a real
Postgres database and passed the full suite, including the route gate. It
does not prove external-provider behavior, money movement, the migration
chain, or that the pull requests will merge without conflicts.
The coordinator also reconciles every open paired pull request in both
repositories every 30 minutes, on any base, and repairs divergent and stale
pending statuses. It catches a retarget away from `develop` and any lost
notification. After an invalidation it also reruns the local required
`Full-stack E2E` jobs, and it replaces a running marker whose shared run ended
without a result with a terminal `failure`, then reruns those local jobs so a
later trigger can start a new shared run.
Reconcile leaves a stale review-gate pending only when every open head carries
that marker; otherwise it posts `pending`, reruns the local jobs of the open
sides, and publishes the gate result. A close-path inspection error and an
internal review-gate error are failures, never review-pending verdicts. The
resolve job sets up Node 24 before any CLI step, and a final cleanup step fails
closed after an earlier failure before the CLI runs.

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

## Reality declaration — hard requirement

A fake test of a website function is forbidden. A declaration does not make it
acceptable. `CONTRIBUTING.md` under Real tests defines the real test and the
fake test. This section does not relax that rule.

Where the harness replaces something that is not the website function — an
external provider, a cron job, or the migration chain — or writes a starting
row, a placeholder, or a suppressed side effect, the declaration changes in
the same pull request. Each entry says in one plain sentence what a green run
does **not** prove. That sentence is a limit. It is not coverage, and it does
not excuse a missing real test. Write that limit before adding the
replacement. Reversed, it becomes documentation written from memory, with
omissions.

The taxonomy of those harness limits, and the mandatory fields of an entry,
live in `DFXswiss/backend` under `docs/test-architecture.md`. That document
owns the taxonomy. Its exact extent is not verifiable from this repository.

## Reality declaration — entries

This section lists the fakes introduced by this repository's own suites and states what a green
run does not prove for each one; the taxonomy and cross-repository entries live in
`DFXswiss/backend` under `docs/test-architecture.md`.

- **The buy-process specs answer the quote endpoint themselves.** `e2e/buy-process.spec.ts` fulfils
  `**/v1/buy/paymentInfos` with static payloads, so a green run proves that the screen renders those
  payloads, not that the API produces them. Unit tests against the utility pin the payload shapes
  instead.
- **The provisional-approval buy visuals fulfil the quote themselves.** `e2e/buy-process.spec.ts`
  and `e2e/buy-info.spec.ts` provide an invalid quote with an onboarding error and
  `provisionalApproval: true`, so a green run proves the screens render that state, not that the API
  returns it for a given account.
- **The account-access toggle visuals rewrite the fetched customer dossier.** `e2e/compliance.spec.ts`
  sets `kycLevel` to 10, `provisionalApprovalDate` to `2026-10-29T10:00:00.000Z`, and role `VIP`
  on the first user in the "on" variant (or supplies a synthetic single VIP user if none exists).
  The "off" variant sets `kycLevel` to 10, removes `provisionalApprovalDate` (`undefined`), and
  sets all users to role `User` (or supplies a synthetic single User). A green run proves the
  toggles render for those values, not that the API stores or returns them.
- **The customer-switch visuals hold or fail the next dossier themselves.** `e2e/compliance.spec.ts`
  (`compliance-user-13` and `-14`) intercept `**/v1/support/1006`: the loading variant never answers,
  the error variant answers HTTP 500 with a fixed message. A green run proves how the screen renders
  those two states after an in-app route change, not that the API is slow or fails for that id.
- **The KYC-file-error visual fails the file request itself.** `e2e/compliance.spec.ts`
  (`compliance-user-15`) intercepts `GET /v2/kyc/file/:uid?access=View` and answers HTTP 500 with a
  fixed message. A green run proves that the loaded dossier keeps rendering the file error in its
  preview area, not that the API rejects a real KYC-file request or returns that message.
- **The onboarding-fee visuals answer the clerk lookup, the address list, the fee list and the error
  themselves.** `e2e/compliance.spec.ts` (`compliance-user-16` and `-17`) answer
  `GET /v1/support/issue/clerk` with a fixed clerk name, answer `GET /v1/partner/onboardingFee/amounts`
  with the fixed list `{ "amounts": [400, 800] }`, and, when the fetched dossier has no users, supply
  one synthetic address; `-17` also intercepts `PUT /v1/userData/1005/onboardingFee` and answers
  HTTP 400 with `Address is blocked or deleted`. A green run proves how the form renders those values,
  not that the account has that address, that the API resolves that clerk, that the API serves that
  amount list, or that it rejects a real address.
- **The personal-data edit visual answers the save itself.** `e2e/compliance.spec.ts`
  (`compliance-user-20`) intercepts `PUT /v1/userData/1005/operatorMutation` and answers HTTP 404, as
  the API does while its switch `userDataOperatorMutation` is off. A green run proves how the form
  renders that state, not that the switch is off in any environment.
- **The risk-status visuals answer the clerk lookup and the error themselves.** `e2e/compliance.spec.ts`
  (`compliance-user-21` and `-22`) answer `GET /v1/support/issue/clerk` with a fixed clerk name; `-22`
  also intercepts `PUT /v1/userData/1005/riskStatus` and answers HTTP 400 with
  `Risk status change refused`. A green run proves how the form renders those values, not that the API
  resolves that clerk or that it refuses a real change.
- **The Compliance-role visual gives the browser an unsigned session and the Admin token to the API.**
  `e2e/compliance.spec.ts` (`compliance-user-23`) gives the browser an unsigned session with role
  Compliance and rewrites the Authorization header of every API request to the Admin token. A green
  run proves how the form renders for the Compliance role, not that the API accepts a Compliance
  clerk's save (that is the full-stack test in `e2e-stack/specs/compliance.spec.ts`).
- **The transaction-search test writes the customer's verified name itself.**
  `e2e-stack/specs/compliance.spec.ts` (`/compliance search by transaction id …`) sets
  `user_data.verifiedName` by SQL before the search, because no identification runs in the stack. A green
  run proves that the search lists the stored name next to the transaction, not that an identification
  sets it.
- **The non-Frick buy screens inject a currency list.** `e2e/buy-process.spec.ts` and
  `e2e/buy-info.spec.ts` fulfil `**/v1/fiat` with CHF, EUR, and one buyable row outside the
  Bank Frick set, and they fulfil the quote in that currency. The product does not offer that
  currency, so the buy form is not a handbook baseline. Buy Info baselines the EUR-and-CHF
  sentence only. A green run does not prove that the API offers that currency.
- **The USD collection toggle injects a buyable USD row.** `e2e/buy-process.spec.ts` fulfils
  `**/v1/fiat` with USD marked buyable so the screen treats USD as a displayed Bank Frick
  currency, and fulfils the quote with a static personal IBAN. A green run proves that toggle
  renders. It does not prove that the API currently offers USD.
- **The USD-list mismatch sentence injects USD and a non-product currency.** `e2e/buy-process.spec.ts`
  and `e2e/buy-info.spec.ts` fulfil `**/v1/fiat` with buyable CHF, EUR, USD and one currency outside
  the Bank Frick set, and fulfil the quote in that currency. Buy Info baselines the sentence that
  names EUR, CHF and USD. The buy form is not a baseline, because it would show a currency the
  product does not offer. A green run does not prove that the API offers USD or that currency.
- **The USD-list currency error injects USD and a rejected quote.** The same two specs fulfil
  `**/v1/fiat` with buyable CHF, EUR and USD, and fulfil `**/v1/buy/paymentInfos` with HTTP 400
  and message `PersonalIbanCurrencyNotSupported`. A green run proves the error sentence then
  names EUR, CHF and USD. It does not prove that the API rejects USD or returns that message.
- **The RealUnit quotes and dashboard visual specs answer the admin list themselves.**
  `e2e/realunit-quotes.spec.ts` and `e2e/realunit-dashboard.spec.ts` fulfil
  `GET /v1/realunit/admin/quotes` (and, on the dashboard, holders, token info, price history,
  transactions, the three admin stats paths buy-volume, holders and registration,
  `GET /v1/realunit/referral/admin/prize-wallet`,
  `GET /v1/realunit/referral/admin/payouts`, and
  `GET/PUT /v1/realunit/admin/buy-limit`) with synthetic fixtures that include
  `userId`, `userName` and `deactivatedAt`.
  They also fulfil staff/bootstrap GETs (`/v1/language`, `/v1/fiat`, `/v1/asset`, `/v1/bankAccount`,
  `/v1/country`, `/v1/setting/infoBanner`, `/v2/user`) so a synthetic unsigned JWT does not 401.
  The dashboard spec also fulfils `GET /v1/realunit/referral/admin/prize-wallet/alerts`,
  `GET /v1/realunit/account/:address` and `GET /v1/realunit/account/:address/history`,
  and it answers price history, buy volume, holder count, registration, the prize wallet
  and the buy limit with HTTP errors when a scenario asks for the error state.
  The dashboard answers `GET /v1/realunit/admin/holders` itself. Fixture rows carry `mail`
  or null, and the spec also requests `registration=registered` and `registration=unregistered`.
  A green run proves the overview, treasury, insights, holder, transaction and account
  fixtures render, including those error states. It does not prove that the API returns
  those payloads, that the API attaches UserData to the address, that login or token
  verification works, or that the staff, stats, prize-wallet, alert, payout, buy-limit
  or account endpoints return real data.
- **The RealUnit support visual spec answers the issue list and thread itself.**
  `e2e/realunit-support.spec.ts` fulfils the RealUnit support list, counts, activity, clerks,
  issue data and messages with synthetic fixtures. Auth is a synthetic unsigned Admin JWT.
  Staff bootstrap GETs and `GET /v2/user` are fulfilled, unmatched `GET /v1/**` returns `[]`,
  and other unmatched `/v1/**` methods return `{}`. A green run proves those list and issue
  fixtures render. It does not prove production auth, that the API returns those issues, or
  that sending a message reaches the server.
- **The RealUnit referral visual spec answers the relation list and promo list itself.**
  `e2e/realunit-referral.spec.ts` fulfils `GET /v1/realunit/referral/admin/relations` and
  `GET /v1/realunit/referral/promo` with synthetic fixtures: no promo codes for the referral
  list screenshots (that page does not show them) and for the empty promo list, one shareable
  campaign code on the landing-link, QR-dialog and inline-edit variants, plus one deactivated
  code on the activate and no-match variants, five codes covering every derived status on the overview, expired-hidden and
  deactivated-this-visit variants, two promo redemptions of one code (one credited with a
  guest name and a remittance reference, one not credited without a guest name) for the
  redemption search, the credited filter and the incomplete rows hidden by default, and one
  invite with a guest name per review status (Open, Approved, Rejected) on the referral list. It also answers the deactivate call
  (`PUT /v1/realunit/referral/promo/:id/deactivate`) with an empty success, plus a synthetic
  unsigned Admin JWT and staff/bootstrap GETs (`/v1/language`, `/v1/fiat`, `/v1/asset`,
  `/v1/bankAccount`, `/v1/country`, `/v1/setting/infoBanner`, `/v2/user`). The five-code
  variants fix the page clock to 2026-10-02 08:00 UTC with `page.clock.setFixedTime`, because
  the status (Active, Planned, Exhausted, Expired, Deactivated) is derived in the browser from
  the current time. The German variant also answers `GET /v1/language` and gives the user
  German, because the UI only switches language when that language is in the list.
  A green run proves the start-promo form, the empty promo list, the hint when the filters hide
  every code, the promo code list with status, both filters and both sort orders, a filled promo row with `realunit.app/promo/{code}` and QR overlay, an
  inline edit (Save/Cancel), a deactivated row with Activate after turning off the filter, a
  row deactivated in the visit that stays visible, the redeemed promo codes with the search
  over guest name, guest account and remittance info, the credited filter, the redemptions
  without a guest name hidden until "Show incomplete" is ticked, and the
  "x of y shown" counter, the invite-only
  referral table with and without the review filter, and the referral and promo redemption
  detail fixtures render, in English and with the German labels. It does not prove that the
  live promo or relations API returns those payloads, that login or token verification works,
  that create/deactivate succeed against the server, or how the status reads at another time of
  day than the fixed clock.
- **The RealUnit compliance visual spec answers the customer list, Dilisense actions, dossier, and insider mark itself.**
  `e2e/realunit-compliance.spec.ts` fulfils `GET /v1/realunit/compliance/customers`,
  `GET /v1/realunit/compliance/customers/:id`, `PUT /v1/realunit/compliance/customers/:id/insider`,
  `GET /v1/realunit/compliance/name-check`,
  `POST /v1/realunit/compliance/name-check` and `POST /v1/realunit/compliance/customers/:id/name-check`
  with synthetic fixtures (including `addresses`, name-check results, and `realUnitInsider`). Auth is a synthetic Admin
  JWT plus staff bootstrap GETs. Unmatched `GET /v1/**` calls return `[]` and other unmatched
  `/v1/**` methods return `{}`, so a green visual run does not prove which other staff endpoints the
  screen calls. A green run proves those fixtures render, including the Screen / Screen-all confirm
  dialogs, the insider confirm dialog, a marked-insider dossier, and a running-batch state. It does not prove that the API returns that payload, that login
  works, that the server filters to RealUnit wallets, or that `PUT …/insider` persists `realUnitInsider`.
- **The Log Validity visual spec answers the app shell itself.**
  `e2e/dashboard-financial-log-validity.spec.ts` uses a synthetic unsigned Admin JWT and fulfils
  `/v1/language`, `/v1/fiat`, `/v1/asset`, `/v1/bankAccount`, `/v1/country`,
  `/v1/setting/infoBanner` and `/v2/user` with synthetic fixtures, and answers
  `PUT /v1/log/financial/validity` with a synthetic `{ affected: 1, audited: 3 }`. The screen fetches
  nothing on mount; other `/v1/**` and `/v2/**` requests are passed through unchanged (`route.continue()`).
  A green run proves the form, the info-point confirmation and the success message render with the
  success-state clock frozen.
  It does not prove production auth, that the API accepts `reference` or `auditAll`, or that it returns
  `{ affected, audited }`.
- **The Kundengelder visual spec answers the extract and the bookings itself.**
  `e2e/dashboard-financial-kundengelder.spec.ts` uses a synthetic unsigned Admin JWT and fulfils
  `/v1/language`, `/v1/fiat`, `/v1/asset`, `/v1/bankAccount`, `/v1/country`, `/v1/setting/infoBanner`,
  `/v2/user`, `GET /v1/bank`, the year extract and the bookings list with fictional fixtures.
  Other `/v1/**` and `/v2/**` calls return `{}`. A green run proves the T-account, an empty bank,
  a mismatched next-year opening, the booked comparison and the bookings page render those fixtures.
  It does not prove production auth, that the API returns this extract, or that the figures are booked
  balances. The clock is pinned, so a green run does not prove that the year list rolls over. The
  bookings capture expands the page with injected CSS and stitches viewport slices, so a green run
  does not prove native scrolling or an unmodified screenshot.
- **Two specs force KYC completeness.** Both collection-invoice cases — the refused QR and the
  stored-detail error — override `**/v2/user` so that `kyc.dataComplete` is read as `true`, because
  the invoice button is gated on that value. A green run therefore proves nothing about the gate for
  a customer who has not completed KYC; a unit test covers that path.
- **The same two specs fabricate the invoice rejection.** Each answers
  `**/v1/buy/paymentInfos/*/invoice*` with a `400` and the fixed
  `CollectionAccountInvoicePersonalIbanMissing` error token, so a green run proves that the screen
  displays that token, not that the API emits it for this request. A unit test against the message
  mapping pins the token contract instead.
- **The staff ticket customer-note visual spec answers the issue payload itself.**
  `e2e/support-ticket-note.spec.ts` fulfils `GET /v1/support/issue/:id/data`, the message thread
  for that uid, clerks, clerk mapping and activity with synthetic fixtures. A green run proves
  that the Kundennotiz composer renders those fixtures. It does not prove that the API returns
  that issue or that `createSupportNote` persists a note.
- **The staff ticket KYC-file-transfer visual spec answers the issue payload itself.**
  `e2e/support-kyc-file-transfer.spec.ts` answers the issue payload, messages, clerks, clerk mapping
  and activity with fixtures. A green run proves those fixtures render. It does not prove that the
  API returns them or that PUT kycFile persists.
- **The staff message-origin visual spec answers boot and the issue thread itself.**
  `e2e/support-message-origin.spec.ts` fulfils the staff session's user, languages and the issue,
  messages, clerks, clerk mapping and activity with fixtures, including one customer mail tag, one
  in-app tag, a customer message without an origin and a staff reply that carries an origin. A green
  run proves the messages panel renders those tags. It does not prove that the API stores `origin`,
  that a mail opened the ticket, or that the session is a real staff login.
- **The staff limit-request visual spec answers the issue payload itself.**
  `e2e/support-limit-request.spec.ts` fulfils the issue data with and without `fundOriginText`, the
  messages, clerks, clerk mapping and activity with fixtures. A green run proves that the limit-request
  panel renders those fixtures with and without the source-of-funds row. It does not prove that the API
  stores, decrypts or returns `fundOriginText`; the test in
  `e2e-stack/specs/support-dashboard.spec.ts` proves that.
- **The support-issue receiver-IBAN spec pins KYC level and account mail on GET /v2/user.**
  `e2e/support-issue-receiver-iban.spec.ts` rewrites that response so `kyc.level` is high enough for
  the screen guard and `mail` is present if the cached wallet session has none. A green visual run
  therefore does not prove the mail-first redirect, nor that the account actually has mail or a
  completed KYC level.
- **The stubbed list Open-invoice and Open-receipt tests fulfill the document routes.**
  In `e2e-stack/specs/transactions.spec.ts`, the two cases that set
  `page.route('**/v1/transaction/*/invoice')` — the delayed-tab case and the error-message case —
  and the two Open-receipt cases that set `page.route('**/v1/transaction/*/receipt*')` answer
  those routes with a static PDF body or a `400` with a fixed message. A green run proves that
  the click reserves a tab and surfaces the error, not that the API can build an invoice or
  receipt from SQL-seeded `buy_crypto`.
- **The waiting-for-payment Open-invoice case hits the real invoice route.**
  The same spec file lets `PUT /v1/transaction/:uid/invoice` run against the API for a CHF
  `WaitingForPayment` buy and asserts HTTP 200 plus a `%PDF` prefix, and that the quote
  remittance matches the buy route reference. A green run does not prove the PDF content
  (streams are compressed and unread), live prices (the quote uses the `price_rule` backfill
  from `global.setup.ts`), or EUR. It also does not prove that the IBAN in the document is the
  one the quote showed: every quote in this environment uses the collection account and stores
  no bank selection.
- **The transaction-invoice visual spec answers the waiting buy row itself.**
  `e2e/transaction-invoice.spec.ts` fulfils `GET /v1/transaction/detail` with a synthetic CHF
  `WaitingForPayment` buy, signs in with an unsigned client-side session token, and answers
  `/v2/user`, `/v1/transaction/unassigned` and the startup lookups itself. A green run proves that
  this row shows Open invoice and hides Open receipt. It does not prove login or session handling,
  that the API returns the row, or that it can build its invoice; the full-stack case covers the
  real invoice route.
- **The compliance-review KYC-status spec answers staff identity itself.**
  `e2e/compliance-review-kyc-status.spec.ts` fulfils `GET /v1/support/issue/clerk` with
  `{ clerk }` and, as fallback, `GET /v1/support/{id}` for any account other than the customer
  fixture with `{ userData: { verifiedName } }`. A green run proves that the review screen
  accepts that name, not that the API returns the logged-in staff member's `verifiedName`.
  The spec covers the resettable AML-reset path, the pending ManualCheck decision form
  in the Fail (AmlReason visible, priceDefinitionAllowedDate hidden) and Reset (hint, both
  hidden) variants, and three synthetic transaction comments, `ScorechainHighRisk`,
  `ScorechainUnavailable` and `NameCheckUnavailable`, that are placeholder hold tokens
  rather than a screening result. A green run does not prove live API payloads, that
  Scorechain or the API produced those holds, that the API wrote `NameCheckUnavailable`,
  or that a name-check refresh failed, or that the Editor label is the logged-in staff
  member's `verifiedName`. The spec also answers a synthetic level-0 account without an account
  type that has a `Statutes` step in `ManualReview`. A green run proves that the Statuten tab and
  its decision render for that account. It does not prove that the API returns such an account or
  that the decision is saved; the full-stack case covers the save.
- **The call-queue outcome spec answers staff identity and the dossier itself.**
  `e2e/compliance-call-queue-outcome.spec.ts` fulfils `GET /v1/support/issue/clerk` with
  `{ clerk }`, a differently named fallback on `GET /v1/support/{staffAccount}`,
  `GET /v1/support/{customer}` with a synthetic dossier, empty lookup lists, a null
  info banner, and `GET /v2/user` with a synthetic account. A green run proves the
  outcome form renders that clerk name as a read-only signature and does not request a
  clerks list, not that the API returns those records or the logged-in staff member's
  `verifiedName`. The session is a synthetic unsigned JWT, so a green run also does not
  prove login or token verification.
- **The call-queue list spec answers the queue items itself.**
  `e2e/compliance-call-queue-list.spec.ts` fulfils
  `GET /v1/support/call-queues/{queue}/items` for ManualCheckPhone,
  ManualCheckIpCountryPhone and UnavailableSuspicious with synthetic items
  that include `phoneCallTimes` `H9To10;H10To11`, and fulfils the Callback
  queue with one fixture row and `/v2/user`. Empty lists cover `/v1/language`, `/v1/fiat`, `/v1/asset`,
  `/v1/bankAccount` and `/v1/country`, plus a null info banner. The session
  is a synthetic unsigned JWT. A green run proves the Phone Call Times column
  appears only for ManualCheckPhone and ManualCheckIpCountryPhone and stays
  hidden for UnavailableSuspicious even when the item carries a value, and
  that the Callback list shows Country, Status, Marked and Deadline, including
  a past deadline in red. It does not prove that the API returns those rows,
  that the mark date is the account's phone-call date, or that login and
  token verification succeed.
- **The compliance tag-list spec answers the tag list itself.**
  `e2e/compliance-tag-list.spec.ts` fulfils `GET /v1/support/tag/example` with
  synthetic fixtures: four customer rows, an empty `userDatas`, and a 404 with
  the message `Tag not found`. It answers the pending-reviews,
  pending-transactions and call-queues lists with empty arrays, fulfils
  `/v2/user`, returns empty lists for `/v1/language`, `/v1/fiat`, `/v1/asset`,
  `/v1/bankAccount` and `/v1/country` plus a null info banner, and answers every
  other `/v1` or `/v2` request with 501. The session is a synthetic unsigned
  JWT. A green run proves that `/compliance?tag=…` renders the tagged customers
  in the existing customer table, the empty state and the not-found error. It
  does not prove that the API returns those rows for a tag, that a tag setting
  exists, or that login and token verification succeed.
- **Full-stack compliance specs SQL-seed a call-queue case.**
  `e2e-stack/specs/fixtures/factories.ts` (`createCallQueueEntry`) inserts a pending `buy_crypto`
  with AML reason `ManualCheckPhone` and SQL-writes `user_data.phoneCallStatus`,
  `phoneCallStatusDate` (where the column exists) and `phoneCallCheckDate`. A green run does
  **not** prove that the AML pipeline parks a transaction in the Callback queue or that a clerk's
  Unavailable outcome stamps the mark date through the product path.
- **Full-stack guest assign/refund specs SQL-write `transaction.actionSecretHash`.**
  `e2e-stack/specs/transactions.spec.ts` (`seedActionSecret`) updates the hash directly. A green run
  does **not** prove that the mail/API path creates, hashes, or delivers the action secret.
- **Full-stack buy specs SQL-write `user_data.depositLimit`.**
  `e2e-stack/specs/buy.spec.ts` (`openQuoteCapableBuy` and older quote cases) updates the limit
  directly so `LIMIT_EXCEEDED` does not hide payment info. A green run does **not** prove that a
  customer reaches that limit through the product path.
- **The full-stack wallet-AML spec SQL-inserts a wallet and moves the customer onto it.**
  `e2e-stack/specs/sell-wallet-aml.spec.ts` (RULE_11 and wallet-exception cases) inserts a
  `wallet` row with fixed `amlRules` / `exceptAmlRules`, then sets `user.walletId` and `user.ipCountry`
  directly, because no partner onboarding or IP geolocation runs in the stack. A green run does **not**
  prove that a real customer is assigned that wallet or that the API derives that IP country.
- **The full-stack wallet-AML spec accepts the paused answer while sell is off.**
  `e2e-stack/specs/sell-wallet-aml.spec.ts` runs against `DISABLED_PROCESSES=*` from
  `e2e-stack/env/api.env`, so the sell quote answers `TRANSACTIONS_PAUSED` and each case asserts that answer
  on screen instead of the wallet-AML outcome. A green run does **not** prove the wallet-AML refusal or
  acceptance while sell is off; it proves them only while sell is on.
- **The full-stack wallet-AML spec has no swap case.** With the API's swap product off in its loc
  environment the swap routes are not mounted (`PUT /v1/swap/paymentInfos` answers 404), so the swap screen
  gets no quote. A green run does **not** prove anything about the wallet-AML rules on swaps.
- **The full-stack provisional buy spec SQL-clears `user_data.tradeApprovalDate`.**
  `e2e-stack/specs/buy.spec.ts` (`/buy and /buy/info: provisional approval …`) sets the date to `NULL`
  after creating the customer, because the factory may leave one behind. A green run does **not** prove
  that a real KYC-30 customer of that wallet reaches the buy screen without a trade approval.
- **Full-stack continue-race specs SQL-write `user_data.tradeApprovalDate`.**
  `e2e-stack/specs/kyc-continue-race.spec.ts` sets the date so recommendation is skipped. A green
  run does **not** prove that a customer obtains trade approval through the product path.
- **Full-stack continue-race specs SQL-insert STRICT `TfaLog` rows.**
  `e2e-stack/specs/kyc-continue-race.spec.ts` inserts `kyc_log` type `TfaLog` with comment
  `Strict (App)` so `continue()` does not 403 after FinancialData starts. A green run does
  **not** prove the mail/app 2FA enrolment or verification path.
- **Full-stack continue-race specs recreate `kyc_step` unique index `NULLS NOT DISTINCT`.**
  `e2e-stack/specs/kyc-continue-race.spec.ts` drops the synchronize unique index on
  `(userDataId, name, type, sequenceNumber)` and creates `IDX_3a1150791476264753a67212a1`
  with `NULLS NOT DISTINCT`, matching production. A green run does **not** prove the
  migration chain applied that index.
- **Full-stack continue-race specs SQL-complete KYC steps.**
  `e2e-stack/specs/kyc-continue-race.spec.ts` upserts ContactData, PersonalData, NationalityData
  and Ident (`SumsubAuto`) to `Completed`. A green run does **not** prove those steps complete
  through the product path, including live ident.
- **Full-stack compliance specs SQL-insert a pending Recommendation step.**
  `e2e-stack/specs/compliance.spec.ts` inserts a `kyc_step` named `Recommendation` in status
  `InternalReview`, on a synthetic account at KYC level 30 with completed personal data. A green run
  does **not** prove that the customer KYC flow creates that open step.
- **Full-stack compliance case specs SQL-insert a Statutes step on an account without account type.**
  `e2e-stack/specs/compliance-cases.spec.ts` inserts a `kyc_step` named `Statutes` in status
  `ManualReview` on a synthetic account at KYC level 0 whose `accountType` stays null. A green run
  does **not** prove how such a step reaches review; the customer KYC flow only offers `Statutes` to
  association accounts.
- **The onboarding-fee full-stack cases write the ref, the fee setting and the starting status
  themselves.** `e2e-stack/specs/compliance-cases.spec.ts` (`/compliance/user/:id sets and removes an
onboarding fee …` and `… shows the blocked-address error …`) give the key-account user a `ref` and
  write the `onboardingFeeUsedRef` setting row by SQL, restoring the setting afterwards, and set the
  customer's status to `NA` or `Blocked` by SQL. A green run does not prove the production migration
  that seeds the setting, how a key-account user gets its ref, or how a customer reaches that status.
- **The risk-status full-stack cases take the clerk's verified name and level from the harness.**
  `e2e-stack/specs/compliance-cases.spec.ts` (`/compliance/user/:id sets a risk status …` and
  `… keeps Save disabled without a reason …`) log in through `loginAs` and `ensureStaffReady`, which
  write `user_data.verifiedName` and raise the staff `kycLevel` by SQL. A green run proves that the
  API records that stored name with the change, not that an identification sets it.
- **The risk-status error case makes the database refuse the write itself.**
  `e2e-stack/specs/compliance-cases.spec.ts` (`/compliance/user/:id shows the error when the API cannot store
the risk status`) adds a `CHECK` constraint on `user_data` by SQL that refuses one value for that one account,
  and drops it afterwards. A green run proves how the API and the form behave when the database refuses the
  write, not which real database failure would cause that in production.
- **The partner onboarding-fee full-stack cases write the role, the ref and the starting status
  themselves.** `e2e-stack/specs/partner.spec.ts` elevates the Partner wallet's role by SQL (via
  `loginAs`), writes the partner's `ref` by SQL and restores it afterwards, sets the customer's status
  to `NA` by SQL, and for the conflict case writes the customer's `usedRef` to another ref by SQL. A
  green run does not prove how an account becomes a Partner, how a partner gets its ref, or how a
  customer becomes attributed to another referrer.
- **The settings verification-call visual spec answers GET /v2/user itself.**
  `e2e/settings-verification-call.spec.ts` fulfils `/v2/user` with three synthetic kyc payloads
  (`phoneCallAccepted` unset / true / false) and fulfils the Settings bootstrap GETs
  (`/v1/language`, `/v1/fiat`, `/v1/asset`, `/v1/bankAccount`, `/v1/country`,
  `/v1/setting/infoBanner`) plus user PUT/PATCH. Unmatched `/v1/**` and `/v2/**` calls
  get `501`. The session is a synthetic unsigned JWT, so a green run does not prove
  login or token verification. A green run proves those three consent states render.
  It does not prove that a live account has those kyc fields, that those bootstrap
  endpoints return real data, that `updateCallSettings` persists, or that
  Completed/Failed hide the section.
- **The settings Danger Zone visual spec answers GET /v2/user itself.**
  `e2e/settings-danger-zone.spec.ts` fulfils `/v2/user` with a synthetic kyc payload
  (`phoneCallStatus: 'Completed'`) and fulfils the Settings bootstrap GETs
  (`/v1/language`, `/v1/fiat`, `/v1/asset`, `/v1/bankAccount`, `/v1/country`,
  `/v1/setting/infoBanner`) plus user PUT/PATCH. Unmatched `/v1/**` and `/v2/**` calls
  get `501`. The session is a synthetic unsigned JWT, so a green run does not prove
  login or token verification. A green run proves the collapsed, expanded and overlay
  fixtures render. It does not prove that those bootstrap endpoints return real data,
  that a live account has that kyc status, or that `deleteAccount` persists against
  the API.
- **The info-banner layout visual spec answers GET /v1/setting/infoBanner itself.**
  `e2e/info-banner-layout.spec.ts` fulfils `/v1/setting/infoBanner` with synthetic
  multilingual copy, fulfils `GET /v1/support/issue` with one fixture ticket, and
  fulfils the Support bootstrap GETs (`/v1/language`, `/v1/fiat`, `/v1/asset`,
  `/v1/bankAccount`, `/v1/country`, `/v2/user`). Unmatched `/v1/**` and `/v2/**`
  calls get `501`. The session is a synthetic unsigned JWT, so a green run does not
  prove login or token verification. A green run proves the banner renders below
  the header on `/support` and `/support/tickets`. It does not prove that the API
  returns that banner copy, that those bootstrap endpoints return real data, or
  that a live account has that ticket.
- **The service-notice visual spec answers the bootstrap GETs and GET /v2/user itself.**
  `e2e/service-notice-banner.spec.ts` fulfils `/v2/user` with a synthetic user and
  fulfils the bootstrap GETs (`/v1/language`, `/v1/fiat`, `/v1/asset`,
  `/v1/bankAccount`, `/v1/country`, `/v1/setting/infoBanner`). Unmatched `/v1/**`
  and `/v2/**` calls get `501`. The session is a synthetic unsigned JWT, so a green
  run does not prove login or token verification. A green run proves the slim notice
  renders on `/sell` and `/swap` and no notice renders on `/buy`. It does not prove that
  those bootstrap endpoints return real data or that the Buy, Sell and Swap forms work; the
  real test is the service-notice test in `e2e-stack/specs/sell-swap.spec.ts`.
- **The deleted-address visual spec answers GET /v2/user and PUT /v2/user/reactivate itself.**
  `e2e/deleted-address.spec.ts` fulfils `/v2/user` with a synthetic user whose active address
  has status `Deleted`, fulfils `PUT /v2/user/reactivate` with a synthetic 400 error, and
  fulfils the bootstrap GETs (`/v1/language`, `/v1/fiat`, `/v1/asset`, `/v1/bankAccount`,
  `/v1/country`, `/v1/setting/infoBanner`). Unmatched `/v1/**` and `/v2/**` calls get `501`.
  The session is a synthetic unsigned JWT, so a green run does not prove login or token
  verification. A green run proves the notice replaces the app and shows the API error after
  a failed activation. It does not prove that the API marks a deleted address that way, that
  it rejects or accepts a real reactivation, or that a successful activation opens the app.
- **The command-line signature format visual spec answers GET /v1/auth/signMessage itself.**
  `e2e/cli-signature-format.spec.ts` fulfils `/v1/auth/signMessage` with a fixed sign message
  and fulfils the bootstrap GETs (`/v1/language`, `/v1/fiat`, `/v1/asset`, `/v1/bankAccount`,
  `/v1/country`, `/v1/setting/infoBanner`). Unmatched `/v1/**` and `/v2/**` calls get `501`.
  A green run proves the signature field shows its format error and keeps Login disabled for a
  pasted armored block. It does not prove the API's sign message or signature check; the login
  with a malformed and with a whitespace-padded signature runs in `e2e-stack/specs/auth.spec.ts`.
- **Full-stack screen-sync regressions hold delivery of real API responses.**
  `e2e-stack/specs/screen-sync.spec.ts` intercepts `GET /v2/kyc/file/:id` and
  `GET /v1/dashboard/financial/latest`, calls `route.fetch()` against the real API, then
  delays `route.fulfill` of that same response body (no invented success payload). A green
  run does **not** prove the API's natural latency or that production clients never race; it
  only proves the wait barriers refuse to conclude while that held real response is still
  undelivered, and that hub re-navigation does not abort it.
- **The 2FA merged-account redirect spec answers the 2FA setup call and its post-redirect
  follow-up itself.** `e2e/tfa-merged-redirect.spec.ts` fulfils `POST /v2/kyc/2fa` with a
  synthetic 401 merged-account error (`switchToCode`) and fulfils `GET /v2/kyc` — the call the
  `/kyc` screen makes on its own after the redirect — with a synthetic success payload, plus
  the bootstrap GETs (`/v1/language`, `/v1/fiat`, `/v1/asset`, `/v1/bankAccount`, `/v1/country`,
  `/v1/setting/infoBanner`) and `POST /v1/log/clientError`. Unmatched `/v1/**` and `/v2/**`
  calls get `501`. This spec does not seed an auth token — the `/2fa` merged-account path is
  reached via the URL `code` param without a login, so there is no session to assert cleared,
  unlike the link spec below. The initial navigation also carries a synthetic
  `kyc-redirect=https://evil.example` param; the app itself (not mocked) runs the real
  `navigation.hook.ts` merge/strip logic, and the spec asserts that param is absent from the
  post-redirect URL. A green run proves the `/kyc` screen renders without a `pageerror` on the
  synthetic follow-up payload, and that the `kyc-redirect` param is genuinely stripped by the
  real code (not just requested — `src/__tests__/merged-account.hook.test.tsx` only proves
  `handleMergedError` calls `navigate` with `clearParams: ['kyc-redirect']` against a mocked
  `useNavigation`, not that the real merge logic honors it). It does not prove that the API
  ever returns a 401 with `switchToCode` for a merged account, that a real 2FA setup call has
  that shape, or that the `/kyc` screen's own follow-up call succeeds against a real backend.
  `src/__tests__/tfa.screen.test.tsx` pins that `handleMergedError` is tried first at every
  catch site instead.
- **The link merged-account redirect spec answers GET /v2/user and GET /v2/kyc itself.**
  `e2e/link-merged-redirect.spec.ts` seeds a synthetic unsigned JWT into
  `localStorage['dfx.authenticationToken']` and fulfils `GET /v2/user` with a synthetic account
  whose `kyc.hash` matches the merged (slave) account. It fulfils `GET /v2/kyc` with a
  synthetic 401 merged-account error on the first call and a synthetic success payload on the
  follow-up call after the redirect (the `/kyc` screen's own call), plus the bootstrap GETs
  (`/v1/language`, `/v1/fiat`, `/v1/asset`, `/v1/bankAccount`, `/v1/country`,
  `/v1/setting/infoBanner`) and `POST /v1/log/clientError`. Unmatched `/v1/**` and `/v2/**`
  calls get `501`. The initial navigation also carries a synthetic
  `kyc-redirect=https://evil.example` param; the app itself (not mocked) runs the real
  `navigation.hook.ts` merge/strip logic, and the spec asserts that param is absent from the
  post-redirect URL. It also proves the synthetic auth token is cleared from `localStorage`
  after the redirect — not that any server-side session or token is actually invalidated,
  since the backend is entirely mocked. A green run proves the `/kyc` screen renders without a
  `pageerror` on the synthetic follow-up payload, and that the `kyc-redirect` param is
  genuinely stripped by the
  real code (not just requested — `src/__tests__/merged-account.hook.test.tsx` only proves
  `handleMergedError` calls `navigate` with `clearParams: ['kyc-redirect']` against a mocked
  `useNavigation`, not that the real merge logic honors it). It does not prove that login or
  token verification works, that the API returns that user/`kyc.hash` pairing, or that a
  merged account really produces a 401 with `switchToCode`.
  `src/__tests__/link.screen.test.tsx` pins that `handleMergedError` is tried first at every
  catch site instead.
- **The known-rejections visual spec answers the rejections itself.**
  `e2e/known-rejections.spec.ts` fulfils `GET /v2/kyc/PersonalData` and `GET /v2/kyc` with a
  synthetic step session, `PUT` on that session with a synthetic 400 character-set message,
  `GET /v1/transaction/single` with a synthetic failed buy, the guest refund `GET`/`PUT` under
  `/v1/transaction/uid/:uid/:secret/refund` with synthetic refund details and a synthetic 400
  `iban BIC not allowed`, the external IP geolocation lookup with a synthetic Swiss answer (the KYC
  form prefills its country from it), plus the bootstrap GETs (`/v1/language`,
  `/v1/fiat`, `/v1/asset`, `/v1/bankAccount`, `/v1/country`, `/v1/setting/infoBanner`) and
  `POST /v1/log/clientError`. Unmatched `/v1/**` and `/v2/**` calls get `501`. A green run proves
  that the field error, the character-set hint and the blocked-bank hint render for those
  messages. It does not prove that the API still words its rejections that way, that it rejects
  exactly the characters the form rejects, or that a real bank is blocked; the message sentences
  and the character set (every code point up to U+024F) are pinned in unit tests instead. Nor does it
  prove that the external geolocation service is reachable, still answers in that shape, or maps
  a real client IP to the expected country. It also does not prove that the KYC step, transaction,
  refund and bootstrap endpoints return these payloads for a real account, or that client-error
  reports reach the real endpoint.
- **The Open CryptoPay unit test replaces `url()` and the API config with fixed hosts.**
  `src/__tests__/open-crypto-pay.test.ts` mocks `Api` as `https://api.dfx.swiss` / `v1` and
  swaps `url` from `src/util/utils` for a copy whose `base` falls back to the placeholder
  `https://app.dfx.swiss` instead of `REACT_APP_PUBLIC_URL`, without the real function's
  absolute-path branch. A green run proves only substrings, each in a separate test: the result
  contains `lightning=LNURL` and `pl`, and the decoded LNURL contains `lnurlp/<id>` and
  `https://api.dfx.swiss/v1`; one more test proves that two different ids give different
  results. It does not prove the exact `pl?lightning=…` link or the exact
  decoded API URL, which host the real `url()` or `Api` resolve to in any deployment, or that
  the real `url()` treats those arguments identically; no assertion pins the outer host.
- **The SPAR location pictures answer the OpenCryptoPay place API themselves.**
  `e2e/spar-place-map.spec.ts` fulfils `https://api.opencryptopay.io/map/places?shopName=SPAR&country=CH`
  with the published SPAR shop locations, plus one Liechtenstein SPAR pin and one
  Volg pin that the page must not plot. Names and coordinates are that published list.
  Country is CH on the fixture because the page draws a pin only when country is CH.
  The map does not list shop names. Any other place URL, including `/map/filters`, is answered
  with HTTP 500. It also fulfils `**/v1/**`, `**/v2/**` and `**/paymentLink/**` so `/pl?merchant=SPAR`
  renders without a live DFX API; the merchant info call gets a SPAR merchant with no payment
  methods. Map tiles are the live OpenFreeMap Liberty style, not a fixture.
  A green run proves those fixtures render on the whole payment page, with no country or shop
  control and no shop-name list: a map of the Swiss pins, an open shop, an empty list, the load
  error, and the loading state before the places arrive. It does not prove that the
  place API still returns this set, that those rows are stored with country CH, or that the
  DFX payment-link API returns the stubbed merchant.
- **The merchant page pictures answer the merchant info call themselves.**
  `e2e/merchant-page.spec.ts` fulfils `GET /v1/paymentLink/merchant?route=shop-route` with a
  synthetic merchant (recipient and three payment methods) or with a `404`,
  `GET /v1/paymentLink/walletApp` with four synthetic wallets whose icons are inline SVGs, every
  other `**/paymentLink/**` call with an empty list, and `**/v1/**` and `**/v2/**` so the page
  renders without a live DFX API. A green run proves that the whole merchant page renders that
  merchant info with its wallet groups, that a selected wallet shows only the payment methods it
  supports, both when chosen in the grid and when opened directly with `wallet-id` while the
  wallet list answers late, that the error text appears, and that the page requests no
  `/paymentLink/payment`. It does not prove that the API returns this merchant info or this wallet list, or answers an
  unknown route with this `404`.
- **The payment-link MetaMask picture answers the payment request and the wallet itself.**
  `e2e/payment-link-metamask.spec.ts` opens `/pl` with invoice parameters and fulfils
  `GET /v1/paymentLink/payment` with a synthetic quoted pay request (one Ethereum transfer amount),
  `GET /v1/paymentLink/standard` with an empty list, the callback with `409`, and the bootstrap
  `**/v1/**` and `**/v2/**` calls; it leaves `GET /v1/lnurlp/wait/<payment>` open. A user agent that
  names MetaMask makes the app treat the page as the MetaMask in-app browser, and an in-page EIP-1193
  object rejects `eth_requestAccounts` with code -32603 and `Already processing unlock. Please wait.`.
  A green run proves that the payment screen then shows the hint to confirm or close the pending
  request instead of that text. It does not prove that the API returns this pay request, that a real
  MetaMask in-app browser sends exactly this rejection, or that a payment completes. The full-stack
  harness cannot cover this path: it cannot build a quoted pay request, because the quote needs live
  transfer amounts that are not available under `ENVIRONMENT=loc`.
- **The payment-link stack spec answers the place API itself for the SPAR merchant.**
  `e2e-stack/specs/payment-links.spec.ts` fulfils that same SPAR-Switzerland place URL with one
  synthetic SPAR shop, and answers every other place URL with HTTP 500, while the rest of that
  spec talks to the local API. It also fulfils `https://tiles.openfreemap.org/**` with an empty
  map style, because this harness never reaches that host and an open style request keeps the
  network from going idle. It also answers `GET /v1/paymentLink/merchant?route=SPAR` with a SPAR
  merchant that has no payment methods, because the harness seeds no SPAR route. A green run
  proves the locations block appears for `merchant=SPAR`,
  the request is `shopName=SPAR` and `country=CH`, and the page shows neither a country control,
  a shop control, the load error, nor the empty sentence. It does not prove that the place API
  returns that shop, that the API answers the merchant info for a SPAR route, that OpenFreeMap
  serves tiles, or that a real map draws the pin.
- **The SPAR place-map unit test replaces fetch and MapLibre.**
  `src/__tests__/spar-place-map.test.tsx` stubs `global.fetch` for the place API and replaces
  `maplibre-gl` with a fake map that records markers. A green run proves the component asks only
  for `shopName=SPAR&country=CH`, never for `/map/filters` or an unfiltered place list, drops pins
  that are not SPAR in CH or are out of range, and shows the empty and error states with no
  country or shop control. It does not prove that a real map draws those pins, that OpenFreeMap
  serves tiles, or that the place API returns that JSON.
- **The payment-link screen unit test replaces the SDK, the context, wallets and the SPAR map.**
  `src/__tests__/payment-link.screen.test.tsx` replaces `useApi` with `mockCall`, the asset
  catalog with `useAssetContext`, the payment-link context and the wallet hook with in-memory
  objects, wallet deeplinks with `mockGetDeeplinkByWalletId`, and `SparPlaceMap` with an empty
  marker. Styled controls, the QR code and `window.open` are fakes too. A green run proves those
  objects render the quote rows, the payment methods, the wallet block, the SPAR locations
  block and the merchant page from merchant info. It does not prove that the DFX payment-link API
  returns those payloads, that a wallet deeplink opens, that the asset catalog matches production,
  or that the SPAR map draws the place list.
- **The payment-link context unit test replaces the SDK, the network and the wallet.**
  `src/__tests__/payment-link.context.test.tsx` replaces `getPaymentMerchantInfo` and
  `assignPaymentLink` with mocks, answers `fetchJson` and `fetch` from in-memory routes, and fakes
  the session store, polling, the countdown, navigation, the LNURL and EVM helpers and MetaMask. A
  green run proves how the provider reacts to those answers: the merchant page reads merchant info
  and creates no payment, invoice and lightning links load and poll, identifiers and MetaMask
  payments are requested as built, and a MetaMask account request or payment the wallet rejects with
  `Already processing … Please wait.` leaves the pending-request key as the MetaMask error. It does not
  prove that the API returns merchant info for a route or answers `404` and `400` as assumed, that the
  payment endpoints return those payloads, that a real MetaMask signs and sends the transaction, or that it
  rejects a pending request with that text.
- **The rejected address switch visual spec answers the user and the switch itself.**
  `e2e/connect-address-switch.spec.ts` authenticates with a synthetic unsigned JWT without an address, fulfils
  `GET /v2/user` with one synthetic address (and with none in the custody case) and the bootstrap GETs,
  answers `POST /v1/user/change` with a 403 (and with a 500 in one case), answers `POST /v1/custody` with a
  500 without message in another, and fulfils the client-error POST. Unmatched `/v1/**` and `/v2/**` calls get
  `501`. A green run proves that the screen sends the rejected switch once, shows the translated rejection
  sentence above the selection without the API's text, and sends exactly one new attempt when the address is
  selected again; the intercepted client-error route observes one `KnownRejection` POST, including when the
  same rejection is shown again after re-selection, because the reporter drops an identical report within
  60 s; a server error on the switch keeps the generic hint and a custody failure without a message shows the
  generic hint with "Unknown error" instead of an endless spinner. It does not prove when or why the API
  rejects the switch, or that login or token verification works, or that the real client-error endpoint
  receives or stores the report. It does not prove that the screen itself reports only once: it reports each
  displayed rejection, which the unit test covers. It does not prove that the real API answers the switch with
  a 500 or rejects the custody sign-up with an empty message. It does not prove that a live account has that
  address (or none), or that the bootstrap endpoints return real data.
- **The rejected address switch full-stack case deactivates the account with SQL.** In
  `e2e-stack/specs/auth.spec.ts`, the `/connect` mail-session case sets `user_data.status` to `Deactivated`
  after the mail login, so the API rejects the automatic address switch. A green run proves that the screen
  sends the rejected switch once and shows the translated rejection sentence instead of the API's text. It
  does not prove how an account reaches that state in production or any other reason the API may reject the
  switch.
- **The deleted-address reactivation full-stack case marks the address deleted with SQL.** In
  `e2e-stack/specs/auth.spec.ts`, the command-line login on `/login` sets `"user".status` to `Deleted` after
  a signature login has created the row, then the browser signs in and clicks Activate address. A green run
  proves that `PUT /v2/user/reactivate` reopens that address and the app continues to `/buy`. It does not
  prove how an address reaches that state in production.
- **The address-switch unit test runs the SDK user context against replaced HTTP and session hooks.**
  `src/__tests__/address-switch.test.tsx` transpiles `UserContextProvider` from the installed
  `@dfx.swiss/react` build and wires it to hand-written `useUser` and `useApiSession` replacements, and
  `useApi` (the custody sign-up call) is replaced too; the dropdown, `ErrorHint`, labels, the app contexts and
  the client-error reporter are stubbed as well. A green run proves, against that harness, that
  `ConnectAddress` and `AccountScreen` each send a switch only once and that `ConnectAddress` shows the
  translated rejection sentence instead of the API's text for 400/401/403/404 (for 401 the app's SDK also
  clears the session, which this harness does not model), keeps the generic hint for other failures, reports
  each displayed rejection once to the client-error reporter (so again after re-selection), and retries only
  after re-selection. It does not prove the real session or token handling, the rendered dropdown, the real
  `ErrorHint`, labels and app contexts (translation returns the key), that the API returns those statuses,
  that the custody sign-up call reaches the real API, or the reporter's 60 s deduplication of identical
  reports, since the reporter is replaced.
- **The home-screen unit test replaces the SDK, ConnectWrapper, the app contexts, the feature tree and
  navigation.** `src/__tests__/home-screen.test.tsx` stubs `@dfx.swiss/react`, `ConnectWrapper`,
  app-handling, settings, wallet and layout contexts, the feature tree and `useNavigation`, and drives
  `HomeScreen` through a memory router. The app-handling fake stores redirect changes in memory and records
  setter calls. The test checks with jsdom sessionStorage that KYC entries remain after a return. A green run
  proves, against that harness, the login targets and that the fake redirect slot is left unchanged. It does not prove
  a real login, a real SDK session or user change, the real app-handling context, or the real interplay with the
  app router and navigation.
- **The deleted-address unit test replaces the SDK user and session hooks and the app contexts.**
  `src/__tests__/deleted-address.test.tsx` renders `DeletedAddressGate` against a memory router with
  `useUserContext`, `useApiSession`, settings, app-handling and the service enum replaced. A green run proves the hold, the
  notice, post-activation navigation and widget close calls against that harness; jsdom sessionStorage checks
  that the KYC entries remain after a return. The app-handling fake stores redirect changes in memory and records
  setter and close calls. It does not prove a real reactivation, a real
  SDK user load, delivery of a widget close event, the real app-handling context, or the real interplay with the
  app router and navigation.
- **The CLI wallet unit test replaces SDK hooks, app contexts, styled controls and LNURL encoding.**
  `src/__tests__/connect-cli.test.tsx` renders the real `ConnectBase` with in-memory session and wallet
  hooks, controlled form elements and a stubbed sign-message service and encoder. A green run does not
  prove a real CLI login, API session, wallet signature, LNURL encoding or production control rendering.
- **The connect-mail redirect unit test replaces the SDK auth hooks, the app contexts and navigation.**
  `src/__tests__/connect-mail-redirect.test.tsx` stubs `useAuth`, session and wallet contexts, app-handling
  and `useNavigation`, and asserts the `redirectUri` passed into `signInWithMail`. A green run does not
  prove a real mail login, that the API accepts that `redirectUri`, or a real SDK session change.
- **The KYC wallet-mismatch visual spec answers the user endpoint itself.**
  `e2e/kyc-wallet-mismatch.spec.ts` fulfils the user routes with a built user and the placeholder
  address `0x1111111111111111111111111111111111111111`, and does not call a live API. A green run
  proves the mismatch hint renders for that fixture. It does not prove that the hint comes from a
  real session or a real API response.
- **The account screen coverage test replaces the SDK and the component library.**
  `src/__tests__/account-screen-coverage.test.tsx` replaces the user, auth, session, API and
  transaction hooks with in-memory stubs, and replaces the styled components with passthrough
  markup. A green run proves those stubs exercise the profile, address, referral and PDF branches.
  It does not prove a live user, a live transaction list, a real address switch, or that the
  production components render.
- **The support-issue screen panels test replaces the API hooks, the session, the router and the child
  components.** `src/__tests__/support-dashboard-issue.screen.panels.test.tsx` replaces
  `@dfx.swiss/react` (session and enums), the component library, `useParams`, the guard, navigation,
  layout, split-pane, draft and staff-name hooks, the settings context, the support-dashboard and
  compliance API hooks, and the formatting, draft, placeholder, file and shortcut helpers. The info
  panels, message list, file preview, limit-request decision form, note panel, template pickers and
  error hint are stand-ins that expose their callbacks; the blob URL functions are stubbed. A green run
  proves that the screen follows those stubs through its branches. It does not prove a real API,
  session or navigation, or that the real child components or helpers work; the real tests are in
  `e2e-stack/specs/support-dashboard.spec.ts`.
- **The order form coverage test replaces the order hook and the SDK.**
  `src/__tests__/order-interface.test.tsx` supplies a hand-built order state and replaces the SDK
  enums, the order hook, the debounce hook and the payment-info component. A green run proves the
  form follows that stub, including which address label it shows. It does not prove a live quote,
  a live balance lookup, or a real payment-info request.
- **The full-stack harness answers Scorechain through the API's loc mock.** `e2e-stack/env/api.env`
  enables the Scorechain, risk-status and buy-gate processes
  (`DISABLED_PROCESSES=*,!Scorechain,!UserDataRiskStatus,!Buy`) and maps the address of
  `testWallet(7700001)` to the mock form `SanctionList` in `SCORECHAIN_LOC_MOCK`; every other address
  gets `NoRisk`. `Buy` is the request gate the API checks on the buy routes, not a job, so the
  processing chain still never executes. The mock answers after `SCORECHAIN_LOC_MOCK_DELAY_MS` (5 s),
  and the tests prove the form is usable before that answer arrives.
  `e2e-stack/specs/sell-swap.spec.ts` proves that the sell page shows no banner for `Ok` and the
  banner for `LikelyReturn`, through the real API and database. A third test opens the sell page on
  Gnosis, which Scorechain does not cover, and proves the `Unknown` answer shows no banner.
  A green run does not prove what the real Scorechain returns for an address, or that the API stays
  within its 15-second bound against the real provider.
- **The full-stack harness stores support and KYC blobs in memory, not in object storage.** With `ENVIRONMENT=loc`, the API's
  storage factory returns `MockStorageService` (`e2e-stack/compose.yml` has no object-storage service).
  `e2e-stack/specs/support-dashboard.spec.ts` transfers an umlaut-named support attachment into the KYC
  file through the real screen, API and Postgres, and verifies the resulting `kyc_file` row and message
  link. A green run proves that path and its naming; it proves neither the object-storage PUT of the support
  attachment nor the object-storage PUT of the KYC copy with the percent-encoded `originalFileName`
  metadata header, which is the transport that failed before backend#6162. Production object storage is not
  only S3/MinIO: the backend storage factory can also write to Azure Blob Storage (`STORAGE_WRITE_MODE=azure`).
- **The sell address check visuals answer the API themselves.** `e2e/sell-address-check.spec.ts` uses a synthetic
  unsigned JWT and fulfils the sell bootstrap calls and `GET /v1/sell/address-check` with `LikelyReturn` and
  `Ok`. It also answers `PUT /v1/sell/paymentInfos` (and `PUT /v1/sell/quote`) with a synthetic quote so the
  sell form shows its normal exchange rate and payment information. A green run proves how the sell page renders
  the banner and its absence for those answers. It does not prove production auth, that the API answers
  `LikelyReturn` for a real address, or that the API returns that quote.
- **The wallet rejection unit test answers for the wallets and their SDKs.**
  `src/__tests__/connect-wallet-rejection.test.tsx` renders the real connect components, wallet hooks,
  `ConnectBase` and `ConnectError` with the real web3 and viem (its mock installs Node's `TextEncoder` and
  `TextDecoder` from `util` on the jsdom global, which has none), but replaces the injected EIP-1193 provider
  with an object that rejects the way an injected wallet does, `@wagmi/core` with functions that throw the real
  viem `UserRejectedRequestError` with a fixed connected account and one WalletConnect connector, the wagmi
  config with a placeholder project id, and the Solana and Tron wallet adapters with objects that throw the real
  adapter error classes. The wallet context, `@dfx.swiss/react` with its session contexts and copies of its
  `AssetType` and `Blockchain` values, translation, styled controls, `SignHint` and the client-error reporter
  are replaced as well; the app's web3 hook has a fixed chain mapping, the Solana and
  Tron hooks are empty, `ethers.encodeBase58` returns a placeholder, device detection and the Tron wallet and
  in-app detection are fixed, `global.fetch` rejects the WalletConnect wallet list, `console.warn` is silenced,
  and web3's address checksum, which jsdom's `Uint8Array` breaks, returns the address unchanged. A green run
  proves that a cancel shaped that way shows and reports nothing and goes back to the wallet selection, and that
  other failures on the same paths are still shown and reported. It does not prove that a real wallet,
  extension or app rejects with exactly that shape or code, that the real reporter sends the report, that the
  wallet list loads, that a real WalletConnect connector or session is used, the chain mapping, the signature
  encoding, the wallet and mobile detection, the SDK's enum values, that the checksum is computed, that viem
  encodes and decodes with the browser's own `TextEncoder` and `TextDecoder` as it does with Node's, or that a
  real login completes.
- **The wallet cancel full-stack cases replace the wallet extensions with injected wallets.**
  `e2e-stack/specs/fixtures/injected-wallet.ts` installs `window.ethereum` with `addInitScript`: an EIP-1193 object
  marked `isMetaMask` whose answers come from the test process through `page.exposeFunction`, which rejects with a
  plain object (code 4001 with MetaMask's `data` for a cancel, code -32603 for a failure), answers Ethereum (`0x1`)
  as the chain, fixed fee data (`eth_gasPrice`, `eth_maxPriorityFeePerGas`, `eth_estimateGas`,
  `eth_getTransactionCount`, `eth_getBlockByNumber`) instead of a chain node, answers `wallet_switchEthereumChain`,
  `wallet_addEthereumChain` and `eth_sendTransaction` as the test decides, and signs the login message with the
  dedicated test wallet's key. `e2e-stack/specs/auth.spec.ts` uses it for five MetaMask cases on `/login`, two of
  them rejecting the account request as still pending (code -32603 with `Already processing unlock. Please wait.`,
  and code -32002 with `Already processing eth_requestAccounts. Please wait.` and data), and installs in-page
  objects for Phantom (`window.phantom.solana`), Trust (`window.trustwallet.solana` and
  `window.trustwallet.tronLink`) and TronLink (`window.tronLink`, older protocol, and `window.tron`, newer protocol)
  that reject the connection with code 4001, or with another code for the failure cases, including a Phantom connect
  rejected with `Already processing connect. Please wait.`. `e2e-stack/specs/sell-swap.spec.ts` logs in through the
  injected MetaMask and lets it reject the chain switch, the request to add an unknown chain (after code 4902 for
  the switch), or the transaction of "Complete transaction in your wallet" on `/sell`. A green run proves, through
  the real frontend, API and Postgres, that a cancelled connection in each of those wallets and a cancelled MetaMask
  login signature return to the wallet selection with no error and no `POST /v1/log/clientError` or `POST /v1/auth`,
  that a connection the wallet is still processing shows the hint to confirm or close the pending request and
  reports exactly that hint, that a retry signs in and creates the user row, that a cancelled chain switch,
  add-chain request or transaction keeps the user on the sell form without "Transaction failed", and that a failing
  wallet still shows its error and is reported to the API. It does not prove that a real wallet extension or app
  rejects with exactly those shapes, codes and messages, including the `Already processing … Please wait.` text, or
  answers an unknown chain with 4902 before the add-chain request, that a transaction reaches a chain, a signature
  or transaction cancel in the Solana and Tron wallets, the swap screen, or WalletConnect, whose relay the harness
  network cannot reach.
- **The wallet cancel visual spec answers the wallet and the API itself.** `e2e/wallet-cancel.spec.ts` installs an
  in-page injected wallet and fulfils the bootstrap GETs; `POST /v1/log/clientError` is answered with 201 and
  recorded. For the login page the wallet rejects the account request (code 4001 with data, code -32603, and code
  -32603 with `Already processing unlock. Please wait.`). For the sell form it signs any message with a fixed
  signature, the sign message and the sign-in are answered with a synthetic message and an unsigned JWT, the address
  check, the quote, the payment information, the bank-account update and `GET /v2/user` are answered with synthetic
  data, and the wallet accepts the chain switch, answers fixed fee data and rejects `eth_sendTransaction` (code 4001
  with data, and code -32603). Unmatched `/v1/**` and `/v2/**` calls get `501`. A green run proves how the login
  page renders the cancelled connection (back at the wallet selection, no report), the failed one ("Connection
  failed!" with the wallet's message, one report) and the one the wallet is still processing (the hint to confirm or
  close the pending request instead of the wallet's text, one report), and how the sell form renders a cancelled
  transaction (form kept, no error, no report) and a failed one ("Transaction failed"). It does not prove that a
  real wallet rejects that way, production auth, that the API returns real bootstrap data or that quote, or that the
  real client-error endpoint receives the report.
- **The partner wallet-selection visual spec answers the bootstrap and the client-error report itself.**
  `e2e/partner-wallet-selection.spec.ts` fulfils the bootstrap GETs `GET /v1/language` (German and
  English), `GET /v1/fiat` (CHF), `GET /v1/asset` (one ETH coin), `GET /v1/bankAccount` and
  `GET /v1/country` (empty lists), and `GET /v1/setting/infoBanner` (no banner); `POST /v1/log/clientError`
  is answered with 201 and recorded. Any other `/v1/**` and every `/v2/**` call gets `501` instead of being
  continued, and the app is opened with `lang=en` in the partner modes `bitcoinonly`, `kevinsoell` and
  `lightning-wallets`. A green run proves how three screens render with those answers and no Alby tile: the
  bitcoinonly sell wallet list, the kevinsoell sell hardware-wallet selection (reached through the Bitcoin
  Lightning tile), and the `lightning-wallets` Bitcoin Lightning wallet list, each without "Oh, sorry,
  something went wrong" and with no client-error report. It does not prove the API's real answers, a real
  wallet connection, or anything beyond how these three screens render.
- **The MetaMask rejection hook test replaces the injected provider.**
  `src/hooks/wallets/__tests__/metamask-rejection.hook.test.ts` runs `useMetaMask` against the real web3 with
  an in-memory EIP-1193 provider (and a legacy `sendAsync` provider) that answers or rejects each method, and
  replaces web3's address checksum, which jsdom's `Uint8Array` breaks, the app's web3 hook with a fixed chain
  mapping, device detection, and `@dfx.swiss/react` with copies of its `AssetType` and `Blockchain` values. A green run proves that web3 keeps the EIP-1193 code of a rejection that is not
  an Error, that a pending request rejected with code -32002 ends in the pending-request key, that a plain
  rejection with the pending-request text and data keeps that text, while other failures keep the message web3
  builds for them. It does not prove that a real wallet
  rejects with that shape, the chain mapping, the SDK's enum values, that the checksum is computed, or that a transaction reaches a
  chain.
- **The MetaMask calls hook test replaces web3 and the injected provider.**
  `src/hooks/wallets/__tests__/metamask-calls.hook.test.ts` runs `useMetaMask` against a hand-written web3
  object, an in-memory `window.ethereum`, a replaced `timeout`, `window.location`, `navigator.userAgent` and
  device detection, the app's web3 hook with a placeholder chain mapping, `@dfx.swiss/react` with copies of its
  `AssetType` and `Blockchain` values, and a `setTimeout` that fires at once
  so the two-minute status poll ends immediately. A green run proves which web3 and wallet calls the hook makes
  and how it treats their answers. It does not prove that web3 or a real wallet behaves like those objects, the
  chain mapping, the SDK's enum values, the real poll timing, the detection of a wallet app by its user agent, or that a page reload
  happens.
- **The Solana wallet hook test replaces the wallet adapters and the Solana hook.**
  `src/hooks/wallets/__tests__/solana-wallets.hook.test.ts` runs `usePhantom` and `useTrustSol` against
  hand-written Phantom and Trust adapter objects that answer or reject `connect`, `signMessage` and
  `signTransaction`, a replaced `useSolana` (transaction building and broadcast), a replaced `delay`,
  `ethers.encodeBase58` and
  `@dfx.swiss/react` with a copy of its `AssetType` values. A green run proves how the hooks map the adapters'
  results and errors, including the 4001 code kept as the adapter's `error`. It does not prove that the real
  adapters or wallets answer with those shapes, that a message is signed, or that a transaction is built or
  broadcast.
- **The Tron wallet hook test replaces the wallet adapters and the Tron hook.**
  `src/hooks/wallets/__tests__/tron-wallets.hook.test.ts` runs `useTronLinkTrx` and `useTrustTrx` against
  hand-written TronLink and Trust adapter objects that answer or reject `connect`, `signMessage` and
  `signTransaction`, replaced wallet and mobile detection, a replaced `useTron` (transaction building and
  broadcast), a replaced `delay`, and `@dfx.swiss/react` with a copy of its `AssetType` values. A green run proves
  how the hooks map the adapters' results and errors, including the adapters' connect message "The user rejected
  connection." only on connect. It does not prove that the real adapters or wallets answer with those shapes or
  that text, the detection of the extension or app, that a message is signed, or that a transaction is built or
  broadcast.
- **The WalletConnect hook test replaces the wagmi actions and the wallet list.**
  `src/hooks/wallets/__tests__/wallet-connect.hook.test.ts` replaces `@wagmi/core`, the wagmi config, the
  WalletConnect connector and its provider (whose `request` answers the chain switch as each test decides),
  `global.fetch` for the WalletConnect wallet list, the app's web3 hook with a fixed chain-id mapping and device
  detection, `@dfx.swiss/react` with copies of its `AssetType` and `Blockchain` values, silences `console.warn`,
  and replaces `setTimeout` so the wait after a chain switch ends at once;
  it keeps the real viem, whose mock installs Node's `TextEncoder` and `TextDecoder` from `util` on the jsdom
  global, which has none. A green run proves which wagmi actions the hook calls and how it maps their results and
  errors. It does not prove that a WalletConnect session is established, that the real connector's provider
  forwards the switch to the wallet, that a wallet answers or rejects that way, that the wallet list API returns that JSON, the chain-id mapping, the SDK's enum values, the real wait after
  a switch, or that viem encodes and decodes with the browser's own `TextEncoder` and `TextDecoder` as it does with
  Node's.
- **The sell and swap hand-off full-stack cases answer the integrator's redirect target themselves.**
  `e2e-stack/specs/sell-swap.spec.ts` opens `/sell` and `/swap` with a `redirect-uri` on `wallet.e2e.test`
  and answers every request to that host with 204. A green run does not prove that a wallet intercepts the
  redirect, opens a send screen or sends a transaction, nor how a WebView behaves.

## Known gaps

All four points below concern the full-stack harness.

- **No layer here verifies a payment end to end.** The harness sets
  `DISABLED_PROCESSES=*,!Scorechain,!UserDataRiskStatus,!Buy` (`e2e-stack/env/api.env`); what that
  switches off in the API is described in the companion document there — every process-gated cron
  job — so the processing chain never executes;
  transaction states are inserted with SQL instead. What is verified is the synchronous path:
  interaction, HTTP, validation, authorisation, persistence, display. (A cron without a `process` field
  is not covered by that switch and keeps running — see the companion document in `DFXswiss/backend`.)
  Three processes are enabled: Scorechain answers from the API's loc mock (`SCORECHAIN_LOC_MOCK`,
  `SCORECHAIN_LOC_MOCK_DELAY_MS`), so no provider is called; `UserDataRiskStatus` only opens the
  risk-status endpoint and `Buy` only opens the request gate of the buy routes, and neither runs a job;
  the processing chain stays off.
- **The harness does not exercise the migration chain.** It builds the schema from the entities,
  because one migration requires a seed row that does not exist at migration time on a fresh
  database. Migrations are covered in `DFXswiss/backend` instead.
- **The harness lives in the wrong repository.** It tests the API as much as this frontend, and
  `DFXswiss/backend` has to check this repository out to obtain it. See the target below.
- **The suite is serialised.** All specs share one database and one API instance — `e2e-stack/compose.yml`
  declares a single `db` and a single `api` service — with no per-test isolation, so it runs on a single
  worker with retries disabled (`workers: 1` and `retries: 0` in `e2e-stack/playwright.config.ts`, whose
  comment states the reason): a retry would mask exactly the order-dependent failure this arrangement
  produces. It bounds how far the suite can grow.

## Target architecture

_Target — not built yet._ In the order the work should happen:

1. **Per-worker isolation** (a schema or database per worker), so the suite can be parallelised. Cheap
   while it is small.
2. **Move the harness out of this repository** — into `DFXswiss/backend` or a repository of its own,
   consuming published frontend and API images by tag instead of sibling checkouts. The stage depends
   on the applications, never the reverse.
3. **Adopt a coverage ratchet for the unit layer**, replacing a rule that CI cannot enforce with one
   that can only move upward.

Each step is additive; none requires discarding what exists.

## Keeping this document honest

Every **measured** number carries the commit it was measured on and the command that produces it; that
is what keeps the figures maintainable. Counts that a reader can verify by looking — how many entries an
adjacent list has, for instance — need no stamp. When a layer changes what it proves, or a fake is added,
removed or altered, this document changes in the same pull request.
