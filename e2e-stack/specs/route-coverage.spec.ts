/**
 * Route-coverage gate.
 *
 * Lives in its own `coverage-gate` Playwright project (see playwright.config.ts) and is
 * deliberately excluded from the default Docker entrypoint via the Dockerfile's default
 * CMD (`--grep-invert=@coverage-gate`), not via a config-level grepInvert — Playwright ANDs
 * config-level grep/grepInvert with CLI flags, so a config-level grepInvert here would make
 * the "run on demand" command below permanently return zero tests. Run on demand with:
 *   docker compose -p dfx-e2e-stack -f e2e-stack/compose.yml -f e2e-stack/compose.tests.yml \
 *     run --rm tests --grep @coverage-gate
 *
 * Expected state right now: RED (only `/` is claimed by registry/smoke.ts). That is the
 * correct starting state — do not invent fake claims to turn it green.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { expect, test } from '@playwright/test';
import type { RouteClaim } from './registry/types';

const APP_SOURCE_PATH = '/work/app-source/App.tsx';

function propName(prop: ts.ObjectLiteralElementLike): string | undefined {
  if (!ts.isPropertyAssignment(prop)) return undefined;
  if (ts.isIdentifier(prop.name)) return prop.name.text;
  if (ts.isStringLiteral(prop.name) || ts.isNoSubstitutionTemplateLiteral(prop.name)) {
    return prop.name.text;
  }
  return undefined;
}

function joinRoutePath(parent: string, segment: string): string {
  if (segment.startsWith('/')) return segment;
  if (!parent || parent === '/') return `/${segment}`;
  return `${parent.replace(/\/$/, '')}/${segment.replace(/^\//, '')}`;
}

/**
 * Recursively collect full paths from a react-router route object-literal tree.
 * - Relative segments join under the parent.
 * - `index: true` without `path` claims the parent path (does not invent a new segment).
 * - Duplicate full paths (e.g. two `path: 'support'` siblings) collapse in the Set.
 */
function collectPaths(node: ts.ObjectLiteralExpression, parentPath: string, paths: Set<string>): void {
  let segment: string | undefined;
  let isIndex = false;
  let children: ts.ArrayLiteralExpression | undefined;

  for (const prop of node.properties) {
    const name = propName(prop);
    if (!name || !ts.isPropertyAssignment(prop)) continue;

    if (name === 'path') {
      if (ts.isStringLiteral(prop.initializer) || ts.isNoSubstitutionTemplateLiteral(prop.initializer)) {
        segment = prop.initializer.text;
      }
    } else if (name === 'index') {
      if (prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
        isIndex = true;
      }
    } else if (name === 'children' && ts.isArrayLiteralExpression(prop.initializer)) {
      children = prop.initializer;
    }
  }

  let fullPath = parentPath;
  if (segment !== undefined) {
    fullPath = joinRoutePath(parentPath, segment);
    paths.add(fullPath);
  } else if (isIndex) {
    if (parentPath) {
      paths.add(parentPath);
    }
  }

  if (children) {
    for (const el of children.elements) {
      if (ts.isObjectLiteralExpression(el)) {
        collectPaths(el, fullPath, paths);
      }
    }
  }
}

function findRoutesArray(sourceFile: ts.SourceFile): ts.ArrayLiteralExpression | undefined {
  let found: ts.ArrayLiteralExpression | undefined;

  function visit(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'Routes' &&
      node.initializer &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      found = node.initializer;
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

function extractAppRoutes(appTsxPath: string): Set<string> {
  const text = fs.readFileSync(appTsxPath, 'utf8');
  const sourceFile = ts.createSourceFile(appTsxPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const routesArray = findRoutesArray(sourceFile);
  if (!routesArray) {
    throw new Error(`Could not find export const Routes = [...] in ${appTsxPath}`);
  }

  const paths = new Set<string>();
  for (const el of routesArray.elements) {
    if (ts.isObjectLiteralExpression(el)) {
      collectPaths(el, '', paths);
    }
  }
  return paths;
}

async function loadRegistryClaims(
  registryDir: string,
): Promise<{ claims: RouteClaim[]; byPath: Map<string, string> }> {
  const files = fs
    .readdirSync(registryDir)
    .filter((f) => f.endsWith('.ts') && f !== 'types.ts')
    .sort();

  const claims: RouteClaim[] = [];
  const byPath = new Map<string, string>();
  const collisions: string[] = [];

  for (const file of files) {
    const base = file.replace(/\.ts$/, '');
    // Dynamic import so each lane can add its own registry file without touching this gate.
    const mod = (await import(`./registry/${base}`)) as { default: RouteClaim[] };
    const list = mod.default;
    if (!Array.isArray(list)) {
      throw new Error(`Registry file ${file} does not default-export a RouteClaim[]`);
    }
    for (const claim of list) {
      const existing = byPath.get(claim.path);
      if (existing && existing !== file) {
        collisions.push(`path "${claim.path}" claimed by both ${existing} and ${file}`);
      } else {
        byPath.set(claim.path, file);
      }
      claims.push(claim);
    }
  }

  if (collisions.length > 0) {
    throw new Error(`Cross-file route claim collisions:\n  - ${collisions.join('\n  - ')}`);
  }

  return { claims, byPath };
}

test('every app route is claimed by exactly one registry entry @coverage-gate', async () => {
  const registryDir = path.join(__dirname, 'registry');
  expect(fs.existsSync(APP_SOURCE_PATH), `App.tsx missing at ${APP_SOURCE_PATH}`).toBe(true);
  expect(fs.existsSync(registryDir), `registry dir missing at ${registryDir}`).toBe(true);

  const { byPath } = await loadRegistryClaims(registryDir);
  const claimed = new Set(byPath.keys());
  const real = extractAppRoutes(APP_SOURCE_PATH);

  const unclaimed = [...real].filter((p) => !claimed.has(p)).sort();
  const orphaned = [...claimed].filter((p) => !real.has(p)).sort();

  const messages: string[] = [];
  if (unclaimed.length > 0) {
    messages.push(
      `Unclaimed real routes (${unclaimed.length}) — add a registry entry:\n  - ${unclaimed.join('\n  - ')}`,
    );
  }
  if (orphaned.length > 0) {
    messages.push(
      `Orphaned registry claims (${orphaned.length}) — path no longer in App.tsx:\n  - ${orphaned.join('\n  - ')}`,
    );
  }

  expect(messages.join('\n\n'), messages.join('\n\n')).toBe('');
});
