import { test as base, expect, type Page } from '@playwright/test';
import { gotoWithSession, signatureLogin, testWallet } from './auth';
import { normPath, recordVisitedRoute } from './routes';

export * from './api-client';
export * from './auth';
export * from './db';
export * from './factories';
export * from './lnurl';
export * from './mail';
export * from './routes';
export * from './test-data';
export { expect };

type AuthFixtures = {
  authedPage: Page;
};

/**
 * Narrows away `null`/`undefined` and names what was missing when it is not there.
 *
 * The alternative — a `!` non-null assertion on a `queryOne` row, a navigation response or a
 * bounding box — reports the absence as "Cannot read properties of null", one frame deep in
 * whatever line happened to dereference it, and says nothing about which seed row or which
 * request never arrived. `description` names the thing that was expected to exist.
 */
export function required<T>(value: T | null | undefined, description: string): T {
  if (value === null || value === undefined) {
    throw new Error(`${description} — got ${value === null ? 'null' : 'undefined'}`);
  }
  return value;
}

/**
 * Navigates to `path` with an authenticated session and waits until the screen has actually
 * rendered — not the loading spinner, and not a redirect away from `path` (the latter is the
 * typical symptom of a missing role).
 */
export async function openScreen(page: Page, path: string, jwt: string): Promise<void> {
  await gotoWithSession(page, path, jwt);

  // SuspenseFallback renders StyledLoadingSpinner from @dfx.swiss/react-components.
  // There is no stable data-testid on that component in this checkout, so we fall back to
  // networkidle plus a best-effort wait for common spinner markers (role=status / animate-spin)
  // to detach. If no such element exists, networkidle alone is the wait.
  await page.waitForLoadState('networkidle');
  // A screen that never leaves its loading state has not rendered, and the path check below would
  // still call it a success — so this wait is allowed to fail rather than being swallowed.
  //
  // It watches the first match rather than requiring every match to disappear. Requiring all of
  // them was tried and measured: some screens keep a `[role="status"]` region for good, so the
  // wait sat out its full timeout on healthy screens, more than doubled the suite's runtime and
  // failed tests that had nothing wrong with them.
  const spinner = page.locator('[role="status"], .animate-spin').first();
  if ((await spinner.count()) > 0) {
    try {
      await spinner.waitFor({ state: 'detached', timeout: 15000 });
    } catch {
      throw new Error(`openScreen: "${path}" was still showing a loading spinner after 15s`);
    }
  }

  const actual = new URL(page.url()).pathname;
  const expected = path.startsWith('/') ? path : `/${path}`;
  if (normPath(actual) !== normPath(expected)) {
    throw new Error(
      `openScreen: navigated to "${path}" but ended up on "${actual}" — likely a missing role or expired session`,
    );
  }
}

/**
 * Hosts the browser is allowed to reach: the stack itself, nothing else.
 *
 * A host missing from this list does not error — it gets the empty 200 below, which looks like a
 * blank page rather than a blocked request. Anything the suite legitimately navigates to therefore
 * belongs here; the widget host was learned that way.
 */
function stackHosts(): Set<string> {
  const hosts = new Set(['localhost', '127.0.0.1']);
  const stackUrls = [
    process.env.E2E_FRONTEND_URL ?? 'http://frontend',
    process.env.E2E_API_URL ?? 'http://api:3000',
    process.env.E2E_WIDGET_URL ?? 'http://frontend-widget',
  ];
  for (const raw of stackUrls) {
    hosts.add(new URL(raw).hostname);
  }
  return hosts;
}

/**
 * Answers every browser request that leaves the stack with an empty 200.
 *
 * The sandbox network has no route to the internet, so anything the app pulls from a third party
 * (index.html loads a Google Fonts stylesheet, for one) fails DNS resolution and shows up as a
 * console error. Left alone, that noise would drown the console assertions every screen test wants
 * to make. Answering instead of aborting keeps the request from failing at all — an aborted request
 * logs an error of its own. Serving no fonts is also the honest state of affairs: the app has to
 * work without them.
 */
async function isolateFromExternalHosts(page: Page): Promise<void> {
  const allowed = stackHosts();
  await page.route('**/*', async (route) => {
    const host = new URL(route.request().url()).hostname;
    if (allowed.has(host)) return route.continue();
    return route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
  });
}

/**
 * Extended Playwright test with a generic authenticated page fixture.
 * workers:1 is enforced in playwright.config.ts, so fresh testWallet() index 0 per test is fine.
 *
 * Role-scoped page fixtures (userPage/adminPage/compliancePage/supportPage) existed here and had
 * no callers: the role-gated specs need the JWT itself (for apiGet) and drive navigation through
 * openScreen, which loginAs + openScreen already provide. Add one back only with a test that uses it.
 */
export const test = base.extend<AuthFixtures>({
  page: async ({ page }, use, testInfo) => {
    await isolateFromExternalHosts(page);
    // Record where the browser actually went, together with the spec file that drove the page.
    // The coverage gate requires every claimed route to have been opened by the claiming suite —
    // not merely by any suite that happened to land on the same path.
    page.on('framenavigated', (frame) => {
      if (frame !== page.mainFrame()) return;
      try {
        recordVisitedRoute(new URL(frame.url()).pathname, testInfo.file);
      } catch {
        // about:blank and similar non-URL navigations carry no path to record.
      }
    });
    await use(page);
  },
  authedPage: async ({ page }, use) => {
    const wallet = testWallet();
    const jwt = await signatureLogin(wallet);
    await gotoWithSession(page, '/', jwt);
    await use(page);
  },
});
