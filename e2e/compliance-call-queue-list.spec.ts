import { expect, Page, Route, test } from '@playwright/test';

const USER_DATA_ID = 2001;
const QUEUE = 'UnavailableSuspicious';

const TABLE_HEADERS = [
  'User',
  'Phone',
  'Lang',
  'KYC',
  'Transaction',
  'Country',
  'Status',
  'Marked',
  'Deadline',
  'Date',
] as const;

const itemsByQueue: Record<string, object[]> = {
  ManualCheckPhone: [
    {
      userDataId: 2001,
      userName: 'Test Customer',
      phone: '+41791234567',
      language: 'DE',
      kycLevel: 30,
      sourceType: 'BuyCrypto',
      txId: 101,
      inputAmount: 500,
      inputAsset: 'EUR',
      phoneCallTimes: 'H9To10;H10To11',
      date: '2026-07-31T08:30:00.000Z',
    },
  ],
  ManualCheckIpCountryPhone: [
    {
      userDataId: 2001,
      userName: 'Test Customer',
      phone: '+41791234567',
      language: 'DE',
      kycLevel: 30,
      sourceType: 'BuyCrypto',
      txId: 101,
      inputAmount: 500,
      inputAsset: 'EUR',
      phoneCallTimes: 'H9To10;H10To11',
      date: '2026-07-31T08:30:00.000Z',
      ip: '10.0.0.1',
      country: 'Switzerland',
      ipCountry: 'Germany',
    },
  ],
  UnavailableSuspicious: [
    {
      userDataId: 2001,
      userName: 'Test Customer',
      phone: '+41791234567',
      language: 'DE',
      kycLevel: 30,
      country: 'Switzerland',
      phoneCallStatus: 'Suspicious',
      phoneCallTimes: 'H9To10;H10To11',
      date: '2026-07-31T08:30:00.000Z',
    },
  ],
};

type CallbackQueueItem = {
  userDataId: number;
  userName: string;
  phone: string;
  language: string;
  kycLevel: number;
  txId: number;
  sourceType: string;
  inputAmount: number;
  inputAsset: string;
  amlCheck: string;
  country: string;
  phoneCallStatus: string;
  phoneCallStatusDate: string;
  date: string;
};

function queueItem(date: string, phoneCallStatusDate: string): CallbackQueueItem {
  return {
    userDataId: USER_DATA_ID,
    userName: 'Fixture User',
    phone: '+41790000000',
    language: 'DE',
    kycLevel: 50,
    txId: 101,
    sourceType: 'BuyCrypto',
    inputAmount: 100,
    inputAsset: 'CHF',
    amlCheck: 'Pending',
    country: 'Switzerland',
    phoneCallStatus: 'Unavailable',
    phoneCallStatusDate,
    date,
  };
}

function jwt(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    account: 9001,
    user: 9001,
    role: 'Compliance',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.synthetic`;
}

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installSyntheticApi(
  page: Page,
  callbackItem?: CallbackQueueItem,
): Promise<{ unexpectedRequests: string[] }> {
  const unexpectedRequests: string[] = [];

  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;

    if (
      method === 'GET' &&
      ['/v1/language', '/v1/fiat', '/v1/asset', '/v1/bankAccount', '/v1/country'].includes(pathname)
    ) {
      await fulfillJson(route, []);
      return;
    }

    if (method === 'GET' && pathname === '/v1/setting/infoBanner') {
      await fulfillJson(route, null);
      return;
    }

    const itemsMatch = pathname.match(/^\/v1\/support\/call-queues\/([^/]+)\/items$/);
    if (method === 'GET' && itemsMatch) {
      if (callbackItem && itemsMatch[1] === 'UnavailableSuspicious') {
        await fulfillJson(route, [callbackItem]);
        return;
      }
      const items = itemsByQueue[itemsMatch[1]];
      if (items) {
        await fulfillJson(route, items);
        return;
      }
    }

    unexpectedRequests.push(`${method} ${pathname}`);
    await route.fulfill({
      status: 501,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Unexpected test request' }),
    });
  });

  await page.route('**/v2/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;

    if (method === 'GET' && pathname === '/v2/user') {
      await fulfillJson(route, {
        id: 9001,
        activeAddress: { address: '0x0000000000000000000000000000000000000001' },
        addresses: [],
        kyc: { level: 50, status: 'Completed' },
        language: { id: 1, name: 'German', symbol: 'DE' },
      });
      return;
    }

    unexpectedRequests.push(`${method} ${pathname}`);
    await route.fulfill({
      status: 501,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Unexpected test request' }),
    });
  });

  return { unexpectedRequests };
}

async function expectVisibleCallbackList(
  page: Page,
  dates: { marked: string; deadline: string; date: string },
  deadlineIsPast: boolean,
): Promise<void> {
  await expect(page.getByText('Callback', { exact: true })).toBeVisible();

  for (const header of TABLE_HEADERS) {
    await expect(page.getByRole('columnheader', { name: header, exact: true })).toBeVisible();
  }

  await expect(page.getByText(dates.date, { exact: true })).toBeVisible();
  await expect(page.getByText(dates.marked, { exact: true })).toBeVisible();
  await expect(page.getByText('Unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText('Switzerland', { exact: true })).toBeVisible();
  await expect(page.getByText('BuyCrypto #101 (100 CHF) · Pending', { exact: true })).toBeVisible();

  const deadlineCell = page.getByText(dates.deadline, { exact: true });
  await expect(deadlineCell).toBeVisible();
  if (deadlineIsPast) {
    await expect(deadlineCell).toHaveClass(/text-dfxRed-100/);
  } else {
    await expect(deadlineCell).not.toHaveClass(/text-dfxRed-100/);
  }
}

test.describe('Call-queue list', () => {
  test.use({ timezoneId: 'Europe/Zurich', viewport: { width: 1280, height: 900 } });

  test('ManualCheckPhone shows Phone Call Times without IP or Country', async ({ page }) => {
    const { unexpectedRequests } = await installSyntheticApi(page);

    await page.goto(`/compliance/call-queues/ManualCheckPhone?session=${jwt()}`);

    await expect(page.getByRole('columnheader', { name: 'Date', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Phone Call Times', exact: true })).toBeVisible();

    await expect(page.locator('table')).toHaveScreenshot('compliance-call-queue-list-manual-check-phone.png', {
      maxDiffPixels: 5000,
    });

    expect(unexpectedRequests).toEqual([]);
  });

  test('ManualCheckIpCountryPhone shows Phone Call Times with IP and Country', async ({ page }) => {
    const { unexpectedRequests } = await installSyntheticApi(page);

    await page.goto(`/compliance/call-queues/ManualCheckIpCountryPhone?session=${jwt()}`);

    await expect(page.getByRole('columnheader', { name: 'Date', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Phone Call Times', exact: true })).toBeVisible();

    await expect(page.locator('table')).toHaveScreenshot('compliance-call-queue-list-ip-country-phone.png', {
      maxDiffPixels: 5000,
    });

    expect(unexpectedRequests).toEqual([]);
  });

  test('UnavailableSuspicious hides Phone Call Times even when the item has a value', async ({ page }) => {
    const { unexpectedRequests } = await installSyntheticApi(page);

    await page.goto(`/compliance/call-queues/UnavailableSuspicious?session=${jwt()}`);

    await expect(page.getByRole('columnheader', { name: 'Date', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Phone Call Times', exact: true })).not.toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Status', exact: true })).toBeVisible();

    await expect(page.locator('table')).toHaveScreenshot('compliance-call-queue-list-unavailable-suspicious.png', {
      maxDiffPixels: 5000,
    });

    expect(unexpectedRequests).toEqual([]);
  });
});

test.describe('Call-queue callback list', () => {
  // Fixture timestamps are UTC; the screen formats them in the browser locale without an
  // explicit timeZone, so pin Zurich like the other fullPage compliance screenshots.
  test.use({ timezoneId: 'Europe/Zurich', viewport: { width: 1600, height: 900 } });

  test('shows a pending callback with the mark date and a future deadline', async ({ page }) => {
    const item = queueItem('2099-01-01T12:00:00.000Z', '2099-01-02T12:00:00.000Z');
    const { unexpectedRequests } = await installSyntheticApi(page, item);

    await page.goto(`/compliance/call-queues/${QUEUE}?session=${jwt()}`);

    await expectVisibleCallbackList(page, { date: '01.01.2099', marked: '02.01.2099', deadline: '15.01.2099' }, false);
    await expect(page.locator('table')).toHaveScreenshot('future-deadline.png', { maxDiffPixels: 5000 });

    expect(unexpectedRequests).toEqual([]);
  });

  test('shows a passed callback deadline in red', async ({ page }) => {
    const item = queueItem('2020-01-01T12:00:00.000Z', '2020-01-02T12:00:00.000Z');
    const { unexpectedRequests } = await installSyntheticApi(page, item);

    await page.goto(`/compliance/call-queues/${QUEUE}?session=${jwt()}`);

    await expectVisibleCallbackList(page, { date: '01.01.2020', marked: '02.01.2020', deadline: '15.01.2020' }, true);
    await expect(page.locator('table')).toHaveScreenshot('past-deadline.png', { maxDiffPixels: 5000 });

    expect(unexpectedRequests).toEqual([]);
  });
});
