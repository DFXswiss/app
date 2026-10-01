/**
 * App 2.0 wallet/session flow against the local full-stack API.
 * The injected EVM provider is a deterministic browser fixture; authentication itself
 * signs the API-issued message and uses the real local auth endpoint.
 */

import { ethers } from 'ethers';
import { expect, test, queryOne } from './fixtures';
import { cleanupCreatedData, createUser } from './fixtures/factories';
import type { TestWallet } from './fixtures/auth';

async function installSignedEvmProvider(page: import('@playwright/test').Page, wallet: TestWallet): Promise<void> {
  await page.exposeFunction('e2eSignMessage', async (hexOrMessage: string) => {
    const message = hexOrMessage.startsWith('0x')
      ? Buffer.from(hexOrMessage.slice(2), 'hex').toString('utf8')
      : hexOrMessage;
    return new ethers.Wallet(wallet.privateKey).signMessage(message);
  });

  await page.addInitScript(({ address }) => {
    const provider = {
      isMetaMask: true,
      request: async ({ method, params }: { method: string; params?: string[] }) => {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [address];
        if (method === 'personal_sign') {
          const payload = params?.[0];
          if (typeof payload !== 'string') throw new Error('personal_sign payload missing');
          return (window as unknown as { e2eSignMessage: (value: string) => Promise<string> }).e2eSignMessage(payload);
        }
        throw new Error(`unsupported EIP-1193 method: ${method}`);
      },
    };
    (window as unknown as { ethereum: typeof provider }).ethereum = provider;
    window.addEventListener('eip6963:requestProvider', () => {
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', {
          detail: { info: { rdns: 'io.metamask', name: 'MetaMask' }, provider },
        }),
      );
    });
  }, { address: wallet.address });
}

test.describe('App 2.0 wallet session', () => {
  test.afterEach(async () => {
    await cleanupCreatedData();
  });

  test('injected wallet login survives reload, drawer navigation works, and logout stays logged out', async ({ page }) => {
    test.setTimeout(120000);
    const user = await createUser({ tag: 'app2-wallet-session', kycLevel: 50, completePersonalData: true, language: 'EN' });
    await installSignedEvmProvider(page, user.wallet);

    const response = await page.goto('/app2/');
    expect(response?.ok(), `/app2/ status ${response?.status()}`).toBe(true);
    await page.getByRole('button', { name: /connect wallet/i }).click();
    await page.getByRole('button', { name: /metamask evm/i }).click();
    await expect(page.getByRole('tab', { name: /^buy$/i })).toHaveAttribute('aria-selected', 'true', { timeout: 45000 });

    const token = await page.evaluate(() => window.localStorage.getItem('dfx.authenticationToken'));
    expect(token, 'successful EVM sign-in must persist an auth token').toBeTruthy();
    const row = await queryOne<{ id: number; address: string; userDataId: number }>(
      `SELECT id, address, "userDataId" AS "userDataId" FROM "user" WHERE lower(address) = lower($1) LIMIT 1`,
      [user.address],
    );
    expect(row, 'the signed wallet must resolve to its persisted API user').toBeTruthy();
    expect(row?.id).toBe(user.userId);
    expect(row?.userDataId).toBe(user.userDataId);

    await page.reload();
    await expect(page.getByRole('tab', { name: /^buy$/i })).toHaveAttribute('aria-selected', 'true', { timeout: 30000 });
    await expect(page.getByRole('button', { name: 'menu' })).toBeVisible();

    await page.getByRole('button', { name: 'menu' }).click();
    const drawer = page.getByRole('dialog', { name: /account/i });
    await expect(drawer).toBeVisible();
    await drawer.getByRole('button', { name: /^my account$/i }).click();
    await expect(page.getByText(user.mail, { exact: true })).toBeVisible({ timeout: 20000 });

    await page.getByRole('button', { name: 'menu' }).click();
    const logoutDrawer = page.getByRole('dialog', { name: /account/i });
    await logoutDrawer.getByRole('button', { name: /sign out/i }).click();
    await expect(page.getByRole('button', { name: /connect wallet/i })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: 'menu' })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem('dfx.authenticationToken'))).toBeNull();

    await page.reload();
    await expect(page.getByRole('button', { name: /connect wallet/i })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: 'menu' })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem('dfx.authenticationToken'))).toBeNull();
  });
});
