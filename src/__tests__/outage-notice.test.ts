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
    jest.clearAllTimers();
    jest.useRealTimers();
    delete (window as OutageWindow).isOutageNoticeActive;
    document.head.innerHTML = '';
    document.body.innerHTML = '';
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

  describe('visibility at load', () => {
    beforeEach(() => {
      loadIndexHtml();
    });

    it('shows the notice one millisecond before the end', () => {
      jest.setSystemTime(new Date(END - 1));

      runScript();

      expect(notice().hasAttribute('hidden')).toBe(false);
      expect(notice().hidden).toBe(false);
    });

    it('keeps the notice hidden exactly at the end', () => {
      jest.setSystemTime(new Date(END));

      runScript();

      expect(notice().hasAttribute('hidden')).toBe(true);
    });

    it('keeps the notice hidden after the end', () => {
      jest.setSystemTime(new Date(END + 24 * 60 * 60 * 1000));

      runScript();

      expect(notice().hasAttribute('hidden')).toBe(true);
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

      jest.advanceTimersByTime(999);

      expect(notice().hasAttribute('hidden')).toBe(false);

      jest.advanceTimersByTime(1);

      expect(notice().hasAttribute('hidden')).toBe(true);
    });

    it('schedules no timer when loaded exactly at the end', () => {
      jest.setSystemTime(new Date(END));

      runScript();

      expect(jest.getTimerCount()).toBe(0);
    });

    it('schedules no timer when loaded after the end', () => {
      jest.setSystemTime(new Date(END + 1));

      runScript();

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
