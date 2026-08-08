import { test, expect, Page, Route } from '@playwright/test';

/**
 * Visual baselines for the invoice screen in merchant and payer mode.
 * Handbook group key: invoice-screen (from this file name before `.spec.ts-`).
 */

const RECIPIENT_RE = /\/v1\/paymentLink\/recipient(?:\?|$)/;

/** StyledInput uses autocomplete as the HTML name; recipient field is autocomplete="name". */
function recipientInput(page: Page) {
  return page.locator('input[name="name"], input[autocomplete="name"]');
}

async function installRecipientRoute(
  page: Page,
  mock: { ok: true; currency?: string } | { ok: false },
): Promise<void> {
  await page.route(RECIPIENT_RE, async (route: Route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    if (!mock.ok) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Not found' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ currency: { name: mock.currency ?? 'CHF' } }),
    });
  });
}

test.describe('Invoice Screen', () => {
  test('merchant mode: Create Invoice wording, QR and Copy Link', async ({ page }) => {
    await page.goto('/invoice');
    await page.waitForLoadState('networkidle');
    // Focus is applied after 200ms on the recipient field; wait so the ring is stable.
    await page.waitForTimeout(500);

    const pageContent = await page.textContent('body');

    const hasMerchantWording =
      pageContent?.includes('Create Invoice') ||
      pageContent?.includes('Rechnung erstellen') ||
      pageContent?.includes('Open invoice') ||
      pageContent?.includes('Rechnung öffnen') ||
      pageContent?.includes('Invoice ID') ||
      pageContent?.includes('Rechnungs-ID');

    const hasPayerWording =
      pageContent?.includes('Pay invoice') ||
      pageContent?.includes('Rechnung bezahlen') ||
      pageContent?.includes('Continue to payment') ||
      pageContent?.includes('Weiter zur Zahlung') ||
      pageContent?.includes('Payee') ||
      pageContent?.includes('Zahlungsempfänger');

    expect(hasMerchantWording).toBeTruthy();
    expect(hasPayerWording).toBeFalsy();

    await expect(page).toHaveScreenshot('invoice-merchant.png', {
      maxDiffPixels: 10000,
    });
  });

  test('payer mode: Pay invoice wording without recipient prefill', async ({ page }) => {
    await page.goto('/invoice?pay=1');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const pageContent = await page.textContent('body');

    const hasPayerWording =
      pageContent?.includes('Pay invoice') ||
      pageContent?.includes('Rechnung bezahlen') ||
      pageContent?.includes('Continue to payment') ||
      pageContent?.includes('Weiter zur Zahlung') ||
      pageContent?.includes('Invoice number') ||
      pageContent?.includes('Rechnungsnummer') ||
      pageContent?.includes('Payee') ||
      pageContent?.includes('Zahlungsempfänger');

    const hasMerchantWording =
      pageContent?.includes('Create Invoice') ||
      pageContent?.includes('Rechnung erstellen') ||
      pageContent?.includes('Open invoice') ||
      pageContent?.includes('Rechnung öffnen') ||
      pageContent?.includes('Invoice ID') ||
      pageContent?.includes('Rechnungs-ID');

    expect(hasPayerWording).toBeTruthy();
    expect(hasMerchantWording).toBeFalsy();

    await expect(page).toHaveScreenshot('invoice-payer.png', {
      maxDiffPixels: 10000,
    });
  });

  test('payer mode: prefilled payee display and unknown-recipient error', async ({ page }) => {
    await installRecipientRoute(page, { ok: false });

    await page.goto('/invoice?recipient=Foo&pay=1');
    await page.waitForLoadState('networkidle');

    // Payee from the printed QR is display text, not an input field.
    await expect(page.getByRole('group', { name: /Payee|Zahlungsempfänger/i })).toBeVisible();
    await expect(page.getByRole('group', { name: /Payee|Zahlungsempfänger/i })).toContainText('Foo');
    // Real input would use autocomplete="name"; display mode has none.
    await expect(recipientInput(page)).toHaveCount(0);

    await expect(
      page.getByText(/does not recognize a recipient|kennt keinen Empfänger/i),
    ).toBeVisible();

    const pageContent = await page.textContent('body');

    const hasPayerWording =
      pageContent?.includes('Pay invoice') ||
      pageContent?.includes('Rechnung bezahlen') ||
      pageContent?.includes('Continue to payment') ||
      pageContent?.includes('Weiter zur Zahlung') ||
      pageContent?.includes('Invoice number') ||
      pageContent?.includes('Rechnungsnummer') ||
      pageContent?.includes('Payee') ||
      pageContent?.includes('Zahlungsempfänger');

    const hasMerchantWording =
      pageContent?.includes('Create Invoice') ||
      pageContent?.includes('Rechnung erstellen') ||
      pageContent?.includes('Open invoice') ||
      pageContent?.includes('Rechnung öffnen') ||
      pageContent?.includes('Invoice ID') ||
      pageContent?.includes('Rechnungs-ID');

    expect(hasPayerWording).toBeTruthy();
    expect(hasMerchantWording).toBeFalsy();

    await expect(page).toHaveScreenshot('invoice-payer-prefilled.png', {
      maxDiffPixels: 10000,
    });
  });

  test('payer mode: verified payee from printed QR shows confirmation', async ({ page }) => {
    await installRecipientRoute(page, { ok: true, currency: 'CHF' });

    await page.goto('/invoice?recipient=AcmeCorp&pay=1');
    await page.waitForLoadState('networkidle');

    const payeeGroup = page.getByRole('group', { name: /Payee|Zahlungsempfänger/i });
    await expect(payeeGroup).toBeVisible();
    await expect(payeeGroup).toContainText('AcmeCorp');
    await expect(recipientInput(page)).toHaveCount(0);

    // Confirmed recipient: accessible verification name next to the value.
    await expect(
      page.getByRole('img', { name: /Recipient verified|Empfänger bestätigt/i }),
    ).toBeVisible();

    // Invoice fields unlock after a known recipient.
    await expect(page.locator('input[name="invoice-id"], input[autocomplete="invoice-id"]')).toBeEnabled({
      timeout: 10000,
    });

    await expect(page).toHaveScreenshot('invoice-payer-verified.png', {
      maxDiffPixels: 10000,
    });
  });
});
