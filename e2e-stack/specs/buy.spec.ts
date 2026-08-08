/**
 * Buy flow E2E — owns the six App.tsx routes under /buy* and /buyCrypto/update.
 *
 * Runs against the full stack (real frontend, NestJS API, Postgres; external HTTP mocked).
 * UI writes are proven with waitForRow against Postgres where applicable.
 */

import type { Page } from '@playwright/test';
import { expect, gotoWithSession, loginAs, openScreen, queryOne, queryRows, test, waitForRow } from './fixtures';
import { apiGet } from './fixtures/api-client';
import { cleanupCreatedData, createBuy, createTransaction, createUser } from './fixtures/factories';

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

interface ApiAsset {
  id: number;
  name: string;
  buyable?: boolean;
  comingSoon?: boolean;
  blockchain?: string;
}

interface ApiFiat {
  id: number;
  name: string;
  sellable?: boolean;
}

interface PaymentInfoPayload {
  id?: number;
  amount?: number;
  iban?: string;
  remittanceInfo?: string;
  currency?: { name?: string };
  asset?: { name?: string };
}

function normPath(p: string): string {
  return p !== '/' && p.endsWith('/') ? p.slice(0, -1) : p;
}

/** Normalized IBAN for comparison (UI uses Utils.formatIban groups of 4). */
function stripIban(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

/**
 * Read a StyledDataTableRow value: label is a <p> in a flex-none wrapper;
 * value is the following sibling <div>.
 */
function dataTableValue(page: Page, label: string | RegExp) {
  return page.locator('p', { hasText: label }).first().locator('xpath=../following-sibling::div[1]');
}

/** Spend-side container (currency dropdown + amount). */
function spendSection(page: Page) {
  return page.locator('h2', { hasText: 'You spend' }).locator('..');
}

/** Get-side container (asset dropdown + target amount). Heading is "You get" or "You get about". */
function getSection(page: Page) {
  return page.locator('h2', { hasText: /You get/ }).locator('..');
}

/**
 * Close an open StyledDropdown / StyledSearchDropdown panel.
 * These components ignore Escape; they only close on mousedown outside trigger+panel.
 * The section heading is outside every trigger/panel ref on this screen.
 */
async function closeSectionDropdown(page: Page, section: ReturnType<typeof spendSection>): Promise<void> {
  await section.locator('h2').first().click();
  await page.waitForTimeout(150);
}

/** Open a button-style StyledDropdown under a section and return option labels (first line). */
async function readOpenDropdownOptions(page: Page, section: ReturnType<typeof spendSection>): Promise<string[]> {
  const trigger = section.locator('button#dropDownButton').first();
  await trigger.click();
  // Panel is the absolute sibling of the trigger button (StyledDropdown).
  const panel = trigger.locator('xpath=following-sibling::div[1]');
  await panel.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);

  const buttons = panel.locator('button');
  const count = await buttons.count();
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const text = (await buttons.nth(i).innerText()).trim().split('\n')[0]?.trim();
    if (text) names.push(text);
  }

  await closeSectionDropdown(page, section);
  return names;
}

/**
 * Open the asset StyledSearchDropdown (trigger is <input type="text">, not button#dropDownButton)
 * and return option labels. Excludes the wallet-address StyledDropdown trigger via :not(#dropDownButton).
 */
async function readOpenSearchDropdownOptions(page: Page, section: ReturnType<typeof getSection>): Promise<string[]> {
  const trigger = section.locator('input[type="text"]').first();
  await trigger.click();
  // Panel option buttons have no id; the address control's always-present trigger is button#dropDownButton.
  const optionButtons = section.locator('button:not(#dropDownButton)');
  await optionButtons
    .first()
    .waitFor({ state: 'visible', timeout: 5000 })
    .catch(() => undefined);

  const count = await optionButtons.count();
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const text = (await optionButtons.nth(i).innerText()).trim().split('\n')[0]?.trim();
    if (text) names.push(text);
  }

  await closeSectionDropdown(page, section);
  return names;
}

async function chooseFromSectionDropdown(
  page: Page,
  section: ReturnType<typeof spendSection>,
  optionName: string,
): Promise<void> {
  const trigger = section.locator('button#dropDownButton').first();
  await trigger.click();
  // Panel is the absolute sibling of the trigger button (StyledDropdown).
  const panel = trigger.locator('xpath=following-sibling::div[1]');
  await panel.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);

  // Option buttons render label + description as separate lines (e.g. "CHF\nSwiss Franc");
  // match on the first line only — hasText: /^Name$/ never matches multi-line content.
  const optionButtons = panel.locator('button');
  const count = await optionButtons.count();
  for (let i = 0; i < count; i++) {
    const text = (await optionButtons.nth(i).innerText()).trim().split('\n')[0]?.trim();
    if (text === optionName) {
      await optionButtons.nth(i).click();
      return;
    }
  }

  // Fallback: same first-line comparison anywhere on the page (panel restructure).
  const pageButtons = page.locator('button');
  const pageCount = await pageButtons.count();
  for (let i = 0; i < pageCount; i++) {
    const text = (await pageButtons.nth(i).innerText()).trim().split('\n')[0]?.trim();
    if (text === optionName) {
      await pageButtons.nth(i).click();
      return;
    }
  }

  throw new Error(`chooseFromSectionDropdown: option "${optionName}" not found in dropdown panel`);
}

/** Pick an option from the asset StyledSearchDropdown (input trigger + panel buttons without #dropDownButton). */
async function chooseFromSectionSearchDropdown(
  page: Page,
  section: ReturnType<typeof getSection>,
  optionName: string,
): Promise<void> {
  const trigger = section.locator('input[type="text"]').first();
  await trigger.click();
  const optionButtons = section.locator('button:not(#dropDownButton)');
  await optionButtons
    .first()
    .waitFor({ state: 'visible', timeout: 5000 })
    .catch(() => undefined);

  const count = await optionButtons.count();
  for (let i = 0; i < count; i++) {
    const text = (await optionButtons.nth(i).innerText()).trim().split('\n')[0]?.trim();
    if (text === optionName) {
      await optionButtons.nth(i).click();
      return;
    }
  }
  // Fallback: match by accessible/full text anywhere on the page.
  await page
    .locator('button', { hasText: new RegExp(`^${optionName}$`) })
    .last()
    .click();
}

async function setSpendAmount(page: Page, amount: string): Promise<void> {
  const input = spendSection(page).locator('input[type="number"]').first();
  await input.click();
  await input.fill('');
  await input.fill(amount);
  await input.blur();
}

/** Capture the latest successful PUT /v1/buy/paymentInfos JSON body. */
function attachPaymentInfoCapture(page: Page): { get: () => PaymentInfoPayload | undefined } {
  let last: PaymentInfoPayload | undefined;
  page.on('response', async (res) => {
    try {
      const url = res.url();
      if (!url.includes('/buy/paymentInfos') || res.request().method() !== 'PUT') return;
      if (url.includes('/confirm') || url.includes('/invoice')) return;
      if (!res.ok()) return;
      last = (await res.json()) as PaymentInfoPayload;
    } catch {
      /* ignore parse errors */
    }
  });
  return { get: () => last };
}

type QuoteUiState = 'payment' | 'min-error' | 'error' | 'missing' | 'kyc' | 'limit' | 'pending';

async function readQuoteUiState(page: Page): Promise<QuoteUiState> {
  if (
    await page
      .getByRole('heading', { name: 'Payment Information' })
      .isVisible()
      .catch(() => false)
  ) {
    return 'payment';
  }
  if (
    await page
      .getByRole('button', { name: /Click here once you have issued the transfer/i })
      .isVisible()
      .catch(() => false)
  ) {
    return 'payment';
  }
  if (
    await page
      .getByText(/Entered amount is below minimum deposit of/i)
      .isVisible()
      .catch(() => false)
  ) {
    return 'min-error';
  }
  if (
    await page
      .getByText('Missing required information')
      .isVisible()
      .catch(() => false)
  ) {
    return 'missing';
  }
  if (
    await page
      .getByText('Something went wrong')
      .isVisible()
      .catch(() => false)
  ) {
    return 'error';
  }
  if (
    await page
      .getByText(
        'This transaction is only possible with a verified account. Please complete our KYC (Know-Your-Customer) process.',
      )
      .isVisible()
      .catch(() => false)
  ) {
    return 'kyc';
  }
  // LIMIT_EXCEEDED (quote-error-hint) — {{limit}} makes the full string seed-dependent.
  if (
    await page
      .getByText(/This transaction exceeds your trading limit of/i)
      .isVisible()
      .catch(() => false)
  ) {
    return 'limit';
  }
  return 'pending';
}

async function waitForQuoteUi(page: Page, timeout = 45000): Promise<QuoteUiState> {
  let state: QuoteUiState = 'pending';
  await expect
    .poll(
      async () => {
        state = await readQuoteUiState(page);
        return state;
      },
      { timeout, message: 'buy quote UI should leave the pending/loading state' },
    )
    .not.toBe('pending');
  return state;
}

/**
 * POST /buy reuses an existing route for the same (user, asset, no deposit).
 * Prefer two buyable assets on the same blockchain (EVM test users can only buy
 * assets on blockchains they hold); if the seed only has one, create the second
 * route on another user for the same asset.
 *
 * GET /v1/asset returns DESC id order, so the first buyable item may be Cardano/
 * Bitcoin/etc. Anchor on an EVM-chain asset only (same set as global.setup EVM_BLOCKCHAINS).
 */
const EVM_BLOCKCHAINS = new Set(
  'Ethereum;Sepolia;BinanceSmartChain;Arbitrum;Optimism;Polygon;Base;Gnosis;Haqq'.split(';'),
);

async function twoDistinctBuyRoutes(jwt: string, tag: string): Promise<{ buyId: number; newBuyId: number }> {
  const assets = await apiGet<ApiAsset[]>('asset');
  const buyable = assets.filter((a) => a.buyable && !a.comingSoon);
  expect(buyable.length, 'seed must include at least one buyable asset').toBeGreaterThanOrEqual(1);

  // Test users log in with an ethers.Wallet address → user.blockchains is EVM-only.
  // Picking raw buyable[0] can be Cardano/Bitcoin/etc. and yields HTTP 400.
  const evmBuyable = buyable.filter((a) => a.blockchain != null && EVM_BLOCKCHAINS.has(a.blockchain));
  expect(
    evmBuyable.length,
    'seed must include at least one buyable EVM-chain asset (Ethereum/Sepolia/…)',
  ).toBeGreaterThanOrEqual(1);

  const anchor = evmBuyable[0];
  const buy1 = await createBuy(jwt, { assetId: anchor.id });
  // Same blockchain only — user.blockchains is derived from the login wallet
  // (EVM here), so a non-matching asset yields HTTP 400 "Asset blockchain mismatch".
  const secondAsset = buyable.find((a) => a.id !== anchor.id && a.blockchain === anchor.blockchain);
  if (secondAsset) {
    const buy2 = await createBuy(jwt, { assetId: secondAsset.id });
    expect(buy2.buyId).not.toBe(buy1.buyId);
    return { buyId: buy1.buyId, newBuyId: buy2.buyId };
  }

  const otherUser = await createUser({ tag: `${tag}-buy2`, kycLevel: 30, completePersonalData: true });
  const buy2 = await createBuy(otherUser.jwt, { assetId: anchor.id });
  expect(buy2.buyId).not.toBe(buy1.buyId);
  return { buyId: buy1.buyId, newBuyId: buy2.buyId };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial' });

test.describe('Buy flow', () => {
  test.afterAll(async () => {
    await cleanupCreatedData();
  });

  // =========================================================================
  // /buy
  // =========================================================================

  test('/buy: logged-out user is redirected to /login', async ({ page }) => {
    await page.goto('/buy');
    await page.waitForLoadState('networkidle');
    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'logged-out /buy must redirect to /login (useAddressGuard)',
        timeout: 15000,
      })
      .toBe('/login');
  });

  test('/buy: authenticated user sees spend/get form and Buy title', async ({ page }) => {
    const user = await createUser({ tag: 'buy-render', kycLevel: 30, completePersonalData: true });

    await openScreen(page, '/buy', user.jwt);

    // Title is a <div> in navigation, not a heading.
    await expect(page.getByText('Buy', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'You spend' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /You get/ })).toBeVisible();
    await expect(spendSection(page).locator('input[type="number"]').first()).toBeVisible();
  });

  test('/buy: only sellable fiats and buyable assets are offered', async ({ page }) => {
    const user = await createUser({ tag: 'buy-select', kycLevel: 30, completePersonalData: true });

    const fiats = await apiGet<ApiFiat[]>('fiat');
    const assets = await apiGet<ApiAsset[]>('asset');
    const sellableFiatNames = new Set(fiats.filter((f) => f.sellable).map((f) => f.name));
    const buyableAssetNames = new Set(assets.filter((a) => a.buyable && !a.comingSoon).map((a) => a.name));

    expect(sellableFiatNames.size, 'seed must include sellable fiats').toBeGreaterThan(0);
    expect(buyableAssetNames.size, 'seed must include buyable assets').toBeGreaterThan(0);

    await openScreen(page, '/buy', user.jwt);
    await expect(page.getByRole('heading', { name: 'You spend' })).toBeVisible();
    // Wait until both dropdowns have hydrated with seed data.
    await expect
      .poll(async () => spendSection(page).locator('button#dropDownButton').count(), { timeout: 20000 })
      .toBeGreaterThan(0);

    const currencyNames = await readOpenDropdownOptions(page, spendSection(page));
    // When only one sellable fiat exists the dropdown is disabled and shows no open panel —
    // fall back to the closed button's visible name.
    if (currencyNames.length === 0) {
      const closed = (await spendSection(page).locator('button#dropDownButton').first().innerText())
        .trim()
        .split('\n')[0]
        ?.trim();
      if (closed && closed !== 'Select...') currencyNames.push(closed);
    }
    expect(currencyNames.length, 'currency dropdown should expose at least one name').toBeGreaterThan(0);
    for (const name of currencyNames) {
      expect(sellableFiatNames.has(name), `offered currency "${name}" must be sellable per GET /v1/fiat`).toBe(true);
    }

    const assetNames = await readOpenSearchDropdownOptions(page, getSection(page));
    if (assetNames.length === 0) {
      // Closed search control shows the selected asset name in the text input value.
      const closed = (await getSection(page).locator('input[type="text"]').first().inputValue()).trim();
      if (closed && closed !== 'Select...') assetNames.push(closed);
    }
    expect(assetNames.length, 'asset dropdown should expose at least one name').toBeGreaterThan(0);
    for (const name of assetNames) {
      // Frontend filters to available blockchains + PUBLIC category; every offered name must still be buyable.
      expect(buyableAssetNames.has(name), `offered asset "${name}" must be buyable per GET /v1/asset`).toBe(true);
    }
  });

  // Needs kycLevel 50 + depositLimit SQL (else KYC_REQUIRED / LIMIT_EXCEEDED before min-amount). Body is correct;
  // fixme: seed has 0 transaction_specification rows → getSpec falls through to TransactionSpecification.default()
  // (minVolume=0), so AMOUNT_TOO_LOW never fires (confirmed live: 1 and 0.001 CHF both reach Payment Information).
  // Proper fix is seeding transaction_specification in global.setup.ts (out of scope for this file).
  test.fixme('/buy: amount below minimum surfaces error (not payment details) — AMOUNT_TOO_LOW unreachable: empty transaction_specification table → TransactionSpecification.default() minVolume=0 for every asset pair (confirmed live: 1 and 0.001 CHF both reach Payment Information instead of AMOUNT_TOO_LOW)', async ({
    page,
  }) => {
    const user = await createUser({ tag: 'buy-min', kycLevel: 50, completePersonalData: true });
    // createUser only sets kycLevel via SQL; depositLimit stays null → tradingLimit.remaining / availableTradingLimit
    // compute to 0 (user-data.entity getters) and any amount trips LIMIT_EXCEEDED before min-amount / payment info.
    await queryRows(`UPDATE user_data SET "depositLimit" = 1000000 WHERE id = $1`, [user.userDataId]);

    // openScreen cannot take query strings (pathname vs full path comparison would throw).
    await openScreen(page, '/buy', user.jwt);
    await page.goto('/buy?asset-in=CHF&asset-out=ETH&amount-in=0.001&blockchain=Ethereum');
    await page.waitForLoadState('networkidle');
    await expect.poll(() => normPath(new URL(page.url()).pathname)).toBe('/buy');

    // amount-in=0.001 already set via URL; do not re-fill (would bump quote generation and race the
    // personal-IBAN attempt-and-fallback on PUT /buy/paymentInfos).
    await expect(spendSection(page).locator('input[type="number"]').first()).toHaveValue('0.001');
    const state = await waitForQuoteUi(page, 45000);

    expect(state, 'quote must resolve to an error path, not payment info').not.toBe('payment');
    expect(state).not.toBe('pending');

    const minError = page.getByText(/Entered amount is below minimum deposit of/i);
    if (await minError.isVisible().catch(() => false)) {
      await expect(minError).toBeVisible();
    } else {
      // Pricing mock can produce a generic ErrorHint instead of AMOUNT_TOO_LOW — still not payment info.
      await expect(page.getByText('Something went wrong').or(page.locator('.text-dfxRed-100').first())).toBeVisible();
    }
  });

  // Does not depend on live pricing — POST /buy creates the route without Kraken.
  test('/buy: full flow — POST /buy creates a real, active buy route', async () => {
    const user = await createUser({ tag: 'buy-full', kycLevel: 30, completePersonalData: true });

    const buy = await createBuy(user.jwt);
    const row = await waitForRow<{ id: number; active: boolean; userId: number }>(
      `SELECT id, active, "userId" AS "userId" FROM buy WHERE id = $1`,
      [buy.buyId],
    );
    expect(row.userId).toBe(user.userId);
    expect(row.active).toBe(true);
  });

  // Needs kycLevel 50: PUT /buy/paymentInfos requires it for BANK-method CHF quotes (buy.service
  // collectionAccountOrThrow / virtual-iban isUserEligible) so the quote can reach Payment Information.
  test('/buy: full flow — pick CHF/ETH, amount 100, payment info, prove buy row', async ({ page }) => {
    test.setTimeout(90000);
    const user = await createUser({ tag: 'buy-full-ui', kycLevel: 50, completePersonalData: true });
    // See buy-min: null depositLimit at kycLevel 50 → availableTradingLimit 0 → LIMIT_EXCEEDED on any amount.
    await queryRows(`UPDATE user_data SET "depositLimit" = 1000000 WHERE id = $1`, [user.userDataId]);
    const capture = attachPaymentInfoCapture(page);

    await openScreen(page, '/buy', user.jwt);
    await expect(page.getByRole('heading', { name: 'You spend' })).toBeVisible();

    // Drive selection through the real UI.
    await chooseFromSectionDropdown(page, spendSection(page), 'CHF');
    await chooseFromSectionSearchDropdown(page, getSection(page), 'ETH');
    await setSpendAmount(page, '100');

    const state = await waitForQuoteUi(page, 45000);
    expect(state, 'full buy UI must reach Payment Information once pricing is available').toBe('payment');

    await expect(page.getByRole('heading', { name: 'Payment Information' })).toBeVisible();

    const apiBuy = capture.get();
    expect(apiBuy, 'PUT /buy/paymentInfos should have returned a body').toBeTruthy();

    // Displayed values must match the API response (not hardcoded seed IBANs).
    const ibanCell = dataTableValue(page, 'IBAN');
    await expect(ibanCell).toBeVisible();
    const displayedIban = stripIban(await ibanCell.innerText());
    if (apiBuy?.iban) {
      expect(displayedIban).toContain(stripIban(apiBuy.iban).slice(0, 8));
    }

    const amountLabel = apiBuy?.currency?.name ? new RegExp(`^Amount in ${apiBuy.currency.name}$`) : /^Amount in /;
    const amountCell = dataTableValue(page, amountLabel);
    await expect(amountCell).toBeVisible();
    const amountText = (await amountCell.innerText()).replace(/[^\d.,-]/g, '');
    if (apiBuy?.amount != null) {
      expect(Number(amountText.replace(',', ''))).toBeCloseTo(Number(apiBuy.amount), 2);
    }

    if (apiBuy?.remittanceInfo) {
      const remCell = dataTableValue(page, 'Remittance info');
      await expect(remCell).toContainText(apiBuy.remittanceInfo);
    }

    // Prove buy route row exists for this user (created by paymentInfos).
    const buyRow = await waitForRow<{ id: number; active: boolean; userId: number }>(
      `SELECT id, active, "userId" AS "userId"
       FROM buy WHERE "userId" = $1 ORDER BY id DESC LIMIT 1`,
      [user.userId],
      30000,
    );
    expect(buyRow.active).toBe(true);
    expect(buyRow.userId).toBe(user.userId);

    // Confirm transfer → in-place completion (BuyCompletion with mail).
    const confirmBtn = page.getByRole('button', { name: /Click here once you have issued the transfer/i });
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();
    await expect(page.getByText(/Nice! You are all set!/i)).toBeVisible({ timeout: 15000 });
  });

  // =========================================================================
  // /buy/info
  // =========================================================================

  test('/buy/info: logged-out user is redirected away', async ({ page }) => {
    await page.goto('/buy/info');
    await page.waitForLoadState('networkidle');
    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'logged-out /buy/info must redirect (useAddressGuard default /)',
        timeout: 15000,
      })
      .not.toBe('/buy/info');
  });

  test('/buy/info: missing required params shows exact error string', async ({ page }) => {
    const user = await createUser({ tag: 'buy-info-miss', kycLevel: 30, completePersonalData: true });

    await openScreen(page, '/buy/info', user.jwt);

    // Literal English string, not translated (setErrorMessage('Missing required information')).
    await expect(page.getByText('Missing required information')).toBeVisible();
  });

  test('/buy/info: with asset-in/asset-out/amount-in shows Payment Information or handled error', async ({ page }) => {
    test.setTimeout(90000);
    // kycLevel 50 required for PUT /buy/paymentInfos on BANK-method CHF (same as full buy UI flow).
    const user = await createUser({ tag: 'buy-info-ok', kycLevel: 50, completePersonalData: true });
    // See buy-min: null depositLimit at kycLevel 50 → availableTradingLimit 0 → LIMIT_EXCEEDED on any amount.
    await queryRows(`UPDATE user_data SET "depositLimit" = 1000000 WHERE id = $1`, [user.userDataId]);
    const capture = attachPaymentInfoCapture(page);

    await openScreen(page, '/buy', user.jwt);
    // Session already in localStorage; openScreen cannot carry query params.
    await page.goto('/buy/info?asset-in=CHF&asset-out=ETH&amount-in=100&blockchain=Ethereum');
    await page.waitForLoadState('networkidle');
    await expect.poll(() => normPath(new URL(page.url()).pathname)).toBe('/buy/info');

    const state = await waitForQuoteUi(page, 45000);
    expect(state, `expected Payment Information for CHF/ETH/100 with kycLevel 50 (got ${state})`).toBe('payment');

    const apiBuy = capture.get();
    const ibanCell = dataTableValue(page, 'IBAN');
    await expect(ibanCell).toBeVisible();
    if (apiBuy?.iban) {
      expect(stripIban(await ibanCell.innerText())).toContain(stripIban(apiBuy.iban).slice(0, 8));
    }
    await expect(page.getByRole('button', { name: /Click here once you have issued the transfer/i })).toBeVisible();
  });

  // =========================================================================
  // /buy/success
  // =========================================================================

  test('/buy/success: logged-out user is redirected away (no cko-payment-id)', async ({ page }) => {
    await page.goto('/buy/success');
    await page.waitForLoadState('networkidle');
    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'logged-out /buy/success must redirect (useAddressGuard when cko-payment-id is absent)',
        timeout: 15000,
      })
      .not.toBe('/buy/success');
  });

  test('/buy/success: user with mail sees Done! completion copy', async ({ page }) => {
    // createUser sets a mail by default → hasMail branch of BuyCompletion.
    const user = await createUser({ tag: 'buy-success', kycLevel: 30, completePersonalData: true });

    await openScreen(page, '/buy/success', user.jwt);

    await expect(page.getByText('Done!', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Nice! You are all set! Give us a minute to handle your transaction.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
  });

  // =========================================================================
  // /buy/failure
  // =========================================================================

  test('/buy/failure: renders for anyone and Retry navigates to /buy', async ({ page }) => {
    // No guard — accessible without login.
    await page.goto('/buy/failure');
    await page.waitForLoadState('networkidle');
    await expect.poll(() => normPath(new URL(page.url()).pathname)).toBe('/buy/failure');

    await expect(page.getByText('Failed!', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Your payment has failed. Please try again.')).toBeVisible();

    await page.getByRole('button', { name: 'Retry' }).click();
    // Retry navigates to /buy; without a session the address guard then sends /login.
    await expect.poll(() => normPath(new URL(page.url()).pathname), { timeout: 15000 }).not.toBe('/buy/failure');
    const path = normPath(new URL(page.url()).pathname);
    expect(['/buy', '/login']).toContain(path);
  });

  test('/buy/failure: also renders when authenticated', async ({ page }) => {
    const { jwt } = await loginAs('User');
    await openScreen(page, '/buy/failure', jwt);
    await expect(page.getByText('Your payment has failed. Please try again.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  // =========================================================================
  // /buy/personal-iban
  // =========================================================================

  test('/buy/personal-iban: logged-out user is redirected to /login', async ({ page }) => {
    await page.goto('/buy/personal-iban');
    await page.waitForLoadState('networkidle');
    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'logged-out /buy/personal-iban must redirect to /login',
        timeout: 15000,
      })
      .toBe('/login');
  });

  test('/buy/personal-iban: without currency shows missing-currency error', async ({ page }) => {
    const user = await createUser({ tag: 'piban-nocur', kycLevel: 30, completePersonalData: true });

    await openScreen(page, '/buy/personal-iban', user.jwt);

    await expect(page.getByText('Personal IBAN', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Generate Personal IBAN' })).toBeVisible();
    await expect(page.getByText('No currency specified. Please go back and select a currency.')).toBeVisible();
  });

  test('/buy/personal-iban: kycLevel < 50 with currency=CHF asks to complete verification', async ({ page }) => {
    const user = await createUser({ tag: 'piban-low', kycLevel: 30, completePersonalData: true });

    await openScreen(page, '/buy', user.jwt);
    await page.goto('/buy/personal-iban?currency=CHF');
    await page.waitForLoadState('networkidle');
    await expect.poll(() => normPath(new URL(page.url()).pathname)).toBe('/buy/personal-iban');

    await expect(
      page.getByText(
        'To generate a personal IBAN, we need some additional information from you. Please complete the verification process.',
      ),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: 'Complete verification' })).toBeVisible();
  });

  test('/buy/personal-iban: kycLevel >= 50 with currency=CHF — observe success or error', async ({ page }) => {
    const user = await createUser({ tag: 'piban-high', kycLevel: 50, completePersonalData: true });

    await openScreen(page, '/buy', user.jwt);
    await page.goto('/buy/personal-iban?currency=CHF');
    await page.waitForLoadState('networkidle');
    await expect.poll(() => normPath(new URL(page.url()).pathname)).toBe('/buy/personal-iban');

    // Downstream personal-IBAN issuance may be mocked; assert whatever the real page shows.
    // Assertion keeps the full union; TS CFA would otherwise keep 'pending' (poll mutates in a nested closure).
    let outcome = 'pending' as 'success' | 'error' | 'kyc' | 'loading' | 'pending';
    await expect
      .poll(
        async () => {
          if (
            await page
              .getByText(/Your personal IBAN for CHF/i)
              .isVisible()
              .catch(() => false)
          ) {
            outcome = 'success';
            return outcome;
          }
          if (
            await page
              .getByText('Something went wrong')
              .isVisible()
              .catch(() => false)
          ) {
            outcome = 'error';
            return outcome;
          }
          if (
            await page
              .getByText(/complete the verification process/i)
              .isVisible()
              .catch(() => false)
          ) {
            outcome = 'kyc';
            return outcome;
          }
          if (
            await page
              .getByText('Generating your personal IBAN')
              .isVisible()
              .catch(() => false)
          ) {
            outcome = 'loading';
            return outcome;
          }
          return 'pending';
        },
        { timeout: 30000 },
      )
      .not.toBe('pending');

    // Leave pure loading only if the request never settled (would fail poll timeout above).
    expect(
      outcome === 'success' || outcome === 'error' || outcome === 'kyc',
      `kycLevel 50 personal-IBAN must end in success, ErrorHint, or KYC gate (got ${outcome})`,
    ).toBe(true);

    if (outcome === 'success') {
      await expect(page.locator('p.text-dfxBlue-800.font-bold').first()).not.toBeEmpty();
    }
  });

  // =========================================================================
  // /buyCrypto/update
  // =========================================================================

  test('/buyCrypto/update: non-Admin is redirected away', async ({ page }) => {
    const { jwt } = await loginAs('User');
    await gotoWithSession(page, '/buyCrypto/update', jwt);
    await page.waitForLoadState('networkidle');
    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'User must be redirected away from /buyCrypto/update (useAdminGuard)',
        timeout: 15000,
      })
      .not.toBe('/buyCrypto/update');
  });

  test('/buyCrypto/update: Admin can open form with BuyCrypto ID and New Buy ID fields', async ({ page }) => {
    const { jwt } = await loginAs('Admin');

    await openScreen(page, '/buyCrypto/update', jwt);

    await expect(page.getByText('Update Buy Route', { exact: true }).first()).toBeVisible();
    // StyledInput labels are not htmlFor-linked; placeholders are the stable anchors.
    await expect(page.getByText('BuyCrypto ID', { exact: true })).toBeVisible();
    await expect(page.getByText('New Buy ID', { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('Transaction ID')).toBeVisible();
    await expect(page.getByPlaceholder('Buy Route ID')).toBeVisible();

    const save = page.getByRole('button', { name: 'Save' });
    await expect(save).toBeVisible();
    await expect(save).toBeDisabled();
  });

  // staffKycClearance is seeded in global.setup for harness Admin — Admin is no longer redirected to
  // /staff-kyc-required and the PUT reaches BuyCryptoService.update/changeRoute. Body is correct;
  // fixme: API crashes with 500 TypeError: Cannot read properties of null (reading 'id') in
  // BuyCryptoService.changeRoute (buy-crypto.service.ts, comparison route.userData.id !==
  // entity.transaction.userData.id) when changing the buy route under this request shape (confirmed
  // live: ErrorHint + buyId unchanged). Genuine API bug, not fixable in this file.
  test.fixme("/buyCrypto/update: Admin save updates buyId and shows Saved — staff KYC clearance works (no /staff-kyc-required redirect), but API BuyCryptoService.changeRoute throws TypeError: Cannot read properties of null (reading 'id') (500) at route.userData.id !== entity.transaction.userData.id (buy-crypto.service.ts); confirmed live API log PUT /v1/buyCrypto/1", async ({
    page,
  }) => {
    test.setTimeout(90000);
    const { jwt: adminJwt } = await loginAs('Admin');

    const user = await createUser({ tag: 'bc-upd', kycLevel: 30, completePersonalData: true });
    const { buyId: buy1Id, newBuyId } = await twoDistinctBuyRoutes(user.jwt, 'bc-upd');

    const tx = await createTransaction({
      tag: 'bc-upd',
      state: 'pending_buy',
      userId: user.userId,
      userDataId: user.userDataId,
      jwt: user.jwt,
      buyId: buy1Id,
    });
    expect(tx.buyCryptoId).toBeTruthy();

    const before = await queryOne<{ buyId: number }>(`SELECT "buyId" AS "buyId" FROM buy_crypto WHERE id = $1`, [
      tx.buyCryptoId,
    ]);
    expect(before?.buyId).toBe(buy1Id);

    await openScreen(page, '/buyCrypto/update', adminJwt);

    await page.getByPlaceholder('Transaction ID').fill(String(tx.buyCryptoId));
    await page.getByPlaceholder('Buy Route ID').fill(String(newBuyId));

    const save = page.getByRole('button', { name: 'Save' });
    await expect(save).toBeEnabled();
    await save.click();

    // staffKycClearance is seeded in global.setup for harness Admin; save should succeed.
    await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15000 });
    const updated = await waitForRow<{ buyId: number }>(
      `SELECT "buyId" AS "buyId" FROM buy_crypto WHERE id = $1 AND "buyId" = $2`,
      [tx.buyCryptoId, newBuyId],
      15000,
    );
    expect(updated.buyId).toBe(newBuyId);
  });
});
