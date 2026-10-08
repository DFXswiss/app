import { expect, Page, Route, test } from '@playwright/test';

/**
 * E2E Visual Regression Tests: RealUnit staff Referral-admin dashboard
 *
 * Routes:
 *   - /realunit/promo           (promo codes — start form, code list with status/filters/sort, redeemed promo codes)
 *   - /realunit/promo/:id       (promo redemption detail — no referrer row, back to the promo codes)
 *   - /realunit/referral        (referral list — invites only, review filter off by default)
 *   - /realunit/referral/:id    (referral detail — review/reward history + approve/reject/manual-prize)
 *
 * Auth is a synthetic Admin JWT. Feature data is MOCKED: relations, promo codes, and staff
 * bootstrap GETs. A green run does not prove the live promo or relations API returns these payloads.
 *
 * Intercepted endpoints:
 *   - GET realunit/referral/admin/relations → RealUnitReferralRelation[]
 *   - GET realunit/referral/promo → RealUnitPromoCode[] (empty on the list
 *     screenshot; one shareable campaign code on the landing/QR variants)
 * The detail screen sources a single relation from that same list (there is no single-relation GET).
 *
 * Synthetic fixtures: fake ids (8100+), fixed ISO dates, fake codes/accounts — no production data.
 */

function jwt(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    account: 1,
    user: 1,
    role: 'Admin',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.synthetic`;
}

const RELATION_ID = 8101;

// ---------------------------------------------------------------------------
// Synthetic fixtures (mirror src/dto/realunit-referral.dto.ts RealUnitReferralRelation). Date fields are
// ISO strings over the wire.
// ---------------------------------------------------------------------------
const RELATIONS = [
  {
    id: RELATION_ID,
    kind: 'Invite',
    userId: 8201,
    guestAccountId: 8301,
    referrerAccountId: 8401,
    code: 'AB12CD',
    credited: false,
    created: '2026-08-30T10:00:00.000Z',
    reviewStatus: 'Pending',
    reviewedBy: 'System',
    reviewedAt: '2026-08-30T10:05:00.000Z',
    reviewReason: 'High redemption velocity',
  },
  {
    // Promo redemptions are never held for manual review (the API only holds referral invites),
    // so this fixture is credited and carries no review fields.
    id: 8102,
    kind: 'Promo',
    userId: 8202,
    guestAccountId: 8302,
    code: 'WOV2026',
    credited: true,
    consumedAt: '2026-10-01T09:30:00.000Z',
    created: '2026-10-01T09:00:00.000Z',
  },
  {
    id: 8103,
    kind: 'Invite',
    userId: 8203,
    code: 'ZZ99YY',
    credited: true,
    created: '2026-08-20T08:00:00.000Z',
    reviewStatus: 'Approved',
    reviewedBy: 'Clerk A',
    reviewedAt: '2026-08-21T08:00:00.000Z',
    reviewReason: 'Legitimate referral',
    manualRewardedBy: 'Clerk A',
    manualRewardedAt: '2026-08-21T08:10:00.000Z',
    manualRewardReason: 'Manual payout after approval',
  },
  {
    id: 8104,
    kind: 'Invite',
    userId: 8204,
    code: 'NO77XX',
    credited: false,
    created: '2026-08-15T08:00:00.000Z',
    reviewStatus: 'Rejected',
    reviewedBy: 'Clerk A',
    reviewedAt: '2026-08-16T08:00:00.000Z',
    reviewReason: 'Duplicate account',
  },
];

const LIST_RE = /\/v1\/realunit\/referral\/admin\/relations(\?|$)/;
const PROMO_RE = /\/v1\/realunit\/referral\/promo(\?|$)/;

async function json(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

const PROMO_CODES = [
  {
    id: 1,
    code: 'XYZ',
    minBuyRealu: 200,
    redemptionCap: 50,
    validFrom: '2026-09-01T00:00:00.000Z',
    validUntil: '2026-12-31T23:59:59.000Z',
    redemptionCount: 0,
  },
];

// One code per status for the overview variants, seen at OVERVIEW_NOW.
const OVERVIEW_NOW = new Date('2026-10-02T08:00:00.000Z');
const promoRow = (id: number, code: string, from: string, until: string, extra: object = {}) => ({
  id,
  code,
  minBuyRealu: 200,
  redemptionCap: 150,
  redemptionCount: 0,
  validFrom: `${from}T00:00:00.000Z`,
  validUntil: `${until}T23:59:59.999Z`,
  ...extra,
});
const PROMO_OVERVIEW = [
  promoRow(31, 'WOV2026', '2026-10-01', '2026-10-18', { redemptionCount: 1 }),
  promoRow(32, 'AUTUMN', '2026-10-12', '2026-11-30'),
  promoRow(33, 'FULL', '2026-09-20', '2026-10-30', { redemptionCap: 1, redemptionCount: 1 }),
  promoRow(34, 'SUMMER', '2026-09-10', '2026-09-25'),
  promoRow(35, 'OFFTEST', '2026-09-14', '2026-09-15', { deactivatedAt: '2026-09-15T10:00:00.000Z' }),
];
const DEACTIVATE_RE = /\/v1\/realunit\/referral\/promo\/\d+\/deactivate$/;

// `german` answers the language list and gives the user German, so `lang=de` renders German labels.
async function mockReferralApi(page: Page, promo: unknown[] = [], { german = false } = {}): Promise<void> {
  await page.route('**/v1/**', async (route: Route) => {
    const request = route.request();
    const url = request.url();
    const path = new URL(url).pathname;
    if (LIST_RE.test(url)) return json(route, RELATIONS);
    if (PROMO_RE.test(url) && request.method() === 'GET') return json(route, promo);
    if (DEACTIVATE_RE.test(path) && request.method() === 'PUT') return json(route, {});
    if (german && request.method() === 'GET' && path === '/v1/language') {
      return json(route, [
        { id: 3, name: 'German', foreignName: 'Deutsch', symbol: 'DE', enable: true },
        { id: 1, name: 'English', foreignName: 'English', symbol: 'EN', enable: true },
      ]);
    }
    if (
      request.method() === 'GET' &&
      ['/v1/language', '/v1/fiat', '/v1/asset', '/v1/bankAccount', '/v1/country'].includes(path)
    ) {
      return json(route, []);
    }
    if (request.method() === 'GET' && path === '/v1/setting/infoBanner') return json(route, null);
    await route.continue();
  });
  await page.route('**/v2/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET' && path === '/v2/user') {
      return json(route, {
        id: 1,
        activeAddress: { address: '0x0000000000000000000000000000000000000001', wallet: 'DFX' },
        addresses: [],
        kyc: { level: 50, status: 'Completed' },
        language: german
          ? { id: 3, name: 'German', foreignName: 'Deutsch', symbol: 'DE', enable: true }
          : { id: 1, name: 'English', symbol: 'EN' },
      });
    }
    await route.continue();
  });
}

test.describe('RealUnit Referral admin', () => {
  test('referral list renders the referral invites only', async ({ page }) => {
    await mockReferralApi(page);

    await page.goto(`/realunit/referral?session=${encodeURIComponent(jwt())}&lang=en`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await expect(page.getByRole('heading', { name: 'Start promo code' })).toHaveCount(0);
    await expect(page.getByText('AB12CD')).toBeVisible();
    await expect(page.getByText('WOV2026')).toHaveCount(0);
    await expect(page.getByRole('checkbox')).not.toBeChecked();
    await expect(page.getByText('ZZ99YY')).toBeVisible();
    await expect(page.getByText('Rejected', { exact: true })).toBeVisible();
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('realunit-referral-01-list.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test('promo list shows a shareable landing link and QR dialog', async ({ page }) => {
    await mockReferralApi(page, PROMO_CODES);

    await page.goto(`/realunit/promo?session=${encodeURIComponent(jwt())}&lang=en`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await expect(page.getByRole('link', { name: 'https://realunit.app/promo/XYZ' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Redeemed promo codes' })).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('realunit-referral-03-promo-link.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });

    await page.getByRole('button', { name: 'View QR code' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download PNG' })).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('realunit-referral-04-promo-qr.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test('promo row opens an editor', async ({ page }) => {
    await mockReferralApi(page, PROMO_CODES);

    await page.goto(`/realunit/promo?session=${encodeURIComponent(jwt())}&lang=en`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('realunit-referral-05-promo-edit.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test('deactivated promo row offers activate', async ({ page }) => {
    await mockReferralApi(page, [
      {
        ...PROMO_CODES[0],
        code: 'OLD',
        deactivatedAt: '2026-09-25T11:56:47.917Z',
        redemptionCount: 0,
      },
    ]);

    await page.goto(`/realunit/promo?session=${encodeURIComponent(jwt())}&lang=en`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Deactivated codes are hidden by default; the operator shows them with the filter.
    await expect(page.getByRole('checkbox', { name: 'Hide deactivated' })).toBeChecked();
    await page.getByRole('checkbox', { name: 'Hide deactivated' }).uncheck();
    await expect(page.getByText('Deactivated', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Activate', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Deactivate', exact: true })).toHaveCount(0);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('realunit-referral-06-promo-activate.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test('promo page without codes shows the empty list', async ({ page }) => {
    await mockReferralApi(page);

    await page.goto(`/realunit/promo?session=${encodeURIComponent(jwt())}&lang=en`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await expect(page.getByText('No promo codes yet')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Hide deactivated' })).toHaveCount(0);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('realunit-referral-16-promo-empty.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test('promo list says when the filters hide every code', async ({ page }) => {
    await mockReferralApi(page, [
      {
        ...PROMO_CODES[0],
        code: 'OLD',
        deactivatedAt: '2026-09-25T11:56:47.917Z',
        redemptionCount: 0,
      },
    ]);

    await page.goto(`/realunit/promo?session=${encodeURIComponent(jwt())}&lang=en`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await expect(page.getByRole('checkbox', { name: 'Hide deactivated' })).toBeChecked();
    await expect(page.getByText('No promo codes match the filters')).toBeVisible();
    await expect(page.getByText('OLD', { exact: true })).toHaveCount(0);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('realunit-referral-17-promo-no-match.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test('relation detail renders history and review actions', async ({ page }) => {
    await mockReferralApi(page);

    await page.goto(`/realunit/referral/${RELATION_ID}?session=${encodeURIComponent(jwt())}&lang=en`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await expect(page.getByText('AB12CD')).toBeVisible();
    await expect(page.getByText('High redemption velocity')).toBeVisible();
    // Pending + not credited → approve/reject offered, manual prize not
    await expect(page.getByText('Approve', { exact: true })).toBeVisible();
    await expect(page.getByText('Reject', { exact: true })).toBeVisible();
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('realunit-referral-02-detail.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test('promo code list shows status, filters and sorting by valid until', async ({ page }) => {
    await page.clock.setFixedTime(OVERVIEW_NOW);
    await mockReferralApi(page, PROMO_OVERVIEW);

    await page.goto(`/realunit/promo?session=${encodeURIComponent(jwt())}&lang=en`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await expect(page.getByText('4 of 5 shown')).toBeVisible();
    await expect(page.getByText('OFFTEST')).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: /Valid until/ })).toHaveAttribute('aria-sort', 'descending');
    await expect(page.getByText('Planned', { exact: true })).toBeVisible();
    await expect(page.getByText('Active', { exact: true })).toBeVisible();
    await expect(page.getByText('Exhausted', { exact: true })).toBeVisible();
    await expect(page.getByText('Expired', { exact: true })).toBeVisible();
    await expect(page.getByText('18.10.2026')).toBeVisible();
    // The workspace scrolls inside its own container, so bring the whole code list into view first.
    await page.getByText('SUMMER', { exact: true }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('realunit-referral-07-promo-overview.png', {
      maxDiffPixelRatio: 0.01,
    });
  });

  test('promo redemption detail has its own title and no referrer row', async ({ page }) => {
    await mockReferralApi(page);

    await page.goto(`/realunit/promo/8102?session=${encodeURIComponent(jwt())}&lang=en`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await expect(page.getByText('WOV2026')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Promo redemption' }).first()).toBeVisible();
    await expect(page.getByText('Referrer account')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Promo codes' })).toHaveAttribute('aria-current', 'page');
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('realunit-referral-08-promo-detail.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });
  test('promo code list hides expired codes and sorts earliest first', async ({ page }) => {
    await page.clock.setFixedTime(OVERVIEW_NOW);
    await mockReferralApi(page, PROMO_OVERVIEW);

    await page.goto(`/realunit/promo?session=${encodeURIComponent(jwt())}&lang=en`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await page.getByRole('checkbox', { name: 'Hide expired' }).check();
    await page.getByRole('button', { name: /Valid until/ }).click();

    await expect(page.getByText('3 of 5 shown')).toBeVisible();
    await expect(page.getByText('SUMMER', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: /Valid until/ })).toHaveAttribute('aria-sort', 'ascending');
    await page.getByText('AUTUMN', { exact: true }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('realunit-referral-09-promo-expired-hidden-earliest-first.png', {
      maxDiffPixelRatio: 0.01,
    });
  });

  test('a code deactivated in this visit stays visible with activate', async ({ page }) => {
    await page.clock.setFixedTime(OVERVIEW_NOW);
    await mockReferralApi(page, PROMO_OVERVIEW);

    await page.goto(`/realunit/promo?session=${encodeURIComponent(jwt())}&lang=en`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const row = page.getByRole('row').filter({ has: page.getByText('WOV2026', { exact: true }) });
    await row.getByRole('button', { name: 'Deactivate', exact: true }).click();

    await expect(row.getByText('Deactivated', { exact: true })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Activate', exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Hide deactivated' })).toBeChecked();
    await expect(page.getByText('4 of 5 shown')).toBeVisible();
    await page.getByText('SUMMER', { exact: true }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('realunit-referral-10-promo-deactivated-this-visit.png', {
      maxDiffPixelRatio: 0.01,
    });
  });

  test('referral list shows only invites held for review when filtered', async ({ page }) => {
    await mockReferralApi(page);

    await page.goto(`/realunit/referral?session=${encodeURIComponent(jwt())}&lang=en`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await page.getByRole('checkbox', { name: /Held for review only/ }).check();

    await expect(page.getByText('AB12CD')).toBeVisible();
    await expect(page.getByText('ZZ99YY')).toHaveCount(0);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('realunit-referral-11-list-held-for-review.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });
  test('promo codes and referrals render their German labels', async ({ page }) => {
    await page.clock.setFixedTime(OVERVIEW_NOW);
    await mockReferralApi(page, PROMO_OVERVIEW, { german: true });
    const open = async (path: string) => {
      await page.goto(`${path}?session=${encodeURIComponent(jwt())}&lang=de`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
    };

    await open('/realunit/promo');
    await expect(page.getByText('4 von 5 angezeigt')).toBeVisible();
    await expect(page.getByText('Ausgeschöpft', { exact: true })).toBeVisible();
    await expect(page.getByText('Eingelöste Promo-Codes')).toBeVisible();
    await page.getByText('SUMMER', { exact: true }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('realunit-referral-12-promo-overview-de.png', { maxDiffPixelRatio: 0.01 });

    await open('/realunit/referral');
    await expect(page.getByRole('link', { name: 'Empfehlungen' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText('Abgelehnt', { exact: true })).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('realunit-referral-13-list-de.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });

    await open('/realunit/promo/8102');
    await expect(page.getByRole('heading', { name: 'Promo-Einlösung' }).first()).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('realunit-referral-14-promo-detail-de.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });

    await open(`/realunit/referral/${RELATION_ID}`);
    await expect(page.getByText('Einladung', { exact: true })).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('realunit-referral-15-referral-detail-de.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });
});
