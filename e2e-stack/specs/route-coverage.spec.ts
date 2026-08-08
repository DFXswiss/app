/**
 * Route-coverage gate.
 *
 * Lives in its own `coverage-gate` Playwright project (see playwright.config.ts). It now runs
 * as part of the standard `docker compose run --rm tests` invocation — the Docker image's
 * default CMD no longer excludes it (see images/playwright/Dockerfile), so it runs alongside
 * every other project by default, same as any functional suite. Run it in isolation with:
 *   docker compose -p dfx-e2e-stack -f e2e-stack/compose.yml -f e2e-stack/compose.tests.yml \
 *     run --rm tests --grep @coverage-gate
 *
 * Current state: GREEN — all 100 routes in App.tsx are claimed by exactly one suite's registry
 * entry. Do not weaken or remove a claim just to keep this green; add real coverage instead.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { expect, test } from '@playwright/test';
import type { RouteClaim } from './registry/types';

const APP_SOURCE_PATH = '/work/app-source/App.tsx';

/**
 * Format a source location as `App.tsx:123` (1-based line) for fail-loud parser errors.
 * Without line numbers, unsupported constructs would be hard to locate in a large Routes tree.
 */
function formatNodeLocation(sourceFile: ts.SourceFile, node: ts.Node): string {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  return `${path.basename(sourceFile.fileName)}:${line + 1}`;
}

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
 * Visit every element of a routes/children array. Fail hard on any construct the static parser
 * cannot resolve (spreads, identifiers, non-literals) so the coverage set cannot silently shrink.
 */
function collectPathsFromElements(
  elements: ts.NodeArray<ts.Expression>,
  parentPath: string,
  paths: Set<string>,
  sourceFile: ts.SourceFile,
): void {
  for (const el of elements) {
    if (ts.isObjectLiteralExpression(el)) {
      collectPaths(el, parentPath, paths, sourceFile);
    } else if (ts.isSpreadElement(el)) {
      throw new Error(
        `Unsupported route construct: spread element in routes array at ${formatNodeLocation(sourceFile, el)}`,
      );
    } else if (ts.isIdentifier(el)) {
      throw new Error(
        `Unsupported route construct: route referenced by identifier instead of object literal at ${formatNodeLocation(sourceFile, el)}`,
      );
    } else {
      throw new Error(
        `Unsupported route construct: non-object-literal route element at ${formatNodeLocation(sourceFile, el)}`,
      );
    }
  }
}

/**
 * Recursively collect full paths from a react-router route object-literal tree.
 * - Relative segments join under the parent.
 * - `index: true` without `path` claims the parent path (does not invent a new segment).
 * - Duplicate full paths (e.g. two `path: 'support'` siblings) collapse in the Set.
 *
 * Unsupported constructs (non-literal path/children, spreads, identifier refs) throw instead of
 * being skipped — silent skips would let routes disappear from the coverage set unnoticed.
 */
function collectPaths(
  node: ts.ObjectLiteralExpression,
  parentPath: string,
  paths: Set<string>,
  sourceFile: ts.SourceFile,
): void {
  let segment: string | undefined;
  let isIndex = false;
  let children: ts.ArrayLiteralExpression | undefined;

  for (const prop of node.properties) {
    // Object-level spreads can inject path/children we never see — fail loud rather than miss them.
    if (ts.isSpreadAssignment(prop)) {
      throw new Error(
        `Unsupported route construct: spread element in route object at ${formatNodeLocation(sourceFile, prop)}`,
      );
    }

    const name = propName(prop);
    if (!name || !ts.isPropertyAssignment(prop)) continue;

    if (name === 'path') {
      if (ts.isStringLiteral(prop.initializer) || ts.isNoSubstitutionTemplateLiteral(prop.initializer)) {
        segment = prop.initializer.text;
      } else {
        // A variable/template/call path would leave `segment` undefined and drop the route entirely.
        throw new Error(
          `Unsupported route construct: non-literal \`path\` value at ${formatNodeLocation(sourceFile, prop.initializer)}`,
        );
      }
    } else if (name === 'index') {
      if (prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
        isIndex = true;
      }
    } else if (name === 'children') {
      if (ts.isArrayLiteralExpression(prop.initializer)) {
        children = prop.initializer;
      } else {
        // Non-literal children (import, call) would leave the subtree unvisited.
        throw new Error(
          `Unsupported route construct: non-literal \`children\` value at ${formatNodeLocation(sourceFile, prop.initializer)}`,
        );
      }
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
    collectPathsFromElements(children.elements, fullPath, paths, sourceFile);
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
  // Top-level Routes array uses the same fail-loud element walk as nested `children`.
  collectPathsFromElements(routesArray.elements, '', paths, sourceFile);
  return paths;
}

async function loadRegistryClaims(registryDir: string): Promise<{ claims: RouteClaim[]; byPath: Map<string, string> }> {
  const files = fs
    .readdirSync(registryDir)
    .filter((f) => f.endsWith('.ts') && f !== 'types.ts')
    .sort();

  const claims: RouteClaim[] = [];
  const byPath = new Map<string, string>();
  // path → every claiming file name (one entry per claim, including same-file duplicates).
  // Closes the gap where two claims in the same file were treated as a single claim.
  const claimantsByPath = new Map<string, string[]>();

  for (const file of files) {
    const base = file.replace(/\.ts$/, '');
    // A dynamic `import()` with a computed specifier is NOT rewritten by Playwright's TS
    // loader (that loader only patches statically-analyzable import/require calls) — at
    // runtime it falls through to Node's native ESM loader, which cannot parse a raw .ts
    // file ("SyntaxError: Unexpected token 'export'"), verified empirically. `require()`
    // with a computed path goes through the same CommonJS loader Playwright already patches
    // for every other spec/fixture file in this project, so it works for arbitrary,
    // not-yet-known-at-authoring-time registry file names — which is exactly what a
    // distributed per-lane registry needs.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(path.join(registryDir, base)) as { default: RouteClaim[] };
    const list = mod.default;
    if (!Array.isArray(list)) {
      throw new Error(`Registry file ${file} does not default-export a RouteClaim[]`);
    }
    for (const claim of list) {
      const claimants = claimantsByPath.get(claim.path) ?? [];
      claimants.push(file);
      claimantsByPath.set(claim.path, claimants);
      byPath.set(claim.path, file);
      claims.push(claim);
    }
  }

  const collisions: string[] = [];
  for (const [routePath, claimants] of claimantsByPath) {
    if (claimants.length > 1) {
      collisions.push(`path "${routePath}" claimed ${claimants.length} times: ${claimants.join(', ')}`);
    }
  }

  if (collisions.length > 0) {
    throw new Error(`Route claim collisions:\n  - ${collisions.join('\n  - ')}`);
  }

  return { claims, byPath };
}

test('every app route is claimed by exactly one registry entry @coverage-gate', async () => {
  const registryDir = path.join(__dirname, 'registry');
  expect(fs.existsSync(APP_SOURCE_PATH), `App.tsx missing at ${APP_SOURCE_PATH}`).toBe(true);
  expect(fs.existsSync(registryDir), `registry dir missing at ${registryDir}`).toBe(true);

  const { byPath, claims } = await loadRegistryClaims(registryDir);
  const claimed = new Set(byPath.keys());
  const real = extractAppRoutes(APP_SOURCE_PATH);

  const unclaimed = [...real].filter((p) => !claimed.has(p)).sort();
  const orphaned = [...claimed].filter((p) => !real.has(p)).sort();

  // A typo or deleted suite file would leave a claim that never runs tests for that route.
  // Resolve claim.spec relative to this specs/ directory (bare filename, no specs/ prefix).
  const missingSpecs: string[] = [];
  for (const claim of claims) {
    const registryFile = byPath.get(claim.path) ?? '(unknown)';
    const specPath = path.join(__dirname, claim.spec);
    if (!fs.existsSync(specPath)) {
      missingSpecs.push(
        `Claim for path "${claim.path}" (registry file ${registryFile}) references spec "${claim.spec}", but ${specPath} does not exist`,
      );
    }
  }

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
  if (missingSpecs.length > 0) {
    messages.push(`Missing spec files (${missingSpecs.length}):\n  - ${missingSpecs.join('\n  - ')}`);
  }

  expect(messages.join('\n\n'), messages.join('\n\n')).toBe('');
});
