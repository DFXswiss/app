/**
 * Login half of the measured MetaMask flow, without the debug trace and without
 * any navigation after the signature. The caller opens the app page. Nothing in
 * this file calls page.goto or page.reload.
 */

import { expect, type BrowserContext, type Locator, type Page, type Response } from '@playwright/test';
import type { MetaMask } from '@synthetixio/synpress/playwright';

const DEV_API_ORIGIN = 'https://dev.api.dfx.swiss';

const TX_CONFIRM = '[data-testid="page-container-footer-next"]';
const TX_REJECT = '[data-testid="page-container-footer-cancel"]';
const SWITCH_CANCEL = '.confirmation-footer__actions button.btn-secondary';
const NETWORK_DISPLAY = '[data-testid="network-display"]';
const DIALOG_ACTIONS = `${TX_CONFIRM}, ${TX_REJECT}, ${SWITCH_CANCEL}`;

// /login shows the crypto-wallet tile first. /connect opens the wallet list, which already has MetaMask.
export type LoginEntry = 'crypto-wallet' | 'wallet-list';

export function requireApiOrigin(): string {
  const raw = process.env.REACT_APP_API_URL;
  if (!raw) {
    throw new Error('REACT_APP_API_URL is missing. This run has no fallback API origin.');
  }
  let origin: string;
  try {
    origin = new URL(raw).origin;
  } catch {
    throw new Error('REACT_APP_API_URL is not a URL. This run has no fallback API origin.');
  }
  if (origin !== DEV_API_ORIGIN) {
    throw new Error(`REACT_APP_API_URL must be ${DEV_API_ORIGIN}. Refusing to call ${origin}.`);
  }
  return origin;
}

function assertExtensionId(extensionId: string): void {
  if (!extensionId) throw new Error('MetaMask extension id is empty');
}

function metaMaskHome(context: BrowserContext, extensionId: string): Page {
  assertExtensionId(extensionId);
  const home = context
    .pages()
    .find((candidate) => candidate.url().startsWith(`chrome-extension://${extensionId}/home.html`));
  if (!home) throw new Error('MetaMask home page is not open');
  return home;
}

async function expectNetwork(context: BrowserContext, extensionId: string, networkName: string): Promise<void> {
  await expect(metaMaskHome(context, extensionId).locator(NETWORK_DISPLAY)).toContainText(networkName, {
    timeout: 20_000,
  });
}

function isDialogUrl(url: string, extensionId: string): boolean {
  return (
    url.startsWith(`chrome-extension://${extensionId}/`) &&
    (url.includes('notification.html') || url.includes('popup.html'))
  );
}

function listedDialogs(context: BrowserContext, extensionId: string): Page[] {
  return context.pages().filter((candidate) => {
    if (candidate.isClosed()) return false;
    return isDialogUrl(candidate.url(), extensionId);
  });
}

async function dialogWaiting(page: Page): Promise<boolean> {
  if (page.isClosed()) return false;
  const actions = page.locator(DIALOG_ACTIONS).filter({ visible: true });
  const named = page
    .getByRole('button', { name: /^(?:Next|Connect|Sign|Confirm|Cancel|Reject)$/i })
    .filter({ visible: true });
  return (await actions.count()) > 0 || (await named.count()) > 0;
}

// MetaMask's popup is an already listed notification.html or popup.html. This wait never opens one.
async function waitingDialog(
  context: BrowserContext,
  extensionId: string,
  ready: (page: Page) => Promise<boolean> = dialogWaiting,
): Promise<Page> {
  assertExtensionId(extensionId);
  let found: Page | undefined;
  await expect
    .poll(
      async () => {
        const pages = listedDialogs(context, extensionId);
        if (pages.length === 0) return 'looking';
        for (const candidate of pages) {
          if (await ready(candidate)) {
            found = candidate;
            return 'waiting';
          }
        }
        return 'pending';
      },
      { timeout: 45_000, intervals: [250, 500] },
    )
    .toBe('waiting');
  if (!found || found.isClosed() || !(await ready(found))) {
    throw new Error('MetaMask dialog is not waiting');
  }
  return found;
}

// Measured on the signature popup: visible label Sign, data-testid page-container-footer-next.
async function signButton(page: Page): Promise<Locator | undefined> {
  if (page.isClosed()) return undefined;
  const buttons = page.locator(TX_CONFIRM).filter({ visible: true });
  const count = await buttons.count();
  let match: Locator | undefined;
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    const label = (await button.innerText()).replace(/\s+/g, ' ').trim();
    if (label !== 'Sign') continue;
    if (match) throw new Error('MetaMask shows two Sign buttons');
    match = button;
  }
  return match;
}

async function signatureReady(page: Page): Promise<boolean> {
  return (await signButton(page)) !== undefined;
}

async function confirmSignature(dialog: Page): Promise<void> {
  let button: Locator | undefined;
  await expect
    .poll(
      async () => {
        button = await signButton(dialog);
        return button ? 'sign' : 'missing';
      },
      { timeout: 20_000, intervals: [250, 500] },
    )
    .toBe('sign');
  if (!button) throw new Error('MetaMask signature button is missing');
  await button.click();
}

function isDevAuthPost(response: Response, apiOrigin: string): boolean {
  if (response.request().method() !== 'POST') return false;
  const url = new URL(response.url());
  return url.origin === apiOrigin && url.pathname === '/v1/auth';
}

export async function selectEthereumMainnet(
  metamask: MetaMask,
  context: BrowserContext,
  extensionId: string,
): Promise<void> {
  await metamask.switchNetwork('Ethereum Mainnet', false);
  await expectNetwork(context, extensionId, 'Ethereum Mainnet');
}

export async function loginWithRealMetaMask(
  page: Page,
  context: BrowserContext,
  extensionId: string,
  entry: LoginEntry,
): Promise<void> {
  const apiOrigin = requireApiOrigin();
  await page.bringToFront();
  if (entry === 'crypto-wallet') {
    const cryptoWallet = page.locator('img[src*="cryptowallet"]');
    await expect(cryptoWallet).toBeVisible({ timeout: 30_000 });
    await cryptoWallet.click();
    await page.bringToFront();
  }
  const metaMaskTile = page.locator('img[src*="metamaskrabby"]');
  await expect(metaMaskTile).toBeVisible({ timeout: 30_000 });
  await metaMaskTile.click();

  const connectDialog = await waitingDialog(context, extensionId);
  const next = connectDialog.getByRole('button', { name: /^next$/i });
  await expect(next).toBeVisible({ timeout: 20_000 });
  await next.click();

  const connectHost = connectDialog.isClosed() ? await waitingDialog(context, extensionId) : connectDialog;
  const connect = connectHost.getByRole('button', { name: /^connect$/i });
  await expect(connect).toBeVisible({ timeout: 20_000 });
  await connect.click();
  if (!connectHost.isClosed()) await expect(connect).toBeHidden({ timeout: 20_000 });

  await page.bringToFront();
  const signDialog = await waitingDialog(context, extensionId, signatureReady);
  const auth = page.waitForResponse((response) => isDevAuthPost(response, apiOrigin), { timeout: 30_000 });
  await confirmSignature(signDialog);
  const response = await auth;
  expect(response.ok(), `POST /v1/auth returned ${response.status()}`).toBe(true);
}
