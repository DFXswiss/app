import { test, expect } from '@playwright/test';
import { getCachedAuth } from './helpers/auth-cache';
import { app2ScreenshotOpts as screenshotOpts } from './helpers/app2-screenshot';

/**
 * App 2.0 handbook baselines for every screen that needs a wallet.
 *
 * Intended path: start the local stack with `npm run e2e:stack:up`,
 * set `REACT_APP_API_URL=http://localhost:3000` in `.env`, then run this spec
 * against `http://localhost:3001`.
 *
 * Do not take these pictures against the production API. The wallet from
 * `.env.sample` is public; on production, other people's account data can
 * land in the image.
 *
 * These pictures are a real session against that API, not a mocked shell.
 * The stack's mock providers do not serve quotes, so the buy picture shows
 * the no-quote state. The account is fresh, so the transaction list is empty.
 */
async function openApp2Session(page: import('@playwright/test').Page, token: string, hash: string): Promise<void> {
  const url = `/app2/?session=${encodeURIComponent(token)}${hash}`;
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  expect(response, `${url} must be served`).toBeTruthy();
  expect(response?.ok(), `${url} status ${response?.status()}`).toBe(true);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page).toHaveTitle('DFX');
  await expect(page.locator('#root')).not.toBeEmpty();
}

/**
 * Demo mode lives in React state. A hash reload would drop it, so after enable
 * we only click hub tiles (`go(sub)`). The activation probe must finish first:
 * an in-flight 403 would overwrite `enableDemo()`'s `active`/`config`.
 */
async function openOcpDemoTile(page: import('@playwright/test').Page, token: string, tileTitle: RegExp): Promise<void> {
  await Promise.all([
    page.waitForResponse((res) => res.url().includes('paymentLink/config') && res.request().method() === 'GET'),
    openApp2Session(page, token, '#/ocp'),
  ]);
  await expect(page.getByRole('heading', { name: /opencryptopay/i }).first()).toBeVisible();
  await page.getByRole('button', { name: /try a live demo|live-demo|prova una demo|essayer une démo/i }).click();
  await expect(page.getByTestId('ocp-demo-badge')).toBeVisible();
  await expect(page.getByTestId('ocp-tile').first()).toBeVisible();
  await expect(page.getByTestId('app2-toast')).toBeHidden();
  await page.getByTestId('ocp-tile').filter({ hasText: tileTitle }).click();
  await expect(page.getByTestId('ocp-demo-badge')).toBeVisible();
}

test.describe('App2 session screens', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const auth = await getCachedAuth(request, 'evm');
    token = auth.token;
  });

  test('buy (logged in)', async ({ page }) => {
    await openApp2Session(page, token, '#/');
    await expect(page.getByRole('tablist')).toBeVisible();
    await expect(page.getByRole('tab', { name: /^buy$/i })).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveScreenshot('app2-buy.png', screenshotOpts);
  });

  test('sell (logged in)', async ({ page }) => {
    await openApp2Session(page, token, '#/?mode=sell');
    await expect(page.getByRole('tablist')).toBeVisible();
    await expect(page.getByRole('tab', { name: /^sell$/i })).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveScreenshot('app2-sell.png', screenshotOpts);
  });

  test('swap (logged in)', async ({ page }) => {
    await openApp2Session(page, token, '#/?mode=swap');
    await expect(page.getByRole('tablist')).toBeVisible();
    await expect(page.getByRole('tab', { name: /^swap$/i })).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveScreenshot('app2-swap.png', screenshotOpts);
  });

  test('account (logged in)', async ({ page }) => {
    await openApp2Session(page, token, '#/account');
    await expect(page.getByText(/not verified|nicht verifiziert|non verificato|non vérifié/i)).toBeVisible();
    await expect(page).toHaveScreenshot('app2-account-in.png', screenshotOpts);
  });

  test('transactions (logged in)', async ({ page }) => {
    await openApp2Session(page, token, '#/tx');
    await expect(page.getByRole('heading', { name: /transactions|transaktionen|transazioni/i })).toBeVisible();
    await expect(page).toHaveScreenshot('app2-tx-in.png', screenshotOpts);
  });

  test('kyc steps (logged in)', async ({ page }) => {
    await openApp2Session(page, token, '#/kyc');
    await expect(page.getByRole('heading', { name: /verification|verifizierung|verifica/i })).toBeVisible();
    await expect(page.getByText(/personal data|persönliche daten|dati personali|données personnelles/i)).toBeVisible();
    await expect(page).toHaveScreenshot('app2-kyc-in.png', screenshotOpts);
  });

  test('limit (logged in)', async ({ page }) => {
    await openApp2Session(page, token, '#/limit');
    await expect(page.getByTestId('limit-card')).toBeVisible();
    await expect(page).toHaveScreenshot('app2-limit-in.png', screenshotOpts);
  });

  test('OpenCryptoPay hub (logged in)', async ({ page }) => {
    await openApp2Session(page, token, '#/ocp');
    await expect(page.getByRole('heading', { name: /opencryptopay/i }).first()).toBeVisible();
    await expect(page).toHaveScreenshot('app2-ocp-in.png', screenshotOpts);
  });

  test('OpenCryptoPay apply (logged in)', async ({ page }) => {
    await openApp2Session(page, token, '#/ocp?sub=apply');
    await expect(page.getByRole('heading', { name: /apply|beantragen|candidati|postuler/i }).first()).toBeVisible();
    await expect(page).toHaveScreenshot('app2-ocp-apply.png', screenshotOpts);
  });

  test('OpenCryptoPay payment routes (logged in)', async ({ page }) => {
    await openOcpDemoTile(page, token, /^(payment routes|zahlungswege|metodi di pagamento|moyens de paiement)$/i);
    await expect(
      page
        .getByRole('heading', { name: /payment routes|zahlungswege|metodi di pagamento|moyens de paiement/i })
        .first(),
    ).toBeVisible();
    await expect(page.getByTestId('ocp-demo-badge')).toBeVisible();
    await expect(page).toHaveScreenshot('app2-ocp-routes.png', screenshotOpts);
  });

  test('OpenCryptoPay invoice (logged in)', async ({ page }) => {
    await openOcpDemoTile(page, token, /^(create invoice|rechnung erstellen|crea fattura|créer une facture)$/i);
    await expect(
      page.getByRole('heading', { name: /create invoice|rechnung erstellen|crea fattura|créer une facture/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /generate invoice|rechnung erstellen|genera fattura|générer la facture/i }),
    ).toBeVisible();
    await expect(page.getByTestId('ocp-demo-badge')).toBeVisible();
    await expect(page).toHaveScreenshot('app2-ocp-invoice.png', screenshotOpts);
  });

  test('OpenCryptoPay point of sale (logged in)', async ({ page }) => {
    await openOcpDemoTile(page, token, /^(point of sale|kasse|cassa|caisse)$/i);
    await expect(page.getByRole('heading', { name: /point of sale|kasse|cassa|caisse/i }).first()).toBeVisible();
    await expect(page.getByTestId('ocp-pos-register')).toContainText('Front counter');
    await expect(page.getByTestId('ocp-demo-badge')).toBeVisible();
    await expect(page).toHaveScreenshot('app2-ocp-pos.png', screenshotOpts);
  });

  test('OpenCryptoPay links (logged in)', async ({ page }) => {
    await openOcpDemoTile(page, token, /^(payment links|zahlungslinks|link di pagamento|liens de paiement)$/i);
    await expect(
      page.getByRole('heading', { name: /payment links|zahlungslinks|link di pagamento|liens de paiement/i }).first(),
    ).toBeVisible();
    // LinkCard is a closed <details>; .qcap lives in the collapsed body and is not the open state.
    await expect(page.locator('[data-testid="ocp-link-card"][open]')).toHaveCount(0);
    await expect(page.getByTestId('ocp-link-card').filter({ hasText: 'Front counter' })).toBeVisible();
    await expect(page.getByTestId('ocp-link-card').filter({ hasText: 'Online shop' })).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: /create payment link|zahlungslink erstellen|crea link di pagamento|créer un lien de paiement/i,
      }),
    ).toBeVisible();
    await expect(page.getByTestId('ocp-demo-badge')).toBeVisible();
    await expect(page).toHaveScreenshot('app2-ocp-links.png', screenshotOpts);
  });

  test('OpenCryptoPay history (logged in)', async ({ page }) => {
    await openOcpDemoTile(
      page,
      token,
      /^(payment history|zahlungsverlauf|storico pagamenti|historique des paiements)$/i,
    );
    await expect(
      page
        .getByRole('heading', {
          name: /payment history|zahlungsverlauf|storico pagamenti|historique des paiements/i,
        })
        .first(),
    ).toBeVisible();
    await expect(page.getByText('Coffee & croissant')).toBeVisible();
    await expect(page.getByText('Lunch menu')).toBeVisible();
    await expect(page.getByTestId('ocp-demo-badge')).toBeVisible();
    await expect(page).toHaveScreenshot('app2-ocp-history.png', screenshotOpts);
  });

  test('OpenCryptoPay settings (logged in)', async ({ page }) => {
    await openOcpDemoTile(page, token, /^(settings|einstellungen|impostazioni|réglages)$/i);
    await expect(
      page.getByRole('heading', { name: /settings|einstellungen|impostazioni|réglages/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByText(
        /defaults applied to every new payment|standardwerte für jede neue zahlung|valori predefiniti per ogni nuovo pagamento|valeurs par défaut pour chaque paiement/i,
      ),
    ).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /^OpenCryptoPay$/ })).toBeVisible();
    await expect(page.getByTestId('ocp-demo-badge')).toBeVisible();
    await expect(page).toHaveScreenshot('app2-ocp-config.png', screenshotOpts);
  });
});
