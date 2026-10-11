import { test, expect } from '@playwright/test';
import { forceOpenShadowRoots } from '../e2e-stack/specs/fixtures/shadow-root';
import { serveWidgetChunks, startWidgetHost, WidgetHost } from './helpers/widget-host';

/**
 * E2E Visual Regression Tests: navigation menu inside the embedded app (Web Component)
 *
 * Screen: `<dfx-services>` on a host page, start screen as a guest, navigation menu open. In web
 * component mode the menu panel is anchored under the widget's own nav bar and capped to the widget
 * (`src/components/navigation.tsx`), with a widget-scoped backdrop (`src/components/layout.tsx`).
 * The host page places the widget away from the viewport's top-right corner, between host content
 * above and below it, so the screenshot shows where the menu opens relative to the widget and not
 * relative to the viewport. The spec also asserts that the panel lies inside the widget and below
 * its nav bar, that the backdrop covers the widget only (a click on host content outside the widget
 * leaves the menu open), and that a click on the backdrop inside the widget closes the menu.
 *
 * Runs against a real local API (see CONTRIBUTING.md, "Visual regression tests"); `npm run
 * e2e:stack:up` provides one on http://localhost:3000. The widget is the real widget build, served
 * with its own host page by `helpers/widget-host.ts`; build it first with `npm run widget:loc`. The
 * closed shadow root is forced open (`forceOpenShadowRoots`), so locators reach the widget; product
 * code is unchanged.
 */

const HOST_BODY = `
  <div id="host-above" style="height: 120px; padding: 16px; box-sizing: border-box; background: #e5e7eb; font: 16px sans-serif">
    Host page content above the widget
  </div>
  <div style="margin: 24px 0 0 160px; width: 600px; height: 700px"><dfx-services></dfx-services></div>
  <div style="height: 120px; padding: 16px; box-sizing: border-box; background: #e5e7eb; font: 16px sans-serif">
    Host page content below the widget
  </div>`;

test.use({ viewport: { width: 1280, height: 1000 } });

let host: WidgetHost | undefined;

test.beforeAll(async () => {
  host = await startWidgetHost(HOST_BODY);
});

// beforeAll throws before the host exists when the widget build is missing; keep that error.
test.afterAll(async () => {
  await host?.close();
});

test.describe('Widget - navigation menu', () => {
  test('menu opens under the widget nav bar, inside the widget', async ({ page }) => {
    await forceOpenShadowRoots(page);
    await serveWidgetChunks(page);
    if (!host) throw new Error('The widget host did not start.');
    await page.goto(host.url);

    const widget = page.locator('dfx-services');
    const navBar = widget.locator('#app-root > div').first();
    await widget.locator('div.cursor-pointer').first().click(); // menu icon

    const panel = widget.locator('nav > div').first();
    await expect(widget.getByRole('button', { name: 'Login' })).toBeVisible();

    const widgetBox = await widget.boundingBox();
    const navBox = await navBar.boundingBox();
    const panelBox = await panel.boundingBox();
    if (!widgetBox || !navBox || !panelBox) throw new Error('widget, nav bar or menu panel has no bounding box');

    // Inside the widget, not in the viewport's top-right corner.
    expect(panelBox.x).toBeGreaterThanOrEqual(widgetBox.x);
    expect(panelBox.y).toBeGreaterThanOrEqual(widgetBox.y);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(widgetBox.x + widgetBox.width);
    expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(widgetBox.y + widgetBox.height);
    // Under the widget's own nav bar.
    expect(panelBox.y).toBeGreaterThanOrEqual(navBox.y + navBox.height);

    // The backdrop covers exactly the widget, not the host page's viewport.
    const backdrop = widget.locator('#app-root > div.absolute.inset-0.z-40');
    await expect(backdrop).toHaveCount(1);
    const backdropBox = await backdrop.boundingBox();
    if (!backdropBox) throw new Error('the widget backdrop has no bounding box');
    expect(backdropBox.x).toBeCloseTo(widgetBox.x, 0);
    expect(backdropBox.y).toBeCloseTo(widgetBox.y, 0);
    expect(backdropBox.width).toBeCloseTo(widgetBox.width, 0);
    expect(backdropBox.height).toBeCloseTo(widgetBox.height, 0);

    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('widget-navigation-menu-01-open.png', { maxDiffPixels: 2000 });

    // A click on host content outside the widget does not reach a backdrop, so the menu stays open.
    await page.locator('#host-above').click();
    await expect(panel).toBeVisible();

    // A click on the backdrop inside the widget closes the menu.
    await backdrop.click({ position: { x: 20, y: backdropBox.height - 20 } });
    await expect(panel).toHaveCount(0);
    await expect(backdrop).toHaveCount(0);
  });
});
