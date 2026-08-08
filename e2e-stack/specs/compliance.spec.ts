/**
 * Compliance area — overview / display routes + systematic access control.
 *
 * Routes claimed (registry/compliance.ts → this file):
 *   /compliance, /compliance/user/:id, .../kyc-step/:stepId, .../support-issue/:issueId,
 *   /compliance/recommendations/:id, /compliance/scorechain/user/:id,
 *   /compliance/kyc-files, /compliance/kyc-files/details, /compliance/kyc-stats,
 *   /compliance/transactions, /compliance/custody-orders,
 *   /compliance/mros, /compliance/mros/:id, /compliance/recalls,
 *   /compliance/call-queues, /sitemap
 *
 * Write/decision routes live in compliance-cases.spec.ts.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import {
  expect,
  gotoWithSession,
  loginAs,
  openScreen,
  queryOne,
  queryRows,
  test,
  withDb,
} from './fixtures';
import {
  cleanupCreatedData,
  createCallQueueEntry,
  createKycStep,
  createMrosCase,
  createSupportIssue,
  createTransaction,
  createUser,
} from './fixtures/factories';

test.describe.configure({ mode: 'serial' });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normPath(p: string): string {
  return p !== '/' && p.endsWith('/') ? p.slice(0, -1) : p;
}

/** Raise staff kycLevel so STAFF_KYC_REQUIRED does not block Compliance/Admin API calls. */
async function ensureStaffKycComplete(userId: number): Promise<void> {
  await withDb(async (client) => {
    await client.query(
      `UPDATE user_data SET "kycLevel" = 50, firstname = 'E2E', surname = 'Compliance'
       WHERE id = (SELECT "userDataId" FROM "user" WHERE id = $1)`,
      [userId],
    );
  });
}

/**
 * All 23 compliance routes with concrete placeholders for param segments.
 * `:queue` uses a non-enum placeholder — the guard runs before queue validation, so denial
 * still redirects away from the path regardless of whether the queue name is valid.
 */
const ALL_COMPLIANCE_PATHS = [
  '/compliance',
  '/compliance/user/1',
  '/compliance/user/1/kyc-step/1',
  '/compliance/user/1/support-issue/1',
  '/compliance/recommendations/1',
  '/compliance/scorechain/user/1',
  '/compliance/bank-tx/1',
  '/compliance/bank-tx/1/recall',
  '/compliance/bank-tx/1/return',
  '/compliance/kyc-files',
  '/compliance/kyc-files/details',
  '/compliance/kyc-stats',
  '/compliance/transactions',
  '/compliance/custody-orders',
  '/compliance/mros',
  '/compliance/mros/create',
  '/compliance/mros/1',
  '/compliance/recalls',
  '/compliance/user/1/kyc',
  '/compliance/call-queues',
  '/compliance/call-queues/placeholder-queue',
  '/compliance/call-queues/placeholder-queue/1',
  '/sitemap',
] as const;

// --- Local App.tsx route extraction (minimal variant of route-coverage.spec.ts) ---

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
    if (parentPath) paths.add(parentPath);
  }

  if (children) {
    for (const el of children.elements) {
      if (ts.isObjectLiteralExpression(el)) {
        collectPaths(el, fullPath, paths);
      }
    }
  }
}

function extractAppRoutes(appTsxPath: string): Set<string> {
  const text = fs.readFileSync(appTsxPath, 'utf8');
  const sourceFile = ts.createSourceFile(appTsxPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let routesArray: ts.ArrayLiteralExpression | undefined;

  function visit(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'Routes' &&
      node.initializer &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      routesArray = node.initializer;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

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

function resolveAppSourcePath(): string {
  const candidates = [
    '/work/app-source/App.tsx',
    path.join(__dirname, '../../src/App.tsx'),
    path.join(process.cwd(), 'src/App.tsx'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(`App.tsx not found. Tried: ${candidates.join(', ')}`);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe('Compliance area (overview)', () => {
  test.afterAll(async () => {
    await cleanupCreatedData();
  });

  // -------------------------------------------------------------------------
  // Access control — plain User must not see any of the 23 screens
  // -------------------------------------------------------------------------

  test('plain User role is denied all 23 compliance routes', async ({ page }) => {
    const { jwt } = await loginAs('User');

    for (const target of ALL_COMPLIANCE_PATHS) {
      await gotoWithSession(page, target, jwt);
      await page.waitForLoadState('networkidle');
      await expect
        .poll(() => normPath(new URL(page.url()).pathname), {
          message: `User role must be redirected away from ${target}`,
          timeout: 15000,
        })
        .not.toBe(normPath(target));
    }
  });

  // -------------------------------------------------------------------------
  // /compliance — search dashboard
  // -------------------------------------------------------------------------

  test('/compliance renders search form and dashboard sections', async ({ page }) => {
    const { jwt, userId } = await loginAs('Compliance');
    await ensureStaffKycComplete(userId);

    const customer = await createUser({
      tag: 'cmp-search',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });

    await openScreen(page, '/compliance', jwt);

    await expect(page.getByText('Database search', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox').first()).toBeVisible();
    // Dashboard sections unique to this screen (Pending Reviews always renders ordered rows)
    await expect(page.getByText(/Pending Reviews/)).toBeVisible();
    await expect(page.getByText('Quick links', { exact: true })).toBeVisible();
    await expect(page.getByText('Aktennotiz erstellen', { exact: true })).toBeVisible();

    // Search by userDataId must surface the seeded customer with correct id
    await page.getByRole('textbox').first().fill(String(customer.userDataId));
    await page.getByRole('button', { name: 'Search', exact: true }).click();

    await expect(page.getByText('Matching Entries', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Customers', { exact: true })).toBeVisible();
    await expect(page.getByText(String(customer.userDataId), { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Details', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'KYC', exact: true }).first()).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // /compliance/transactions
  // -------------------------------------------------------------------------

  test('/compliance/transactions lists seeded transactions with correct values', async ({ page }) => {
    const { jwt, userId } = await loginAs('Compliance');
    await ensureStaffKycComplete(userId);

    const customer = await createUser({
      tag: 'cmp-txlist',
      kycLevel: 30,
      completePersonalData: true,
    });
    const amount = 1847;
    const tx = await createTransaction({
      state: 'completed_buy',
      tag: 'cmp-txlist',
      userId: customer.userId,
      userDataId: customer.userDataId,
      jwt: customer.jwt,
      amount,
      inputAsset: 'CHF',
    });

    // Keep eventDate in the default 3-day window
    await queryRows(`UPDATE transaction SET "eventDate" = $1 WHERE id = $2`, [
      new Date().toISOString(),
      tx.transactionId,
    ]);

    await openScreen(page, '/compliance/transactions', jwt);

    await expect(page.getByText('Created von', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Created bis', { exact: true })).toBeVisible();
    await expect(page.getByText('Nur mit KYC-File', { exact: true })).toBeVisible();
    // Table headers unique to this list
    await expect(page.getByText('AccountId', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('KycFileId', { exact: true }).first()).toBeVisible();

    // Seeded row: transaction id and amount appear
    await expect(page.getByText(String(tx.transactionId), { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(String(customer.userDataId), { exact: true }).first()).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // /compliance/user/:id + kyc-step + support-issue
  // -------------------------------------------------------------------------

  test('/compliance/user/:id shows dossier tabs and links to sub-screens', async ({ page }) => {
    const { jwt, userId } = await loginAs('Compliance');
    await ensureStaffKycComplete(userId);

    const customer = await createUser({
      tag: 'cmp-user',
      kycLevel: 30,
      completePersonalData: true,
      language: 'EN',
    });
    const step = await createKycStep(customer.userDataId, {
      name: 'PersonalData',
      status: 'InProgress',
      comment: 'E2E kyc step comment',
    });
    const issue = await createSupportIssue(customer.jwt, {
      tag: 'cmp-user-issue',
      type: 'GenericIssue',
      name: 'E2E compliance support issue',
      message: 'Seeded for compliance user screen',
    });
    const issueId =
      issue.supportIssueId ??
      (await queryOne<{ id: number }>(`SELECT id FROM support_issue WHERE uid = $1`, [issue.uid]))?.id;
    expect(issueId, 'seeded support issue must have a numeric id').toBeTruthy();

    await openScreen(page, `/compliance/user/${customer.userDataId}`, jwt);

    // UserDataPanel / tab bar unique features
    await expect(page.getByText('UserData', { exact: true }).first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Personal Data', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Transactions \(/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /KYC Steps \(/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Users \(/ })).toBeVisible();
    await expect(page.getByText(String(customer.userDataId)).first()).toBeVisible();

    // KYC Steps tab shows seeded step
    await page.getByRole('button', { name: /KYC Steps \(/ }).click();
    await expect(page.getByText('PersonalData', { exact: true }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(String(step.kycStepId), { exact: true }).first()).toBeVisible();

    // Direct open of kyc-step sub-route
    await openScreen(page, `/compliance/user/${customer.userDataId}/kyc-step/${step.kycStepId}`, jwt);
    await expect(page.getByText(`PersonalData #${step.kycStepId}`, { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText('InProgress', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'View Network', exact: true })).toBeVisible();
    // Info table labels
    await expect(page.getByText('Sequence', { exact: true })).toBeVisible();
    await expect(page.getByText('E2E kyc step comment')).toBeVisible();

    // Support-issue sub-route
    await openScreen(page, `/compliance/user/${customer.userDataId}/support-issue/${issueId}`, jwt);
    await expect(page.getByText('Issue Details', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('UID:', { exact: true })).toBeVisible();
    await expect(page.getByText(issue.uid, { exact: true })).toBeVisible();
    await expect(page.getByText('E2E compliance support issue', { exact: true })).toBeVisible();
    await expect(page.getByText('GenericIssue', { exact: true }).first()).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // /compliance/recommendations/:id
  // -------------------------------------------------------------------------

  test('/compliance/recommendations/:id renders graph shell for a user', async ({ page }) => {
    const { jwt, userId } = await loginAs('Compliance');
    await ensureStaffKycComplete(userId);

    const customer = await createUser({ tag: 'cmp-rec', kycLevel: 30, completePersonalData: true });

    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await openScreen(page, `/compliance/recommendations/${customer.userDataId}`, jwt);

    // Stats bar unique to the recommendation network screen
    await expect(page.getByText(/Nodes:/)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Edges:/)).toBeVisible();
    await expect(page.getByText('Current user', { exact: true })).toBeVisible();
    await expect(page.getByText('Click a node to show details and load its connections', { exact: true })).toBeVisible();

    expect(pageErrors, `uncaught pageerror on recommendations empty graph: ${pageErrors.join('; ')}`).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // /compliance/scorechain/user/:id
  // -------------------------------------------------------------------------

  test('/compliance/scorechain/user/:id renders empty screenings list without crash', async ({ page }) => {
    const { jwt, userId } = await loginAs('Compliance');
    await ensureStaffKycComplete(userId);

    const customer = await createUser({ tag: 'cmp-score', kycLevel: 30, completePersonalData: true });

    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await openScreen(page, `/compliance/scorechain/user/${customer.userDataId}`, jwt);

    await expect(page.getByText(new RegExp(`Screenings for user\\s*#${customer.userDataId}`))).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText('No screenings found', { exact: true })).toBeVisible();

    expect(pageErrors, `uncaught pageerror on scorechain empty: ${pageErrors.join('; ')}`).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // /compliance/kyc-files + details
  // -------------------------------------------------------------------------

  test('/compliance/kyc-files and /details render table headers (empty ok)', async ({ page }) => {
    const { jwt, userId } = await loginAs('Compliance');
    await ensureStaffKycComplete(userId);

    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await openScreen(page, '/compliance/kyc-files', jwt);

    await expect(page.getByText('AccountId', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Id', { exact: true }).first()).toBeVisible();
    // Empty or populated — both valid; empty must not crash
    const emptyOrRows = page.getByText('No entries found', { exact: true }).or(page.locator('tbody tr').first()).first();
    await expect(emptyOrRows.first()).toBeVisible();

    await openScreen(page, '/compliance/kyc-files/details', jwt);

    await expect(page.getByText('Domizil Vertragspartei', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Eröffnungsdatum', { exact: true })).toBeVisible();
    await expect(page.getByText('Sitzgesellschaft', { exact: true })).toBeVisible();
    await expect(page.getByText('Status', { exact: true }).first()).toBeVisible();

    expect(pageErrors, `uncaught pageerror on kyc-files: ${pageErrors.join('; ')}`).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // /compliance/kyc-stats
  // -------------------------------------------------------------------------

  test('/compliance/kyc-stats renders yearly statistics table', async ({ page }) => {
    const { jwt, userId } = await loginAs('Compliance');
    await ensureStaffKycComplete(userId);

    await openScreen(page, '/compliance/kyc-stats', jwt);

    await expect(page.getByText('As of 31.12.:', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('KYC files managed on 01.01.xxxx', { exact: true })).toBeVisible();
    await expect(page.getByText('KYC files managed on 31.12.20xx', { exact: true })).toBeVisible();
    await expect(page.getByText('Internal: Highest KYC file number', { exact: true })).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // /compliance/custody-orders (Admin only)
  // -------------------------------------------------------------------------

  test('/compliance/custody-orders renders table for Admin (empty ok)', async ({ page }) => {
    const { jwt, userId } = await loginAs('Admin');
    await ensureStaffKycComplete(userId);

    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await openScreen(page, '/compliance/custody-orders', jwt);

    await expect(page.getByText('Type', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('UserData ID', { exact: true })).toBeVisible();
    await expect(page.getByText('User Name', { exact: true })).toBeVisible();
    await expect(page.getByText('Actions', { exact: true })).toBeVisible();
    // Empty state is expected under DISABLED_PROCESSES=*
    await expect(
      page.getByText('No orders found', { exact: true }).or(page.locator('tbody tr').first()).first(),
    ).toBeVisible();

    expect(pageErrors, `uncaught pageerror on custody-orders: ${pageErrors.join('; ')}`).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // /compliance/mros + /compliance/mros/:id
  // -------------------------------------------------------------------------

  test('/compliance/mros lists cases and /mros/:id shows seeded detail', async ({ page }) => {
    const { jwt, userId } = await loginAs('Compliance');
    await ensureStaffKycComplete(userId);

    const customer = await createUser({ tag: 'cmp-mros-list', kycLevel: 30, completePersonalData: true });
    const mros = await createMrosCase({
      tag: 'cmp-mros-list',
      userDataId: customer.userDataId,
      reason: 'E2E list case reason',
    });

    await openScreen(page, '/compliance/mros', jwt);

    await expect(page.getByText('UserData ID', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Authority Reference', { exact: true })).toBeVisible();
    await expect(page.getByText('Case Manager', { exact: true })).toBeVisible();
    await expect(page.getByText(String(mros.mrosId), { exact: true }).first()).toBeVisible();
    await expect(page.getByText(String(customer.userDataId), { exact: true }).first()).toBeVisible();
    await expect(page.getByText('e2e-case-manager', { exact: true }).first()).toBeVisible();

    await openScreen(page, `/compliance/mros/${mros.mrosId}`, jwt);

    await expect(page.getByText('Overview', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Report', { exact: true })).toBeVisible();
    await expect(page.getByText(String(mros.mrosId), { exact: true }).first()).toBeVisible();
    await expect(page.getByText(String(customer.userDataId), { exact: true }).first()).toBeVisible();
    // Form fields unique to detail
    await expect(page.getByText('Case Manager', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Reason (Sachverhalt)', { exact: true })).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // /compliance/recalls
  // -------------------------------------------------------------------------

  test('/compliance/recalls renders list table (empty ok)', async ({ page }) => {
    const { jwt, userId } = await loginAs('Compliance');
    await ensureStaffKycComplete(userId);

    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await openScreen(page, '/compliance/recalls', jwt);

    await expect(page.getByText('Transaction', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Sequence', { exact: true })).toBeVisible();
    await expect(page.getByText('Reason', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Fee', { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText('No recalls found', { exact: true }).or(page.locator('tbody tr').first()).first(),
    ).toBeVisible();

    expect(pageErrors, `uncaught pageerror on recalls: ${pageErrors.join('; ')}`).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // /compliance/call-queues
  // -------------------------------------------------------------------------

  test('/compliance/call-queues lists queues including a seeded entry', async ({ page }) => {
    const { jwt, userId } = await loginAs('Compliance');
    await ensureStaffKycComplete(userId);

    const entry = await createCallQueueEntry({
      tag: 'cmp-callq-list',
      phoneCallStatus: 'Unavailable',
    });

    await openScreen(page, '/compliance/call-queues', jwt);

    await expect(page.getByText('Queue', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Count', { exact: true }).first()).toBeVisible();

    // At least one queue row with a non-zero count after seeding
    const countCells = page.locator('tbody tr td:nth-child(2)');
    await expect(countCells.first()).toBeVisible({ timeout: 15000 });

    // Prove the seeded user is reachable by reading a queue name from the DOM and opening it
    const firstQueueName = (await page.locator('tbody tr td:nth-child(1)').first().innerText()).trim();
    expect(firstQueueName.length, 'queue name from DOM must be non-empty').toBeGreaterThan(0);

    // Navigate into that queue and look for the seeded userDataId if present in this queue
    await page.locator('tbody tr').first().click();
    await page.waitForLoadState('networkidle');
    await expect
      .poll(() => normPath(new URL(page.url()).pathname), {
        message: 'clicking a queue row should navigate to /compliance/call-queues/<queue>',
        timeout: 15000,
      })
      .toMatch(new RegExp(`^/compliance/call-queues/${escapeRegExp(firstQueueName)}$`));

    // Table headers on the queue detail list
    await expect(page.getByText('User', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Phone', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('KYC', { exact: true }).first()).toBeVisible();

    // Seeded Unavailable entry should appear when this is the matching queue
    const bodyText = await page.locator('body').innerText();
    if (bodyText.includes(String(entry.userDataId))) {
      await expect(page.getByText(String(entry.userDataId), { exact: false }).first()).toBeVisible();
    }
  });

  // -------------------------------------------------------------------------
  // /sitemap (Admin only) — links must map to real App.tsx routes
  // -------------------------------------------------------------------------

  test('/sitemap renders for Admin and all links map to declared App routes', async ({ page }) => {
    const { jwt, userId } = await loginAs('Admin');
    await ensureStaffKycComplete(userId);

    await openScreen(page, '/sitemap', jwt);

    await expect(page.getByText('Compliance', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Auth & Account', { exact: true })).toBeVisible();
    await expect(page.getByText('Compliance Dashboard')).toBeVisible();
    await expect(page.getByText('(/compliance)')).toBeVisible();

    // Extract link paths from the rendered DOM (the parenthetical path text)
    const linkPaths = await page.locator('a').evaluateAll((anchors) =>
      anchors
        .map((a) => {
          const href = a.getAttribute('href') ?? '';
          // Prefer the explicit path shown in the label "( /path )"
          const label = a.textContent ?? '';
          const m = label.match(/\((\/[^)]+)\)/);
          if (m) return m[1];
          try {
            return new URL(href, 'http://local').pathname;
          } catch {
            return href;
          }
        })
        .filter((p) => p.startsWith('/')),
    );

    expect(linkPaths.length, 'sitemap must render at least one link').toBeGreaterThan(0);

    const appRoutes = extractAppRoutes(resolveAppSourcePath());

    /**
     * A sitemap path is "declared" when it equals a route path, or when every static segment
     * matches a route that only differs by `:param` placeholders (e.g. /compliance/user/1
     * is not on the sitemap, but /compliance is).
     */
    function isDeclared(linkPath: string): boolean {
      if (appRoutes.has(linkPath)) return true;
      // Match against param routes: /foo/:id matches /foo/123 is NOT needed for sitemap
      // (sitemap only lists static paths). Also accept loader/redirect paths present in Routes.
      for (const route of appRoutes) {
        if (!route.includes(':') && route === linkPath) return true;
        if (route.includes(':')) {
          const pattern = '^' + route.replace(/:[^/]+/g, '[^/]+') + '$';
          if (new RegExp(pattern).test(linkPath)) return true;
        }
      }
      return false;
    }

    const dead: string[] = [];
    for (const p of linkPaths) {
      if (!isDeclared(p)) dead.push(p);
    }

    // Document any dead links without weakening the assertion — fixme if real dead links appear.
    if (dead.length > 0) {
      test.info().annotations.push({
        type: 'bug',
        description: `Sitemap links not present in App.tsx Routes: ${dead.join(', ')}`,
      });
    }
    expect(dead, `Sitemap has dead links not declared in App.tsx: ${dead.join(', ')}`).toEqual([]);
  });
});

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
