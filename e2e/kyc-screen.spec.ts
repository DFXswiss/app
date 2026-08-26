import { expect, Page, Route, test } from '@playwright/test';

/**
 * Visual baselines for the KYC step-result panel.
 * Handbook group key: kyc-screen (from this file name before `.spec.ts-`).
 */

const PENDING =
  /Your recommendation request has been sent|Deine Empfehlungsanfrage wurde verschickt/;
const FINISHED = /This step has already been finished|Dieser Schritt ist bereits abgeschlossen/;
const FAILED = /This step has failed|Dieser Schritt ist fehlgeschlagen/;

function session(currentStep: {
  name: string;
  status: string;
  reason?: string;
  sequenceNumber?: number;
}) {
  return {
    kycLevel: 10,
    tradingLimit: { limit: 1000, period: 'Day' },
    language: { symbol: 'EN', name: 'English' },
    kycClients: [],
    kycSteps: [
      {
        name: currentStep.name,
        status: currentStep.status,
        sequenceNumber: currentStep.sequenceNumber ?? 0,
        isCurrent: true,
        reason: currentStep.reason,
      },
    ],
    currentStep: {
      name: currentStep.name,
      status: currentStep.status,
      sequenceNumber: currentStep.sequenceNumber ?? 0,
      reason: currentStep.reason,
    },
  };
}

async function mockKyc(
  page: Page,
  body: ReturnType<typeof session>,
): Promise<void> {
  await page.route(/\/v2\/kyc(?:\/[^?]*)?(?:\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

test.describe('KYC step result', () => {
  test('recommendation InReview: pending confirmation hint', async ({ page }) => {
    await mockKyc(page, session({ name: 'Recommendation', status: 'InReview' }));

    await page.goto('/kyc?code=e2e-rec&step=Recommendation');

    await expect(page.getByText(PENDING)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(FINISHED)).toHaveCount(0);
    await expect(page.getByText(FAILED)).toHaveCount(0);

    await expect(page).toHaveScreenshot('kyc-recommendation-pending.png', {
      maxDiffPixels: 10000,
    });
  });

  test('ident InReview: finished copy', async ({ page }) => {
    await mockKyc(page, session({ name: 'Ident', status: 'InReview' }));

    await page.goto('/kyc?code=e2e-ident&step=Ident');

    await expect(page.getByText(FINISHED)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(PENDING)).toHaveCount(0);

    await expect(page).toHaveScreenshot('kyc-step-finished.png', {
      maxDiffPixels: 10000,
    });
  });

  test('recommendation Failed: failed copy and reason', async ({ page }) => {
    await mockKyc(
      page,
      session({ name: 'Recommendation', status: 'Failed', reason: 'AccountExists' }),
    );

    await page.goto('/kyc?code=e2e-fail&step=Recommendation');

    await expect(page.getByText(FAILED)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('AccountExists')).toBeVisible();
    await expect(page.getByText(PENDING)).toHaveCount(0);

    await expect(page).toHaveScreenshot('kyc-step-failed.png', {
      maxDiffPixels: 10000,
    });
  });
});
