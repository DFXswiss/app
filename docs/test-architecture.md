# Test architecture

This document describes the test layers **this repository** owns, with measured numbers for the
current state. The canonical, cross-repository description of all layers — what each one proves, what
it deliberately does not prove, and the reality-declaration requirement — lives in
`DFXswiss/backend` under `docs/test-architecture.md`. Read that one first if you need the whole picture.

Current state and target are kept apart on purpose. Sections marked _target_ describe what is not
built yet; nothing here may describe a capability as existing when it does not.

## The layers this repository owns

| Layer              | Location                        | What it proves                                                               | What it cannot prove                                                                 | Runs in CI                                                                                       |
| ------------------ | ------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Unit               | `src/`                          | the logic of a component, hook or utility, with its surroundings replaced    | that any two parts fit together                                                      | drafts run (forks may wait as `action_required`); suite full / related / none                    |
| Handbook deep-link | `scripts/handbook/deep-link.js` | `?shot=` / `?group=` / hash isolate one handbook card in a fake document     | the browser after Basic Auth, or that nginx serves the query                         | `handbook-check.yaml` (drafts that touch handbook paths; Ready does not start CI)                |
| Full-stack E2E     | `e2e-stack/`                    | the seam between frontend, API and database: screens, contracts, persistence | any money movement — every process-gated job except Scorechain is off during the run | drafts run (job `mode=none` without `ci:full`); stack only with `ci:full` / main / bare dispatch |
| Visual regression  | `e2e/`                          | appearance against committed screenshot baselines                            | function                                                                             | no                                                                                               |

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
all four metrics, and CI does not enforce it. The rule is still mandatory: reviewers reject a pull
request that leaves a touched file below 100 %, and no deviation from it can be declared or granted
(`CONTRIBUTING.md`, section "Complete test coverage is mandatory"). With the repository at 18 %, that
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
  payments are requested as built. It does not prove that the API returns merchant info for a
  route or answers `404` and `400` as assumed, that the payment endpoints return those payloads, or
  that a real MetaMask signs and sends the transaction.
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
- **The connect-alby redirect unit test replaces the SDK session hooks, the Alby hook, the app contexts
  and wallet login.** `src/__tests__/connect-alby-redirect.test.tsx` stubs session, user and wallet
  contexts, `useAlby` and `window.location`, and asserts the Alby `redirect` query. A green run does not
  prove a real Alby login, a real SDK session change, or the real interplay with the app router and
  navigation.
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
- **The order form coverage test replaces the order hook and the SDK.**
  `src/__tests__/order-interface.test.tsx` supplies a hand-built order state and replaces the SDK
  enums, the order hook, the debounce hook and the payment-info component. A green run proves the
  form follows that stub, including which address label it shows. It does not prove a live quote,
  a live balance lookup, or a real payment-info request.
- **The full-stack harness answers Scorechain through the API's loc mock.** `e2e-stack/env/api.env`
  enables only the Scorechain process (`DISABLED_PROCESSES=*,!Scorechain`) and maps the address of
  `testWallet(7700001)` to the mock form `SanctionList` in `SCORECHAIN_LOC_MOCK`; every other address
  gets `NoRisk`. The mock answers after `SCORECHAIN_LOC_MOCK_DELAY_MS` (5 s), and the tests prove the
  form is usable before that answer arrives. `e2e-stack/specs/sell-swap.spec.ts` proves that the sell
  page shows no banner for `Ok` and the banner for `LikelyReturn`, through the real API and database.
  A third test opens the sell page on Gnosis, which Scorechain does not cover, and proves the `Unknown`
  answer shows no banner.
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

## Known gaps

All four points below concern the full-stack harness.

- **No layer here verifies a payment end to end.** The harness sets `DISABLED_PROCESSES=*,!Scorechain`
  (`e2e-stack/env/api.env`); what that switches off in the API is described in the companion document
  there — every process-gated cron job — so the processing chain never executes;
  transaction states are inserted with SQL instead. What is verified is the synchronous path:
  interaction, HTTP, validation, authorisation, persistence, display. (A cron without a `process` field
  is not covered by that switch and keeps running — see the companion document in `DFXswiss/backend`.)
  The one enabled process, Scorechain, answers from the API's loc mock (`SCORECHAIN_LOC_MOCK`,
  `SCORECHAIN_LOC_MOCK_DELAY_MS`), so no provider is called; the processing chain stays off.
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
