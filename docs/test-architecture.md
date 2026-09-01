# Test architecture

This document describes the test layers **this repository** owns, with measured numbers for the
current state. The canonical, cross-repository description of all layers — what each one proves, what
it deliberately does not prove, and the reality-declaration requirement — lives in
`DFXswiss/backend` under `docs/test-architecture.md`. Read that one first if you need the whole picture.

Current state and target are kept apart on purpose. Sections marked _target_ describe what is not
built yet; nothing here may describe a capability as existing when it does not.

## The layers this repository owns

| Layer              | Location                        | What it proves                                                               | What it cannot prove                                               | Runs in CI                                                                          |
| ------------------ | ------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Unit               | `src/`                          | the logic of a component, hook or utility, with its surroundings replaced    | that any two parts fit together                                    | drafts skip unless `ci`/`ci:full`; suite full / related / none                      |
| Handbook deep-link | `scripts/handbook/deep-link.js` | `?shot=` / `?group=` / hash isolate one handbook card in a fake document     | the browser after Basic Auth, or that nginx serves the query       | `handbook-check.yaml` (non-draft PRs that touch handbook paths)                     |
| Full-stack E2E     | `e2e-stack/`                    | the seam between frontend, API and database: screens, contracts, persistence | any money movement — every process-gated job is off during the run | drafts skip unless `ci`/`ci:full`; stack only with `ci:full` / main / bare dispatch |
| Visual regression  | `e2e/`                          | appearance against committed screenshot baselines                            | function                                                           | no                                                                                  |

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
"Coverage": every file a pull request touches must reach 100 % on
all four metrics, and CI does not enforce it — it is a review gate. With the repository at 18 %, that
means touching a long-neglected file makes its whole coverage your obligation. Plan for it rather
than discovering it in review.

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
Develop PRs without `ci:full` never set it; `ci:full`, PRs into `main`, and a bare `workflow_dispatch`
(empty `base_ref`) force that full invocation.
Adding a route therefore means adding a claim in `e2e-stack/specs/registry/` and a test that navigates
there.

That gate is the pattern the reality declaration follows: **measure the run, do not trust the
declaration.** Anything its parser cannot resolve is a hard failure rather than a silent omission.

## Reality declaration — hard requirement

Full definition, including the categories that count as a fake and the mandatory fields per entry, is in
`DFXswiss/backend` under `docs/test-architecture.md` — that document owns the taxonomy, and its exact extent
is not verifiable from this repository. The short form that binds every pull request here:

Whenever you introduce, remove or change a fake — a faked external provider, a disabled cron job, a
schema built without the migration chain, state written directly with SQL, a placeholder value that
looks real, a suppressed side effect, or a seed correction that bends reality — the declaration
changes in the same pull request, and each entry says in one plain sentence what a green run does
**not** prove. A pull request that adds a fake without its declaration is incomplete regardless of
whether CI is green.

Write the declaration entry **before** building the fake. Reversed, it becomes documentation written
from memory, with omissions.

## Reality declaration — entries

This section lists the fakes introduced by this repository's own suites and states what a green
run does not prove for each one; the taxonomy and cross-repository entries live in
`DFXswiss/backend` under `docs/test-architecture.md`.

- **The buy-process specs answer the quote endpoint themselves.** `e2e/buy-process.spec.ts` fulfils
  `**/v1/buy/paymentInfos` with static payloads, so a green run proves that the screen renders those
  payloads, not that the API produces them. Unit tests against the utility pin the payload shapes
  instead.
- **The RealUnit quotes and dashboard visual specs answer the admin list themselves.**
  `e2e/realunit-quotes.spec.ts` and `e2e/realunit-dashboard.spec.ts` fulfil
  `GET /v1/realunit/admin/quotes` (and, on the dashboard, holders, token info, price history,
  transactions, and the three admin stats paths buy-volume, holders and registration) with
  synthetic fixtures that include `userId`, `userName` and `deactivatedAt`.
  They also fulfil staff/bootstrap GETs (`/v1/language`, `/v1/fiat`, `/v1/asset`, `/v1/bankAccount`,
  `/v1/country`, `/v1/setting/infoBanner`, `/v2/user`) so a synthetic unsigned JWT does not 401.
  A green run proves the quote list, pending-table and stats-chart fixtures render. It does not
  prove that the API returns those payloads, that login or token verification works, or that those
  staff/settings or stats endpoints return real data.
- **Two specs force KYC completeness.** Both collection-invoice cases — the refused QR and the
  stored-detail error — override `**/v2/user` so that `kyc.dataComplete` is read as `true`, because
  the invoice button is gated on that value. A green run therefore proves nothing about the gate for
  a customer who has not completed KYC; a unit test covers that path.
- **The same two specs fabricate the invoice rejection.** Each answers
  `**/v1/buy/paymentInfos/*/invoice*` with a `400` and the fixed
  `CollectionAccountInvoicePersonalIbanMissing` error token, so a green run proves that the screen
  displays that token, not that the API emits it for this request. A unit test against the message
  mapping pins the token contract instead.
- **The support-issue receiver-IBAN spec pins KYC level and account mail on GET /v2/user.**
  `e2e/support-issue-receiver-iban.spec.ts` rewrites that response so `kyc.level` is high enough for
  the screen guard and `mail` is present if the cached wallet session has none. A green visual run
  therefore does not prove the mail-first redirect, nor that the account actually has mail or a
  completed KYC level.
- **The list Open-invoice and Open-receipt tests fulfill the document routes.**
  `e2e-stack/specs/transactions.spec.ts` answers `PUT /v1/transaction/:uid/invoice` and
  `/v1/transaction/:id/receipt` with a static PDF body or a `400` with a fixed message, so a green
  run proves that the click reserves a tab and surfaces the error, not that the API can build an
  invoice or receipt from SQL-seeded `buy_crypto`.
- **The compliance-review KYC-status spec answers staff identity itself.**
  `e2e/compliance-review-kyc-status.spec.ts` fulfils `GET /v1/support/issue/clerk` with
  `{ clerk }` and, as fallback, `GET /v1/support/{id}` for any account other than the customer
  fixture with `{ userData: { verifiedName } }`. A green run proves that the review screen
  accepts that name, not that the API returns the logged-in staff member's `verifiedName`.
  The spec covers the resettable AML-reset path and the pending ManualCheck decision form
  in the Fail (AmlReason visible, priceDefinitionAllowedDate hidden) and Reset (hint, both
  hidden) variants. A green run does not prove live API payloads or that the Editor label
  is the logged-in staff member's `verifiedName`.
- **The call-queue outcome spec answers staff identity and the dossier itself.**
  `e2e/compliance-call-queue-outcome.spec.ts` fulfils `GET /v1/support/issue/clerk` with
  `{ clerk }`, a differently named fallback on `GET /v1/support/{staffAccount}`,
  `GET /v1/support/{customer}` with a synthetic dossier, empty lookup lists, a null
  info banner, and `GET /v2/user` with a synthetic account. A green run proves the
  outcome form renders that clerk name as a read-only signature and does not request a
  clerks list, not that the API returns those records or the logged-in staff member's
  `verifiedName`. The session is a synthetic unsigned JWT, so a green run also does not
  prove login or token verification.
- **Full-stack guest assign/refund specs SQL-write `transaction.actionSecretHash`.**
  `e2e-stack/specs/transactions.spec.ts` (`seedActionSecret`) updates the hash directly. A green run
  does **not** prove that the mail/API path creates, hashes, or delivers the action secret.
- **Full-stack buy specs SQL-write `user_data.depositLimit`.**
  `e2e-stack/specs/buy.spec.ts` (`openQuoteCapableBuy` and older quote cases) updates the limit
  directly so `LIMIT_EXCEEDED` does not hide payment info. A green run does **not** prove that a
  customer reaches that limit through the product path.
- **The full-stack Lightning sell spec answers LNURL-pay itself.**
  `e2e-stack/images/lnurl/` serves a static pay request and an official BOLT-11 specification test
  vector on the internal stack network. A green run does **not** prove that a Lightning node can
  create a payable invoice, nor that a payment arrives, is credited, or is paid out.
- **The full-stack Lightning sell spec SQL-creates the Lightning deposit address.**
  `e2e-stack/specs/sell-lightning.spec.ts` inserts the address through
  `createLightningDeposit`. A green run does **not** prove that production provisions a Lightning
  deposit address for the customer.
- **The full-stack Lightning sell spec SQL-completes personal data and sets the KYC level.**
  `e2e-stack/specs/sell-lightning.spec.ts` uses `ensurePersonalDataComplete` and writes
  `user_data.kycLevel` directly. A green run does **not** prove that a customer progresses through
  a real KYC process.
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

## Known gaps

All four points below concern the full-stack harness.

- **No layer here verifies a payment end to end.** The harness sets `DISABLED_PROCESSES=*`
  (`e2e-stack/env/api.env`); what that switches off in the API is described in the companion document
  there — every process-gated cron job — so the processing chain never executes;
  transaction states are inserted with SQL instead. What is verified is the synchronous path:
  interaction, HTTP, validation, authorisation, persistence, display. (A cron without a `process` field
  is not covered by that switch and keeps running — see the companion document in `DFXswiss/backend`.)
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
