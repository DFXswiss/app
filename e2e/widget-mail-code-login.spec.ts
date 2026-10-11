import { test, expect, Locator, Page } from '@playwright/test';
import { randomBytes } from 'crypto';
import { forceOpenShadowRoots } from '../e2e-stack/specs/fixtures/shadow-root';
import { serveWidgetChunks, startWidgetHost, WidgetHost } from './helpers/widget-host';

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
 * The widget is the real widget build, served with its own host page by `helpers/widget-host.ts`;
 * build it first with `npm run widget:loc`.
 *
 * The closed shadow root is forced open (`forceOpenShadowRoots`), so locators reach the widget;
 * product code is unchanged. The expired variant moves the browser clock past the code's validity;
 * the API's own expiry is not exercised by it.
 *
 * The API limits code requests to 10 per IP and hour (in memory); one run makes 4. Retries are off
 * for this describe, so CI retries cannot push a failing run past the limit and hide the original
 * failure behind "Too many attempts". Restart the API container if repeated local runs hit the limit.
 *
 * Synthetic data only: random example.invalid addresses (not shown in any screenshot).
 */

const INVALID = 'The code is incorrect. Please check it and try again.';
const EXPIRED = 'This code has expired. Please request a new code.';
const LOCKED = 'Too many incorrect attempts. Please request a new code.';
const RESENT = 'We have sent you a new code.';
const CODE_VALIDITY = '10:00';
const MAX_ATTEMPTS = 5;

// A wrong code is any six digits other than the one mailed; this one collides with a chance of
// one in a million per request.
const WRONG_CODE = '000000';

let host: WidgetHost | undefined;

test.beforeAll(async () => {
  host = await startWidgetHost('<div style="width: 600px; height: 700px"><dfx-services></dfx-services></div>');
});

// beforeAll throws before the host exists when the widget build is missing; keep that error.
test.afterAll(async () => {
  await host?.close();
});

async function openMailEntry(page: Page): Promise<Locator> {
  await forceOpenShadowRoots(page);
  await serveWidgetChunks(page);
  if (!host) throw new Error('The widget host did not start.');
  await page.goto(host.url);

  const widget = page.locator('dfx-services');
  await widget.locator('div.cursor-pointer').first().click(); // menu icon
  await widget.getByRole('button', { name: 'Login' }).click();
  await widget.locator('img[src*="mail"]').click();
  await expect(widget.getByPlaceholder('example@mail.com')).toBeVisible();
  return widget;
}

interface CodeStep {
  widget: Locator;
  /** The secret the API returned for the code request; the exchange must send it with the code. */
  secret: string;
}

async function openCodeStep(page: Page): Promise<CodeStep> {
  const widget = await openMailEntry(page);
  await widget
    .getByPlaceholder('example@mail.com')
    .fill(`widget-code-${randomBytes(4).toString('hex')}@example.invalid`);
  const codeRequest = page.waitForResponse(
    (res) => res.url().endsWith('/v1/auth/mail') && res.request().method() === 'POST',
  );
  await widget.getByRole('button', { name: 'Next' }).click();
  const { secret } = (await (await codeRequest).json()) as { secret: string };
  expect(secret, 'the API answers the code request with a secret').toBeTruthy();
  await expect(widget.getByPlaceholder('6-digit code')).toBeVisible({ timeout: 15_000 });
  return { widget, secret };
}

/**
 * Submits a wrong code and waits for the API's answer, so a message left from the previous attempt
 * cannot pass for this one. The request must carry the typed code with the request's secret.
 */
async function submitWrongCode({ widget, secret }: CodeStep): Promise<void> {
  await widget.getByPlaceholder('6-digit code').fill(WRONG_CODE);
  const answer = widget
    .page()
    .waitForResponse((res) => res.url().endsWith('/v1/auth/mail/code') && res.request().method() === 'POST');
  await widget.getByRole('button', { name: 'Confirm' }).click();
  expect((await answer).request().postDataJSON()).toEqual({ secret, code: WRONG_CODE });
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
  test.describe.configure({ retries: 0 });

  test('mail entry', async ({ page }) => {
    const widget = await openMailEntry(page);
    await expectScreenshot(widget, 'widget-mail-code-01-mail-entry.png');
  });

  test('code entry, wrong code and new code sent', async ({ page }) => {
    const step = await openCodeStep(page);
    const { widget } = step;
    await expect(
      widget.getByText('We have sent you an email with a 6-digit code. Please enter it here to log in.'),
    ).toBeVisible();
    await expectScreenshot(widget, 'widget-mail-code-02-code-entry.png');

    await submitWrongCode(step);
    await expect(widget.getByText(INVALID)).toBeVisible();
    await expectScreenshot(widget, 'widget-mail-code-03-wrong-code.png');

    await widget.getByRole('button', { name: 'Send new code' }).click();
    await expect(widget.getByText(RESENT)).toBeVisible();
    await expect(widget.getByText(INVALID)).toHaveCount(0);
    await expectScreenshot(widget, 'widget-mail-code-06-new-code-sent.png');
  });

  test('expired code', async ({ page }) => {
    await page.clock.install();
    const { widget } = await openCodeStep(page);

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
    const step = await openCodeStep(page);
    const { widget } = step;

    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
      await submitWrongCode(step);
      await expect(widget.getByText(INVALID)).toBeVisible();
    }
    await submitWrongCode(step);
    await expect(widget.getByText(LOCKED)).toBeVisible();
    await expect(widget.getByPlaceholder('6-digit code')).toHaveCount(0);
    await expectScreenshot(widget, 'widget-mail-code-05-locked.png');
  });
});
