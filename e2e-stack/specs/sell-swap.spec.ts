/**
 * Sell + Swap screens:
 *   /sell, /sell/info, /swap
 *
 * Browser drives the real frontend; Postgres proves writes where the UI mutates data.
 * UI flows that depend on pricing (`PUT /sell/paymentInfos`, `PUT /swap/paymentInfos`) are split
 * into two tests each — the deposit_route write and the payment panel — and both assert hard.
 * Neither is skipped: pricing does work here, once the URL leaves out the bank-account parameter.
 * Passing `bank-account` used to recreate accounts in a loop; that regression is pinned by the
 * dedicated test at the end of this file (select the existing account, do not POST again).
 * Factory-only tests (`createSell` / `createSwap`) remain as independent API-path proofs.
 * /sell also proves three wallet address-check outcomes through the real API: Ok without a banner,
 * LikelyReturn with the return banner, and Unknown (chain without Scorechain coverage) without a banner.
 * The partner sell wallet lists (bitcoinonly, kevinsoell) are driven from their ?mode= entry page
 * through to the hardware-wallet selection.
 * One /sell case pauses sell at runtime through the API's `disabledProcess` setting and restores it
 * before it ends; every other sell case runs with sell on.
 * One /sell case follows "I am already verified with DFX" from a KYC level 0 account without a bank
 * account to /link and back to /sell. Another one enters the mail of a verified account there, confirms
 * the merge mail in a new page and checks where that confirmation continues.
 */

import type { Page, Response } from '@playwright/test';
import { ethers } from 'ethers';
import {
  apiPut,
  decryptPii,
  expect,
  expectSwapUnavailable,
  expectUnavailableSwapQuoteOnScreen,
  gotoWithSession,
  headerBackButton,
  isolateFromExternalHosts,
  normPath,
  openScreen,
  orSwapUnavailable,
  queryOne,
  queryRows,
  required,
  signatureLogin,
  SwapUnavailableError,
  test,
  testWallet,
  TRANSACTIONS_PAUSED,
  waitForMatchingRow,
  waitForRow,
  withDb,
} from './fixtures';
import {
  cleanupCreatedData,
  createBankAccount,
  createSell,
  createSwap,
  createUser,
  e2eMail,
  type KycLevelValue,
  TEST_IBAN,
  trackRow,
} from './fixtures/factories';
import { injectWallet, recordAuthAndErrorReports, type WalletAnswer, walletAnswers } from './fixtures/injected-wallet';

// Wallet-index isolation: factories.ts's createUser() derives its wallet index from an
// in-process counter starting at FACTORY_WALLET_INDEX_BASE (100) unless `walletIndex` is
// passed explicitly. Playwright resets that counter per spec file (each file gets its own
// module instance even under workers: 1), so two files whose createUser() calls both start
// their local counter at 1 land on the SAME derived wallet address (100 + 1 = 101) and the
// second file's "new" user silently signs back into the first file's already-created account
// (same address -> sign-in, not sign-up). That account already has a mail set, so the mail
// factories.ts tries to set next fails with 403 TFA_REQUIRED (updateUserMail requires 2FA to
// change an already-set mail) — a real, reproducible cross-file bug, not a product bug.
// That has since been fixed in factories.ts: wallet offsets now come from their own counter,
// seeded from the database, so a fresh process continues above what is already there instead of
// restarting at 1. The file-local base below is kept anyway — it costs nothing, it keeps this
// suite's accounts recognisable in the database, and it does not depend on the shared counter
// being right. Remove it if you ever want the suites to share one allocation scheme.
let __sellSwap_WALLET_SEQ = 0;
function nextWalletIndex(): number {
  __sellSwap_WALLET_SEQ += 1;
  return 8000000 + __sellSwap_WALLET_SEQ;
}

// Keep these in sync with the dedicated addresses in SCORECHAIN_LOC_MOCK in e2e-stack/env/api.env.
const SANCTION_LIST_WALLET_INDEX = 7700001;
const NO_COVERAGE_WALLET_INDEX = 7700002;
const NO_COVERAGE_WALLET_ADDRESS = '0x81a2e624a3dc4139c0e21e4479389826acf43005';

/**
 * The API serialises every precheck behind one non-waiting Postgres advisory lock and answers
 * `Unknown` immediately when the lock is taken. The provider mock answers after five seconds, so a
 * precheck started by an earlier screen is still in flight when the next screen asks. This probe
 * takes the lock only for the instant of the probe and always unlocks: a free lock means no precheck
 * is running, and the next request gets the real provider answer instead of the busy fallback.
 */
async function precheckLockIsFree(): Promise<boolean> {
  return withDb(async (client) => {
    const { rows } = await client.query<{ locked: boolean }>(
      `SELECT pg_try_advisory_lock(hashtext('scorechain-precheck')::bigint) AS locked`,
    );
    if (rows[0]?.locked) {
      await client.query(`SELECT pg_advisory_unlock(hashtext('scorechain-precheck')::bigint)`);
    }
    return rows[0]?.locked === true;
  });
}

/**
 * The shared e2e stack seeds a large but finite pool of EVM deposit addresses (global.setup.ts,
 * DEPOSIT_ADDRESS_POOL_SIZE) shared by every blockchain and every spec file in a run. If that pool
 * is ever exhausted, surface it as a clear, actionable test failure -- not a silent skip -- so a
 * too-small pool breaks the run loudly instead of quietly degrading coverage. Any other failure
 * (auth, 500, schema change, ...) is rethrown unchanged.
 */
async function safeCreateSell(
  jwt: string,
  opts: Parameters<typeof createSell>[1],
): Promise<Awaited<ReturnType<typeof createSell>>> {
  try {
    return await createSell(jwt, opts);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('No unused deposit address')) {
      throw new Error(
        `createSell: shared EVM deposit pool exhausted (${message}). Increase ` +
          `DEPOSIT_ADDRESS_POOL_SIZE in e2e-stack/specs/global.setup.ts -- the current pool is too ` +
          `small for this suite.`,
      );
    }
    throw e;
  }
}

async function safeCreateSwap(
  jwt: string,
  opts: Parameters<typeof createSwap>[1],
): Promise<Awaited<ReturnType<typeof createSwap>>> {
  try {
    return await createSwap(jwt, opts);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('No unused deposit address')) {
      throw new Error(
        `createSwap: shared EVM deposit pool exhausted (${message}). Increase ` +
          `DEPOSIT_ADDRESS_POOL_SIZE in e2e-stack/specs/global.setup.ts -- the current pool is too ` +
          `small for this suite.`,
      );
    }
    throw e;
  }
}
function apiBase(): string {
  return process.env.E2E_API_URL ?? 'http://api:3000';
}

interface AssetDto {
  id: number;
  name: string;
  uniqueName?: string;
  blockchain?: string;
  sellable?: boolean;
  buyable?: boolean;
  comingSoon?: boolean;
}

interface FiatDto {
  id: number;
  name: string;
  sellable?: boolean;
  buyable?: boolean;
  cardBuyable?: boolean;
  instantBuyable?: boolean;
}

async function fetchAssets(): Promise<AssetDto[]> {
  const res = await fetch(`${apiBase()}/v1/asset`);
  expect(res.ok, `GET /v1/asset status ${res.status}`).toBe(true);
  return (await res.json()) as AssetDto[];
}

async function fetchFiats(): Promise<FiatDto[]> {
  const res = await fetch(`${apiBase()}/v1/fiat`);
  expect(res.ok, `GET /v1/fiat status ${res.status}`).toBe(true);
  return (await res.json()) as FiatDto[];
}

/**
 * Wait for either a successful sell/swap payment-info panel, or a pricing error surface.
 * Returns the observed outcome and any captured API error text.
 */
async function waitForPricingOutcome(
  page: Page,
  opts?: { timeoutMs?: number },
): Promise<{ kind: 'payment_info' | 'error' | 'timeout'; detail: string }> {
  const timeoutMs = opts?.timeoutMs ?? 20000;
  const completeBtn = page.getByRole('button', {
    name: /Click here once you have issued the transaction|Complete transaction in your wallet/i,
  });
  const paymentHeading = page.getByRole('heading', { name: 'Payment Information', exact: true });
  const errorMsg = page.locator('p.text-dfxGray-800.text-sm');
  const genericError = page.getByText(
    'Something went wrong. Please try again. If the issue persists please reach out to our support.',
  );

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await completeBtn.isVisible().catch(() => false)) {
      return { kind: 'payment_info', detail: 'complete button visible' };
    }
    if (await paymentHeading.isVisible().catch(() => false)) {
      return { kind: 'payment_info', detail: 'Payment Information heading visible' };
    }
    if (await genericError.isVisible().catch(() => false)) {
      const detail = (
        (await errorMsg
          .first()
          .textContent()
          .catch(() => null)) ?? 'unknown pricing error'
      ).trim();
      return { kind: 'error', detail };
    }
    // KYC / quote errors also surface text without the generic ErrorHint shell.
    const body = await page.locator('body').innerText();
    if (
      /failed|not available|price|timeout|ECONNREFUSED|503|502|500/i.test(body) &&
      !(await completeBtn.isVisible().catch(() => false))
    ) {
      // Keep polling a bit — spinner may still be settling — but capture later.
    }
    await page.waitForTimeout(400);
  }

  const bodySnippet = (
    await page
      .locator('body')
      .innerText()
      .catch(() => '')
  ).slice(0, 400);
  return { kind: 'timeout', detail: bodySnippet || 'no payment info and no error within timeout' };
}

function trackPaymentInfosResponses(
  page: Page,
  pathIncludes: string,
): { last: { status: number; body: string } | null } {
  const box: { last: { status: number; body: string } | null } = { last: null };
  page.on('response', async (res: Response) => {
    const url = res.url();
    if (!url.includes(pathIncludes)) return;
    if (res.request().method() !== 'PUT') return;
    const body = await res.text().catch(() => '');
    box.last = { status: res.status(), body: body.slice(0, 500) };
  });
  return box;
}

type SellSwapUser = Awaited<ReturnType<typeof createUser>>;
type PaymentInfosTracker = ReturnType<typeof trackPaymentInfosResponses>;

/**
 * True when the swap screen's payment-information request got the unmounted-route (404) or the paused (503) answer;
 * the helper has then asserted what the screen shows for it, and the test has nothing else to prove.
 * False when the API answered anything else: the test goes on with its usual assertions.
 */
async function swapQuoteUnavailable(page: Page, paymentInfos: PaymentInfosTracker): Promise<boolean> {
  return (await expectUnavailableSwapQuoteOnScreen(page, () => paymentInfos.last)) !== undefined;
}

/** An unavailable swap must not leave a deposit route behind for the user. */
async function expectNoSwapRoute(userId: number): Promise<void> {
  const routes = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM deposit_route WHERE "userId" = $1 AND type = 'Crypto'`,
    [userId],
  );
  expect(routes?.count, 'no Crypto deposit_route while swap is unavailable').toBe(0);
}

/**
 * Shared setup for /sell full-UI write-path and payment-panel tests: user + bank account,
 * paymentInfos response tracking (attached before navigation), form pre-fill via URL params.
 */
async function setupSellFullUiFlow(
  page: Page,
  tag: string,
  extraQuery = '',
): Promise<{ user: SellSwapUser; paymentInfos: PaymentInfosTracker }> {
  const user = await createUser({
    walletIndex: nextWalletIndex(),
    tag,
    // Level 50: the default wallet's RULE_3 refuses sell and swap quotes below it (sell-wallet-aml.spec.ts).
    kycLevel: 50,
    completePersonalData: true,
    language: 'EN',
  });
  await createBankAccount(user.jwt, { iban: TEST_IBAN, label: 'Sell UI BA' });

  const paymentInfos = trackPaymentInfosResponses(page, 'paymentInfos');

  // Pre-fill amount, asset and currency via URL params so the form is complete without fragile
  // dropdown clicks. The bank account is deliberately NOT passed as a parameter: the account
  // created above is picked up on its own. Passing `bank-account` is covered by the dedicated
  // regression test at the end of this file (select existing, do not recreate). Do not wait for
  // 'networkidle' either: pricing effects keep the network busy on this screen, so content-based
  // waits are what gate these tests.
  await gotoWithSession(page, `/sell?asset-in=ETH&asset-out=CHF&amount-in=0.1${extraQuery}`, user.jwt);
  expect(normPath(new URL(page.url()).pathname)).toBe('/sell');

  await expect(page.getByText('You spend', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/CH93|CH 93/i).first()).toBeVisible({ timeout: 15000 });

  return { user, paymentInfos };
}

/**
 * The `setting` row the API reads its runtime list of switched-off processes from (a JSON array of process
 * names). The API re-reads it every 30 seconds, so a change takes up to that long to reach the sell route.
 */
const DISABLED_PROCESS_SETTING = 'disabledProcess';
const SELL_PROCESS = 'Sell';
/** The message the API sends with 503 `TRANSACTIONS_PAUSED`. */
const TRANSACTIONS_PAUSED_MESSAGE =
  'Transactions are temporarily paused. Your account, KYC and support remain available.';
/** Bound for one switch to reach the API: the 30-second resync plus room for the request that observes it. */
const PROCESS_RESYNC_TIMEOUT_MS = 75000;

/** The `disabledProcess` setting as it is now, or null when the row does not exist. */
async function readDisabledProcessSetting(): Promise<string | null> {
  const row = await queryOne<{ value: string }>(`SELECT value FROM setting WHERE key = $1`, [DISABLED_PROCESS_SETTING]);
  return row?.value ?? null;
}

/** Adds Sell to the processes listed in `previous` and writes the result, inserting the row if it is missing. */
async function pauseSellThroughSetting(previous: string | null): Promise<void> {
  const listed: unknown = previous ? JSON.parse(previous) : [];
  if (!Array.isArray(listed)) {
    throw new Error(`setting ${DISABLED_PROCESS_SETTING} is not a JSON array: ${previous}`);
  }
  const paused = JSON.stringify([...listed.filter((name) => name !== SELL_PROCESS), SELL_PROCESS]);
  await queryRows(
    `INSERT INTO setting (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [DISABLED_PROCESS_SETTING, paused],
  );
}

/** Puts the `disabledProcess` setting back to `previous`; removes the row when there was none. */
async function restoreDisabledProcessSetting(previous: string | null): Promise<void> {
  if (previous === null) {
    await queryRows(`DELETE FROM setting WHERE key = $1`, [DISABLED_PROCESS_SETTING]);
  } else {
    await queryRows(`UPDATE setting SET value = $1 WHERE key = $2`, [previous, DISABLED_PROCESS_SETTING]);
  }
}

/** The ETH → CHF sell quote the sell form asks for with `asset-in=ETH&asset-out=CHF&amount-in=0.1`. */
async function ethToChfSellQuote(): Promise<Record<string, unknown>> {
  const asset = required(
    (await fetchAssets()).find((a) => a.name === 'ETH' && a.blockchain === 'Ethereum'),
    'ETH on Ethereum in GET /v1/asset',
  );
  const fiat = required(
    (await fetchFiats()).find((f) => f.name === 'CHF'),
    'CHF in GET /v1/fiat',
  );
  return { iban: TEST_IBAN, asset: { id: asset.id }, currency: { id: fiat.id }, amount: 0.1 };
}

/** Asks for `quote` once: `TRANSACTIONS_PAUSED` for the paused answer, otherwise `HTTP <status>` and the body. */
async function sellQuoteAnswer(jwt: string, quote: Record<string, unknown>): Promise<string> {
  let status = 0;
  const body = await apiPut<unknown>('sell/paymentInfos', quote, {
    jwt,
    expectOk: false,
    onStatus: (s) => (status = s),
  });
  const code = typeof body === 'object' && body !== null ? (body as { code?: unknown }).code : undefined;
  if (status === 503 && code === TRANSACTIONS_PAUSED) return TRANSACTIONS_PAUSED;
  return `HTTP ${status}: ${JSON.stringify(body ?? null).slice(0, 200)}`;
}

/**
 * Shared setup for /sell/info write-path and payment-panel tests: user + bank account,
 * paymentInfos tracking, navigation with valid query params (no networkidle). `extraQuery` is appended to that URL;
 * `amountIn` is the ETH amount in it.
 */
async function setupSellInfoUiFlow(
  page: Page,
  tag: string,
  extraQuery = '',
  amountIn = '0.1',
  // Level 50: the default wallet's RULE_3 refuses sell and swap quotes below it (sell-wallet-aml.spec.ts).
  kycLevel: KycLevelValue = 50,
): Promise<{ user: SellSwapUser; paymentInfos: PaymentInfosTracker }> {
  const user = await createUser({
    walletIndex: nextWalletIndex(),
    tag,
    kycLevel,
    completePersonalData: true,
    language: 'EN',
  });
  await createBankAccount(user.jwt, { iban: TEST_IBAN });

  const paymentInfos = trackPaymentInfosResponses(page, 'paymentInfos');

  // Deliberately no 'networkidle' wait: a successful payment-info panel here starts sell-info
  // screen's own 5s getTransactionByRequestId poll loop, which keeps the network busy forever
  // (by design, so it can auto-advance to the completion screen) — content-based waits gate this.
  await gotoWithSession(
    page,
    `/sell/info?asset-in=ETH&asset-out=CHF&amount-in=${amountIn}&bank-account=${encodeURIComponent(TEST_IBAN)}${extraQuery}`,
    user.jwt,
  );
  expect(normPath(new URL(page.url()).pathname)).toBe('/sell/info');

  return { user, paymentInfos };
}

/**
 * Shared setup for /swap full-UI write-path and payment-panel tests: user (no bank account),
 * paymentInfos tracking, form pre-fill via URL params (no networkidle).
 */
async function setupSwapFullUiFlow(
  page: Page,
  tag: string,
  extraQuery = '',
): Promise<{ user: SellSwapUser; paymentInfos: PaymentInfosTracker }> {
  const user = await createUser({
    walletIndex: nextWalletIndex(),
    tag,
    // Level 50: the default wallet's RULE_3 refuses sell and swap quotes below it (sell-wallet-aml.spec.ts).
    kycLevel: 50,
    completePersonalData: true,
    language: 'EN',
  });

  const paymentInfos = trackPaymentInfosResponses(page, 'paymentInfos');

  // Same rationale as the /sell case above: skip 'networkidle', rely on content waits.
  await gotoWithSession(page, `/swap?asset-in=ETH&amount-in=0.1${extraQuery}`, user.jwt);
  expect(normPath(new URL(page.url()).pathname)).toBe('/swap');

  await expect(page.getByText('You spend', { exact: true })).toBeVisible({ timeout: 15000 });

  return { user, paymentInfos };
}

const WALLET_REDIRECT_URI = 'https://wallet.e2e.test/return/';
const WALLET_REDIRECT_QUERY = `&redirect-uri=${encodeURIComponent(WALLET_REDIRECT_URI)}`;
const REDIRECT_URI_KEY = 'dfx.srv.redirectUri';

/** The `/account-merge?otp=…` link in a decrypted notification, wherever the mail data carries it. */
function accountMergeLink(data: string): URL | undefined {
  const links: URL[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      if (!value.includes('/account-merge?')) return;
      try {
        links.push(new URL(value, process.env.E2E_FRONTEND_URL ?? 'http://frontend.e2e.test'));
      } catch {
        // not a URL on its own
      }
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(visit);
    }
  };
  visit(JSON.parse(data));
  return links.find((link) => link.pathname === '/account-merge' && link.searchParams.get('otp'));
}

/** The `account` claim of the session the page holds. */
async function sessionAccount(page: Page): Promise<number | undefined> {
  const token = await page.evaluate(() => window.localStorage.getItem('dfx.authenticationToken'));
  if (!token) return undefined;
  return (JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as { account?: number }).account;
}

/**
 * Any redirect URI found in localStorage, directly or inside the stored query parameters (an older version kept it
 * there).
 */
async function redirectUriInLocalStorage(page: Page): Promise<{ key: string | null; queryParams: unknown }> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem('dfx.srv.queryParams');
    return {
      key: window.localStorage.getItem(key),
      queryParams: raw ? (JSON.parse(raw) as { redirectUri?: unknown }).redirectUri : undefined,
    };
  }, REDIRECT_URI_KEY);
}

/**
 * Answers every request to the integrator's redirect target with 204, so the page stays open, and returns the list
 * of URLs the page was sent to.
 */
async function recordWalletRedirects(page: Page): Promise<URL[]> {
  const redirects: URL[] = [];
  await page.route('https://wallet.e2e.test/**', async (route) => {
    redirects.push(new URL(route.request().url()));
    await route.fulfill({ status: 204 });
  });
  return redirects;
}

/**
 * Clicks "Complete transaction in your wallet", submits the form while the button is busy and checks that this issues
 * no second redirect, checks the redirect against the form and the user's deposit route, checks that the page did not
 * turn into the manual-transfer page, then clicks again once the button is active and checks the second redirect.
 */
async function expectRepeatableHandOff(
  page: Page,
  redirects: URL[],
  opts: { path: string; assetInput: string; userId: number; routeType: 'Sell' | 'Crypto' },
): Promise<void> {
  const outcome = await waitForPricingOutcome(page, { timeoutMs: 25000 });
  expect(outcome.kind, outcome.detail).toBe('payment_info');

  const confirm = page.getByRole('button', { name: 'Complete transaction in your wallet' });
  await expect(confirm).toBeEnabled({ timeout: 15000 });
  await confirm.click();

  await expect.poll(() => redirects.length, { timeout: 15000 }).toBe(1);
  // The hand-off keeps the button busy for three seconds. A form submit in that time must not hand off again; it
  // would redirect at once, so no further redirect may be recorded once the button is active.
  await expect(confirm).toBeDisabled();
  await page
    .locator('form')
    .first()
    .evaluate((el) => (el as HTMLFormElement).requestSubmit());
  await expect(confirm).toBeEnabled({ timeout: 10000 });
  expect(redirects).toHaveLength(1);

  const [first] = redirects;
  expect(first.pathname).toBe(opts.path);
  const spend = page.locator('h2', { hasText: 'You spend' }).locator('..').locator('input[type="number"]').first();
  expect(first.searchParams.get('amount')).toBe(await spend.inputValue());
  expect(first.searchParams.get('asset')).toBe(await page.locator(`input[name="${opts.assetInput}"]`).inputValue());
  const blockchain = first.searchParams.get('blockchain');
  expect(blockchain).toBeTruthy();
  await expect(page.getByText(blockchain as string, { exact: true }).first()).toBeVisible();
  expect(first.searchParams.get('isComplete')).toBe('false');
  const route = await waitForRow<{ id: number }>(
    `SELECT id FROM deposit_route WHERE "userId" = $1 AND type = $2 ORDER BY id DESC LIMIT 1`,
    [opts.userId, opts.routeType],
  );
  expect(first.searchParams.get('routeId')).toBe(String(route.id));
  // orderUid names the confirmed payment info: the user's newest transaction request on this route
  const request = await waitForRow<{ uid: string }>(
    `SELECT uid FROM transaction_request WHERE "userId" = $1 AND "routeId" = $2 ORDER BY id DESC LIMIT 1`,
    [opts.userId, route.id],
  );
  expect(request.uid).toBeTruthy();
  expect(first.searchParams.get('orderUid')).toBe(request.uid);

  await expect(page.getByRole('button', { name: 'Click here once you have issued the transaction' })).toHaveCount(0);

  await expect(confirm).toBeEnabled({ timeout: 10000 });
  await confirm.click();
  await expect.poll(() => redirects.length, { timeout: 15000 }).toBe(2);
  expect(redirects[1].searchParams.get('routeId')).toBe(String(route.id));
}

/**
 * Clicks "Complete transaction in your wallet" and waits for the redirect, reloads the page from the address the app
 * left in the address bar, confirms again and checks that the reloaded page hands off again with the route and the
 * order instead of falling back to the manual transfer.
 */
async function expectHandOffAfterReload(
  page: Page,
  redirects: URL[],
  opts: { screen: string; path: string; userId: number; routeType: 'Sell' | 'Crypto' },
): Promise<void> {
  const outcome = await waitForPricingOutcome(page, { timeoutMs: 25000 });
  expect(outcome.kind, outcome.detail).toBe('payment_info');

  const confirm = page.getByRole('button', { name: 'Complete transaction in your wallet' });
  await expect(confirm).toBeEnabled({ timeout: 15000 });
  await confirm.click();
  await expect.poll(() => redirects.length, { timeout: 15000 }).toBe(1);
  expect(redirects[0].pathname).toBe(opts.path);

  // The reload opens what the address bar holds. The app removed its parameters there, so the reloaded page carries
  // neither the login nor the redirect URI and does not clear sessionStorage at boot; the redirect URI has to come
  // from the session store, where the hand-off kept it.
  const reloadUrl = new URL(page.url());
  expect(normPath(reloadUrl.pathname)).toBe(opts.screen);
  expect(reloadUrl.searchParams.has('session')).toBe(false);
  expect(reloadUrl.searchParams.has('redirect-uri')).toBe(false);
  expect(await page.evaluate((key) => window.sessionStorage.getItem(key), REDIRECT_URI_KEY)).toBe(WALLET_REDIRECT_URI);

  await page.reload();
  expect(normPath(new URL(page.url()).pathname)).toBe(opts.screen);
  await expect(page.getByText('You spend', { exact: true })).toBeVisible({ timeout: 15000 });
  const reloaded = await waitForPricingOutcome(page, { timeoutMs: 25000 });
  expect(reloaded.kind, reloaded.detail).toBe('payment_info');

  const manualTransfer = page.getByRole('button', { name: 'Click here once you have issued the transaction' });
  await expect(manualTransfer).toHaveCount(0);

  const confirmAgain = page.getByRole('button', { name: 'Complete transaction in your wallet' });
  await expect(confirmAgain).toBeEnabled({ timeout: 15000 });
  await confirmAgain.click();
  await expect.poll(() => redirects.length, { timeout: 15000 }).toBe(2);

  const second = redirects[1];
  expect(second.pathname).toBe(opts.path);
  const route = await waitForRow<{ id: number }>(
    `SELECT id FROM deposit_route WHERE "userId" = $1 AND type = $2 ORDER BY id DESC LIMIT 1`,
    [opts.userId, opts.routeType],
  );
  expect(second.searchParams.get('routeId')).toBe(String(route.id));
  // orderUid names the payment info confirmed after the reload: the user's newest transaction request on this route
  const request = await waitForRow<{ uid: string }>(
    `SELECT uid FROM transaction_request WHERE "userId" = $1 AND "routeId" = $2 ORDER BY id DESC LIMIT 1`,
    [opts.userId, route.id],
  );
  expect(request.uid).toBeTruthy();
  expect(second.searchParams.get('orderUid')).toBe(request.uid);

  await expect(manualTransfer).toHaveCount(0);
}

/** The hash the injected wallet answers for a transaction it accepts; no chain is behind it. */
const SENT_TX_HASH = `0x${'ab'.repeat(32)}`;

/** A mined, successful receipt for `hash`, the answer a chain node gives once the transaction is in a block. */
function minedReceipt(hash: string, from: string, to: unknown): WalletAnswer {
  return {
    result: {
      transactionHash: hash,
      transactionIndex: '0x0',
      blockHash: `0x${'cd'.repeat(32)}`,
      blockNumber: '0x1',
      from,
      to,
      cumulativeGasUsed: '0x5208',
      gasUsed: '0x5208',
      effectiveGasPrice: '0x3b9aca00',
      contractAddress: null,
      logs: [],
      logsBloom: `0x${'00'.repeat(256)}`,
      status: '0x1',
      type: '0x2',
    },
  };
}

/**
 * Logs in through an injected MetaMask wallet (the wallet extension is an external provider), which makes it the
 * active wallet, and opens the sell form with ETH → CHF and a bank account filled in until the payment information is
 * shown. The wallet answers `wallet_switchEthereumChain` with `switchChain`, `wallet_addEthereumChain` with
 * `addChain` and `eth_sendTransaction` with `sendTransaction`. Returns the wallet methods the page called.
 */
async function openSellWithInjectedWallet(
  page: Page,
  tag: string,
  switchChain: () => WalletAnswer,
  sendTransaction?: () => WalletAnswer,
  addChain?: () => WalletAnswer,
): Promise<string[]> {
  return (await openSellWithInjectedWalletAs(page, tag, switchChain, sendTransaction, addChain)).calls;
}

/**
 * `openSellWithInjectedWallet`, which also appends `query` to the sell URL it opens and returns the user's id next to
 * the wallet methods the page called.
 */
async function openSellWithInjectedWalletAs(
  page: Page,
  tag: string,
  switchChain: () => WalletAnswer,
  sendTransaction?: () => WalletAnswer,
  addChain?: () => WalletAnswer,
  query = '',
): Promise<{ calls: string[]; userId: number }> {
  const walletIndex = nextWalletIndex();
  // Level 50: the default wallet's RULE_3 refuses sell quotes below it (sell-wallet-aml.spec.ts).
  const user = await createUser({ walletIndex, tag, kycLevel: 50, completePersonalData: true, language: 'EN' });
  await createBankAccount(user.jwt, { iban: TEST_IBAN, label: 'Sell wallet BA' });
  const wallet = testWallet(walletIndex);
  const answers = walletAnswers(wallet, {
    connected: () => true,
    requestAccounts: () => ({ result: [wallet.address] }),
    switchChain,
    addChain,
    sendTransaction,
  });
  // web3 waits for the receipt of a transaction the wallet accepted; there is no chain behind the wallet, so it
  // answers the receipt as mined. Only a test whose wallet accepts the transaction reaches this request.
  let sentTo: unknown = null;
  const calls = await injectWallet(page, (method, params) => {
    if (method === 'eth_sendTransaction') sentTo = (params[0] as { to?: unknown } | undefined)?.to ?? null;
    if (method === 'eth_getTransactionReceipt') return minedReceipt(String(params[0]), wallet.address, sentTo);
    return answers(method, params);
  });

  await page.goto('/login?blockchain=Ethereum');
  await page.locator('img[src*="cryptowallet"]').click({ timeout: 15000 });
  await page.locator('img[src*="metamask"]').click();
  await expect.poll(() => normPath(new URL(page.url()).pathname), { timeout: 20000 }).toBe('/buy');
  // the login finishes loading the session on /buy; opening /sell before that can leave the form loading
  await page.waitForLoadState('networkidle');

  // Only the sell answer: the /buy screen the login lands on can still answer its own paymentInfos request here.
  const paymentInfos = trackPaymentInfosResponses(page, 'sell/paymentInfos');
  await page.goto(`/sell?asset-in=ETH&asset-out=CHF&amount-in=0.1${query}`);
  await expect(page.getByText('You spend', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/CH93|CH 93/i).first()).toBeVisible({ timeout: 15000 });
  const outcome = await waitForPricingOutcome(page, { timeoutMs: 25000 });
  const apiDetail = paymentInfos.last
    ? `PUT paymentInfos HTTP ${paymentInfos.last.status}: ${paymentInfos.last.body}`
    : 'no PUT paymentInfos response captured';
  expect(outcome.kind, `${outcome.detail}; ${apiDetail}`).toBe('payment_info');
  return { calls, userId: user.userId };
}

/**
 * Clicks "Complete transaction in your wallet" while the wallet cancels `method` (the chain switch or the
 * transaction), and checks that the form stays without an error, a completion or a client-error report.
 */
async function expectCancelledSwitchKeepsForm(
  page: Page,
  calls: string[],
  path: string,
  method = 'wallet_switchEthereumChain',
): Promise<void> {
  const sent = recordAuthAndErrorReports(page);
  const complete = page.getByRole('button', { name: 'Complete transaction in your wallet' });
  await expect(complete).toBeEnabled({ timeout: 15000 });
  await complete.click();

  await expect.poll(() => calls.includes(method), { timeout: 15000 }).toBe(true);
  await page.waitForTimeout(2000);
  await expect(page.getByText(/Transaction failed/)).toHaveCount(0);
  await expect(page.getByText(/Nice! You are all set!/)).toHaveCount(0);
  await expect(complete).toBeEnabled();
  expect(sent).toEqual([]);
  expect(normPath(new URL(page.url()).pathname)).toBe(path);
}

test.describe.configure({ mode: 'serial' });

test.describe('Sell + Swap e2e', () => {
  test.afterAll(async () => {
    await cleanupCreatedData();
  });

  // ---------------------------------------------------------------------------
  // Guards
  // ---------------------------------------------------------------------------

  test('unauthenticated /sell redirects to /login', async ({ page }) => {
    await page.goto('/sell');
    await page.waitForLoadState('networkidle');
    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'useAddressGuard(/login) must redirect unauthenticated /sell to /login',
        timeout: 15000,
      })
      .toBe('/login');
  });

  test('unauthenticated /sell/info redirects away (useAddressGuard default /)', async ({ page }) => {
    await page.goto('/sell/info');
    await page.waitForLoadState('networkidle');
    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'useAddressGuard() must redirect unauthenticated /sell/info',
        timeout: 15000,
      })
      .not.toBe('/sell/info');
  });

  test('unauthenticated /swap redirects to /login', async ({ page }) => {
    await page.goto('/swap');
    await page.waitForLoadState('networkidle');
    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'useAddressGuard(/login) must redirect unauthenticated /swap to /login',
        timeout: 15000,
      })
      .toBe('/login');
  });

  // ---------------------------------------------------------------------------
  // /sell — render + form
  // ---------------------------------------------------------------------------

  test('/sell renders spend/get form for address session with complete personal data', async ({ page }) => {
    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'sell-render',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });

    await openScreen(page, '/sell', user.jwt);

    // Layout title from useLayoutOptions → Navigation.
    await expect(page.getByText('Sell', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('You spend', { exact: true })).toBeVisible();
    await expect(page.getByText(/You get( about)?/)).toBeVisible();
    // Bank account selector placeholder (no accounts yet).
    await expect(page.getByText('Add or select your IBAN', { exact: true })).toBeVisible();
    // Amount field is a number input (StyledInput type=number → inputMode=decimal).
    await expect(page.locator('input[inputmode="decimal"]').first()).toBeVisible();
  });

  test('/sell checks the connected wallet in parallel and shows no banner when the API answers Ok', async ({
    page,
  }) => {
    test.setTimeout(120000);

    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'sell-address-check',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });

    const checkResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && new URL(response.url()).pathname === '/v1/sell/address-check',
      { timeout: 60000 },
    );
    let checkAnswered = false;
    void checkResponse.then(
      () => {
        checkAnswered = true;
      },
      () => undefined,
    );
    const checkRequest = page.waitForRequest(
      (request) => request.method() === 'GET' && new URL(request.url()).pathname === '/v1/sell/address-check',
      { timeout: 30000 },
    );

    // Hold the answer until the form assertions below have run. The mock API answers within
    // milliseconds, so without a gate the check can be finished before the test types — and then the
    // pending state the test is about would be a race instead of a property of the page.
    let releaseAddressCheck: () => void = () => undefined;
    const addressCheckGate = new Promise<void>((resolve) => (releaseAddressCheck = resolve));
    await page.route('**/v1/sell/address-check**', async (route) => {
      await addressCheckGate;
      await route.continue();
    });

    await page.goto('/sell?blockchain=Ethereum');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('img[src*="cryptowallet"]')).toBeVisible({ timeout: 15000 });
    await expect.poll(() => normPath(new URL(page.url()).pathname), { timeout: 20000 }).not.toBe('/sell');

    await page.locator('img[src*="cryptowallet"]').click();
    await page.locator('img[src*="command"]').click();

    const address = page.locator('input[name="address"]');
    await address.fill(user.wallet.address);
    await address.blur();

    const messageNode = page.locator('p.text-dfxBlue-800.min-w-0.break-words');
    await expect(messageNode).toBeVisible({ timeout: 20000 });
    const message = await messageNode.textContent();
    if (message == null || message.length === 0) {
      throw new Error('command-line sign message was empty');
    }
    const signature = await new ethers.Wallet(user.wallet.privateKey).signMessage(message);

    const signatureInput = page.locator('input[type="password"]');
    await signatureInput.fill(signature);
    await signatureInput.blur();

    const login = page.getByRole('button', { name: 'Login' });
    await expect(login).toBeEnabled();
    await login.click();

    await expect.poll(() => normPath(new URL(page.url()).pathname), { timeout: 20000 }).toBe('/sell');

    await checkRequest;
    // The form is unaffected: it renders and accepts input while and after the check runs.
    await expect(page.getByText('You spend', { exact: true })).toBeVisible();
    const amount = page.locator('input[inputmode="decimal"]').first();
    await expect(amount).toBeEnabled();
    await amount.fill('0.1');
    await expect(amount).toHaveValue('0.1');
    expect(checkAnswered, 'the form must be usable while the address check is still pending').toBe(false);
    await expect
      .poll(precheckLockIsFree, {
        timeout: 30000,
        message: 'another precheck must finish before the held address check is released',
      })
      .toBe(true);
    releaseAddressCheck();

    const response = await checkResponse;
    const requestUrl = new URL(response.url());
    expect(requestUrl.searchParams.get('blockchain'), 'the hint checks the chain of the selected asset').toBeTruthy();
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ result: 'Ok' });

    await expect(amount).toHaveValue('0.1');

    await expect(
      page.getByText(
        'Warning: According to our blockchain analysis, cryptocurrencies sent from this wallet address will most likely not be processed but returned to you.',
      ),
    ).toHaveCount(0);

    // The precheck screened the address through the Scorechain loc mock.
    const rows = await queryRows(`SELECT context, severity FROM scorechain_screening WHERE "objectId" = $1`, [
      user.address,
    ]);
    expect(rows).toEqual([{ context: 'Precheck', severity: 'NO_RISK' }]);
  });

  test('/sell shows the return banner when the connected wallet has a sanction-list hit', async ({ page }) => {
    test.setTimeout(120000);

    const user = await createUser({
      walletIndex: SANCTION_LIST_WALLET_INDEX,
      tag: 'sell-address-check-sanction',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });
    expect(user.wallet.address.toLowerCase()).toBe('0xcb43872a1cfa064dd61cc7e7507023837a1984f2');

    const checkResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && new URL(response.url()).pathname === '/v1/sell/address-check',
      { timeout: 60000 },
    );
    let checkAnswered = false;
    void checkResponse.then(
      () => {
        checkAnswered = true;
      },
      () => undefined,
    );
    const checkRequest = page.waitForRequest(
      (request) => request.method() === 'GET' && new URL(request.url()).pathname === '/v1/sell/address-check',
      { timeout: 30000 },
    );

    // Hold the answer until the form assertions below have run. The mock API answers within
    // milliseconds, so without a gate the check can be finished before the test types — and then the
    // pending state the test is about would be a race instead of a property of the page.
    let releaseAddressCheck: () => void = () => undefined;
    const addressCheckGate = new Promise<void>((resolve) => (releaseAddressCheck = resolve));
    await page.route('**/v1/sell/address-check**', async (route) => {
      await addressCheckGate;
      await route.continue();
    });

    await page.goto('/sell?blockchain=Ethereum');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('img[src*="cryptowallet"]')).toBeVisible({ timeout: 15000 });
    await expect.poll(() => normPath(new URL(page.url()).pathname), { timeout: 20000 }).not.toBe('/sell');

    await page.locator('img[src*="cryptowallet"]').click();
    await page.locator('img[src*="command"]').click();

    const address = page.locator('input[name="address"]');
    await address.fill(user.wallet.address);
    await address.blur();

    const messageNode = page.locator('p.text-dfxBlue-800.min-w-0.break-words');
    await expect(messageNode).toBeVisible({ timeout: 20000 });
    const message = await messageNode.textContent();
    if (message == null || message.length === 0) {
      throw new Error('command-line sign message was empty');
    }
    const signature = await new ethers.Wallet(user.wallet.privateKey).signMessage(message);

    const signatureInput = page.locator('input[type="password"]');
    await signatureInput.fill(signature);
    await signatureInput.blur();

    const login = page.getByRole('button', { name: 'Login' });
    await expect(login).toBeEnabled();
    await login.click();

    await expect.poll(() => normPath(new URL(page.url()).pathname), { timeout: 20000 }).toBe('/sell');

    await checkRequest;
    await expect(page.getByText('You spend', { exact: true })).toBeVisible();
    const amount = page.locator('input[inputmode="decimal"]').first();
    await expect(amount).toBeEnabled();
    await amount.fill('0.1');
    await expect(amount).toHaveValue('0.1');
    expect(checkAnswered, 'the form must be usable while the address check is still pending').toBe(false);
    await expect
      .poll(precheckLockIsFree, {
        timeout: 30000,
        message: 'another precheck must finish before the held address check is released',
      })
      .toBe(true);
    releaseAddressCheck();

    const response = await checkResponse;
    const requestUrl = new URL(response.url());
    expect(requestUrl.searchParams.get('blockchain'), 'the hint checks the chain of the selected asset').toBeTruthy();
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ result: 'LikelyReturn' });

    await expect(
      page.getByText(
        'Warning: According to our blockchain analysis, cryptocurrencies sent from this wallet address will most likely not be processed but returned to you.',
      ),
    ).toBeVisible();
    await expect(page.getByTestId('sell-address-check-banner')).toBeVisible();

    await expect(amount).toHaveValue('0.1');

    const rows = await queryRows(`SELECT context FROM scorechain_screening WHERE "objectId" = $1`, [user.address]);
    expect(rows).toEqual([{ context: 'Precheck' }]);
  });

  test(
    '/sell shows no banner when the address check runs into nothing (Unknown for an address Scorechain does not cover)',
    async ({ page }) => {
      test.setTimeout(120000);

      const user = await createUser({
        walletIndex: NO_COVERAGE_WALLET_INDEX,
        tag: 'sell-address-check-unknown',
        kycLevel: 30,
        completePersonalData: true,
        language: 'EN',
      });
      expect(user.wallet.address.toLowerCase()).toBe(NO_COVERAGE_WALLET_ADDRESS);

      // The API answers `Unknown` at once while another precheck holds the lock. Start only when the lock is free,
      // so the `Unknown` below comes from the mocked NoCoverage answer and not from that busy fallback.
      await expect
        .poll(precheckLockIsFree, {
          timeout: 30000,
          message: 'another precheck must finish before this address check starts',
        })
        .toBe(true);

      const checkResponse = page.waitForResponse(
        (response) =>
          response.request().method() === 'GET' && new URL(response.url()).pathname === '/v1/sell/address-check',
        { timeout: 60000 },
      );
      const checkRequest = page.waitForRequest(
        (request) => request.method() === 'GET' && new URL(request.url()).pathname === '/v1/sell/address-check',
        { timeout: 30000 },
      );

      await page.goto('/sell?blockchain=Ethereum');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('img[src*="cryptowallet"]')).toBeVisible({ timeout: 15000 });
      await expect.poll(() => normPath(new URL(page.url()).pathname), { timeout: 20000 }).not.toBe('/sell');

      await page.locator('img[src*="cryptowallet"]').click();
      await page.locator('img[src*="command"]').click();

      const address = page.locator('input[name="address"]');
      await address.fill(user.wallet.address);
      await address.blur();

      const messageNode = page.locator('p.text-dfxBlue-800.min-w-0.break-words');
      await expect(messageNode).toBeVisible({ timeout: 20000 });
      const message = await messageNode.textContent();
      if (message == null || message.length === 0) {
        throw new Error('command-line sign message was empty');
      }
      const signature = await new ethers.Wallet(user.wallet.privateKey).signMessage(message);

      const signatureInput = page.locator('input[type="password"]');
      await signatureInput.fill(signature);
      await signatureInput.blur();

      const login = page.getByRole('button', { name: 'Login' });
      await expect(login).toBeEnabled();
      await login.click();

      await expect.poll(() => normPath(new URL(page.url()).pathname), { timeout: 20000 }).toBe('/sell');

      await checkRequest;
      await expect(page.getByText('You spend', { exact: true })).toBeVisible();
      const amount = page.locator('input[inputmode="decimal"]').first();
      await expect(amount).toBeEnabled();
      await amount.fill('0.1');
      await expect(amount).toHaveValue('0.1');

      const response = await checkResponse;
      const requestUrl = new URL(response.url());
      expect(requestUrl.searchParams.get('blockchain')).toBe('Ethereum');
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual({ result: 'Unknown' });

      await expect(
        page.getByText(
          'Warning: According to our blockchain analysis, cryptocurrencies sent from this wallet address will most likely not be processed but returned to you.',
        ),
      ).toHaveCount(0);
      await expect(page.getByTestId('sell-address-check-banner')).toHaveCount(0);

      const rows = await queryRows(`SELECT context, severity FROM scorechain_screening WHERE "objectId" = $1`, [
        user.address,
      ]);
      expect(rows).toEqual([{ context: 'Precheck', severity: 'NoCoverage' }]);
    },
  );

  test('/sell bank account: invalid IBAN rejected; valid IBAN creates bank_data via UI', async ({ page }) => {
    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'sell-ba',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });
    // Use TEST_IBAN (known IsDfxIban-accepted under loc). Fresh user → no prior bank_data row.
    const uiIban = TEST_IBAN;

    await openScreen(page, '/sell', user.jwt);
    await expect(page.getByText('Add or select your IBAN', { exact: true })).toBeVisible({ timeout: 15000 });

    // Open bank-account modal (StyledModalButton).
    await page.getByText('Add or select your IBAN', { exact: true }).click();
    await expect(page.getByRole('button', { name: /Add bank account/i })).toBeVisible({ timeout: 10000 });

    // Invalid IBAN → submit stays disabled (Validations.Iban + Required).
    const ibanInput = page.locator('input[name="iban"]');
    await ibanInput.fill('NOT-A-VALID-IBAN');
    await ibanInput.blur();
    await expect(page.getByRole('button', { name: /Add bank account/i })).toBeDisabled();

    // Valid IBAN → enable submit → bank_data row.
    await ibanInput.fill(uiIban);
    await ibanInput.blur();
    // Optional label field (autocomplete="iban-label").
    const labelInput = page.locator('input[name="iban-label"]');
    if ((await labelInput.count()) > 0) {
      await labelInput.fill(`E2E BA ${e2eMail('ba-label').split('@')[0]}`);
    }

    const addBtn = page.getByRole('button', { name: /Add bank account/i });
    await expect(addBtn).toBeEnabled({ timeout: 10000 });
    await addBtn.click();

    const row = await waitForRow<{ id: number; iban: string }>(
      `SELECT id, iban FROM bank_data
       WHERE "userDataId" = $1 AND REPLACE(iban, ' ', '') = $2
       ORDER BY id DESC LIMIT 1`,
      [user.userDataId, uiIban.replace(/\s/g, '')],
      20000,
    );
    expect(row.iban.replace(/\s/g, '')).toBe(uiIban.replace(/\s/g, ''));
  });

  test('/sell asset dropdown only offers sellable assets (server-side getAssets sellable:true)', async ({ page }) => {
    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'sell-assets',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });
    const assets = await fetchAssets();
    const sellableNames = new Set(assets.filter((a) => a.sellable && !a.comingSoon).map((a) => a.name));
    expect(sellableNames.size, 'seed must have at least one sellable asset').toBeGreaterThan(0);

    await openScreen(page, '/sell', user.jwt);
    await expect(page.getByText('You spend', { exact: true })).toBeVisible({ timeout: 15000 });

    // Asset field is a StyledSearchDropdown: the CURRENT selection renders inside a text
    // <input name="asset">, not a button — only the OPEN list's items are <button>s. Click/focus
    // the input to open the list.
    const assetInput = page.locator('input[name="asset"]');
    await expect(assetInput).toBeVisible({ timeout: 15000 });
    await assetInput.click();

    // After open, list items show asset names. Collect visible option-like buttons.
    await page.waitForTimeout(400);
    const optionTexts = await page.locator('button').allTextContents();
    // Every offered asset that matches a known asset name must be sellable.
    const knownOffered = optionTexts
      .map((t) => t.trim())
      .flatMap((t) => {
        const hit = assets.find((a) => t === a.name || t.startsWith(a.name) || t.includes(a.name));
        return hit ? [hit.name] : [];
      })
      .filter((v, i, arr) => arr.indexOf(v) === i);

    const toCheck = knownOffered;
    expect(toCheck.length, 'asset dropdown should list at least one known asset').toBeGreaterThan(0);
    for (const name of toCheck) {
      expect(sellableNames.has(name), `asset "${name}" offered on /sell must be sellable`).toBe(true);
    }

    await page.keyboard.press('Escape');
  });

  test('/sell currency dropdown only offers sellable fiats', async ({
    page,
  }) => {
    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'sell-fiat',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });
    const fiats = await fetchFiats();
    const sellableNames = fiats.filter((f) => f.sellable).map((f) => f.name);
    expect(sellableNames.length, 'seed must have sellable fiats').toBeGreaterThan(0);

    await openScreen(page, '/sell', user.jwt);
    await expect(page.getByText(/You get( about)?/)).toBeVisible({ timeout: 15000 });

    const fiatCodes = fiats.map((f) => f.name);
    const currencyBtn = page
      .getByRole('button')
      .filter({ hasText: new RegExp(`^(${fiatCodes.join('|')})`) })
      .first();
    await expect(currencyBtn).toBeVisible({ timeout: 15000 });
    await currencyBtn.click();
    await page.waitForTimeout(400);

    const optionTexts = (await page.locator('button').allTextContents()).map((t) => t.trim());
    const offered = fiatCodes.filter((code) => optionTexts.some((t) => t === code || t.startsWith(code)));
    expect(offered.length, 'currency dropdown should list at least one fiat').toBeGreaterThan(0);

    for (const name of offered) {
      expect(sellableNames.includes(name), `currency "${name}" must be sellable`).toBe(true);
    }
    await page.keyboard.press('Escape');
  });

  test('/sell deposit_route via createSell (API path, independent of UI pricing)', async ({ page }) => {
    // `page` unused — factory-only proof kept in this file so the lane owns the write path.
    void page;
    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'sell-factory',
      kycLevel: 30,
      completePersonalData: true,
    });
    const sell = await safeCreateSell(user.jwt, { blockchain: 'Ethereum', iban: TEST_IBAN });
    expect(sell.sellId).toBeGreaterThan(0);

    const row = await waitForRow<{ id: number; type: string; iban: string }>(
      `SELECT id, type, iban FROM deposit_route WHERE id = $1`,
      [sell.sellId],
    );
    expect(row.type).toBe('Sell');
    expect(row.iban?.replace(/\s/g, '')).toBe(TEST_IBAN);
  });

  test('/sell full UI flow: form params produce a Sell deposit_route', async ({ page }) => {
    // Write-path proof only: form/URL params must create a Sell deposit_route. No panel wait.
    test.setTimeout(60000);
    const { user } = await setupSellFullUiFlow(page, 'sell-ui-write');

    const route = await waitForRow<{ id: number; type: string }>(
      `SELECT id, type FROM deposit_route
       WHERE "userId" = $1 AND type = 'Sell'
       ORDER BY id DESC LIMIT 1`,
      [user.userId],
      30000,
    );
    expect(route.type).toBe('Sell');
  });

  test('/sell full UI flow: payment panel renders after paymentInfos', async ({ page }) => {
    test.setTimeout(90000);
    const { paymentInfos } = await setupSellFullUiFlow(page, 'sell-ui-panel');

    const outcome = await waitForPricingOutcome(page, { timeoutMs: 25000 });
    const apiDetail = paymentInfos.last
      ? `PUT paymentInfos HTTP ${paymentInfos.last.status}: ${paymentInfos.last.body}`
      : 'no PUT paymentInfos response captured';
    expect(
      outcome.kind,
      `expected payment_info panel (${outcome.detail}); ${apiDetail}`,
    ).toBe('payment_info');

    const completeBtn = page.getByRole('button', {
      name: /Click here once you have issued the transaction/i,
    });
    const paymentHeading = page.getByRole('heading', { name: 'Payment Information', exact: true });
    await expect(paymentHeading.or(completeBtn).first()).toBeVisible();

    // When the complete CTA is the visible panel path, click through and assert success hard.
    if (await completeBtn.isVisible()) {
      await completeBtn.click();
      await expect(
        page.getByText('Nice! You are all set! Give us a minute to handle your transaction.'),
      ).toBeVisible({ timeout: 15000 });
    }
  });

  test('/sell: a chain switch cancelled in the wallet keeps the user on the form without an error', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const calls = await openSellWithInjectedWallet(page, 'sell-wallet-cancel', () => ({
      error: { code: 4001, message: 'User rejected the request.' },
    }));

    await expectCancelledSwitchKeepsForm(page, calls, '/sell');
  });

  test('/sell: a transaction cancelled in the wallet keeps the user on the form without an error', async ({ page }) => {
    test.setTimeout(120000);
    // MetaMask's rejection of a transaction: a plain object with code 4001 and data, which web3 used to strip
    const calls = await openSellWithInjectedWallet(
      page,
      'sell-wallet-tx-cancel',
      () => ({ result: null }),
      () => ({ error: { code: 4001, message: 'User rejected the request.', data: { location: 'confirmation' } } }),
    );

    await expectCancelledSwitchKeepsForm(page, calls, '/sell', 'eth_sendTransaction');
  });

  test('/sell: a chain switch that fails in the wallet still shows that the transaction failed', async ({ page }) => {
    test.setTimeout(120000);
    const calls = await openSellWithInjectedWallet(page, 'sell-wallet-fail', () => ({
      error: { code: -32603, message: 'Internal JSON-RPC error.' },
    }));

    await page.getByRole('button', { name: 'Complete transaction in your wallet' }).click({ timeout: 15000 });
    await expect.poll(() => calls.includes('wallet_switchEthereumChain'), { timeout: 15000 }).toBe(true);
    await expect(page.getByText(/Transaction failed\. Click Retry/)).toBeVisible({ timeout: 15000 });
  });

  test('/sell: adding the chain cancelled in the wallet keeps the user on the form without an error', async ({ page }) => {
    test.setTimeout(120000);
    // the wallet does not know the chain (4902), so the app asks to add it, which the user cancels
    const calls = await openSellWithInjectedWallet(
      page,
      'sell-wallet-add-chain-cancel',
      () => ({ error: { code: 4902, message: 'Unrecognized chain ID.' } }),
      undefined,
      () => ({ error: { code: 4001, message: 'User rejected the request.' } }),
    );

    await expectCancelledSwitchKeepsForm(page, calls, '/sell', 'wallet_addEthereumChain');
  });

  test('/sell: adding the chain that fails in the wallet still shows that the transaction failed', async ({ page }) => {
    test.setTimeout(120000);
    const calls = await openSellWithInjectedWallet(
      page,
      'sell-wallet-add-chain-fail',
      () => ({ error: { code: 4902, message: 'Unrecognized chain ID.' } }),
      undefined,
      () => ({ error: { code: -32602, message: 'Invalid chain parameters.' } }),
    );

    await page.getByRole('button', { name: 'Complete transaction in your wallet' }).click({ timeout: 15000 });
    await expect.poll(() => calls.includes('wallet_addEthereumChain'), { timeout: 15000 }).toBe(true);
    await expect(page.getByText(/Transaction failed\. Click Retry/)).toBeVisible({ timeout: 15000 });
  });

  test('/sell: confirming with a redirect URI redirects with the sell route and can be repeated', async ({ page }) => {
    test.setTimeout(90000);
    const { user } = await setupSellFullUiFlow(page, 'sell-hand-off', WALLET_REDIRECT_QUERY);
    const redirects = await recordWalletRedirects(page);

    await expectRepeatableHandOff(page, redirects, {
      path: '/return/sell',
      assetInput: 'asset',
      userId: user.userId,
      routeType: 'Sell',
    });
  });

  test('/sell: after a hand-off, a reload hands off again instead of the manual transfer', async ({ page }) => {
    test.setTimeout(120000);
    const { user } = await setupSellFullUiFlow(page, 'sell-hand-off-reload', WALLET_REDIRECT_QUERY);
    const redirects = await recordWalletRedirects(page);

    await expectHandOffAfterReload(page, redirects, {
      screen: '/sell',
      path: '/return/sell',
      userId: user.userId,
      routeType: 'Sell',
    });
  });

  test('/sell: a redirect URI left without confirming is not offered in a new session opened without login parameters', async ({
    page,
  }) => {
    test.setTimeout(90000);
    await setupSellFullUiFlow(page, 'sell-redirect-session', WALLET_REDIRECT_QUERY);

    // The user leaves without confirming; in the same session the page still offers the way back to the wallet.
    await page.goto('/');
    await expect(headerBackButton(page)).toBeVisible({ timeout: 15000 });

    // A new page shares localStorage (and the login token) with the first one but starts with its own empty
    // sessionStorage, as a new WebView does. The wallet opens /buy there without session, address/signature or
    // redirect URI, so boot clears nothing and the page logs in with the stored token.
    const next = await page.context().newPage();
    try {
      await isolateFromExternalHosts(next);
      const userResponsePromise = next.waitForResponse(
        (response) => response.request().method() === 'GET' && /\/v[12]\/user$/.test(new URL(response.url()).pathname),
        { timeout: 20000 },
      );
      await next.goto('/buy');
      const userResponse = await userResponsePromise;
      expect(userResponse.ok(), `GET /v2/user returned ${userResponse.status()}`).toBe(true);
      // /buy sends a visitor without a login to /login; the buy form on /buy shows the page is logged in.
      await expect(next.getByText('You spend', { exact: true })).toBeVisible({ timeout: 15000 });
      expect(normPath(new URL(next.url()).pathname)).toBe('/buy');

      await next.goto('/');
      await expect(next.locator('img[alt="logo"]')).toBeVisible({ timeout: 15000 });
      await expect(headerBackButton(next)).toHaveCount(0);

      expect(await next.evaluate((key) => window.sessionStorage.getItem(key), REDIRECT_URI_KEY)).toBeNull();
      expect(await redirectUriInLocalStorage(next)).toEqual({ key: null, queryParams: undefined });
    } finally {
      await next.close();
    }

    // The first page keeps the redirect URI for its own session, not in localStorage.
    expect(await page.evaluate((key) => window.sessionStorage.getItem(key), REDIRECT_URI_KEY)).toBe(
      WALLET_REDIRECT_URI,
    );
    expect(await redirectUriInLocalStorage(page)).toEqual({ key: null, queryParams: undefined });
  });

  test('/sell: a KYC level 0 user without a bank account follows "I am already verified with DFX" to /link and returns to /sell with the amount and the redirect URI', async ({
    page,
  }) => {
    test.setTimeout(90000);
    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'sell-link-kyc0',
      kycLevel: 0,
      language: 'EN',
    });
    const paymentInfos = trackPaymentInfosResponses(page, 'paymentInfos');

    await gotoWithSession(page, `/sell?asset-in=ETH&asset-out=CHF&amount-in=0.2${WALLET_REDIRECT_QUERY}`, user.jwt);
    expect(normPath(new URL(page.url()).pathname)).toBe('/sell');
    await expect(page.getByText('You spend', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Add or select your IBAN', { exact: true })).toBeVisible();
    const spend = page.locator('h2', { hasText: 'You spend' }).locator('..').locator('input[type="number"]').first();
    await expect(spend).toHaveValue('0.2');

    const link = page.getByText('I am already verified with DFX', { exact: true });
    await expect(link).toBeVisible({ timeout: 15000 });
    await expect(link).toBeInViewport();
    expect(paymentInfos.last).toBeNull();

    await link.click();
    await page.waitForURL((url) => normPath(url.pathname) === '/link', { timeout: 15000 });

    // createUser always sets a mail, so ContactData is already complete and /link ends on "no matching account"
    // (the /link cases in kyc.spec.ts); its Back runs the same return as the OK after the merge mail was sent.
    await expect(page.getByText('No matching account was found.', { exact: true })).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: 'Back' }).click();

    await page.waitForURL((url) => normPath(url.pathname) === '/sell', { timeout: 15000 });
    await expect(page.getByText('You spend', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(spend).toHaveValue('0.2');
    expect(await page.evaluate((key) => window.sessionStorage.getItem(key), REDIRECT_URI_KEY)).toBe(
      WALLET_REDIRECT_URI,
    );
    expect(await redirectUriInLocalStorage(page)).toEqual({ key: null, queryParams: undefined });
  });

  // The API image is built from backend develop. Without the backend change that accepts `redirectUri` with the
  // contact data, the merge mail carries no `return-url` and the confirmation still ends on "My account"; this case
  // then asserts that. It asserts the return to /sell once the mail link carries `return-url`.
  test('/sell: a KYC level 0 user enters the mail of a verified account on /link, confirms the merge mail in a new page and continues where the mail link says', async ({
    page,
  }) => {
    test.setTimeout(180000);
    const master = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'sell-merge-master',
      kycLevel: 50,
      completePersonalData: true,
      language: 'EN',
    });
    const masterMail = required(master.mail, 'createUser returns the mail it set');

    // A fresh sign-up without a mail, so ContactData is still open and /link shows the mail form.
    const slaveWallet = testWallet(nextWalletIndex());
    const slaveJwt = await signatureLogin(slaveWallet);
    const slave = required(
      await queryOne<{ id: number; userDataId: number }>(
        `SELECT id, "userDataId" AS "userDataId" FROM "user" WHERE address = $1 LIMIT 1`,
        [slaveWallet.address],
      ),
      'the "user" row of the signed-up slave wallet',
    );
    trackRow('user_data', slave.userDataId);
    trackRow('user', slave.id);
    const english = required(
      await queryOne<{ id: number }>(`SELECT id FROM language WHERE symbol = 'EN' LIMIT 1`),
      'the EN language row',
    );
    await apiPut<unknown>('user', { language: { id: english.id } }, { jwt: slaveJwt, version: 'v2', expectOk: true });

    await gotoWithSession(page, `/sell?asset-in=ETH&asset-out=CHF&amount-in=0.2${WALLET_REDIRECT_QUERY}`, slaveJwt);
    const spend = page.locator('h2', { hasText: 'You spend' }).locator('..').locator('input[type="number"]').first();
    await expect(spend).toHaveValue('0.2', { timeout: 15000 });

    await page.getByText('I am already verified with DFX', { exact: true }).click({ timeout: 15000 });
    await page.waitForURL((url) => normPath(url.pathname) === '/link', { timeout: 15000 });

    const mailInput = page.getByPlaceholder('example@mail.com');
    await expect(mailInput).toBeVisible({ timeout: 20000 });
    await mailInput.fill(masterMail);

    const contactPut = page.waitForResponse((response) => {
      const request = response.request();
      return request.method() === 'PUT' && (request.postData() ?? '').includes(masterMail);
    });
    await page.getByRole('button', { name: 'Next' }).click();
    const contactResponse = await contactPut;
    expect(contactResponse.ok(), `contact data PUT returned ${contactResponse.status()}`).toBe(true);

    // What the app sends does not depend on the backend change: the page to return to, on this origin.
    const sent = contactResponse.request().postDataJSON() as { mail?: string; redirectUri?: string };
    const returnTarget = new URL(required(sent.redirectUri, 'redirectUri in the contact data body'));
    expect(returnTarget.origin).toBe(new URL(page.url()).origin);
    expect(returnTarget.pathname).toBe('/sell');
    expect(returnTarget.searchParams.get('amount-in')).toBe('0.2');
    expect(returnTarget.searchParams.get('asset-in')).toBe('ETH');
    expect(returnTarget.searchParams.get('asset-out')).toBe('CHF');
    expect(returnTarget.searchParams.get('redirect-uri')).toBe(WALLET_REDIRECT_URI);
    for (const login of ['session', 'address', 'signature', 'code']) {
      expect(returnTarget.searchParams.has(login), `redirectUri carries "${login}"`).toBe(false);
    }

    await expect(page.getByText(/It looks like you already have an account with DFX\./)).toBeVisible({
      timeout: 20000,
    });

    await waitForRow<{ id: number }>(
      `SELECT id FROM account_merge WHERE "masterId" = $1 AND "slaveId" = $2 ORDER BY id DESC LIMIT 1`,
      [master.userDataId, slave.userDataId],
      20000,
    );
    const mail = await waitForMatchingRow<{ data: string }>(
      `SELECT n.data FROM notification n WHERE n."userDataId" IN ($1, $2) ORDER BY n.id DESC`,
      [master.userDataId, slave.userDataId],
      (row) => accountMergeLink(decryptPii(row.data)) !== undefined,
      20000,
    );
    const mergeLink = required(accountMergeLink(decryptPii(mail.data)), 'the /account-merge link in the merge mail');
    const returnUrl = mergeLink.searchParams.get('return-url');

    const next = await page.context().newPage();
    try {
      await isolateFromExternalHosts(next);
      await next.goto(mergeLink.href);
      await expect(next.getByText('Wallet address added', { exact: true })).toBeVisible({ timeout: 30000 });

      const merge = await waitForRow<{ isCompleted: boolean }>(
        `SELECT "isCompleted" AS "isCompleted" FROM account_merge
         WHERE "masterId" = $1 AND "slaveId" = $2 AND "isCompleted" = true
         ORDER BY id DESC LIMIT 1`,
        [master.userDataId, slave.userDataId],
        20000,
      );
      expect(merge.isCompleted).toBe(true);

      await next.getByRole('button', { name: 'My account' }).click();

      if (returnUrl === null) {
        await next.waitForURL((url) => normPath(url.pathname) === '/account', { timeout: 15000 });
        return;
      }

      expect(returnUrl).toBe(sent.redirectUri);
      await next.waitForURL((url) => normPath(url.pathname) === '/sell', { timeout: 30000 });
      const nextSpend = next
        .locator('h2', { hasText: 'You spend' })
        .locator('..')
        .locator('input[type="number"]')
        .first();
      await expect(nextSpend).toHaveValue('0.2', { timeout: 20000 });
      await next.waitForFunction(
        ([key, expected]) => window.sessionStorage.getItem(key) === expected,
        [REDIRECT_URI_KEY, WALLET_REDIRECT_URI],
        { timeout: 15000 },
      );
      await expect.poll(() => new URL(next.url()).searchParams.has('session'), { timeout: 15000 }).toBe(false);
      await expect.poll(() => sessionAccount(next), { timeout: 15000 }).toBe(master.userDataId);
      await expect(next.getByText('I am already verified with DFX', { exact: true })).toHaveCount(0);
    } finally {
      await next.close();
    }
  });

  test('/sell: closing a sell the wallet sent redirects once as complete with the route and the order', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const { calls, userId } = await openSellWithInjectedWalletAs(
      page,
      'sell-wallet-complete-redirect',
      () => ({ result: null }),
      () => ({ result: SENT_TX_HASH }),
      undefined,
      WALLET_REDIRECT_QUERY,
    );
    const redirects = await recordWalletRedirects(page);

    // The active wallet sends the transaction itself, so confirming does not hand off to the redirect URI.
    await page.getByRole('button', { name: 'Complete transaction in your wallet' }).click({ timeout: 15000 });
    await expect.poll(() => calls.includes('eth_sendTransaction'), { timeout: 15000 }).toBe(true);
    await expect(page.getByText('Nice! You are all set! Give us a minute to handle your transaction.')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText('Transaction hash')).toBeVisible();
    expect(redirects).toHaveLength(0);

    // Close on the completion screen calls closeServices as complete and opens /account; it redirects 2 s later.
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect.poll(() => redirects.length, { timeout: 15000 }).toBe(1);
    expect(normPath(new URL(page.url()).pathname)).toBe('/account');

    const [redirect] = redirects;
    expect(redirect.pathname).toBe('/return/sell');
    expect(redirect.searchParams.get('isComplete')).toBe('true');
    const route = await waitForRow<{ id: number }>(
      `SELECT id FROM deposit_route WHERE "userId" = $1 AND type = $2 ORDER BY id DESC LIMIT 1`,
      [userId, 'Sell'],
    );
    expect(redirect.searchParams.get('routeId')).toBe(String(route.id));
    // orderUid names the payment info the wallet paid: the user's newest transaction request on this route
    const request = await waitForRow<{ uid: string }>(
      `SELECT uid FROM transaction_request WHERE "userId" = $1 AND "routeId" = $2 ORDER BY id DESC LIMIT 1`,
      [userId, route.id],
    );
    expect(request.uid).toBeTruthy();
    expect(redirect.searchParams.get('orderUid')).toBe(request.uid);

    // closeServices gives up the redirect URI, unlike a hand-off, so nothing redirects a second time.
    expect(await page.evaluate((key) => window.sessionStorage.getItem(key), REDIRECT_URI_KEY)).toBeNull();
    await page.waitForTimeout(3000);
    expect(redirects).toHaveLength(1);
  });

  test('/sell: native form submit completes the transaction', async ({ page }) => {
    test.setTimeout(90000);
    await setupSellFullUiFlow(page, 'sell-form-submit');
    const outcome = await waitForPricingOutcome(page, { timeoutMs: 25000 });
    expect(outcome.kind).toBe('payment_info');
    // Wallet CTA (`Complete transaction in your wallet`) is also payment_info; handleNext then
    // closes instead of completing. Pin the manual path like the panel test and buy form-submit.
    const completeBtn = page.getByRole('button', {
      name: /Click here once you have issued the transaction/i,
    });
    await expect(completeBtn).toBeEnabled();
    const form = page.locator('form').first();
    await expect(form).toBeVisible();
    await form.evaluate((el) => (el as HTMLFormElement).requestSubmit());
    await expect(
      page.getByText('Nice! You are all set! Give us a minute to handle your transaction.'),
    ).toBeVisible({ timeout: 15000 });
  });

  test('/sell: native form submit does not complete after spend is cleared', async ({ page }) => {
    test.setTimeout(90000);
    await setupSellFullUiFlow(page, 'sell-form-submit-cleared');
    const outcome = await waitForPricingOutcome(page, { timeoutMs: 25000 });
    expect(outcome.kind).toBe('payment_info');
    const spend = page.locator('h2', { hasText: 'You spend' }).locator('..').locator('input[type="number"]').first();
    await spend.click();
    await spend.fill('');
    await spend.blur();
    await expect.poll(async () => spend.inputValue(), { timeout: 8000 }).toBe('');
    const form = page.locator('form').first();
    await form.evaluate((el) => (el as HTMLFormElement).requestSubmit());
    await expect(page.getByText(/Nice! You are all set!/i)).toHaveCount(0);
    await expect(spend).toHaveValue('');
  });

  test('/sell: clearing the spend amount keeps the field empty (no cross-side refill)', async ({ page }) => {
    test.setTimeout(90000);
    await setupSellFullUiFlow(page, 'sell-clear-spend');
    const outcome = await waitForPricingOutcome(page, { timeoutMs: 25000 });
    expect(outcome.kind).toBe('payment_info');

    const spend = page.locator('h2', { hasText: 'You spend' }).locator('..').locator('input[type="number"]').first();
    await expect(spend).toHaveValue('0.1');
    await spend.click();
    await spend.fill('');
    await spend.blur();

    await expect
      .poll(
        async () => {
          const value = await spend.inputValue();
          const paymentVisible = await page
            .getByRole('heading', { name: 'Payment Information' })
            .isVisible()
            .catch(() => false);
          return { value, paymentVisible };
        },
        { timeout: 8000, message: 'cleared sell spend amount must stay empty' },
      )
      .toEqual({ value: '', paymentVisible: false });
  });

  // ---------------------------------------------------------------------------
  // /sell while sell is paused at runtime
  // ---------------------------------------------------------------------------

  // This case switches sell off for the whole API, so no other sell case may run while it does. The file is
  // `test.describe.configure({ mode: 'serial' })` and playwright.config.ts runs one worker, so nothing runs
  // beside it; the `finally` waits until sell answers again before the next case starts.
  test('/sell: while sell is paused through the disabledProcess setting, the screen shows the paused message and no payment information', async ({
    page,
  }) => {
    test.setTimeout(240000);

    // A second account asks the API directly whether the switch has arrived, before the screen is opened.
    const probe = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'sell-paused-probe',
      // Level 50: the default wallet's RULE_3 refuses sell quotes below it (sell-wallet-aml.spec.ts).
      kycLevel: 50,
      completePersonalData: true,
      language: 'EN',
    });
    await createBankAccount(probe.jwt, { iban: TEST_IBAN, label: 'Sell paused probe BA' });
    const quote = await ethToChfSellQuote();

    const previous = await readDisabledProcessSetting();
    try {
      await pauseSellThroughSetting(previous);
      await expect
        .poll(() => sellQuoteAnswer(probe.jwt, quote), {
          timeout: PROCESS_RESYNC_TIMEOUT_MS,
          intervals: [2000],
          message: `PUT /v1/sell/paymentInfos must answer ${TRANSACTIONS_PAUSED} once the API has re-read the setting`,
        })
        .toBe(TRANSACTIONS_PAUSED);

      const { paymentInfos } = await setupSellFullUiFlow(page, 'sell-paused');

      // Waits for the screen's own quote answer, then asserts its message on screen and no payment information.
      const answer = await expectUnavailableSwapQuoteOnScreen(page, () => paymentInfos.last);
      expect(answer, `PUT sell/paymentInfos answer of the screen: ${paymentInfos.last?.body}`).toEqual({
        kind: 'paused',
        status: 503,
        message: TRANSACTIONS_PAUSED_MESSAGE,
      });
      await expect(page.getByRole('button', { name: 'Complete transaction in your wallet' })).toHaveCount(0);
    } finally {
      await restoreDisabledProcessSetting(previous);
      await expect
        .poll(() => sellQuoteAnswer(probe.jwt, quote), {
          timeout: PROCESS_RESYNC_TIMEOUT_MS,
          intervals: [2000],
          message: 'PUT /v1/sell/paymentInfos must stop answering paused once the setting is restored',
        })
        .not.toBe(TRANSACTIONS_PAUSED);
    }
  });

  // ---------------------------------------------------------------------------
  // /sell/info
  // ---------------------------------------------------------------------------

  test('/sell/info missing required params shows "Missing required information"', async ({ page }) => {
    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'sell-info-miss',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });

    await openScreen(page, '/sell/info', user.jwt);
    await expect(page.getByText('Missing required information', { exact: true })).toBeVisible({ timeout: 15000 });
  });

  test('/sell/info invalid bank-account IBAN shows Invalid IBAN error', async ({ page }) => {
    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'sell-info-iban',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });

    await gotoWithSession(page, `/sell/info?asset-in=ETH&asset-out=CHF&amount-in=0.1&bank-account=NOTANIBAN`, user.jwt);
    await page.waitForLoadState('networkidle');
    expect(normPath(new URL(page.url()).pathname)).toBe('/sell/info');

    await expect(page.getByText(/Invalid IBAN/i)).toBeVisible({ timeout: 15000 });
  });

  test('/sell/info with valid query params: form params produce a Sell deposit_route', async ({ page }) => {
    // Write-path proof only: valid query params must create a Sell deposit_route. No panel wait.
    test.setTimeout(60000);
    const { user } = await setupSellInfoUiFlow(page, 'sell-info-write');

    const route = await waitForRow<{ id: number; type: string }>(
      `SELECT id, type FROM deposit_route
       WHERE "userId" = $1 AND type = 'Sell'
       ORDER BY id DESC LIMIT 1`,
      [user.userId],
      30000,
    );
    expect(route.type).toBe('Sell');
  });

  test('/sell/info with valid query params: renders Transaction Details / Payment Information', async ({
    page,
  }) => {
    test.setTimeout(75000);
    const { paymentInfos } = await setupSellInfoUiFlow(page, 'sell-info-panel');

    const outcome = await waitForPricingOutcome(page, { timeoutMs: 25000 });
    const apiDetail = paymentInfos.last
      ? `PUT paymentInfos HTTP ${paymentInfos.last.status}: ${paymentInfos.last.body}`
      : 'no PUT paymentInfos response captured';
    expect(
      outcome.kind,
      `expected payment_info panel (${outcome.detail}); ${apiDetail}`,
    ).toBe('payment_info');

    // Both "Transaction Details" and the "Payment Information" heading can be visible at once
    // (they are not mutually exclusive sections of the same successful panel) — `.first()` keeps
    // this a single-element assertion regardless of how many of the two are present.
    const txDetails = page.getByText('Transaction Details', { exact: true });
    await expect(
      txDetails.or(page.getByRole('heading', { name: 'Payment Information' })).first(),
    ).toBeVisible();
  });

  test('/sell/info: amount below minimum shows the minimum instead of a spinner and Close redirects once to the plain URI', async ({
    page,
  }) => {
    test.setTimeout(90000);

    // Seeded by scripts/up.sh before the API's final start, like the CHF minimum of the buy case.
    const spec = await queryOne<{ minVolume: string | number }>(
      `SELECT "minVolume" FROM transaction_specification
       WHERE system = 'Ethereum' AND asset = 'ETH' AND direction = 'In' LIMIT 1`,
    );
    expect(Number(spec?.minVolume ?? 0), 'up.sh must have seeded an ETH In minimum volume').toBeGreaterThan(0);

    // /sell/info picks its asset from the available chains, which `blockchains` limits to the seeded minimum's chain.
    await setupSellInfoUiFlow(page, 'sell-info-min', `&blockchains=Ethereum${WALLET_REDIRECT_QUERY}`, '0.000001');
    const redirects = await recordWalletRedirects(page);

    await expect(page.getByText(/Entered amount is below minimum deposit of [\d.,\s]+ ETH/)).toBeVisible({
      timeout: 25000,
    });
    const close = page.getByRole('button', { name: 'Close', exact: true });
    await expect(close).toBeVisible();
    await expect(page.locator('[role="status"], .animate-spin')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Payment Information' })).toHaveCount(0);

    await close.click();
    await expect.poll(() => redirects.length, { timeout: 15000 }).toBe(1);
    expect(redirects[0].toString()).toBe(WALLET_REDIRECT_URI);

    expect(await page.evaluate((key) => window.sessionStorage.getItem(key), REDIRECT_URI_KEY)).toBeNull();
    await page.waitForTimeout(3000);
    expect(redirects).toHaveLength(1);
  });

  test('/sell/info: KYC level 30 shows the KYC hint instead of a spinner or payment information', async ({ page }) => {
    test.setTimeout(75000);
    await setupSellInfoUiFlow(page, 'sell-info-kyc', '', '0.1', 30);

    await expect(
      page.getByText(
        'This transaction is only possible with a verified account. Please complete our KYC (Know-Your-Customer) process.',
      ),
    ).toBeVisible({ timeout: 25000 });
    await expect(page.getByRole('button', { name: 'Complete KYC', exact: true })).toBeVisible();
    await expect(page.locator('[role="status"], .animate-spin')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Payment Information' })).toHaveCount(0);
    await expect(page.getByText('Transaction Details', { exact: true })).toHaveCount(0);
  });

  test('/sell/info: confirming with a redirect URI redirects once with the sell route and the order', async ({
    page,
  }) => {
    test.setTimeout(90000);
    const { user, paymentInfos } = await setupSellInfoUiFlow(page, 'sell-info-redirect', WALLET_REDIRECT_QUERY);
    const redirects = await recordWalletRedirects(page);

    const outcome = await waitForPricingOutcome(page, { timeoutMs: 25000 });
    const apiDetail = paymentInfos.last
      ? `PUT paymentInfos HTTP ${paymentInfos.last.status}: ${paymentInfos.last.body}`
      : 'no PUT paymentInfos response captured';
    expect(outcome.kind, `${outcome.detail}; ${apiDetail}`).toBe('payment_info');

    // Without an active wallet, the redirect URI is what offers the wallet button; confirming calls closeServices.
    const confirm = page.getByRole('button', { name: 'Complete transaction in your wallet' });
    await expect(confirm).toBeEnabled({ timeout: 15000 });
    await confirm.click();

    // closeServices sends the page to the redirect URI 2 s after the click, not at once, and does not navigate.
    expect(redirects).toHaveLength(0);
    await expect.poll(() => redirects.length, { timeout: 15000 }).toBe(1);
    expect(normPath(new URL(page.url()).pathname)).toBe('/sell/info');

    const [redirect] = redirects;
    expect(redirect.pathname).toBe('/return/sell');
    expect(redirect.searchParams.get('isComplete')).toBe('false');
    const route = await waitForRow<{ id: number }>(
      `SELECT id FROM deposit_route WHERE "userId" = $1 AND type = $2 ORDER BY id DESC LIMIT 1`,
      [user.userId, 'Sell'],
    );
    expect(redirect.searchParams.get('routeId')).toBe(String(route.id));
    // orderUid names the confirmed payment info: the user's newest transaction request on this route
    const request = await waitForRow<{ uid: string }>(
      `SELECT uid FROM transaction_request WHERE "userId" = $1 AND "routeId" = $2 ORDER BY id DESC LIMIT 1`,
      [user.userId, route.id],
    );
    expect(request.uid).toBeTruthy();
    expect(redirect.searchParams.get('orderUid')).toBe(request.uid);

    // closeServices gives up the redirect URI, unlike a hand-off, so nothing redirects a second time.
    expect(await page.evaluate((key) => window.sessionStorage.getItem(key), REDIRECT_URI_KEY)).toBeNull();
    await page.waitForTimeout(3000);
    expect(redirects).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // /swap
  // ---------------------------------------------------------------------------

  test('/swap renders spend/get form for address session', async ({ page }) => {
    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'swap-render',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });

    await openScreen(page, '/swap', user.jwt);

    await expect(page.getByText('Swap', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('You spend', { exact: true })).toBeVisible();
    await expect(page.getByText(/You get( about)?/)).toBeVisible();
    await expect(page.locator('input[inputmode="decimal"]').first()).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // Service notice: slim above the form on /sell and /swap, absent on every other page
  // ---------------------------------------------------------------------------

  test('/sell and /swap show the slim service notice above the form; /buy and other pages show none', async ({
    page,
  }) => {
    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'service-notice-sell-swap',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });

    // The notice text, followed by the More link to the security incident page.
    const noticeText =
      'All DFX core features are available again. Do not send crypto tokens to deposit addresses you received from DFX before 18 November 2026. More';

    for (const path of ['/sell', '/swap']) {
      await openScreen(page, path, user.jwt);

      const notice = page.getByTestId('service-notice-banner');
      await expect(notice).toHaveCount(1);
      await expect(notice).toHaveAttribute('role', 'note');
      await expect(notice).toHaveText(noticeText);
      await expect(notice.getByRole('link', { name: 'More' })).toHaveAttribute(
        'href',
        'https://dfx.swiss/security-incident.html',
      );

      // Visible before any form input: the notice sits above the first amount field.
      const amount = page.locator('input[inputmode="decimal"]').first();
      await expect(amount).toBeVisible({ timeout: 15000 });
      const noticeBox = await notice.boundingBox();
      const amountBox = await amount.boundingBox();
      expect(noticeBox).not.toBeNull();
      expect(amountBox).not.toBeNull();
      expect((noticeBox as { y: number }).y).toBeLessThan((amountBox as { y: number }).y);

      // The form stays usable: the notice does not disable the amount field.
      await expect(amount).toBeEnabled();
    }

    // /buy: no notice once the buy form has rendered.
    await openScreen(page, '/buy', user.jwt);
    await expect(page.locator('input[inputmode="decimal"]').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('service-notice-banner')).toHaveCount(0);

    // Another page: no notice once the account page has rendered.
    await openScreen(page, '/account', user.jwt);
    await expect(page.getByText('Account', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('service-notice-banner')).toHaveCount(0);
  });

  test('/swap source assets are sellable and target assets are buyable vs GET /v1/asset', async ({ page }) => {
    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'swap-assets',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });
    const assets = await fetchAssets();
    const sellable = new Set(assets.filter((a) => a.sellable && !a.comingSoon).map((a) => a.name));
    const buyable = new Set(assets.filter((a) => a.buyable && !a.comingSoon).map((a) => a.name));

    await openScreen(page, '/swap', user.jwt);
    await expect(page.getByText('You spend', { exact: true })).toBeVisible({ timeout: 15000 });

    // Both source and target asset fields are StyledSearchDropdown: the current selection lives
    // in a text <input>, and only the OPEN list's items are <button>s (see StyledSearchDropdown).
    const sourceInput = page.locator('input[name="sourceAsset"]');
    await expect(sourceInput).toBeVisible({ timeout: 15000 });
    const sourceSelected = (await sourceInput.inputValue()).trim();
    if (sourceSelected) {
      expect(sellable.has(sourceSelected), `swap source asset "${sourceSelected}" must be sellable`).toBe(true);
    }

    await sourceInput.click();
    await page.waitForTimeout(400);
    const sourceOptionTexts = await page.locator('button').allTextContents();
    const sourceOffered = sourceOptionTexts
      .map((t) => t.trim())
      .flatMap((t) => {
        const hit = assets.find((a) => t === a.name || t.startsWith(a.name) || t.includes(a.name));
        return hit ? [hit.name] : [];
      })
      .filter((v, i, arr) => arr.indexOf(v) === i);
    expect(sourceOffered.length, 'swap source dropdown should list at least one known asset').toBeGreaterThan(0);
    for (const name of sourceOffered) {
      expect(sellable.has(name), `swap source asset "${name}" offered must be sellable`).toBe(true);
    }
    // StyledSearchDropdown only closes on a 'mousedown' OUTSIDE the input/list (see component
    // source) — it has no Escape-key handling, so Escape leaves the open list overlapping the
    // rest of the form and intercepting later clicks. Click a neutral heading instead.
    await page.getByText('You spend', { exact: true }).click();
    await page.waitForTimeout(200);

    const targetInput = page.locator('input[name="targetAsset"]');
    await expect(targetInput).toBeVisible({ timeout: 15000 });
    const targetSelected = (await targetInput.inputValue()).trim();
    if (targetSelected) {
      expect(buyable.has(targetSelected), `swap target asset "${targetSelected}" must be buyable`).toBe(true);
    }

    await targetInput.click();
    await page.waitForTimeout(400);
    const targetOptionTexts = await page.locator('button').allTextContents();
    const targetOffered = targetOptionTexts
      .map((t) => t.trim())
      .flatMap((t) => {
        const hit = assets.find((a) => t === a.name || t.startsWith(a.name) || t.includes(a.name));
        return hit ? [hit.name] : [];
      })
      .filter((v, i, arr) => arr.indexOf(v) === i);
    expect(targetOffered.length, 'swap target dropdown should list at least one known asset').toBeGreaterThan(0);
    for (const name of targetOffered) {
      expect(buyable.has(name), `swap target asset "${name}" offered must be buyable`).toBe(true);
    }
    await page.keyboard.press('Escape');
  });

  test('/swap deposit_route via createSwap (API path, independent of UI pricing)', async ({ page }) => {
    void page;
    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'swap-factory',
      kycLevel: 30,
      completePersonalData: true,
    });
    const swap = await orSwapUnavailable(safeCreateSwap(user.jwt, { blockchain: 'Ethereum' }));
    if (swap instanceof SwapUnavailableError) {
      expectSwapUnavailable(swap);
      await expectNoSwapRoute(user.userId);
      return;
    }
    expect(swap.swapId).toBeGreaterThan(0);

    const row = await waitForRow<{ id: number; type: string }>(`SELECT id, type FROM deposit_route WHERE id = $1`, [
      swap.swapId,
    ]);
    expect(row.type).toBe('Crypto');
  });

  test('/swap full UI flow: form params produce a Crypto deposit_route', async ({ page }) => {
    // Write-path proof only: form/URL params must create a Crypto deposit_route. No panel wait.
    test.setTimeout(60000);
    const { user, paymentInfos } = await setupSwapFullUiFlow(page, 'swap-ui-write');
    if (await swapQuoteUnavailable(page, paymentInfos)) {
      await expectNoSwapRoute(user.userId);
      return;
    }

    const route = await waitForRow<{ id: number; type: string }>(
      `SELECT id, type FROM deposit_route
       WHERE "userId" = $1 AND type = 'Crypto'
       ORDER BY id DESC LIMIT 1`,
      [user.userId],
      30000,
    );
    expect(route.type).toBe('Crypto');
  });

  test('/swap full UI flow: payment panel renders after paymentInfos', async ({ page }) => {
    test.setTimeout(90000);
    const { paymentInfos } = await setupSwapFullUiFlow(page, 'swap-ui-panel');
    if (await swapQuoteUnavailable(page, paymentInfos)) return;

    const outcome = await waitForPricingOutcome(page, { timeoutMs: 25000 });
    const apiDetail = paymentInfos.last
      ? `PUT paymentInfos HTTP ${paymentInfos.last.status}: ${paymentInfos.last.body}`
      : 'no PUT paymentInfos response captured';
    expect(
      outcome.kind,
      `expected payment_info panel (${outcome.detail}); ${apiDetail}`,
    ).toBe('payment_info');

    const completeBtn = page.getByRole('button', {
      name: /Click here once you have issued the transaction/i,
    });
    const paymentHeading = page.getByRole('heading', { name: 'Payment Information', exact: true });
    await expect(paymentHeading.or(completeBtn).first()).toBeVisible();

    // When the complete CTA is the visible panel path, click through and assert success hard.
    if (await completeBtn.isVisible()) {
      await completeBtn.click();
      await expect(
        page.getByText('Nice! You are all set! Give us a minute to handle your transaction.'),
      ).toBeVisible({ timeout: 15000 });
    }
  });

  test('/swap: confirming with a redirect URI redirects with the swap route and can be repeated', async ({ page }) => {
    test.setTimeout(90000);
    const { user, paymentInfos } = await setupSwapFullUiFlow(page, 'swap-hand-off', WALLET_REDIRECT_QUERY);
    if (await swapQuoteUnavailable(page, paymentInfos)) return;
    const redirects = await recordWalletRedirects(page);

    await expectRepeatableHandOff(page, redirects, {
      path: '/return/swap',
      assetInput: 'sourceAsset',
      userId: user.userId,
      routeType: 'Crypto',
    });
  });

  test('/swap: after a hand-off, a reload hands off again instead of the manual transfer', async ({ page }) => {
    test.setTimeout(120000);
    const { user, paymentInfos } = await setupSwapFullUiFlow(page, 'swap-hand-off-reload', WALLET_REDIRECT_QUERY);
    if (await swapQuoteUnavailable(page, paymentInfos)) return;
    const redirects = await recordWalletRedirects(page);

    await expectHandOffAfterReload(page, redirects, {
      screen: '/swap',
      path: '/return/swap',
      userId: user.userId,
      routeType: 'Crypto',
    });
  });

  test('/swap: closing a swap issued outside the app redirects once as complete with the route and the order', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'swap-cli-complete-redirect',
      // Level 50: the default wallet's RULE_3 refuses sell and swap quotes below it (sell-wallet-aml.spec.ts).
      kycLevel: 50,
      completePersonalData: true,
      language: 'EN',
    });

    await page.goto('/login?blockchain=Ethereum');
    await page.locator('img[src*="cryptowallet"]').click({ timeout: 15000 });
    await page.locator('img[src*="command"]').click();

    const address = page.locator('input[name="address"]');
    await address.fill(user.wallet.address);
    await address.blur();

    const messageNode = page.locator('p.text-dfxBlue-800.min-w-0.break-words');
    await expect(messageNode).toBeVisible({ timeout: 20000 });
    const message = await messageNode.textContent();
    if (message == null || message.length === 0) {
      throw new Error('command-line sign message was empty');
    }
    const signature = await new ethers.Wallet(user.wallet.privateKey).signMessage(message);

    const signatureInput = page.locator('input[type="password"]');
    await signatureInput.fill(signature);
    await signatureInput.blur();

    const login = page.getByRole('button', { name: 'Login' });
    await expect(login).toBeEnabled();
    await login.click();
    await expect.poll(() => normPath(new URL(page.url()).pathname), { timeout: 20000 }).toBe('/buy');
    // the login finishes loading the session on /buy; opening /swap before that can leave the form loading
    await page.waitForLoadState('networkidle');

    // Only the swap answer: the /buy screen the login lands on can still answer its own paymentInfos request here.
    const paymentInfos = trackPaymentInfosResponses(page, 'swap/paymentInfos');
    await page.goto(`/swap?asset-in=ETH&amount-in=0.1${WALLET_REDIRECT_QUERY}`);
    await expect(page.getByText('You spend', { exact: true })).toBeVisible({ timeout: 30000 });
    if (await swapQuoteUnavailable(page, paymentInfos)) return;
    const redirects = await recordWalletRedirects(page);

    const outcome = await waitForPricingOutcome(page, { timeoutMs: 25000 });
    const apiDetail = paymentInfos.last
      ? `PUT paymentInfos HTTP ${paymentInfos.last.status}: ${paymentInfos.last.body}`
      : 'no PUT paymentInfos response captured';
    expect(outcome.kind, `${outcome.detail}; ${apiDetail}`).toBe('payment_info');

    // The app cannot send with the command-line wallet, so confirming neither hands off nor sends.
    const issued = page.getByRole('button', { name: 'Click here once you have issued the transaction' });
    await expect(issued).toBeEnabled({ timeout: 15000 });
    await issued.click();
    await expect(page.getByText('Nice! You are all set! Give us a minute to handle your transaction.')).toBeVisible({
      timeout: 15000,
    });
    expect(redirects).toHaveLength(0);

    // Close on the completion screen calls closeServices as complete and opens /account; it redirects 2 s later.
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect.poll(() => redirects.length, { timeout: 15000 }).toBe(1);
    expect(normPath(new URL(page.url()).pathname)).toBe('/account');

    const [redirect] = redirects;
    expect(redirect.pathname).toBe('/return/swap');
    expect(redirect.searchParams.get('isComplete')).toBe('true');
    const route = await waitForRow<{ id: number }>(
      `SELECT id FROM deposit_route WHERE "userId" = $1 AND type = $2 ORDER BY id DESC LIMIT 1`,
      [user.userId, 'Crypto'],
    );
    expect(redirect.searchParams.get('routeId')).toBe(String(route.id));
    // orderUid names the confirmed payment info: the user's newest transaction request on this route
    const request = await waitForRow<{ uid: string }>(
      `SELECT uid FROM transaction_request WHERE "userId" = $1 AND "routeId" = $2 ORDER BY id DESC LIMIT 1`,
      [user.userId, route.id],
    );
    expect(request.uid).toBeTruthy();
    expect(redirect.searchParams.get('orderUid')).toBe(request.uid);

    // closeServices gives up the redirect URI, unlike a hand-off, so nothing redirects a second time.
    expect(await page.evaluate((key) => window.sessionStorage.getItem(key), REDIRECT_URI_KEY)).toBeNull();
    await page.waitForTimeout(3000);
    expect(redirects).toHaveLength(1);
  });

  test('/swap: native form submit completes the transaction', async ({ page }) => {
    test.setTimeout(90000);
    const { paymentInfos } = await setupSwapFullUiFlow(page, 'swap-form-submit');
    if (await swapQuoteUnavailable(page, paymentInfos)) return;
    const outcome = await waitForPricingOutcome(page, { timeoutMs: 25000 });
    expect(outcome.kind).toBe('payment_info');
    const completeBtn = page.getByRole('button', {
      name: /Click here once you have issued the transaction/i,
    });
    await expect(completeBtn).toBeEnabled();
    const form = page.locator('form').first();
    await expect(form).toBeVisible();
    await form.evaluate((el) => (el as HTMLFormElement).requestSubmit());
    await expect(
      page.getByText('Nice! You are all set! Give us a minute to handle your transaction.'),
    ).toBeVisible({ timeout: 15000 });
  });

  test('/swap: native form submit does not complete after spend is cleared', async ({ page }) => {
    test.setTimeout(90000);
    const { paymentInfos } = await setupSwapFullUiFlow(page, 'swap-form-submit-cleared');
    if (await swapQuoteUnavailable(page, paymentInfos)) return;
    const outcome = await waitForPricingOutcome(page, { timeoutMs: 25000 });
    expect(outcome.kind).toBe('payment_info');
    const spend = page.locator('h2', { hasText: 'You spend' }).locator('..').locator('input[type="number"]').first();
    await spend.click();
    await spend.fill('');
    await spend.blur();
    await expect.poll(async () => spend.inputValue(), { timeout: 8000 }).toBe('');
    const form = page.locator('form').first();
    await form.evaluate((el) => (el as HTMLFormElement).requestSubmit());
    await expect(page.getByText(/Nice! You are all set!/i)).toHaveCount(0);
    await expect(spend).toHaveValue('');
  });

  test('/swap: clearing the spend amount keeps the field empty (no cross-side refill)', async ({ page }) => {
    test.setTimeout(90000);
    const { paymentInfos } = await setupSwapFullUiFlow(page, 'swap-clear-spend');
    if (await swapQuoteUnavailable(page, paymentInfos)) return;
    const outcome = await waitForPricingOutcome(page, { timeoutMs: 25000 });
    expect(outcome.kind).toBe('payment_info');

    const spend = page.locator('h2', { hasText: 'You spend' }).locator('..').locator('input[type="number"]').first();
    await expect(spend).toHaveValue('0.1');
    await spend.click();
    await spend.fill('');
    await spend.blur();

    await expect
      .poll(
        async () => {
          const value = await spend.inputValue();
          const paymentVisible = await page
            .getByRole('heading', { name: 'Payment Information' })
            .isVisible()
            .catch(() => false);
          return { value, paymentVisible };
        },
        { timeout: 8000, message: 'cleared swap spend amount must stay empty' },
      )
      .toEqual({ value: '', paymentVisible: false });
  });

  // Sanity: incomplete personal data is redirected off /sell by the API/UI (Ident data incomplete).
  test('/sell with incomplete personal data redirects to /profile', async ({ page }) => {
    // Same rationale as the other full-URL-param /sell tests: skip 'networkidle' (fully-populated
    // spend/get fields can keep pricing effects cycling network requests) and rely on content polling.
    test.setTimeout(75000);
    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'sell-incomplete',
      kycLevel: 0,
      completePersonalData: false,
      language: 'EN',
    });
    await createBankAccount(user.jwt, { iban: TEST_IBAN }).catch(() => {
      /* bank account may still succeed without complete personal data */
    });

    await gotoWithSession(
      page,
      `/sell?asset-in=ETH&asset-out=CHF&amount-in=0.1`,
      user.jwt,
    );

    // The redirect follows the API's "Ident data incomplete" answer to the quote.

    // The screen either sends the user to /profile or keeps them on /sell behind an "Enter user
    // data" call to action. Staying on /sell with neither — and therefore with a payment panel
    // the account is not entitled to — is a failure, not an acceptable third outcome.
    await expect
      .poll(
        async () => {
          if (normPath(new URL(page.url()).pathname) === '/profile') return 'profile';
          if (await page.getByRole('button', { name: 'Enter user data' }).isVisible().catch(() => false)) {
            return 'cta';
          }
          return 'pending';
        },
        {
          timeout: 25000,
          message: 'incomplete personal data must send /sell to /profile or show the "Enter user data" call to action',
        },
      )
      .not.toBe('pending');

    if (normPath(new URL(page.url()).pathname) !== '/profile') {
      await expect(page.getByRole('button', { name: 'Enter user data' })).toBeVisible();
      // Whichever way it goes, the account must not be handed a panel to pay into.
      await expect(
        page.getByRole('button', { name: /Click here once you have issued the transaction/i }),
      ).toHaveCount(0);
    }
  });

  test('/sell?bank-account=<iban> selects the account once instead of recreating it', async ({ page }) => {
    test.setTimeout(75000);

    const user = await createUser({
      walletIndex: nextWalletIndex(),
      tag: 'sell-ba-param',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });
    await createBankAccount(user.jwt, { iban: TEST_IBAN, label: 'Sell BA param' });

    let bankAccountPosts = 0;
    page.on('response', (res) => {
      if (res.request().method() === 'POST' && res.url().includes('/v1/bankAccount')) bankAccountPosts += 1;
    });
    const paymentInfos = trackPaymentInfosResponses(page, 'paymentInfos');

    await gotoWithSession(
      page,
      `/sell?asset-in=ETH&asset-out=CHF&amount-in=0.1&bank-account=${encodeURIComponent(TEST_IBAN)}`,
      user.jwt,
    );
    await expect(page.getByText('You spend', { exact: true })).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(20000);

    expect(bankAccountPosts, 'an existing bank account must not be created again').toBe(0);
    expect(paymentInfos.last, 'the screen must get as far as requesting payment information').toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Partner sell wallet lists — the tiles offered after Alby's removal
// ---------------------------------------------------------------------------

test.describe('Partner sell wallet lists', () => {
  test('bitcoinonly sell offers only the partner wallet tiles and opens the hardware wallets', async ({ page }) => {
    test.setTimeout(90000);

    await page.goto('/?mode=bitcoinonly&lang=en');
    await page.waitForLoadState('networkidle');
    await page.locator('img[src$="/verkaufen_en.jpg"]').click();

    // bitcoinonly-sell has a single Bitcoin tile, so the app descends straight into the wallet list.
    await expect(page.locator('img[src$="/hardwarewallets_en.jpg"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('img[src*="alby"]')).toHaveCount(0);

    // The DFX app tile supports only Lightning, so the preset Bitcoin blockchain hides it here.
    const tileImages = await page
      .locator('img[src$="_en.jpg"]')
      .evaluateAll((images) => images.map((image) => (image.getAttribute('src') ?? '').split('/').pop() ?? ''));
    expect(tileImages.sort()).toEqual(['hardwarewallets_en.jpg']);

    await page.locator('img[src$="/hardwarewallets_en.jpg"]').click();

    // The hardware-wallet selection, still without Alby.
    await expect(page.locator('img[src$="/bitbox_en.jpg"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('img[src$="/ledger_en.jpg"]')).toBeVisible();
    await expect(page.locator('img[src$="/trezor_en.jpg"]')).toBeVisible();
    await expect(page.locator('img[src*="alby"]')).toHaveCount(0);
  });

  test('kevinsoell sell offers only the hardware-wallet tile and opens the hardware wallets', async ({ page }) => {
    test.setTimeout(90000);

    await page.goto('/?mode=kevinsoell&lang=en');
    await page.waitForLoadState('networkidle');
    await page.locator('img[src$="/verkaufen_en.jpg"]').click();

    // kevinsoell-sell also offers an ERC20 tile, so Bitcoin has to be selected explicitly.
    await expect(page.locator('img[src$="/bitcoinlightning_en.jpg"]')).toBeVisible({ timeout: 15000 });
    await page.locator('img[src$="/bitcoinlightning_en.jpg"]').click();

    // This partner allows only the hardware-wallet tile, whose page is the only tile on the list,
    // so the app descends one step further into the hardware-wallet selection right away.
    await expect(page.locator('img[src$="/bitbox_en.jpg"]')).toBeVisible({ timeout: 15000 });
    // The hardware-wallet list is exactly these three tiles.
    const hardwareTiles = await page
      .locator('img[src$="_en.jpg"]')
      .evaluateAll((images) => images.map((image) => (image.getAttribute('src') ?? '').split('/').pop() ?? ''));
    expect(hardwareTiles.sort()).toEqual(['bitbox_en.jpg', 'ledger_en.jpg', 'trezor_en.jpg']);
    await expect(page.locator('img[src*="alby"]')).toHaveCount(0);
  });
});
