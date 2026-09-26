/**
 * Extended App2 account and transaction checklist coverage. Browser actions use the real local
 * frontend/API; assertions read the matching local PostgreSQL rows. Factories only seed the
 * prerequisites and no browser API route is mocked.
 *
 * Remaining UI gap: App2 can list, rename and remove linked wallet addresses, but exposes no
 * add-address action (and the SDK has no add-address endpoint). A new address must be linked by
 * the wallet-login flow; this spec covers the existing list/remove actions only.
 */

import type { Page } from '@playwright/test';
import { ethers } from 'ethers';
import { expect, test, waitForRow, withDb } from './fixtures';
import { decodeJwtPayload, testWallet } from './fixtures/auth';
import {
  cleanupCreatedData,
  createBankAccount,
  createBankTx,
  createBuy,
  createTransaction,
  createUser,
} from './fixtures/factories';

async function openApp2(page: Page, jwt: string, hash: string): Promise<void> {
  const path = `/app2/${hash}`;
  const response = await page.goto(`/app2/?session=${encodeURIComponent(jwt)}${hash}`);
  expect(response?.ok(), `App2 ${path} should load (HTTP ${response?.status() ?? 'no response'})`).toBe(true);
  await page.waitForFunction((token) => localStorage.getItem('dfx.authenticationToken') === token, jwt);
}

function shortAddress(address: string): string {
  return address.length <= 12 ? address : `${address.slice(0, 6)}…${address.slice(-4)}`;
}

test.describe('App2 extended account and transaction checklist', () => {
  test.afterEach(async () => {
    await cleanupCreatedData();
  });

  test('account overview renders seeded identity and verification data after reload', async ({ page }) => {
    const user = await createUser({ tag: 'app2-account-overview', language: 'EN', kycLevel: 50, depositLimit: 321000, completePersonalData: true });
    const userResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/v2/user') && response.request().method() === 'GET',
    );
    await openApp2(page, user.jwt, '#/account');
    const userResponse = await userResponsePromise;
    expect(userResponse.ok(), 'account overview must load from the authenticated user API').toBe(true);
    const userDto = await userResponse.json() as {
      mail: string;
      kyc: { level: number; phoneCallAccepted?: boolean };
      tradingLimit: { limit: number; period: string };
      currency: { name: string };
    };
    const record = await waitForRow<{ mail: string; kycLevel: number; depositLimit: number; currency: string }>(
      `SELECT ud.mail, ud."kycLevel" AS "kycLevel", ud."depositLimit" AS "depositLimit", f.name AS currency
       FROM user_data ud LEFT JOIN fiat f ON f.id = ud."currencyId" WHERE ud.id = $1`,
      [user.userDataId],
    );
    expect(record.mail).toBe(user.mail);
    expect(record.kycLevel).toBe(50);
    expect(record.depositLimit).toBe(321000);
    expect(userDto).toMatchObject({
      mail: record.mail,
      kyc: { level: record.kycLevel },
      tradingLimit: { limit: record.depositLimit, period: 'Year' },
      currency: { name: record.currency },
    });

    const assertOverview = async () => {
      await expect(page.getByText(record.mail, { exact: true })).toBeVisible();
      // The shortened active address appears in the profile header, address row, and
      // wallet switcher. The first occurrence is the profile secondary line.
      await expect(page.getByText(shortAddress(user.address), { exact: true }).first()).toBeVisible();
      await expect(page.getByText('Level 50', { exact: true })).toBeVisible();
      await expect(page.getByText('Verified · Full access', { exact: true })).toBeVisible();
      await expect(page.getByText('Trading limit', { exact: true })).toBeVisible();
      await expect(page.getByText('Account & security', { exact: true })).toBeVisible();
      const limitCard = page.getByText('Trading limit', { exact: true }).locator('xpath=../..');
      const expectedLimit = `${Math.round(userDto.tradingLimit.limit).toLocaleString('en-US')} CHF per year`;
      await expect(limitCard).toContainText(expectedLimit);
      if (record.currency) {
        await expect(page.getByRole('button', { name: new RegExp(`Display currency.*${record.currency}`) })).toBeVisible();
      }
    };

    await assertOverview();
    const reloadedUserResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/v2/user') && response.request().method() === 'GET',
    );
    await page.reload();
    const reloadedUserResponse = await reloadedUserResponsePromise;
    expect(reloadedUserResponse.ok()).toBe(true);
    expect(await reloadedUserResponse.json()).toMatchObject({
      mail: record.mail,
      kyc: { level: record.kycLevel },
      tradingLimit: { limit: record.depositLimit, period: 'Year' },
    });
    await assertOverview();
  });

  test('account recovers when the initial user request fails once', async ({ page }) => {
    const user = await createUser({ tag: 'app2-account-user-retry', language: 'EN', kycLevel: 30 });
    let userGetCount = 0;
    await page.route('**/v2/user', async (route) => {
      if (route.request().method() === 'GET' && userGetCount++ === 0) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'temporary test outage' }),
        });
        return;
      }
      await route.continue();
    });

    const firstUserResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/v2/user') && response.request().method() === 'GET',
    );
    await openApp2(page, user.jwt, '#/account');
    const firstUserResponse = await firstUserResponsePromise;
    expect(firstUserResponse.status(), 'the first account request should hit the declared temporary failure').toBe(503);
    const loadFailureAlert = page.getByRole('alert').filter({ hasText: "Couldn't load — check your connection." });
    await expect(loadFailureAlert).toContainText("Couldn't load — check your connection.");

    const retryResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/v2/user') && response.request().method() === 'GET',
    );
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    const retryResponse = await retryResponsePromise;
    expect(retryResponse.ok(), 'Retry must perform a real authenticated request to the local user API').toBe(true);
    expect(await retryResponse.json()).toMatchObject({ mail: user.mail, kyc: { level: 30 } });
    await expect(page.getByText(user.mail, { exact: true })).toBeVisible();
    await expect(loadFailureAlert).toHaveCount(0);
  });

  test('authenticated account session survives a fresh browser context restart', async ({ page, browser }) => {
    const user = await createUser({ tag: 'app2-session-restart', language: 'EN', kycLevel: 30, completePersonalData: true });
    await openApp2(page, user.jwt, '#/account');
    await expect(page.getByText(user.mail, { exact: true })).toBeVisible();

    // A separate BrowserContext is a clean browser profile. Restoring Playwright's captured
    // storage state is the same persistence boundary as closing and reopening the browser.
    const state = await page.context().storageState();
    const origin = new URL(page.url()).origin;
    const restartedContext = await browser.newContext({ storageState: state });
    try {
      await restartedContext.route('**/*', async (route) => {
        const host = new URL(route.request().url()).hostname;
        const apiHost = new URL(process.env.E2E_API_URL ?? 'http://api:3000').hostname;
        // The stack may expose its real API to Chromium through a loopback port-forwarder
        // even when the runner-side E2E_API_URL resolves to the internal `api` hostname.
        if (host === new URL(origin).hostname || host === apiHost || ['localhost', '127.0.0.1', '::1'].includes(host)) {
          return route.continue();
        }
        return route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
      });
      const restartedPage = await restartedContext.newPage();
      const userResponse = restartedPage.waitForResponse((response) =>
        new URL(response.url()).pathname.endsWith('/v2/user') && response.request().method() === 'GET',
      );
      await restartedPage.goto(`${origin}/app2/#/account`);
      const apiResponse = await userResponse;
      expect(apiResponse.ok(), 'restored browser session must reload the account from the real user API').toBe(true);
      const apiUser = await apiResponse.json() as { mail?: string; kyc?: { level?: number } };
      expect(apiUser).toMatchObject({ mail: user.mail, kyc: { level: 30 } });
      await expect(restartedPage.getByText(user.mail, { exact: true })).toBeVisible();
      const dbUser = await withDb(async (db) =>
        (await db.query<{ mail: string; kycLevel: number }>(
          `SELECT mail, "kycLevel" AS "kycLevel" FROM user_data WHERE id = $1`, [user.userDataId],
        )).rows[0],
      );
      expect(dbUser).toEqual({ mail: user.mail, kycLevel: 30 });
    } finally {
      await restartedContext.close();
    }
  });

  test('canceling a pending injected-wallet connection preserves the active session', async ({ page }) => {
    const user = await createUser({ tag: 'app2-connect-cancel', language: 'EN' });
    const beforeCancel = await withDb(async (db) =>
      (await db.query<{ id: number; status: string }>(
        `SELECT id, status FROM "user" WHERE id = $1`, [user.userId],
      )).rows[0],
    );
    await page.addInitScript(() => {
      const provider = {
        isMetaMask: true,
        request: ({ method }: { method: string }) => {
          if (method === 'eth_requestAccounts') return new Promise<string[]>(() => undefined);
          if (method === 'eth_accounts') return Promise.resolve([]);
          throw new Error(`unexpected wallet method: ${method}`);
        },
      };
      (window as unknown as { ethereum: typeof provider }).ethereum = provider;
      window.addEventListener('eip6963:requestProvider', () => {
        window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
          detail: { info: { rdns: 'io.metamask', name: 'MetaMask' }, provider },
        }));
      });
    });
    await openApp2(page, user.jwt, '#/account');
    await page.getByText('Connected wallet', { exact: true }).locator('xpath=..').click();
    const switcher = page.getByRole('dialog', { name: 'Switch wallet', exact: true });
    await switcher.getByRole('button', { name: 'Connect another wallet', exact: true }).click();
    await page.getByRole('button', { name: /MetaMask EVM/i }).click();
    await expect(page.getByText(/Connecting/i)).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    expect(await page.evaluate(() => localStorage.getItem('dfx.authenticationToken'))).toBe(user.jwt);
    await expect(page.getByText(user.mail, { exact: true })).toBeVisible();
    const persisted = await withDb(async (db) =>
      (await db.query<{ id: number; status: string }>(
        `SELECT id, status FROM "user" WHERE id = $1`, [user.userId],
      )).rows[0],
    );
    expect(persisted).toEqual(beforeCancel);
  });

  test('second EVM wallet sign-in changes the active wallet through App2 and survives reload', async ({ page }) => {
    test.setTimeout(120000);
    const first = await createUser({ tag: 'app2-second-evm-first', language: 'EN' });
    const second = await createUser({ tag: 'app2-second-evm-second', language: 'EN' });
    const signingKeys = new Map([
      [first.address.toLowerCase(), first.wallet.privateKey],
      [second.address.toLowerCase(), second.wallet.privateKey],
    ]);
    await page.exposeFunction('e2eSignForAddress', async (address: string, hexOrMessage: string) => {
      const privateKey = signingKeys.get(address.toLowerCase());
      if (!privateKey) throw new Error('The local EVM fixture received an unknown address');
      const message = hexOrMessage.startsWith('0x')
        ? Buffer.from(hexOrMessage.slice(2), 'hex').toString('utf8')
        : hexOrMessage;
      return new ethers.Wallet(privateKey).signMessage(message);
    });
    await page.addInitScript(({ initialAddress }) => {
      const key = 'e2e-app2-selected-address';
      let selectedAddress = localStorage.getItem(key) ?? initialAddress;
      const provider = {
        isMetaMask: true,
        selectAddress: (address: string) => {
          selectedAddress = address;
          localStorage.setItem(key, address);
        },
        request: async ({ method, params }: { method: string; params?: string[] }) => {
          if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [selectedAddress];
          if (method === 'eth_chainId') return '0x1';
          if (method === 'net_version') return '1';
          if (method === 'personal_sign') {
            const payload = params?.[0];
            if (typeof payload !== 'string') throw new Error('personal_sign payload missing');
            return (window as unknown as { e2eSignForAddress: (address: string, data: string) => Promise<string> })
              .e2eSignForAddress(selectedAddress, payload);
          }
          throw new Error(`unexpected EVM fixture method: ${method}`);
        },
      };
      (window as unknown as { ethereum: typeof provider }).ethereum = provider;
      window.addEventListener('eip6963:requestProvider', () => {
        window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
          detail: { info: { rdns: 'io.metamask', name: 'MetaMask' }, provider },
        }));
      });
    }, { initialAddress: first.address });

    const firstAuthPromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/v1/auth') && response.request().method() === 'POST',
    );
    const appResponse = await page.goto('/app2/');
    expect(appResponse?.ok(), `/app2/ should load (HTTP ${appResponse?.status() ?? 'no response'})`).toBe(true);
    await page.getByRole('button', { name: /connect wallet/i }).click();
    await page.getByRole('button', { name: /metamask evm/i }).click();
    const firstAuth = await firstAuthPromise;
    expect(firstAuth.ok(), 'the first EVM signer must authenticate against the local auth API').toBe(true);
    expect((firstAuth.request().postDataJSON() as { address: string }).address.toLowerCase()).toBe(first.address.toLowerCase());
    await expect(page.getByRole('tab', { name: /^buy$/i })).toHaveAttribute('aria-selected', 'true', { timeout: 45000 });

    await page.getByRole('button', { name: 'menu' }).click();
    await page.getByRole('dialog', { name: /account/i }).getByRole('button', { name: /^my account$/i }).click();
    await expect(page.getByText(first.mail, { exact: true })).toBeVisible();
    await page.getByText('Connected wallet', { exact: true }).locator('xpath=..').click();
    const switcher = page.getByRole('dialog', { name: 'Switch wallet', exact: true });
    await switcher.getByRole('button', { name: 'Connect another wallet', exact: true }).click();
    await page.evaluate((address) => {
      (window as unknown as { ethereum: { selectAddress: (value: string) => void } }).ethereum.selectAddress(address);
    }, second.address);

    const firstSwitchAuthPromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/v1/auth') && response.request().method() === 'POST',
    );
    const retriedSwitchAuthPromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/v1/auth') &&
      response.request().method() === 'POST' &&
      response.status() !== 409,
    );
    const secondUserResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/v2/user') && response.request().method() === 'GET',
    );
    await page.getByRole('button', { name: /metamask evm/i }).click();
    const firstSwitchAuth = await firstSwitchAuthPromise;
    const firstSwitchAuthBody = await firstSwitchAuth.text();
    expect(
      firstSwitchAuth.status(),
      `switching accounts must detect the existing JWT conflict before retrying without it (${firstSwitchAuthBody})`,
    ).toBe(409);
    const secondAuth = await retriedSwitchAuthPromise;
    const secondAuthBody = await secondAuth.text();
    expect(
      secondAuth.ok(),
      `the second signer must authenticate through the local auth API after the unauthenticated retry (HTTP ${secondAuth.status()}: ${secondAuthBody})`,
    ).toBe(true);
    expect((secondAuth.request().postDataJSON() as { address: string }).address.toLowerCase()).toBe(second.address.toLowerCase());
    expect(secondAuth.request().headers()['authorization']).toBeFalsy();
    const token = await page.evaluate(() => localStorage.getItem('dfx.authenticationToken'));
    expect(token).toBeTruthy();
    expect(decodeJwtPayload(token!).address?.toLowerCase()).toBe(second.address.toLowerCase());

    const persistedSecond = await waitForRow<{ id: number; userDataId: number; address: string }>(
      `SELECT id, "userDataId" AS "userDataId", address FROM "user" WHERE lower(address) = lower($1) LIMIT 1`,
      [second.address],
    );
    expect(persistedSecond).toMatchObject({ id: second.userId, userDataId: second.userDataId, address: second.address });
    const secondUserResponse = await secondUserResponsePromise;
    expect(secondUserResponse.ok(), 'the second session must load its account through the local user API').toBe(true);
    expect(await secondUserResponse.json()).toMatchObject({ accountId: second.userDataId, mail: second.mail });

    const reloadUserPromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/v2/user') && response.request().method() === 'GET',
    );
    await page.reload();
    const reloadedUser = await reloadUserPromise;
    expect(reloadedUser.ok()).toBe(true);
    expect(await reloadedUser.json()).toMatchObject({ accountId: second.userDataId, mail: second.mail });
    await expect(page.getByText(second.mail, { exact: true })).toBeVisible();
    await expect(page.getByText(shortAddress(second.address), { exact: true }).first()).toBeVisible();
  });

  test('wallet address list shows the active wallet and removes it through the account UI', async ({ page }) => {
    const user = await createUser({ tag: 'app2-wallet-address-remove', language: 'EN' });
    await openApp2(page, user.jwt, '#/account');
    await page.getByRole('button', { name: /^Wallet addresses\b/ }).click();
    const addressesSheet = page.getByRole('dialog', { name: 'Wallet addresses', exact: true });
    await expect(addressesSheet.getByText(shortAddress(user.address), { exact: true })).toBeVisible();
    await expect(addressesSheet.getByText('Active', { exact: true })).toBeVisible();

    await addressesSheet.getByRole('button', { name: 'Remove', exact: true }).click();
    const deleteResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname.includes('/user/addresses/') && response.request().method() === 'DELETE',
    );
    await addressesSheet.getByRole('button', { name: 'Yes, remove', exact: true }).click();
    const deleted = await deleteResponse;
    expect(deleted.ok(), 'wallet removal must use the authenticated address-delete API').toBe(true);
    await expect.poll(async () =>
      withDb(async (db) => (await db.query(`SELECT status FROM "user" WHERE id = $1`, [user.userId])).rows[0]?.status),
    ).toBe('Deleted');
    await expect(addressesSheet).toBeHidden();
  });

  test('German language preference survives reload and matches the user_data language', async ({ page }) => {
    const user = await createUser({ tag: 'app2-language-reload', language: 'EN' });
    const languagesResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/language') && response.request().method() === 'GET',
    );
    const userResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/v2/user') && response.request().method() === 'GET',
    );
    await openApp2(page, user.jwt, '#/account');
    const languagesResponse = await languagesResponsePromise;
    expect(languagesResponse.ok(), 'language choices must load from the real API before submitting a preference').toBe(true);
    const languages = await languagesResponse.json() as Array<{ symbol: string; enable: boolean }>;
    expect(languages.some((language) => language.symbol === 'DE' && language.enable)).toBe(true);
    const userResponse = await userResponsePromise;
    expect(userResponse.ok(), 'the authenticated account must load before changing its language').toBe(true);

    await page.getByRole('button', { name: /^Language\b/ }).click();
    const languageSheet = page.getByRole('dialog', { name: 'Language', exact: true });
    const updateResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/v2/user') && response.request().method() === 'PUT',
    );
    await languageSheet.getByRole('button', { name: 'Deutsch', exact: true }).click();
    const updateResponse = await updateResponsePromise;
    expect(updateResponse.ok(), 'selecting Deutsch must persist through the real user update API').toBe(true);

    const german = await waitForRow<{ id: number }>(`SELECT id FROM language WHERE symbol = 'DE' LIMIT 1`, []);
    await expect.poll(async () =>
      withDb(async (db) => (await db.query(`SELECT "languageId" FROM user_data WHERE id = $1`, [user.userDataId])).rows[0]?.languageId),
    ).toBe(german.id);
    await expect(page.getByRole('button', { name: /Sprache.*Deutsch/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Anzeigewährung/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: /Sprache.*Deutsch/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Anzeigewährung/ })).toBeVisible();
  });

  test('EUR display currency survives reload and matches the user_data currency', async ({ page }) => {
    const user = await createUser({ tag: 'app2-currency-reload', language: 'EN' });
    await openApp2(page, user.jwt, '#/account');
    await page.getByRole('button', { name: /^Display currency\b/ }).click();
    await page.getByRole('dialog', { name: 'Choose currency', exact: true }).getByRole('button', { name: 'EUR', exact: true }).click();

    const eur = await waitForRow<{ id: number }>(`SELECT id FROM fiat WHERE name = 'EUR' LIMIT 1`, []);
    await expect.poll(async () =>
      withDb(async (db) => (await db.query(`SELECT "currencyId" FROM user_data WHERE id = $1`, [user.userDataId])).rows[0]?.currencyId),
    ).toBe(eur.id);
    await expect(page.getByRole('button', { name: /^Display currency\s+EUR$/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: /^Display currency\s+EUR$/ })).toBeVisible();
  });

  test('CoinTracking key displays, copies and reloads the persisted API key', async ({ page, context }) => {
    const user = await createUser({ tag: 'app2-cointracking-copy-reload', language: 'EN' });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    // The test stack uses plain HTTP at host `frontend`, where Chromium does not
    // expose its OS clipboard. Keep the UI action real and capture its Clipboard API
    // call in the page instead of pretending the unavailable system clipboard worked.
    await page.addInitScript(() => {
      let copied = '';
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string) => { copied = value; },
          readText: async () => copied,
        },
      });
    });
    await openApp2(page, user.jwt, '#/account');
    await page.getByRole('button', { name: /^CoinTracking connection\b/ }).click();

    const stored = await waitForRow<{ apiKeyCT: string }>(
      `SELECT "apiKeyCT" FROM user_data WHERE id = $1 AND "apiKeyCT" IS NOT NULL`,
      [user.userDataId],
    );
    const coinTrackingSheet = page.getByRole('dialog', { name: 'CoinTracking connection', exact: true });
    await expect(coinTrackingSheet.getByText(stored.apiKeyCT, { exact: true })).toBeVisible();
    await coinTrackingSheet.getByRole('button', { name: 'API key', exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(stored.apiKeyCT);

    await page.reload();
    await page.getByRole('button', { name: /^CoinTracking connection\b/ }).click();
    const reloadedSheet = page.getByRole('dialog', { name: 'CoinTracking connection', exact: true });
    await expect(reloadedSheet.getByText(stored.apiKeyCT, { exact: true })).toBeVisible();
    await reloadedSheet.getByRole('button', { name: 'API key', exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(stored.apiKeyCT);
  });

  test('transaction status and history are API-backed and isolated to the active account', async ({ page }) => {
    const owner = await createUser({ tag: 'app2-tx-isolation-owner', language: 'EN' });
    const other = await createUser({ tag: 'app2-tx-isolation-other', language: 'EN' });
    const ownTx = await createTransaction({ tag: 'app2-tx-owned', state: 'completed_buy', userId: owner.userId, userDataId: owner.userDataId, jwt: owner.jwt, amount: 137 });
    const otherTx = await createTransaction({ tag: 'app2-tx-foreign', state: 'completed_buy', userId: other.userId, userDataId: other.userDataId, jwt: other.jwt, amount: 419 });
    const detailResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/transaction/detail') && response.request().method() === 'GET',
    );
    await openApp2(page, owner.jwt, '#/tx');
    const response = await detailResponse;
    expect(response.ok(), 'App2 must load the authenticated transaction history').toBe(true);
    const history = (await response.json()) as Array<{ uid: string; state: string }>;
    expect(history.some((entry) => entry.uid === ownTx.uid && entry.state === 'Completed')).toBe(true);
    expect(history.some((entry) => entry.uid === otherTx.uid)).toBe(false);

    const ownRow = page.getByText('137 CHF → 0.137 ETH', { exact: true });
    await expect(ownRow).toBeVisible();
    await expect(page.getByText('419 CHF → 0.419 ETH', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Completed', { exact: true }).first()).toBeVisible();
  });

  test('transaction pagination reveals seeded rows and CoinTracking CSV matches persisted transaction data', async ({ page }) => {
    test.setTimeout(180000);
    const user = await createUser({ tag: 'app2-tx-pagination', language: 'EN' });
    const seeded: Array<{ uid: string; transactionId?: number }> = [];
    const first = await createTransaction({ tag: 'app2-tx-page-first', state: 'completed_buy', userId: user.userId, userDataId: user.userDataId, jwt: user.jwt, amount: 100 });
    seeded.push(first);
    expect(first.buyId).toBeDefined();
    for (let index = 1; index < 41; index += 1) {
      seeded.push(await createTransaction({
        tag: `app2-tx-page-${index}`,
        state: 'completed_buy',
        userId: user.userId,
        userDataId: user.userDataId,
        buyId: first.buyId,
        amount: 100 + index,
      }));
    }

    const csvData = await waitForRow<{ txId: string }>(
      `SELECT "txId" FROM buy_crypto WHERE "transactionId" = $1 AND "txId" IS NOT NULL`,
      [first.transactionId],
    );
    const detailResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/transaction/detail') && response.request().method() === 'GET',
    );
    await openApp2(page, user.jwt, '#/tx');
    const response = await detailResponse;
    expect(response.ok()).toBe(true);
    const history = (await response.json()) as Array<{ uid: string; state: string }>;
    expect(history.filter((entry) => seeded.some((tx) => tx.uid === entry.uid))).toHaveLength(41);
    expect(history.every((entry) => entry.state === 'Completed')).toBe(true);
    // CSS Modules hash the `txitem` class, so match its stable source-name prefix
    // while excluding unrelated <details> elements elsewhere in the App2 shell.
    const transactionRows = page.locator('details[class*="txitem"]');
    await expect(transactionRows).toHaveCount(40);
    await expect(page.getByRole('button', { name: 'Load more', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Load more', exact: true }).click();
    await expect(transactionRows).toHaveCount(41);
    await expect(page.getByText('100 CHF → 0.1 ETH', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Load more', exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'CoinTracking export', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('dfx-cointracking.csv');
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const csv = await (await import('node:fs/promises')).readFile(downloadPath!, 'utf8');
    expect(csv).toContain(csvData.txId);
    expect(csv).toContain('DFX Purchase');
  });

  test('unmatched payment assignment selects a real target and updates the bank transaction', async ({ page }) => {
    const user = await createUser({ tag: 'app2-tx-assign', language: 'EN' });
    const iban = 'CH3908704016075473007';
    await createBankAccount(user.jwt, { iban, label: 'Assignment test account' });
    const target = await createBuy(user.jwt);
    const payment = await createBankTx({ tag: 'app2-tx-unmatched', userId: user.userId, userDataId: user.userDataId, iban, amount: 263 });
    if (!payment.transactionId) throw new Error('Unmatched payment seed did not create its linked transaction');
    // A real imported bank feed provides both an unassigned classification and the
    // normalized transaction amount/currency. The factory's generic payment seed has
    // only `currency`/`amount`; set those imported fields as well as the sender IBAN.
    await withDb(async (db) =>
      db.query(
        `UPDATE bank_tx SET "senderAccount" = $1, type = 'Unknown',
                            "txAmount" = amount, "txCurrency" = currency
         WHERE id = $2`,
        [iban, payment.bankTxId],
      ),
    );
    const seededPayment = await waitForRow<{
      type: string;
      indicator: string;
      senderAccount: string;
      txAmount: number;
      txCurrency: string;
      transactionId: number;
    }>(
      `SELECT bt.type, bt."creditDebitIndicator" AS indicator,
              bt."senderAccount" AS "senderAccount", bt."txAmount" AS "txAmount",
              bt."txCurrency" AS "txCurrency", bt."transactionId" AS "transactionId"
       FROM bank_tx bt WHERE bt.id = $1`,
      [payment.bankTxId],
    );
    expect(seededPayment).toMatchObject({
      type: 'Unknown',
      indicator: 'CRDT',
      senderAccount: iban,
      txAmount: 263,
      txCurrency: 'CHF',
      transactionId: payment.transactionId,
    });

    const unassignedResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/transaction/unassigned') && response.request().method() === 'GET',
    );
    await openApp2(page, user.jwt, '#/tx');
    const unassigned = await unassignedResponse;
    const responseBody = await unassigned.text();
    expect(
      unassigned.ok(),
      `App2 GET /transaction/unassigned returned HTTP ${unassigned.status()}: ${responseBody}`,
    ).toBe(true);
    const payments = JSON.parse(responseBody) as Array<{ id: number }>;
    expect(payments.some((entry) => entry.id === payment.transactionId)).toBe(true);
    const targetsResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/transaction/target') && response.request().method() === 'GET',
    );
    await page.getByRole('button', { name: /unmatched payments/i }).click();
    await expect(page.getByLabel('Assign to')).toBeVisible();
    const targets = await targetsResponse;
    expect(targets.ok(), 'assignment picker must load real targets').toBe(true);
    const availableTargets = (await targets.json()) as Array<{ id: number }>;
    expect(availableTargets.some((entry) => entry.id === target.buyId)).toBe(true);
    await page.getByLabel('Assign to').selectOption(String(target.buyId));

    const assignResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith(`/transaction/${payment.transactionId}/target`) && response.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: 'Assign', exact: true }).click();
    const assigned = await assignResponse;
    expect(assigned.ok(), 'App2 must submit the selected target through the real assignment endpoint').toBe(true);
    await expect.poll(async () =>
      withDb(async (db) =>
        (await db.query<{ bankTxType: string; buyCryptoBuyId: number | null }>(
          `SELECT bt.type AS "bankTxType", bc."buyId" AS "buyCryptoBuyId"
           FROM bank_tx bt LEFT JOIN buy_crypto bc ON bc."bankTxId" = bt.id
           WHERE bt.id = $1`,
          [payment.bankTxId],
        )).rows[0],
      ),
    ).toEqual({ bankTxType: 'BuyCrypto', buyCryptoBuyId: target.buyId });
    await expect(page.getByRole('button', { name: /unmatched payments/i })).toHaveCount(0);
  });
});
