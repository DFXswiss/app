/**
 * Widget-mode feasibility and honest coverage for the e2e-stack harness.
 *
 * The frontend container image builds only the normal app entry (`src/index.tsx` via
 * `react-app-rewired build`). `src/index-widget.tsx` is never the build entry, and
 * repo-root `widget.html` is not under `public/`, so it is not copied into nginx's
 * document root. These tests document that gap empirically rather than inventing passes.
 */

import { expect, test } from './fixtures';

test.describe.configure({ mode: 'serial' });

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
    const candidatePaths = [
      '/static/js/bundle.js',
      '/widget/v1.0.css',
      '/main-widget.css',
      '/index-widget.js',
    ];
    for (const assetPath of candidatePaths) {
      const res = await page.request.get(assetPath);
      const contentType = (res.headers()['content-type'] ?? '').toLowerCase();
      const isHtml = contentType.includes('text/html');
      const isMissing = res.status() === 404 || !res.ok();
      // Real widget CSS/JS would be 200 with a non-HTML content type. SPA fallback HTML or 404
      // is the expected gap for this image.
      const isUnexpectedRealAsset = res.ok() && !isHtml && (contentType.includes('javascript') || contentType.includes('css'));
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

  // Genuinely unreachable without a widget-mode image build (out of scope for allowed files).
  test('dfx-services custom element registers and mounts Main.widget', async () => {
    test.fixme(
      true,
      'requires a widget-mode build (src/index-widget.tsx as entry) which the e2e-stack frontend image does not produce; out of scope for this lane\'s allowed files',
    );
  });

  test('widget reacts to attribute changes (lang, session, service) without page URL navigation', async () => {
    test.fixme(
      true,
      'requires a widget-mode build (src/index-widget.tsx as entry) which the e2e-stack frontend image does not produce; out of scope for this lane\'s allowed files',
    );
  });

  test('widget closed shadow tree renders without uncaught exceptions', async () => {
    test.fixme(
      true,
      'requires a widget-mode build (src/index-widget.tsx as entry) which the e2e-stack frontend image does not produce; out of scope for this lane\'s allowed files',
    );
  });
});
