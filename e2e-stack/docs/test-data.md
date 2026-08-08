# E2E test data factories

Shared factories for Playwright specs against the `dfx-e2e-stack` Compose project.
Import from `./fixtures` (the barrel at `e2e-stack/specs/fixtures/index.ts` re-exports
factories, auth, db, and the other helpers) or from a specific module such as
`e2e-stack/specs/fixtures/factories`.

**Environment (inside the test container)**

| Service  | URL / connection                                                        |
| -------- | ----------------------------------------------------------------------- |
| API      | `http://api:3000` (`E2E_API_URL`), routes under `/v1` (KYC under `/v2`) |
| Frontend | `http://frontend`                                                       |
| Postgres | `sql-dfx-api-loc:5432`, db `dfx`, user `sa`                             |

A local forwarder on `127.0.0.1:3000` (started by the tests image entrypoint) also relays to the real API. That is why `http://localhost:3000` works from inside the container even though no API process runs there — code paths that hit `localhost` directly (e.g. server-built KYC-step URLs under `Environment.LOC`) need it.

Master data (fiats, assets, countries, languages, banks, fees, one wallet) is seeded at API boot.
`ENVIRONMENT=loc` mocks outbound HTTP, disables mail, and sets `DISABLED_PROCESSES=*` (no crons).

**Staff KYC clearance (elevated roles)**

Elevated API endpoints (Admin / Compliance / Support / RealUnit) also require staff KYC
clearance: a non-empty `user_data.verifiedName` plus the account's `user_data.id` in the
in-memory `staffKycClearance` set. `loginAs` sets `verifiedName` on every call.
`global.setup.ts` seeds the `staffKycClearance` setting for all six harness roles once per
test run and polls until the API's ~30s `resyncStaffKycClearance` picks it up — so elevated
roles reach gated endpoints/screens instead of being redirected to `/staff-kyc-required`.

**ChargebackBase fee seed**

`global.setup.ts` also idempotently inserts one unrestricted `fee` row with
`type = 'ChargebackBase'` (label `E2E-ChargebackBase`). The API's own master-data seed only
inserts `Base` rows, so without this workaround `GET /transaction/:id/refund` always 500s
with "Chargeback base fee is missing".

**Fresh price_rule timestamps**

`global.setup.ts` also backfills `price_rule.priceTimestamp` (a few hours in the future,
once per process) and `price_rule.referenceId` (from the API's own seed CSV) for every row
that has a `currentPrice`. The API's own seed script never writes those two columns even
though its CSV has them, so every seeded price is born "stale" and the pricing service falls
through to a live external fetch (e.g. Kraken) that this sandboxed network cannot reach —
without this workaround `PUT /v1/buy/paymentInfos` hangs or fails.

**Naming (Postgres / TypeORM)**

- Tables: snake_case entity names (`user_data`, `buy_crypto`, `payment_link`).
- Columns: camelCase as on the entity — quote multi-word names (`"kycLevel"`, `"userDataId"`).
- Table `"user"` must always be quoted (reserved word).

**Wallet indices**

- Sibling `auth.ts` reserves indices `0–6` for `loginAs` / default `testWallet`.
- Factories use indices `100 + counter` so they never collide with role wallets.
- The factory counter no longer starts at `0` in every process: once per process it is raised
  to a value derived from the DB (highest already-used `FACTORY_WALLET_INDEX_BASE`-relative
  offset), so two separate `docker compose run` invocations against the same database never
  collide on wallet addresses. As defense in depth, `createUser` also reuses an account's
  existing mail instead of calling `PUT /v2/user/mail` again when mail is already set
  (a second set would 403 with `TFA_REQUIRED`).

**Uniqueness**

- Mails: `e2e+<tag>-<counter>@dfx.swiss` (monotonic counter, optional tag).
- Never `Math.random()` or bare timestamps alone.

---

## Factories

### `createUser(options?)`

|                          |                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Path**                 | API sign-up via `signatureLogin` → `POST /v1/auth`; mail via `PUT /v2/user/mail` (first mail only); language via `PUT /v2/user`; country / `kycLevel` / `role` via SQL                                                                                                                                                                                                                                                          |
| **Returns**              | `{ userId, userDataId, address, jwt, wallet, mail? }`                                                                                                                                                                                                                                                                                                                                                                           |
| **Options**              | `tag`, `mail`, `language` (symbol), `country` (symbol), `kycLevel` (0–50 / −10 / −20), `role`, `completePersonalData`, `walletIndex`, `depositLimit`                                                                                                                                                                                                                                                                            |
| **Preconditions**        | API + DB up; seed wallet exists                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Why SQL for KYC/role** | `SignUpDto` has no mail/country/kycLevel. Mail is set after sign-up with `PUT /v2/user/mail` (first mail applies without verification). If the account already has mail (e.g. wallet index reused across runs), that existing mail is reused instead of calling the API again — a second set would require 2FA (`TFA_REQUIRED`). Arbitrary `kycLevel` and `role` are not public-API assignable without the full KYC/admin flow. |

`completePersonalData: true` (or `kycLevel >= 30`) fills personal columns so `UserData.isDataComplete` is true — **required for `POST /sell`**.

**`depositLimit` (kycLevel 50 only)**: the API's `UserData.tradingLimit` getter only reads
`user_data.depositLimit` once `kycLevel` reaches `50` (`KycLevel.LEVEL_50`, "dfx approval") — every
lower level uses a flat default limit instead. A `null` `depositLimit` (the column's default) at
level 50 resolves to an available trading limit of `0`, so every trade fails `LIMIT_EXCEEDED`
before any other check runs — a real level-50 approval always comes with a support-granted
`depositLimit`, which this SQL-only shortcut otherwise skips. `createUser` therefore sets
`depositLimit` to `1_000_000_000` CHF (matching the API's own
`Config.tradingLimits.yearlyDefault` "effectively unrestricted" ceiling) whenever `kycLevel` is
set to `50` and no explicit `depositLimit` is passed. Pass `depositLimit: 0` explicitly to test
the "level 50 but no limit granted" case instead.

### `createBankAccount(jwt, options?)`

|                     |                                                                                                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Path**            | API `POST /v1/bankAccount`                                                                                                                                                                                                                                          |
| **Returns**         | `{ bankAccountId, iban }` (ids are `bank_data` rows)                                                                                                                                                                                                                |
| **Options**         | `iban` (default `CH9300762011623852957`), `label`                                                                                                                                                                                                                   |
| **Preconditions**   | Authenticated JWT; IBAN must pass `IsDfxIban`                                                                                                                                                                                                                       |
| **IBAN validation** | `IsDfxIban` is **async**: format (`ibantools`) + blacklist from DB + BIC lookup via `BankAccountService` (may call external IBAN service). CH/LI domestic IBANs do not fail solely on missing BIC. Under `loc`, mocked HTTP can still break bank-detail enrichment. |

### `createBuy(jwt, options?)`

|                                     |                                                                                                                                                                                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Path**                            | Default **API `POST /v1/buy`** `{ asset }`. Optional `withPaymentInfo: true` → **`PUT /v1/buy/paymentInfos`** (frontend path).                                                                              |
| **Returns**                         | `{ buyId, routeId?, assetId? }`                                                                                                                                                                             |
| **Options**                         | `assetId`, `withPaymentInfo`, `currencyId`, `amount`, `iban`                                                                                                                                                |
| **Preconditions**                   | JWT; seeded buyable asset                                                                                                                                                                                   |
| **Why not paymentInfos by default** | Payment-info creation runs pricing through services that call outbound HTTP. With `HttpService` mocked in `loc`, that path often fails. `POST /buy` still creates a real buy route for list/detail screens. |

### `createSell(jwt, options?)`

|                   |                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Path**          | API `POST /v1/sell`; creates bank account internally if needed                                                                                    |
| **Returns**       | `{ sellId, iban, bankAccountId? }`                                                                                                                |
| **Options**       | `iban`, `currencyId`, `blockchain` (default `Ethereum`), `bankAccountId`                                                                          |
| **Preconditions** | **Unused** deposit for the blockchain (`deposit` row with no `deposit_route`); user `isDataComplete` (factory calls `ensurePersonalDataComplete`) |
| **Error**         | Clear message if no free deposit (mentions `EVM_DEPOSIT_SEED`)                                                                                    |

### `createSwap(jwt, options?)`

|                   |                                                                |
| ----------------- | -------------------------------------------------------------- |
| **Path**          | API `POST /v1/swap`; raises `kycLevel` to 30 via SQL if needed |
| **Returns**       | `{ swapId, assetId }`                                          |
| **Options**       | `assetId`, `blockchain`                                        |
| **Preconditions** | Unused deposit; KYC ≥ 30 or ACTIVE (factory forces level 30)   |

### `createTransaction(options?)`

|             |                                                                                                                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Path**    | **SQL only** for process rows (creates user/routes via other factories as needed)                                                                                                                                 |
| **Returns** | `{ transactionId, uid, buyCryptoId?, buyFiatId?, bankTxId?, cryptoInputId?, buyId?, sellId?, userId?, userDataId? }`                                                                                              |
| **Options** | `state`: `completed_buy` (default) \| `pending_buy` \| `completed_sell` \| `pending_sell` \| `bank_tx_only`; `userId` / `userDataId` / `jwt`; `buyId` / `sellId`; amounts / AML fields                            |
| **Why SQL** | In production, `buy_crypto` / `buy_fiat` are created by crons reacting to bank txs / crypto deposits. Here `DISABLED_PROCESSES=*` disables those jobs. There is no customer API to force a completed process row. |

**Tables involved (completed buy)**

1. `transaction` — NOT NULL: `sourceType`, `uid`
2. `bank_tx` — NOT NULL: `accountServiceRef`
3. `buy_crypto` — NOT NULL: `transactionId` (JoinColumn); defaults for `version`, `status`, `isComplete`, `amlPostProcessed`

**Tables involved (completed sell)**

1. `transaction`
2. `crypto_input` — NOT NULL: `inTxId`, `amount`; embedded `addressAddress` / `addressBlockchain` / destination pair
3. `buy_fiat` — NOT NULL: `transactionId`, `cryptoInputId`, `sellId` (sell relation required)

### `createBankTx(options?)`

|             |                                                                              |
| ----------- | ---------------------------------------------------------------------------- |
| **Path**    | SQL (`bank_tx` + optional `transaction`)                                     |
| **Returns** | `{ bankTxId, transactionId?, accountServiceRef }`                            |
| **Why SQL** | Bank bookings arrive from bank integrations / import jobs (disabled in loc). |

### `createSupportIssue(jwt, options?)`

|                   |                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------- |
| **Path**          | API `POST /v1/support/issue`                                                          |
| **Returns**       | `{ supportIssueId?, uid, messageId? }`                                                |
| **Options**       | `type` (default `GenericIssue`), `reason` (default `Other`), `name`, `message`, `tag` |
| **Preconditions** | User must have **mail** (factory sets it if missing)                                  |

### `createPaymentLink(jwt, options?)`

|             |                                                                                                                                                                                                                                                                                                                 |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Path**    | **SQL** (deposit + `deposit_route` type Sell on Lightning + `payment_link` + `payment_link_payment`)                                                                                                                                                                                                            |
| **Returns** | `{ paymentLinkId, uniqueId, paymentId?, routeId? }`                                                                                                                                                                                                                                                             |
| **Why SQL** | API `POST /paymentLink` only allows **Lightning** routes and requires free Lightning deposits + `paymentLinksAllowed`. Global EVM deposit seed does not include Lightning, so the API path is usually unavailable. Factory enables `paymentLinksAllowed` and inserts a synthetic Lightning deposit when needed. |

### `createKycStep(userDataId, options?)`

|             |                                                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------------------- |
| **Path**    | SQL into `kyc_step`                                                                                            |
| **Returns** | `{ kycStepId, userDataId }`                                                                                    |
| **Options** | `name` (default `ContactData`), `status` (default `InProgress`), `type`, `sequenceNumber`, `result`, `comment` |
| **Why SQL** | Steps are created by the KYC engine as the user progresses; no public “insert step in status X” API.           |

### `createLimitRequest(options?)`

|             |                                                                                        |
| ----------- | -------------------------------------------------------------------------------------- |
| **Path**    | Prefer API support issue `type: LimitRequest` with nested `limitRequest`; SQL fallback |
| **Returns** | `{ limitRequestId, supportIssueId?, supportIssueUid? }`                                |

### `createMrosCase(options?)`

|             |                                              |
| ----------- | -------------------------------------------- |
| **Path**    | SQL into `mros`                              |
| **Returns** | `{ mrosId, userDataId }`                     |
| **Why SQL** | Compliance-internal; no customer create API. |

### `createCallQueueEntry(options?)`

|               |                                                                                                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Path**      | SQL on `user_data."phoneCallStatus"` (+ optional pending `buy_crypto` via `createTransaction`)                                                                                                                                       |
| **Returns**   | `{ userDataId, phoneCallStatus?, transactionId?, buyCryptoId? }`                                                                                                                                                                     |
| **Important** | **There is no `call_queue` table.** Support dashboard queues are derived (`support.service.ts`): phone statuses `Unavailable` / `Suspicious`, or pending txs with AML reasons such as `ManualCheckPhone`, `ManualCheckIpPhone`, etc. |

### `cleanupCreatedData()`

Deletes every row tracked during this process (`{ table, id }`) in reverse creation order. Best-effort; returns `{ deleted, errors }`.

### Helpers

- `requireUnusedDeposit(blockchain)` — throws if no free deposit.
- `ensurePersonalDataComplete(userDataId)` — SQL fill for `isDataComplete`.
- `e2eMail(tag?)`, `TEST_IBAN`, `resetFactoryCounter()`.

---

## States that are **not** achievable (or hard)

| Goal                                                             | Why not                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real bank/crypto **arrival** → auto process                      | Crons disabled (`DISABLED_PROCESSES=*`)                                                                                                                                                                                                       |
| Live **price-based** payment infos                               | Outbound HTTP mocked; CoinGecko/etc. unreliable                                                                                                                                                                                               |
| Full **Sumsub / IdNow** KYC completion                           | External ident providers mocked; use `createKycStep` + SQL `kycLevel`                                                                                                                                                                         |
| Mail **verification codes** after first mail                     | Mail sending disabled; first `PUT /v2/user/mail` applies immediately when mail was null                                                                                                                                                       |
| Real **Lightning** payment-link API path                         | No Lightning deposits from EVM seed; factory uses SQL synthetic Lightning deposit                                                                                                                                                             |
| Direct **call_queue** row                                        | Derived view only — set phone status / AML reason                                                                                                                                                                                             |
| Mail-login + **TOTP** second factor                              | Staff/mail login with TOTP is not automated here. Elevated (KYC-gated) access via `loginAs` for Admin/Compliance/Support/RealUnit **is** reliable after global.setup seeds staff KYC clearance — only the mail+TOTP path remains unautomated. |
| Payout / batch **Complete** with on-chain `txId` from real chain | No blockchain nodes; factory sets placeholder `txId` / amounts for UI only                                                                                                                                                                    |
| **Checkout / card** txs                                          | External Checkout provider mocked; not covered by these factories                                                                                                                                                                             |

### Transaction states attempted

| State                                    | Supported? | Notes                                         |
| ---------------------------------------- | ---------- | --------------------------------------------- |
| `completed_buy`                          | Yes (SQL)  | `buy_crypto` Complete + bank_tx + transaction |
| `pending_buy`                            | Yes (SQL)  | Created / Pending AML                         |
| `completed_sell`                         | Yes (SQL)  | Needs sell route + crypto_input + buy_fiat    |
| `pending_sell`                           | Yes (SQL)  | Same graph, incomplete flags                  |
| `bank_tx_only`                           | Yes (SQL)  | Unmatched bank booking for compliance screens |
| Batched / PayingOut / liquidity pipeline | No         | Would need batch entities + LM pipeline crons |
| Chargeback completed                     | No         | Needs fiat_output + multi-step support flow   |
| CheckoutTx-sourced buy                   | No         | External card provider                        |

---

## Worked example

```ts
import { createUser, createBuy, createTransaction, cleanupCreatedData } from './fixtures/factories';
import { queryOne } from './fixtures/db';

const user = await createUser({ tag: 'tx-list', kycLevel: 30, completePersonalData: true });
const buy = await createBuy(user.jwt);
const tx = await createTransaction({
  state: 'completed_buy',
  userId: user.userId,
  userDataId: user.userDataId,
  jwt: user.jwt,
  buyId: buy.buyId,
});

// Navigate to /tx/:uid or assert DB
const row = await queryOne(`SELECT uid FROM transaction WHERE id = $1`, [tx.transactionId]);

await cleanupCreatedData();
```

See also `e2e-stack/specs/factories.spec.ts` for end-to-end factory coverage without a browser.

---

## API client

`apiGet` / `apiPost` / `apiPut` / `apiDelete` in `fixtures/api-client.ts`:

- Base: `E2E_API_URL` (default `http://api:3000`)
- `version`: `'v1' | 'v2'` (default `v1`); path must **not** include the version prefix
- Non-2xx throws: `METHOD /v1/path failed: HTTP status — body`
