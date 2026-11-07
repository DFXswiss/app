import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

function apiBase(): string {
  return process.env.E2E_API_URL ?? 'http://api:3000';
}

function readJson(path: string, body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${path} did not return JSON: ${reason}. Body starts: ${body.slice(0, 80)}`);
  }
}

function requireNonEmptyString(value: unknown, label: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string, got ${JSON.stringify(value)}`);
  }
}

function requireContentType(headers: Record<string, string>, path: string): string {
  const contentType = headers['content-type'];
  if (typeof contentType !== 'string' || contentType.length === 0) {
    throw new Error(`GET ${path} returned no content-type, got ${JSON.stringify(contentType)}`);
  }
  return contentType;
}

/** Static files of the frontend the harness serves. page.request does not navigate, so the route gate ignores these. */
async function expectStaticJson(page: Page, path: string): Promise<unknown> {
  const response = await page.request.get(path);
  expect(response.status(), `GET ${path}`).toBe(200);
  const contentType = requireContentType(response.headers(), path);
  expect(contentType, `GET ${path} content-type`).toContain('json');
  expect(contentType, `GET ${path} content-type`).not.toContain('text/html');
  return readJson(path, await response.text());
}

/**
 * Smoke chain — the frontend shell, the document head, the static files the harness image serves,
 * and GET /v1/asset. Navigates only to `/` so specs/registry/smoke.ts keeps an empty claim list.
 * version.json is not in the repo. The harness frontend image runs scripts/generate-version.js
 * before the build, and this asserts the JSON that image serves (version, and commit — a git SHA
 * or the script's `unknown` when git is absent).
 */
test.describe('e2e-stack smoke', () => {
  test('frontend loads, document head, static files, API assets', async ({ page }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => {
      pageErrors.push(String(err));
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#app-root')).toBeVisible({ timeout: 15000 });
    // Home renders "DFX Services" only after wallet init replaces the spinner.
    await expect(page.getByText('DFX Services', { exact: true })).toBeVisible({ timeout: 20000 });
    expect(pageErrors, `uncaught pageerror during load: ${pageErrors.join('; ')}`).toEqual([]);
    expect(consoleErrors, `console error during load: ${consoleErrors.join('; ')}`).toEqual([]);

    const assetRes = await fetch(`${apiBase()}/v1/asset`);
    expect(assetRes.ok, `GET /v1/asset status ${assetRes.status}`).toBe(true);
    const assets = (await assetRes.json()) as unknown[];
    expect(Array.isArray(assets), 'GET /v1/asset should return a JSON array').toBe(true);
    expect(assets.length, 'GET /v1/asset should be non-empty').toBeGreaterThan(0);

    const title = await page.title();
    expect(title, 'document.title').toContain('DFX');
    const lang = await page.locator('html').getAttribute('lang');
    requireNonEmptyString(lang, '<html lang>');
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    if (typeof description !== 'string' || description.length <= 50) {
      throw new Error(`meta description must be longer than 50 characters, got ${JSON.stringify(description)}`);
    }
    const twitterCard = await page.locator('meta[name="twitter:card"]').getAttribute('content');
    requireNonEmptyString(twitterCard, 'meta[name="twitter:card"]');

    const manifest = await expectStaticJson(page, '/manifest.json');
    if (typeof manifest !== 'object' || manifest === null) {
      throw new Error(`manifest.json must be a JSON object, got ${JSON.stringify(manifest)}`);
    }
    requireNonEmptyString((manifest as { name?: unknown }).name, 'manifest.json name');

    const versionDoc = await expectStaticJson(page, '/version.json');
    if (typeof versionDoc !== 'object' || versionDoc === null) {
      throw new Error(`version.json must be a JSON object, got ${JSON.stringify(versionDoc)}`);
    }
    const versionBody = versionDoc as { version?: unknown; commit?: unknown };
    requireNonEmptyString(versionBody.version, 'version.json version');
    requireNonEmptyString(versionBody.commit, 'version.json commit');

    const robots = await page.request.get('/robots.txt');
    expect(robots.status(), 'GET /robots.txt').toBe(200);
    const robotsType = requireContentType(robots.headers(), '/robots.txt');
    expect(robotsType, 'GET /robots.txt content-type').toContain('text/plain');
    expect(robotsType, 'GET /robots.txt content-type').not.toContain('text/html');
    const robotsBody = await robots.text();
    // public/robots.txt starts with the robots.txt.org comment, then "User-agent: *" and "Disallow:".
    expect(robotsBody).toContain('https://www.robotstxt.org/robotstxt.html');
    expect(robotsBody).toContain('User-agent: *');
    expect(robotsBody).toContain('Disallow:');
    expect(robotsBody).not.toContain('<html');

    const favicon = await page.request.get('/favicon.ico');
    expect(favicon.status(), 'GET /favicon.ico').toBe(200);
    const faviconType = requireContentType(favicon.headers(), '/favicon.ico');
    expect(faviconType.startsWith('image/'), `GET /favicon.ico content-type ${faviconType}`).toBe(true);

    expect(pageErrors, `uncaught pageerror after checks: ${pageErrors.join('; ')}`).toEqual([]);
    expect(consoleErrors, `console error after checks: ${consoleErrors.join('; ')}`).toEqual([]);
  });
});
