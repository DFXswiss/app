# Test architecture

This document describes the test layers **this repository** owns, with measured numbers for the
current state. The canonical, cross-repository description of all layers — what each one proves, what
it deliberately does not prove, and the reality-declaration requirement — lives in
`DFXswiss/backend` under `docs/test-architecture.md`. Read that one first if you need the whole picture.

Current state and target are kept apart on purpose. Sections marked _target_ describe what is not
built yet; nothing here may describe a capability as existing when it does not.

## The layers this repository owns

| Layer              | Location                        | What it proves                                                               | What it cannot prove                                               | Runs in CI                                                                                       |
| ------------------ | ------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Unit               | `src/`                          | the logic of a component, hook or utility, with its surroundings replaced    | that any two parts fit together                                    | drafts run (forks may wait as `action_required`); suite full / related / none                    |
| Handbook deep-link | `scripts/handbook/deep-link.js` | `?shot=` / `?group=` / hash isolate one handbook card in a fake document     | the browser after Basic Auth, or that nginx serves the query       | `handbook-check.yaml` (drafts that touch handbook paths; Ready does not start CI)                |
| Full-stack E2E     | `e2e-stack/`                    | the seam between frontend, API and database: screens, contracts, persistence | any money movement — every process-gated job is off during the run | drafts run (job `mode=none` without `ci:full`); stack only with `ci:full` / main / bare dispatch |
| Visual regression  | `e2e/`                          | appearance against committed screenshot baselines                            | function                                                           | no                                                                                               |

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
  A green run proves the overview, treasury, insights, holder, transaction and account
  fixtures render, including those error states. It does not prove that the API returns
  those payloads, that login or token verification works, or that the staff, stats,
  prize-wallet, alert, payout, buy-limit or account endpoints return real data.
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
  deactivated-this-visit variants, and one invite per review status (Open, Approved,
  Rejected) on the referral list. It also answers the deactivate call
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
  row deactivated in the visit that stays visible, the redeemed promo codes, the invite-only
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
  member's `verifiedName`.
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
  renders without a live DFX API. Map tiles are the live OpenFreeMap Liberty style, not a fixture.
  A green run proves those fixtures render on the whole payment page, with no country or shop
  control and no shop-name list: a map of the Swiss pins, an open shop, an empty list, the load
  error, and the loading state before the places arrive. It does not prove that the
  place API still returns this set, that those rows are stored with country CH, or that the
  DFX payment-link API returns the stubbed merchant.
- **The payment-link stack spec answers the place API itself for the SPAR merchant.**
  `e2e-stack/specs/payment-links.spec.ts` fulfils that same SPAR-Switzerland place URL with one
  synthetic SPAR shop, and answers every other place URL with HTTP 500, while the rest of that
  spec talks to the local API. It also fulfils `https://tiles.openfreemap.org/**` with an empty
  map style, because this harness never reaches that host and an open style request keeps the
  network from going idle. A green run proves the locations block appears for `merchant=SPAR`,
  the request is `shopName=SPAR` and `country=CH`, and the page shows neither a country control,
  a shop control, the load error, nor the empty sentence. It does not prove that the place API
  returns that shop, that OpenFreeMap serves tiles, or that a real map draws the pin.
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
  objects render the quote rows, the payment methods, the wallet block and the SPAR locations
  block. It does not prove that the DFX payment-link API returns those payloads, that a wallet
  deeplink opens, that the asset catalog matches production, or that the SPAR map draws the
  place list.
- **The widget tests force the closed shadow root open.** `forceOpenShadowRoots`
  (`e2e-stack/specs/fixtures/shadow-root.ts`) patches `Element.prototype.attachShadow` in the test
  browser so every root is attached open; `e2e-stack/specs/widget.spec.ts` (mail login by code),
  `e2e/widget-mail-code-login.spec.ts` and `e2e/widget-navigation-menu.spec.ts` use it to reach
  inside `<dfx-services>`. The shipped widget
  keeps `shadow: 'closed'`. A green run does not prove anything that depends on the root being
  closed, such as the host page being unable to read or restyle the widget's content.
- **The full-stack widget mail-code test drops the host page's `service` attribute.**
  `e2e-stack/specs/widget.spec.ts` removes `service` before the widget mounts, because the stack's
  widget origin `http://frontend-widget` has no TLD and the API rejects the redirect URI built from
  it. A green run does not prove that a mail-code request carrying a redirect URI for a pending
  service is accepted; that depends on the deployed public URL.
- **The widget mail-code tests submit `000000` as the wrong code.** `e2e-stack/specs/widget.spec.ts`
  and `e2e/widget-mail-code-login.spec.ts` cannot know the mailed code, so they send the fixed value
  `000000` and expect the API's 401. The API draws each code uniformly from `000000` to `999999`, so
  a green run does not prove that `000000` is always rejected: it equals the mailed code with a
  probability of one in a million per request, and such a run would log in instead of failing the
  attempt.
- **The widget visual specs serve their own host page; the mail-code spec moves the browser clock.**
  `e2e/widget-mail-code-login.spec.ts` and `e2e/widget-navigation-menu.spec.ts` use
  `e2e/helpers/widget-host.ts`, which serves a minimal host page, the local widget build
  (`npm run widget:loc`) and the widget stylesheet as `main-widget.css` (the name the deploy
  workflows rewrite) from its own HTTP server on 127.0.0.1, and fulfils the widget's lazy chunks
  from the same build via `page.route`. The navigation-menu host page surrounds the widget with
  plain host blocks; it contains no real third-party content. Every API answer is real: the code
  request, the 401 for each wrong code and the resend. The expired variant advances the page clock
  by the code's ten-minute validity. A green run does not prove that the published widget script,
  chunks and stylesheet load on a third-party page, how the menu behaves next to a real host
  page's own positioned or stacked elements, or that the API itself treats the code as expired at
  the same moment.

## Known gaps

All five points below concern the full-stack harness.

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
- **The embedded mail login by code cannot be completed.** The API neither stores nor logs the
  6-digit code it mails (the mail text is marked sensitive, and under `loc` no mail leaves the API),
  so `e2e-stack/specs/widget.spec.ts` drives the code step only as far as a wrong code, a resend and
  back. Entering the correct code and the logged-in state that follows are covered by the unit tests
  in `src/__tests__/connect-mail-code.test.tsx` only.

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
