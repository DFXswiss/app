import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import { authenticateLinkedAddress, getCachedAuth } from './helpers/auth-cache';

// Reality declaration for the catalog-flag rewrite lives in docs/test-architecture.md.
// This spec does not intercept paymentInfos, invent assets, or write the database.

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

interface CatalogAsset {
  name?: string;
  blockchain?: string;
  uniqueName?: string;
  buyable?: boolean;
  sellable?: boolean;
}

let token = '';
let accountAddress = '';

function requireLoopbackApi(): void {
  const raw = process.env.REACT_APP_API_URL;
  if (!raw) {
    throw new Error('REACT_APP_API_URL is required and must be an explicit loopback URL');
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('REACT_APP_API_URL is not a URL');
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(`REACT_APP_API_URL must be loopback, got ${host}`);
  }
}

function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.replace(/^\[|\]$/g, ''));
}

function isPolygonToken(asset: CatalogAsset, name: string, uniqueName: string): boolean {
  if (asset.blockchain !== 'Polygon' || asset.name !== name) return false;
  return asset.uniqueName == null || asset.uniqueName === uniqueName;
}

function isAssetCatalog(url: URL, method: string): boolean {
  return method === 'GET' && (url.pathname === '/v1/asset' || url.pathname.endsWith('/v1/asset'));
}

async function installCatalogFlagRoute(page: Page): Promise<{ rewritten: () => boolean }> {
  let rewritten = false;
  await page.route('**/*', async (route: Route) => {
    const request = route.request();
    let url: URL;
    try {
      url = new URL(request.url());
    } catch {
      await route.continue();
      return;
    }
    if (!isAssetCatalog(url, request.method())) {
      await route.continue();
      return;
    }
    if (!isLoopbackHost(url.hostname)) {
      throw new Error(`asset catalog request left loopback: ${url.hostname}`);
    }
    const response = await route.fetch();
    if (!response.ok()) {
      throw new Error(`GET /v1/asset returned HTTP ${response.status()}`);
    }
    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) {
      throw new Error('GET /v1/asset did not return an array');
    }
    let dscCount = 0;
    let dgcCount = 0;
    const next = payload.map((row: unknown) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
      const asset = row as CatalogAsset;
      const dsc = isPolygonToken(asset, 'DSC', 'Polygon/DSC');
      const dgc = isPolygonToken(asset, 'DGC', 'Polygon/DGC');
      if (!dsc && !dgc) return row;
      if (dsc) dscCount += 1;
      if (dgc) dgcCount += 1;
      return { ...asset, buyable: true, sellable: true };
    });
    if (dscCount !== 1 || dgcCount !== 1) {
      throw new Error(
        `GET /v1/asset must contain exactly one Polygon DSC and one Polygon DGC; found DSC ${dscCount}, DGC ${dgcCount}`,
      );
    }
    rewritten = true;
    await route.fulfill({ response, json: next });
  });
  return { rewritten: () => rewritten };
}

function spendAmount(page: Page): Locator {
  // StyledInput puts the form name on the controller, not on the DOM input.
  return page.locator('h2', { hasText: 'You spend' }).locator('..').locator('input[type="number"]').first();
}

function targetAmount(page: Page): Locator {
  return page.locator('h2', { hasText: /You get/ }).locator('..').locator('input[type="number"]').first();
}

function walletTrigger(page: Page): Locator {
  return page.getByRole('button', { name: 'Receiving wallet' });
}

function staticWalletLine(page: Page): Locator {
  return page.getByText('Receiving wallet', { exact: true }).locator('xpath=following-sibling::p[1]');
}

function selectedAddressLine(page: Page): Locator {
  return walletTrigger(page).locator('xpath=ancestor::div[contains(@class,"relative")][1]/following-sibling::p[1]');
}

function walletMenu(page: Page): Locator {
  return walletTrigger(page).locator('xpath=following-sibling::div[1]');
}

function walletOption(page: Page, address: string): Locator {
  const escaped = address.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return walletMenu(page).getByRole('button', { name: new RegExp(`Polygon\\s+${escaped}`, 'i') });
}

async function assertReadable(locator: Locator): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) throw new Error('control has no bounding box');
  expect(box.width).toBeGreaterThan(8);
  expect(box.height).toBeGreaterThan(8);
  const viewport = locator.page().viewportSize();
  if (!viewport) throw new Error('viewport is not set');
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 8);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 8);
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const measured = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    measured.scrollWidth,
    `horizontal overflow: scrollWidth=${measured.scrollWidth} clientWidth=${measured.clientWidth}`,
  ).toBeLessThanOrEqual(measured.clientWidth + 8);
}

type Box = { x: number; y: number; width: number; height: number };

function unionBox(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}

function clampClip(box: Box, viewport: { width: number; height: number }): Box {
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const right = Math.min(viewport.width, Math.ceil(box.x + box.width));
  const bottom = Math.min(viewport.height, Math.ceil(box.y + box.height));
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

async function formClip(page: Page): Promise<Box> {
  const form = page.locator('form').first();
  await form.scrollIntoViewIfNeeded();
  const box = await form.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error('swap form has no clip');
  return clampClip(box, viewport);
}

async function shoot(page: Page, name: string, clip: Box): Promise<void> {
  await expect(page).toHaveScreenshot(name, {
    clip,
    animations: 'disabled',
    caret: 'hide',
    maxDiffPixels: 100,
  });
}

async function configureDscToDgc(
  page: Page,
  viewport: { width: number; height: number },
  wallets: { kind: 'static' } | { kind: 'two' },
): Promise<void> {
  await page.setViewportSize(viewport);
  const catalog = await installCatalogFlagRoute(page);
  await page.goto(`/swap?session=${encodeURIComponent(token)}&lang=en`);
  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 20000, message: 'session must stay on /swap' })
    .toMatch(/\/swap\/?$/);
  const opened = new URL(page.url());
  expect(opened.searchParams.get('asset-in')).toBeNull();
  expect(opened.searchParams.get('asset-out')).toBeNull();
  expect(opened.searchParams.get('blockchain')).toBeNull();

  await expect(page.getByText('You spend', { exact: true })).toBeVisible({ timeout: 20000 });
  await expect
    .poll(() => catalog.rewritten(), {
      timeout: 20000,
      message: 'local asset catalog must be fetched before DSC is selected',
    })
    .toBe(true);

  const sourceInput = page.locator('input[name="sourceAsset"]');
  await expect(sourceInput).toBeVisible({ timeout: 15000 });
  await sourceInput.click();
  const ethOption = page.getByRole('button', { name: /^ETH(\s|$)/ }).filter({ hasText: 'Ethereum' });
  await expect
    .poll(async () => ethOption.count(), {
      timeout: 15000,
      message: 'native ETH on Ethereum must be the only matching source option',
    })
    .toBe(1);
  await ethOption.click();
  await expect(sourceInput).toHaveValue('ETH');
  await expect(page.getByText('Sending on Ethereum', { exact: true })).toBeVisible();

  const spend = spendAmount(page);
  const received = targetAmount(page);
  await expect
    .poll(async () => spend.inputValue(), {
      timeout: 15000,
      message: 'selecting Ethereum ETH must initialize a spend amount before it is cleared',
    })
    .not.toBe('');
  await spend.click();
  await spend.fill('');
  await spend.blur();
  await expect.poll(async () => spend.inputValue(), { timeout: 8000 }).toBe('');

  await sourceInput.click();
  const dsc = page.getByRole('button', { name: /^DSC(\s|$)/ }).filter({ hasText: 'Polygon' });
  await expect
    .poll(async () => dsc.count(), {
      timeout: 10000,
      message: 'Polygon DSC must be the only matching source option',
    })
    .toBe(1);
  await dsc.click();
  await expect(sourceInput).toHaveValue('DSC');
  await expect(page.getByText('Sending on Polygon', { exact: true })).toBeVisible();

  const networkButton = page.getByRole('button', { name: 'Receiving network' });
  await expect(networkButton).toBeVisible({ timeout: 15000 });
  await networkButton.click();
  const polygon = page.getByRole('button', { name: 'Polygon', exact: true });
  await expect(polygon, 'Polygon must be offered as a receive network').toHaveCount(1);
  await polygon.scrollIntoViewIfNeeded();
  await expect(polygon).toBeVisible();
  await polygon.click();
  await expect(networkButton).toContainText('Polygon');

  const targetInput = page.locator('input[name="targetAsset"]');
  await expect(targetInput).toBeVisible();
  await targetInput.click();
  const dgc = page.getByRole('button', { name: /^DGC(\s|$)/ }).filter({ hasText: 'Polygon' });
  await expect
    .poll(async () => dgc.count(), { timeout: 10000, message: 'Polygon DGC must be the only matching target option' })
    .toBe(1);
  await dgc.click();
  await expect(targetInput).toHaveValue('DGC');
  await expect(networkButton).toContainText('Polygon');

  await expect
    .poll(async () => ({ spend: await spend.inputValue(), target: await received.inputValue() }), {
      timeout: 8000,
      message: 'cleared spend and empty target must stay empty',
    })
    .toEqual({ spend: '', target: '' });
  await expect(page.getByRole('heading', { name: 'Payment Information', exact: true })).toHaveCount(0);
  await expect(page.getByText('Nice! You are all set! Give us a minute to handle your transaction.')).toHaveCount(0);

  const wallet = wallets.kind === 'static' ? staticWalletLine(page) : selectedAddressLine(page);
  if (wallets.kind === 'static') {
    await expect(wallet).toBeVisible({ timeout: 15000 });
    const walletText = (await wallet.innerText()).replace(/\s+/g, ' ');
    expect(walletText).toContain('Polygon');
    expect(walletText).toContain('·');
    expect(walletText.toLowerCase()).toContain(accountAddress.toLowerCase());
    await expect(walletTrigger(page), 'one receiver must stay a static wallet line').toHaveCount(0);
  } else {
    const trigger = walletTrigger(page);
    await expect(trigger, 'two receivers must show the receiving wallet dropdown').toHaveCount(1, { timeout: 15000 });
    await expect(trigger).toContainText('Polygon');
    await expect(wallet).toBeVisible();
    expect((await wallet.innerText()).replace(/\s+/g, '').toLowerCase()).toBe(accountAddress.toLowerCase());
    await assertReadable(trigger);
  }
  await assertReadable(networkButton);
  await assertReadable(wallet);
  await assertReadable(page.getByText('Sending on Polygon', { exact: true }));
  await assertReadable(sourceInput);
  await assertReadable(targetInput);
  await assertNoHorizontalOverflow(page);
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  requireLoopbackApi();
  const auth = await getCachedAuth(request, 'evm');
  token = auth.token;
  accountAddress = auth.credentials.address;
  if (!token || !accountAddress) {
    throw new Error('local signature auth did not return a token and address');
  }
});

test('desktop shows DSC to DGC with the receive network chooser', async ({ page }) => {
  test.setTimeout(90000);
  await configureDscToDgc(page, { width: 1280, height: 1400 }, { kind: 'static' });
  await shoot(page, 'swap-network-desktop-configured.png', await formClip(page));

  const networkButton = page.getByRole('button', { name: 'Receiving network' });
  await networkButton.click();
  const polygon = page.getByRole('button', { name: 'Polygon', exact: true });
  await expect(polygon, 'open receive-network chooser must show Polygon').toHaveCount(1);
  await polygon.scrollIntoViewIfNeeded();
  await expect(polygon).toBeVisible();
  const formBox = await page.locator('form').first().boundingBox();
  const optionBox = await polygon.boundingBox();
  const viewport = page.viewportSize();
  if (!formBox || !optionBox || !viewport) throw new Error('open receive-network option has no clip');
  await shoot(page, 'swap-network-desktop-network-open.png', clampClip(unionBox(formBox, optionBox), viewport));
});

test('narrow mobile shows DSC to DGC', async ({ page }) => {
  test.setTimeout(90000);
  await configureDscToDgc(page, { width: 390, height: 1400 }, { kind: 'static' });
  await shoot(page, 'swap-network-mobile-configured.png', await formClip(page));
});

test('desktop shows DSC to DGC with the receiving wallet dropdown', async ({ page, request }) => {
  // Stay last. The fresh database has one receiver; linking a second address changes that account.
  test.setTimeout(120000);
  requireLoopbackApi();
  const linked = await authenticateLinkedAddress(request, token, 'evm-linked');
  const linkedAddress = linked.credentials.address;
  expect(linked.token.length).toBeGreaterThan(0);
  expect(linkedAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
  expect(linkedAddress.toLowerCase()).not.toBe(accountAddress.toLowerCase());

  await configureDscToDgc(page, { width: 1280, height: 1400 }, { kind: 'two' });

  const trigger = walletTrigger(page);
  await trigger.click();
  const menu = walletMenu(page);
  const options = menu.getByRole('button');
  const originalOption = walletOption(page, accountAddress);
  const linkedOption = walletOption(page, linkedAddress);
  await expect(options, 'receiving wallet menu must list exactly the two EVM receivers').toHaveCount(2);
  await expect(originalOption).toHaveCount(1);
  await expect(linkedOption).toHaveCount(1);
  await originalOption.scrollIntoViewIfNeeded();
  await linkedOption.scrollIntoViewIfNeeded();
  await expect(originalOption).toBeVisible();
  await expect(linkedOption).toBeVisible();
  await linkedOption.click();

  const networkButton = page.getByRole('button', { name: 'Receiving network' });
  await expect(networkButton).toContainText('Polygon');
  await expect(page.locator('input[name="sourceAsset"]')).toHaveValue('DSC');
  await expect(page.locator('input[name="targetAsset"]')).toHaveValue('DGC');
  await expect(page.getByText('Sending on Polygon', { exact: true })).toBeVisible();
  await expect(trigger).toContainText('Polygon');
  await expect(trigger).toContainText(new RegExp(linkedAddress, 'i'));
  const selected = selectedAddressLine(page);
  await expect
    .poll(async () => (await selected.innerText()).replace(/\s+/g, '').toLowerCase(), {
      timeout: 8000,
      message: 'the full linked receiver address must be the selected address line',
    })
    .toBe(linkedAddress.toLowerCase());
  expect(await selected.innerText()).not.toContain('Polygon');
  const spend = spendAmount(page);
  const received = targetAmount(page);
  await expect
    .poll(async () => ({ spend: await spend.inputValue(), target: await received.inputValue() }), {
      timeout: 8000,
      message: 'choosing the linked receiver must keep both amounts empty',
    })
    .toEqual({ spend: '', target: '' });
  await expect(page.getByRole('heading', { name: 'Payment Information', exact: true })).toHaveCount(0);
  await expect(page.getByText('Nice! You are all set! Give us a minute to handle your transaction.')).toHaveCount(0);
  await assertReadable(networkButton);
  await assertReadable(trigger);
  await assertReadable(selected);
  await assertReadable(page.getByText('Sending on Polygon', { exact: true }));
  await assertReadable(page.locator('input[name="sourceAsset"]'));
  await assertReadable(page.locator('input[name="targetAsset"]'));
  await assertNoHorizontalOverflow(page);
  await shoot(page, 'swap-network-desktop-multiple-configured.png', await formClip(page));

  await trigger.click();
  await expect(options, 'reopened receiving wallet menu must still list exactly two receivers').toHaveCount(2);
  await expect(originalOption).toHaveCount(1);
  await expect(linkedOption).toHaveCount(1);
  await originalOption.scrollIntoViewIfNeeded();
  await linkedOption.scrollIntoViewIfNeeded();
  await expect(originalOption).toBeVisible();
  await expect(linkedOption).toBeVisible();
  const formBox = await page.locator('form').first().boundingBox();
  const menuBox = await menu.boundingBox();
  const viewport = page.viewportSize();
  if (!formBox || !menuBox || !viewport) throw new Error('open receiving-wallet menu has no clip');
  await shoot(
    page,
    'swap-network-desktop-multiple-wallet-open.png',
    clampClip(unionBox(formBox, menuBox), viewport),
  );
});
