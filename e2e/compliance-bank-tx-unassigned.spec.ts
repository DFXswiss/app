import { expect, Page, Route, test } from '@playwright/test';

type UnassignedBankTxFixture = {
  id: number;
  transactionId?: number;
  accountServiceRef: string;
  bookingDate?: string;
  amount: number;
  currency: string;
  creditDebitIndicator?: 'CRDT' | 'DBIT';
  type: string;
  name?: string;
  iban?: string;
  remittanceInfo?: string;
  endToEndId?: string;
  buyCandidateId?: number;
};

const UNASSIGNED_ROW_CREDIT_WITH_CANDIDATE: UnassignedBankTxFixture = {
  id: 501,
  accountServiceRef: 'ASR-SYN-000501',
  bookingDate: '2026-01-15T00:00:00.000Z',
  endToEndId: 'E2E-SYN-000501',
  amount: 250.5,
  currency: 'EUR',
  creditDebitIndicator: 'CRDT',
  name: 'Anna Gutschrift',
  iban: 'CH9300762011623852957',
  remittanceInfo: 'Invoice 2026-0501',
  type: 'Unknown',
  buyCandidateId: 777,
};

const UNASSIGNED_ROW_DEBIT: UnassignedBankTxFixture = {
  id: 502,
  accountServiceRef: 'ASR-SYN-000502',
  bookingDate: '2026-01-16T00:00:00.000Z',
  endToEndId: 'E2E-SYN-000502',
  amount: 100,
  currency: 'CHF',
  creditDebitIndicator: 'DBIT',
  name: 'Bruno Lastschrift',
  iban: 'CH5604835012345678009',
  remittanceInfo: 'Refund request 0502',
  type: 'Unknown',
};

const UNASSIGNED_ROW_MISSING_OPTIONALS: UnassignedBankTxFixture = {
  id: 503,
  accountServiceRef: 'ASR-SYN-000503',
  endToEndId: 'E2E-SYN-000503',
  amount: 42,
  currency: 'EUR',
  creditDebitIndicator: 'CRDT',
  type: 'Unknown',
};

function jwt(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    account: 1,
    user: 1,
    role: 'Admin',
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

    if (request.method() === 'GET' && path === '/v1/bankTx/unassigned') {
      await fulfillJson(route, [
        UNASSIGNED_ROW_CREDIT_WITH_CANDIDATE,
        UNASSIGNED_ROW_DEBIT,
        UNASSIGNED_ROW_MISSING_OPTIONALS,
      ]);
      return;
    }

    if (request.method() === 'PUT' && /^\/v1\/bankTx\/\d+$/.test(path)) {
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

test.describe('Compliance: unassigned bank transactions', () => {
  // formatSwissDate has no timeZone option; fixture dates are absolute UTC.
  test.use({ timezoneId: 'Europe/Zurich' });

  test('renders the unassigned list with the debit row highlighted', async ({ page }) => {
    await page.setViewportSize({ width: 2000, height: 1000 });
    const { unexpectedRequests } = await installSyntheticApi(page);

    await page.goto(`/compliance/bank-tx/unassigned?session=${jwt()}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Anna Gutschrift')).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();

    await expect(page).toHaveScreenshot('compliance-bank-tx-unassigned-01-list.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });

    expect(unexpectedRequests).toEqual([]);
  });

  test('renders the assign form expanded for an admin', async ({ page }) => {
    await page.setViewportSize({ width: 2000, height: 1000 });
    const { unexpectedRequests } = await installSyntheticApi(page);

    await page.goto(`/compliance/bank-tx/unassigned?session=${jwt()}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Assign' }).first().click();
    await expect(page.getByText('Buy ID')).toBeVisible();
    await expect(page.getByText('Select...')).toBeVisible();

    await expect(page).toHaveScreenshot(
      'compliance-bank-tx-unassigned-02-assign-form.png',
      {
        fullPage: true,
        maxDiffPixels: 5000,
      },
    );

    expect(unexpectedRequests).toEqual([]);
  });
});
