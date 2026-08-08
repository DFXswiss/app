import { expect, Page, Route, test } from '@playwright/test';

/**
 * E2E Visual Regression Tests: Support issue screen (staff)
 *
 * Route: /support/dashboard/issue/:id — the ticket a clerk works on: detail panels, update controls,
 * the message thread, the composer, and the reply suggestion offered above it.
 *
 * Everything is MOCKED: the session token is synthetic (the frontend only decodes a JWT, it never
 * verifies it) and every API call is answered from fixtures via page.route(...). The baselines are
 * therefore deterministic, carry no production data, and — unlike the older staff specs — need no
 * running api and no `npm run setup`.
 *
 * The three variants are the states the suggestion panel can be in, because that is what the change
 * this spec was added for introduces:
 *   01 — a suggestion waiting for a decision
 *   02 — a suggestion the conversation has moved past (stale warning)
 *   03 — no suggestion, i.e. the screen as it looked before
 */

const ISSUE_ID = 7101;
const ISSUE_UID = 'S-7101-UID';
const CUSTOMER_AUTHOR = 'Customer';

/** A synthetic staff session: decoded by the frontend, never verified. */
function staffToken(): string {
  const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
  return [
    encode({ alg: 'HS256', typ: 'JWT' }),
    encode({
      address: '0x0000000000000000000000000000000000000001',
      user: 1,
      account: 1,
      role: 'Admin',
      blockchains: ['Ethereum'],
      exp: 4102444800, // 2100-01-01
    }),
    'synthetic',
  ].join('.');
}

const ISSUE_DATA = {
  id: ISSUE_ID,
  created: '2024-01-03T09:00:00.000Z',
  uid: ISSUE_UID,
  type: 'TransactionIssue',
  department: 'Support',
  reason: 'FundsNotReceived',
  state: 'Pending',
  name: 'Alice Muster',
  clerk: 'Alex',
  account: {
    id: 7200,
    status: 'Active',
    verifiedName: 'Alice Muster',
    completeName: 'Alice Muster',
    accountType: 'Personal',
    kycLevel: '30',
    depositLimit: 100000,
    annualVolume: 12000,
    kycHash: 'a1b2c3d4',
    country: { name: 'Switzerland' },
    language: { name: 'German', symbol: 'DE' },
  },
  transaction: {
    id: 7301,
    sourceType: 'BankTx',
    type: 'BuyCrypto',
    amlCheck: 'Pass',
    inputAmount: 500,
    inputAsset: 'EUR',
    outputAmount: 0.0071,
    outputAsset: 'BTC',
    isComplete: false,
  },
};

const MESSAGES = [
  {
    id: 501,
    author: CUSTOMER_AUTHOR,
    message: 'I sent 500 EUR three days ago and the transfer has not arrived.',
    created: '2024-01-03T09:05:00.000Z',
  },
  {
    id: 502,
    author: 'Alex',
    message: 'Thanks for reaching out — could you send us the reference of the transfer?',
    created: '2024-01-03T10:00:00.000Z',
  },
  {
    id: 503,
    author: CUSTOMER_AUTHOR,
    message: 'The reference is TX-12345.',
    created: '2024-01-03T12:00:00.000Z',
  },
];

const SUGGESTION = {
  id: 901,
  text: 'Thank you, we found the transfer under TX-12345. It is booked and the payout is on its way — you should see it within the next banking day.',
  state: 'Pending',
  messageId: 503,
  isStale: false,
  created: '2024-01-03T12:05:00.000Z',
};

const CLERKS = ['Alex', 'Robin'];

const DATA_RE = /\/v1\/support\/issue\/\d+\/data(?:\?|$)/;
const SUGGESTION_RE = /\/v1\/support\/issue\/\d+\/suggestion(?:\?|$)/;
const CLERKS_RE = /\/v1\/support\/issue\/clerks(?:\?|$)/;
const CLERK_RE = /\/v1\/support\/issue\/clerk(?:\?|$)/;
const THREAD_RE = /\/v1\/support\/issue\/S-[\w-]+(?:\?|$)/;

async function json(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

// The reference lists the app shell loads at startup. They are answered with arrays because the
// contexts holding them filter and sort what they get — an empty object crashes the shell before
// the screen renders.
const LIST_RE = /\/v1\/(language|country|asset|fiat|bank|blockchain)(?:\/|\?|$)/;

const LANGUAGES = [{ id: 1, symbol: 'DE', name: 'German', foreignName: 'Deutsch', enable: true }];

// The user context reads `addresses` as an array, so the staff user has to carry one.
const USER = {
  accountType: 'Personal',
  mail: 'staff@example.com',
  addresses: [],
  kyc: { level: 100 },
  tradingLimit: { limit: 0, period: 'Day' },
  currency: { id: 1, name: 'EUR', symbol: '€' },
  language: LANGUAGES[0],
};

/**
 * Answers every API call the screen and the app shell make. Anything not named here gets an empty
 * object, which is enough for the endpoints the shell only reads single values from.
 */
async function installRoutes(page: Page, suggestion: unknown): Promise<void> {
  await page.route('**/v1/**', async (route: Route) => {
    const url = route.request().url();

    if (SUGGESTION_RE.test(url)) return json(route, { suggestion });
    if (DATA_RE.test(url)) return json(route, ISSUE_DATA);
    if (CLERKS_RE.test(url)) return json(route, CLERKS);
    if (CLERK_RE.test(url)) return json(route, { clerk: 'Alex' });
    if (THREAD_RE.test(url)) return json(route, { ...ISSUE_DATA, messages: MESSAGES });
    if (/\/v1\/language(?:\/|\?|$)/.test(url)) return json(route, LANGUAGES);
    if (LIST_RE.test(url)) return json(route, []);
    if (/\/v1\/user(?:\/|\?|$)/.test(url)) return json(route, USER);

    return json(route, {});
  });

  await page.route('**/v2/**', async (route: Route) => {
    const url = route.request().url();
    if (/\/v2\/user(?:\/|\?|$)/.test(url)) return json(route, USER);
    return json(route, {});
  });
}

async function openIssue(page: Page, suggestion: unknown): Promise<void> {
  await installRoutes(page, suggestion);

  await page.goto(`/support/dashboard/issue/${ISSUE_ID}?session=${staffToken()}`);
  await page.waitForLoadState('networkidle');

  await expect(page.getByText('Issue Details')).toBeVisible();
  await expect(page.getByText(ISSUE_UID)).toBeVisible();
  await expect(page.getByText('The reference is TX-12345.')).toBeVisible();
}

test.describe('Support issue screen - Visual Regression Tests', () => {
  // The app fills the viewport and scrolls inside its own containers, so `fullPage` captures exactly
  // the viewport. A tall one is what puts the whole ticket — panels, thread, suggestion, composer —
  // into a single baseline.
  test.use({ viewport: { width: 1440, height: 2000 } });

  test('offers a reply suggestion above the composer', async ({ page }) => {
    await openIssue(page, SUGGESTION);

    await expect(page.getByText('Suggested reply')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Discard' })).toBeVisible();

    await expect(page).toHaveScreenshot('support-issue-01-suggestion.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });

  test('marks a suggestion the conversation has moved past', async ({ page }) => {
    await openIssue(page, { ...SUGGESTION, messageId: 501, isStale: true });

    await expect(page.getByText(/Written before the newest message/)).toBeVisible();

    await expect(page).toHaveScreenshot('support-issue-02-suggestion-stale.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });

  test('shows the ticket without a suggestion', async ({ page }) => {
    await openIssue(page, null);

    await expect(page.getByText('Suggested reply')).toHaveCount(0);

    await expect(page).toHaveScreenshot('support-issue-03-no-suggestion.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });
});
