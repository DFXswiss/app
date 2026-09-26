import { expect, Page, Route, test } from '@playwright/test';

/**
 * E2E Visual Regression Tests: RealUnit staff Referral-admin dashboard
 *
 * Routes:
 *   - /realunit/referral        (relation list — every relation, review filter off by default)
 *   - /realunit/referral/:id    (relation detail — review/reward history + approve/reject/manual-prize)
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
    id: 8102,
    kind: 'Promo',
    userId: 8202,
    code: 'PROMO24',
    credited: false,
    created: '2026-08-31T09:00:00.000Z',
    reviewStatus: 'Pending',
    reviewedBy: 'System',
    reviewedAt: '2026-08-31T09:02:00.000Z',
    reviewReason: 'Manual review threshold reached',
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
  },
];

async function mockReferralApi(page: Page, promo: unknown[] = []): Promise<void> {
  await page.route('**/v1/**', async (route: Route) => {
    const request = route.request();
    const url = request.url();
    const path = new URL(url).pathname;
    if (LIST_RE.test(url)) return json(route, RELATIONS);
    if (PROMO_RE.test(url) && request.method() === 'GET') return json(route, promo);
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
        language: { id: 1, name: 'English', symbol: 'EN' },
      });
    }
    await route.continue();
  });
}

test.describe('RealUnit Referral admin', () => {
  test('relation list renders every relation', async ({ page }) => {
    await mockReferralApi(page);

    await page.goto(`/realunit/referral?session=${encodeURIComponent(jwt())}&lang=en`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await expect(page.getByRole('heading', { name: 'Start promo code' })).toBeVisible();
    await expect(page.getByText('No promo codes yet')).toBeVisible();
    await expect(page.getByText('AB12CD')).toBeVisible();
    await expect(page.getByText('PROMO24')).toBeVisible();
    await expect(page.getByRole('checkbox')).not.toBeChecked();
    await expect(page.getByText('ZZ99YY')).toBeVisible();
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('realunit-referral-01-list.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test('promo list shows a shareable landing link and QR dialog', async ({ page }) => {
    await mockReferralApi(page, PROMO_CODES);

    await page.goto(`/realunit/referral?session=${encodeURIComponent(jwt())}&lang=en`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await expect(page.getByRole('link', { name: 'https://realunit.app/promo/XYZ' })).toBeVisible();
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
});
