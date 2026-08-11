import { test, expect } from '@playwright/test';
import { BlockchainType, getCachedAuth } from './helpers/auth-cache';


test.describe('Buy Process - UI Flow', () => {
  async function getToken(
    request: Parameters<Parameters<typeof test>[1]>[0]['request'],
    walletType: BlockchainType = 'evm',
  ): Promise<string> {
    const auth = await getCachedAuth(request, walletType);
    return auth.token;
  }

  test('should load buy page with session token', async ({ page, request }) => {
    const token = await getToken(request);

    await page.goto(`/buy?session=${token}&blockchain=Ethereum`);
    await page.waitForLoadState('networkidle');

    const pageContent = await page.textContent('body');

    const hasBuyContent =
      pageContent?.includes('Buy') ||
      pageContent?.includes('Kaufen') ||
      pageContent?.includes('spend') ||
      pageContent?.includes('zahlst') ||
      pageContent?.includes('ETH') ||
      pageContent?.includes('CHF') ||
      pageContent?.includes('EUR');

    expect(hasBuyContent).toBeTruthy();

    await expect(page).toHaveScreenshot('buy-page-loaded.png', {
      maxDiffPixels: 10000,
    });
  });

  test('should display amount input and currency selector', async ({ page, request }) => {
    const token = await getToken(request);

    await page.goto(`/buy?session=${token}&blockchain=Ethereum`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const hasAmountInput =
      (await page.locator('input[name="amount"]').count()) > 0 ||
      (await page.locator('input[type="number"]').count()) > 0 ||
      (await page.locator('input[placeholder*="0"]').count()) > 0;

    const pageContent = await page.textContent('body');
    const hasFormElements =
      hasAmountInput || pageContent?.includes('100') || pageContent?.includes('CHF') || pageContent?.includes('EUR');

    expect(hasFormElements).toBeTruthy();
  });

  test('should show trading restriction message if applicable', async ({ page, request }) => {
    const token = await getToken(request);

    await page.goto(`/buy?session=${token}&blockchain=Ethereum`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const pageContent = await page.textContent('body');

    const hasTradingRestriction =
      pageContent?.includes('Trading not allowed') ||
      pageContent?.includes('recommendation') ||
      pageContent?.includes('email address') ||
      pageContent?.includes('nicht erlaubt') ||
      pageContent?.includes('KYC') ||
      pageContent?.includes('verify');

    const hasSuccessfulLoad =
      pageContent?.includes('ETH') ||
      pageContent?.includes('BTC') ||
      pageContent?.includes('USDC') ||
      pageContent?.includes('spend') ||
      pageContent?.includes('zahlst');

    expect(hasTradingRestriction || hasSuccessfulLoad).toBeTruthy();

    if (hasTradingRestriction) {
      console.log('Trading restriction detected - this is expected for sandbox test accounts');
    }
  });

  test('should handle buy flow with pre-filled amount', async ({ page, request }) => {
    const token = await getToken(request);

    await page.goto(`/buy?session=${token}&blockchain=Ethereum&amount-in=100`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();

    await expect(page).toHaveScreenshot('buy-page-with-amount.png', {
      maxDiffPixels: 10000,
    });
  });

  test('should apply the personal IBAN selector directly and display Bank Frick details', async ({ page, request }) => {
    const token = await getToken(request);
    let receivedProvider: unknown;

    await page.route('**/v1/buy/paymentInfos', async (route) => {
      const requestData = route.request().postDataJSON() as Record<string, unknown>;
      receivedProvider = requestData.personalIbanProvider;

      // Keep this visual test independent of Bank Frick and avoid allocating a real vIBAN.
      const upstreamData = { ...requestData };
      delete upstreamData.personalIbanProvider;
      const response = await route.fetch({ postData: JSON.stringify(upstreamData) });
      const paymentInfo = (await response.json()) as Record<string, unknown>;

      await route.fulfill({
        response,
        json: {
          ...paymentInfo,
          bank: 'Bank Frick',
          bic: 'BFRILI22XXX',
          iban: 'LI21088100002324013AA',
          name: 'DFX AG',
          remittanceInfo: undefined,
          sepaInstant: false,
          isPersonalIban: true,
        },
      });
    });

    await page.goto(
      `/buy?session=${token}&blockchain=Ethereum&asset-in=EUR&amount-in=100&personal-iban=frick`,
    );

    // No intermediate confirmation step: the selector is applied directly and the
    // Frick-backed payment details render as soon as the quote resolves.
    const bankLabel = page.getByText('Bank', { exact: true });
    await expect(bankLabel).toBeVisible({ timeout: 15000 });
    await expect.poll(() => receivedProvider).toBe('Frick');
    const paymentDetails = page
      .getByRole('heading', { name: 'Payment Information' })
      .locator('..');
    await expect(
      paymentDetails.getByText('DFX AG', { exact: true }),
    ).toBeVisible();
    await expect(paymentDetails).toHaveScreenshot(
      'buy-bank-frick-payment-details.png',
    );
  });

  // Visual review aid for the collection-IBAN toggle. The neighboring test above
  // deliberately mocks no remittanceInfo and therefore never renders the toggle.
  test('should toggle between the personal and the collection IBAN', async ({ page, request }) => {
    const token = await getToken(request);

    await page.route('**/v1/buy/paymentInfos', async (route) => {
      // Fully static quote: since the personal-IBAN rollout the local API rejects EUR bank
      // quotes for sub-KYC-50 accounts with HTTP 400 KycRequired, and fulfilling with the
      // upstream response keeps that status. A static 200 keeps this visual test independent
      // of local KYC state, price rules and Bank Frick issuance. remittanceInfo is fixed in
      // the real bankUsage format so the screenshots stay deterministic across regenerations.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          id: 1,
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
          currency: { id: 2, name: 'EUR' },
          asset: { id: 111, name: 'ETH', blockchain: 'Ethereum', category: 'Public' },
          bank: 'Bank Frick',
          bic: 'BFRILI22XXX',
          iban: 'LI21088100002324013AA',
          name: 'DFX AG',
          street: 'Bahnhofstrasse',
          number: '7',
          zip: '6300',
          city: 'Zug',
          country: 'Schweiz',
          remittanceInfo: 'A1B2-C3D4-E5F6',
          sepaInstant: false,
          isPersonalIban: true,
        },
      });
    });

    // asset-out is pinned: without it the screen picks the first listed asset, which has
    // no price rule in the local seed and the quote never reaches the payment details.
    await page.goto(
      `/buy?session=${token}&blockchain=Ethereum&asset-in=EUR&asset-out=ETH&amount-in=100&personal-iban=frick`,
    );

    const paymentDetails = page
      .getByRole('heading', { name: 'Payment Information' })
      .locator('..');

    const toggle = paymentDetails.getByRole('button', { name: 'Show collection IBAN' });
    await expect(toggle).toBeVisible({ timeout: 15000 });

    // Personal IBAN state, formatted via Utils.formatIban (ibantools friendlyFormat, groups of 4).
    await expect(paymentDetails.getByText('LI21 0881 0000 2324 013A A')).toBeVisible();
    await expect(paymentDetails).toHaveScreenshot('buy-collection-iban-toggle-personal.png');

    await toggle.click();

    // Collection IBAN state.
    await expect(paymentDetails.getByText('LI75 0881 1010 5923 K000 E')).toBeVisible();
    await expect(paymentDetails.getByRole('button', { name: 'Show personal IBAN' })).toBeVisible();
    await expect(paymentDetails.getByText('A1B2-C3D4-E5F6')).toBeVisible();
    await expect(paymentDetails).toHaveScreenshot('buy-collection-iban-toggle-collection.png');

    // Toggle back to personal IBAN.
    await paymentDetails.getByRole('button', { name: 'Show personal IBAN' }).click();
    await expect(paymentDetails.getByText('LI21 0881 0000 2324 013A A')).toBeVisible();
  });

  // CHF mirrors the EUR cutover; collection IBAN is the Bank Frick CHF row.
  test('shows the CHF collection IBAN toggle for a Frick CHF personal IBAN', async ({ page, request }) => {
    const token = await getToken(request);
    let receivedProvider: unknown;

    await page.route('**/v1/buy/paymentInfos', async (route) => {
      const requestData = route.request().postDataJSON() as Record<string, unknown>;
      receivedProvider = requestData.personalIbanProvider;

      // Fully static quote, same reasoning as the EUR toggle test above: independent of local
      // KYC state, price rules and Bank Frick issuance, deterministic screenshots.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          id: 1,
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
        },
      });
    });

    // asset-out is pinned: without it the screen picks the first listed asset, which has
    // no price rule in the local seed and the quote never reaches the payment details.
    await page.goto(
      `/buy?session=${token}&blockchain=Ethereum&asset-in=CHF&asset-out=ETH&amount-in=100&personal-iban=frick`,
    );

    const paymentDetails = page
      .getByRole('heading', { name: 'Payment Information' })
      .locator('..');

    const toggle = paymentDetails.getByRole('button', { name: 'Show collection IBAN' });
    await expect(toggle).toBeVisible({ timeout: 15000 });
    await expect.poll(() => receivedProvider).toBe('Frick');

    // Personal IBAN state, formatted via Utils.formatIban (ibantools friendlyFormat, groups of 4).
    await expect(paymentDetails.getByText('LI91 0881 0000 2324 013A B')).toBeVisible();
    await expect(paymentDetails).toHaveScreenshot('buy-collection-iban-toggle-personal-chf.png');

    await toggle.click();

    // Collection IBAN state — the Bank Frick CHF row, not the EUR one.
    await expect(paymentDetails.getByText('LI32 0881 1010 5923 K000 C')).toBeVisible();
    await expect(paymentDetails.getByText('LI75 0881 1010 5923 K000 E')).not.toBeVisible();
    await expect(paymentDetails.getByRole('button', { name: 'Show personal IBAN' })).toBeVisible();
    await expect(paymentDetails.getByText('A1B2-C3D4-E5F6')).toBeVisible();
    await expect(paymentDetails).toHaveScreenshot('buy-collection-iban-toggle-collection-chf.png');

    // Toggle back to personal IBAN.
    await paymentDetails.getByRole('button', { name: 'Show personal IBAN' }).click();
    await expect(paymentDetails.getByText('LI91 0881 0000 2324 013A B')).toBeVisible();

    // Proves both by explicit text assertion AND visually that a CHF Bank Frick personal IBAN
    // shows neither the currency-mismatch hint nor the "New: Personal IBAN in your own name!"
    // promo banner (both currency-gated conditions now include CHF, same as EUR).
    await expect(
      page.getByText(
        'Your requested personal IBAN is only available for EUR and CHF bank transfers, so it was not used for this offer.',
      ),
    ).not.toBeVisible();
    await expect(page.getByText('New: Personal IBAN in your own name!')).not.toBeVisible();
    await expect(page).toHaveScreenshot('buy-chf-frick-page.png', {
      fullPage: true,
      maxDiffPixels: 10000,
    });
  });

  // USD is outside the Bank Frick currency set: a requested Frick selector cannot apply here, so
  // the updated mismatch-hint copy (EUR and CHF, not EUR only) must show instead of Frick
  // details, and the request sent to the API must never carry the selector for an inapplicable
  // currency. Fully static quote, no upstream forwarding, same reasoning as the collection-IBAN
  // toggle test above: independent of local KYC state, price rules and Bank Frick issuance.
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
          id: 5,
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
          remittanceInfo: 'DFX-BUY-3',
          sepaInstant: false,
          isPersonalIban: false,
        },
      });
    });

    await page.goto(
      `/buy?session=${token}&blockchain=Ethereum&asset-in=USD&asset-out=ETH&amount-in=100&personal-iban=frick`,
    );

    await expect(
      page.getByText(
        'Your requested personal IBAN is only available for EUR and CHF bank transfers, so it was not used for this offer.',
      ),
    ).toBeVisible({ timeout: 15000 });
    await expect.poll(() => receivedProvider).toBeUndefined();

    await expect(page).toHaveScreenshot('buy-usd-mismatch-page.png', {
      fullPage: true,
      maxDiffPixels: 10000,
    });
  });

  // Same USD scenario as the mismatch-hint test above, but with no requested selector at all
  // (no `personal-iban` URL param): the mismatch hint and the promo banner are mutually exclusive
  // render branches (the promo requires no selector), so this test proves the promo positively
  // instead of only proving the mismatch hint's absence.
  test('shows the personal-IBAN promo for a non-Frick currency without a selector', async ({ page, request }) => {
    const token = await getToken(request);

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
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          id: 7,
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
          remittanceInfo: 'DFX-BUY-5',
          sepaInstant: false,
          isPersonalIban: false,
        },
      });
    });

    // No personal-iban param: no selector at all, the precondition the promo banner requires.
    await page.goto(
      `/buy?session=${token}&blockchain=Ethereum&asset-in=USD&asset-out=ETH&amount-in=100`,
    );

    const promoBlock = page
      .getByRole('heading', { name: 'New: Personal IBAN in your own name!' })
      .locator('..');
    await expect(promoBlock.getByRole('heading', { name: 'New: Personal IBAN in your own name!' })).toBeVisible({
      timeout: 15000,
    });
    await expect(promoBlock.getByRole('button', { name: 'Generate personal IBAN' })).toBeVisible();
    await expect(
      page.getByText(
        'Your requested personal IBAN is only available for EUR and CHF bank transfers, so it was not used for this offer.',
      ),
    ).not.toBeVisible();

    await expect(promoBlock).toHaveScreenshot('buy-usd-promo-block.png');
  });

  // Existing Yapeal holder gets the new Bank Frick IBAN by default (KYC pinned to 50 via the
  // /v2/user rewrite below) and can switch back and forth with the new provider-toggle button.
  // Both endpoints hit by this flow are statically mocked: GET personalIban (the row list this
  // feature reads to decide whether a switch-back target exists) and POST paymentInfos (the
  // quote itself, branched purely on the personalIbanProvider field of the request body) - same
  // reasoning as the other fully-static tests above: independent of local KYC state, price rules
  // and Bank Frick issuance, deterministic screenshots.
  test('legacy Yapeal holder switches provider', async ({ page, request }) => {
    const token = await getToken(request);
    let receivedProvider: unknown;

    // Pin kyc.level to 50 on the real account's /v2/user response, same pattern as
    // e2e/support-issue-receiver-iban.spec.ts (installReceiveIbanRoutes / USER_V2_RE): no
    // server-side account mutation, only the HTTP response this page sees is rewritten.
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
      id: 20,
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
      id: 21,
      bank: 'Yapeal',
      bic: 'YAPECHZ2',
      iban: 'CH9300762011623852957',
      name: 'Max Muster',
      remittanceInfo: 'DFX-BUY-7',
    };

    await page.route('**/v1/buy/paymentInfos', async (route) => {
      const requestData = route.request().postDataJSON() as Record<string, unknown>;
      receivedProvider = requestData.personalIbanProvider;

      // No explicit selector at all defaults to the Yapeal response, mirroring the real server's
      // fail-closed default for an existing Yapeal holder (see also the Frick-default rationale
      // in buy.screen.tsx: the frontend upgrades this to an explicit Frick request itself once
      // personalIban/user have loaded, so this branch is only hit for the very first,
      // not-yet-upgraded render).
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: requestData.personalIbanProvider === 'Frick' ? frickResponse : yapealResponse,
      });
    });

    // lang=en pins text selectors regardless of the test account's language preference, same as
    // neighboring tests in this file.
    await page.goto(
      `/buy?session=${token}&blockchain=Ethereum&asset-in=CHF&asset-out=ETH&amount-in=100&lang=en`,
    );

    const paymentDetails = page.getByRole('heading', { name: 'Payment Information' }).locator('..');

    // Wait for the toggle to settle on the auto-Frick-default state before asserting/screenshotting -
    // the very first render can transiently show a selector-less quote before personalIban/user
    // have loaded (see comment on the route handler above).
    const toYapealToggle = paymentDetails.getByRole('button', { name: 'Show legacy Yapeal IBAN' });
    await expect(toYapealToggle).toBeVisible({ timeout: 15000 });
    await expect.poll(() => receivedProvider).toBe('Frick');

    await expect(paymentDetails.getByText('LI91 0881 0000 2324 013A B')).toBeVisible();
    await expect(page).toHaveScreenshot('buy-chf-provider-toggle-frick-page.png', {
      fullPage: true,
      maxDiffPixels: 10000,
    });

    await toYapealToggle.click();

    const toFrickToggle = paymentDetails.getByRole('button', { name: 'Show Bank Frick IBAN' });
    await expect(toFrickToggle).toBeVisible({ timeout: 15000 });
    await expect.poll(() => receivedProvider).toBe('Yapeal');
    await expect(paymentDetails.getByText('CH93 0076 2011 6238 5295 7')).toBeVisible();
    await expect(paymentDetails.getByText('LI91 0881 0000 2324 013A B')).not.toBeVisible();
    await expect(page).toHaveScreenshot('buy-chf-provider-toggle-yapeal-page.png', {
      fullPage: true,
      maxDiffPixels: 10000,
    });

    await toFrickToggle.click();

    await expect(paymentDetails.getByText('LI91 0881 0000 2324 013A B')).toBeVisible({ timeout: 15000 });
  });
});

test.describe('Buy Process - Wallet 2 (BIP-44 derived)', () => {
  async function getTokenWallet2(
    request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  ): Promise<string> {
    const auth = await getCachedAuth(request, 'evm-wallet2');
    return auth.token;
  }

  test('should load buy page with Wallet 2', async ({ page, request }) => {
    const token = await getTokenWallet2(request);

    await page.goto(`/buy?session=${token}&blockchain=Ethereum`);
    await page.waitForLoadState('networkidle');

    const pageContent = await page.textContent('body');

    const hasBuyContent =
      pageContent?.includes('Buy') ||
      pageContent?.includes('Kaufen') ||
      pageContent?.includes('spend') ||
      pageContent?.includes('zahlst') ||
      pageContent?.includes('ETH') ||
      pageContent?.includes('CHF') ||
      pageContent?.includes('EUR');

    expect(hasBuyContent).toBeTruthy();

    await expect(page).toHaveScreenshot('buy-page-wallet2.png', {
      maxDiffPixels: 10000,
    });
  });

  test('should display amount input with Wallet 2', async ({ page, request }) => {
    const token = await getTokenWallet2(request);

    await page.goto(`/buy?session=${token}&blockchain=Ethereum`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const hasAmountInput =
      (await page.locator('input[name="amount"]').count()) > 0 ||
      (await page.locator('input[type="number"]').count()) > 0 ||
      (await page.locator('input[placeholder*="0"]').count()) > 0;

    const pageContent = await page.textContent('body');
    const hasFormElements =
      hasAmountInput || pageContent?.includes('100') || pageContent?.includes('CHF') || pageContent?.includes('EUR');

    expect(hasFormElements).toBeTruthy();
  });

  test('should handle buy flow with pre-filled amount on Wallet 2', async ({ page, request }) => {
    const token = await getTokenWallet2(request);

    await page.goto(`/buy?session=${token}&blockchain=Ethereum&amount-in=100`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();

    await expect(page).toHaveScreenshot('buy-page-wallet2-with-amount.png', {
      maxDiffPixels: 10000,
    });
  });
});
