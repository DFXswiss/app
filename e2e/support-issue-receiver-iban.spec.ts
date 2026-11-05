import { test, expect, Page, Route } from '@playwright/test';
import { getCachedAuth } from './helpers/auth-cache';

/**
 * E2E Visual Regression Tests: support-issue receiver-IBAN check
 *
 * Route:
 *   - /support/issue  (customer support form; file src/screens/support-issue.screen.tsx)
 *
 * Auth is REAL customer auth via getCachedAuth (same pattern as e2e/user-flows.spec.ts): the api must
 * be reachable for the session token. Deep-link query params pre-select type/reason so the
 * TransactionIssue + TransactionMissing form (including the Receiver IBAN field) is shown without
 * manual dropdown interaction. Parameter names and values match the screen's urlParams handling
 * (issue-type / reason) and the SupportIssueType / SupportIssueReason string enums
 * (TransactionIssue / TransactionMissing).
 *
 * Two endpoints are MOCKED with synthetic or rewritten responses via page.route(...):
 * PUT bank/receiveIban (full URL /v1/bank/receiveIban after useApi) is intercepted with synthetic
 * status responses so each of the tested check states is reproducible on demand; GET /v2/user is
 * intercepted as a second, side-effect-free exception that pins kyc.level and, if missing, mail
 * so the KYC guard and the mail-first gate both let the form render (see KYC note below). Everything
 * else (auth/user/settings/…) is passed through via route.continue() to the local running stack.
 *
 * Intercepted endpoints:
 *   - PUT bank/receiveIban (base `/v1/` is prepended by useApi)   body { iban }; success body { status: ReceiveIbanStatus }
 *   - GET /v2/user   response rewritten to pin kyc.level and, if absent, mail so the KYC guard and mail gate pass
 *
 * Synthetic fixtures: fixed example IBAN string.
 *
 * KYC precondition: the support-issue screen is behind useKycLevelGuard(KycLevel.Link, '/contact')
 * in src/screens/support-issue.screen.tsx. A freshly registered account is level 0 and would be
 * redirected to contact data, so the Receiver IBAN field never appears. Instead of mutating the
 * account server-side, installReceiveIbanRoutes also intercepts GET /v2/user as a second exception
 * next to PUT bank/receiveIban and pins kyc.level in that HTTP response to a fixed value that lets the
 * guard pass. No account is changed — the pinned level applies only to the response seen by these
 * tests, not to server-side state. Because the level is pinned to a fixed value rather than merely
 * raised, the screenshot is reproducible regardless of whatever KYC level the local account
 * currently has.
 */

// Example Swiss IBAN (21 alphanumerics once normalized); length is above ReceiverIbanCheckMinLength (15).
const EXAMPLE_RECEIVER_IBAN = 'CH93 0076 2011 6238 5295 7';

const RECEIVE_IBAN_RE = /\/v1\/bank\/receiveIban(?:\?|$)/;

const USER_V2_RE = /\/v2\/user(?:\?|$)/;

/** Level the api reports for an account that has completed ContactData KYC. Kept at this value on
 *  purpose — a higher level (KycLevel.Completed and above) would add an extra entry to the
 *  "Issue type" dropdown and skew the screenshots. */
const GUARD_KYC_LEVEL = 10;

type ReceiveIbanStatus = 'DfxIban' | 'NotMatched' | 'InvalidIban' | 'LoginRequired';

/** Success: JSON `{ status }`. Failure: HTTP error (any non-2xx is treated as unavailable by the screen). */
type ReceiveIbanMock = { status: ReceiveIbanStatus } | { httpStatus: number };

// ---------------------------------------------------------------------------
// Routing: intercept PUT /v1/bank/receiveIban and GET /v2/user; pass everything else through.
// ---------------------------------------------------------------------------

async function installReceiveIbanRoutes(
  page: Page,
  mock: ReceiveIbanMock,
  options?: { delayMs?: number },
): Promise<void> {
  await page.route('**/v1/**', async (route: Route) => {
    const request = route.request();
    const url = request.url();

    if (request.method() === 'PUT' && RECEIVE_IBAN_RE.test(url)) {
      if (options?.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      }

      if ('httpStatus' in mock) {
        await route.fulfill({
          status: mock.httpStatus,
          contentType: 'application/json',
          body: JSON.stringify({}),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: mock.status }),
      });
      return;
    }

    // everything else (auth, user, settings, …) hits the real api
    await route.continue();
  });

  await page.route(USER_V2_RE, async (route: Route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }

    const response = await route.fetch();
    const user = await response.json();

    if (typeof user?.kyc?.level !== 'number') {
      throw new Error(
        `GET /v2/user response missing expected structure { kyc: { level: number } }; got: ${JSON.stringify(user)}`,
      );
    }

    await route.fulfill({
      response,
      json: { ...user, kyc: { ...user.kyc, level: GUARD_KYC_LEVEL }, mail: user.mail || 'visual-e2e@example.com' },
    });
  });
}

/** StyledInput renders label and input as siblings; getByLabel is unreliable for this field. */
function receiverIbanInput(page: Page) {
  return page.locator('label', { hasText: 'Receiver IBAN' }).locator('xpath=following-sibling::div[1]//input');
}

/**
 * Loading spinner overlay that StyledInput places inside the field when loading is true
 * (absolute right-side container wrapping StyledLoadingSpinner).
 */
function receiverIbanSpinner(page: Page) {
  return page
    .locator('label', { hasText: 'Receiver IBAN' })
    .locator('xpath=following-sibling::div[1]')
    .locator('div.absolute.right-3');
}

function supportIssueUrl(token: string): string {
  // Force English so text selectors stay stable regardless of the test account's language preference.
  return `/support/issue?session=${token}&lang=en&issue-type=TransactionIssue&reason=TransactionMissing`;
}

async function waitForReceiveIbanPut(page: Page) {
  return page.waitForResponse((r) => r.url().includes('/v1/bank/receiveIban') && r.request().method() === 'PUT');
}

// ---------------------------------------------------------------------------
// Tests: one screenshot per receiver-IBAN check state
// ---------------------------------------------------------------------------

test.describe('Support Issue - Receiver IBAN check - Visual Regression Tests', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const auth = await getCachedAuth(request, 'evm');
    token = auth.token;
  });

  test('empty receiver IBAN field after navigation', async ({ page }) => {
    // Neutral mock so an accidental input cannot hit the real check endpoint.
    await installReceiveIbanRoutes(page, { status: 'DfxIban' });

    await page.goto(supportIssueUrl(token));
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Receiver IBAN')).toBeVisible();

    await page.waitForTimeout(1500);
    await expect(page).toHaveScreenshot('support-issue-receiver-iban-01-empty.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });

  test('checking receiver IBAN shows loading spinner while request is in flight', async ({ page }) => {
    // Delay the response so the screenshot captures the in-flight spinner, not a finished check.
    await installReceiveIbanRoutes(page, { status: 'DfxIban' }, { delayMs: 8000 });

    await page.goto(supportIssueUrl(token));
    await page.waitForLoadState('networkidle');

    const input = receiverIbanInput(page);
    await input.fill(EXAMPLE_RECEIVER_IBAN);
    // Do not wait for waitForResponse — the check must still be running at screenshot time.

    await expect(receiverIbanSpinner(page)).toBeVisible();
    await expect(page.getByText('We have recognized this IBAN.')).not.toBeVisible();
    await expect(
      page.getByText(
        'We could not recognize this IBAN with the information available to us. You can submit your request anyway.',
      ),
    ).not.toBeVisible();
    await expect(page.getByText('This does not look like a valid IBAN.')).not.toBeVisible();
    await expect(
      page.getByText('We could not check this IBAN at the moment. You can submit your request anyway.'),
    ).not.toBeVisible();

    // Settle after the re-render, well inside the window the mock delay keeps the spinner visible in: the check
    // starts one debounce interval after the input and the response only arrives 8000 ms later, so a screenshot
    // taken here still shows the in-flight state even when the comparison needs a second attempt.
    await page.waitForTimeout(400);
    await expect(page).toHaveScreenshot('support-issue-receiver-iban-02-checking.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });

  test('recognized IBAN shows DfxIban hint while focused', async ({ page }) => {
    await installReceiveIbanRoutes(page, { status: 'DfxIban' });

    await page.goto(supportIssueUrl(token));
    await page.waitForLoadState('networkidle');

    const input = receiverIbanInput(page);
    const responsePromise = waitForReceiveIbanPut(page);
    await input.fill(EXAMPLE_RECEIVER_IBAN);
    await responsePromise;
    // DfxIban hint is shown immediately while the field stays focused (no blur).

    await expect(page.getByText('We have recognized this IBAN.')).toBeVisible();

    await page.waitForTimeout(1500);
    await expect(page).toHaveScreenshot('support-issue-receiver-iban-03-recognized.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });

  test('not-matched IBAN shows NotMatched hint after blur', async ({ page }) => {
    await installReceiveIbanRoutes(page, { status: 'NotMatched' });

    await page.goto(supportIssueUrl(token));
    await page.waitForLoadState('networkidle');

    const input = receiverIbanInput(page);
    const responsePromise = waitForReceiveIbanPut(page);
    await input.fill(EXAMPLE_RECEIVER_IBAN);
    await responsePromise;
    await input.blur();

    await expect(
      page.getByText(
        'We could not recognize this IBAN with the information available to us. You can submit your request anyway.',
      ),
    ).toBeVisible();

    await page.waitForTimeout(1500);
    await expect(page).toHaveScreenshot('support-issue-receiver-iban-04-not-matched.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });

  test('invalid IBAN shows InvalidIban hint after blur', async ({ page }) => {
    await installReceiveIbanRoutes(page, { status: 'InvalidIban' });

    await page.goto(supportIssueUrl(token));
    await page.waitForLoadState('networkidle');

    const input = receiverIbanInput(page);
    const responsePromise = waitForReceiveIbanPut(page);
    await input.fill(EXAMPLE_RECEIVER_IBAN);
    await responsePromise;
    await input.blur();

    await expect(page.getByText('This does not look like a valid IBAN.')).toBeVisible();

    await page.waitForTimeout(1500);
    await expect(page).toHaveScreenshot('support-issue-receiver-iban-05-invalid.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });

  test('check unavailable (HTTP 500) shows fallback hint after blur', async ({ page }) => {
    await installReceiveIbanRoutes(page, { httpStatus: 500 });

    await page.goto(supportIssueUrl(token));
    await page.waitForLoadState('networkidle');

    const input = receiverIbanInput(page);
    const responsePromise = waitForReceiveIbanPut(page);
    await input.fill(EXAMPLE_RECEIVER_IBAN);
    await responsePromise;
    await input.blur();

    await expect(
      page.getByText('We could not check this IBAN at the moment. You can submit your request anyway.'),
    ).toBeVisible();

    await page.waitForTimeout(1500);
    await expect(page).toHaveScreenshot('support-issue-receiver-iban-06-unavailable.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });

  test('login-required IBAN shows LoginRequired hint after blur', async ({ page }) => {
    await installReceiveIbanRoutes(page, { status: 'LoginRequired' });

    await page.goto(supportIssueUrl(token));
    await page.waitForLoadState('networkidle');

    const input = receiverIbanInput(page);
    const responsePromise = waitForReceiveIbanPut(page);
    await input.fill(EXAMPLE_RECEIVER_IBAN);
    await responsePromise;
    await input.blur();

    await expect(page.getByText('Please log in so that we can also check your personal IBAN.')).toBeVisible();

    await page.waitForTimeout(1500);
    await expect(page).toHaveScreenshot('support-issue-receiver-iban-07-login-required.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });
});
