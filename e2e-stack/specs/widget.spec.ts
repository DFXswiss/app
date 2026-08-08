/**
 * Widget-mode feasibility and honest coverage for the e2e-stack harness.
 *
 * `frontend-widget` now exists and serves a real widget-mode build (`src/index-widget.tsx`
 * as entry via `e2e-stack/images/frontend-widget/Dockerfile`, host document at
 * `e2e-stack/images/frontend-widget/host.html`). The three tests under "Widget mode —
 * frontend-widget build" are therefore real, passing, browser-executed tests against
 * `E2E_WIDGET_URL` (default `http://frontend-widget`).
 *
 * Coverage is deliberately limited to the OUTSIDE view of `<dfx-services>`: custom-element
 * registration, mounting/rendering (presence + non-zero size), reaction to HTML-attribute
 * changes on the light-DOM host, and absence of uncaught exceptions. The widget defines
 * its custom element with `shadow: 'closed'` (see `src/Main.widget.tsx`), so Playwright
 * cannot reach inside the shadow tree — proven earlier in this file with a synthetic
 * closed-shadow page, and re-confirmed against the real component below. That is a
 * property of the component's design, not a testing shortcut left for later.
 *
 * Observation (unchanged gap): repo-root `widget.html` is a DIFFERENT file from the new,
 * correctly-pathed `e2e-stack/images/frontend-widget/host.html` that `frontend-widget`
 * actually serves. The root file still hardcodes `http://localhost:3000` script/stylesheet
 * URLs, is not under `public/`, is not copied into any image document root, and is not
 * built or served by this harness. The new host page is not a fix for that old file; both
 * coexist, and the gap test against the normal `frontend` service remains valid.
 */

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

test.describe.configure({ mode: 'serial' });

function widgetUrl(): string {
  return process.env.E2E_WIDGET_URL ?? 'http://frontend-widget';
}

/**
 * The shared `page` fixture only allowlists `frontend` and `api`. Without this handler,
 * navigations to `frontend-widget` get an empty 200 text/plain substitute. Register
 * after the fixture's route so Playwright runs us first (most-recently-registered-first);
 * continue widget-host traffic, fallback everything else to the fixture.
 */
async function allowWidgetHost(page: Page): Promise<void> {
  const widgetHost = new URL(widgetUrl()).hostname;
  await page.route('**/*', async (route) => {
    const host = new URL(route.request().url()).hostname;
    if (host === widgetHost) return route.continue();
    return route.fallback();
  });
}

test.describe('Widget mode — closed shadow root', () => {
  test('Playwright cannot interact with content inside a closed shadow root', async ({ page }) => {
    // Minimal, browser-executed proof — no widget bundle required. Closed shadow roots
    // expose no `element.shadowRoot` and Playwright locators do not pierce them.
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="open-host"></div>
          <div id="closed-host"></div>
          <script>
            const openHost = document.getElementById('open-host');
            const openRoot = openHost.attachShadow({ mode: 'open' });
            openRoot.innerHTML = '<button id="open-btn">Open Secret</button>';

            const closedHost = document.getElementById('closed-host');
            const closedRoot = closedHost.attachShadow({ mode: 'closed' });
            closedRoot.innerHTML = '<button id="closed-btn">Closed Secret</button>';
            // Keep a reference so the closed root is not GC'd and the button stays mounted.
            window.__e2eClosedRoot = closedRoot;
          </script>
        </body>
      </html>
    `);

    // Open shadow: Playwright can reach inside via the composed tree / pierceable root.
    await expect(page.locator('#open-btn')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Open Secret' })).toBeVisible();

    // Closed shadow: no supported pierce path — locators find nothing.
    await expect(page.locator('#closed-btn')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Closed Secret' })).toHaveCount(0);

    const closedShadowRootFromDom = await page.evaluate(() => {
      const host = document.getElementById('closed-host');
      return host ? host.shadowRoot : 'missing-host';
    });
    expect(closedShadowRootFromDom, 'element.shadowRoot is null for mode: "closed"').toBeNull();

    // The button does exist if we hold the closed root ourselves (proves the tree is real).
    const closedBtnText = await page.evaluate(() => {
      const root = (window as unknown as { __e2eClosedRoot?: ShadowRoot }).__e2eClosedRoot;
      return root?.querySelector('#closed-btn')?.textContent ?? null;
    });
    expect(closedBtnText).toBe('Closed Secret');
  });
});

test.describe('Widget mode — frontend image gap', () => {
  test('running frontend does not register dfx-services or serve a widget host page', async ({ page }) => {
    // Static reading only for repo-root widget.html: it hardcodes http://localhost:3000 for
    // bundle.js / CSS (API port in this stack, not the frontend). That file is NOT copied into
    // the frontend image (not under public/; Dockerfile builds the normal CRA app only). We
    // could not load widget.html live from the running container as a real host document —
    // only by navigating its path, which hits nginx SPA fallback. Do not invent a live
    // browser test against the static widget.html content that was never served.

    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    // 1) /widget.html — SPA fallback serves the normal app index, not a widget host page.
    const widgetHtmlRes = await page.goto('/widget.html', { waitUntil: 'domcontentloaded' });
    expect(widgetHtmlRes, 'navigation to /widget.html should produce a response').toBeTruthy();
    // nginx try_files falls back to index.html → 200 of the normal SPA, not 404.
    expect(widgetHtmlRes!.status(), 'SPA fallback typically returns 200 for unknown paths').toBe(200);

    await page.waitForLoadState('networkidle').catch(() => undefined);

    const customElementOnWidgetPath = await page.evaluate(() => customElements.get('dfx-services'));
    expect(
      customElementOnWidgetPath,
      'dfx-services must not be registered — widget entry (index-widget.tsx) is not the build entry',
    ).toBeUndefined();

    const dfxServicesCount = await page.locator('dfx-services').count();
    expect(dfxServicesCount, 'no <dfx-services> host element on the SPA shell').toBe(0);

    // 2) Plausible built-widget asset paths also fail to deliver a widget bundle.
    const candidatePaths = ['/static/js/bundle.js', '/widget/v1.0.css', '/main-widget.css', '/index-widget.js'];
    for (const assetPath of candidatePaths) {
      const res = await page.request.get(assetPath);
      const contentType = (res.headers()['content-type'] ?? '').toLowerCase();
      const isHtml = contentType.includes('text/html');
      const isMissing = res.status() === 404 || !res.ok();
      // Real widget CSS/JS would be 200 with a non-HTML content type. SPA fallback HTML or 404
      // is the expected gap for this image.
      const isUnexpectedRealAsset =
        res.ok() && !isHtml && (contentType.includes('javascript') || contentType.includes('css'));
      if (isUnexpectedRealAsset && (assetPath.endsWith('.js') || assetPath.includes('bundle'))) {
        await page.goto('/');
        await page.addScriptTag({ url: assetPath }).catch(() => undefined);
        const defined = await page.evaluate(() => customElements.get('dfx-services'));
        expect(defined, `loading ${assetPath} must not register dfx-services`).toBeUndefined();
      } else {
        expect(
          isMissing || isHtml || !isUnexpectedRealAsset,
          `${assetPath}: status=${res.status()} content-type=${contentType} — expected missing widget asset or SPA HTML fallback`,
        ).toBe(true);
      }
    }

    // 3) Root of the running app is the normal SPA, still without the widget custom element.
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    const onRoot = await page.evaluate(() => customElements.get('dfx-services'));
    expect(onRoot).toBeUndefined();
    await expect(page.locator('body')).not.toBeEmpty();
    expect(pageErrors, `uncaught pageerror probing widget paths: ${pageErrors.join('; ')}`).toEqual([]);
  });
});

test.describe('Widget mode — frontend-widget build', () => {
  test('dfx-services custom element registers and mounts Main.widget', async ({ page }) => {
    await allowWidgetHost(page);

    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await page.goto(widgetUrl(), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);

    const defined = await page.evaluate(() => typeof customElements.get('dfx-services'));
    expect(defined, 'customElements.get("dfx-services") must be a function').toBe('function');

    const dfxServices = page.locator('dfx-services');
    await expect(dfxServices).toHaveCount(1);

    const box = await dfxServices.boundingBox();
    expect(box, '<dfx-services> must have a bounding box').toBeTruthy();
    expect(box!.width, 'rendered width > 0').toBeGreaterThan(0);
    expect(box!.height, 'rendered height > 0').toBeGreaterThan(0);

    expect(pageErrors, `uncaught pageerror on widget mount: ${pageErrors.join('; ')}`).toEqual([]);
  });

  test('widget accepts lang/session/service attribute changes at runtime without crashing or navigating the host page', async ({
    page,
  }) => {
    await allowWidgetHost(page);

    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await page.goto(widgetUrl(), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);

    const urlBefore = page.url();

    // Only the light-DOM attributes are externally observable at all (closed shadow root, proven
    // above). Even that is limited: App.tsx's `hasNavigatedHomeRef` only reads `params.service` on
    // the FIRST render and never re-navigates afterwards, so a `service` change after mount cannot
    // be proven to have any internal effect either from out here. What this test can honestly
    // assert: setting all three attributes after mount does not throw, does not navigate the host
    // page (MemoryRouter), and the widget stays mounted with a non-zero box. It intentionally does
    // NOT claim these attributes are "reactive" -- that would require reading rendered content
    // inside the closed shadow root, which Playwright cannot do.
    await page.evaluate(() => {
      const el = document.querySelector('dfx-services');
      if (!el) throw new Error('dfx-services host missing');
      el.setAttribute('service', 'sell');
      el.setAttribute('lang', 'de');
      el.setAttribute('session', 'e2e-widget-attr-smoke-session');
    });
    await page.waitForTimeout(1500);

    const serviceAttr = await page.evaluate(
      () => document.querySelector('dfx-services')?.getAttribute('service') ?? null,
    );
    expect(serviceAttr, 'service attribute must still be set on the host element').toBe('sell');

    const langAttr = await page.evaluate(() => document.querySelector('dfx-services')?.getAttribute('lang') ?? null);
    expect(langAttr, 'lang attribute must still be set on the host element').toBe('de');

    const sessionAttr = await page.evaluate(
      () => document.querySelector('dfx-services')?.getAttribute('session') ?? null,
    );
    expect(sessionAttr, 'session attribute must still be set on the host element').toBe(
      'e2e-widget-attr-smoke-session',
    );

    expect(page.url(), 'MemoryRouter must not change the browser URL').toBe(urlBefore);

    const dfxServices = page.locator('dfx-services');
    await expect(dfxServices).toHaveCount(1);
    const box = await dfxServices.boundingBox();
    expect(box, '<dfx-services> still mounted after attribute change').toBeTruthy();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);

    expect(pageErrors, `uncaught pageerror on attribute change: ${pageErrors.join('; ')}`).toEqual([]);
  });

  test('widget closed shadow tree renders without uncaught exceptions', async ({ page }) => {
    await allowWidgetHost(page);

    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await page.goto(widgetUrl(), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);

    // Real component: shadowRoot is null from the outside (closed mode) — same as the synthetic proof.
    // Do not use `?? 'missing'` on shadowRoot itself: null is the success value for closed mode.
    const shadowRoot = await page.evaluate(() => {
      const el = document.querySelector('dfx-services');
      if (!el) return 'missing-host';
      return el.shadowRoot;
    });
    expect(shadowRoot, 'real dfx-services.shadowRoot is null (closed)').toBeNull();

    const dfxServices = page.locator('dfx-services');
    await expect(dfxServices).toHaveCount(1);
    const box = await dfxServices.boundingBox();
    expect(box, 'content renders inside closed shadow despite uninspectable tree').toBeTruthy();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);

    expect(pageErrors, `uncaught pageerror on closed-shadow widget: ${pageErrors.join('; ')}`).toEqual([]);
  });
});
