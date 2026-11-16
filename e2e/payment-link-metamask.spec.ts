import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Visual regression: a payment link opened in the MetaMask in-app browser while the wallet is still
 * processing an earlier request. The wallet rejects the account request with "Already processing
 * unlock. Please wait.", and the payment screen shows the hint to confirm or close the pending request
 * in the wallet instead of that text.
 *
 * The page opens /pl with invoice parameters, and the specs answer the payment request themselves: a
 * synthetic quoted pay request with an Ethereum transfer amount, the payment standards, and the bootstrap
 * GETs. The wait poll for the payment is left open, so the page stays on the pending payment. The user
 * agent names MetaMask, which makes the app treat the page as the MetaMask in-app browser, and an in-page
 * EIP-1193 object installed with addInitScript rejects `eth_requestAccounts` with a plain object (code
 * -32603), the way MetaMask rejects. These specs are a local review aid and do not run in CI.
 * A green run does not prove that the API returns this pay request, that a real MetaMask in-app browser
 * sends exactly this rejection, or that a payment completes.
 */

const PENDING = { code: -32603, message: 'Already processing unlock. Please wait.' };

const PAY_REQUEST = {
  id: 'pl_e2e',
  externalId: 'e2e-invoice',
  tag: 'payRequest',
  standard: 'OpenCryptoPay',
  possibleStandards: ['OpenCryptoPay', 'PayToAddress'],
  displayName: 'Bäckerei Muster',
  recipient: { name: 'Bäckerei Muster AG' },
  transferAmounts: [{ method: 'Ethereum', minFee: 7, assets: [{ asset: 'USDT', amount: 5 }] }],
  quote: { id: 'quote-e2e', expiration: '2099-01-01T00:00:00.000Z', payment: 'pay-e2e' },
  callback: 'http://localhost:3000/v1/lnurlp/cb/pl_e2e',
  minSendable: 1000,
  maxSendable: 2000,
  metadata: '[["text/plain", "Bäckerei Muster"]]',
  requestedAmount: { asset: 'CHF', amount: 5 },
};

async function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function stubApi(page: Page): Promise<void> {
  await page.route('**/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/v1/paymentLink/payment') return fulfillJson(route, 200, PAY_REQUEST);
    if (path === '/v1/paymentLink/standard') return fulfillJson(route, 200, []);
    // the wait poll stays open, so the page keeps showing the pending payment
    if (path.startsWith('/v1/lnurlp/wait/')) return;
    if (path.startsWith('/v1/lnurlp/cb/')) return fulfillJson(route, 409, { statusCode: 409 });
    if (path === '/v1/setting/infoBanner') return fulfillJson(route, 200, null);
    return fulfillJson(route, 200, []);
  });
  await page.route('**/v2/**', (route) => fulfillJson(route, 200, {}));
}

async function injectPendingWallet(page: Page): Promise<string[]> {
  const calls: string[] = [];
  await page.exposeFunction('e2eWalletCall', (method: string) => calls.push(method));
  await page.addInitScript((rejection) => {
    const record = (window as unknown as { e2eWalletCall: (method: string) => void }).e2eWalletCall;
    (window as unknown as { ethereum: unknown }).ethereum = {
      isMetaMask: true,
      request: async ({ method }: { method: string }) => {
        record(method);
        switch (method) {
          case 'eth_accounts':
            return ['0x0000000000000000000000000000000000000001'];
          case 'eth_chainId':
            return '0x1';
          case 'net_version':
            return '1';
          case 'eth_requestAccounts':
            throw rejection;
          default:
            throw { code: 4200, message: `Unsupported method ${method}` };
        }
      },
      on: () => undefined,
      removeListener: () => undefined,
    };
  }, PENDING);
  return calls;
}

test.describe('Payment link in the MetaMask in-app browser', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) MetaMaskMobile' });

  test('a pending wallet request shows the hint instead of the wallet text', async ({ page }) => {
    await stubApi(page);
    const calls = await injectPendingWallet(page);

    await page.goto('/pl?routeId=e2e-route&externalId=e2e-invoice&amount=5&lang=en');

    await expect(page.getByText('Please confirm or close the pending request in your wallet.')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('Already processing unlock. Please wait.')).toHaveCount(0);
    expect(calls).toContain('eth_requestAccounts');

    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('payment-link-metamask-01-pending-request.png', {
      fullPage: true,
      maxDiffPixels: 1000,
    });
  });
});
