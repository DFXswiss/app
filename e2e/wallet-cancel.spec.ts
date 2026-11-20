import { expect, Page, Route, test } from '@playwright/test';

/**
 * Visual regression: a connection the user cancels in an injected wallet (MetaMask) ends back at the
 * wallet selection with no error, while a connection the wallet fails still shows "Connection failed!"
 * with the wallet's message. On the sell form, a transaction the user cancels in the wallet keeps the
 * form without an error, while a transaction the wallet fails still shows "Transaction failed".
 *
 * The injected wallet is an in-page EIP-1193 object installed with addInitScript: it rejects the
 * account request with a plain object, the way MetaMask does (code 4001 with data for the cancel,
 * code -32603 for the failure). Bootstrap GETs are mocked via page.route, so the suite does not need
 * a live API; the client-error POST is fulfilled and recorded. A green run does not prove that a real
 * wallet rejects with that shape. The cancel, the retry to a real login and the reported failure run
 * against the real API and database in the full-stack harness (e2e-stack/specs/auth.spec.ts).
 *
 * UI language is pinned with `lang=en`. Unmatched v1/v2 calls are fulfilled with 501 (not
 * continued), so an unexpected request would show up as an error in the screenshot.
 *
 * Intercepted endpoints:
 *   - GET /v1/language, /v1/fiat, /v1/asset, /v1/bankAccount, /v1/country
 *   - GET /v1/setting/infoBanner  (no banner)
 *   - POST /v1/log/clientError    (recorded, answered 201)
 *
 * The sell variants log in through the injected MetaMask, which signs any message with a fixed
 * signature, and the sign-in returns a synthetic unsigned JWT (`alg: none`, role User, Ethereum
 * address). They additionally answer:
 *   - GET /v1/auth/signMessage, POST /v1/auth
 *   - GET /v1/sell/address-check  (Ok)
 *   - PUT /v1/sell/quote, /v1/sell/paymentInfos  (synthetic quote)
 *   - GET /v2/user
 * The injected wallet then accepts the chain switch, answers the fee lookups, and rejects
 * `eth_sendTransaction` (code 4001 with data for the cancel, code -32603 for the failure). A green run
 * does not prove production auth, that the API returns that quote, or that a real wallet rejects that way.
 */

const ETH = {
  id: 111,
  name: 'ETH',
  uniqueName: 'Ethereum/ETH',
  description: 'Ether',
  blockchain: 'Ethereum',
  type: 'Coin',
  category: 'Public',
  buyable: true,
  sellable: true,
  cardBuyable: false,
  cardSellable: false,
  instantBuyable: false,
  instantSellable: false,
  comingSoon: false,
  decimals: 18,
};

const CANCEL = { code: 4001, message: 'User rejected the request.', data: { cause: 'rejectAllApprovals' } };
const FAILURE = { code: -32603, message: 'Internal JSON-RPC error.' };
const SELL_CANCEL = { code: 4001, message: 'User rejected the request.', data: { location: 'confirmation' } };

const SELL_ADDRESS = '0x1111111111111111111111111111111111111111';
const SELL_SIGN_MESSAGE = `By_signing_this_message,_you_confirm_that_you_are_the_sole_owner_of_the_provided_Blockchain_address._Your_ID:_${SELL_ADDRESS}`;

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

const EUR_FIAT = {
  id: 2,
  name: 'EUR',
  buyable: true,
  sellable: true,
  cardBuyable: false,
  cardSellable: false,
  instantBuyable: false,
  instantSellable: false,
};

const ETH_ASSET = {
  id: 1,
  name: 'ETH',
  uniqueName: 'Ethereum/ETH',
  description: 'Ethereum',
  type: 'Coin',
  category: 'Public',
  dexName: 'ETH',
  feeTier: 'Tier0',
  comingSoon: false,
  buyable: true,
  sellable: true,
  cardBuyable: false,
  cardSellable: false,
  instantBuyable: false,
  instantSellable: false,
  blockchain: 'Ethereum',
  decimals: 18,
  sortOrder: 0,
};

const SELL_FEES = {
  rate: 0.0099,
  fixed: 0,
  min: 0,
  dfx: 5,
  bank: 0,
  network: 0.5,
  total: 5.5,
  platform: 0,
};

const SYNTHETIC_SELL = {
  id: 1,
  uid: 'synthetic-sell-1',
  routeId: 1,
  timestamp: '2026-11-11T10:00:00.000Z',
  depositAddress: '0x2222222222222222222222222222222222222222',
  blockchain: 'Ethereum',
  fees: SELL_FEES,
  minVolume: 0.01,
  maxVolume: 100,
  amount: 0.1,
  asset: ETH_ASSET,
  feesTarget: SELL_FEES,
  minVolumeTarget: 10,
  maxVolumeTarget: 250000,
  exchangeRate: 0.000407,
  priceSteps: [],
  rate: 0.000404,
  exactPrice: true,
  estimatedAmount: 245.5,
  currency: CHF_FIAT,
  beneficiary: { name: 'Synthetic Customer', iban: 'CH9300762011623852957' },
  isValid: true,
};

function jwt(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    account: 1,
    user: 1,
    address: SELL_ADDRESS,
    role: 'User',
    blockchains: ['Ethereum'],
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.synthetic`;
}

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installRoutes(page: Page, reports: string[]): Promise<void> {
  await page.route('**/v1/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (method === 'GET' && path === '/v1/language') {
      return json(route, [
        { id: 1, name: 'Deutsch', symbol: 'DE', foreignName: 'Deutsch', enable: true },
        { id: 2, name: 'English', symbol: 'EN', foreignName: 'English', enable: true },
      ]);
    }

    if (method === 'GET' && path === '/v1/fiat') {
      return json(route, [
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
      ]);
    }

    if (method === 'GET' && path === '/v1/asset') {
      return json(route, [ETH]);
    }

    if (method === 'GET' && ['/v1/bankAccount', '/v1/country'].includes(path)) {
      return json(route, []);
    }

    if (method === 'GET' && path === '/v1/setting/infoBanner') {
      return json(route, {});
    }

    if (method === 'POST' && path === '/v1/log/clientError') {
      reports.push(request.postData() ?? '');
      return json(route, {}, 201);
    }

    await json(route, { error: `Unexpected ${method} ${path}` }, 501);
  });

  await page.route('**/v2/**', async (route: Route) => {
    const request = route.request();
    await json(route, { error: `Unexpected ${request.method()} ${new URL(request.url()).pathname}` }, 501);
  });
}

const SELL_BANK_ACCOUNT = {
  id: 1,
  iban: 'CH9300762011623852957',
  preferredCurrency: CHF_FIAT,
  label: 'Main',
  default: true,
  active: true,
};

async function installSellRoutes(page: Page, reports: string[]): Promise<void> {
  await page.route('**/v1/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (method === 'GET' && path === '/v1/language') {
      return json(route, [
        { id: 1, name: 'Deutsch', symbol: 'DE', foreignName: 'Deutsch', enable: true },
        { id: 2, name: 'English', symbol: 'EN', foreignName: 'English', enable: true },
      ]);
    }

    if (method === 'GET' && path === '/v1/fiat') {
      return json(route, [CHF_FIAT, EUR_FIAT]);
    }

    if (method === 'GET' && path === '/v1/asset') {
      return json(route, [ETH_ASSET]);
    }

    if (method === 'GET' && path === '/v1/bankAccount') {
      return json(route, [SELL_BANK_ACCOUNT]);
    }

    if (method === 'GET' && path === '/v1/country') {
      return json(route, []);
    }

    if (method === 'GET' && path === '/v1/setting/infoBanner') {
      return json(route, null);
    }

    if (method === 'GET' && path === '/v1/sell/address-check') {
      return json(route, { result: 'Ok' });
    }

    if (method === 'PUT' && ['/v1/sell/quote', '/v1/sell/paymentInfos'].includes(path)) {
      return json(route, SYNTHETIC_SELL);
    }

    // the sell form stores the chosen currency on the bank account before the transaction
    if (method === 'PUT' && path === '/v1/bankAccount/1') {
      return json(route, SELL_BANK_ACCOUNT);
    }

    if (method === 'GET' && path === '/v1/auth/signMessage') {
      return json(route, { message: SELL_SIGN_MESSAGE, blockchains: ['Ethereum'] });
    }

    if (method === 'POST' && path === '/v1/auth') {
      return json(route, { accessToken: jwt() }, 201);
    }

    if (method === 'POST' && path === '/v1/log/clientError') {
      reports.push(request.postData() ?? '');
      return json(route, {}, 201);
    }

    await json(route, { error: `Unexpected ${method} ${path}` }, 501);
  });

  await page.route('**/v2/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (method === 'GET' && path === '/v2/user') {
      const address = {
        address: SELL_ADDRESS,
        wallet: 'DFX',
        explorerUrl: 'https://example.invalid',
        blockchains: ['Ethereum'],
        isCustody: false,
      };
      return json(route, {
        id: 1,
        activeAddress: address,
        addresses: [address],
        mail: 'wallet-cancel@example.com',
        currency: CHF_FIAT,
        language: { id: 2, name: 'English', symbol: 'EN' },
        kyc: { level: 30, status: 'Completed' },
        disabledAddresses: [],
      });
    }

    await json(route, { error: `Unexpected ${method} ${path}` }, 501);
  });
}

// MetaMask as the active wallet, on Ethereum with SELL_ADDRESS; it accepts the chain switch, answers the fee lookups
// and rejects the transaction with `rejection`.
async function injectSellWallet(page: Page, rejection: typeof SELL_CANCEL | typeof FAILURE): Promise<void> {
  await page.addInitScript(
    ({ address, answer }) => {
      (window as unknown as { ethereum: unknown }).ethereum = {
        isMetaMask: true,
        request: async ({ method }: { method: string }) => {
          switch (method) {
            case 'eth_accounts':
            case 'eth_requestAccounts':
              return [address];
            case 'eth_chainId':
              return '0x1';
            case 'net_version':
              return '1';
            case 'personal_sign':
              return `0x${'ab'.repeat(65)}`;
            case 'wallet_switchEthereumChain':
              return null;
            case 'eth_gasPrice':
            case 'eth_maxPriorityFeePerGas':
              return '0x3b9aca00';
            case 'eth_getBalance':
              return '0xde0b6b3a7640000';
            case 'eth_estimateGas':
              return '0x5208';
            case 'eth_getTransactionCount':
              return '0x0';
            case 'eth_getBlockByNumber':
              return { number: '0x1', baseFeePerGas: '0x3b9aca00', gasLimit: '0x1c9c380', timestamp: '0x0' };
            case 'eth_sendTransaction':
              throw answer;
            default:
              throw { code: 4200, message: `Unsupported method ${method}` };
          }
        },
        on: () => undefined,
        removeListener: () => undefined,
      };
    },
    { address: SELL_ADDRESS, answer: rejection },
  );
}

// Logs in through the injected MetaMask, which makes it the active wallet, and completes the sell form in the wallet.
async function completeSellInWallet(page: Page): Promise<void> {
  await page.goto('/login?blockchain=Ethereum&lang=en');
  await page.locator('img[src*="cryptowallet"]').click({ timeout: 15_000 });
  await page.locator('img[src*="metamask"]').click();
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 15_000 }).toBe('/buy');

  await page.goto('/sell?lang=en&asset-in=ETH&asset-out=CHF&amount-in=0.1');
  const complete = page.getByRole('button', { name: 'Complete transaction in your wallet' });
  await expect(complete).toBeEnabled({ timeout: 15_000 });
  await complete.click();
}

// An injected wallet on Ethereum with no connected account that rejects the account request with `rejection`.
async function injectWallet(page: Page, rejection: typeof CANCEL | typeof FAILURE): Promise<void> {
  await page.addInitScript((answer) => {
    (window as unknown as { ethereum: unknown }).ethereum = {
      isMetaMask: true,
      request: async ({ method }: { method: string }) => {
        if (method === 'eth_accounts') return [];
        if (method === 'eth_chainId') return '0x1';
        if (method === 'net_version') return '1';
        throw method === 'eth_requestAccounts' ? answer : { code: 4200, message: `Unsupported method ${method}` };
      },
      on: () => undefined,
      removeListener: () => undefined,
    };
  }, rejection);
}

async function openMetaMask(page: Page): Promise<void> {
  await page.goto('/login?blockchain=Ethereum&lang=en');
  await page.locator('img[src*="cryptowallet"]').click({ timeout: 15_000 });
  await page.locator('img[src*="metamask"]').click();
}

test.describe('Cancel in the wallet', () => {
  test.use({ timezoneId: 'Europe/Zurich' });

  test('a cancelled connection ends back at the wallet selection', async ({ page }) => {
    const reports: string[] = [];
    await installRoutes(page, reports);
    await injectWallet(page, CANCEL);

    await openMetaMask(page);

    await expect(page.locator('img[src*="metamask"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Connection failed!')).toHaveCount(0);
    await expect(page.getByText('User rejected the request.')).toHaveCount(0);

    await page.waitForTimeout(500);
    expect(reports).toEqual([]);
    await expect(page).toHaveScreenshot('wallet-cancel-01-back-at-selection.png', {
      fullPage: true,
      maxDiffPixels: 1000,
    });
  });

  test('a failed connection still shows the error', async ({ page }) => {
    const reports: string[] = [];
    await installRoutes(page, reports);
    await injectWallet(page, FAILURE);

    await openMetaMask(page);

    await expect(page.getByText('Connection failed!')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Internal JSON-RPC error.')).toBeVisible();
    await expect.poll(() => reports.length).toBe(1);

    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('wallet-cancel-02-connection-failed.png', {
      fullPage: true,
      maxDiffPixels: 1000,
    });
  });

  test('a cancelled transaction on the sell form keeps the form without an error', async ({ page }) => {
    const reports: string[] = [];
    await installSellRoutes(page, reports);
    await injectSellWallet(page, SELL_CANCEL);

    await completeSellInWallet(page);

    await page.waitForTimeout(1000);
    await expect(page.getByText(/Transaction failed/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Complete transaction in your wallet' })).toBeEnabled();
    expect(reports).toEqual([]);
    await expect(page).toHaveScreenshot('wallet-cancel-03-sell-transaction-cancelled.png', {
      fullPage: true,
      maxDiffPixels: 1000,
    });
  });

  test('a failed transaction on the sell form still shows that it failed', async ({ page }) => {
    await installSellRoutes(page, []);
    await injectSellWallet(page, FAILURE);

    await completeSellInWallet(page);

    await expect(page.getByText(/Transaction failed\. Click Retry/)).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('wallet-cancel-04-sell-transaction-failed.png', {
      fullPage: true,
      maxDiffPixels: 1000,
    });
  });
});
