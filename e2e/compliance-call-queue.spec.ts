import { expect, Page, Route, test } from '@playwright/test';

const STAFF_ACCOUNT = 9001;
const PHONE_CALL_TIMES = 'H9To10;H10To11';

function queueItems(queue: string) {
  return [
    {
      queue,
      userDataId: 2001,
      userName: 'Test Customer',
      phone: '+41791234567',
      language: 'DE',
      country: 'Switzerland',
      kycLevel: 30,
      txId: 101,
      sourceType: 'BuyCrypto',
      amlCheck: 'Pending',
      amlReason: queue,
      inputAmount: 500,
      inputAsset: 'EUR',
      ip: '10.0.0.1',
      ipCountry: 'Germany',
      phoneCallTimes: PHONE_CALL_TIMES,
      date: '2026-07-31T08:30:00.000Z',
    },
    {
      queue,
      userDataId: 2002,
      userName: 'Second Customer',
      phone: '+41791234568',
      language: 'FR',
      country: 'Switzerland',
      kycLevel: 50,
      txId: 102,
      sourceType: 'BuyFiat',
      amlCheck: 'Pending',
      amlReason: queue,
      inputAmount: 0.01,
      inputAsset: 'BTC',
      ip: '10.0.0.2',
      ipCountry: 'Switzerland',
      date: '2026-07-31T09:00:00.000Z',
    },
  ];
}

function jwt(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    account: STAFF_ACCOUNT,
    user: STAFF_ACCOUNT,
    role: 'Compliance',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.synthetic`;
}

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installSyntheticApi(page: Page): Promise<{ unexpectedRequests: string[] }> {
  const unexpectedRequests: string[] = [];

  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    const queueMatch = request.method() === 'GET' && /^\/v1\/support\/call-queues\/([^/]+)\/items$/.exec(path);
    if (queueMatch) {
      await fulfillJson(route, queueItems(decodeURIComponent(queueMatch[1])));
      return;
    }

    if (
      request.method() === 'GET' &&
      ['/v1/language', '/v1/fiat', '/v1/asset', '/v1/bankAccount', '/v1/country'].includes(path)
    ) {
      await fulfillJson(route, []);
      return;
    }

    if (request.method() === 'GET' && path === '/v1/setting/infoBanner') {
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
        id: STAFF_ACCOUNT,
        activeAddress: { address: '0x0000000000000000000000000000000000000001' },
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

test.describe('Call-queue list Phone Call Times column', () => {
  // Fixture timestamps are UTC; the screen formats them in the browser locale without an
  // explicit timeZone, so pin Zurich like the other fullPage compliance screenshots.
  test.use({ timezoneId: 'Europe/Zurich' });

  test('shows the column with the raw value and a dash in the phone queue', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const { unexpectedRequests } = await installSyntheticApi(page);

    await page.goto(`/compliance/call-queues/ManualCheckPhone?session=${jwt()}`);

    const table = page.getByRole('table');
    await expect(table.getByRole('columnheader', { name: 'Phone Call Times', exact: true })).toBeVisible();
    await expect(table.getByText(PHONE_CALL_TIMES, { exact: true })).toBeVisible();
    const secondRow = table.locator('tbody tr').nth(1);
    await expect(secondRow.locator('td').nth(5)).toHaveText('-');

    await expect(table).toHaveScreenshot('compliance-call-queue-01-phone-queue.png', { maxDiffPixels: 5000 });

    expect(unexpectedRequests).toEqual([]);
  });

  test('hides the column in the IP phone queue', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const { unexpectedRequests } = await installSyntheticApi(page);

    await page.goto(`/compliance/call-queues/ManualCheckIpPhone?session=${jwt()}`);

    const table = page.getByRole('table');
    await expect(table.getByRole('columnheader', { name: 'IP', exact: true })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Phone Call Times', exact: true })).toHaveCount(0);
    await expect(table.getByText(PHONE_CALL_TIMES, { exact: true })).toHaveCount(0);

    await expect(table).toHaveScreenshot('compliance-call-queue-02-ip-phone-queue.png', { maxDiffPixels: 5000 });

    expect(unexpectedRequests).toEqual([]);
  });
});
