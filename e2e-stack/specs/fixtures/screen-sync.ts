/**
 * Screen-settled waits for post-mount fetches that outlive openScreen's route-spinner + networkidle
 * barrier (see openScreen in index.ts). Callers that assert absence of result UI, or that re-navigate
 * while a destination is hydrating, must use these rather than treating openScreen / URL-only polls
 * as proof that the screen finished loading.
 */
import type { Page, Response, Route } from '@playwright/test';
import { expect } from '@playwright/test';

export const KYC_FILE_ERROR_TEXT =
  'Something went wrong. Please try again. If the issue persists please reach out to our support.';

function urlPathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** True when `url` is the KYC file metadata GET for `fileUid` (not the binary download). */
export function isKycFileMetadataUrl(url: string, fileUid: string): boolean {
  const pathname = urlPathname(url);
  // Metadata is GET /v2/kyc/file/:uid — reject longer paths (e.g. .../file/:uid/something).
  return pathname === `/v2/kyc/file/${fileUid}`;
}

/** Register before navigation. Resolves when the metadata GET response arrives (any status). */
export function waitForKycFileMetadataResponse(page: Page, fileUid: string): Promise<Response> {
  return page.waitForResponse(
    (r) => r.request().method() === 'GET' && isKycFileMetadataUrl(r.url(), fileUid),
    { timeout: 15000 },
  );
}

/**
 * Terminal UI for `src/screens/kyc-file.screen.tsx`: ErrorHint or the View file button.
 * Loading shows only StyledLoadingSpinner — absence of View file alone is not denial.
 */
export async function waitForKycFileScreenSettled(page: Page): Promise<'error' | 'file'> {
  const errorHint = page.getByText(KYC_FILE_ERROR_TEXT);
  const viewFile = page.getByRole('button', { name: 'View file' });
  return Promise.race([
    errorHint.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'error' as const),
    viewFile.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'file' as const),
  ]);
}

/**
 * Fetch the real upstream response, wait for `gate` to resolve, then deliver that same body.
 * Does not invent payloads — used by screen-sync regressions that hold delivery.
 */
export async function fulfillRealResponseAfterGate(route: Route, gate: Promise<void>): Promise<void> {
  const response = await route.fetch();
  await gate;
  await route.fulfill({ response });
}

/**
 * Destination GET path suffixes (matched as `/v1${part}` or `part`) each financial hub tile
 * kicks off after navigation. log-validity has no auto-fetch on mount.
 */
export function financialDestinationGetUrlParts(path: string): string[] {
  switch (path) {
    case '/dashboard/financial/overview':
      return ['/dashboard/financial/latest', '/dashboard/financial/log'];
    case '/dashboard/financial/live':
    case '/dashboard/financial/liquidity':
      return ['/dashboard/financial/latest'];
    case '/dashboard/financial/history':
      return ['/dashboard/financial/log', '/dashboard/financial/changes'];
    case '/dashboard/financial/history/expenses':
      return ['/dashboard/financial/changes', '/dashboard/financial/ref-recipients'];
    case '/dashboard/financial/log-validity':
      return [];
    case '/dashboard/financial/kundengelder':
      return ['/dashboard/financial/kundengelder'];
    default:
      throw new Error(`financialDestinationGetUrlParts: unknown path ${path}`);
  }
}

/** Exact pathname match for a known /v1 dashboard financial GET (query string ignored). */
function matchesFinancialGet(url: string, part: string): boolean {
  const pathname = urlPathname(url);
  return pathname === part || pathname === `/v1${part}`;
}

/** Register before clicking a hub tile. Empty for paths with no mount-time fetch. */
export function waitForFinancialDestinationRequests(page: Page, path: string): Promise<Response[]> {
  const parts = financialDestinationGetUrlParts(path);
  return Promise.all(
    parts.map((part) =>
      page.waitForResponse(
        (r) => r.request().method() === 'GET' && matchesFinancialGet(r.url(), part),
        { timeout: 15000 },
      ),
    ),
  );
}

/**
 * Observable post-load UI for each financial destination (markers that only appear after
 * isLoading clears, except log-validity which has no mount fetch).
 */
export async function waitForFinancialDestinationReady(page: Page, path: string): Promise<void> {
  switch (path) {
    case '/dashboard/financial/overview':
      await expect(page.getByRole('heading', { name: 'Total Balance vs BTC Price' })).toBeVisible();
      return;
    case '/dashboard/financial/live':
      await expect(page.getByText('Total Balance', { exact: true })).toBeVisible();
      return;
    case '/dashboard/financial/history':
      await expect(page.getByRole('heading', { name: 'Income / Plus (cumulative)' })).toBeVisible();
      return;
    case '/dashboard/financial/history/expenses':
      await expect(page.getByRole('heading', { name: 'Referral Expenses (cumulative)' })).toBeVisible();
      return;
    case '/dashboard/financial/liquidity':
      await expect(page.getByText('Total Balance', { exact: true })).toBeVisible();
      return;
    case '/dashboard/financial/log-validity':
      await expect(page.getByRole('heading', { name: 'By log ID' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'By financial range / threshold' })).toBeVisible();
      return;
    case '/dashboard/financial/kundengelder':
      await expect(page.getByRole('heading', { name: 'Kundengelder' })).toBeVisible();
      return;
    default:
      throw new Error(`waitForFinancialDestinationReady: unknown path ${path}`);
  }
}

/**
 * After a hub-tile click: destination GETs finished (response body complete), post-load UI
 * visible, then networkidle to drain shell bootstrap (language/user/asset/bankAccount) before
 * the next navigation. networkidle alone is not the hydration proof — the request + UI waits are.
 * URL-only polls are not a substitute: they resolve before held destination bodies arrive.
 */
export async function settleFinancialHubDestination(
  page: Page,
  path: string,
  requestWait: Promise<Response[]>,
): Promise<void> {
  const responses = await requestWait;
  await Promise.all(responses.map((r) => r.finished()));
  await waitForFinancialDestinationReady(page, path);
  await page.waitForLoadState('networkidle');
}
