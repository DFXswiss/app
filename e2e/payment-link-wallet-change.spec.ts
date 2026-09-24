import { expect, Page, Route, test } from '@playwright/test';

const ACCOUNT = '0x1111111111111111111111111111111111111111';
const OTHER_ACCOUNT = '0x2222222222222222222222222222222222222222';

test.use({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 MetaMask' });

async function json(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
}

async function installPaymentApi(page: Page): Promise<string[]> {
  const unexpected: string[] = [];
  await page.route('**/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path === '/v1/paymentLink/payment')
      return json(route, {
        id: 'fixture-payment',
        tag: 'fixture',
        displayName: 'Wallet payment',
        standard: 'LightningBolt11',
        possibleStandards: ['LightningBolt11'],
        displayQr: false,
        mode: 'Single',
        route: 'fixture',
        currency: 'CHF',
        recipient: {},
        transferAmounts: [{ method: 'Ethereum', minFee: 0, assets: [{ asset: 'ETH', amount: 0.5 }] }],
        quote: { id: 'quote-1', expiration: new Date(Date.now() + 300000).toISOString(), payment: 'fixture-payment' },
        callback: 'http://localhost:3001/v1/paymentLink/cb',
        metadata: '',
        minSendable: 0,
        maxSendable: 1000,
        requestedAmount: { asset: 'CHF', amount: 100 },
      });
    if (path === '/v1/paymentLink/standard')
      return json(route, [{ id: 'LightningBolt11', label: 'Lightning', description: 'Lightning payment' }]);
    if (path === '/v1/paymentLink/walletApp') return json(route, []);
    if (path === '/v1/paymentLink/cb/') return json(route, { uri: `ethereum:${ACCOUNT}@1?value=500000000000000000` });
    if (path === '/v1/asset')
      return json(route, [{ id: 1, name: 'ETH', type: 'Coin', blockchain: 'Ethereum', buyable: true, sellable: true }]);
    if (path === '/v1/lnurlp/wait/fixture-payment') return json(route, { status: 'Pending' });
    if (path === '/v1/language') return json(route, [{ id: 1, name: 'English', symbol: 'EN', enable: true }]);
    if (['/v1/fiat', '/v1/bankAccount', '/v1/country'].includes(path)) return json(route, []);
    if (path === '/v1/setting/infoBanner' || path === '/v1/log/clientError') return json(route, null);

    unexpected.push(`${route.request().method()} ${path}`);
    return route.fulfill({ status: 501, contentType: 'application/json', body: '{}' });
  });
  return unexpected;
}

for (const { name, message } of [
  { name: 'account', message: 'Wallet account changed. Please reload this page and retry.' },
  { name: 'network', message: 'Wallet network changed. Please reload this page and retry.' },
])
  test(`shows the ${name} change before sending a payment`, async ({ page }) => {
    const unexpected = await installPaymentApi(page);
    await page.addInitScript(
      ({ account, otherAccount }) => {
        (window as any).__walletChange = '';
        (window as any).ethereum = {
          isMetaMask: true,
          on: () => undefined,
          request: async ({ method }: { method: string }) => {
            if (method === 'eth_accounts' || method === 'eth_requestAccounts')
              return [(window as any).__walletChange === 'account' ? otherAccount : account];
            if (method === 'eth_chainId') return (window as any).__walletChange === 'network' ? '0xa' : '0x1';
            if (method === 'eth_getBalance') return '0xde0b6b3a7640000';
            throw new Error(`Unexpected wallet RPC ${method}`);
          },
        };
      },
      { account: ACCOUNT, otherAccount: OTHER_ACCOUNT },
    );

    await page.goto('/pl?route=fixture&externalId=fixture&amount=100&currency=CHF');
    await expect(page.getByRole('button', { name: 'Pay', exact: true })).toBeVisible({ timeout: 30000 });
    await page.evaluate((scenario) => ((window as any).__walletChange = scenario), name);
    await page.getByRole('button', { name: 'Pay', exact: true }).click();

    await expect(page.getByText(message, { exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot(`payment-link-wallet-${name}-changed.png`, {
      fullPage: true,
      animations: 'disabled',
    });
    expect(unexpected).toEqual([]);
  });
