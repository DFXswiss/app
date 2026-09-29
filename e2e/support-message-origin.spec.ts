import { test, expect, Page, Route } from '@playwright/test';

/**
 * Visual regression: staff ticket thread tags a customer message as E-Mail or In-App.
 *
 * Route: /support/dashboard/issue/:id
 * The session is a locally built JWT. The client only checks its shape and the account id,
 * and every API response is mocked, so the baseline does not depend on a running API.
 */

const ISSUE_ID = 7203;
const ISSUE_UID = 'SI-7203-UID';

function b64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function staffSession(): string {
  const header = b64url({ alg: 'none', typ: 'JWT' });
  // Role is required: the staff route redirects any session outside Admin, Compliance, Support, Marketing.
  const payload = b64url({ account: 8001, exp: 2000000000, role: 'Admin' });
  return `${header}.${payload}.xx`;
}

const ENGLISH = {
  id: 1,
  name: 'English',
  foreignName: 'English',
  symbol: 'EN',
  enable: true,
};

// addresses, language and kyc are read as `user?.field.member`. A present user with a missing
// field throws during boot, before the ticket screen mounts.
const STAFF_USER = {
  accountId: 8001,
  mail: 'rita@example.com',
  addresses: [],
  language: ENGLISH,
  kyc: { level: 50 },
};

const ISSUE_DATA = {
  id: ISSUE_ID,
  created: '2024-01-01T09:00:00.000Z',
  uid: ISSUE_UID,
  type: 'GenericIssue',
  department: 'Support',
  reason: 'Other',
  state: 'Pending',
  name: 'Alice Muster',
  clerk: 'Rita Clerk',
  account: {
    id: 8001,
    status: 'Active',
    verifiedName: 'Alice Muster',
    completeName: 'Alice Muster',
    accountType: 'Personal',
    kycLevel: '50',
    depositLimit: 100000,
    annualVolume: 25000,
    kycHash: 'a1b2c3d4e5',
    country: { name: 'Switzerland' },
    language: { name: 'English', symbol: 'EN' },
  },
};

const MESSAGES = {
  messages: [
    {
      id: 701,
      author: 'Customer',
      origin: 'Email',
      message: 'The transfer has not arrived.',
      created: '2024-01-01T09:05:00.000Z',
    },
    {
      id: 702,
      author: 'Customer',
      origin: 'InApp',
      message: 'I sent this from the app.',
      created: '2024-01-01T09:10:00.000Z',
    },
    {
      id: 703,
      author: 'Customer',
      message: 'A follow-up without an origin.',
      created: '2024-01-01T09:15:00.000Z',
    },
    {
      id: 704,
      author: 'Rita Clerk',
      origin: 'Email',
      message: 'We are checking the payment.',
      created: '2024-01-01T09:20:00.000Z',
    },
  ],
};

const DATA_RE = /\/v1\/support\/issue\/\d+\/data(?:\?|$)/;
const MESSAGES_RE = /\/v1\/support\/issue\/SI-7203-UID(?:\?|$)/;
const CLERKS_RE = /\/v1\/support\/issue\/clerks(?:\?|$)/;
const CLERK_RE = /\/v1\/support\/issue\/clerk(?:\?|$)/;
const ACTIVITY_RE = /\/v1\/support\/issue\/activity(?:\?|$)/;

async function json(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installIssueRoutes(page: Page): Promise<void> {
  await page.route('**/v1/**', async (route: Route) => {
    const url = route.request().url();
    if (DATA_RE.test(url)) return json(route, ISSUE_DATA);
    if (MESSAGES_RE.test(url)) return json(route, MESSAGES);
    if (CLERKS_RE.test(url)) return json(route, ['Rita Clerk', 'Tom Support']);
    if (CLERK_RE.test(url)) return json(route, { clerk: 'Rita Clerk' });
    if (ACTIVITY_RE.test(url)) return json(route, { count: 0 });
    if (url.includes('/language')) return json(route, [ENGLISH]);
    if (url.includes('infoBanner')) return json(route, null);
    if (url.includes('/asset') || url.includes('/country') || url.includes('/fiat') || url.includes('/bankAccount')) {
      return json(route, []);
    }
    await json(route, {});
  });
  await page.route('**/v2/**', async (route: Route) => {
    await json(route, STAFF_USER);
  });
}

test.describe('Staff ticket — message origin tag', () => {
  test.use({ timezoneId: 'Europe/Zurich', locale: 'en-US' });

  test('thread tags customer mail and in-app messages and leaves the staff reply untagged', async ({ page }) => {
    await installIssueRoutes(page);
    await page.setViewportSize({ width: 1280, height: 1400 });
    await page.goto(`/support/dashboard/issue/${ISSUE_ID}?session=${staffSession()}`);
    await expect(page.getByText('E-Mail', { exact: true })).toHaveCount(1);
    await expect(page.getByText('In-App', { exact: true })).toHaveCount(1);
    await expect(page.getByText('A follow-up without an origin.')).toBeVisible();
    await expect(page.getByText('We are checking the payment.')).toBeVisible();

    const messagesPanel = page.locator('div.bg-white.rounded-lg.shadow-sm.p-4').filter({
      has: page.getByRole('heading', { name: /Messages/ }),
    });
    await expect(messagesPanel).toHaveScreenshot('support-message-origin-01-tags.png', {
      animations: 'disabled',
      maxDiffPixels: 5000,
    });
  });
});
