import { test, expect } from '@playwright/test';

/**
 * Visual baselines for the invoice screen in merchant and payer mode.
 * Handbook group key: invoice-screen (from this file name before `.spec.ts-`).
 */
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

  test('payer mode: prefilled locked payee and unknown-recipient error', async ({ page }) => {
    await page.goto('/invoice?recipient=Foo&pay=1');
    await page.waitForLoadState('networkidle');

    // StyledInput paints a visual <label> without htmlFor, so getByRole({ name }) cannot
    // resolve an accessible name. Confirm the label, then take the first textbox (amount is
    // type=number → spinbutton; invoice number is the second textbox).
    await expect(page.getByText(/^(Payee|Zahlungsempfänger)$/)).toBeVisible();
    const payee = page.getByRole('textbox').first();
    await expect(payee).toHaveValue('Foo');
    await expect(payee).toBeDisabled();

    // Wait for the API rejection to surface — fixed sleeps would flake the baseline.
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
});
