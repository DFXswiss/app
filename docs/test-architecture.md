# Test architecture

This document describes the test layers **this repository** owns, with measured numbers for the
current state. The canonical, cross-repository description of all layers — what each one proves, what
it deliberately does not prove, and the reality-declaration requirement — lives in
`DFXswiss/backend` under `docs/test-architecture.md`. Read that one first if you need the whole picture.

Current state and target are kept apart on purpose. Sections marked _target_ describe what is not
built yet; nothing here may describe a capability as existing when it does not.

## The layers this repository owns

| Layer              | Location                        | What it proves                                                               | What it cannot prove                                                                                                          | Runs in CI                                                                                       |
| ------------------ | ------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Unit               | `src/`                          | the logic of a component, hook or utility, with its surroundings replaced    | that any two parts fit together                                                                                               | drafts run (forks may wait as `action_required`); suite full / related / none                    |
| Handbook deep-link | `scripts/handbook/deep-link.js` | `?shot=` / `?group=` / hash isolate one handbook card in a fake document     | the browser after Basic Auth, or that nginx serves the query                                                                  | `handbook-check.yaml` (drafts that touch handbook paths; Ready does not start CI)                |
| Full-stack E2E     | `e2e-stack/`                    | the seam between frontend, API and database: screens, contracts, persistence | any money movement — listed jobs are off, `PasskeyRegistration` stays on, and a green run does not prove every process is off | drafts run (job `mode=none` without `ci:full`); stack only with `ci:full` / main / bare dispatch |
| Visual regression  | `e2e/`                          | appearance against committed screenshot baselines                            | function                                                                                                                      | no                                                                                               |

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
- **Passkey wallet balance and history props are not backed by a data source here.**
  The empty and populated history screenshots pass fixtures through a non-production window hook to the desk prop.
  A green visual run does not prove a production balance, rate or transaction-history integration.
- **The layout configuration hook unit test replaces its context setter.**
  `src/__tests__/layout-config-hook.test.tsx` uses `mockSetConfig`; a green run does not prove that the real provider updates its context.
- **The passkey sheet unit test replaces the active element in one case.**
  `src/__tests__/passkey-sheet.test.tsx` stubs `document.activeElement`; a green run does not prove browser focus behaviour for that case.
- **The passkey wallet unit tests replace the settings context.**
  Their `translate` returns the key; a green run does not prove real translation.
  `changeAppLanguage` and `changeLanguage` are mocked; a green run does not prove real language changes or that the account stays untouched.
- **The late recovery-word test spies on React state.**
  `src/__tests__/connect-passkey.test.tsx` replaces `useState` with a spy; a green run does not prove recovery-word state behaviour without that instrumentation.
- **The late diagnostic test spies on React state.**
  Its `useState` spy observes updates after unmount; a green run does not prove that behaviour without the spy.
- **The late QR detection test spies on React state.**
  Its `useState` spy observes updates after closing the send dialog; a green run does not prove that behaviour without the spy.
- **The passkey reload test replaces `window.location.reload`.**
  A green run does not prove that a browser actually reloads the page.
- **The passkey login visual spec stubs the browser and the bootstrap calls.**
  `e2e/passkey-login.spec.ts` fulfils geolocation-db with country `CH` and fulfils the bootstrap
  GETs with fixtures. The wallet card background is loaded from the public image host; a green run does
  not prove that this image is served or unchanged. The EUR shot selects the local wallet currency without a DFX user; it does not prove the
  service saves an account currency. Every `/v2/**` call is answered with 401. The tile shots replace WebAuthn.
  An available report resolves `PublicKeyCredential.getClientCapabilities` with `extension:prf`.
  A missing report removes `PublicKeyCredential` or `credentials.create` and `credentials.get`.
  The preparing shot leaves `getClientCapabilities` pending, so the sheet stays on the preparing
  sentence and Close. A dismissed login rejects the first `credentials.get` with `NotAllowedError`
  and later gets succeed. The unknown-credential shot answers `POST /v1/auth/passkey/authenticate/finish`
  with status 400 and error `Unknown credential`. The in-app shot sets a user agent that contains
  Telegram. The iPhone in-app shot sets an iPhone user agent that also contains Telegram, so that
  image includes the iPhone sentence. The old-system shot sets a user agent that reports iOS 16.0.
  The desk shots and every shot that completes a ceremony install a fixed in-page authenticator and fulfil the passkey
  routes with one wallet. The recovery-word and receive shots show values derived from the fixed test PRF bytes in
  `e2e/passkey-desk-authenticator.ts`; a green run does not prove a real authenticator's PRF output or a real
  wallet's addresses. Register omits a Bitcoin row so the auto-link posts the derived
  address; the wallet list then contains that posted Bitcoin address, the placeholder EVM and Spark
  rows, and a differing Bitcoin row. The backupSeen response is a fixture with a fixed date; a green run does not prove the API sets that date.
  The wallet fixtures here and in `e2e/wallet-entry.spec.ts` set `backupRequired` themselves (`true`, and `false`
  after backupSeen); a green run does not prove the API reports it for a passkey that is not synced.
  The compromised and other-tab shots set the tab session because
  the wallet package does not return those states. The locked-receive shot opens Receive on an unlocked
  wallet and then sets the tab session to locked; it does not prove that a real lock reaches an open dialog. A green run proves each listed screen renders
  from fixtures, including the idle card, the preparing card, the account choice, the email form,
  the unknown card, the in-app card and the iPhone in-app card, the old-system card,
  the blocked card, and the desk. It does
  not prove a real WebAuthn signature, a real dismissal, a real in-app browser, a real iPhone,
  that iOS 16.0 is the running system, that the platform check eventually finishes, a real API,
  a production build of the session hook, or the DFX session created by a service action. It does not prove that
  geolocation-db returns `CH`, that the API returns those payloads, that the server stored the
  placeholder addresses, or that this browser's real passkey support matches the stub. Die drei Send-Baselines für fehlendes Einfügen, fehlendes Scannen und die offene Kamera ersetzen die Zwischenablage, die Kamera und BarcodeDetector. Ein grüner Lauf beweist keine echte Kamera und kein echtes QR-Bild.
  The denied-camera shot replaces `getUserMedia` with a rejection; a green run does not prove
  that a real browser denies camera permission or displays the same device-specific error.
  The Bitcoin reconnect shot fulfils the link request with an error; a green run does not prove
  that the real service returns that error or that a real retry links a Bitcoin address. That shot also
  installs Playwright's clock, holds the link answer until the page is in place, and pauses the clock before
  releasing it, so the error toast is still open for the picture; a green run does not prove how long a real
  browser shows the toast.
- **The passkey ceremony full-stack case drives the real frontend, API and database.**
  In `e2e-stack/specs/auth.spec.ts`, a run whose companion API ref is staging fails when
  `POST /v1/auth/passkey/register/begin` answers 404. Any other companion ref still skips on 404,
  because that image has no passkey controller. Any other status runs the
  ceremony. The test copies the default wallet row to the passkey wallet name, because
  synchronize does not run the wallet migration, installs a Chromium virtual authenticator, and
  adds PRF output only when that authenticator omits it. The page opens at `http://localhost:3001`
  through a forwarder to the frontend, because the relying party is `localhost` and the stack
  hostname is not that host. When that route does not answer 404, a green run proves the device
  card, the rejected first login without an existing credential, then `Open a new account`, the
  email and Continue, then the unlocked desk and the later login, the credential row is `Active`,
  and credential status plus the wallet list come from the API. It also proves that the first
  unlock shows a Bitcoin row whose full `bc1q` address matches the database path
  `m/84'/0'/0'/0/0`, that `passkey_address` together with
  `"user".address` stores that address once for the registered mail, that after Reload data
  in Settings and after the second unlock exactly one list row shows that same `bc1q` address,
  and that a different address at that path does not pass.
  It also proves that the EVM address in the Receive dialog matches the server address row and that the Buy opt-in sends that locally derived address and a non-empty wallet signature to `POST /v1/auth`, which responds with 201.
  The returned DFX token names that address and the passkey account and differs from the passkey ceremony token.
  As a consistency check, the database associates that address with the passkey credential's account; that check alone
  does not tell the opt-in from the ceremony token, the request and token checks above do.
  It does not prove a production sign-in, a real hardware-authenticator PRF, or a transaction or purchase.
  It does not prove the ceremony
  when the test skips, the wallet
  migration (the row is copied with SQL, forces `autoTradeApproval`, and clears `ownerId` and
  `address`), authenticator PRF output (the harness inserts fixed bytes when they are missing
  and forces `extension:prf` when the browser reports false), a real user activation (the
  harness reports it active), a hardware authenticator, the production relying party, or that
  background jobs run.
- **The wallet route full-stack case opens the passkey form on the loc relying party.**
  In `e2e-stack/specs/auth.spec.ts`, the `/wallet` test installs the same Chromium virtual
  authenticator as the ceremony, including fixed PRF bytes when that output is missing, and
  opens `http://localhost:3001` through the forwarder, because the relying party is
  `localhost` and the stack hostname is not that host. The init script forces
  `extension:prf` when the browser reports false and reports user activation as active.
  A green run proves the heading `Log in with your device` and the Log in button are
  visible, the email field is absent, the address stays `/wallet`, and the login heading
  is absent. It does not prove a completed ceremony, a
  hardware authenticator, the production relying party, a real user activation, authenticator
  PRF output, or that the email field appears on the stack hostname or when the browser
  reports `extension:prf` as false.
- **The passkey tile unit test replaces the wallet package and wallet client.**
  `src/__tests__/connect-passkey.test.tsx` replaces `@dfx.swiss/wallet`, `@dfx.swiss/react` and its auth
  definitions, the component library, the `useSessionContext`, navigation, store, MetaMask and settings hooks,
  the balance and app-handling contexts, `browser-lang`, `jwt-decode`, the `QrBasic` component and
  `src/contexts/wallet.context`; a green run proves none of them. The wallet-client
  and `useWalletContext.login` are replaced; a green run does not prove calls reach the real wallet client
  or create a DFX session. `LoginAutoSigner` is replaced; a green run does not prove a real signature.
  Spies make `Storage.prototype.getItem` and `setItem` throw; a green run does not prove a browser's storage failure behaviour.
  The toast tests run on Jest fake timers; a green run does not prove when a real browser timer fires.
  Tests in `src/__tests__/connect-passkey.test.tsx` and `src/__tests__/passkey-session.test.ts` switch `process.env.NODE_ENV` to `production`; a green run does not prove the behaviour of a production build.
  Unit tests set `window.__dfxHandbookPasskeyHistory`; a green run does not prove that real transaction history is available.
  Tests also stub `QrBasic`,
  `getUserMedia` and navigation; a green run does not prove the real QR
  renderer, camera or router. The same applies to the new wallet unit tests: `passkey-pay-sheet.test.tsx` stubs `getUserMedia`
  with a fake stream, and
  `passkey-wallet-history.test.tsx` replaces `IntersectionObserver`; a green run does not prove a
  real camera, QR code or scroll observer. The same file replaces `navigator.userAgent`,
  `navigator.clipboard`, and `document.execCommand`. The same file also replaces `react-qr-code`, `BarcodeDetector`, `navigator.mediaDevices.getUserMedia`, `window.requestAnimationFrame`, `window.cancelAnimationFrame`, and the `srcObject` setter and `play` of `HTMLMediaElement.prototype`. Spies on `getOpenPasskey` supply stale, locked or missing tab sessions; a green run does not prove real session-store behaviour under concurrent changes. The in-app test writes the page address with
  `history.replaceState`, because assigning `location.href` in this jsdom drops the fragment.
  A green run proves the idle card, the
  account choice after a dismissed login, the email form before create, the unknown card, the
  fixed error sentence, Close on the preparing card during a hanging login, and the desk
  actions against those stubs, including that a link keeps the ceremony token, that an unlocked
  list without Bitcoin links once, and that revocation uses the passkey. It does not
  prove a real ceremony, that Close cancels WebAuthn or logs out, a real in-app browser, a real
  iPhone, a real operating-system version, a real clipboard, a real system copy, that assigning
  `location.href` keeps the fragment in a real browser, the real `createWalletClient` or the real `PasskeyAuth`, the
  published components, that the server stored the
  mainnet login address, or that a Bitcoin row already in
  the list came from the API. WebAuthn stays a stub. A green run does not prove a real camera, a
  real BarcodeDetector, or a real QR image.
- **The wallet-client unit test replaces the wallet package and DFX API client.**
  A green run proves forwarding to the stubs, not a real wallet ceremony or API call.
- **The settings-context unit test replaces SDK hooks, app-handling context, browser-lang, application parameters, storage, and i18n.**
  A green run does not prove real account updates, app handling, browser language detection, persistent storage, or language loading.
- **The wallet entry unit test replaces the session, the page tree, and the connect form.**
  `src/__tests__/wallet-entry.test.tsx` replaces the service names from `App`, `@dfx.swiss/react`,
  `react-i18next`, `@dfx.swiss/react-components`, the connect wrapper, the custody-asset list, and the layout,
  settings, wallet, app-handling, app-params, feature-tree, navigation and resize hooks.
  It writes an incomplete `{ state: 'locked' }` passkey session into the tab session module via `setOpenPasskey`, and the mocked Connect wrapper clears it on “Use another passkey”; a green run proves neither a real passkey login nor a real session.
  A green run proves the signed-out `/wallet` path opens the passkey stub, a later sign-in
  closes it, and the other home branches in that file run against those stubs. It does not
  prove a real session, a real SDK, a real passkey ceremony, the published components, or
  that the home shell's other modes work against the real feature tree.
- **The wallet entry visual spec answers the bootstrap itself.**
  `e2e/wallet-entry.spec.ts` fulfils geolocation-db, the bootstrap GETs and `/v2/**`.
  The loading shot plants an account token and holds `GET /v2/user`. Before that shot, the
  spec enlarges the spinner, draws its track, forces the circle's stroke to a visible arc
  and turns its animation off, because the disabled animation frame is empty and the real
  circle is too small to read on the full page. The signed-out shot
  replaces `window.PublicKeyCredential` with a class that reports passkeys as available.
  The blocked shot removes `window.PublicKeyCredential`. The signed-in wallet shot injects a locked
  passkey tab session through the non-production hook; it does not prove a real passkey login or session.
  The logo, the home tiles, the wallet card background and the
  bottom picture are loaded from the public image host and pinned in the baseline. A green
  run proves `/wallet` renders the spinner, the idle card (`Log in with your device` and
  Log in), the blocked card (`This browser has no passkey support` and Close), and the
  home services from those fixtures, and that the address stays `/wallet`. It does not
  prove a real browser report, a real session, a real passkey ceremony, a real API, or that
  the image host keeps serving the same bytes.
- **The sitemap visual spec answers the bootstrap itself and plants an admin token.**
  `e2e/sitemap.spec.ts` fulfils geolocation-db, the bootstrap GETs and `/v2/**`, and stores
  a synthetic Admin JWT. The shell may load pictures from the public image host. A green
  run proves the sitemap renders the Passkey login (`/wallet`) link from that fixture. It
  does not prove a real admin session, a real API, or that the image host keeps serving the
  same bytes.
- **The connect-screen unit test replaces every wallet tile.**
  `src/__tests__/connect-wrapper.test.tsx` replaces `@dfx.swiss/react` and each connect tile, including
  the passkey tile, with a stub. A green run proves the wrapper renders the stub named by the wallet
  type. It does not prove the real tiles or a real session.
- **The wallet-context unit test replaces the SDK hooks.**
  `src/__tests__/wallet.context.test.tsx` replaces `@dfx.swiss/react` auth, session and user hooks with
  in-memory stubs. A green run proves the context calls those stubs for login, logout and storage.
  It does not prove a real login or the published SDK.
- **The feature-tree unit tests replace the flag hook and the SDK enum.**
  `src/__tests__/feature-tree.test.tsx` and `src/__tests__/feature-tree-passkey.test.tsx` replace
  `@dfx.swiss/react`, and the first file also replaces the feature-flag hook. A green run proves the
  passkey node follows the stubbed flag. It does not prove the real flag service or the published SDK.
- **The install-hint unit test replaces device detection and the component library.**
  `src/__tests__/install-hint.test.tsx` replaces `react-device-detect`, `@dfx.swiss/react` and
  `@dfx.swiss/react-components`. A green run proves the hint branch follows the stubbed device flags.
  It does not prove a real browser or the published components.
- **The entry unit test replaces the font package.**
  `src/__tests__/index.test.ts` replaces `@fontsource-variable/inter` with an empty module.
  A green run proves the entry imports that module before startup. It does not prove a browser loads
  the font file.
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

## Known gaps

All four points below concern the full-stack harness.

- **No layer here verifies a payment end to end.** The harness sets an explicit
  `DISABLED_PROCESSES` list in `e2e-stack/env/api.env` and leaves `PasskeyRegistration` off that
  list on purpose, so the loc ceremony can register. The listed jobs do not run, and transaction
  states are inserted with SQL instead. What is verified is the synchronous path: interaction,
  HTTP, validation, authorisation, persistence, display. A green run does not prove that every
  process is off, and it does not prove that a process added later and left off the list stays
  off. A cron without a `process` field is not covered by that list and keeps running — see the
  companion document in `DFXswiss/backend`.
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
