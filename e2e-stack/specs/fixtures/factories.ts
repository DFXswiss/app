/**
 * Shared e2e test-data factories for the dfx-e2e-stack Playwright suite.
 *
 * Prefer real API calls so validation paths match production. Fall back to direct SQL only
 * when no API can reach the desired state (disabled crons in ENVIRONMENT=loc, derived views,
 * or staff-only fields such as arbitrary kycLevel / role).
 *
 * Wallet index range: factory wallets use indices starting at FACTORY_WALLET_INDEX_BASE (100)
 * plus an in-process counter. Sibling auth.ts reserves indices 0–6 for loginAs / default
 * testWallet usage; starting at 100 avoids collisions under workers: 1.
 */

import { apiGet, apiPost, apiPut } from './api-client';
import { queryOne, queryRows, withDb } from './db';
import { signatureLogin, testWallet, type TestRole, type TestWallet } from './auth';
import { TEST_IBAN } from './test-data';

// ---------------------------------------------------------------------------
// Counters & cleanup registry
// ---------------------------------------------------------------------------

/** Sibling auth reserves 0–6 for staff/role wallets; factories start well above that. */
const FACTORY_WALLET_INDEX_BASE = 100;

/**
 * Counter for uniqueTag()/e2eMail() suffixes. Deliberately separate from factoryWalletCounter
 * below: many factories (createBankTx, createSupportIssue, createPaymentLink,
 * createLimitRequest, createMrosCase, createCallQueueEntry) call uniqueTag()/e2eMail() without
 * ever deriving a wallet. Sharing one counter between "tag suffix" and "wallet offset" would
 * open gaps in the wallet-offset space wide enough to defeat deriveFactoryWalletStart's
 * empty-window abort below — see the comment on deriveFactoryWalletStart for the failure mode.
 */
let factoryTagCounter = 0;

function nextTagCounter(): number {
  factoryTagCounter += 1;
  return factoryTagCounter;
}

function uniqueTag(tag?: string): string {
  const c = nextTagCounter();
  return tag ? `${tag}-${c}` : String(c);
}

/**
 * Counter for wallet offsets only (FACTORY_WALLET_INDEX_BASE + n). Only ever incremented where
 * a wallet is actually derived (createUser, via nextWalletOffset()) and raised by
 * ensureFactoryWalletCounterSeeded() below — never by uniqueTag()/e2eMail(). This keeps wallet
 * offsets densely allocated so deriveFactoryWalletStart's "first empty window" abort is valid.
 */
let factoryWalletCounter = 0;

function nextWalletOffset(): number {
  factoryWalletCounter += 1;
  return factoryWalletCounter;
}

export function e2eMail(tag?: string): string {
  return `e2e+${uniqueTag(tag)}@dfx.swiss`;
}

/**
 * Scans the DB for the highest FACTORY_WALLET_INDEX_BASE-relative offset already used by
 * a "user" row, so a fresh process's factoryWalletCounter can start above it instead of at 0 —
 * otherwise two separate `docker compose run` processes against the same DB would derive
 * the same wallet addresses and collide (see docs/test-data.md, "Wallet indices"). This also
 * protects a *single* `docker compose run` invocation covering multiple spec files: Playwright
 * may run different spec files in different worker processes even with `workers: 1` (worker
 * reuse across files is not guaranteed), and each fresh worker process re-imports this module
 * with `factoryWalletStartApplied` back at its initial `false`, so it re-derives from the DB —
 * seeing every wallet a prior file's worker already committed — instead of restarting at 0.
 * Windows grow exponentially so a DB with only a handful of factory accounts resolves in
 * one query, while one with many still terminates in a bounded number of round trips.
 * Stops at the first window that comes back with zero hits at all — a real gap that large
 * (256+ consecutive unused offsets) never happens from normal factory usage now that wallet
 * offsets are allocated from their own dedicated factoryWalletCounter (via nextWalletOffset()),
 * kept separate from the uniqueTag()/e2eMail() tag counter: every offset in
 * [1, factoryWalletCounter] is allocated to exactly one createUser call, so usage within the
 * used range is dense and an empty window reliably means "past the end".
 */
async function deriveFactoryWalletStart(): Promise<number> {
  let highest = 0;
  let windowStart = 1;
  let windowSize = 256;
  const maxWindowSize = 8192;
  const maxOffset = 200_000; // sanity bound against a runaway loop; never expected in practice

  while (windowStart <= maxOffset) {
    const addressToOffset = new Map<string, number>();
    const windowEnd = windowStart + windowSize - 1;
    for (let offset = windowStart; offset <= windowEnd; offset++) {
      const { address } = testWallet(FACTORY_WALLET_INDEX_BASE + offset);
      addressToOffset.set(address.toLowerCase(), offset);
    }
    const rows = await queryRows<{ address: string }>(
      `SELECT address FROM "user" WHERE lower(address) = ANY($1::text[])`,
      [[...addressToOffset.keys()]],
    );
    if (rows.length === 0) break;
    for (const row of rows) {
      const offset = addressToOffset.get(row.address.toLowerCase());
      if (offset != null && offset > highest) highest = offset;
    }
    windowStart = windowEnd + 1;
    windowSize = Math.min(windowSize * 2, maxWindowSize);
  }
  return highest;
}

let factoryWalletStartPromise: Promise<number> | null = null;
let factoryWalletStartApplied = false;

/**
 * Raises `factoryWalletCounter` (once per process) to the DB-derived starting point so newly
 * allocated wallet indices never collide with a prior process's accounts in the same DB.
 * Safe to call more than once or concurrently — memoized via the promise, and only ever
 * raises the counter, never lowers it (so it composes fine with normal in-process usage
 * that may have already advanced the counter before this resolves).
 */
async function ensureFactoryWalletCounterSeeded(): Promise<void> {
  if (factoryWalletStartApplied) return;
  if (!factoryWalletStartPromise) factoryWalletStartPromise = deriveFactoryWalletStart();
  const start = await factoryWalletStartPromise;
  if (factoryWalletCounter < start) factoryWalletCounter = start;
  factoryWalletStartApplied = true;
}

// Best-effort head start for the wallet counter, kicked off at module load rather than lazily
// on the first `createUser` call. This is purely a latency optimization: `createUser` always
// `await`s `ensureFactoryWalletCounterSeeded()` itself and is therefore correct regardless of
// timing, but starting the DB round trip this early means that by the time any actual
// Playwright test body runs (after file collection/module resolution/browser startup —
// reliably slower than one local Postgres round trip) the promise has typically already
// resolved. Note this only affects `factoryWalletCounter`; `uniqueTag()`/`e2eMail()` use the
// independent `factoryTagCounter`, seeded separately below.
void ensureFactoryWalletCounterSeeded();

/**
 * Scans user_data.mail for the highest numeric suffix already used by an e2e-generated address
 * (uniqueTag()/e2eMail() always end in `-<n>@dfx.swiss`, or just `<n>@dfx.swiss` when no tag is
 * given), so a fresh process's factoryTagCounter can start above it instead of at 0 — otherwise
 * two separate `docker compose run` invocations against the same DB synthesize the exact same
 * mail address, and PUT /v2/user/mail on the second one 409s with "Account already exists" (the
 * address already belongs to the first run's account). Unlike wallet offsets, no address
 * derivation/window-scan is needed here — the counter value is stored directly in the mail text,
 * so one aggregate query reads it back. Does not need to find the *exact* highest value, only a
 * value guaranteed to be at or above it — MAX() over every matching row already guarantees that,
 * even though some matches (e.g. from testEmail() in test-data.ts, a separate counter/namespace
 * that happens to produce the same `e2e+<tag>-<n>@dfx.swiss` shape) aren't actually
 * factoryTagCounter values; treating them as if they were only pushes the start higher, never
 * lower, which is safe.
 */
async function deriveFactoryTagStart(): Promise<number> {
  const row = await queryOne<{ highest: number | null }>(
    `SELECT MAX((regexp_match(mail, '(\\d+)@dfx\\.swiss$'))[1]::int) AS highest
     FROM user_data
     WHERE mail LIKE 'e2e+%@dfx.swiss'`,
  );
  return row?.highest ?? 0;
}

let factoryTagStartPromise: Promise<number> | null = null;
let factoryTagStartApplied = false;

/**
 * Raises `factoryTagCounter` (once per process) to the DB-derived starting point, mirroring
 * `ensureFactoryWalletCounterSeeded` above for the same reason — see `deriveFactoryTagStart`.
 * Safe to call more than once or concurrently — memoized via the promise, and only ever raises
 * the counter, never lowers it.
 */
async function ensureFactoryTagCounterSeeded(): Promise<void> {
  if (factoryTagStartApplied) return;
  if (!factoryTagStartPromise) factoryTagStartPromise = deriveFactoryTagStart();
  const start = await factoryTagStartPromise;
  if (factoryTagCounter < start) factoryTagCounter = start;
  factoryTagStartApplied = true;
}

// Same best-effort head start as the wallet counter above, for the same reason: uniqueTag()/
// e2eMail() are synchronous, public exports whose signatures must not change, so they cannot
// await this themselves. createUser (below) awaits this properly before it can generate a mail
// address and is therefore always correct regardless of timing; this just gives every other
// direct caller (other spec files, other factories) a head start too.
void ensureFactoryTagCounterSeeded();

// TEST_IBAN lives in ./test-data — the single place for shared constants. Re-exported here so
// callers can keep importing it alongside the factories, but not redeclared: two `export const`s
// of the same name would make `export *` from the barrel drop the name as ambiguous.
export { TEST_IBAN } from './test-data';

interface CreatedRef {
  table: string;
  id: number;
}

const created: CreatedRef[] = [];

function track(table: string, id: number | undefined | null): void {
  if (id != null && Number.isFinite(Number(id))) {
    created.push({ table, id: Number(id) });
  }
}

// ---------------------------------------------------------------------------
// Option / result types
// ---------------------------------------------------------------------------

export type KycLevelValue = 0 | 10 | 20 | 30 | 40 | 50 | -10 | -20;

/**
 * Generous default for user_data.depositLimit (CHF), applied by createUser whenever kycLevel
 * reaches 50 (KycLevel.LEVEL_50, "dfx approval") without an explicit depositLimit override.
 * UserData.tradingLimit (api user-data.entity.ts) only reads depositLimit at level 50 — every
 * lower level uses a flat Config.tradingLimits.monthlyDefaultWoKyc instead — but at level 50 a
 * null depositLimit (the column's default) resolves to an available trading limit of exactly 0
 * (null arithmetic, not "unlimited"), so every trade fails LIMIT_EXCEEDED before any other check.
 * A real level-50 approval always comes with a support-granted depositLimit
 * (limit-request.service.ts); this SQL-only shortcut skips that step, hence the default here.
 * Matches api/src/config/config.ts Config.tradingLimits.yearlyDefault — the API's own
 * "effectively unrestricted" ceiling — so no realistic test amount ever hits it.
 */
const DEFAULT_TEST_DEPOSIT_LIMIT = 1_000_000_000;

export interface CreateUserOptions {
  /** Optional tag embedded in mail addresses for debuggability. */
  tag?: string;
  mail?: string;
  /** Language symbol (e.g. 'EN', 'DE'). Resolved via language table. */
  language?: string;
  /** ISO country symbol (e.g. 'CH', 'DE'). Set via SQL on user_data."countryId". */
  country?: string;
  /** KycLevel numeric value; written via SQL (no public API for arbitrary level). */
  kycLevel?: KycLevelValue;
  /** Role string matching UserRole enum values (e.g. 'User', 'Admin'). SQL on "user".role. */
  role?: TestRole | string;
  /** When true (default if kycLevel >= 20 or sell routes needed), fill isDataComplete personal fields. */
  completePersonalData?: boolean;
  /** Force a specific wallet index (still offset by FACTORY_WALLET_INDEX_BASE unless absoluteIndex). */
  walletIndex?: number;
  /**
   * Override user_data.depositLimit (CHF). Only meaningful when kycLevel is (or becomes) 50 — see
   * DEFAULT_TEST_DEPOSIT_LIMIT above for why. When kycLevel is set to 50 and this is omitted,
   * createUser applies DEFAULT_TEST_DEPOSIT_LIMIT automatically so the account is actually able
   * to trade. Pass 0 explicitly to test the "no limit granted" case at level 50.
   */
  depositLimit?: number;
}

export interface CreateUserResult {
  userId: number;
  userDataId: number;
  address: string;
  jwt: string;
  wallet: TestWallet;
  mail?: string;
}

export interface CreateBankAccountOptions {
  iban?: string;
  label?: string;
}

export interface CreateBankAccountResult {
  bankAccountId: number;
  iban: string;
}

export interface CreateBuyOptions {
  /** Asset id; when omitted, first buyable asset is resolved from GET /asset. */
  assetId?: number;
  /**
   * When true, use PUT /buy/paymentInfos (frontend path) with currency + amount.
   * Requires working price feeds; under mocked HttpService this may fail — prefer POST /buy.
   */
  withPaymentInfo?: boolean;
  currencyId?: number;
  amount?: number;
  iban?: string;
}

export interface CreateBuyResult {
  buyId: number;
  routeId?: number;
  assetId?: number;
}

export interface CreateSellOptions {
  iban?: string;
  currencyId?: number;
  blockchain?: string;
  /** When set, reuse this bank account id instead of creating one. */
  bankAccountId?: number;
}

export interface CreateSellResult {
  sellId: number;
  iban: string;
  bankAccountId?: number;
}

export interface CreateSwapOptions {
  assetId?: number;
  blockchain?: string;
}

export interface CreateSwapResult {
  swapId: number;
  assetId: number;
}

export type TransactionState =
  | 'completed_buy'
  | 'pending_buy'
  | 'completed_sell'
  | 'pending_sell'
  | 'bank_tx_only';

export interface CreateTransactionOptions {
  tag?: string;
  state?: TransactionState;
  userId?: number;
  userDataId?: number;
  jwt?: string;
  /** Buy route id for buy_crypto linkage. Created if missing for buy states. */
  buyId?: number;
  /** Sell route id for buy_fiat linkage. Created if missing for sell states. */
  sellId?: number;
  amount?: number;
  inputAsset?: string;
  amlReason?: string;
  amlCheck?: string;
}

export interface CreateTransactionResult {
  transactionId: number;
  uid: string;
  buyCryptoId?: number;
  buyFiatId?: number;
  bankTxId?: number;
  cryptoInputId?: number;
  buyId?: number;
  sellId?: number;
  userId?: number;
  userDataId?: number;
}

export interface CreateBankTxOptions {
  tag?: string;
  amount?: number;
  currency?: string;
  iban?: string;
  type?: string;
  userId?: number;
  userDataId?: number;
  /** When true, also create a linked transaction row. Default true. */
  withTransaction?: boolean;
}

export interface CreateBankTxResult {
  bankTxId: number;
  transactionId?: number;
  accountServiceRef: string;
}

export interface CreateSupportIssueOptions {
  tag?: string;
  type?: string;
  reason?: string;
  name?: string;
  message?: string;
}

export interface CreateSupportIssueResult {
  supportIssueId?: number;
  uid: string;
  messageId?: number;
}

export interface CreatePaymentLinkOptions {
  tag?: string;
  amount?: number;
  currency?: string;
  label?: string;
  externalId?: string;
  routeId?: number;
}

export interface CreatePaymentLinkResult {
  paymentLinkId: number;
  uniqueId: string;
  paymentId?: number;
  routeId?: number;
}

export interface CreateKycStepOptions {
  name?: string;
  status?: string;
  type?: string;
  sequenceNumber?: number;
  result?: string;
  comment?: string;
}

export interface CreateKycStepResult {
  kycStepId: number;
  userDataId: number;
}

export interface CreateLimitRequestOptions {
  tag?: string;
  limit?: number;
  investmentDate?: string;
  fundOrigin?: string;
  fundOriginText?: string;
  jwt?: string;
  userDataId?: number;
}

export interface CreateLimitRequestResult {
  limitRequestId: number;
  supportIssueId?: number;
  supportIssueUid?: string;
}

export interface CreateMrosCaseOptions {
  userDataId?: number;
  status?: string;
  caseManager?: string;
  reason?: string;
  reportCode?: string;
  tag?: string;
}

export interface CreateMrosCaseResult {
  mrosId: number;
  userDataId: number;
}

export interface CreateCallQueueEntryOptions {
  /** Unavailable/Suspicious phone-call queue entry on user_data. */
  phoneCallStatus?: 'Unavailable' | 'Suspicious' | 'ManualCheck' | 'Failed' | 'Completed' | 'Repeat' | 'UserRejected';
  /** When set, also create a pending buy_crypto with this amlReason for the tx-based queues. */
  amlReason?: string;
  userDataId?: number;
  userId?: number;
  jwt?: string;
  tag?: string;
}

export interface CreateCallQueueEntryResult {
  userDataId: number;
  phoneCallStatus?: string;
  transactionId?: number;
  buyCryptoId?: number;
}

// ---------------------------------------------------------------------------
// SQL helpers
// ---------------------------------------------------------------------------

async function insertReturningId(
  table: string,
  columns: string[],
  values: unknown[],
  returning = 'id',
): Promise<number> {
  const colSql = columns.map((c) => (c.startsWith('"') ? c : needsQuote(c) ? `"${c}"` : c)).join(', ');
  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `INSERT INTO ${tableSql(table)} (${colSql}) VALUES (${placeholders}) RETURNING ${returning}`;
  const row = await withDb(async (client) => {
    const res = await client.query(sql, values);
    return res.rows[0] as Record<string, unknown> | undefined;
  });
  if (!row || row[returning] == null) {
    throw new Error(`INSERT into ${table} did not return ${returning}`);
  }
  const id = Number(row[returning]);
  track(table, id);
  return id;
}

const RESERVED_COLUMNS = new Set(['user', 'limit', 'order', 'group', 'check', 'default', 'table']);

function needsQuote(col: string): boolean {
  // Multi-word camelCase or reserved names need double quotes in Postgres.
  return /[A-Z]/.test(col) || RESERVED_COLUMNS.has(col);
}

function tableSql(table: string): string {
  if (table === 'user') return '"user"';
  return table;
}

async function updateById(table: string, id: number, sets: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(sets);
  if (!keys.length) return;
  const assignments = keys
    .map((k, i) => {
      const col = needsQuote(k) ? `"${k}"` : k;
      return `${col} = $${i + 1}`;
    })
    .join(', ');
  const values = keys.map((k) => sets[k]);
  await withDb(async (client) => {
    await client.query(`UPDATE ${tableSql(table)} SET ${assignments} WHERE id = $${keys.length + 1}`, [
      ...values,
      id,
    ]);
  });
}

let uidCounter = 0;

/**
 * A value that is unique across processes and across runs against the same database, with a
 * readable label appended for debugging. Used wherever a column carries a unique constraint —
 * relying on the tag counter alone breaks as soon as a fresh process starts it over.
 */
function uniqueRef(label: string): string {
  uidCounter += 1;
  return `${Date.now().toString(36)}${uidCounter}-${label}`;
}

function uid(prefix: string, tag: string): string {
  // Matches the Config.prefixes style (T/I/pl/plp) plus 16 alphanumeric characters.
  //
  // The distinguishing part has to come FIRST. The window truncates the tail, and a tag of 16
  // characters or more pushed the timestamp out entirely — the value then depended on the tag
  // alone, so a second run against the same database produced the same transaction uid and hit
  // the unique constraint. The tag now fills whatever space is left and serves readability only.
  uidCounter += 1;
  const unique = `${Date.now().toString(36)}${uidCounter}`.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const label = tag.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `${prefix}${`${unique}${label}`.slice(0, 16).padEnd(16, '0')}`;
}

// ---------------------------------------------------------------------------
// Master-data resolvers
// ---------------------------------------------------------------------------

async function resolveLanguageId(symbol?: string): Promise<number | undefined> {
  if (!symbol) return undefined;
  const row = await queryOne<{ id: number }>(`SELECT id FROM language WHERE symbol = $1 LIMIT 1`, [
    symbol.toUpperCase(),
  ]);
  return row?.id;
}

async function resolveCountryId(symbol?: string): Promise<number | undefined> {
  if (!symbol) return undefined;
  const row = await queryOne<{ id: number }>(`SELECT id FROM country WHERE symbol = $1 LIMIT 1`, [
    symbol.toUpperCase(),
  ]);
  return row?.id;
}

async function resolveFiatId(nameOrId?: number | string): Promise<number> {
  if (typeof nameOrId === 'number') return nameOrId;
  const name = (nameOrId ?? 'CHF').toUpperCase();
  const row = await queryOne<{ id: number }>(`SELECT id FROM fiat WHERE name = $1 LIMIT 1`, [name]);
  if (!row) throw new Error(`Fiat currency "${name}" not found in seed data`);
  return row.id;
}

async function resolveBuyableAsset(assetId?: number, blockchain?: string): Promise<{ id: number; blockchain?: string }> {
  if (assetId) {
    const row = await queryOne<{ id: number; blockchain: string }>(
      `SELECT id, blockchain FROM asset WHERE id = $1 LIMIT 1`,
      [assetId],
    );
    if (!row) throw new Error(`Asset id ${assetId} not found`);
    return row;
  }
  if (blockchain) {
    const row = await queryOne<{ id: number; blockchain: string }>(
      `SELECT id, blockchain FROM asset WHERE buyable = true AND blockchain = $1 ORDER BY id ASC LIMIT 1`,
      [blockchain],
    );
    if (row) return row;
  }
  // Prefer Ethereum (common EVM deposit seed), then any buyable coin/token.
  const eth = await queryOne<{ id: number; blockchain: string }>(
    `SELECT id, blockchain FROM asset WHERE buyable = true AND blockchain = 'Ethereum' ORDER BY id ASC LIMIT 1`,
  );
  if (eth) return eth;
  const any = await queryOne<{ id: number; blockchain: string }>(
    `SELECT id, blockchain FROM asset WHERE buyable = true ORDER BY id ASC LIMIT 1`,
  );
  if (!any) throw new Error('No buyable asset found in seed data (GET /asset / asset table)');
  return any;
}

/** Resolve a sellable fiat id (default CHF). */
async function resolveSellableFiatId(nameOrId?: number | string): Promise<number> {
  if (typeof nameOrId === 'number') return nameOrId;
  const name = (nameOrId ?? 'CHF').toUpperCase();
  const row = await queryOne<{ id: number }>(
    `SELECT id FROM fiat WHERE name = $1 AND sellable = true LIMIT 1`,
    [name],
  );
  if (row) return row.id;
  return resolveFiatId(name);
}

/**
 * Ensure at least one unused deposit exists for the blockchain (not yet linked to deposit_route).
 * Throws a clear precondition error instead of a cryptic FK / "No unused deposit" stack.
 */
export async function requireUnusedDeposit(blockchain: string): Promise<void> {
  const row = await queryOne<{ id: number }>(
    `SELECT d.id
     FROM deposit d
     LEFT JOIN deposit_route r ON r."depositId" = d.id
     WHERE r.id IS NULL
       AND d.blockchains LIKE $1
     LIMIT 1`,
    [`%${blockchain}%`],
  );
  if (!row) {
    throw new Error(
      `No unused deposit address for blockchain "${blockchain}". ` +
        `Global setup must seed free rows in deposit (EVM_DEPOSIT_SEED) before createSell/createSwap ` +
        `(and buy routes that allocate a deposit) can succeed. ` +
        `Checked: deposit rows with blockchains LIKE '%${blockchain}%' and no deposit_route."depositId" link.`,
    );
  }
}

/**
 * Fill personal-data columns so UserData.isDataComplete is true.
 * Required for POST /sell (createSell checks isDataComplete).
 * No public API sets all of these without the full KYC flow → SQL.
 */
export async function ensurePersonalDataComplete(userDataId: number, options?: { country?: string }): Promise<void> {
  const countryId = (await resolveCountryId(options?.country ?? 'CH')) ?? (await resolveCountryId('DE'));
  await updateById('user_data', userDataId, {
    accountType: 'Personal',
    firstname: 'E2E',
    surname: 'Tester',
    street: 'Teststrasse',
    location: 'Zug',
    zip: '6300',
    phone: '+41791234567',
    ...(countryId != null ? { countryId } : {}),
  });
}

// ---------------------------------------------------------------------------
// 1. createUser
// ---------------------------------------------------------------------------

export async function createUser(options: CreateUserOptions = {}): Promise<CreateUserResult> {
  if (options.walletIndex == null) await ensureFactoryWalletCounterSeeded();
  await ensureFactoryTagCounterSeeded();
  const c = nextWalletOffset();
  const walletIndex = options.walletIndex ?? FACTORY_WALLET_INDEX_BASE + c;
  // Prefer API sign-up: signatureLogin creates the account when the address is new
  // (POST /v1/auth → AuthService.authenticate / doSignUp).
  const wallet = testWallet(walletIndex);
  const jwt = await signatureLogin(wallet);

  const userRow = await queryOne<{ id: number; userDataId: number }>(
    `SELECT id, "userDataId" AS "userDataId" FROM "user" WHERE address = $1 LIMIT 1`,
    [wallet.address],
  );
  if (!userRow) {
    throw new Error(
      `createUser: no "user" row after signatureLogin for address ${wallet.address}. ` +
        `Auth sign-up may have failed or the address column does not match.`,
    );
  }
  // Registration order is the deletion order, reversed: cleanupCreatedData() below deletes in
  // reverse registration order. user.userDataId -> user_data.id is NOT NULL with
  // ON DELETE NO ACTION, so the dependent row (user_data) must be registered LAST here to be
  // deleted FIRST during cleanup — before the "user" row that references it.
  track('user_data', userRow.userDataId);
  track('user', userRow.id);

  const existingMailRow = await queryOne<{ mail: string | null }>(
    `SELECT mail FROM user_data WHERE id = $1`,
    [userRow.userDataId],
  );
  let mail: string;
  if (existingMailRow?.mail) {
    // trySetUserMail (api UserDataService) only accepts the FIRST mail on an account without
    // 2FA; setting a second one 403s with TFA_REQUIRED, which this harness cannot satisfy.
    // Reuse the account's existing mail instead of blindly retrying the call.
    mail = existingMailRow.mail;
    if (options.mail && options.mail.toLowerCase() !== mail.toLowerCase()) {
      throw new Error(
        `createUser: account ${userRow.id} (user_data ${userRow.userDataId}, address ${wallet.address}) ` +
          `already has mail "${mail}" set and cannot be changed to "${options.mail}" without 2FA ` +
          `(would surface as a bare 403 TFA_REQUIRED). Pass a fresh walletIndex, omit "mail", or ` +
          `reuse the existing mail instead.`,
      );
    }
  } else {
    mail = options.mail ?? e2eMail(options.tag);
    // First-time mail set via PUT /v2/user/mail (no verification when mail is null — trySetUserMail).
    // SignUpDto does not carry mail; this is the real post-signup path.
    await apiPut<unknown>('user/mail', { mail }, { jwt, version: 'v2', expectOk: true });
  }

  if (options.language) {
    const languageId = await resolveLanguageId(options.language);
    if (languageId) {
      // PUT /v2/user accepts UpdateUserDto.language as EntityDto { id }.
      await apiPut<unknown>('user', { language: { id: languageId } }, { jwt, version: 'v2' });
    }
  }

  if (options.country) {
    const countryId = await resolveCountryId(options.country);
    if (countryId) {
      // Country is not on UpdateUserDto; KYC personal-data step sets it. SQL for e2e shortcuts.
      await updateById('user_data', userRow.userDataId, { countryId });
    }
  }

  if (options.kycLevel != null) {
    // No public endpoint assigns an arbitrary KycLevel; KYC steps advance it. Direct SQL.
    await updateById('user_data', userRow.userDataId, { kycLevel: options.kycLevel });
  }

  // See DEFAULT_TEST_DEPOSIT_LIMIT above: depositLimit only matters once kycLevel reaches 50, but
  // an explicit override is always honored regardless of level (e.g. to test level 50 with no
  // granted limit via `depositLimit: 0`).
  if (options.depositLimit != null || (options.kycLevel != null && options.kycLevel >= 50)) {
    await updateById('user_data', userRow.userDataId, {
      depositLimit: options.depositLimit ?? DEFAULT_TEST_DEPOSIT_LIMIT,
    });
  }

  if (options.role) {
    // Role elevation is admin/support only; SQL for e2e staff-like users without staff login.
    await updateById('user', userRow.id, { role: options.role });
  }

  // Sell routes require isDataComplete; also fill when caller asks or KYC ≥ 30.
  if (options.completePersonalData === true || (options.kycLevel != null && options.kycLevel >= 30)) {
    await ensurePersonalDataComplete(userRow.userDataId, { country: options.country });
  }

  return {
    userId: userRow.id,
    userDataId: userRow.userDataId,
    address: wallet.address,
    jwt,
    wallet,
    mail,
  };
}

// ---------------------------------------------------------------------------
// 2. createBankAccount
// ---------------------------------------------------------------------------

export async function createBankAccount(
  jwt: string,
  options: CreateBankAccountOptions = {},
): Promise<CreateBankAccountResult> {
  const iban = options.iban ?? TEST_IBAN;
  // POST /v1/bankAccount — IsDfxIban is async: format check (ibantools) + blacklist DB lookup +
  // optional BIC resolution via bank_account / external IBAN service. CH/LI IBANs skip BIC failure.
  // Under loc, outbound HTTP is mocked; if bank detail lookup fails, this call may error.
  const body: Record<string, unknown> = { iban };
  if (options.label) body.label = options.label;

  const res = await apiPost<{ id: number; iban: string }>('bankAccount', body, { jwt });
  track('bank_data', res.id);
  return { bankAccountId: res.id, iban: res.iban ?? iban };
}

// ---------------------------------------------------------------------------
// 3. createBuy
// ---------------------------------------------------------------------------

export async function createBuy(jwt: string, options: CreateBuyOptions = {}): Promise<CreateBuyResult> {
  const asset = await resolveBuyableAsset(options.assetId);

  if (options.withPaymentInfo) {
    // Frontend path: PUT /buy/paymentInfos (createBuyWithPaymentInfo). Needs currency + amount
    // and a live price path; may fail when HttpService mocks break pricing.
    const currencyId = await resolveFiatId(options.currencyId ?? 'CHF');
    const res = await apiPut<{ id: number; routeId: number }>(
      'buy/paymentInfos',
      {
        currency: { id: currencyId },
        asset: { id: asset.id },
        amount: options.amount ?? 100,
        paymentMethod: 'Bank',
        exactPrice: false,
        ...(options.iban ? { iban: options.iban } : {}),
      },
      { jwt },
    );
    track('buy', res.routeId);
    return { buyId: res.routeId, routeId: res.routeId, assetId: asset.id };
  }

  // Default: POST /buy with CreateBuyDto { asset } — creates the buy route without pricing.
  // Chosen over paymentInfos because ENVIRONMENT=loc mocks outbound HTTP and price feeds often fail.
  const res = await apiPost<{ id: number }>('buy', { asset: { id: asset.id } }, { jwt });
  track('buy', res.id);
  return { buyId: res.id, assetId: asset.id };
}

// ---------------------------------------------------------------------------
// 4. createSell
// ---------------------------------------------------------------------------

export async function createSell(jwt: string, options: CreateSellOptions = {}): Promise<CreateSellResult> {
  const blockchain = options.blockchain ?? 'Ethereum';
  await requireUnusedDeposit(blockchain);

  // Sell requires isDataComplete — ensure caller’s account has personal data.
  const userRow = await userFromJwt(jwt);
  await ensurePersonalDataComplete(userRow.userDataId);

  let bankAccountId = options.bankAccountId;
  const iban = options.iban ?? TEST_IBAN;
  if (!bankAccountId) {
    const ba = await createBankAccount(jwt, { iban });
    bankAccountId = ba.bankAccountId;
  }

  const currencyId = await resolveSellableFiatId(options.currencyId ?? 'CHF');

  // POST /sell (CreateSellDto) — simpler than paymentInfos, still creates a real sell route + deposit.
  const res = await apiPost<{ id: number; iban: string }>(
    'sell',
    {
      iban,
      currency: { id: currencyId },
      blockchain,
    },
    { jwt },
  );
  track('deposit_route', res.id);
  return { sellId: res.id, iban: res.iban ?? iban, bankAccountId };
}

// ---------------------------------------------------------------------------
// 5. createSwap
// ---------------------------------------------------------------------------

export async function createSwap(jwt: string, options: CreateSwapOptions = {}): Promise<CreateSwapResult> {
  const asset = await resolveBuyableAsset(options.assetId, options.blockchain);
  const blockchain = options.blockchain ?? asset.blockchain ?? 'Ethereum';
  await requireUnusedDeposit(blockchain);

  // Swap requires ACTIVE status or kycLevel >= 30.
  const userRow = await userFromJwt(jwt);
  await updateById('user_data', userRow.userDataId, { kycLevel: 30 });

  // POST /swap (CreateSwapDto) — route only; paymentInfos needs pricing.
  const res = await apiPost<{ id: number }>(
    'swap',
    {
      blockchain,
      targetAsset: { id: asset.id },
    },
    { jwt },
  );
  track('deposit_route', res.id);
  return { swapId: res.id, assetId: asset.id };
}

async function userFromJwt(jwt: string): Promise<{ id: number; userDataId: number; address: string }> {
  // Decode JWT payload without verifying (test-only) to get user/account ids.
  const part = jwt.split('.')[1];
  if (!part) throw new Error('Invalid JWT: missing payload');
  const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  const payload = JSON.parse(json) as { user?: number; account?: number; address?: string };
  if (payload.user && payload.account) {
    return {
      id: payload.user,
      userDataId: payload.account,
      address: payload.address ?? '',
    };
  }
  if (payload.address) {
    const row = await queryOne<{ id: number; userDataId: number }>(
      `SELECT id, "userDataId" AS "userDataId" FROM "user" WHERE address = $1 LIMIT 1`,
      [payload.address],
    );
    if (row) return { id: row.id, userDataId: row.userDataId, address: payload.address };
  }
  throw new Error('Could not resolve userId/userDataId from JWT');
}

// ---------------------------------------------------------------------------
// 6. createTransaction (SQL — crons disabled)
// ---------------------------------------------------------------------------

/**
 * Writes transaction (+ buy_crypto / buy_fiat / bank_tx / crypto_input) rows that the disabled
 * bank-tx / pay-in cron jobs would normally create. There is no public API to insert a completed
 * buy_crypto or buy_fiat under DISABLED_PROCESSES=*.
 */
export async function createTransaction(options: CreateTransactionOptions = {}): Promise<CreateTransactionResult> {
  const state: TransactionState = options.state ?? 'completed_buy';
  const tag = uniqueTag(options.tag);
  const amount = options.amount ?? 100;

  let userId = options.userId;
  let userDataId = options.userDataId;
  let jwt = options.jwt;
  let buyId = options.buyId;
  let sellId = options.sellId;

  if (!userId || !userDataId) {
    const user = await createUser({
      tag: `tx-${tag}`,
      kycLevel: 30,
      completePersonalData: true,
    });
    userId = user.userId;
    userDataId = user.userDataId;
    jwt = user.jwt;
  }

  if ((state === 'completed_buy' || state === 'pending_buy') && !buyId) {
    if (!jwt) throw new Error('createTransaction: jwt required to create buy route when buyId is omitted');
    const buy = await createBuy(jwt, {});
    buyId = buy.buyId;
  }

  if ((state === 'completed_sell' || state === 'pending_sell') && !sellId) {
    if (!jwt) throw new Error('createTransaction: jwt required to create sell route when sellId is omitted');
    const sell = await createSell(jwt, {});
    sellId = sell.sellId;
  }

  const isBuy = state === 'completed_buy' || state === 'pending_buy';
  const isSell = state === 'completed_sell' || state === 'pending_sell';
  const isComplete = state === 'completed_buy' || state === 'completed_sell';

  const sourceType = isSell ? 'CryptoInput' : 'BankTx';
  const type = isBuy ? 'BuyCrypto' : isSell ? 'BuyFiat' : undefined;
  const txUid = uid('T', tag);

  // transaction: NOT NULL sourceType, uid (transaction.entity.ts)
  const transactionId = await insertReturningId(
    'transaction',
    ['sourceType', 'type', 'uid', 'amountInChf', 'assets', 'amlCheck', 'userId', 'userDataId', 'eventDate', 'outputDate'],
    [
      sourceType,
      type ?? null,
      txUid,
      amount,
      options.inputAsset ?? (isBuy ? 'CHF' : 'ETH'),
      options.amlCheck ?? (isComplete ? 'Pass' : 'Pending'),
      userId,
      userDataId,
      new Date(),
      isComplete ? new Date() : null,
    ],
  );

  let bankTxId: number | undefined;
  let cryptoInputId: number | undefined;
  let buyCryptoId: number | undefined;
  let buyFiatId: number | undefined;

  if (state === 'bank_tx_only' || isBuy) {
    // bank_tx: NOT NULL accountServiceRef (bank-tx.entity.ts)
    const accountServiceRef = `e2e-btx-${uniqueRef(tag)}`;
    bankTxId = await insertReturningId(
      'bank_tx',
      [
        'accountServiceRef',
        'amount',
        'currency',
        'creditDebitIndicator',
        'iban',
        'type',
        'bookingDate',
        'valueDate',
        'transactionId',
        'name',
      ],
      [
        accountServiceRef,
        amount,
        'CHF',
        'CRDT',
        TEST_IBAN,
        isBuy ? 'BuyCrypto' : 'Unknown',
        new Date(),
        new Date(),
        transactionId,
        'E2E Sender',
      ],
    );
  }

  if (isBuy) {
    // buy_crypto: NOT NULL transactionId (JoinColumn), version; defaults for status/isComplete/amlPostProcessed
    const asset = await resolveBuyableAsset();
    buyCryptoId = await insertReturningId(
      'buy_crypto',
      [
        'transactionId',
        'bankTxId',
        'buyId',
        'version',
        'status',
        'isComplete',
        'amlPostProcessed',
        'amlCheck',
        'amlReason',
        'inputAmount',
        'inputAsset',
        'inputReferenceAmount',
        'inputReferenceAsset',
        'amountInChf',
        'amountInEur',
        'outputAmount',
        'outputAssetId',
        'outputReferenceAmount',
        'outputReferenceAssetId',
        'outputDate',
        'txId',
      ],
      [
        transactionId,
        bankTxId ?? null,
        buyId ?? null,
        1,
        isComplete ? 'Complete' : 'Created',
        isComplete,
        true,
        options.amlCheck ?? (isComplete ? 'Pass' : 'Pending'),
        options.amlReason ?? null,
        amount,
        options.inputAsset ?? 'CHF',
        amount,
        options.inputAsset ?? 'CHF',
        amount,
        amount,
        isComplete ? amount * 0.001 : null,
        isComplete ? asset.id : null,
        isComplete ? amount * 0.001 : null,
        isComplete ? asset.id : null,
        isComplete ? new Date() : null,
        isComplete ? `0xe2e${tag}` : null,
      ],
    );
  }

  if (isSell) {
    // crypto_input required for buy_fiat (nullable: false)
    const asset = await resolveBuyableAsset(undefined, 'Ethereum');
    const assetName =
      options.inputAsset ??
      (await queryOne<{ name: string }>(`SELECT name FROM asset WHERE id = $1`, [asset.id]))?.name ??
      'ETH';
    cryptoInputId = await insertReturningId(
      'crypto_input',
      [
        'inTxId',
        'amount',
        'isConfirmed',
        'addressAddress',
        'addressBlockchain',
        'destinationAddressAddress',
        'destinationAddressBlockchain',
        'assetId',
        'status',
        'purpose',
        'transactionId',
      ],
      [
        `e2e-intx-${tag}`,
        amount,
        true,
        `0xfrom${tag}`.slice(0, 42).padEnd(42, '0'),
        'Ethereum',
        `0xto${tag}`.slice(0, 42).padEnd(42, '0'),
        'Ethereum',
        asset.id,
        'Completed',
        'BuyFiat',
        transactionId,
      ],
    );

    buyFiatId = await insertReturningId(
      'buy_fiat',
      [
        'transactionId',
        'cryptoInputId',
        'sellId',
        'isComplete',
        'amlPostProcessed',
        'amlCheck',
        'amlReason',
        'inputAmount',
        'inputAsset',
        'amountInChf',
        'amountInEur',
        'outputAmount',
        'outputDate',
      ],
      [
        transactionId,
        cryptoInputId,
        sellId ?? null,
        isComplete,
        true,
        options.amlCheck ?? (isComplete ? 'Pass' : 'Pending'),
        options.amlReason ?? null,
        amount,
        assetName,
        amount * 1000,
        amount * 1000,
        isComplete ? amount * 1000 : null,
        isComplete ? new Date() : null,
      ],
    );
  }

  return {
    transactionId,
    uid: txUid,
    buyCryptoId,
    buyFiatId,
    bankTxId,
    cryptoInputId,
    buyId,
    sellId,
    userId,
    userDataId,
  };
}

// ---------------------------------------------------------------------------
// 7. createBankTx
// ---------------------------------------------------------------------------

export async function createBankTx(options: CreateBankTxOptions = {}): Promise<CreateBankTxResult> {
  const tag = uniqueTag(options.tag);
  const amount = options.amount ?? 250;
  const withTx = options.withTransaction !== false;

  let transactionId: number | undefined;
  if (withTx) {
    const txUid = uid('T', `btx${tag}`);
    transactionId = await insertReturningId(
      'transaction',
      ['sourceType', 'type', 'uid', 'amountInChf', 'assets', 'userId', 'userDataId', 'eventDate'],
      [
        'BankTx',
        options.type ?? 'BuyCrypto',
        txUid,
        amount,
        options.currency ?? 'CHF',
        options.userId ?? null,
        options.userDataId ?? null,
        new Date(),
      ],
    );
  }

  const accountServiceRef = `e2e-banktx-${uniqueRef(tag)}`;
  const bankTxId = await insertReturningId(
    'bank_tx',
    [
      'accountServiceRef',
      'amount',
      'currency',
      'creditDebitIndicator',
      'iban',
      'type',
      'bookingDate',
      'valueDate',
      'transactionId',
      'name',
      'remittanceInfo',
    ],
    [
      accountServiceRef,
      amount,
      options.currency ?? 'CHF',
      'CRDT',
      options.iban ?? TEST_IBAN,
      options.type ?? 'BuyCrypto',
      new Date(),
      new Date(),
      transactionId ?? null,
      'E2E Bank Sender',
      `e2e-ref-${tag}`,
    ],
  );

  return { bankTxId, transactionId, accountServiceRef };
}

// ---------------------------------------------------------------------------
// 8. createSupportIssue
// ---------------------------------------------------------------------------

export async function createSupportIssue(
  jwt: string,
  options: CreateSupportIssueOptions = {},
): Promise<CreateSupportIssueResult> {
  // POST /v1/support/issue requires mail on user_data (createIssueInternal).
  const user = await userFromJwt(jwt);
  const mailRow = await queryOne<{ mail: string | null }>(`SELECT mail FROM user_data WHERE id = $1`, [
    user.userDataId,
  ]);
  if (!mailRow?.mail) {
    await apiPut('user/mail', { mail: e2eMail(options.tag ?? 'support') }, { jwt, version: 'v2' });
  }

  const res = await apiPost<{
    uid: string;
    messages?: { id: number }[];
  }>(
    'support/issue',
    {
      type: options.type ?? 'GenericIssue',
      reason: options.reason ?? 'Other',
      name: options.name ?? `E2E issue ${uniqueTag(options.tag)}`,
      message: options.message ?? 'E2E support message',
    },
    { jwt },
  );

  const issueRow = await queryOne<{ id: number }>(`SELECT id FROM support_issue WHERE uid = $1 LIMIT 1`, [res.uid]);
  if (issueRow) track('support_issue', issueRow.id);

  const msgId = res.messages?.[0]?.id;
  if (msgId) track('support_message', msgId);

  return {
    supportIssueId: issueRow?.id,
    uid: res.uid,
    messageId: msgId,
  };
}

// ---------------------------------------------------------------------------
// 9. createPaymentLink
// ---------------------------------------------------------------------------

/**
 * Payment links require a Lightning deposit_route and paymentLinksAllowed=true.
 * EVM_DEPOSIT_SEED does not seed Lightning, so the API path (POST /paymentLink) usually fails
 * without a free Lightning deposit. We therefore create deposit + sell-route + payment_link
 * (+ optional payment) via SQL, matching the tables the API would write.
 */
export async function createPaymentLink(
  jwt: string,
  options: CreatePaymentLinkOptions = {},
): Promise<CreatePaymentLinkResult> {
  const tag = uniqueTag(options.tag);
  const user = await userFromJwt(jwt);

  await updateById('user_data', user.userDataId, { paymentLinksAllowed: true });
  await ensurePersonalDataComplete(user.userDataId);

  let routeId = options.routeId;

  if (!routeId) {
    // Prefer an existing free Lightning deposit; otherwise insert a synthetic one for e2e.
    let deposit = await queryOne<{ id: number }>(
      `SELECT d.id
       FROM deposit d
       LEFT JOIN deposit_route r ON r."depositId" = d.id
       WHERE r.id IS NULL AND d.blockchains LIKE '%Lightning%'
       LIMIT 1`,
    );
    if (!deposit) {
      const depositId = await insertReturningId(
        'deposit',
        ['address', 'blockchains', 'accountIndex'],
        [`e2e-ln-${tag}`, 'Lightning', 900000 + factoryTagCounter],
      );
      deposit = { id: depositId };
    } else {
      track('deposit', deposit.id);
    }

    // deposit_route STI: type='Sell' + sell columns (iban, fiatId) on same table.
    // Check constraint requires bankDataId when active=true AND type='Sell'.
    const fiatId = await resolveFiatId('CHF');
    const bankDataId = await insertReturningId(
      'bank_data',
      ['iban', 'type', 'active', 'default', 'userDataId', 'label'],
      [`${TEST_IBAN};e2e-${tag}`, 'User', true, false, user.userDataId, `e2e-pl-ba-${tag}`],
    );
    routeId = await insertReturningId(
      'deposit_route',
      [
        'type',
        'active',
        'volume',
        'depositId',
        'userId',
        'iban',
        'fiatId',
        'bankDataId',
        'annualVolume',
        'monthlyVolume',
      ],
      ['Sell', true, 0, deposit.id, user.id, TEST_IBAN, fiatId, bankDataId, 0, 0],
    );
  }

  const uniqueId = `pl${tag}`.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);
  const paymentLinkId = await insertReturningId(
    'payment_link',
    ['routeId', 'uniqueId', 'status', 'mode', 'webhookFailCount', 'label', 'externalId'],
    [
      routeId,
      uniqueId,
      'Active',
      'Multiple',
      0,
      options.label ?? `e2e-pl-${tag}`,
      options.externalId ?? `ext-${tag}`,
    ],
  );

  let paymentId: number | undefined;
  const amount = options.amount ?? 25;
  const fiatId = await resolveFiatId(options.currency ?? 'CHF');
  const paymentUid = `plp${tag}`.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
  paymentId = await insertReturningId(
    'payment_link_payment',
    ['linkId', 'uniqueId', 'status', 'amount', 'currencyId', 'mode', 'expiryDate', 'txCount', 'isConfirmed'],
    [paymentLinkId, paymentUid, 'Pending', amount, fiatId, 'Single', expiry, 0, false],
  );

  return { paymentLinkId, uniqueId, paymentId, routeId };
}

// ---------------------------------------------------------------------------
// 10. createKycStep
// ---------------------------------------------------------------------------

export async function createKycStep(
  userDataId: number,
  options: CreateKycStepOptions = {},
): Promise<CreateKycStepResult> {
  // No public customer API creates an arbitrary step in a chosen ReviewStatus — SQL.
  const seq =
    options.sequenceNumber ??
    (await queryOne<{ n: number }>(
      `SELECT COALESCE(MAX("sequenceNumber"), -1) + 1 AS n FROM kyc_step WHERE "userDataId" = $1`,
      [userDataId],
    ).then((r) => r?.n ?? 0));

  const kycStepId = await insertReturningId(
    'kyc_step',
    ['userDataId', 'name', 'status', 'sequenceNumber', 'type', 'result', 'comment'],
    [
      userDataId,
      options.name ?? 'ContactData',
      options.status ?? 'InProgress',
      seq,
      options.type ?? null,
      options.result ?? null,
      options.comment ?? null,
    ],
  );

  return { kycStepId, userDataId };
}

// ---------------------------------------------------------------------------
// 11. createLimitRequest / createMrosCase / createCallQueueEntry
// ---------------------------------------------------------------------------

export async function createLimitRequest(options: CreateLimitRequestOptions = {}): Promise<CreateLimitRequestResult> {
  let jwt = options.jwt;
  let userDataId = options.userDataId;

  if (!jwt || !userDataId) {
    const user = await createUser({ tag: options.tag ?? 'limit', kycLevel: 30, completePersonalData: true });
    jwt = user.jwt;
    userDataId = user.userDataId;
  }

  // Prefer API: support issue of type LimitRequest creates limit_request + support_issue together.
  try {
    const res = await apiPost<{
      uid: string;
      limitRequest?: { id: number };
    }>(
      'support/issue',
      {
        type: 'LimitRequest',
        reason: 'Other',
        name: `E2E limit ${uniqueTag(options.tag)}`,
        message: 'Please raise my limit',
        limitRequest: {
          limit: options.limit ?? 50000,
          investmentDate: options.investmentDate ?? 'Now',
          fundOrigin: options.fundOrigin ?? 'Savings',
          fundOriginText: options.fundOriginText,
        },
      },
      { jwt },
    );

    const issueRow = await queryOne<{ id: number; limitRequestId: number }>(
      `SELECT id, "limitRequestId" AS "limitRequestId" FROM support_issue WHERE uid = $1 LIMIT 1`,
      [res.uid],
    );
    if (issueRow) {
      track('support_issue', issueRow.id);
      if (issueRow.limitRequestId) track('limit_request', issueRow.limitRequestId);
      return {
        limitRequestId: issueRow.limitRequestId ?? res.limitRequest?.id ?? 0,
        supportIssueId: issueRow.id,
        supportIssueUid: res.uid,
      };
    }
    if (res.limitRequest?.id) {
      track('limit_request', res.limitRequest.id);
      return { limitRequestId: res.limitRequest.id, supportIssueUid: res.uid };
    }
  } catch {
    // Fall through to SQL if API rejects (e.g. missing mail already handled, or validation).
  }

  // SQL fallback: limit_request + support_issue (limit_request has OneToOne from support_issue)
  const limitRequestId = await insertReturningId(
    'limit_request',
    ['limit', 'investmentDate', 'fundOrigin', 'fundOriginText'],
    [options.limit ?? 50000, options.investmentDate ?? 'Now', options.fundOrigin ?? 'Savings', options.fundOriginText ?? null],
  );

  const wallet = await queryOne<{ id: number }>(`SELECT id FROM wallet ORDER BY id ASC LIMIT 1`);
  if (!wallet) throw new Error('No wallet seed row for support_issue.walletId');

  const issueUid = uid('I', uniqueTag(options.tag));
  const supportIssueId = await insertReturningId(
    'support_issue',
    ['uid', 'state', 'type', 'reason', 'name', 'userDataId', 'walletId', 'limitRequestId'],
    [
      issueUid,
      'Created',
      'LimitRequest',
      'Other',
      `E2E limit ${uniqueTag(options.tag)}`,
      userDataId,
      wallet.id,
      limitRequestId,
    ],
  );

  return { limitRequestId, supportIssueId, supportIssueUid: issueUid };
}

export async function createMrosCase(options: CreateMrosCaseOptions = {}): Promise<CreateMrosCaseResult> {
  let userDataId = options.userDataId;
  if (!userDataId) {
    const user = await createUser({ tag: options.tag ?? 'mros', kycLevel: 30 });
    userDataId = user.userDataId;
  }

  // No public customer API for MROS cases — compliance internal only. SQL insert.
  const mrosId = await insertReturningId(
    'mros',
    ['userDataId', 'status', 'reportCode', 'caseManager', 'reason'],
    [
      userDataId,
      options.status ?? 'Draft',
      options.reportCode ?? 'SAR',
      options.caseManager ?? 'e2e-case-manager',
      options.reason ?? 'E2E MROS case',
    ],
  );

  return { mrosId, userDataId };
}

/**
 * CallQueue is a derived in-memory view (support.service.ts getCallQueuesSummary / getCallQueueItems).
 * There is no call_queue table. We set user_data."phoneCallStatus" (Unavailable/Suspicious queue)
 * and optionally create a pending buy_crypto with a phone-related amlReason for tx queues.
 */
export async function createCallQueueEntry(
  options: CreateCallQueueEntryOptions = {},
): Promise<CreateCallQueueEntryResult> {
  let userDataId = options.userDataId;
  let userId = options.userId;
  let jwt = options.jwt;

  if (!userDataId || !userId) {
    const user = await createUser({
      tag: options.tag ?? 'callq',
      kycLevel: 30,
      completePersonalData: true,
    });
    userDataId = user.userDataId;
    userId = user.userId;
    jwt = user.jwt;
  }

  const phoneCallStatus = options.phoneCallStatus ?? 'Unavailable';
  await updateById('user_data', userDataId, {
    phoneCallStatus,
    phoneCallCheckDate: new Date(),
    phone: '+41791112233',
  });

  let transactionId: number | undefined;
  let buyCryptoId: number | undefined;

  if (options.amlReason) {
    const tx = await createTransaction({
      state: 'pending_buy',
      userId,
      userDataId,
      jwt,
      amlReason: options.amlReason,
      amlCheck: 'Pending',
      tag: options.tag ?? 'callq',
    });
    transactionId = tx.transactionId;
    buyCryptoId = tx.buyCryptoId;
  }

  return { userDataId, phoneCallStatus, transactionId, buyCryptoId };
}

// ---------------------------------------------------------------------------
// 12. cleanupCreatedData
// ---------------------------------------------------------------------------

interface UserDependentTable {
  table: string;
  column: string;
  referencedTable: 'user' | 'user_data';
}

let userDependentTablesPromise: Promise<UserDependentTable[]> | null = null;

/**
 * Discovers every table with a foreign key pointing at "user" or user_data straight from
 * Postgres's own catalog, instead of a hand-maintained list — the API writes rows into several
 * of these (ip_log on every login; kyc_log / kyc_step / transaction_request on mail-set /
 * KYC-level / personal-data completion) that no factory tracks, so cleanupCreatedData's own
 * DELETE of "user"/"user_data" below always failed on them even with the correct user/user_data
 * delete order. Scoped deliberately to direct references to "user"/user_data only — not a
 * general recursive schema walk, which would risk reaching into chains other factories already
 * track and order correctly (transaction/buy_crypto/deposit_route etc.). Queried once per
 * process and memoized; the schema does not change mid-run.
 */
async function getUserDependentTables(): Promise<UserDependentTable[]> {
  if (!userDependentTablesPromise) {
    userDependentTablesPromise = queryRows<{
      table_name: string;
      column_name: string;
      referenced_table: string;
    }>(
      `SELECT tc.table_name, kcu.column_name, ccu.table_name AS referenced_table
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.table_schema = 'public'
         AND ccu.table_name IN ('user', 'user_data')
         AND tc.table_name NOT IN ('user', 'user_data')`,
    ).then((rows) =>
      rows.map((r) => ({
        table: r.table_name,
        column: r.column_name,
        referencedTable: r.referenced_table as 'user' | 'user_data',
      })),
    );
  }
  return userDependentTablesPromise;
}

/**
 * Deletes rows this module created, in reverse order, to respect FKs. For every "user" /
 * "user_data" row, first clears the API's own untracked dependent rows for exactly that row's id
 * (see getUserDependentTables) — scoped to that one id, so it can never touch another account's
 * rows or seed/master data — then deletes the row itself.
 * Best-effort: failures on individual deletes are collected and do not abort the rest.
 */
export async function cleanupCreatedData(): Promise<{ deleted: number; errors: string[] }> {
  const errors: string[] = [];
  let deleted = 0;
  const snapshot = [...created].reverse();
  created.length = 0;

  const dependents = await getUserDependentTables().catch(() => [] as UserDependentTable[]);

  for (const ref of snapshot) {
    if (ref.table === 'user' || ref.table === 'user_data') {
      for (const dep of dependents) {
        if (dep.referencedTable !== ref.table) continue;
        const col = needsQuote(dep.column) ? `"${dep.column}"` : dep.column;
        try {
          await withDb(async (client) => {
            await client.query(`DELETE FROM ${tableSql(dep.table)} WHERE ${col} = $1`, [ref.id]);
          });
        } catch (e) {
          errors.push(`${dep.table}.${dep.column}=${ref.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    try {
      await withDb(async (client) => {
        await client.query(`DELETE FROM ${tableSql(ref.table)} WHERE id = $1`, [ref.id]);
      });
      deleted += 1;
    } catch (e) {
      errors.push(`${ref.table}#${ref.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { deleted, errors };
}

/** Reset the in-process counters (for isolated test files if needed). */
export function resetFactoryCounter(): void {
  factoryTagCounter = 0;
  factoryWalletCounter = 0;
}
