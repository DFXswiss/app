import { test, expect, Page, Route } from '@playwright/test';

/**
 * E2E Visual Regression Tests: Settings add-bank-account KycOnly hint
 *
 * Routes:
 *   - /settings       (Bank accounts list → add-bank-account overlay)
 *   - /support/issue  (Sender IBAN → Add bank account, with confirmationText)
 *
 * Auth is a synthetic unsigned JWT (`alg: none`, role User). Bootstrap GETs, user PUT/PATCH
 * and POST /v1/bankAccount are mocked via page.route(...), so the suite does not need a live
 * API. A green run does not prove production auth or that the API rejects this account.
 *
 * Feature data is MOCKED with synthetic fixtures, so the baselines are deterministic AND contain
 * NO real production data. GET /v2/user returns empty `addresses` and `disabledAddresses` (the
 * KycOnly shape). GET /v1/country returns a DE row with `kycAllowed: true` so IBAN validation
 * can enable submit. POST /v1/bankAccount answers 400 with the backend KycOnly sentence.
 * Unmatched v1/v2 API calls are fulfilled with 501 (not continued). UI language is pinned with
 * `lang=de` / `lang=en`.
 *
 * Intercepted endpoints:
 *   - GET  /v1/language, /v1/fiat, /v1/asset, /v1/bankAccount, /v1/country, /v1/setting/infoBanner,
 *     /v1/support/issue
 *   - POST /v1/bankAccount  (400 KycOnly)
 *   - GET  /v2/user
 *   - PUT/PATCH /v1/user, /v2/user
 *
 * Synthetic fixtures: fake ids only — no production data.
 */

async function json(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

function jwt(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    account: 1,
    user: 1,
    role: 'User',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.synthetic`;
}

const CHF_FIAT = {
  id: 1,
  name: 'CHF',
  buyable: true,
  sellable: true,
  cardBuyable: false,
  cardSellable: false,
  instantBuyable: false,
  instantSellable: false,
};

const EXAMPLE_IBAN = 'DE89370400440532013000';

const HINT = {
  de: 'Bevor Du eine Bankverbindung hinterlegen kannst, braucht Dein DFX-Konto eine Wallet.',
  en: 'Before you can add a bank account, your DFX account needs a wallet.',
} as const;

const HEADING = {
  de: 'Deine Bankkonten',
  en: 'Your Bank Accounts',
} as const;

const SUBMIT = {
  de: /Bankverbindung hinzufügen/i,
  en: /Add bank account/i,
} as const;

const CONNECT = {
  de: 'Wallet verbinden',
  en: 'Connect a wallet',
} as const;

/** Settings bootstrap mocks plus POST /v1/bankAccount 400 and a wallet-less /v2/user. */
async function installSettingsRoutes(page: Page): Promise<void> {
  await page.route('**/v1/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (method === 'POST' && path === '/v1/bankAccount') {
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: 400,
          message: 'You cannot add an IBAN to a KYC only account',
          error: 'Bad Request',
        }),
      });
    }

    if ((method === 'PUT' || method === 'PATCH') && (path === '/v1/user' || path.startsWith('/v1/user/'))) {
      return json(route, {});
    }

    if (method === 'GET' && path === '/v1/language') {
      return json(route, [
        { id: 1, name: 'Deutsch', foreignName: 'German', symbol: 'DE', enable: true },
        { id: 2, name: 'English', foreignName: 'Englisch', symbol: 'EN', enable: true },
      ]);
    }

    if (method === 'GET' && path === '/v1/fiat') {
      return json(route, [CHF_FIAT]);
    }

    if (method === 'GET' && path === '/v1/country') {
      return json(route, [
        {
          id: 1,
          symbol: 'DE',
          name: 'Germany',
          foreignName: 'Deutschland',
          enable: true,
          kycAllowed: true,
          kycOrganizationAllowed: true,
          nationalityAllowed: true,
        },
      ]);
    }

    if (method === 'GET' && ['/v1/asset', '/v1/bankAccount'].includes(path)) {
      return json(route, []);
    }

    if (method === 'GET' && path === '/v1/setting/infoBanner') {
      return json(route, null);
    }

    if (method === 'GET' && path === '/v1/support/issue') {
      return json(route, []);
    }

    await route.fulfill({
      status: 501,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Unexpected test request' }),
    });
  });

  await page.route('**/v2/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if ((method === 'PUT' || method === 'PATCH') && (path === '/v2/user' || path.startsWith('/v2/user/'))) {
      return json(route, {});
    }

    if (method === 'GET' && path === '/v2/user') {
      return json(route, {
        id: 1,
        accountId: 1,
        mail: 'settings.kyconly@example.com',
        currency: { id: 1, name: 'CHF' },
        language: { id: 1, name: 'Deutsch', symbol: 'DE' },
        kyc: { level: 50, status: 'Completed' },
        addresses: [],
        disabledAddresses: [],
      });
    }

    await route.fulfill({
      status: 501,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Unexpected test request' }),
    });
  });
}

async function openHint(page: Page, lang: 'de' | 'en'): Promise<void> {
  const token = jwt();
  await installSettingsRoutes(page);

  await page.goto(`/settings?session=${encodeURIComponent(token)}&lang=${lang}`);

  const heading = page.getByRole('heading', { name: HEADING[lang] });
  await expect(heading).toBeVisible({ timeout: 15_000 });
  await heading.getByRole('button').click();

  await submitIbanAndExpectHint(page, lang);
}

async function submitIbanAndExpectHint(page: Page, lang: 'de' | 'en'): Promise<void> {
  const iban = page.getByPlaceholder('XX XXXX XXXX XXXX XXXX X');
  await expect(iban).toBeVisible({ timeout: 15_000 });
  await iban.fill(EXAMPLE_IBAN);
  await iban.blur();

  const submit = page.getByRole('button', { name: SUBMIT[lang] });
  await expect(submit).toBeEnabled({ timeout: 15_000 });
  await submit.click();

  await expect(page.getByText(HINT[lang])).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1000);
}

test.describe('Settings Bank Account KycOnly - Visual Regression Tests', () => {
  test('German hint after KYC-only IBAN rejection', async ({ page }) => {
    await openHint(page, 'de');

    await expect(page).toHaveScreenshot('settings-bank-account-kyc-only-de.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });

    const link = page.getByRole('link', { name: CONNECT.de });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/connect/);
  });

  test('English hint after KYC-only IBAN rejection', async ({ page }) => {
    await openHint(page, 'en');

    await expect(page).toHaveScreenshot('settings-bank-account-kyc-only-en.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });

    const link = page.getByRole('link', { name: CONNECT.en });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/connect/);
  });

  test('German hint after KYC-only IBAN rejection from the support-issue sender IBAN', async ({ page }) => {
    const token = jwt();
    await installSettingsRoutes(page);

    await page.goto(
      `/support/issue?session=${encodeURIComponent(token)}&lang=de&issue-type=TransactionIssue&reason=TransactionMissing`,
    );

    const senderLabel = page.getByText('Absender-IBAN', { exact: true }).first();
    await expect(senderLabel).toBeVisible({ timeout: 15_000 });
    await senderLabel.locator('xpath=following::button[1]').click();
    await page.getByRole('button', { name: 'Bankverbindung hinzufügen' }).click();

    await submitIbanAndExpectHint(page, 'de');

    await expect(page).toHaveScreenshot('settings-bank-account-kyc-only-support-de.png', {
      fullPage: true,
      maxDiffPixels: 5000,
    });
  });
});
