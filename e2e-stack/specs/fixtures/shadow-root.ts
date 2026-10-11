/** A Playwright `Page` or `BrowserContext` — typed by shape, see the note on imports below. */
interface InitScriptTarget {
  addInitScript(script: () => void): Promise<void>;
}

/**
 * Makes every shadow root the page attaches from now on an open one, so Playwright locators can
 * reach into the `<dfx-services>` Web Component, which `src/index-widget.tsx` defines with
 * `shadow: 'closed'`.
 *
 * Test-only: the patch wraps `Element.prototype.attachShadow` in the browser of this test before
 * any page script runs, and the product code is untouched. It has to be registered before the
 * navigation that loads the widget bundle; a root attached earlier stays closed.
 *
 * What a run with it does not prove: anything that depends on the root being closed — that the
 * host page cannot read or style the widget's content is exactly what this switches off.
 *
 * The visual suite under `e2e/` imports this file directly from the harness and resolves
 * `@playwright/test` from the repository root, not from `e2e-stack/node_modules`; the two type
 * declarations are not interchangeable, so this file imports nothing.
 */
export async function forceOpenShadowRoots(target: InitScriptTarget): Promise<void> {
  await target.addInitScript(() => {
    const attachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (init: ShadowRootInit): ShadowRoot {
      return attachShadow.call(this, { ...init, mode: 'open' });
    };
  });
}
