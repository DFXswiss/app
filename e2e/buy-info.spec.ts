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
});
