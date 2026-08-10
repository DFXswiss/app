import { expect, Page, Route, test } from '@playwright/test';

/**
 * E2E Visual Regression: Assign unassigned bank transfer
 *
 * Covers the TransactionList assign form: collapsed list, single-target
 * preselection (submit enabled), and multi-target without preselection
 * (submit disabled).
 *
 * Auth is fully mocked (client-side JWT decode, no backend call); all
 * `/v1/**` and `/v2/**` calls are intercepted via page.route(...).
 */

const UNASSIGNED_TX = {
  id: 1,
  uid: 'assign-tx-uid-1',
  date: '2026-01-15T00:00:00.000Z',
  type: 'Buy',
  state: 'Unassigned',
  inputAsset: 'EUR',
  inputAmount: 250,
  outputAsset: 'BTC',
  outputAmount: 0.004,
};

const SINGLE_TARGET = {
  id: 501,
  address: 'bc1q-synthetic-target-address',
  bankUsage: 'REF-SYN-0501',
  asset: { name: 'BTC', blockchain: 'Bitcoin' },
};

const MULTI_TARGETS = [
  {
    id: 501,
    address: 'bc1q-synthetic-target-address',
    bankUsage: 'REF-SYN-0501',
    asset: { name: 'BTC', blockchain: 'Bitcoin' },
  },
  {
    id: 502,
    address: 'bc1q-synthetic-second-address',
    bankUsage: 'REF-SYN-0502',
    asset: { name: 'ETH', blockchain: 'Ethereum' },
  },
];

type TransactionTarget = {
  id: number;
  address: string;
  bankUsage: string;
  asset: { name: string; blockchain: string };
};

function jwt(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    account: 1,
    user: 1,
    role: 'User',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.synthetic`;
}

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function installSyntheticApi(
  page: Page,
  targets: TransactionTarget[],
): Promise<{ unexpectedRequests: string[] }> {
  const unexpectedRequests: string[] = [];

  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (
      request.method() === 'GET' &&
      ['/v1/language', '/v1/fiat', '/v1/asset', '/v1/bankAccount', '/v1/country'].includes(
        path,
      )
    ) {
      await fulfillJson(route, []);
      return;
    }

    if (request.method() === 'GET' && path === '/v1/setting/infoBanner') {
      await fulfillJson(route, null);
      return;
    }

    if (request.method() === 'GET' && path === '/v1/transaction/detail') {
      await fulfillJson(route, []);
      return;
    }

    if (request.method() === 'GET' && path === '/v1/transaction/unassigned') {
      await fulfillJson(route, [UNASSIGNED_TX]);
      return;
    }

    if (request.method() === 'GET' && path === '/v1/transaction/target') {
      await fulfillJson(route, targets);
      return;
    }

    if (request.method() === 'PUT' && /^\/v1\/transaction\/\d+\/target$/.test(path)) {
      await fulfillJson(route, null);
      return;
    }

    unexpectedRequests.push(`${request.method()} ${path}`);
    await route.fulfill({
      status: 501,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Unexpected test request' }),
    });
  });

  await page.route('**/v2/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (request.method() === 'GET' && path === '/v2/user') {
      await fulfillJson(route, {
        id: 1,
        activeAddress: {
          address: '0x0000000000000000000000000000000000000001',
          wallet: 'DFX',
        },
        addresses: [],
        kyc: { level: 50, status: 'Completed' },
        language: { id: 1, name: 'German', symbol: 'DE' },
      });
      return;
    }

    unexpectedRequests.push(`${request.method()} ${path}`);
    await route.fulfill({
      status: 501,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Unexpected test request' }),
    });
  });

  return { unexpectedRequests };
}

async function openAssignForm(page: Page): Promise<void> {
  await page.getByText('Unassigned').click();
  await page.getByRole('button', { name: 'Assign transaction' }).click();
  await expect(page.getByText('Remittance info')).toBeVisible();
}

test.describe('Assign unassigned bank transfer', () => {
  test('list collapsed with one unassigned transaction', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const { unexpectedRequests } = await installSyntheticApi(page, []);

    await page.goto(`/tx?session=${jwt()}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await expect(page.getByText('Your Transactions')).toBeVisible();
    await expect(page.getByText('Unassigned')).toBeVisible();

    await expect(page).toHaveScreenshot('assign-tx-01-list-collapsed.png', {
      fullPage: true,
    });

    expect(unexpectedRequests).toEqual([]);
  });

  test('single target preselected and submit enabled', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const { unexpectedRequests } = await installSyntheticApi(page, [SINGLE_TARGET]);

    await page.goto(`/tx?session=${jwt()}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await expect(page.getByText('Your Transactions')).toBeVisible();
    await openAssignForm(page);

    await expect(page.getByText('REF-SYN-0501')).toBeVisible();
    await expect(page.getByText('Select...')).toHaveCount(0);

    const submit = page.locator('button[type="submit"]', {
      hasText: 'Assign transaction',
    });
    await expect(submit).toBeEnabled();

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot(
      'assign-tx-02-single-target-preselected.png',
      { fullPage: true },
    );

    expect(unexpectedRequests).toEqual([]);
  });

  test('multiple targets none preselected and submit disabled', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const { unexpectedRequests } = await installSyntheticApi(page, MULTI_TARGETS);

    await page.goto(`/tx?session=${jwt()}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await expect(page.getByText('Your Transactions')).toBeVisible();
    await openAssignForm(page);

    await expect(page.getByText('Select...')).toBeVisible();

    const submit = page.locator('button[type="submit"]', {
      hasText: 'Assign transaction',
    });
    await expect(submit).toBeDisabled();

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot(
      'assign-tx-03-multiple-targets-none-preselected.png',
      { fullPage: true },
    );

    expect(unexpectedRequests).toEqual([]);
  });
});
