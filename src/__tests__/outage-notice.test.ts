import { readFileSync } from 'fs';
import { join } from 'path';

// public/outage-notice.js is a plain script loaded by public/index.html, outside the app bundle, so
// nothing else in the suite reaches it. These tests load both files from disk into jsdom and run the
// script the way the browser does after parsing the notice elements.
//
// Two independent parts: the bar (#outage-notice) is the time-limited outage notice and expires at
// END; the popup (#outage-popup) is the security notice, shown on every load until a deployment
// removes it, and never touched by the bar's expiry.

const INDEX_HTML = readFileSync(join(__dirname, '../../public/index.html'), 'utf8');
const SCRIPT_SOURCE = readFileSync(join(__dirname, '../../public/outage-notice.js'), 'utf8');

// 18 November 2026, 12:00 CET = 11:00 UTC, computed independently of the string in the script.
const END = Date.UTC(2026, 10, 18, 11, 0, 0, 0);

const GERMAN_LINE = 'Systemunterbruch bei DFX bis heute, 18. November 2026, 12:00 Uhr MEZ.';
const ENGLISH_LINE = 'System outage at DFX until today, 18 November 2026, 12:00 CET.';

// Both notices verbatim (en dash in the titles, warning sign in the third paragraph), Swiss spelling
// in German.
const POPUP_TITLE_DE = 'DFX Sicherheitsupdate – Wichtiger Hinweis';
const POPUP_WARNING_DE =
  '⚠️ Wichtig: Bitte sende bis auf Weiteres keine Kryptowährungen an DFX-Einzahlungsadressen. ' +
  'Dies gilt auch für bereits gespeicherte Einzahlungsadressen. Gelder, die an kompromittierte Adressen ' +
  'gesendet werden, können gefährdet sein.';
const POPUP_PARAGRAPHS_DE = [
  'Wir verzeichnen derzeit einen Sicherheitsvorfall, der DFX-Einzahlungsadressen betrifft.',
  'Es wurden keine Kundendaten und keine Kundengelder kompromittiert. DFX arbeitet non-custodial und verwahrt keine Kundengelder.',
  POPUP_WARNING_DE,
  'Wir arbeiten daran, alle betroffenen Adressen zu ersetzen und unsere Dienste so schnell und sicher wie möglich wiederherzustellen.',
  'Wir informieren dich, sobald die neuen Einzahlungsadressen verfügbar sind und Transaktionen wieder sicher möglich sind.',
  'Vielen Dank für deine Geduld und dein Verständnis.',
];
const POPUP_TITLE_EN = 'DFX Security Update – Important Notice';
const POPUP_WARNING_EN =
  '⚠️ Important: Please do not send any cryptocurrency to DFX deposit addresses until further notice. ' +
  'This also applies to previously saved deposit addresses. Funds sent to compromised addresses may be at risk.';
const POPUP_PARAGRAPHS_EN = [
  'We are currently experiencing a security incident affecting DFX deposit addresses.',
  'No customer data or customer funds have been compromised. DFX operates on a non-custodial basis and does not hold customer funds.',
  POPUP_WARNING_EN,
  'We are working to replace all affected addresses and restore our services as quickly and safely as possible.',
  'We will inform you as soon as the new deposit addresses are available and transactions can safely resume.',
  'Thank you for your patience and understanding.',
];
const DO_NOT_SEND_SENTENCE_DE = 'Bitte sende bis auf Weiteres keine Kryptowährungen an DFX-Einzahlungsadressen.';
const DO_NOT_SEND_SENTENCE_EN = 'Please do not send any cryptocurrency to DFX deposit addresses until further notice.';
const INFO_URL = 'https://dfx.swiss/security-incident';
const POST_URL = 'https://x.com/dfx_swiss/status/2122956475865677875';

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

function popup(): HTMLElement {
  const element = document.getElementById('outage-popup');
  if (!element) throw new Error('#outage-popup not found in public/index.html');
  return element;
}

function popupDialog(): HTMLElement {
  const element = popup().querySelector<HTMLElement>('.outage-popup__dialog');
  if (!element) throw new Error('.outage-popup__dialog not found in #outage-popup');
  return element;
}

function popupButton(): HTMLButtonElement {
  const element = popup().querySelector<HTMLButtonElement>('.outage-popup__close');
  if (!element) throw new Error('.outage-popup__close not found in #outage-popup');
  return element;
}

function popupSection(lang: 'de' | 'en'): HTMLElement {
  const element = popupDialog().querySelector<HTMLElement>(`section[lang="${lang}"]`);
  if (!element) throw new Error(`section[lang="${lang}"] not found in the popup dialog`);
  return element;
}

function popupTitle(lang: 'de' | 'en'): HTMLElement {
  const element = popupSection(lang).querySelector<HTMLElement>('h2');
  if (!element) throw new Error(`h2 not found in section[lang="${lang}"]`);
  return element;
}

function popupSourceLinks(): HTMLAnchorElement[] {
  return Array.from(popupDialog().querySelectorAll<HTMLAnchorElement>('.outage-popup__source a'));
}

// The six text paragraphs of one language section.
function popupParagraphs(lang: 'de' | 'en'): HTMLParagraphElement[] {
  return Array.from(popupSection(lang).querySelectorAll<HTMLParagraphElement>('p'));
}

function isPopupHidden(): boolean {
  return popup().hasAttribute('hidden');
}

function isNoticeHidden(): boolean {
  return notice().hasAttribute('hidden');
}

function clickBackdrop(): void {
  popup().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

function pressKey(key: string): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

type CloseTrigger = [name: string, close: () => void];

const CLOSE_TRIGGERS: CloseTrigger[] = [
  ['the OK button', () => popupButton().click()],
  ['a click on the backdrop', () => clickBackdrop()],
  ['Escape', () => pressKey('Escape')],
];

type ExpiryPath = [name: string, expire: () => void];

// Each path by which the bar expires in a tab loaded 60 s before the end.
const EXPIRY_PATHS: ExpiryPath[] = [
  ['the timer', () => jest.advanceTimersByTime(60000)],
  [
    'visibilitychange',
    () => {
      jest.setSystemTime(new Date(END + 1));
      document.dispatchEvent(new Event('visibilitychange'));
    },
  ],
  [
    'pageshow',
    () => {
      jest.setSystemTime(new Date(END + 1));
      window.dispatchEvent(new Event('pageshow'));
    },
  ],
];

// Runs the script with spies on the addEventListener methods of document, window and the popup and
// returns the event types it registered on them. The spies call through and are always restored.
function runScriptRecordingListeners(): string[] {
  const documentSpy = jest.spyOn(document, 'addEventListener');
  const windowSpy = jest.spyOn(window, 'addEventListener');
  const popupSpy = jest.spyOn(popup(), 'addEventListener');
  try {
    runScript();
    const documentTypes = documentSpy.mock.calls.map((call) => String(call[0]));
    const windowTypes = windowSpy.mock.calls.map((call) => String(call[0]));
    const popupTypes = popupSpy.mock.calls.map((call) => String(call[0]));
    return documentTypes.concat(windowTypes, popupTypes);
  } finally {
    documentSpy.mockRestore();
    windowSpy.mockRestore();
    popupSpy.mockRestore();
  }
}

function expectNoBarListenerRegistered(registered: string[]): void {
  expect(registered).not.toContain('visibilitychange');
  expect(registered).not.toContain('pageshow');
}

function expectPopupListenersRegistered(registered: string[]): void {
  expect(registered.filter((type) => type === 'keydown')).toHaveLength(1);
  expect(registered.filter((type) => type === 'click')).toHaveLength(1);
}

// Shows the popup again by hand after it was closed and fires every close trigger: if none of its
// listeners is still registered, nothing hides it again.
function expectNoPopupListenerReacts(): void {
  popup().removeAttribute('hidden');
  pressKey('Escape');
  clickBackdrop();
  popupButton().click();
  expect(isPopupHidden()).toBe(false);
}

// Shows the bar again by hand after it was hidden and fires both events: if neither listener is
// still registered, nothing hides it again.
function expectNoListenerReacts(): void {
  notice().removeAttribute('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('pageshow'));
  expect(isNoticeHidden()).toBe(false);
}

// Set on body by the script while the bar is shown, so the style block can lay out #root below it.
function hasBodyClass(): boolean {
  return document.body.classList.contains('has-outage-notice');
}

// The declarations of one rule. get() returns the value of a property declared once and throws for a
// property declared more than once (a fallback followed by an override); getAll() returns every value
// of a declared property in source order and throws for a property that is not declared.
interface Declarations {
  get(property: string): string | undefined;
  getAll(property: string): string[];
}

function toDeclarations(selector: string, values: Map<string, string[]>): Declarations {
  return {
    get(property: string): string | undefined {
      const all = values.get(property);
      if (!all) return undefined;
      if (all.length !== 1) {
        throw new Error(`"${property}" is declared ${all.length} times in "${selector}"; use getAll()`);
      }
      return all[0];
    },
    getAll(property: string): string[] {
      const all = values.get(property);
      if (!all) throw new Error(`"${property}" is not declared in "${selector}"`);
      return all;
    },
  };
}

// Parses declarations ("property: value; ...") into property -> values.
function parseDeclarations(selector: string, source: string): Declarations {
  const declarations = new Map<string, string[]>();
  for (const declaration of source.split(';')) {
    if (declaration.trim() === '') continue;
    const colon = declaration.indexOf(':');
    if (colon === -1) throw new Error(`Unparsable declaration in "${selector}": ${declaration.trim()}`);
    const property = declaration.slice(0, colon).trim();
    const value = declaration
      .slice(colon + 1)
      .trim()
      .replace(/\s+/g, ' ');
    const previous = declarations.get(property);
    if (previous) {
      previous.push(value);
    } else {
      declarations.set(property, [value]);
    }
  }
  return toDeclarations(selector, declarations);
}

// Parses the top-level blocks of a CSS string. A block whose selector starts with @media is parsed
// recursively; its rules are keyed as "@media (min-width: 900px) .selector", so a test can pin the
// rule inside the media query. Fails loudly on anything it cannot parse or on a duplicate selector.
function parseRules(css: string, context: string, rules: Map<string, Declarations>): void {
  let position = 0;
  while (position < css.length) {
    while (position < css.length && /\s/.test(css[position])) position++;
    if (position >= css.length) break;

    const open = css.indexOf('{', position);
    if (open === -1) throw new Error(`Unparsable CSS in public/index.html: ${css.slice(position).trim()}`);
    const selector = css.slice(position, open).trim().replace(/\s+/g, ' ');

    let depth = 1;
    let close = open + 1;
    while (close < css.length && depth > 0) {
      if (css[close] === '{') depth++;
      if (css[close] === '}') depth--;
      close++;
    }
    if (depth !== 0) throw new Error(`Unclosed block "${selector}" in public/index.html`);

    const body = css.slice(open + 1, close - 1);
    if (selector.startsWith('@media')) {
      parseRules(body, selector, rules);
    } else {
      const key = context ? `${context} ${selector}` : selector;
      if (rules.has(key)) throw new Error(`Duplicate rule "${key}" in public/index.html`);
      rules.set(key, parseDeclarations(key, body));
    }
    position = close;
  }
}

// Parses the <style> block of public/index.html into selector -> (property -> values), with comments
// removed and whitespace collapsed.
function styleRules(): Map<string, Declarations> {
  const match = /<style>([\s\S]*?)<\/style>/.exec(INDEX_HTML);
  if (!match) throw new Error('<style> block not found in public/index.html');

  const rules = new Map<string, Declarations>();
  parseRules(match[1].replace(/\/\*[\s\S]*?\*\//g, ''), '', rules);
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
    // A script that ran leaves listeners on document and window that outlive the DOM reset below:
    // the popup's keydown listener (on every load) and, when loaded before the end, visibilitychange
    // and pageshow. Escape closes an open popup, which removes its keydown and click listeners.
    // Driving the bar to its expired state then makes its own syncNotice remove its listeners and its
    // timer. For a script that threw, or whose popup or bar was already closed or expired during the
    // test, the respective dispatch is a no-op. So no listener can leak into the next test.
    pressKey('Escape');
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

    it('contains both text lines in the bar, German first', () => {
      const lines = Array.from(notice().querySelectorAll('p')).map((p) => p.textContent);

      expect(lines).toEqual([GERMAN_LINE, ENGLISH_LINE]);
    });

    it('loads the script after the notice and the popup and before #root, without inline code', () => {
      const scripts = Array.from(document.body.querySelectorAll('script'));

      expect(scripts).toHaveLength(1);
      expect(scripts[0].getAttribute('src')).toBe('%REACT_APP_PUBLIC_URL%/outage-notice.js');
      expect(scripts[0].textContent).toBe('');
      expect(notice().nextElementSibling).toBe(popup());
      expect(popup().nextElementSibling).toBe(scripts[0]);
      expect(scripts[0].nextElementSibling?.id).toBe('root');
    });

    it('places the popup outside #root, as a direct child of body', () => {
      const root = document.getElementById('root');
      if (!root) throw new Error('#root not found in public/index.html');

      expect(root.contains(popup())).toBe(false);
      expect(popup().parentElement).toBe(document.body);
    });

    it('hides the popup by default', () => {
      expect(popup().hasAttribute('hidden')).toBe(true);
    });

    it('marks the dialog box as a modal dialog labelled by both headings', () => {
      const dialog = popupDialog();
      const labelId = dialog.getAttribute('aria-labelledby');
      if (!labelId) throw new Error('aria-labelledby missing on the popup dialog');
      const labelIds = labelId.split(/\s+/);

      expect(dialog.getAttribute('role')).toBe('dialog');
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(dialog.hasAttribute('lang')).toBe(false);
      expect(dialog.parentElement).toBe(popup());
      // Focusable by script only, not in the tab order: the script focuses the box on show.
      expect(dialog.getAttribute('tabindex')).toBe('-1');
      expect(popup().hasAttribute('role')).toBe(false);
      expect(labelIds).toHaveLength(2);
      expect(labelIds.map((id) => document.getElementById(id))).toEqual([popupTitle('de'), popupTitle('en')]);
      expect(labelIds[0]).not.toBe(labelIds[1]);
      for (const label of labelIds.map((id) => document.getElementById(id))) {
        expect(label?.tagName).toBe('H2');
        expect(label && dialog.contains(label)).toBe(true);
      }
    });

    it('shows both language sections, German first, each with its own lang attribute and heading', () => {
      const content = popupDialog().querySelector('.outage-popup__content');
      if (!content) throw new Error('.outage-popup__content not found in the popup dialog');
      const sections = Array.from(content.children).filter((child) => child.tagName === 'SECTION');

      expect(sections.map((section) => section.getAttribute('lang'))).toEqual(['de', 'en']);
      expect(sections[0]).toBe(popupSection('de'));
      expect(sections[1]).toBe(popupSection('en'));
      expect(popupTitle('de').textContent).toBe(POPUP_TITLE_DE);
      expect(popupTitle('en').textContent).toBe(POPUP_TITLE_EN);
      expect(popupTitle('de').classList.contains('outage-popup__title')).toBe(true);
      expect(popupTitle('en').classList.contains('outage-popup__title')).toBe(true);
      expect(popupDialog().querySelectorAll('h2')).toHaveLength(2);
    });

    it('shows the six German paragraphs verbatim and in order', () => {
      expect(popupParagraphs('de').map((p) => p.textContent)).toEqual(POPUP_PARAGRAPHS_DE);
      expect(popupParagraphs('de')).toHaveLength(6);
    });

    it('shows the six English paragraphs verbatim and in order', () => {
      expect(popupParagraphs('en').map((p) => p.textContent)).toEqual(POPUP_PARAGRAPHS_EN);
      expect(popupParagraphs('en')).toHaveLength(6);
    });

    it('contains the sentence not to send any cryptocurrency in both languages, in the emphasised paragraph', () => {
      const warningDe = popupSection('de').querySelector('.outage-popup__warning');
      const warningEn = popupSection('en').querySelector('.outage-popup__warning');
      if (!warningDe || !warningEn) throw new Error('.outage-popup__warning not found in a language section');

      expect(popupSection('de').textContent).toContain(DO_NOT_SEND_SENTENCE_DE);
      expect(popupSection('en').textContent).toContain(DO_NOT_SEND_SENTENCE_EN);
      expect(warningDe.tagName).toBe('P');
      expect(warningDe.textContent).toBe(POPUP_WARNING_DE);
      expect(warningDe.textContent).toContain(DO_NOT_SEND_SENTENCE_DE);
      expect(warningEn.tagName).toBe('P');
      expect(warningEn.textContent).toBe(POPUP_WARNING_EN);
      expect(warningEn.textContent).toContain(DO_NOT_SEND_SENTENCE_EN);
    });

    it('links the source line to the security page and the post on X in a new tab, without opener', () => {
      const links = popupSourceLinks();
      expect(links).toHaveLength(2);

      const [infoLink, xLink] = links;
      expect(infoLink.textContent).toBe('Mehr Infos / More info');
      expect(infoLink.getAttribute('href')).toBe(INFO_URL);
      expect(infoLink.hasAttribute('target')).toBe(false);

      const relAttribute = xLink.getAttribute('rel');
      if (relAttribute === null) throw new Error('rel missing on the source link');
      const rel = relAttribute.split(/\s+/);

      expect(xLink.textContent).toBe('DFX on X');
      expect(xLink.getAttribute('href')).toBe(POST_URL);
      expect(xLink.getAttribute('target')).toBe('_blank');
      expect(rel).toContain('noopener');
      expect(rel).toContain('noreferrer');
      expect(popupDialog().querySelectorAll('a')).toHaveLength(2);
      expect(popupDialog().querySelector('.outage-popup__source')?.textContent).toBe(
        'Mehr Infos / More info · DFX on X',
      );
    });

    it('orders heading, paragraphs, source line and OK button', () => {
      const children = Array.from(popupDialog().children);

      expect(children.map((child) => child.tagName)).toEqual(['DIV', 'P', 'BUTTON']);
      expect(children[0].classList.contains('outage-popup__content')).toBe(true);
      expect(children[0].querySelectorAll('section')).toHaveLength(2);
      expect(children[1].classList.contains('outage-popup__source')).toBe(true);
      expect(children[2]).toBe(popupButton());
    });

    it('contains exactly one OK button inside the dialog box', () => {
      const buttons = Array.from(popupDialog().querySelectorAll('button'));

      expect(buttons).toHaveLength(1);
      expect(buttons[0]).toBe(popupButton());
      expect(popupButton().getAttribute('type')).toBe('button');
      expect(popupButton().textContent).toBe('OK');
      expect(popupDialog().contains(popupButton())).toBe(true);
      expect(popup().querySelectorAll('button')).toHaveLength(1);
    });

    it('does not match the loading spinner selector, neither the popup nor any descendant', () => {
      // The full-stack E2E fixtures treat this selector as the app's loading spinner.
      expect(popup().matches('[role="status"], .animate-spin')).toBe(false);
      expect(popup().querySelectorAll('[role="status"], .animate-spin')).toHaveLength(0);
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

    it('uses the DFX blue bar with white text and a light separator', () => {
      const rule = ruleFor('.outage-notice');

      expect(rule.get('background-color')).toBe('#124370');
      expect(rule.get('color')).toBe('#ffffff');
      expect(rule.get('border-bottom')).toBe('2px solid rgba(255, 255, 255, 0.35)');
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

    // The popup is a body > div as well, and body is a flex column while the bar is shown; these
    // declarations take it out of the flow and centre the dialog box over the whole viewport.
    it('lets the popup opt out of the global body > div rule and cover the viewport', () => {
      const rule = ruleFor('.outage-popup');

      expect(rule.get('position')).toBe('fixed');
      expect(rule.get('top')).toBe('0');
      expect(rule.get('right')).toBe('0');
      expect(rule.get('bottom')).toBe('0');
      expect(rule.get('left')).toBe('0');
      expect(rule.get('height')).toBe('auto');
      expect(rule.get('display')).toBe('flex');
      expect(rule.get('flex-direction')).toBe('row');
      expect(rule.get('align-items')).toBe('center');
      expect(rule.get('justify-content')).toBe('center');
      expect(rule.get('flex')).toBe('none');
      expect(rule.get('padding')).toBe('1rem');
    });

    it('stacks the popup above the highest z-index the app uses (9999)', () => {
      expect(Number(ruleFor('.outage-popup').get('z-index'))).toBeGreaterThan(9999);
    });

    it('still hides the popup with the hidden attribute', () => {
      expect(ruleFor('.outage-popup[hidden]').get('display')).toBe('none');
    });

    // The long text must stay usable on small screens (320x568): the box is at most as tall as the
    // viewport minus the backdrop padding and scrolls inside, so the OK button stays reachable. The
    // vh value comes first as the fallback; the dvh value after it wins in browsers that support it,
    // so the box stays inside the visible area while mobile browser bars are shown. Narrow viewports
    // keep the single-column width and the two language sections stacked.
    it('limits the dialog box to the viewport and lets it scroll inside', () => {
      const rule = ruleFor('.outage-popup__dialog');

      expect(rule.getAll('max-height')).toEqual(['calc(100vh - 2rem)', 'calc(100dvh - 2rem)']);
      expect(rule.get('max-width')).toBe('min(32rem, calc(100vw - 2rem))');
      expect(rule.get('overflow-y')).toBe('auto');
      expect(rule.get('box-sizing')).toBe('border-box');
    });

    it('uses the DFX blue dialog with white text, a light border and a dark shadow', () => {
      const rule = ruleFor('.outage-popup__dialog');

      expect(rule.get('background-color')).toBe('#124370');
      expect(rule.get('color')).toBe('#ffffff');
      expect(rule.get('border')).toBe('1px solid rgba(255, 255, 255, 0.35)');
      expect(rule.get('box-shadow')).toBe('0 12px 32px rgba(0, 0, 0, 0.45)');
    });

    it('separates the stacked language sections with a thin line', () => {
      expect(ruleFor('.outage-popup__content > section + section').get('border-top')).toBe(
        '1px solid rgba(255, 255, 255, 0.35)',
      );
    });

    it('shows both languages side by side in two equal columns from 900px on', () => {
      expect(styleRules().has('@media (min-width: 900px) .outage-popup__content')).toBe(true);
      const grid = ruleFor('@media (min-width: 900px) .outage-popup__content');
      expect(grid.get('display')).toBe('grid');
      expect(grid.get('grid-template-columns')).toBe('1fr 1fr');
      expect(grid.get('gap')).toBe('24px');
      expect(ruleFor('@media (min-width: 900px) .outage-popup__dialog').get('max-width')).toBe(
        'min(64rem, calc(100vw - 2rem))',
      );
      // No separator line once the sections stand next to each other.
      expect(ruleFor('@media (min-width: 900px) .outage-popup__content > section + section').get('border-top')).toBe(
        '0',
      );
    });

    // The script focuses the box itself so it opens at its beginning; that focus must not draw a ring
    // around the whole box. Only the box opts out; the OK button and the links keep a white outline.
    it('shows no focus outline on the dialog box, but keeps white outlines on the OK button and links', () => {
      expect(ruleFor('.outage-popup__dialog').get('outline')).toBe('none');
      expect(ruleFor('.outage-popup__close:focus').get('outline')).toBe('3px solid #ffffff');
      expect(ruleFor('.outage-popup__close:focus').get('outline-offset')).toBe('2px');
      expect(ruleFor('.outage-popup__source a').get('outline')).toBeUndefined();
      expect(ruleFor('.outage-popup__source a:focus').get('outline')).toBe('3px solid #ffffff');
      expect(ruleFor('.outage-popup__source a:focus').get('outline-offset')).toBe('2px');
    });

    it('sets the long text left-aligned with a readable line height', () => {
      const rule = ruleFor('.outage-popup__dialog');

      expect(rule.get('text-align')).toBe('left');
      expect(rule.get('line-height')).toBe('1.45');
    });

    it('sets font size, weight and margins of the heading explicitly, independent of the app stylesheet', () => {
      const rule = ruleFor('.outage-popup__title');

      expect(rule.get('font-size')).toBe('1.25rem');
      expect(rule.get('font-weight')).toBe('700');
      expect(rule.get('margin')).toBe('0 0 12px');
      expect(rule.get('color')).toBe('#ffffff');
    });

    it('spaces the paragraphs', () => {
      expect(ruleFor('.outage-popup__dialog p').get('margin')).toBe('0');
      expect(ruleFor('.outage-popup__dialog p + p').get('margin-top')).toBe('10px');
    });

    it('sets the warning paragraph in bold', () => {
      expect(ruleFor('.outage-popup__warning').get('font-weight')).toBe('700');
    });

    it('underlines the source links in white', () => {
      const rule = ruleFor('.outage-popup__source a');

      expect(rule.get('color')).toBe('#ffffff');
      expect(rule.get('text-decoration')).toBe('underline');
      expect(ruleFor('.outage-popup__dialog').get('color')).toBe('#ffffff');
    });

    it('keeps the OK button at least 44px tall as a touch target', () => {
      expect(ruleFor('.outage-popup__close').get('min-height')).toBe('44px');
    });

    it('styles the OK button white on blue and keeps a visible white focus outline', () => {
      const rule = ruleFor('.outage-popup__close');

      expect(rule.get('background-color')).toBe('#ffffff');
      expect(rule.get('color')).toBe('#124370');
      expect(rule.get('font-weight')).toBe('700');
      expect(ruleFor('.outage-popup__close:focus').get('outline')).toBe('3px solid #ffffff');
      expect(ruleFor('.outage-popup__close:focus').get('outline-offset')).toBe('2px');
    });
  });

  describe('visibility at load', () => {
    beforeEach(() => {
      loadIndexHtml();
    });

    it('shows the bar one millisecond before the end', () => {
      jest.setSystemTime(new Date(END - 1));

      runScript();

      expect(isNoticeHidden()).toBe(false);
      expect(notice().hidden).toBe(false);
      expect(hasBodyClass()).toBe(true);
    });

    it.each([
      ['one millisecond before the end', END - 1],
      ['exactly at the end', END],
      ['one millisecond after the end', END + 1],
      ['one day after the end', END + 24 * 60 * 60 * 1000],
    ])('shows the popup when loaded %s, focuses the dialog box and registers its listeners', (_, now) => {
      jest.setSystemTime(new Date(now));

      const registered = runScriptRecordingListeners();

      expect(isPopupHidden()).toBe(false);
      expect(popup().hidden).toBe(false);
      expect(document.activeElement).toBe(popupDialog());
      expect(document.activeElement).not.toBe(popupButton());
      expectPopupListenersRegistered(registered);
    });

    // Focusing the OK button at the end of the long text would make the browser scroll the box to its
    // bottom on small screens. The box itself is focused without scrolling and reset to its top.
    it.each([
      ['before the end', END - 1],
      ['after the end', END + 1],
    ])('opens the dialog box at its beginning when loaded %s', (_, now) => {
      jest.setSystemTime(new Date(now));
      const dialog = popupDialog();
      // jsdom does not lay out, so its scrollTop ignores writes; an own writable property stands in for
      // a box the browser has already scrolled, to prove that the script resets it.
      Object.defineProperty(dialog, 'scrollTop', { value: 120, writable: true, configurable: true });
      const dialogFocusSpy = jest.spyOn(dialog, 'focus');
      const buttonFocusSpy = jest.spyOn(popupButton(), 'focus');
      try {
        runScript();

        expect(dialogFocusSpy).toHaveBeenCalledTimes(1);
        expect(dialogFocusSpy).toHaveBeenCalledWith({ preventScroll: true });
        expect(buttonFocusSpy).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(dialog);
        expect(dialog.scrollTop).toBe(0);
      } finally {
        dialogFocusSpy.mockRestore();
        buttonFocusSpy.mockRestore();
      }
    });

    it('keeps the bar hidden exactly at the end, without timer or bar listeners', () => {
      jest.setSystemTime(new Date(END));

      const registered = runScriptRecordingListeners();

      expect(isNoticeHidden()).toBe(true);
      expect(hasBodyClass()).toBe(false);
      expect(jest.getTimerCount()).toBe(0);
      expectNoBarListenerRegistered(registered);
    });

    it('keeps the bar hidden after the end, without timer or bar listeners', () => {
      jest.setSystemTime(new Date(END + 24 * 60 * 60 * 1000));

      const registered = runScriptRecordingListeners();

      expect(isNoticeHidden()).toBe(true);
      expect(hasBodyClass()).toBe(false);
      expect(jest.getTimerCount()).toBe(0);
      expectNoBarListenerRegistered(registered);
    });

    it('registers the bar listeners and one timer when loaded before the end', () => {
      jest.setSystemTime(new Date(END - 1));

      const registered = runScriptRecordingListeners();

      expect(registered).toContain('visibilitychange');
      expect(registered).toContain('pageshow');
      expect(jest.getTimerCount()).toBe(1);
    });
  });

  describe('closing the popup before the end', () => {
    beforeEach(() => {
      loadIndexHtml();
      jest.setSystemTime(new Date(END - 60000));
      runScript();
      expect(isPopupHidden()).toBe(false);
    });

    it.each(CLOSE_TRIGGERS)('closes on %s and leaves the bar visible', (_, close) => {
      close();

      expect(isPopupHidden()).toBe(true);
      expect(isNoticeHidden()).toBe(false);
      expect(hasBodyClass()).toBe(true);
      expect(jest.getTimerCount()).toBe(1);
    });

    it.each(CLOSE_TRIGGERS)('removes its listeners after closing on %s, so further events do nothing', (_, close) => {
      close();

      expect(isPopupHidden()).toBe(true);
      expectNoPopupListenerReacts();
    });

    it('closes on Escape pressed while the dialog box has the initial focus', () => {
      expect(document.activeElement).toBe(popupDialog());

      popupDialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      expect(isPopupHidden()).toBe(true);
    });

    it('closes on Escape pressed while the OK button has focus', () => {
      popupButton().focus();
      popupButton().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      expect(isPopupHidden()).toBe(true);
    });

    it('stays open on a click on the dialog box, its heading, its text or a source link', () => {
      popupDialog().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      popupTitle('de').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      popupTitle('en').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      popupParagraphs('de')[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      popupParagraphs('en')[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      // Default prevented, so jsdom does not try to follow the link.
      for (const link of popupSourceLinks()) {
        link.addEventListener('click', (event) => event.preventDefault());
        link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }

      expect(isPopupHidden()).toBe(false);
    });

    it('stays open on a key other than Escape', () => {
      pressKey('Enter');
      pressKey('a');
      pressKey('Esc');

      expect(isPopupHidden()).toBe(false);
    });

    it('stays closed on visibilitychange and pageshow before the end', () => {
      popupButton().click();

      jest.setSystemTime(new Date(END - 30000));
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pageshow'));

      expect(isPopupHidden()).toBe(true);
      expect(isNoticeHidden()).toBe(false);
      expect(jest.getTimerCount()).toBe(1);
    });

    it('stays closed when the timer fires early, before the end', () => {
      popupButton().click();

      jest.setSystemTime(new Date(END - 90000));
      jest.runOnlyPendingTimers();

      expect(isPopupHidden()).toBe(true);
      expect(isNoticeHidden()).toBe(false);
      expect(jest.getTimerCount()).toBe(1);
    });

    it('still hides the bar at the end after the popup was closed, and the popup stays closed', () => {
      popupButton().click();

      jest.advanceTimersByTime(60000);

      expect(isPopupHidden()).toBe(true);
      expect(isNoticeHidden()).toBe(true);
      expect(hasBodyClass()).toBe(false);
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  describe('closing the popup when loaded at or after the end', () => {
    describe.each([
      ['exactly at the end', END],
      ['after the end', END + 1],
    ])('loaded %s', (_, now) => {
      beforeEach(() => {
        loadIndexHtml();
        jest.setSystemTime(new Date(now));
        runScript();
        expect(isPopupHidden()).toBe(false);
        expect(isNoticeHidden()).toBe(true);
      });

      it.each(CLOSE_TRIGGERS)('closes only the popup on %s and removes its listeners', (_, close) => {
        close();

        expect(isPopupHidden()).toBe(true);
        expect(isNoticeHidden()).toBe(true);
        expect(hasBodyClass()).toBe(false);
        expect(jest.getTimerCount()).toBe(0);
        expectNoPopupListenerReacts();
      });

      it('stays open on visibilitychange and pageshow, which do not touch the bar either', () => {
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('pageshow'));

        expect(isPopupHidden()).toBe(false);
        expect(isNoticeHidden()).toBe(true);
        expect(hasBodyClass()).toBe(false);
        expect(jest.getTimerCount()).toBe(0);
      });
    });
  });

  describe('expiry of the bar leaves the popup alone', () => {
    beforeEach(() => {
      loadIndexHtml();
      jest.setSystemTime(new Date(END - 60000));
      runScript();
      expect(isPopupHidden()).toBe(false);
      expect(isNoticeHidden()).toBe(false);
    });

    it.each(EXPIRY_PATHS)('keeps an open popup visible when the bar expires through %s', (_, expire) => {
      expire();

      expect(isNoticeHidden()).toBe(true);
      expect(hasBodyClass()).toBe(false);
      expect(jest.getTimerCount()).toBe(0);
      expect(isPopupHidden()).toBe(false);
    });

    describe.each(EXPIRY_PATHS)('after the bar expired through %s', (_, expire) => {
      it.each(CLOSE_TRIGGERS)('still closes the popup on %s and then removes its listeners', (__, close) => {
        expire();
        expect(isPopupHidden()).toBe(false);

        close();

        expect(isPopupHidden()).toBe(true);
        expect(isNoticeHidden()).toBe(true);
        expectNoPopupListenerReacts();
      });
    });
  });

  describe('hiding the bar in an open tab', () => {
    beforeEach(() => {
      loadIndexHtml();
    });

    it('hides the bar again exactly at the end when loaded before it', () => {
      jest.setSystemTime(new Date(END - 1000));

      runScript();

      expect(isNoticeHidden()).toBe(false);
      expect(hasBodyClass()).toBe(true);

      jest.advanceTimersByTime(999);

      expect(isNoticeHidden()).toBe(false);
      expect(hasBodyClass()).toBe(true);

      jest.advanceTimersByTime(1);

      expect(isNoticeHidden()).toBe(true);
      expect(hasBodyClass()).toBe(false);
      expect(isPopupHidden()).toBe(false);
      expectNoListenerReacts();
    });

    it('reschedules exactly one timer when the timer fires before the end', () => {
      jest.setSystemTime(new Date(END - 1000));

      runScript();

      jest.setSystemTime(new Date(END - 5000));
      jest.runOnlyPendingTimers();

      expect(isNoticeHidden()).toBe(false);
      expect(hasBodyClass()).toBe(true);
      expect(jest.getTimerCount()).toBe(1);
    });
  });

  describe('re-checking the wall clock after sleep or a frozen tab', () => {
    beforeEach(() => {
      loadIndexHtml();
    });

    it('hides the bar on visibilitychange once the end has passed, without the timer firing', () => {
      jest.setSystemTime(new Date(END - 60000));

      runScript();

      expect(isNoticeHidden()).toBe(false);
      expect(hasBodyClass()).toBe(true);

      jest.setSystemTime(new Date(END + 1));
      document.dispatchEvent(new Event('visibilitychange'));

      expect(isNoticeHidden()).toBe(true);
      expect(hasBodyClass()).toBe(false);
      expect(isPopupHidden()).toBe(false);
      expectNoListenerReacts();
    });

    it('hides the bar on pageshow once the end has passed, without the timer firing', () => {
      jest.setSystemTime(new Date(END - 60000));

      runScript();

      expect(isNoticeHidden()).toBe(false);
      expect(hasBodyClass()).toBe(true);

      jest.setSystemTime(new Date(END + 1));
      window.dispatchEvent(new Event('pageshow'));

      expect(isNoticeHidden()).toBe(true);
      expect(hasBodyClass()).toBe(false);
      expect(isPopupHidden()).toBe(false);
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

      expect(isNoticeHidden()).toBe(true);
      expect(hasBodyClass()).toBe(false);
      expect(isPopupHidden()).toBe(false);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('keeps the bar and the popup visible on visibilitychange before the end', () => {
      jest.setSystemTime(new Date(END - 60000));

      runScript();

      jest.setSystemTime(new Date(END - 30000));
      document.dispatchEvent(new Event('visibilitychange'));

      expect(isNoticeHidden()).toBe(false);
      expect(isPopupHidden()).toBe(false);
      expect(jest.getTimerCount()).toBe(1);
    });

    it('clears the timer when hidden through an event and tolerates further events', () => {
      jest.setSystemTime(new Date(END - 60000));

      runScript();

      expect(jest.getTimerCount()).toBe(1);

      jest.setSystemTime(new Date(END + 1));
      document.dispatchEvent(new Event('visibilitychange'));

      expect(isNoticeHidden()).toBe(true);
      expect(jest.getTimerCount()).toBe(0);

      expect(() => document.dispatchEvent(new Event('visibilitychange'))).not.toThrow();
      expect(isNoticeHidden()).toBe(true);
      expect(jest.getTimerCount()).toBe(0);
    });

    it.each([
      ['exactly at the end', END],
      ['after the end', END + 1],
    ])('registers no bar listener and no timer when loaded %s', (_, now) => {
      jest.setSystemTime(new Date(now));

      const registered = runScriptRecordingListeners();

      expectNoBarListenerRegistered(registered);
      expectPopupListenersRegistered(registered);
      expect(jest.getTimerCount()).toBe(0);

      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pageshow'));

      expect(isNoticeHidden()).toBe(true);
      expect(hasBodyClass()).toBe(false);
      expect(isPopupHidden()).toBe(false);
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

  it.each([
    ['before the end', END - 1],
    ['after the end', END + 1],
  ])('throws when the popup element is missing, loaded %s', (_, now) => {
    jest.setSystemTime(new Date(now));
    document.body.innerHTML = '<div id="outage-notice" hidden></div><div id="root"></div>';

    expect(() => runScript()).toThrow('Outage notice: element #outage-popup is missing');
    expect(document.getElementById('outage-notice')?.hasAttribute('hidden')).toBe(true);
  });

  it.each([
    ['before the end', END - 1],
    ['after the end', END + 1],
  ])('throws when the dialog box of the popup is missing, loaded %s', (_, now) => {
    jest.setSystemTime(new Date(now));
    document.body.innerHTML =
      '<div id="outage-notice" hidden></div>' +
      '<div id="outage-popup" hidden><button type="button" class="outage-popup__close">OK</button></div>' +
      '<div id="root"></div>';

    expect(() => runScript()).toThrow('Outage notice: dialog box .outage-popup__dialog in #outage-popup is missing');
    expect(document.getElementById('outage-notice')?.hasAttribute('hidden')).toBe(true);
    expect(document.getElementById('outage-popup')?.hasAttribute('hidden')).toBe(true);
  });

  it.each([
    ['before the end', END - 1],
    ['after the end', END + 1],
  ])('throws when the OK button of the popup is missing, loaded %s', (_, now) => {
    jest.setSystemTime(new Date(now));
    document.body.innerHTML =
      '<div id="outage-notice" hidden></div>' +
      '<div id="outage-popup" hidden><div class="outage-popup__dialog" role="dialog" tabindex="-1"></div></div>' +
      '<div id="root"></div>';

    expect(() => runScript()).toThrow('Outage notice: button .outage-popup__close in #outage-popup is missing');
    expect(document.getElementById('outage-notice')?.hasAttribute('hidden')).toBe(true);
    expect(document.getElementById('outage-popup')?.hasAttribute('hidden')).toBe(true);
  });
});
