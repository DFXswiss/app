import { test, expect, Page, Route } from '@playwright/test';
import { getCachedAuth } from './helpers/auth-cache';

/**
 * E2E Visual Regression Tests: customer support chat
 *
 * Route:
 *   - /support/chat/:id  (customer chat; file src/screens/chat.screen.tsx)
 *
 * Auth is REAL customer auth via getCachedAuth (same pattern as e2e/user-flows.spec.ts and
 * e2e/support-issue-receiver-iban.spec.ts): the api must be reachable for the session token.
 *
 * Feature data is MOCKED with synthetic fixtures via page.route(...), so the baselines are
 * deterministic and contain no production data. Only the support-issue endpoints used by the
 * chat screen are intercepted; everything else (auth/user/settings) is passed through.
 *
 * Intercepted endpoints (base `/v1/` is prepended by useApi):
 *   - GET  support/issue/:uid            (loadSupportIssue)
 *   - GET  support/issue/:uid?fromMessageId=…  (sync poller — same body)
 *   - POST support/issue/:uid/message    (submitMessage; not exercised in screenshots)
 *
 * Synthetic fixtures: fixed uid, fixed ISO dates, fake names — no production data.
 *
 * Baselines are produced by the assignee on macOS against a local api; this spec must remain
 * runnable without committed PNGs (toHaveScreenshot creates them on first update run).
 */

const ISSUE_UID = 'chat-e2e-uid-1';

const CUSTOMER = 'Customer';
const SUPPORT_AUTHOR = 'Support Agent';

interface ChatMessageFixture {
  id: number;
  author?: string;
  created: string;
  message?: string;
  fileName?: string;
  file?: { file: string; type: string; size: number; url: string };
  status?: 'Sent' | 'Received' | 'Failed';
}

interface SupportIssueFixture {
  uid: string;
  state: string;
  type: string;
  reason: string;
  name: string;
  created: string;
  messages: ChatMessageFixture[];
}

function issueWithMessages(messages: ChatMessageFixture[]): SupportIssueFixture {
  return {
    uid: ISSUE_UID,
    state: 'Pending',
    type: 'GenericIssue',
    reason: 'Other',
    name: 'E2E Chat Issue',
    created: '2024-07-09T08:00:00.000Z',
    messages,
  };
}

// Two calendar days so the date separator is visible (first message + day change).
const THREAD_MESSAGES: ChatMessageFixture[] = [
  {
    id: 1,
    author: CUSTOMER,
    created: '2024-07-09T10:00:00.000Z',
    message: 'Hello, I need help with my transfer.',
    status: 'Received',
  },
  {
    id: 2,
    author: SUPPORT_AUTHOR,
    created: '2024-07-10T09:15:00.000Z',
    message: 'Thanks for reaching out. We are looking into it.',
  },
];

const ATTACHMENT_MESSAGES: ChatMessageFixture[] = [
  {
    id: 10,
    author: SUPPORT_AUTHOR,
    created: '2024-07-10T11:00:00.000Z',
    fileName: 'statement.pdf',
    message: undefined,
  },
];

const STATUS_MESSAGES: ChatMessageFixture[] = [
  {
    id: 20,
    author: CUSTOMER,
    created: '2024-07-10T12:00:00.000Z',
    message: 'Still waiting — this is being sent…',
    status: 'Sent',
  },
  {
    id: 21,
    author: CUSTOMER,
    created: '2024-07-10T12:01:00.000Z',
    message: 'This message failed to send.',
    status: 'Failed',
  },
];

const ISSUE_RE = /\/v1\/support\/issue\/[^/?]+(?:\?|$)/;
const MESSAGE_RE = /\/v1\/support\/issue\/[^/]+\/message(?:\?|$)/;

async function installChatRoutes(page: Page, issue: SupportIssueFixture): Promise<void> {
  await page.route('**/v1/**', async (route: Route) => {
    const request = route.request();
    const url = request.url();

    if (request.method() === 'GET' && ISSUE_RE.test(url)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(issue),
      });
      return;
    }

    if (request.method() === 'POST' && MESSAGE_RE.test(url)) {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 999,
          author: CUSTOMER,
          created: new Date().toISOString(),
          message: 'ok',
          status: 'Received',
        }),
      });
      return;
    }

    await route.continue();
  });
}

function chatUrl(token: string): string {
  // Force English so text selectors stay stable regardless of the test account's language preference.
  return `/support/chat/${ISSUE_UID}?session=${token}&lang=en`;
}

test.describe('Support Chat - Visual Regression Tests', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const auth = await getCachedAuth(request, 'evm');
    token = auth.token;
  });

  test('thread with customer message, support reply and date separator', async ({ page }) => {
    await installChatRoutes(page, issueWithMessages(THREAD_MESSAGES));

    await page.goto(chatUrl(token));
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Hello, I need help with my transfer.')).toBeVisible();
    await expect(page.getByText('Thanks for reaching out. We are looking into it.')).toBeVisible();
    await expect(page.getByText(SUPPORT_AUTHOR)).toBeVisible();

    await page.waitForTimeout(1500);
    await expect(page).toHaveScreenshot('support-chat-01-thread.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });

  test('attachment message shows support author name', async ({ page }) => {
    await installChatRoutes(page, issueWithMessages(ATTACHMENT_MESSAGES));

    await page.goto(chatUrl(token));
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(SUPPORT_AUTHOR)).toBeVisible();
    await expect(page.getByText('statement.pdf')).toBeVisible();

    await page.waitForTimeout(1500);
    await expect(page).toHaveScreenshot('support-chat-02-attachment.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });

  test('customer messages in sending and failed states', async ({ page }) => {
    await installChatRoutes(page, issueWithMessages(STATUS_MESSAGES));

    await page.goto(chatUrl(token));
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Still waiting — this is being sent…')).toBeVisible();
    await expect(page.getByText('This message failed to send.')).toBeVisible();

    await page.waitForTimeout(1500);
    await expect(page).toHaveScreenshot('support-chat-03-status.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });
});
