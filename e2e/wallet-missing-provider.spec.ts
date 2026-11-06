import { expect, Page, Route, test } from '@playwright/test';

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installLoginApi(page: Page): Promise<string[]> {
  const unexpectedRequests: string[] = [];

  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (method === 'GET' && path === '/v1/language') {
      return json(route, [{ id: 1, name: 'English', symbol: 'EN', enable: true }]);
    }
    if (method === 'GET' && ['/v1/fiat', '/v1/asset', '/v1/bankAccount', '/v1/country'].includes(path)) {
      return json(route, []);
    }
    if (method === 'GET' && path === '/v1/setting/infoBanner') return json(route, null);
    if (method === 'POST' && path === '/v1/log/clientError') return json(route, null);

    unexpectedRequests.push(`${method} ${path}`);
    return json(route, { error: 'Unexpected test request' }, 501);
  });

  await page.route('**/v2/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    unexpectedRequests.push(`${request.method()} ${path}`);
    return json(route, { error: 'Unexpected test request' }, 501);
  });

  return unexpectedRequests;
}

async function installPaymentApi(page: Page): Promise<{ callbackUrls: string[]; unexpectedRequests: string[] }> {
  const unexpectedRequests: string[] = [];
  const callbackUrls: string[] = [];

  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (method === 'GET' && path === '/v1/language') {
      return json(route, [{ id: 1, name: 'English', symbol: 'EN', enable: true }]);
    }
    if (method === 'GET' && path === '/v1/fiat') return json(route, []);
    if (method === 'GET' && path === '/v1/asset') {
      return json(route, [
        {
          id: 1,
          name: 'ETH',
          uniqueName: 'Ethereum/ETH',
          description: 'Ether',
          buyable: true,
          sellable: true,
          cardBuyable: false,
          cardSellable: false,
          instantBuyable: false,
          instantSellable: false,
          blockchain: 'Ethereum',
          comingSoon: false,
          type: 'Coin',
          category: 'Public',
        },
        {
          id: 2,
          name: 'USDT',
          uniqueName: 'Ethereum/USDT',
          description: 'Tether USD',
          buyable: true,
          sellable: true,
          cardBuyable: false,
          cardSellable: false,
          instantBuyable: false,
          instantSellable: false,
          blockchain: 'Ethereum',
          comingSoon: false,
          chainId: '0x0000000000000000000000000000000000000003',
          decimals: 6,
          type: 'Token',
          category: 'Public',
        },
      ]);
    }
    if (method === 'GET' && ['/v1/bankAccount', '/v1/country'].includes(path)) return json(route, []);
    if (method === 'GET' && path === '/v1/setting/infoBanner') return json(route, null);
    if (method === 'GET' && path === '/v1/paymentLink/standard') {
      return json(route, [
        {
          id: 'PayToAddress',
          label: 'Pay to address',
          description: 'Pay to a blockchain address.',
        },
      ]);
    }
    if (method === 'GET' && path === '/v1/paymentLink/walletApp') return json(route, []);
    if (method === 'GET' && path === '/v1/paymentLink/payment') {
      return json(route, {
        id: 'synthetic-payment-link',
        externalId: 'synthetic-payment',
        tag: 'synthetic',
        displayName: 'Synthetic checkout',
        standard: 'PayToAddress',
        possibleStandards: ['PayToAddress'],
        displayQr: false,
        mode: 'Single',
        route: 'synthetic-route',
        currency: 'CHF',
        recipient: { name: 'Synthetic merchant' },
        transferAmounts: [
          {
            method: 'Ethereum',
            minFee: 0,
            assets: [
              { asset: 'ETH', amount: 2 },
              { asset: 'USDT', amount: 10 },
            ],
          },
        ],
        quote: {
          id: 'synthetic-quote',
          expiration: '2099-01-01T00:00:00.000Z',
          payment: 'synthetic-quote-payment',
        },
        callback: new URL('/v1/paymentLink/callback', request.url()).toString(),
        metadata: '',
        minSendable: 1,
        maxSendable: 1000000000000000000,
        requestedAmount: { asset: 'CHF', amount: 10 },
      });
    }
    if (method === 'GET' && path === '/v1/paymentLink/callback/') {
      const callbackUrl = request.url();
      const asset = new URL(callbackUrl).searchParams.get('asset');
      callbackUrls.push(callbackUrl);

      const uri =
        asset === 'ETH'
          ? 'ethereum:0x0000000000000000000000000000000000000002@1?value=2000000000000000000'
          : asset === 'USDT'
            ? 'ethereum:0x0000000000000000000000000000000000000003@1/transfer?address=0x0000000000000000000000000000000000000002&uint256=10000000'
            : undefined;

      if (!uri) {
        unexpectedRequests.push(`${method} ${path}?asset=${asset}`);
        return json(route, { error: 'Unexpected callback asset' }, 501);
      }

      return json(route, { uri });
    }
    if (method === 'GET' && path === '/v1/lnurlp/wait/synthetic-quote-payment') {
      return json(route, { status: 'Pending' });
    }
    if (method === 'POST' && path === '/v1/log/clientError') return json(route, null);

    unexpectedRequests.push(`${method} ${path}`);
    return json(route, { error: 'Unexpected test request' }, 501);
  });

  await page.route('**/v2/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    unexpectedRequests.push(`${request.method()} ${path}`);
    return json(route, { error: 'Unexpected test request' }, 501);
  });

  return { callbackUrls, unexpectedRequests };
}

test('shows the missing-wallet error when an injected wallet disappears during connection', async ({ page }) => {
  // The wallet is detectable when clicked, then disappears before the account
  // request. This exercises the adapter's actual missing-provider branch.
  const unexpectedRequests = await installLoginApi(page);
  await page.addInitScript(() => {
    (window as any).ethereum = {
      isMetaMask: true,
      on: () => undefined,
      request: async ({ method }: { method: string }) => {
        if (method === 'eth_accounts') {
          delete (window as any).ethereum;
          return [];
        }
        throw new Error(`Unexpected wallet RPC: ${method}`);
      },
    };
  });

  await page.goto('/login/wallet?lang=en');
  await page.waitForLoadState('networkidle');

  await page.locator('img[src*="metamask"]').click();

  await expect(page.getByRole('heading', { name: 'Connection failed!', exact: true })).toBeVisible();
  await expect(
    page.getByText('No wallet found. Please check your wallet extension or set one up, then reload this page.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText('Please install MetaMask or Rabby!', { exact: true })).toHaveCount(0);

  await expect(page).toHaveScreenshot('wallet-missing-provider-01-error.png', {
    fullPage: true,
    animations: 'disabled',
  });
  expect(unexpectedRequests).toEqual([]);
});

test('shows the missing-wallet hint when an injected wallet disappears before payment', async ({ page }) => {
  const { callbackUrls, unexpectedRequests } = await installPaymentApi(page);
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'MetaMask Mobile',
    });
    (window as any).ethereum = {
      isMetaMask: true,
      on: () => undefined,
      request: async ({ method, params }: { method: string; params?: Array<{ data?: string }> }) => {
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
          return ['0x0000000000000000000000000000000000000001'];
        }
        if (method === 'eth_chainId') return '0x1';
        if (method === 'eth_getBalance') return '0xde0b6b3a7640000';
        if (method === 'eth_call') {
          const data = params?.[0]?.data;
          if (data?.startsWith('0x313ce567')) return `0x${BigInt(6).toString(16).padStart(64, '0')}`;
          if (data?.startsWith('0x70a08231')) return `0x${BigInt(100_000_000).toString(16).padStart(64, '0')}`;
        }
        throw new Error(`Unexpected wallet RPC: ${method}`);
      },
    };
  });

  await page.goto('/pl?route=synthetic-route&externalId=synthetic-payment&amount=10&currency=CHF&lang=en');

  const payButton = page.getByRole('button', { name: 'Pay', exact: true });
  await expect(payButton).toBeVisible();
  await expect(page.getByText('Complete this payment using 10 USDT on Ethereum.', { exact: true })).toBeVisible();
  await page.evaluate(() => delete (window as any).ethereum);
  await payButton.click();

  await expect
    .poll(() => callbackUrls.find((callbackUrl) => new URL(callbackUrl).searchParams.get('asset') === 'USDT'))
    .toBeDefined();
  const paymentCallbackUrl = new URL(
    callbackUrls.find((callbackUrl) => new URL(callbackUrl).searchParams.get('asset') === 'USDT')!,
  );
  expect(paymentCallbackUrl.origin).toBe('http://localhost:3000');
  expect(paymentCallbackUrl.pathname).toBe('/v1/paymentLink/callback/');
  expect(paymentCallbackUrl.search).toBe('?quote=synthetic-quote&method=Ethereum&asset=USDT');

  await expect(
    page.getByText('No wallet found. Please check your wallet extension or set one up, then reload this page.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText('Failed to get payment information', { exact: true })).toHaveCount(0);

  await expect(page).toHaveScreenshot('wallet-missing-provider-02-payment.png', {
    fullPage: true,
    animations: 'disabled',
  });
  expect(unexpectedRequests).toEqual([]);
});
