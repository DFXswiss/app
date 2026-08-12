import { test, expect } from '@playwright/test';
import { BlockchainType, getCachedAuth } from './helpers/auth-cache';

// Minimal coverage for /buy/info (BuyInfoScreen): the read-only, URL-param-driven counterpart to
// /buy (BuyScreen), used by widget/embedded callers that land directly on payment details instead
// of the interactive form. No existing e2e coverage exists for this screen yet.
test.describe('Buy Info - UI Flow', () => {
  async function getToken(
    request: Parameters<Parameters<typeof test>[1]>[0]['request'],
    walletType: BlockchainType = 'evm',
  ): Promise<string> {
    const auth = await getCachedAuth(request, walletType);
    return auth.token;
  }

  // USD is outside the Bank Frick currency set: a requested Frick selector cannot apply here, so
  // the updated mismatch-hint copy (EUR and CHF, not EUR only) must show. Fully static quote, no
  // upstream forwarding: independent of local KYC state, price rules and Bank Frick issuance.
  test('shows the updated mismatch hint for a non-Frick currency', async ({ page, request }) => {
    const token = await getToken(request);
    let receivedProvider: unknown;

    // USD is not served by the app's real currency list; mock it so asset-in=USD resolves.
    await page.route('**/v1/fiat', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: [
          {
            id: 1,
            name: 'CHF',
            buyable: true,
            sellable: true,
            cardBuyable: false,
            cardSellable: false,
            instantBuyable: false,
            instantSellable: false,
          },
          {
            id: 2,
            name: 'EUR',
            buyable: true,
            sellable: true,
            cardBuyable: false,
            cardSellable: false,
            instantBuyable: false,
            instantSellable: false,
          },
          {
            id: 3,
            name: 'USD',
            buyable: true,
            sellable: true,
            cardBuyable: false,
            cardSellable: false,
            instantBuyable: false,
            instantSellable: false,
          },
        ],
      });
    });

    await page.route('**/v1/buy/paymentInfos', async (route) => {
      const requestData = route.request().postDataJSON() as Record<string, unknown>;
      receivedProvider = requestData.personalIbanProvider;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          id: 6,
          isValid: true,
          amount: 100,
          estimatedAmount: 0.0251,
          rate: 3862.5,
          exchangeRate: 3984.06,
          priceSteps: [],
          minVolume: 10,
          maxVolume: 990000,
          minVolumeTarget: 0.0026,
          maxVolumeTarget: 248.5,
          fees: {
            rate: 0.0099,
            fixed: 0,
            min: 0,
            dfx: 0.99,
            network: 0,
            bank: 0,
            bankFixed: 2,
            bankVariable: 0,
            platform: 0,
            total: 2.99,
          },
          currency: { id: 3, name: 'USD' },
          asset: { id: 111, name: 'ETH', blockchain: 'Ethereum', category: 'Public' },
          bic: 'UBSWCHZH80A',
          iban: 'CH9300762011623852957',
          name: 'DFX AG',
          street: 'Bahnhofstrasse',
          number: '7',
          zip: '6300',
          city: 'Zug',
          country: 'Schweiz',
          remittanceInfo: 'DFX-BUY-4',
          sepaInstant: false,
          isPersonalIban: false,
        },
      });
    });

    await page.goto(
      `/buy/info?session=${token}&blockchain=Ethereum&asset-in=USD&asset-out=ETH&amount-in=100&personal-iban=frick`,
    );

    await expect(
      page.getByText(
        'Your requested personal IBAN is only available for EUR and CHF bank transfers, so it was not used for this offer.',
      ),
    ).toBeVisible({ timeout: 15000 });
    await expect.poll(() => receivedProvider).toBeUndefined();

    await expect(page).toHaveScreenshot('buy-info-usd-mismatch.png', {
      fullPage: true,
      maxDiffPixels: 10000,
    });
  });

  test('legacy Yapeal holder switches provider', async ({ page, request }) => {
    const token = await getToken(request);
    let receivedProvider: unknown;

    await page.route(/\/v2\/user(?:\?|$)/, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      const user = await response.json();
      await route.fulfill({ response, json: { ...user, kyc: { ...user.kyc, level: 50 } } });
    });

    await page.route('**/v1/buy/personalIban', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: [
          {
            id: 7,
            iban: 'CH9300762011623852957',
            currency: 'CHF',
            bank: 'Yapeal',
            active: true,
            acceptsPayments: true,
            status: 'Active',
          },
        ],
      });
    });

    const frickResponse = {
      id: 30,
      isValid: true,
      amount: 100,
      estimatedAmount: 0.0251,
      rate: 3862.5,
      exchangeRate: 3984.06,
      priceSteps: [],
      minVolume: 10,
      maxVolume: 990000,
      minVolumeTarget: 0.0026,
      maxVolumeTarget: 248.5,
      fees: {
        rate: 0.0099,
        fixed: 0,
        min: 0,
        dfx: 0.99,
        network: 0,
        bank: 0,
        bankFixed: 2,
        bankVariable: 0,
        platform: 0,
        total: 2.99,
      },
      currency: { id: 1, name: 'CHF' },
      asset: { id: 111, name: 'ETH', blockchain: 'Ethereum', category: 'Public' },
      bank: 'Bank Frick',
      bic: 'BFRILI22XXX',
      iban: 'LI91088100002324013AB',
      name: 'DFX AG',
      street: 'Bahnhofstrasse',
      number: '7',
      zip: '6300',
      city: 'Zug',
      country: 'Schweiz',
      remittanceInfo: 'A1B2-C3D4-E5F6',
      sepaInstant: false,
      isPersonalIban: true,
    };

    const yapealResponse = {
      ...frickResponse,
      id: 31,
      bank: 'Yapeal',
      bic: 'YAPECHZ2',
      iban: 'CH9300762011623852957',
      name: 'Max Muster',
      remittanceInfo: 'DFX-BUY-7',
    };

    await page.route('**/v1/buy/paymentInfos', async (route) => {
      const requestData = route.request().postDataJSON() as Record<string, unknown>;
      receivedProvider = requestData.personalIbanProvider;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: requestData.personalIbanProvider === 'Frick' ? frickResponse : yapealResponse,
      });
    });

    await page.goto(
      `/buy/info?session=${token}&blockchain=Ethereum&asset-in=CHF&asset-out=ETH&amount-in=100&lang=en`,
    );

    const paymentDetails = page.getByRole('heading', { name: 'Payment Information' }).locator('..');
    const toYapealToggle = paymentDetails.getByRole('button', { name: 'Show legacy Yapeal IBAN' });
    await expect(toYapealToggle).toBeVisible({ timeout: 15000 });
    await expect.poll(() => receivedProvider).toBe('Frick');
    await expect(paymentDetails.getByText('LI91 0881 0000 2324 013A B')).toBeVisible();
    await expect(page).toHaveScreenshot('buy-info-provider-toggle-frick-page.png', {
      fullPage: true,
      maxDiffPixels: 10000,
    });

    await toYapealToggle.click();

    const toFrickToggle = paymentDetails.getByRole('button', { name: 'Show Bank Frick IBAN' });
    await expect(toFrickToggle).toBeVisible({ timeout: 15000 });
    await expect.poll(() => receivedProvider).toBe('Yapeal');
    await expect(paymentDetails.getByText('CH93 0076 2011 6238 5295 7')).toBeVisible();
    await expect(paymentDetails.getByText('LI91 0881 0000 2324 013A B')).not.toBeVisible();
    await expect(page).toHaveScreenshot('buy-info-provider-toggle-yapeal-page.png', {
      fullPage: true,
      maxDiffPixels: 10000,
    });

    await toFrickToggle.click();

    await expect(toYapealToggle).toBeVisible({ timeout: 15000 });
    await expect.poll(() => receivedProvider).toBe('Frick');
    await expect(paymentDetails.getByText('LI91 0881 0000 2324 013A B')).toBeVisible({ timeout: 15000 });
  });

  test('shows an error when the legacy Yapeal provider is unavailable', async ({
    page,
    request,
  }) => {
    const token = await getToken(request);

    await page.route(/\/v2\/user(?:\?|$)/, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          id: 1,
          activeAddress: { address: '0x0000000000000000000000000000000000000001' },
          addresses: [],
          kyc: { level: 50, status: 'Completed' },
          currency: { id: 1, name: 'CHF' },
          language: { id: 1, name: 'English', symbol: 'EN' },
        },
      });
    });

    await page.route('**/v1/buy/personalIban', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: [
          {
            id: 7,
            iban: 'CH9300762011623852957',
            currency: 'CHF',
            bank: 'Yapeal',
            active: true,
            acceptsPayments: true,
            status: 'Active',
          },
        ],
      });
    });

    const frickResponse = {
      id: 33,
      isValid: true,
      amount: 100,
      estimatedAmount: 0.0251,
      rate: 3862.5,
      exchangeRate: 3984.06,
      priceSteps: [],
      minVolume: 10,
      maxVolume: 990000,
      minVolumeTarget: 0.0026,
      maxVolumeTarget: 248.5,
      fees: {
        rate: 0.0099,
        fixed: 0,
        min: 0,
        dfx: 0.99,
        network: 0,
        bank: 0,
        bankFixed: 2,
        bankVariable: 0,
        platform: 0,
        total: 2.99,
      },
      currency: { id: 1, name: 'CHF' },
      asset: { id: 111, name: 'ETH', blockchain: 'Ethereum', category: 'Public' },
      bank: 'Bank Frick',
      bic: 'BFRILI22XXX',
      iban: 'LI91088100002324013AB',
      name: 'DFX AG',
      street: 'Bahnhofstrasse',
      number: '7',
      zip: '6300',
      city: 'Zug',
      country: 'Schweiz',
      remittanceInfo: 'A1B2-C3D4-E5F6',
      sepaInstant: false,
      isPersonalIban: true,
    };

    await page.route('**/v1/buy/paymentInfos', async (route) => {
      const requestData = route.request().postDataJSON() as Record<string, unknown>;
      if (requestData.personalIbanProvider === 'Yapeal') {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          json: {
            statusCode: 400,
            message: 'PersonalIbanProviderNotAvailable',
            error: 'Bad Request',
          },
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: frickResponse,
      });
    });

    await page.goto(
      `/buy/info?session=${token}&blockchain=Ethereum&asset-in=CHF&asset-out=ETH&amount-in=100&lang=en`,
    );

    const toYapealToggle = page.getByRole('button', { name: 'Show legacy Yapeal IBAN' });
    await expect(toYapealToggle).toBeVisible({ timeout: 15000 });
    await toYapealToggle.click();

    await expect(
      page.getByText(
        'The requested personal IBAN is not available for your account. Please switch back or contact support.',
      ),
    ).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/\/buy\/info(?:\?|$)/);
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
    await expect(page.getByText('LI91 0881 0000 2324 013A B')).not.toBeVisible();
    await expect(page).toHaveScreenshot('buy-info-provider-unavailable-page.png', {
      fullPage: true,
      maxDiffPixels: 10000,
    });
  });

  test('falls back to the legacy Yapeal IBAN when the automatic Frick request requires KYC', async ({
    page,
    request,
  }) => {
    const token = await getToken(request);

    await page.route(/\/v2\/user(?:\?|$)/, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      const user = await response.json();
      await route.fulfill({ response, json: { ...user, kyc: { ...user.kyc, level: 50 } } });
    });

    await page.route('**/v1/buy/personalIban', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: [
          {
            id: 7,
            iban: 'CH9300762011623852957',
            currency: 'CHF',
            bank: 'Yapeal',
            active: true,
            acceptsPayments: true,
            status: 'Active',
          },
        ],
      });
    });

    const yapealResponse = {
      id: 32,
      isValid: true,
      amount: 100,
      estimatedAmount: 0.0251,
      rate: 3862.5,
      exchangeRate: 3984.06,
      priceSteps: [],
      minVolume: 10,
      maxVolume: 990000,
      minVolumeTarget: 0.0026,
      maxVolumeTarget: 248.5,
      fees: {
        rate: 0.0099,
        fixed: 0,
        min: 0,
        dfx: 0.99,
        network: 0,
        bank: 0,
        bankFixed: 2,
        bankVariable: 0,
        platform: 0,
        total: 2.99,
      },
      currency: { id: 1, name: 'CHF' },
      asset: { id: 111, name: 'ETH', blockchain: 'Ethereum', category: 'Public' },
      bank: 'Yapeal',
      bic: 'YAPECHZ2',
      iban: 'CH9300762011623852957',
      name: 'Max Muster',
      street: 'Bahnhofstrasse',
      number: '7',
      zip: '6300',
      city: 'Zug',
      country: 'Schweiz',
      remittanceInfo: 'DFX-BUY-7',
      sepaInstant: false,
      isPersonalIban: true,
    };

    await page.route('**/v1/buy/paymentInfos', async (route) => {
      const requestData = route.request().postDataJSON() as Record<string, unknown>;
      if (requestData.personalIbanProvider === 'Frick') {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          json: { statusCode: 400, message: 'KycRequired' },
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: yapealResponse,
      });
    });

    await page.goto(
      `/buy/info?session=${token}&blockchain=Ethereum&asset-in=CHF&asset-out=ETH&amount-in=100&lang=en`,
    );

    await expect(
      page.getByText(
        'Your new Bank Frick IBAN requires KYC level 50 - we are showing your existing IBAN instead.',
      ),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('CH93 0076 2011 6238 5295 7')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Complete KYC' })).not.toBeVisible();
    await expect(page).toHaveURL(/\/buy\/info(?:\?|$)/);
    await expect(page).toHaveScreenshot('buy-info-kyc-fallback-page.png', {
      fullPage: true,
      maxDiffPixels: 10000,
    });
  });
});
