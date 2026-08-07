import { test as base, expect, type Page } from '@playwright/test';
import { gotoWithSession, loginAs, signatureLogin, testWallet, type TestRole } from './auth';

export * from './api-client';
export * from './auth';
export * from './db';
export * from './factories';
export * from './mail';
export * from './test-data';
export { expect };

type RoleFixtures = {
  authedPage: Page;
  userPage: Page;
  adminPage: Page;
  compliancePage: Page;
  supportPage: Page;
};

async function pageWithRole(page: Page, role: TestRole): Promise<Page> {
  const { jwt } = await loginAs(role);
  await gotoWithSession(page, '/', jwt);
  return page;
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
  const spinner = page.locator('[role="status"], .animate-spin').first();
  if ((await spinner.count()) > 0) {
    await spinner.waitFor({ state: 'detached', timeout: 15000 }).catch(() => {
      /* spinner still present — pathname check below will surface real failures */
    });
  }

  const actual = new URL(page.url()).pathname;
  const expected = path.startsWith('/') ? path : `/${path}`;
  // Normalize trailing slashes for comparison except for the root path.
  const norm = (p: string) => (p !== '/' && p.endsWith('/') ? p.slice(0, -1) : p);
  if (norm(actual) !== norm(expected)) {
    throw new Error(
      `openScreen: navigated to "${path}" but ended up on "${actual}" — likely a missing role or expired session`,
    );
  }
}

/** Hosts the browser is allowed to reach: the stack itself, nothing else. */
function stackHosts(): Set<string> {
  const hosts = new Set(['localhost', '127.0.0.1']);
  for (const raw of [process.env.E2E_FRONTEND_URL ?? 'http://frontend', process.env.E2E_API_URL ?? 'http://api:3000']) {
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
 * Extended Playwright test with role-scoped and generic authenticated page fixtures.
 * workers:1 is enforced in playwright.config.ts, so fresh testWallet() index 0 per test is fine.
 */
export const test = base.extend<RoleFixtures>({
  page: async ({ page }, use) => {
    await isolateFromExternalHosts(page);
    await use(page);
  },
  authedPage: async ({ page }, use) => {
    const wallet = testWallet();
    const jwt = await signatureLogin(wallet);
    await gotoWithSession(page, '/', jwt);
    await use(page);
  },
  userPage: async ({ page }, use) => {
    await use(await pageWithRole(page, 'User'));
  },
  adminPage: async ({ page }, use) => {
    await use(await pageWithRole(page, 'Admin'));
  },
  compliancePage: async ({ page }, use) => {
    await use(await pageWithRole(page, 'Compliance'));
  },
  supportPage: async ({ page }, use) => {
    await use(await pageWithRole(page, 'Support'));
  },
});
