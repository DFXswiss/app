import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { createCx, mergeStyleModules } from '../css-classes';

const APP2_ROOT = join(__dirname, '..');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(tsx|ts)$/.test(name) && name !== 'css.ts') out.push(full);
  }
  return out;
}

function cssModuleLocals(css: string): Set<string> {
  const locals = new Set<string>();
  for (const match of css.matchAll(/([^{}]+)\{/g)) {
    const selector = match[1].trim();
    if (selector.startsWith('@')) continue;
    for (const name of selector.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)) {
      locals.add(name[1]);
    }
  }
  return locals;
}

function moduleLocals(): Set<string> {
  const locals = new Set<string>();
  for (const file of walkCssModules(APP2_ROOT)) {
    for (const name of cssModuleLocals(readFileSync(file, 'utf8'))) locals.add(name);
  }
  return locals;
}

function walkCssModules(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkCssModules(full));
    else if (name.endsWith('.module.css')) out.push(full);
  }
  return out;
}

function cxClassNames(source: string): string[] {
  const names: string[] = [];
  const call = /\bcx\s*\(/g;
  let found: RegExpExecArray | null;
  while ((found = call.exec(source))) {
    let i = found.index + found[0].length;
    let depth = 1;
    const start = i;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      else if (ch === "'" || ch === '"' || ch === '`') {
        const quote = ch;
        i += 1;
        while (i < source.length && source[i] !== quote) {
          if (source[i] === '\\') i += 1;
          i += 1;
        }
      }
      i += 1;
    }
    const inner = source
      .slice(start, i - 1)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ');
    const stringLit = /['"]([^'"]*)['"]/g;
    let lit: RegExpExecArray | null;
    while ((lit = stringLit.exec(inner))) {
      const before = inner.slice(Math.max(0, lit.index - 4), lit.index);
      if (/[=!]= ?$/.test(before)) continue;
      for (const name of lit[1].split(/\s+/)) {
        if (name) names.push(name);
      }
    }
  }
  return names;
}

describe('App 2.0 CSS module class names', () => {
  const locals = moduleLocals();

  it('exports every class name passed to cx()', () => {
    const missing: string[] = [];
    for (const file of walk(APP2_ROOT)) {
      const used = cxClassNames(readFileSync(file, 'utf8'));
      for (const name of used) {
        if (!locals.has(name)) missing.push(`${file.slice(APP2_ROOT.length + 1)}: ${name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('keeps the coming-soon wallet marker that ConnectSheet always mounts', () => {
    expect(locals.has('soon')).toBe(true);
    expect(locals.has('crow')).toBe(true);
  });

  it('defines rise keyframes in each CSS module that uses them', () => {
    for (const name of ['base.module.css', 'buy.module.css', 'support.module.css']) {
      const file = join(APP2_ROOT, 'styles', name);
      const css = readFileSync(file, 'utf8');
      expect(css).toMatch(/@keyframes\s+rise\b/);
      expect(css).toMatch(/animation(?:-name)?\s*:[^;]*\brise\b/);
    }
  });

  it('uses the CSS-module identity proxy when imports have no enumerable keys', () => {
    jest.isolateModules(() => {
      try {
        const identityProxy = new Proxy<Record<string, string>>(
          {},
          {
            get: (_target, property) => (typeof property === 'string' ? property : undefined),
          },
        );
        jest.doMock('../styles/base.module.css', () => ({ __esModule: true, default: identityProxy }));
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { cx } = require('../css') as { cx: (...parts: Array<string | false | 0 | null | undefined>) => string };
        expect(cx('ck toast')).toBe('ck toast');
      } finally {
        jest.dontMock('../styles/base.module.css');
      }
    });
  });

  it('merges duplicate local classes and rejects unknown names', () => {
    const styles = mergeStyleModules([{ app: 'app_hash', faq: 'support_faq' }, { faq: 'controls_faq' }]);
    const cx = createCx(styles);

    expect(cx(false, undefined, 0, '', 'app')).toBe('app_hash');
    expect(cx('faq')).toBe('support_faq controls_faq');
    expect(cx('faq  app')).toBe('support_faq controls_faq app_hash');
    expect(() => cx('nope')).toThrow(/unknown class "nope"/);
  });
});
