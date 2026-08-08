#!/usr/bin/env node
/**
 * Handbook assembly for DFXswiss/services.
 *
 * Auto-discovers screenshot baselines, design tokens, logos and markdown
 * docs; generates a single deterministic index.html + manifest.json.
 *
 * No hand-maintained mapping table: new baselines appear automatically.
 * Floor guards catch empty/corrupt checkouts; exact counts are never enforced.
 *
 * Usage:
 *   npm install --prefix ./_handbook-deps --no-save --no-audit --no-fund marked@15.0.7
 *   NODE_PATH=./_handbook-deps/node_modules node scripts/handbook/build.js <output-dir>
 */

'use strict';

const fs = require('fs');
const path = require('path');

// --- Floor guards (today's counts minus a small buffer; never exact) ---
const MIN_SCREENSHOTS = 170;
const MIN_DOCS = 4;
const MIN_PNG_BYTES = 1000;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MARKED_INSTALL =
  'npm install --prefix ./_handbook-deps --no-save --no-audit --no-fund marked@15.0.7';

const SORT_LOCALE = 'en';

function sortStrings(a, b) {
  return a.localeCompare(b, SORT_LOCALE);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

// marked: hard fail with install instructions (no fallback renderer — that
// would make output environment-dependent and break determinism).
function loadMarked() {
  try {
    // eslint-disable-next-line import/no-extraneous-dependencies
    return require('marked');
  } catch (err) {
    fail(
      'handbook: marked is required but could not be loaded.\n' +
        'Install it in isolation (do not add to package.json):\n' +
        '  ' +
        MARKED_INSTALL +
        '\n' +
        'Then re-run:\n' +
        '  NODE_PATH=./_handbook-deps/node_modules node scripts/handbook/build.js <out>\n' +
        'Original error: ' +
        (err && err.message ? err.message : String(err)),
    );
  }
}

const markedModule = loadMarked();
const MarkedRenderer =
  typeof markedModule.Renderer === 'function'
    ? markedModule.Renderer
    : markedModule.marked && typeof markedModule.marked.Renderer === 'function'
      ? markedModule.marked.Renderer
      : null;
const markedParseImpl =
  typeof markedModule.parse === 'function'
    ? (md, opts) => markedModule.parse(md, opts)
    : typeof markedModule.marked?.parse === 'function'
      ? (md, opts) => markedModule.marked.parse(md, opts)
      : null;
if (!markedParseImpl) {
  fail('handbook: marked loaded but no parse() API found (expected marked@15).');
}
if (!MarkedRenderer) {
  fail('handbook: marked loaded but no Renderer class found (expected marked@15).');
}

// GitHub-compatible heading slug: lowercase; strip chars that are not letters
// (\p{L}), decimal digits (\p{Nd}) and letter numbers (\p{Nl}), marks (\p{M}),
// underscore (\p{Pc}), hyphen or space; spaces → '-'. No collapsing of multiple
// hyphens, no trim of leading/trailing hyphens. Unicode letters/digits/marks/
// underscore are kept. Other number categories (e.g. No: ² ³ ¼) are stripped,
// matching GitHub. Duplicate slugs within one document get -1, -2, … (first
// occurrence keeps the bare slug). Counter is per parse call only.
function createHeadingRenderer() {
  const renderer = new MarkedRenderer();
  const seen = new Map();
  renderer.heading = function ({ tokens, depth }) {
    const text = this.parser.parseInline(tokens, this.parser.textRenderer);
    let slug = String(text)
      .toLowerCase()
      .replace(/[^\p{L}\p{Nd}\p{Nl}\p{M}\p{Pc}\- ]/gu, '')
      .replace(/ /g, '-');
    // Register every emitted id in `seen` so later collisions never re-use a
    // suffix that is already taken (e.g. ["A","A","A-1"] → a, a-1, a-1-1).
    let candidate = slug;
    while (seen.has(candidate)) {
      const n = seen.get(slug);
      seen.set(slug, n + 1);
      candidate = slug + '-' + n;
    }
    seen.set(candidate, 1);
    if (!seen.has(slug)) seen.set(slug, 1);
    slug = candidate;
    return (
      '<h' +
      depth +
      ' id="' +
      slug +
      '">' +
      this.parser.parseInline(tokens) +
      '</h' +
      depth +
      '>\n'
    );
  };
  return renderer;
}

// Renderer is created per call so heading-id counters never leak across documents.
function markedParse(md) {
  return markedParseImpl(md, { renderer: createHeadingRenderer() });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Inverse of escapeHtml, for re-reading paths out of already-escaped HTML.
// Order matters: undo the single-character entities first, &amp; last —
// otherwise "&amp;lt;" would incorrectly decode to "<".
function decodeHtmlEntities(str) {
  return String(str)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

// URL-encode a relative output path for safe use inside an href/src
// attribute. encodeURIComponent is applied per path segment so '/' stays a
// separator, while reserved characters like '#' and '?' (left alone by
// encodeURI) are encoded — otherwise a filename containing them silently
// produces a broken link. Applied BEFORE escapeHtml — encodeURIComponent
// still leaves '&' untouched, so escapeHtml is still needed as a separate
// step to make the attribute value HTML-safe.
function encodeHtmlPath(p) {
  return String(p).split('/').map(encodeURIComponent).join('/');
}

// Inverse of encodeHtmlPath: decodeURIComponent per path segment. decodeURI
// does not reverse encodeURIComponent for reserved characters (# ? & +), so
// a filename like hash#tag.png encoded as hash%23tag.png would not round-trip.
function decodeHtmlPath(p) {
  return String(p)
    .split('/')
    .map((seg) => {
      try {
        return decodeURIComponent(seg);
      } catch {
        return seg;
      }
    })
    .join('/');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function listPngFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.png'))
    .map((d) => d.name)
    .sort(sortStrings);
}

function listSvgFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.svg'))
    .map((d) => d.name)
    .sort(sortStrings);
}

// Directory basenames skipped at any depth during markdown discovery.
const SKIP_MD_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '_handbook-deps',
  'build',
  'dist',
  'coverage',
  'e2e',
]);

/**
 * Recursive scan of repoRoot for *.md (case-insensitive). Skips well-known
 * dependency/build dirs, any dot-directory, and the exact path docs/handbook
 * (handbook self-docs / local build output — not repo documentation).
 * Returns repo-relative posix paths, sorted.
 */
function listMarkdownFiles(rootDir) {
  const results = [];
  function walk(absDir, relDir) {
    let entries;
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of entries) {
      const name = d.name;
      const relPath = relDir ? path.posix.join(relDir, name) : name;
      if (d.isDirectory()) {
        if (name.startsWith('.')) continue;
        if (SKIP_MD_DIR_NAMES.has(name)) continue;
        // Exact path only — not every directory named "handbook".
        if (relPath === 'docs/handbook') continue;
        walk(path.join(absDir, name), relPath);
      } else if (d.isFile() && name.toLowerCase().endsWith('.md')) {
        results.push(relPath);
      }
    }
  }
  walk(rootDir, '');
  return results.sort(sortStrings);
}

/** Deterministic title from filename when metadata.docs has no override. */
function defaultDocTitle(relSrc) {
  const base = path.posix.basename(relSrc).replace(/\.md$/i, '');
  const words = base.split(/[-_]+/).filter(Boolean);
  if (words.length === 0) return base;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function assertValidPng(filePath) {
  let st;
  try {
    st = fs.statSync(filePath);
  } catch (err) {
    fail(`handbook PNG guard: cannot stat ${filePath}: ${err.message}`);
  }
  if (st.size <= MIN_PNG_BYTES) {
    fail(
      `handbook PNG guard: ${filePath} is ${st.size} bytes (must be > ${MIN_PNG_BYTES}). ` +
        'Possible incomplete checkout or LFS pointer.',
    );
  }
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(8);
  try {
    fs.readSync(fd, buf, 0, 8, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (!buf.equals(PNG_MAGIC)) {
    fail(
      `handbook PNG guard: ${filePath} does not start with PNG magic bytes. ` +
        'Possible incomplete checkout or LFS pointer.',
    );
  }
}

/**
 * Round-1 candidate group key from filename:
 * - Playwright snapshots: part before ".spec.ts-"
 * - Manual screenshots: shared prefix before a numeric step, else first segment
 */
function candidateKeyFromFilename(filename) {
  const base = filename.replace(/\.png$/i, '');
  const specMatch = base.match(/^(.+?)\.spec\.ts-/);
  if (specMatch) return specMatch[1];
  const stepMatch = base.match(/^(.+?)-\d+(?:-|$)/);
  if (stepMatch) return stepMatch[1];
  const dash = base.indexOf('-');
  if (dash > 0) return base.slice(0, dash);
  return base;
}

/**
 * Comparison base for round-2 longest-prefix matching.
 * Playwright: full raw name before ".spec.ts-"; manual: full basename.
 */
function comparisonBaseFromFilename(filename) {
  const base = filename.replace(/\.png$/i, '');
  const specMatch = base.match(/^(.+?)\.spec\.ts-/);
  if (specMatch) return specMatch[1];
  return base;
}

/**
 * Two-pass deterministic group assignment.
 * Round 1: collect candidate keys (spec / numbered step / first dash).
 * Round 2: assign each file the longest candidate that equals its base or
 * is a `<key>-` prefix; equal length → alphabetical (smaller string wins).
 */
function resolveGroupKeys(filenames) {
  const candidates = new Set();
  for (const name of filenames) {
    candidates.add(candidateKeyFromFilename(name));
  }
  // Longer first; equal length → locale-stable ascending so first match wins.
  const sortedCandidates = Array.from(candidates).sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return sortStrings(a, b);
  });

  const groupsByName = new Map();
  for (const name of filenames) {
    const base = comparisonBaseFromFilename(name);
    let best = null;
    for (const key of sortedCandidates) {
      if (base === key || base.startsWith(key + '-')) {
        best = key;
        break;
      }
    }
    groupsByName.set(
      name,
      best !== null ? best : candidateKeyFromFilename(name),
    );
  }
  return groupsByName;
}

/**
 * Project / platform badges from Playwright naming conventions.
 *
 * Both parts are read from the name rather than matched against a fixed list: the snapshot path
 * template is `{projectName}-{platform}`, so the platform is whatever the machine that took the
 * baseline reported. Recognising only `darwin` silently dropped both badges for a baseline taken
 * anywhere else — the very case where the badge carries information.
 */
function parseBadges(filename) {
  const match = filename.match(/-(chromium(?:-metamask)?)-([a-z0-9]+)\.png$/i);
  return match ? { project: match[1], platform: match[2] } : { project: null, platform: null };
}

function titleFromFilename(filename) {
  return filename.replace(/\.png$/i, '');
}

function slugify(key) {
  return String(key)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function flattenColors(obj, prefix, out) {
  const keys = Object.keys(obj).sort(sortStrings);
  for (const k of keys) {
    const v = obj[k];
    const name = prefix ? `${prefix}-${k}` : k;
    if (typeof v === 'string') {
      out.push({ name, hex: v });
    } else if (v && typeof v === 'object') {
      flattenColors(v, name, out);
    }
  }
  return out;
}

/**
 * Normalize a Tailwind fontSize theme value to a plain CSS size string.
 * Tailwind allows either a bare string or a `[size, { lineHeight, ... }]`
 * tuple. Anything else is not a valid CSS font-size and is skipped — a
 * future tailwind.config.js shape change must not crash the whole build
 * over one design token.
 */
function normalizeFontSize(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return null;
}

// Matches any absolute URI scheme (RFC 3986 §3.1: ALPHA *( ALPHA / DIGIT /
// "+" / "-" / "." ) ":"), e.g. "https:", "mailto:", "data:", "javascript:",
// "vbscript:", "file:", "tel:", and anything not yet invented. A generic
// scheme check instead of an enumeration of known-bad prefixes so nothing
// can be missed (fixes CodeQL "Incomplete URL scheme check").
const ABSOLUTE_URI_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

function collectRelativeRefs(html) {
  const refs = [];
  // Only match real attribute names, after start-of-string, whitespace or '<'.
  // A word boundary alone also matches after '-' and ':', so data-src,
  // xlink:href and ng-src would be checked as if a browser resolved them.
  // Alternation per quote style so a double-quoted value may contain apostrophes
  // (e.g. href="docs/Bank's%20Guide.md" from marked link parsing).
  const re = /(?:^|[\s<])(?:src|href)=(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1] !== undefined ? m[1] : m[2];
    if (
      ABSOLUTE_URI_SCHEME_RE.test(raw) ||
      raw.startsWith('//') ||
      raw.startsWith('#')
    ) {
      continue;
    }
    // Browser order: decode HTML entities first (a literal '#' inside an entity
    // like &#39; must not be mistaken for the fragment separator), THEN strip
    // fragment/query, THEN percent-decode (done later by the caller via
    // decodeHtmlPath). Percent-encoding must stay untouched here so a literal
    // %23 in a filename is still not mistaken for a fragment separator.
    const cleaned = decodeHtmlEntities(raw).split('#')[0].split('?')[0];
    if (cleaned) refs.push(cleaned);
  }
  return refs;
}

function main() {
  const outArg = process.argv[2];
  if (!outArg) {
    fail('Usage: node scripts/handbook/build.js <output-dir>');
  }

  const scriptDir = __dirname;
  const repoRoot = process.env.HANDBOOK_REPO_ROOT
    ? path.resolve(process.env.HANDBOOK_REPO_ROOT)
    : path.resolve(scriptDir, '../..');
  const outDir = path.resolve(outArg);
  const gitSha = process.env.GIT_SHA || process.env.HANDBOOK_GIT_SHA || 'unknown';

  const metadataPath = path.join(scriptDir, 'metadata.json');
  let metadata = {};
  if (fs.existsSync(metadataPath)) {
    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  }

  const artifacts = [];
  const screenshotEntries = [];

  // --- Source A: e2e/screenshots/baseline/*.png (flat) ---
  const baselineDir = path.join(repoRoot, 'e2e/screenshots/baseline');
  for (const name of listPngFiles(baselineDir)) {
    const src = path.join(baselineDir, name);
    assertValidPng(src);
    const relOut = path.posix.join('screenshots', 'baseline', name);
    const dest = path.join(outDir, 'screenshots', 'baseline', name);
    copyFile(src, dest);
    const badges = parseBadges(name);
    const entry = {
      category: 'screenshot',
      outputPath: relOut,
      sourcePath: path.posix.join('e2e/screenshots/baseline', name),
      title: titleFromFilename(name),
      group: null, // assigned after two-pass resolveGroupKeys
      project: badges.project,
      platform: badges.platform,
      _filename: name,
    };
    screenshotEntries.push(entry);
  }

  // --- Source B: e2e/screenshots/*.png top-level only (exclude baseline/, debug/) ---
  const shotsRoot = path.join(repoRoot, 'e2e/screenshots');
  if (fs.existsSync(shotsRoot)) {
    const top = fs
      .readdirSync(shotsRoot, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.png'))
      .map((d) => d.name)
      .sort(sortStrings);
    for (const name of top) {
      const src = path.join(shotsRoot, name);
      assertValidPng(src);
      const relOut = path.posix.join('screenshots', name);
      const dest = path.join(outDir, 'screenshots', name);
      copyFile(src, dest);
      const badges = parseBadges(name);
      const entry = {
        category: 'screenshot',
        outputPath: relOut,
        sourcePath: path.posix.join('e2e/screenshots', name),
        title: titleFromFilename(name),
        group: null, // assigned after two-pass resolveGroupKeys
        project: badges.project,
        platform: badges.platform,
        _filename: name,
      };
      screenshotEntries.push(entry);
    }
  }

  // Two-pass grouping: longest matching candidate key wins (deterministic).
  {
    const filenames = screenshotEntries.map((e) => e._filename);
    const groupMap = resolveGroupKeys(filenames);
    for (const entry of screenshotEntries) {
      entry.group = groupMap.get(entry._filename);
      delete entry._filename;
      artifacts.push({
        category: entry.category,
        outputPath: entry.outputPath,
        sourcePath: entry.sourcePath,
        title: entry.title,
        group: entry.group,
      });
    }
  }

  screenshotEntries.sort((a, b) => {
    const g = sortStrings(a.group, b.group);
    if (g !== 0) return g;
    return sortStrings(a.title, b.title);
  });

  if (screenshotEntries.length < MIN_SCREENSHOTS) {
    fail(
      `handbook floor guard: found ${screenshotEntries.length} screenshots, ` +
        `need at least MIN_SCREENSHOTS=${MIN_SCREENSHOTS}. ` +
        'Check e2e/screenshots/baseline/ and e2e/screenshots/*.png paths.',
    );
  }

  // --- Source C: design tokens from tailwind.config.js ---
  const tailwindPath = path.join(repoRoot, 'tailwind.config.js');
  if (!fs.existsSync(tailwindPath)) {
    fail(`handbook: missing ${tailwindPath}`);
  }
  // Clear require cache for determinism when re-run in same process (tests).
  delete require.cache[require.resolve(tailwindPath)];
  const tailwind = require(tailwindPath);
  const theme = tailwind.theme || {};
  const colorList = flattenColors(theme.colors || {}, '', []);
  const fontSizeEntries = Object.keys(theme.fontSize || {})
    .sort(sortStrings)
    .map((k) => ({ name: k, size: normalizeFontSize(theme.fontSize[k]) }))
    .filter((e) => {
      if (e.size === null) {
        console.error(
          `handbook warning: tailwind fontSize "${e.name}" has an unsupported shape and was skipped.`,
        );
        return false;
      }
      return true;
    });

  artifacts.push({
    category: 'token',
    outputPath: 'index.html',
    sourcePath: 'tailwind.config.js',
    title: 'Design-Tokens (Farben)',
  });
  artifacts.push({
    category: 'token',
    outputPath: 'index.html',
    sourcePath: 'tailwind.config.js',
    title: 'Design-Tokens (Typografie)',
  });

  // --- Source D: logos / assets ---
  // SVGs under src/static/assets are auto-discovered; public/logo.png is
  // curated (public/ holds many unrelated static files).
  const ASSET_SVG_DIR = 'src/static/assets';
  const assetSpecs = [
    ...listSvgFiles(path.join(repoRoot, ASSET_SVG_DIR)).map((name) => ({
      src: path.posix.join(ASSET_SVG_DIR, name),
      out: path.posix.join('assets', name),
    })),
    // Curated on purpose: public/ holds many unrelated static files (favicon,
    // manifest.json, _headers, _redirects, index.html, robots.txt) — only this
    // one PNG is a handbook-relevant brand asset, so it is NOT auto-discovered.
    { src: 'public/logo.png', out: 'assets/logo.png' },
  ];
  for (const a of assetSpecs) {
    const src = path.join(repoRoot, a.src);
    if (!fs.existsSync(src)) {
      fail(`handbook: missing asset ${a.src}`);
    }
    if (a.src.toLowerCase().endsWith('.png')) {
      assertValidPng(src);
    }
    copyFile(src, path.join(outDir, a.out));
    artifacts.push({
      category: 'asset',
      outputPath: a.out,
      sourcePath: a.src,
      title: path.basename(a.src),
    });
  }

  // --- Source E: markdown docs (recursive discovery) ---
  // Optional title overrides via metadata.json → docs[relSrc].title.
  // Missing docs key / missing entry is fine (not an error).
  const docsMeta = (metadata && metadata.docs) || {};
  const discoveredDocs = listMarkdownFiles(repoRoot);
  const docSpecs = discoveredDocs.map((relSrc) => {
    const outInner = (
      relSrc.startsWith('docs/') ? relSrc.slice(5) : relSrc
    ).replace(/\.md$/i, '.html');
    const out = path.posix.join('docs', outInner);
    const title =
      (docsMeta[relSrc] && docsMeta[relSrc].title) || defaultDocTitle(relSrc);
    return { src: relSrc, out, title };
  });
  if (docSpecs.length < MIN_DOCS) {
    fail(
      `handbook floor guard: found ${docSpecs.length} docs, ` +
        `need at least MIN_DOCS=${MIN_DOCS}. ` +
        'Check recursive *.md discovery from repo root (excludes node_modules, ' +
        '.git, _handbook-deps, build, dist, coverage, e2e, docs/handbook, dot-dirs).',
    );
  }
  const renderedDocs = [];
  for (const d of docSpecs) {
    const src = path.join(repoRoot, d.src);
    if (!fs.existsSync(src)) {
      fail(`handbook: missing markdown source ${d.src}`);
    }
    const md = fs.readFileSync(src, 'utf8');
    const body = markedParse(md);
    const page =
      '<!DOCTYPE html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n' +
      `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
      `<title>${escapeHtml(d.title)} — DFX Services Handbook</title>\n` +
      '<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;' +
      'max-width:860px;margin:32px auto;padding:0 20px;line-height:1.55;color:#0a1f33;}' +
      'pre{overflow:auto;background:#f3f4f7;padding:12px;border-radius:6px;}' +
      'code{font-family:SF Mono,Menlo,Consolas,monospace;font-size:0.9em;}' +
      'img{max-width:100%;height:auto;}a{color:#0A355C;}</style>\n</head>\n<body>\n' +
      body +
      '\n</body>\n</html>\n';
    const dest = path.join(outDir, d.out);
    ensureDir(path.dirname(dest));
    fs.writeFileSync(dest, page, 'utf8');
    renderedDocs.push({ ...d, body });
    artifacts.push({
      category: 'doc',
      outputPath: d.out,
      sourcePath: d.src,
      title: d.title,
    });
  }

  // --- Group screenshots ---
  const groups = new Map();
  for (const e of screenshotEntries) {
    if (!groups.has(e.group)) groups.set(e.group, []);
    groups.get(e.group).push(e);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => sortStrings(a.title, b.title));
  }
  const groupKeys = Array.from(groups.keys()).sort(sortStrings);

  // Orphan metadata entries → warning only
  // Skip reserved top-level key "docs" (doc title overrides, not a group).
  for (const key of Object.keys(metadata).sort(sortStrings)) {
    if (key === 'docs') continue;
    if (!groups.has(key)) {
      console.error(
        `handbook warning: metadata.json entry "${key}" has no matching screenshots (orphan).`,
      );
    }
  }
  // Symmetric orphan warning for docs title overrides without a discovered file.
  const discoveredDocSet = new Set(discoveredDocs);
  for (const key of Object.keys(docsMeta).sort(sortStrings)) {
    if (!discoveredDocSet.has(key)) {
      console.error(
        `handbook warning: metadata.json docs entry "${key}" has no matching document (orphan).`,
      );
    }
  }

  // --- Build HTML ---
  const css = `
      :root {
        --bg: #e8eef5;
        --surface: #ffffff;
        --surface-2: #f3f4f7;
        --line: #d6dbe2;
        --line-2: #b8c4d8;
        --ink: #072440;
        --ink-2: #0A355C;
        --ink-3: #65728A;
        --ink-4: #9AA5B8;
        --brand: #F5516C;
        --brand-blue: #5A81BB;
        --warn: #EAB308;
        --content-width: 960px;
      }
      * { box-sizing: border-box; }
      html { scroll-behavior: smooth; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        font-size: 14.5px;
        line-height: 1.55;
        -webkit-font-smoothing: antialiased;
      }
      a { color: var(--brand-blue); text-decoration: none; }
      a:hover { text-decoration: underline; }
      code {
        font-family: 'SF Mono', Menlo, Consolas, monospace;
        font-size: 0.88em;
        background: var(--surface-2);
        padding: 1.5px 5px;
        border-radius: 3px;
        border: 1px solid var(--line);
        color: var(--ink);
      }
      .wrap {
        display: grid;
        grid-template-columns: 240px 1fr;
        gap: 32px;
        max-width: 1280px;
        margin: 0 auto;
        padding: 32px;
      }
      @media (max-width: 900px) {
        .wrap { grid-template-columns: 1fr; }
        aside { position: static !important; height: auto !important; }
      }
      aside {
        position: sticky;
        top: 32px;
        align-self: start;
        height: calc(100vh - 64px);
        overflow-y: auto;
        padding-right: 12px;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        font-size: 15px;
        color: var(--ink);
        margin-bottom: 4px;
      }
      .brand .dot {
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--brand);
      }
      .brand-sub {
        font-size: 12.5px;
        color: var(--ink-3);
        margin: 0 0 20px 0;
      }
      .toc-label {
        font-size: 10.5px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--ink-4);
        margin: 18px 0 8px;
      }
      .toc ol { list-style: none; padding: 0; margin: 0; }
      .toc li { margin: 2px 0; }
      .toc a {
        display: block;
        padding: 4px 6px;
        border-radius: 3px;
        font-size: 13px;
        color: var(--ink-2);
      }
      .toc a:hover {
        background: var(--surface-2);
        text-decoration: none;
        color: var(--ink);
      }
      .toc .spec-num {
        display: inline-block;
        min-width: 22px;
        font-variant-numeric: tabular-nums;
        color: var(--ink-4);
        font-size: 11.5px;
        margin-right: 8px;
      }
      main { max-width: var(--content-width); }
      .hero h1 {
        margin: 0 0 14px 0;
        font-size: 30px;
        font-weight: 700;
        letter-spacing: -0.01em;
      }
      .lede {
        font-size: 16px;
        color: var(--ink-2);
        margin: 0 0 18px 0;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 18px;
        font-size: 13px;
        color: var(--ink-3);
      }
      .meta b { color: var(--ink); font-weight: 600; }
      hr.sep {
        border: 0;
        border-top: 1px solid var(--line);
        margin: 48px 0;
      }
      details.spec {
        margin: 0 0 72px;
        scroll-margin-top: 24px;
      }
      details.spec > summary {
        list-style: none;
        cursor: pointer;
        user-select: none;
        padding: 6px 0 4px;
      }
      details.spec > summary::-webkit-details-marker { display: none; }
      details.spec > summary:focus-visible {
        outline: 2px solid var(--brand);
        outline-offset: 4px;
        border-radius: 4px;
      }
      details.spec > summary:hover .spec-head .lhs h2 { color: var(--brand); }
      .spec-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 24px;
        margin-bottom: 14px;
      }
      .spec-head .lhs h2 {
        margin: 0 0 4px 0;
        font-size: 22px;
        font-weight: 600;
        letter-spacing: -0.005em;
        display: inline-flex;
        align-items: baseline;
        gap: 10px;
        transition: color 0.15s;
      }
      .spec-head .lhs h2::before {
        content: '▸';
        display: inline-block;
        width: 12px;
        font-size: 14px;
        color: var(--ink-4);
        transition: transform 0.18s ease-out, color 0.15s;
        transform: translateY(-1px);
      }
      details.spec[open] .spec-head .lhs h2::before {
        transform: translateY(-1px) rotate(90deg);
        color: var(--brand);
      }
      .spec-head .lhs h2 .num {
        display: inline-block;
        min-width: 38px;
        color: var(--ink-4);
        font-variant-numeric: tabular-nums;
        font-weight: 500;
      }
      .spec-head .file {
        font-family: 'SF Mono', Menlo, Consolas, monospace;
        font-size: 12.5px;
        color: var(--ink-3);
      }
      .spec-head .rhs {
        text-align: right;
        font-size: 12.5px;
        color: var(--ink-3);
      }
      .spec-head .rhs b { color: var(--ink); font-weight: 600; }
      .spec-intro {
        color: var(--ink-2);
        margin: 14px 0 24px;
      }
      .tests {
        display: grid;
        gap: 22px;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      }
      .test {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 8px;
        overflow: hidden;
        scroll-margin-top: 20px;
      }
      .test:target {
        outline: 2px solid var(--brand);
        outline-offset: -1px;
      }
      .test .head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        border-bottom: 1px solid var(--line);
        background: var(--surface-2);
      }
      .test .name {
        font-family: 'SF Mono', Menlo, Consolas, monospace;
        font-size: 12px;
        font-weight: 600;
        color: var(--ink);
        word-break: break-all;
      }
      .badge {
        display: inline-block;
        font-size: 10.5px;
        font-weight: 600;
        padding: 2px 7px;
        border-radius: 999px;
        background: var(--surface);
        border: 1px solid var(--line);
        color: var(--ink-3);
        font-family: 'SF Mono', Menlo, Consolas, monospace;
      }
      .badge.project { border-color: var(--brand-blue); color: var(--brand-blue); }
      .badge.platform { border-color: var(--ink-4); }
      .test .img {
        background: var(--surface-2);
        display: flex;
        justify-content: center;
        padding: 14px;
      }
      .test .img img {
        max-width: 100%;
        height: auto;
        border-radius: 6px;
        box-shadow: 0 2px 8px rgba(7, 36, 64, 0.12);
      }
      .callout {
        border-left: 3px solid var(--brand);
        background: rgba(245, 81, 108, 0.06);
        padding: 14px 18px;
        margin: 24px 0;
        border-radius: 0 4px 4px 0;
      }
      .callout.info {
        border-color: var(--brand-blue);
        background: rgba(90, 129, 187, 0.08);
      }
      .callout p {
        margin: 0;
        color: var(--ink-2);
        font-size: 13.5px;
      }
      .callout b { color: var(--ink); }
      .toc-actions { margin: 6px 0 16px; }
      .toc-actions button {
        appearance: none;
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 4px;
        color: var(--ink-2);
        cursor: pointer;
        font: inherit;
        font-size: 12px;
        padding: 5px 10px;
        margin-right: 6px;
        transition: background 0.15s, border-color 0.15s, color 0.15s;
      }
      .toc-actions button:hover {
        background: var(--surface-2);
        border-color: var(--line-2);
        color: var(--ink);
      }
      .swatches {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 12px;
      }
      .swatch {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 8px;
        overflow: hidden;
      }
      .swatch .chip {
        height: 56px;
        border-bottom: 1px solid var(--line);
      }
      .swatch .meta-sw {
        padding: 8px 10px;
        font-size: 12px;
      }
      .swatch .meta-sw .n {
        font-weight: 600;
        color: var(--ink);
        word-break: break-all;
      }
      .swatch .meta-sw .h {
        font-family: 'SF Mono', Menlo, Consolas, monospace;
        color: var(--ink-3);
        margin-top: 2px;
      }
      .typo-row {
        display: flex;
        align-items: baseline;
        gap: 16px;
        padding: 10px 0;
        border-bottom: 1px solid var(--line);
      }
      .typo-row .label {
        min-width: 64px;
        font-family: 'SF Mono', Menlo, Consolas, monospace;
        font-size: 12px;
        color: var(--ink-3);
      }
      .typo-row .sample { color: var(--ink); }
      .asset-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 16px;
      }
      .asset-card {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 16px;
        text-align: center;
      }
      .asset-card img {
        max-width: 120px;
        max-height: 80px;
        height: auto;
      }
      .asset-card .an {
        margin-top: 10px;
        font-family: 'SF Mono', Menlo, Consolas, monospace;
        font-size: 12px;
        color: var(--ink-2);
        word-break: break-all;
      }
      .doc-preview {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 16px 20px;
        max-height: 420px;
        overflow: auto;
      }
      .doc-preview h1, .doc-preview h2, .doc-preview h3 { color: var(--ink); }
      .doc-preview pre {
        overflow: auto;
        background: var(--surface-2);
        padding: 12px;
        border-radius: 6px;
      }
      .doc-preview img { max-width: 100%; height: auto; }
  `;

  const script = `
    (function () {
      function openTargetFromHash() {
        var hash = location.hash ? location.hash.slice(1) : '';
        if (!hash) return;
        // IDs may start with a digit — use getElementById, not querySelector('#'+…).
        var el = document.getElementById(hash);
        if (!el) return;
        var details = el.closest ? el.closest('details.spec') : null;
        if (!details && el.tagName === 'DETAILS') details = el;
        if (details) details.open = true;
        if (typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ block: 'start' });
        }
      }
      document.addEventListener('DOMContentLoaded', openTargetFromHash);
      window.addEventListener('hashchange', openTargetFromHash);

      document.addEventListener('click', function (ev) {
        var t = ev.target;
        if (!t || !t.getAttribute) return;
        if (t.id === 'toc-expand-all') {
          document.querySelectorAll('details.spec').forEach(function (d) { d.open = true; });
        }
        if (t.id === 'toc-collapse-all') {
          document.querySelectorAll('details.spec').forEach(function (d) { d.open = false; });
        }
      });
    })();
  `;

  // TOC + sections
  let tocItems = [];
  let sectionsHtml = '';
  let sectionNum = 0;

  function pushSection(id, numLabel, title, fileHint, countLabel, intro, bodyHtml) {
    sectionNum += 1;
    const n = String(sectionNum).padStart(2, '0');
    tocItems.push({ id, n, title });
    sectionsHtml += `
      <details class="spec" id="${escapeHtml(id)}" open>
        <summary>
          <div class="spec-head">
            <div class="lhs">
              <h2><span class="num">${escapeHtml(numLabel || n)}</span>${escapeHtml(title)}</h2>
              ${fileHint ? `<div class="file">${escapeHtml(fileHint)}</div>` : ''}
            </div>
            <div class="rhs">${countLabel ? `<b>${escapeHtml(countLabel)}</b>` : ''}</div>
          </div>
        </summary>
        ${intro ? `<p class="spec-intro">${intro}</p>` : ''}
        ${bodyHtml}
      </details>`;
  }

  // Design tokens
  {
    let sw = '<div class="swatches">';
    for (const c of colorList) {
      sw +=
        `<div class="swatch"><div class="chip" style="background:${escapeHtml(c.hex)}"></div>` +
        `<div class="meta-sw"><div class="n">${escapeHtml(c.name)}</div>` +
        `<div class="h">${escapeHtml(c.hex)}</div></div></div>`;
    }
    sw += '</div>';
    let typo = '<div class="typo">';
    for (const f of fontSizeEntries) {
      typo +=
        `<div class="typo-row"><span class="label">${escapeHtml(f.name)}</span>` +
        `<span class="sample" style="font-size:${escapeHtml(f.size)}">` +
        `DFX Services — ${escapeHtml(f.name)} (${escapeHtml(f.size)})</span></div>`;
    }
    typo += '</div>';
    pushSection(
      'design-tokens',
      null,
      'Design-Tokens',
      'tailwind.config.js',
      `${colorList.length} Farben · ${fontSizeEntries.length} Schriftgrössen`,
      'Farbpalette und Typografie aus <code>theme.colors</code> und <code>theme.fontSize</code>.',
      '<h3>Farben</h3>' + sw + '<h3 style="margin-top:28px">Typografie</h3>' + typo,
    );
  }

  // Assets
  {
    let ag = '<div class="asset-grid">';
    for (const a of assetSpecs) {
      const assetHref = escapeHtml(encodeHtmlPath(a.out));
      ag +=
        `<div class="asset-card"><a href="${assetHref}">` +
        `<img src="${assetHref}" alt="${escapeHtml(path.basename(a.src))}" loading="lazy"></a>` +
        `<div class="an">${escapeHtml(path.basename(a.src))}</div></div>`;
    }
    ag += '</div>';
    pushSection(
      'assets',
      null,
      'Logos & Assets',
      'src/static/assets · public/logo.png',
      `${assetSpecs.length} Dateien`,
      'Committete Logos und Marken-Assets der Services-App.',
      ag,
    );
  }

  // Screenshot groups
  for (const gKey of groupKeys) {
    const list = groups.get(gKey);
    const meta = metadata[gKey];
    const title = meta && meta.title ? meta.title : gKey;
    const desc =
      meta && meta.description
        ? escapeHtml(meta.description)
        : `Screenshot-Gruppe <code>${escapeHtml(gKey)}</code> (Auto-Discovery).`;
    const id = 'group-' + slugify(gKey);
    let cards = '<div class="tests">';
    for (const e of list) {
      const cardId = 'shot-' + slugify(e.title);
      let badges = '';
      if (e.project) {
        badges += `<span class="badge project">${escapeHtml(e.project)}</span>`;
      }
      if (e.platform) {
        badges += `<span class="badge platform">${escapeHtml(e.platform)}</span>`;
      }
      const shotHref = escapeHtml(encodeHtmlPath(e.outputPath));
      cards +=
        `<div class="test" id="${escapeHtml(cardId)}">` +
        `<div class="head"><span class="name">${escapeHtml(e.title)}</span>${badges}</div>` +
        `<div class="img"><a href="${shotHref}">` +
        `<img src="${shotHref}" alt="${escapeHtml(e.title)}" loading="lazy"></a></div>` +
        `</div>`;
    }
    cards += '</div>';
    pushSection(
      id,
      null,
      title,
      gKey,
      `${list.length} Screenshots`,
      desc,
      cards,
    );
  }

  // Docs
  {
    let docsBody = '';
    for (const d of renderedDocs) {
      const docId = 'doc-' + slugify(d.title);
      docsBody +=
        `<div class="test" id="${escapeHtml(docId)}" style="margin-bottom:22px;grid-column:1/-1">` +
        `<div class="head"><span class="name">${escapeHtml(d.title)}</span>` +
        `<a class="badge" href="${escapeHtml(encodeHtmlPath(d.out))}">Vollständige Seite</a></div>` +
        `<div class="doc-preview">${d.body}</div></div>`;
    }
    pushSection(
      'documentation',
      null,
      'Dokumentation',
      'README · CONTRIBUTING · docs/*',
      `${renderedDocs.length} Dokumente`,
      'Gerenderte Markdown-Dokumentation aus dem Repository (via <code>marked</code>).',
      docsBody,
    );
  }

  let tocHtml = '<ol>';
  for (const t of tocItems) {
    tocHtml +=
      `<li><a href="#${escapeHtml(t.id)}"><span class="spec-num">${escapeHtml(t.n)}</span>` +
      `${escapeHtml(t.title.replace(/&amp;/g, '&'))}</a></li>`;
  }
  tocHtml += '</ol>';

  const indexHtml =
    `<!DOCTYPE html>\n<html lang="de">\n<head>\n` +
    `<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<title>DFX Services Handbook</title>\n` +
    `<style>${css}\n</style>\n` +
    `</head>\n<body>\n` +
    `<div class="wrap">\n` +
    `<aside>\n` +
    `<div class="brand"><span class="dot"></span> DFX Services</div>\n` +
    `<p class="brand-sub">Visuelles Handbook</p>\n` +
    `<div class="toc-label">Inhalt</div>\n` +
    `<div class="toc-actions">` +
    `<button type="button" id="toc-expand-all">Alle öffnen</button>` +
    `<button type="button" id="toc-collapse-all">Alle schliessen</button>` +
    `</div>\n` +
    `<nav class="toc">${tocHtml}</nav>\n` +
    `</aside>\n` +
    `<main>\n` +
    `<header class="hero">\n` +
    `<h1>DFX Services Handbook</h1>\n` +
    `<p class="lede">Alle committeten Screenshot-Baselines, Design-Tokens und Markdown-Dokumentation der Services-App an einem Ort. Die Seite wird bei jedem Build aus dem Repository erzeugt — neue Baselines erscheinen automatisch.</p>\n` +
    `<div class="callout info"><p><b>Auto-Discovery.</b> Es gibt keine handgepflegte Mapping-Tabelle. Das Build-Script scannt <code>e2e/screenshots/</code>, Tokens und Docs und erzeugt diese Seite deterministisch.</p></div>\n` +
    `<div class="meta">` +
    `<span>Stand: <b>${escapeHtml(gitSha)}</b></span>` +
    `<span>Screenshots: <b>${screenshotEntries.length}</b></span>` +
    `<span>Gruppen: <b>${groupKeys.length}</b></span>` +
    `<span>Dokumente: <b>${renderedDocs.length}</b></span>` +
    `</div>\n` +
    `</header>\n` +
    `<hr class="sep">\n` +
    sectionsHtml +
    `</main>\n</div>\n` +
    `<script>${script}\n</script>\n` +
    `</body>\n</html>\n`;

  ensureDir(outDir);
  const indexPath = path.join(outDir, 'index.html');
  fs.writeFileSync(indexPath, indexHtml, 'utf8');

  // Stable artifact order for deterministic manifest
  artifacts.sort((a, b) => {
    const c = sortStrings(a.category, b.category);
    if (c !== 0) return c;
    const o = sortStrings(a.outputPath, b.outputPath);
    if (o !== 0) return o;
    return sortStrings(a.title, b.title);
  });

  const manifest = {
    artifacts,
    screenshotCount: screenshotEntries.length,
    gitSha,
  };
  const manifestPath = path.join(outDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  // Integrity: every non-token artifact outputPath must exist on disk
  // (paths from the artifacts list — unescaped originals, not re-parsed HTML).
  for (const a of artifacts) {
    if (a.category === 'token') continue;
    const full = path.join(outDir, a.outputPath);
    if (!fs.existsSync(full)) {
      fail(
        `handbook integrity check failed (manifest): missing ${a.outputPath}` +
          ` (sourcePath=${a.sourcePath}, title=${a.title})`,
      );
    }
  }

  // Integrity: local src/href in rendered markdown docs (not in artifacts list)
  for (const d of renderedDocs) {
    const html = fs.readFileSync(path.join(outDir, d.out), 'utf8');
    const refs = collectRelativeRefs(html);
    for (const rawRef of refs) {
      // Entity decoding already happened in collectRelativeRefs (before the
      // fragment/query split); only percent-decoding remains here.
      const ref = decodeHtmlPath(rawRef);
      const underOut = path.join(path.dirname(path.join(outDir, d.out)), ref);
      if (
        !ref.startsWith('/') &&
        !fs.existsSync(underOut) &&
        !fs.existsSync(path.join(outDir, ref))
      ) {
        // Markdown may reference external or missing images — only fail for
        // paths that clearly target handbook output.
        if (/^(screenshots|assets|docs)\//.test(ref)) {
          fail(`handbook integrity check failed (${d.out}): missing ${ref}`);
        }
      }
    }
  }

  console.error(
    `handbook: wrote ${screenshotEntries.length} screenshots, ` +
      `${renderedDocs.length} docs, ${assetSpecs.length} assets → ${outDir}`,
  );
}

main();
