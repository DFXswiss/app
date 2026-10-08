import { test, expect, Locator, Page } from '@playwright/test';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import type { AddressInfo } from 'net';
import * as path from 'path';
import { forceOpenShadowRoots } from '../e2e-stack/specs/fixtures/shadow-root';

/**
 * E2E Visual Regression Tests: mail login by code inside the embedded app (Web Component)
 *
 * Screen: `<dfx-services>` → menu → Login → E-Mail → code step (`connect-mail-code.tsx`), which
 * only renders when the app is embedded. Variants: mail entry, code entry, wrong code, expired code,
 * too many wrong attempts, new code sent.
 *
 * Runs against a real local API (see CONTRIBUTING.md, "Visual regression tests"); `npm run
 * e2e:stack:up` provides one on http://localhost:3000. Every response comes from that API: the code
 * request, the 401 for each wrong code and the resend. The lockout after the fifth 401 and the
 * expiry are the code step's own state (it counts attempts and validity itself). The API
 * neither stores nor logs the code it mails (the mail text is marked sensitive), so no variant can
 * show a successful code login — the full-stack spec `e2e-stack/specs/widget.spec.ts` documents the
 * same limit.
 *
 * The widget is the real widget build, not the dev server: build it first with
 *   npm run widget:loc
 * (API http://localhost:3000, output `widget/`, lazy chunks under http://localhost:3001/widget/).
 * The spec serves a minimal host page, the bundle and the widget stylesheet from its own HTTP
 * server on 127.0.0.1, so the page is a real loopback document that may call the API on localhost.
 * The lazy chunks are fulfilled from the same build via `page.route`, so the spec does not depend on
 * what the configured web server answers on port 3001. The stylesheet is served as
 * `main-widget.css`, the name the deploy workflows rewrite to the published stylesheet.
 *
 * The closed shadow root is forced open (`forceOpenShadowRoots`), so locators reach the widget;
 * product code is unchanged. The expired variant moves the browser clock past the code's validity;
 * the API's own expiry is not exercised by it.
 *
 * The API limits code requests to 10 per IP and hour (in memory); one run makes 4. Restart the API
 * container if repeated local runs hit the limit (the code step then shows "Too many attempts").
 *
 * Synthetic data only: random example.invalid addresses (not shown in any screenshot).
 */

const CHUNK_ORIGIN = 'http://localhost:3001';
const WIDGET_DIR = path.join(__dirname, '..', 'widget');

const INVALID = 'The code is incorrect. Please check it and try again.';
const EXPIRED = 'This code has expired. Please request a new code.';
const LOCKED = 'Too many incorrect attempts. Please request a new code.';
const RESENT = 'We have sent you a new code.';
const CODE_VALIDITY = '10:00';
const MAX_ATTEMPTS = 5;

// A wrong code is any six digits other than the one mailed; this one collides with a chance of
// one in a million per request.
const WRONG_CODE = '000000';

let hostServer: http.Server;
let hostUrl: string;

function widgetBundle(dir: string, pattern: RegExp): string {
  const matches = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => pattern.test(f)) : [];
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one ${pattern} in ${dir}, found ${matches.length}. Run "npm run widget:loc" first.`,
    );
  }
  return matches[0];
}

/** A file of the widget build for a `/widget/...` path, or undefined if there is none. */
function widgetFile(pathname: string): string | undefined {
  if (!pathname.startsWith('/widget/')) return undefined;
  const file = path.join(WIDGET_DIR, pathname.slice('/widget/'.length));
  return file.startsWith(WIDGET_DIR + path.sep) && fs.existsSync(file) ? file : undefined;
}

test.beforeAll(async () => {
  const js = widgetBundle(path.join(WIDGET_DIR, 'static/js'), /^main\.[0-9a-f]+\.js$/);
  const css = widgetBundle(path.join(WIDGET_DIR, 'static/css'), /^main\.[0-9a-f]+\.css$/);
  const host = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <script defer src="/widget/static/js/${js}"></script>
  </head>
  <body style="margin: 0">
    <div style="width: 600px; height: 700px"><dfx-services></dfx-services></div>
  </body>
</html>`;

  hostServer = http.createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://host').pathname;
    const file = pathname === '/main-widget.css' ? path.join(WIDGET_DIR, 'static/css', css) : widgetFile(pathname);
    if (file) {
      res.writeHead(200, { 'content-type': file.endsWith('.css') ? 'text/css' : 'application/javascript' });
      fs.createReadStream(file).pipe(res);
    } else if (pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(host);
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => hostServer.listen(0, '127.0.0.1', resolve));
  hostUrl = `http://127.0.0.1:${(hostServer.address() as AddressInfo).port}/`;
});

test.afterAll(async () => {
  await new Promise((resolve) => hostServer.close(resolve));
});

async function serveWidgetChunks(page: Page): Promise<void> {
  await page.route(`${CHUNK_ORIGIN}/widget/**`, async (route) => {
    const file = widgetFile(new URL(route.request().url()).pathname);
    return file ? route.fulfill({ path: file }) : route.fulfill({ status: 404 });
  });
}

async function openMailEntry(page: Page): Promise<Locator> {
  await forceOpenShadowRoots(page);
  await serveWidgetChunks(page);
  await page.goto(hostUrl);

  const widget = page.locator('dfx-services');
  await widget.locator('div.cursor-pointer').first().click(); // menu icon
  await widget.getByRole('button', { name: 'Login' }).click();
  await widget.locator('img[src*="mail"]').click();
  await expect(widget.getByPlaceholder('example@mail.com')).toBeVisible();
  return widget;
}

async function openCodeStep(page: Page): Promise<Locator> {
  const widget = await openMailEntry(page);
  await widget
    .getByPlaceholder('example@mail.com')
    .fill(`widget-code-${randomBytes(4).toString('hex')}@example.invalid`);
  await widget.getByRole('button', { name: 'Next' }).click();
  await expect(widget.getByPlaceholder('6-digit code')).toBeVisible({ timeout: 15_000 });
  return widget;
}

/** Submits a wrong code and waits for the API's answer, so a message left from the previous attempt cannot pass for this one. */
async function submitWrongCode(widget: Locator): Promise<void> {
  await widget.getByPlaceholder('6-digit code').fill(WRONG_CODE);
  const answer = widget
    .page()
    .waitForResponse((res) => res.url().endsWith('/v1/auth/mail/code') && res.request().method() === 'POST');
  await widget.getByRole('button', { name: 'Confirm' }).click();
  expect((await answer).status()).toBe(401);
}

/** Submits a code the browser already considers expired; the step answers without calling the API. */
async function submitExpiredCode(widget: Locator): Promise<void> {
  await widget.getByPlaceholder('6-digit code').fill(WRONG_CODE);
  await widget.getByRole('button', { name: 'Confirm' }).click();
}

async function expectScreenshot(widget: Locator, name: string): Promise<void> {
  await widget.page().waitForTimeout(500);
  await expect(widget).toHaveScreenshot(name, { maxDiffPixels: 2000 });
}

test.describe('Widget - mail login by code', () => {
  test('mail entry', async ({ page }) => {
    const widget = await openMailEntry(page);
    await expectScreenshot(widget, 'widget-mail-code-01-mail-entry.png');
  });

  test('code entry, wrong code and new code sent', async ({ page }) => {
    const widget = await openCodeStep(page);
    await expect(
      widget.getByText('We have sent you an email with a 6-digit code. Please enter it here to log in.'),
    ).toBeVisible();
    await expectScreenshot(widget, 'widget-mail-code-02-code-entry.png');

    await submitWrongCode(widget);
    await expect(widget.getByText(INVALID)).toBeVisible();
    await expectScreenshot(widget, 'widget-mail-code-03-wrong-code.png');

    await widget.getByRole('button', { name: 'Send new code' }).click();
    await expect(widget.getByText(RESENT)).toBeVisible();
    await expect(widget.getByText(INVALID)).toHaveCount(0);
    await expectScreenshot(widget, 'widget-mail-code-06-new-code-sent.png');
  });

  test('expired code', async ({ page }) => {
    await page.clock.install();
    const widget = await openCodeStep(page);

    await page.clock.fastForward(CODE_VALIDITY);
    const exchanges: string[] = [];
    page.on('request', (req) => {
      if (req.url().endsWith('/v1/auth/mail/code')) exchanges.push(req.method());
    });
    await submitExpiredCode(widget);
    await expect(widget.getByText(EXPIRED)).toBeVisible();
    expect(exchanges, 'an expired code is rejected without calling the API').toEqual([]);
    await expect(widget.getByPlaceholder('6-digit code')).toHaveCount(0);
    await expectScreenshot(widget, 'widget-mail-code-04-expired.png');
  });

  test('too many wrong attempts', async ({ page }) => {
    const widget = await openCodeStep(page);

    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
      await submitWrongCode(widget);
      await expect(widget.getByText(INVALID)).toBeVisible();
    }
    await submitWrongCode(widget);
    await expect(widget.getByText(LOCKED)).toBeVisible();
    await expect(widget.getByPlaceholder('6-digit code')).toHaveCount(0);
    await expectScreenshot(widget, 'widget-mail-code-05-locked.png');
  });
});
