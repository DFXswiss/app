/**
 * Route helpers shared by the spec files.
 *
 * `normPath` used to be copy-pasted into every spec that compares `location.pathname`; a private
 * copy per file is a copy that can drift from the others without anyone noticing.
 *
 * `extractAppRoutes` is the same static read of `App.tsx` that route-coverage.spec.ts performs.
 * It lives here so that any spec needing the real route set gets the fail-loud parser rather than
 * a lenient private variant: a parser that skips what it cannot read reports fewer routes than
 * the app has, and every check built on that set silently gets weaker.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

/** Compare-ready pathname: one trailing slash removed, except on the root path. */
export function normPath(p: string): string {
  return p !== '/' && p.endsWith('/') ? p.slice(0, -1) : p;
}

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
 * cannot resolve (spreads, identifiers, non-literals) so the extracted route set cannot silently
 * shrink.
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
 * being skipped — silent skips would let routes disappear from the extracted set unnoticed.
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

    // A shorthand property (`{ path }`) or a computed key carries a name this parser cannot read,
    // so the route it belongs to would quietly leave the extracted set. Refuse to read what cannot
    // be read, the same way spreads and non-literal values are refused above.
    if (ts.isShorthandPropertyAssignment(prop)) {
      throw new Error(
        `Unsupported route construct: shorthand property "${prop.name.text}" at ${formatNodeLocation(sourceFile, prop)}`,
      );
    }
    if (!ts.isPropertyAssignment(prop)) {
      throw new Error(
        `Unsupported route construct: property is not a plain assignment at ${formatNodeLocation(sourceFile, prop)}`,
      );
    }
    if (ts.isComputedPropertyName(prop.name)) {
      throw new Error(
        `Unsupported route construct: computed property name at ${formatNodeLocation(sourceFile, prop.name)}`,
      );
    }

    const name = propName(prop);
    if (!name) {
      throw new Error(
        `Unsupported route construct: unreadable property name at ${formatNodeLocation(sourceFile, prop.name)}`,
      );
    }

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

/** Every full route path declared in `export const Routes = [...]` of the given App.tsx. */
export function extractAppRoutes(appTsxPath: string): Set<string> {
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

/**
 * Locate App.tsx. The tests image copies the app source to /work/app-source; the other
 * candidates let the same helper work when a spec is run from a repo checkout.
 */
export function resolveAppSourcePath(): string {
  const candidates = [
    '/work/app-source/App.tsx',
    path.join(__dirname, '../../../src/App.tsx'),
    path.join(process.cwd(), 'src/App.tsx'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(`App.tsx not found. Tried: ${candidates.join(', ')}`);
}

/**
 * Where the browser fixture records the navigations it made, and where the coverage gate reads
 * them back. Written as one line per navigation (`pathname\tspecFile`) so parallel appends cannot
 * corrupt each other and a crashed run still leaves everything up to that point.
 */
export function visitedRoutesPath(): string {
  return path.join(process.env.E2E_ARTIFACT_DIR ?? '/work/test-results', 'visited-routes.log');
}

export interface VisitedRoute {
  path: string;
  specFile: string;
}

/**
 * Reduce Playwright's absolute testInfo.file to the form registry claims use (claim.spec, e.g.
 * "buy.spec.ts"). route-coverage.spec.ts resolves a claim as path.join(<specs dir>, claim.spec), so
 * the inverse is the path relative to that same directory — not the bare basename, which would
 * stop matching the moment a suite moves into a subdirectory and would silently make its claims
 * look unvisited. Recording and evaluation must derive this form identically, which is why both
 * sides call this one function.
 */
export function specClaimName(specFilePath: string): string {
  return path.relative(path.join(__dirname, '..'), specFilePath);
}

/** Records one navigation. Errors are swallowed: a test must not fail over bookkeeping. */
export function recordVisitedRoute(pathname: string, specFilePath: string): void {
  try {
    const file = visitedRoutesPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${normPath(pathname)}\t${specClaimName(specFilePath)}\n`);
  } catch {
    // Nothing to do here — the gate reports an empty recording as missing coverage, which is the
    // outcome that matters, and a broken artifact directory already fails the run elsewhere.
  }
}

/**
 * Reads the navigation log. Empty lines (trailing newline from appendFileSync) are skipped.
 * A non-empty line that is not exactly `path\tspecFile` fails loud with file, line number and raw
 * content so a malformed artifact is never silently treated as missing coverage.
 */
export function readVisitedRoutes(): VisitedRoute[] {
  const file = visitedRoutesPath();
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const result: VisitedRoute[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === '') continue;
    const tab = line.indexOf('\t');
    if (tab <= 0 || tab === line.length - 1) {
      throw new Error(
        `Malformed visited-routes entry in ${file} at line ${i + 1}: expected path\\tspecFile, got ${JSON.stringify(line)}`,
      );
    }
    const pathField = line.slice(0, tab);
    const specFile = line.slice(tab + 1);
    if (pathField === '' || specFile === '' || specFile.includes('\t')) {
      throw new Error(
        `Malformed visited-routes entry in ${file} at line ${i + 1}: expected path\\tspecFile, got ${JSON.stringify(line)}`,
      );
    }
    result.push({ path: pathField, specFile });
  }
  return result;
}

/**
 * True when `visited` is the concrete form of the react-router pattern `route` — `/tx/42` for
 * `/tx/:id`. Without this the gate could only match parameterless routes, and every screen that
 * takes an id would look uncovered.
 */
export function routeMatches(route: string, visited: string): boolean {
  const pattern = normPath(route)
    .split('/')
    .map((segment) => {
      // React Router's splat matches the rest of the path, so a catch-all route is visited by any
      // URL below it - escaping the asterisk instead would make such a route unreachable forever.
      if (segment === '*') return '.+';
      if (segment.startsWith(':')) return '[^/]+';
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return new RegExp(`^${pattern}$`).test(normPath(visited));
}
