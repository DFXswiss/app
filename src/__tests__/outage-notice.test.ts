import { readFileSync } from 'fs';
import { join } from 'path';

// public/outage-notice.js is a plain script loaded by public/index.html, outside the app bundle, so
// nothing else in the suite reaches it. These tests load both files from disk into jsdom and run the
// script the way the browser does after parsing the notice element.

const INDEX_HTML = readFileSync(join(__dirname, '../../public/index.html'), 'utf8');
const SCRIPT_SOURCE = readFileSync(join(__dirname, '../../public/outage-notice.js'), 'utf8');

// 18 November 2026, 12:00 CET = 11:00 UTC, computed independently of the string in the script.
const END = Date.UTC(2026, 10, 18, 11, 0, 0, 0);

const GERMAN_LINE = 'Systemunterbruch bei DFX bis heute, 18. November 2026, 12:00 Uhr MEZ.';
const ENGLISH_LINE = 'System outage at DFX until today, 18 November 2026, 12:00 CET.';

type OutageWindow = Window & { isOutageNoticeActive?: (now: Date) => boolean };

function loadIndexHtml(): void {
  const parsed = new DOMParser().parseFromString(INDEX_HTML, 'text/html');
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;
}

function runScript(): void {
  new Function(SCRIPT_SOURCE)();
}

function notice(): HTMLElement {
  const element = document.getElementById('outage-notice');
  if (!element) throw new Error('#outage-notice not found in public/index.html');
  return element;
}

// Runs the script with spies on both addEventListener methods and returns the event types it
// registered on document and window. The spies call through and are always restored.
function runScriptRecordingListeners(): string[] {
  const documentSpy = jest.spyOn(document, 'addEventListener');
  const windowSpy = jest.spyOn(window, 'addEventListener');
  try {
    runScript();
    const documentTypes = documentSpy.mock.calls.map((call) => String(call[0]));
    const windowTypes = windowSpy.mock.calls.map((call) => String(call[0]));
    return documentTypes.concat(windowTypes);
  } finally {
    documentSpy.mockRestore();
    windowSpy.mockRestore();
  }
}

// Shows the notice again by hand after it was hidden and fires both events: if neither listener is
// still registered, nothing hides it again.
function expectNoListenerReacts(): void {
  notice().removeAttribute('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('pageshow'));
  expect(notice().hasAttribute('hidden')).toBe(false);
}

// Set on body by the script while the notice is shown, so the style block can lay out #root below it.
function hasBodyClass(): boolean {
  return document.body.classList.contains('has-outage-notice');
}

type Declarations = Map<string, string>;

// Parses the <style> block of public/index.html into selector -> (property -> value), with comments
// removed and whitespace collapsed. Fails loudly on anything it cannot parse or on a duplicate selector.
function styleRules(): Map<string, Declarations> {
  const match = /<style>([\s\S]*?)<\/style>/.exec(INDEX_HTML);
  if (!match) throw new Error('<style> block not found in public/index.html');

  const css = match[1].replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = new Map<string, Declarations>();
  for (const block of css.split('}')) {
    const open = block.indexOf('{');
    if (open === -1) {
      if (block.trim() !== '') throw new Error(`Unparsable CSS in public/index.html: ${block.trim()}`);
      continue;
    }

    const selector = block.slice(0, open).trim().replace(/\s+/g, ' ');
    const declarations: Declarations = new Map();
    for (const declaration of block.slice(open + 1).split(';')) {
      if (declaration.trim() === '') continue;
      const colon = declaration.indexOf(':');
      if (colon === -1) throw new Error(`Unparsable declaration in "${selector}": ${declaration.trim()}`);
      const property = declaration.slice(0, colon).trim();
      const value = declaration
        .slice(colon + 1)
        .trim()
        .replace(/\s+/g, ' ');
      declarations.set(property, value);
    }

    if (rules.has(selector)) throw new Error(`Duplicate rule "${selector}" in public/index.html`);
    rules.set(selector, declarations);
  }
  return rules;
}

function ruleFor(selector: string): Declarations {
  const rule = styleRules().get(selector);
  if (!rule) throw new Error(`Rule "${selector}" not found in the <style> block of public/index.html`);
  return rule;
}

function isActive(now: Date): boolean {
  const fn = (window as OutageWindow).isOutageNoticeActive;
  if (!fn) throw new Error('window.isOutageNoticeActive was not attached');
  return fn(now);
}

describe('outage notice', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    // A script loaded before the end leaves listeners on document and window that outlive the DOM
    // reset below. Driving it to its expired state makes its own syncNotice remove both listeners and
    // its timer, so no listener can leak into the next test. A script loaded at or after the end (or
    // one that threw) registered nothing, and one that already expired during the test removed its
    // listeners; for both the dispatch is a no-op.
    jest.setSystemTime(new Date(END + 1));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(jest.getTimerCount()).toBe(0);
    jest.clearAllTimers();
    jest.useRealTimers();
    delete (window as OutageWindow).isOutageNoticeActive;
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    // loadIndexHtml() replaces only the content of body, not its class attribute.
    document.body.className = '';
  });

  describe('public/index.html markup', () => {
    beforeEach(() => {
      loadIndexHtml();
    });

    it('places the notice outside #root and before it, so React never removes it', () => {
      const root = document.getElementById('root');
      if (!root) throw new Error('#root not found in public/index.html');

      expect(root.contains(notice())).toBe(false);
      expect(notice().compareDocumentPosition(root) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('is a hidden polite live region without a role by default', () => {
      expect(notice().hasAttribute('role')).toBe(false);
      expect(notice().getAttribute('aria-live')).toBe('polite');
      expect(notice().hasAttribute('hidden')).toBe(true);
    });

    it('does not match the loading spinner selector', () => {
      // The full-stack E2E fixtures treat this selector as the app's loading spinner.
      expect(notice().matches('[role="status"], .animate-spin')).toBe(false);
    });

    it('contains both text lines, German first', () => {
      const lines = Array.from(notice().querySelectorAll('p')).map((p) => p.textContent);

      expect(lines).toEqual([GERMAN_LINE, ENGLISH_LINE]);
    });

    it('loads the script after the notice and before #root, without inline code', () => {
      const scripts = Array.from(document.body.querySelectorAll('script'));

      expect(scripts).toHaveLength(1);
      expect(scripts[0].getAttribute('src')).toBe('%REACT_APP_PUBLIC_URL%/outage-notice.js');
      expect(scripts[0].textContent).toBe('');
      expect(notice().nextElementSibling).toBe(scripts[0]);
      expect(scripts[0].nextElementSibling?.id).toBe('root');
    });
  });

  describe('public/index.html styles', () => {
    // src/index.css makes every body > div a full-height flex column; these rules keep the notice
    // as tall as its text and let #root take only the remaining height while the notice is shown.
    it('lets the notice opt out of the global body > div rule', () => {
      const rule = ruleFor('.outage-notice');

      expect(rule.get('display')).toBe('block');
      expect(rule.get('height')).toBe('auto');
      expect(rule.get('flex')).toBe('none');
    });

    it('still hides the notice with the hidden attribute', () => {
      expect(ruleFor('.outage-notice[hidden]').get('display')).toBe('none');
    });

    it('makes body a flex column while the notice is shown', () => {
      const rule = ruleFor('body.has-outage-notice');

      expect(rule.get('display')).toBe('flex');
      expect(rule.get('flex-direction')).toBe('column');
    });

    it('lets #root fill the remaining height while the notice is shown', () => {
      const rule = ruleFor('body.has-outage-notice > #root');

      expect(rule.get('height')).toBe('auto');
      expect(rule.get('flex')).toBe('1 1 auto');
      expect(rule.get('min-height')).toBe('0');
    });
  });

  describe('visibility at load', () => {
    beforeEach(() => {
      loadIndexHtml();
    });

    it('shows the notice one millisecond before the end', () => {
      jest.setSystemTime(new Date(END - 1));

      runScript();

      expect(notice().hasAttribute('hidden')).toBe(false);
      expect(notice().hidden).toBe(false);
      expect(hasBodyClass()).toBe(true);
    });

    it('keeps the notice hidden exactly at the end', () => {
      jest.setSystemTime(new Date(END));

      const registered = runScriptRecordingListeners();

      expect(notice().hasAttribute('hidden')).toBe(true);
      expect(hasBodyClass()).toBe(false);
      expect(registered).not.toContain('visibilitychange');
      expect(registered).not.toContain('pageshow');
    });

    it('keeps the notice hidden after the end', () => {
      jest.setSystemTime(new Date(END + 24 * 60 * 60 * 1000));

      const registered = runScriptRecordingListeners();

      expect(notice().hasAttribute('hidden')).toBe(true);
      expect(hasBodyClass()).toBe(false);
      expect(registered).not.toContain('visibilitychange');
      expect(registered).not.toContain('pageshow');
    });
  });

  describe('hiding in an open tab', () => {
    beforeEach(() => {
      loadIndexHtml();
    });

    it('hides the notice again exactly at the end when loaded before it', () => {
      jest.setSystemTime(new Date(END - 1000));

      runScript();

      expect(notice().hasAttribute('hidden')).toBe(false);
      expect(hasBodyClass()).toBe(true);

      jest.advanceTimersByTime(999);

      expect(notice().hasAttribute('hidden')).toBe(false);
      expect(hasBodyClass()).toBe(true);

      jest.advanceTimersByTime(1);

      expect(notice().hasAttribute('hidden')).toBe(true);
      expect(hasBodyClass()).toBe(false);
    });

    it('schedules no timer when loaded exactly at the end', () => {
      jest.setSystemTime(new Date(END));

      const registered = runScriptRecordingListeners();

      expect(jest.getTimerCount()).toBe(0);
      expect(hasBodyClass()).toBe(false);
      expect(registered).not.toContain('visibilitychange');
      expect(registered).not.toContain('pageshow');
    });

    it('schedules no timer when loaded after the end', () => {
      jest.setSystemTime(new Date(END + 1));

      const registered = runScriptRecordingListeners();

      expect(jest.getTimerCount()).toBe(0);
      expect(hasBodyClass()).toBe(false);
      expect(registered).not.toContain('visibilitychange');
      expect(registered).not.toContain('pageshow');
    });

    it('reschedules exactly one timer when the timer fires before the end', () => {
      jest.setSystemTime(new Date(END - 1000));

      runScript();

      jest.setSystemTime(new Date(END - 5000));
      jest.runOnlyPendingTimers();

      expect(notice().hasAttribute('hidden')).toBe(false);
      expect(hasBodyClass()).toBe(true);
      expect(jest.getTimerCount()).toBe(1);
    });
  });

  describe('re-checking the wall clock after sleep or a frozen tab', () => {
    beforeEach(() => {
      loadIndexHtml();
    });

    it('hides the notice on visibilitychange once the end has passed, without the timer firing', () => {
      jest.setSystemTime(new Date(END - 60000));

      runScript();

      expect(notice().hasAttribute('hidden')).toBe(false);
      expect(hasBodyClass()).toBe(true);

      jest.setSystemTime(new Date(END + 1));
      document.dispatchEvent(new Event('visibilitychange'));

      expect(notice().hasAttribute('hidden')).toBe(true);
      expect(hasBodyClass()).toBe(false);
      expectNoListenerReacts();
    });

    it('hides the notice on pageshow once the end has passed, without the timer firing', () => {
      jest.setSystemTime(new Date(END - 60000));

      runScript();

      expect(notice().hasAttribute('hidden')).toBe(false);
      expect(hasBodyClass()).toBe(true);

      jest.setSystemTime(new Date(END + 1));
      window.dispatchEvent(new Event('pageshow'));

      expect(notice().hasAttribute('hidden')).toBe(true);
      expect(hasBodyClass()).toBe(false);
      expect(jest.getTimerCount()).toBe(0);
      expectNoListenerReacts();
    });

    it('corrects a timer delayed by sleep on visibilitychange before the end', () => {
      // Loaded 60 s before the end, the pending timer has 60 s left. The wall clock then jumps to 1 s
      // before the end without the timer advancing (device asleep). The re-check must replace it with
      // a 1 s timer instead of leaving the stale 60 s one.
      jest.setSystemTime(new Date(END - 60000));

      runScript();

      jest.setSystemTime(new Date(END - 1000));
      document.dispatchEvent(new Event('visibilitychange'));
      jest.advanceTimersByTime(1000);

      expect(notice().hasAttribute('hidden')).toBe(true);
      expect(hasBodyClass()).toBe(false);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('keeps the notice visible on visibilitychange before the end', () => {
      jest.setSystemTime(new Date(END - 60000));

      runScript();

      jest.setSystemTime(new Date(END - 30000));
      document.dispatchEvent(new Event('visibilitychange'));

      expect(notice().hasAttribute('hidden')).toBe(false);
      expect(jest.getTimerCount()).toBe(1);
    });

    it('clears the timer when hidden through an event and tolerates further events', () => {
      jest.setSystemTime(new Date(END - 60000));

      runScript();

      expect(jest.getTimerCount()).toBe(1);

      jest.setSystemTime(new Date(END + 1));
      document.dispatchEvent(new Event('visibilitychange'));

      expect(notice().hasAttribute('hidden')).toBe(true);
      expect(jest.getTimerCount()).toBe(0);

      expect(() => document.dispatchEvent(new Event('visibilitychange'))).not.toThrow();
      expect(notice().hasAttribute('hidden')).toBe(true);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('registers nothing when loaded exactly at the end', () => {
      jest.setSystemTime(new Date(END));

      const registered = runScriptRecordingListeners();

      expect(registered).not.toContain('visibilitychange');
      expect(registered).not.toContain('pageshow');

      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pageshow'));

      expect(notice().hasAttribute('hidden')).toBe(true);
      expect(hasBodyClass()).toBe(false);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('registers nothing when loaded after the end', () => {
      jest.setSystemTime(new Date(END + 1));

      const registered = runScriptRecordingListeners();

      expect(registered).not.toContain('visibilitychange');
      expect(registered).not.toContain('pageshow');

      document.dispatchEvent(new Event('visibilitychange'));

      expect(notice().hasAttribute('hidden')).toBe(true);
      expect(hasBodyClass()).toBe(false);
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  describe('isOutageNoticeActive', () => {
    beforeEach(() => {
      loadIndexHtml();
      jest.setSystemTime(new Date(END));
      runScript();
    });

    it('is true strictly before the end and false from the end on', () => {
      expect(isActive(new Date(END - 1))).toBe(true);
      expect(isActive(new Date('2026-11-18T11:59:59.999+01:00'))).toBe(true);
      expect(isActive(new Date(END))).toBe(false);
      expect(isActive(new Date('2026-11-18T12:00:00+01:00'))).toBe(false);
      expect(isActive(new Date(END + 1))).toBe(false);
    });

    it('throws for an argument that is not a Date', () => {
      const fn = (window as OutageWindow).isOutageNoticeActive as unknown as (now: unknown) => boolean;

      expect(() => fn(END)).toThrow(TypeError);
      expect(() => fn(undefined)).toThrow(TypeError);
    });

    it('throws for an invalid Date', () => {
      expect(() => isActive(new Date('not a date'))).toThrow(TypeError);
    });
  });

  it('throws when the notice element is missing', () => {
    jest.setSystemTime(new Date(END - 1));
    document.body.innerHTML = '<div id="root"></div>';

    expect(() => runScript()).toThrow('Outage notice: element #outage-notice is missing');
  });
});
