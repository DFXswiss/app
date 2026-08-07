/**
 * Cross-cutting E2E properties for the full-stack Playwright harness:
 * language switching, URL params / deep links, API error handling, session end, small screens.
 *
 * Does not claim individual screen routes (see registry/cross-cutting.ts — empty claims).
 */

import type { Page, Route } from '@playwright/test';
import { ethers } from 'ethers';
import {
  decodeJwtPayload,
  expect,
  gotoWithSession,
  openScreen,
  queryOne,
  test,
  testWallet,
} from './fixtures';
import { cleanupCreatedData, createUser } from './fixtures/factories';

test.describe.configure({ mode: 'serial' });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function apiBase(): string {
  return process.env.E2E_API_URL ?? 'http://api:3000';
}

function normPath(p: string): string {
  return p !== '/' && p.endsWith('/') ? p.slice(0, -1) : p;
}

/** Wait until a one-shot query param has been stripped by removeUrlParams (app-handling.context). */
async function expectParamStripped(page: Page, param: string, timeoutMs = 15000): Promise<void> {
  await expect
    .poll(() => new URL(page.url()).searchParams.has(param), {
      message: `expected URL param "${param}" to be stripped from ${page.url()}`,
      timeout: timeoutMs,
    })
    .toBe(false);
}

async function authToken(page: Page): Promise<string | null> {
  return page.evaluate(() => window.localStorage.getItem('dfx.authenticationToken'));
}

/** Open the top-right nav menu (hamburger / close icon in Navigation). */
async function openNavMenu(page: Page): Promise<void> {
  await page.locator('div.absolute.right-4').click();
  await expect(page.getByRole('button', { name: /^(Logout|Login)$/ })).toBeVisible({ timeout: 10000 });
}

/**
 * Open a settings-style StyledDropdown by field label text and pick an option whose visible
 * label matches `optionName` (language names come from the language table, e.g. "English").
 */
async function selectSettingsDropdown(
  page: Page,
  fieldLabel: RegExp | string,
  optionName: string | RegExp,
): Promise<void> {
  const label =
    typeof fieldLabel === 'string'
      ? page.getByText(fieldLabel, { exact: true }).first()
      : page.getByText(fieldLabel).first();
  const openBtn = label.locator('xpath=../following-sibling::button[1]');
  await openBtn.click();
  const option =
    typeof optionName === 'string'
      ? page.getByRole('button', { name: new RegExp(`^${escapeRegExp(optionName)}`) }).first()
      : page.getByRole('button', { name: optionName }).first();
  await option.click();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build a JWT-shaped token (unsigned / dummy signature). Frontend only decodes; API verifies. */
function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' }), 'utf8').toString('base64url');
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${header}.${body}.e2e`;
}

function attachPageErrorCollectors(page: Page): { pageErrors: string[]; consoleErrors: string[] } {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  return { pageErrors, consoleErrors };
}

/** Horizontal overflow check with a small layout tolerance (scrollbar / sub-pixel). */
async function assertNoHorizontalOverflow(page: Page, tolerancePx = 8): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    scrollWidth,
    `horizontal overflow: scrollWidth=${scrollWidth} clientWidth=${clientWidth}`,
  ).toBeLessThanOrEqual(clientWidth + tolerancePx);
}

function isStackApi(url: string): boolean {
  try {
    const u = new URL(url);
    return u.pathname.includes('/v1/') || u.pathname.includes('/v2/');
  } catch {
    return false;
  }
}

function isTransactionFetch(url: string, method: string): boolean {
  return method === 'GET' && isStackApi(url) && /transaction/i.test(url);
}

/**
 * Register a most-recently-wins page.route that injects status for matching API URLs.
 * Uses route.fallback() so the fixture isolateFromExternalHosts handler still runs for
 * other requests. Playwright evaluates handlers last-registered-first.
 */
async function injectApiErrors(
  page: Page,
  opts: {
    status?: number;
    abort?: boolean;
    match: (url: string, method: string) => boolean;
    body?: string;
  },
): Promise<{ hits: { url: string; status: number }[] }> {
  const hits: { url: string; status: number }[] = [];
  await page.route('**/*', async (route: Route) => {
    const req = route.request();
    const url = req.url();
    if (!opts.match(url, req.method())) {
      return route.fallback();
    }
    if (opts.abort) {
      hits.push({ url, status: 0 });
      return route.abort('connectionfailed');
    }
    const status = opts.status ?? 500;
    hits.push({ url, status });
    return route.fulfill({
      status,
      contentType: 'application/json',
      body: opts.body ?? JSON.stringify({ statusCode: status, message: `E2E injected ${status}` }),
    });
  });
  return { hits };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe('Cross-cutting', () => {
  test.afterAll(async () => {
    await cleanupCreatedData();
  });

  // =========================================================================
  // 1. Language switching
  // =========================================================================

  test.describe('Language switching', () => {
    test('settings switcher exposes only DE/EN/FR/IT; switch persists in DB and across reload', async ({
      page,
    }) => {
      const user = await createUser({ tag: 'cc-lang', language: 'EN', kycLevel: 30, completePersonalData: true });

      // Seeded languages (7) vs appLanguages filter (4) in settings.context.tsx.
      const seeded = await queryOne<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM language`);
      expect(Number(seeded?.cnt), 'seed should include 7 languages').toBe(7);

      const langRows = await queryOne<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt FROM language WHERE symbol IN ('DE','EN','FR','IT')`,
      );
      expect(Number(langRows?.cnt), 'DE/EN/FR/IT must exist in language table').toBe(4);

      const enName =
        (await queryOne<{ name: string }>(`SELECT name FROM language WHERE symbol = 'EN' LIMIT 1`))?.name ??
        'English';
      const deName =
        (await queryOne<{ name: string }>(`SELECT name FROM language WHERE symbol = 'DE' LIMIT 1`))?.name ??
        'German';
      const frName =
        (await queryOne<{ name: string }>(`SELECT name FROM language WHERE symbol = 'FR' LIMIT 1`))?.name ??
        'French';
      const itName =
        (await queryOne<{ name: string }>(`SELECT name FROM language WHERE symbol = 'IT' LIMIT 1`))?.name ??
        'Italian';

      await openScreen(page, '/settings', user.jwt);
      await expect(page.getByText('Settings', { exact: true }).first()).toBeVisible({ timeout: 20000 });
      await expect(page.getByText('Language', { exact: true }).first()).toBeVisible();

      // Open language dropdown — only the four app languages (DE/EN/FR/IT).
      const langLabel = page.getByText('Language', { exact: true }).first();
      await langLabel.locator('xpath=../following-sibling::button[1]').click();
      await page.waitForTimeout(400);

      for (const expected of [enName, deName, frName, itName]) {
        await expect(
          page.getByRole('button', { name: new RegExp(`^${escapeRegExp(expected)}`) }).first(),
          `switcher should offer language name "${expected}"`,
        ).toBeVisible({ timeout: 5000 });
      }

      // PT / ES / SQ are seeded but filtered out of availableLanguages (appLanguages = DE,EN,FR,IT).
      // stickerLanguages adds SQ only for stickers, not the main switcher.
      for (const symbol of ['PT', 'ES', 'SQ'] as const) {
        const row = await queryOne<{ name: string }>(`SELECT name FROM language WHERE symbol = $1 LIMIT 1`, [
          symbol,
        ]);
        if (row?.name) {
          const count = await page
            .getByRole('button', { name: new RegExp(`^${escapeRegExp(row.name)}$`) })
            .count();
          expect(
            count,
            `FINDING if >0: ${symbol} (${row.name}) should NOT be in the main language switcher`,
          ).toBe(0);
        }
      }

      // Dropdown is already open with all four options visible — select German directly,
      // no need to close and reopen (this custom dropdown does not close on Escape).
      // Finding note: if a string stays English, it is an untranslated key — fail loudly, do not hide.
      await page.getByRole('button', { name: new RegExp(`^${escapeRegExp(deName)}`) }).first().click();
      await expect(page.getByText('Einstellungen', { exact: true }).first()).toBeVisible({ timeout: 15000 });
      await expect(page.getByText('Sprache', { exact: true }).first()).toBeVisible({ timeout: 15000 });

      // Postgres persistence via user_data.languageId → language.symbol
      const dbLang = await queryOne<{ symbol: string }>(
        `SELECT l.symbol
         FROM user_data ud
         JOIN language l ON l.id = ud."languageId"
         WHERE ud.id = $1`,
        [user.userDataId],
      );
      expect(dbLang?.symbol, 'user_data language should persist as DE after switch').toBe('DE');

      // Survives reload — UI still German, not only DB.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle');
      await expect(page.getByText('Einstellungen', { exact: true }).first()).toBeVisible({ timeout: 20000 });
      await expect(page.getByText('Sprache', { exact: true }).first()).toBeVisible({ timeout: 15000 });

      // Switch back to English (second selectable language) and confirm UI + DB again.
      await selectSettingsDropdown(page, /^(Language|Sprache|Langue|Lingua)$/, enName);
      await expect(page.getByText('Settings', { exact: true }).first()).toBeVisible({ timeout: 15000 });
      await expect(page.getByText('Language', { exact: true }).first()).toBeVisible({ timeout: 15000 });

      const dbLangEn = await queryOne<{ symbol: string }>(
        `SELECT l.symbol
         FROM user_data ud
         JOIN language l ON l.id = ud."languageId"
         WHERE ud.id = $1`,
        [user.userDataId],
      );
      expect(dbLangEn?.symbol).toBe('EN');
    });
  });

  // =========================================================================
  // 2. URL parameters / deep links
  // =========================================================================

  test.describe('URL parameters / deep links', () => {
    test('session param logs in, is stripped, and garbage session does not authenticate', async ({ page }) => {
      const user = await createUser({ tag: 'cc-session', language: 'EN' });

      await page.goto(`/?session=${encodeURIComponent(user.jwt)}`);
      await page.waitForLoadState('domcontentloaded');
      await expect
        .poll(async () => Boolean(await authToken(page)), {
          message: 'valid session param should set dfx.authenticationToken',
          timeout: 15000,
        })
        .toBe(true);
      await expectParamStripped(page, 'session');

      // Negative: non-JWT garbage must not leave a truthy auth token.
      await page.evaluate(() => window.localStorage.removeItem('dfx.authenticationToken'));
      await page.goto('/?session=not-a-jwt-at-all');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);
      const garbageToken = await authToken(page);
      expect(garbageToken, 'garbage session must not set authentication token').toBeFalsy();
      await expectParamStripped(page, 'session');

      // JWT-shaped but missing customer identity (account) — wallet.context rejects and logs out.
      const bogusJwt = makeJwt({ role: 'User', exp: Math.floor(Date.now() / 1000) + 3600 });
      await page.goto(`/?session=${encodeURIComponent(bogusJwt)}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);
      expect(await authToken(page), 'JWT without account claim must not authenticate').toBeFalsy();
    });

    test('address+signature params log in and are stripped', async ({ page }) => {
      // Fresh wallet so we exercise the URL credential path, not a pre-minted session JWT.
      const wallet = testWallet(40);
      const signRes = await fetch(
        `${apiBase()}/v1/auth/signMessage?address=${encodeURIComponent(wallet.address)}`,
      );
      expect(signRes.ok, `signMessage status ${signRes.status}`).toBe(true);
      const { message } = (await signRes.json()) as { message: string };
      const signature = await new ethers.Wallet(wallet.privateKey).signMessage(message);

      await page.goto(
        `/?address=${encodeURIComponent(wallet.address)}&signature=${encodeURIComponent(signature)}`,
      );
      await page.waitForLoadState('domcontentloaded');
      await expect
        .poll(async () => Boolean(await authToken(page)), {
          message: 'address+signature should establish a session',
          timeout: 20000,
        })
        .toBe(true);
      await expectParamStripped(page, 'address');
      await expectParamStripped(page, 'signature');
    });

    test('redirect param navigates after session and is stripped', async ({ page }) => {
      const user = await createUser({ tag: 'cc-redir', language: 'EN' });

      await page.goto(`/?session=${encodeURIComponent(user.jwt)}&redirect=${encodeURIComponent('/settings')}`);
      await page.waitForLoadState('domcontentloaded');
      await expect
        .poll(() => normPath(new URL(page.url()).pathname), {
          message: 'redirect=/settings with valid session should land on /settings',
          timeout: 20000,
        })
        .toBe('/settings');
      await expectParamStripped(page, 'session');
      await expectParamStripped(page, 'redirect');
      await expect(page.getByText('Settings', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    });

    test('lang param changes UI language and is stripped', async ({ page }) => {
      const user = await createUser({ tag: 'cc-lang-param', language: 'EN' });

      // lang takes precedence over user language (settings.context customLanguage).
      await page.goto(`/settings?session=${encodeURIComponent(user.jwt)}&lang=DE`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByText('Einstellungen', { exact: true }).first()).toBeVisible({ timeout: 20000 });
      await expect(page.getByText('Sprache', { exact: true }).first()).toBeVisible({ timeout: 15000 });
      await expectParamStripped(page, 'lang');
      await expectParamStripped(page, 'session');
    });

    test('blockchain and asset-out params have effect on /buy and are stripped', async ({ page }) => {
      // Note: urlParamsToRemove lists blockchain, assets, asset-in, asset-out — there is no bare
      // `asset` param. We exercise blockchain + asset-out (the practical "asset" deep-link).
      const user = await createUser({
        tag: 'cc-buy-params',
        language: 'EN',
        kycLevel: 30,
        completePersonalData: true,
      });

      await openScreen(page, '/buy', user.jwt);
      // Prefill after session is established (openScreen pathname check rejects query strings).
      await page.goto('/buy?blockchain=Ethereum&asset-out=ETH&assets=ETH');
      await page.waitForLoadState('networkidle');

      await expectParamStripped(page, 'blockchain');
      await expectParamStripped(page, 'asset-out');
      await expectParamStripped(page, 'assets');

      // Observable effect: get-side asset control shows ETH (or Ethereum-chain asset preselection).
      await expect(page.getByRole('heading', { name: /You get/ })).toBeVisible({ timeout: 20000 });
      const getSide = page.locator('h2', { hasText: /You get/ }).locator('..');
      const assetTrigger = getSide.locator('button#dropDownButton').first();
      await expect(assetTrigger).toBeVisible({ timeout: 15000 });
      await expect
        .poll(async () => (await assetTrigger.innerText()).toUpperCase(), {
          message: 'asset-out=ETH should preselect an ETH-like asset on the buy form',
          timeout: 20000,
        })
        .toMatch(/ETH/);
    });
  });

  // =========================================================================
  // 3. API error handling
  // =========================================================================

  test.describe('API error handling', () => {
    test('500 on transaction list shows a comprehensible error, not a blank page', async ({ page }) => {
      const { pageErrors } = attachPageErrorCollectors(page);
      const user = await createUser({
        tag: 'cc-err-500',
        language: 'EN',
        kycLevel: 30,
        completePersonalData: true,
      });

      const { hits } = await injectApiErrors(page, {
        status: 500,
        match: isTransactionFetch,
        body: JSON.stringify({ statusCode: 500, message: 'E2E injected 500' }),
      });

      const responsePromise = page.waitForResponse(
        (r) => isTransactionFetch(r.url(), r.request().method()) && r.status() === 500,
        { timeout: 30000 },
      );

      await gotoWithSession(page, '/tx', user.jwt);
      await page.waitForLoadState('networkidle');
      const injected = await responsePromise;
      expect(injected.status()).toBe(500);
      expect(hits.length, 'route handler must intercept at least one transaction GET').toBeGreaterThan(0);

      await expect(page.locator('body')).not.toBeEmpty();
      // ErrorHint: generic line + raw message — verify injected body surfaces in UI.
      await expect(page.locator('.text-dfxRed-100').first()).toBeVisible({ timeout: 15000 });
      expect(pageErrors, `uncaught pageerror on 500: ${pageErrors.join('; ')}`).toEqual([]);
    });

    test('400 on transaction list shows error state without uncaught exceptions', async ({ page }) => {
      const { pageErrors } = attachPageErrorCollectors(page);
      const user = await createUser({
        tag: 'cc-err-400',
        language: 'EN',
        kycLevel: 30,
        completePersonalData: true,
      });

      const { hits } = await injectApiErrors(page, {
        status: 400,
        match: isTransactionFetch,
        body: JSON.stringify({ statusCode: 400, message: 'E2E injected 400' }),
      });

      const responsePromise = page.waitForResponse(
        (r) => isTransactionFetch(r.url(), r.request().method()) && r.status() === 400,
        { timeout: 30000 },
      );
      await gotoWithSession(page, '/tx', user.jwt);
      await page.waitForLoadState('networkidle');
      await responsePromise;
      expect(hits.length).toBeGreaterThan(0);

      await expect(page.locator('body')).not.toBeEmpty();
      await expect(page.locator('.text-dfxRed-100').first()).toBeVisible({ timeout: 15000 });
      expect(pageErrors, `uncaught pageerror on 400: ${pageErrors.join('; ')}`).toEqual([]);
    });

    test('403 on transaction list shows error state without uncaught exceptions', async ({ page }) => {
      const { pageErrors } = attachPageErrorCollectors(page);
      const user = await createUser({
        tag: 'cc-err-403',
        language: 'EN',
        kycLevel: 30,
        completePersonalData: true,
      });

      const { hits } = await injectApiErrors(page, {
        status: 403,
        match: isTransactionFetch,
        body: JSON.stringify({ statusCode: 403, message: 'E2E injected 403' }),
      });

      const responsePromise = page.waitForResponse(
        (r) => isTransactionFetch(r.url(), r.request().method()) && r.status() === 403,
        { timeout: 30000 },
      );
      await gotoWithSession(page, '/tx', user.jwt);
      await page.waitForLoadState('networkidle');
      await responsePromise;
      expect(hits.length).toBeGreaterThan(0);

      await expect(page.locator('body')).not.toBeEmpty();
      await expect(page.locator('.text-dfxRed-100').first()).toBeVisible({ timeout: 15000 });
      expect(pageErrors, `uncaught pageerror on 403: ${pageErrors.join('; ')}`).toEqual([]);
    });

    test('connection abort does not white-screen the app', async ({ page }) => {
      const { pageErrors } = attachPageErrorCollectors(page);
      const user = await createUser({
        tag: 'cc-err-abort',
        language: 'EN',
        kycLevel: 30,
        completePersonalData: true,
      });

      const { hits } = await injectApiErrors(page, {
        abort: true,
        match: isTransactionFetch,
      });

      await gotoWithSession(page, '/tx', user.jwt);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2500);

      expect(hits.length, 'abort handler should intercept transaction GETs').toBeGreaterThan(0);
      await expect(page.locator('body')).not.toBeEmpty();
      const bodyText = (await page.locator('body').innerText()).trim();
      expect(bodyText.length, 'body should retain visible content after aborted API call').toBeGreaterThan(0);
      // Aborted fetches may log console errors; uncaught page exceptions must not crash the shell.
      expect(pageErrors, `uncaught pageerror on abort: ${pageErrors.join('; ')}`).toEqual([]);
    });

    test('401 falls back to logged-out state without a tight retry loop', async ({ page }) => {
      // Bound: more than ~12 identical GETs to the same path within 5s after the first 401
      // would indicate an uncontrolled retry storm. A few retries/refetches from React effects
      // are acceptable; dozens are not.
      const user = await createUser({
        tag: 'cc-err-401',
        language: 'EN',
        kycLevel: 30,
        completePersonalData: true,
      });
      await openScreen(page, '/tx', user.jwt);
      await expect(
        page.getByText('Your Transactions', { exact: true }).or(page.getByText('No transactions found')).first(),
      ).toBeVisible({ timeout: 20000 });

      const requestLog: { url: string; t: number }[] = [];
      await page.route('**/*', async (route: Route) => {
        const req = route.request();
        const url = req.url();
        if (!isStackApi(url)) return route.fallback();
        if (req.method() === 'GET' || req.method() === 'PUT' || req.method() === 'POST') {
          requestLog.push({ url, t: Date.now() });
          return route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ statusCode: 401, message: 'Unauthorized' }),
          });
        }
        return route.fallback();
      });

      // Trigger fresh fetches under 401.
      await page.goto('/tx');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(5000);

      expect(requestLog.length, '401 interceptor must see at least one API call').toBeGreaterThan(0);

      const windowStart = requestLog[0]?.t ?? Date.now();
      const inWindow = requestLog.filter((r) => r.t - windowStart <= 5000);
      const byPath = new Map<string, number>();
      for (const r of inWindow) {
        let path = r.url;
        try {
          path = new URL(r.url).pathname;
        } catch {
          /* keep raw */
        }
        byPath.set(path, (byPath.get(path) ?? 0) + 1);
      }
      for (const [path, count] of byPath) {
        expect(
          count,
          `path ${path} was requested ${count} times in 5s after 401 — expected a clean logout, not a retry loop (bound: 12)`,
        ).toBeLessThanOrEqual(12);
      }

      // Clean logged-out (or clearly not-authenticated) state.
      await page.waitForTimeout(1000);
      const token = await authToken(page);
      const path = normPath(new URL(page.url()).pathname);
      const loginBtn = await page
        .getByRole('button', { name: 'Login' })
        .isVisible()
        .catch(() => false);
      const loginText = await page
        .getByText('Login', { exact: true })
        .first()
        .isVisible()
        .catch(() => false);
      const loggedOutUi = !token || path === '/login' || path === '/' || path.startsWith('/login') || loginBtn || loginText;
      expect(loggedOutUi, `after 401 expected logged-out UI; token=${token} path=${path}`).toBe(true);
    });
  });

  // =========================================================================
  // 4. Session end
  // =========================================================================

  test.describe('Session end', () => {
    test('UI logout clears token and blocks protected screens', async ({ page }) => {
      const user = await createUser({ tag: 'cc-logout', language: 'EN', kycLevel: 30, completePersonalData: true });

      await openScreen(page, '/account', user.jwt);
      await page.waitForLoadState('networkidle');
      expect(await authToken(page), 'precondition: logged in').toBeTruthy();

      await openNavMenu(page);
      await page.getByRole('button', { name: 'Logout' }).click();

      await expect
        .poll(async () => await authToken(page), {
          message: 'Logout should remove dfx.authenticationToken',
          timeout: 15000,
        })
        .toBeFalsy();

      // Previously reachable protected screen is no longer authenticated.
      await page.goto('/tx');
      await page.waitForLoadState('networkidle');
      await expect
        .poll(() => normPath(new URL(page.url()).pathname), {
          message: 'after logout, /tx should redirect to login/home',
          timeout: 15000,
        })
        .not.toBe('/tx');
      const afterPath = normPath(new URL(page.url()).pathname);
      expect(['/login', '/'].includes(afterPath) || afterPath.startsWith('/login')).toBe(true);
    });

    test('expired JWT payload is not treated as an active session', async ({ page }) => {
      // Frontend only decodes JWT for session param (Utils.isJwt + account claim); signature is
      // not verified client-side. We craft an already-expired payload with a dummy account.
      // Goal: observe that this is not an *effective* active session (client rejects, API 401s,
      // token cleared, and/or protected UI redirects) — not that every code path checks `exp`.
      const expired = makeJwt({
        account: 999999001,
        user: 999999001,
        role: 'User',
        address: '0x0000000000000000000000000000000000000e2e',
        exp: Math.floor(Date.now() / 1000) - 3600,
      });

      let sawApi401 = false;
      page.on('response', (res) => {
        if (isStackApi(res.url()) && res.status() === 401) sawApi401 = true;
      });

      // Do not use gotoWithSession — it asserts the token is set.
      await page.goto(`/?session=${encodeURIComponent(expired)}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);

      const tokenInitial = await authToken(page);

      await page.goto('/account');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2500);

      const path = normPath(new URL(page.url()).pathname);
      const tokenAfter = await authToken(page);
      const loginVisible = await page
        .getByRole('button', { name: 'Login' })
        .or(page.getByText('Login', { exact: true }).first())
        .isVisible()
        .catch(() => false);

      if (tokenAfter) {
        try {
          decodeJwtPayload(tokenAfter);
        } catch {
          /* residual non-decodable token is still not a valid active session */
        }
      }

      // Acceptable: never stored, cleared, redirected, login UI, or API rejected the identity.
      const notEffectivelyAuthed =
        !tokenAfter || path !== '/account' || path.startsWith('/login') || loginVisible || sawApi401;
      expect(
        notEffectivelyAuthed,
        `expired JWT must not act as a working session (path=${path}, tokenInitial=${Boolean(tokenInitial)}, tokenAfter=${Boolean(tokenAfter)}, sawApi401=${sawApi401})`,
      ).toBe(true);
    });
  });

  // =========================================================================
  // 5. Small screens
  // =========================================================================

  test.describe('Small screens', () => {
    test('phone viewport: nav usable, no horizontal overflow, primary actions reachable', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      const user = await createUser({
        tag: 'cc-mobile',
        language: 'EN',
        kycLevel: 30,
        completePersonalData: true,
      });

      // Home
      await gotoWithSession(page, '/', user.jwt);
      await page.waitForLoadState('networkidle');
      await assertNoHorizontalOverflow(page);
      await openNavMenu(page);
      await expect(
        page.getByText('Settings', { exact: true }).or(page.getByRole('button', { name: 'Logout' })),
      ).toBeVisible();
      await page
        .locator('div.fixed.inset-0.z-40')
        .click({ force: true })
        .catch(async () => {
          await page.locator('div.absolute.right-4').click();
        });

      // Settings
      await openScreen(page, '/settings', user.jwt);
      await page.waitForLoadState('networkidle');
      await assertNoHorizontalOverflow(page);
      await expect(page.getByText('Language', { exact: true }).first()).toBeVisible();
      const langBtn = page
        .getByText('Language', { exact: true })
        .first()
        .locator('xpath=../following-sibling::button[1]');
      await expect(langBtn).toBeVisible();
      await expect(langBtn).toBeEnabled();

      // Account
      await openScreen(page, '/account', user.jwt);
      await page.waitForLoadState('networkidle');
      await assertNoHorizontalOverflow(page);
      await openNavMenu(page);
      await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
      await page
        .locator('div.fixed.inset-0.z-40')
        .click({ force: true })
        .catch(() => undefined);

      // Buy (transaction-ish primary flow without heavy setup)
      await openScreen(page, '/buy', user.jwt);
      await page.waitForLoadState('networkidle');
      await assertNoHorizontalOverflow(page);
      await expect(
        page.getByRole('heading', { name: 'You spend' }).or(page.getByText('Buy', { exact: true }).first()),
      ).toBeVisible({ timeout: 20000 });
      const amount = page.locator('input[type="number"]').first();
      if ((await amount.count()) > 0) {
        await expect(amount).toBeVisible();
        await amount.click();
      }
    });
  });
});
