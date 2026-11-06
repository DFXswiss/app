const mockGetPaymentMerchantInfo = jest.fn();
const mockAssignPaymentLink = jest.fn();
const mockFetchJson = jest.fn();
const mockNavigate = jest.fn();
const mockSetUrlParams = jest.fn();
const mockStoreGet = jest.fn();
const mockStoreSet = jest.fn();
const mockStoreRemove = jest.fn();
const mockCloseServices = jest.fn();
const mockStartTimer = jest.fn();
const mockPaymentPolling = { init: jest.fn(), stop: jest.fn() };
const mockWaitPolling = { init: jest.fn(), stop: jest.fn() };
const mockMetaMask = {
  isInstalled: jest.fn(),
  getWalletType: jest.fn(),
  requestAccount: jest.fn(),
  requestBlockchain: jest.fn(),
  createTransaction: jest.fn(),
  readBalance: jest.fn(),
};
const mockLnurlDecode = jest.fn();
const mockEvmDecodeUri = jest.fn();
let mockSearchParams = new URLSearchParams();
let mockRedirectUri: string | undefined;
let mockAssets = new Map<string, unknown[]>();
let mockAssetsLoading = false;

jest.mock('@dfx.swiss/react', () => ({
  AssetType: { COIN: 'Coin', TOKEN: 'Token' },
  Blockchain: { ETHEREUM: 'Ethereum', POLYGON: 'Polygon', LIGHTNING: 'Lightning' },
  PaymentLinkPaymentStatus: {
    PENDING: 'Pending',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
    EXPIRED: 'Expired',
  },
  PaymentStandardType: {
    OPEN_CRYPTO_PAY: 'OpenCryptoPay',
    LIGHTNING_BOLT11: 'LightningBolt11',
    PAY_TO_ADDRESS: 'PayToAddress',
  },
  useAssetContext: () => ({ assets: mockAssets, assetsLoading: mockAssetsLoading }),
  usePaymentRoutes: () => ({
    assignPaymentLink: mockAssignPaymentLink,
    getPaymentMerchantInfo: mockGetPaymentMerchantInfo,
  }),
}));

jest.mock('react-router-dom', () => ({
  useSearchParams: () => [mockSearchParams, mockSetUrlParams],
}));

jest.mock('src/config/api', () => ({ Api: { url: 'https://api.example.com', version: 'v1' } }));

jest.mock('src/contexts/app-handling.context', () => ({
  CloseType: { PAYMENT: 'payment' },
  useAppHandlingContext: () => ({ closeServices: mockCloseServices }),
}));

jest.mock('src/hooks/polling', () => ({
  usePolling: ({ timeInterval }: { timeInterval?: number } = {}) =>
    timeInterval ? mockWaitPolling : mockPaymentPolling,
}));

jest.mock('src/hooks/session-store.hook', () => ({
  useSessionStore: () => ({
    paymentLinkApiUrlStore: { get: mockStoreGet, set: mockStoreSet, remove: mockStoreRemove },
  }),
}));

jest.mock('src/hooks/app-params.hook', () => ({ useAppParams: () => ({ redirectUri: mockRedirectUri }) }));

jest.mock('src/hooks/countdown.hook', () => ({
  useCountdown: () => ({ timer: { minutes: 0, seconds: 0 }, startTimer: mockStartTimer }),
}));

jest.mock('src/hooks/navigation.hook', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));

jest.mock('src/hooks/wallets/metamask.hook', () => ({
  WalletType: { IN_APP_BROWSER: 'InAppBrowser', META_MASK: 'MetaMask' },
  useMetaMask: () => mockMetaMask,
}));

jest.mock('src/util/evm', () => ({ Evm: { decodeUri: (uri: string) => mockEvmDecodeUri(uri) } }));

jest.mock('src/util/lnurl', () => ({
  Lnurl: {
    decode: (value: string) => mockLnurlDecode(value),
    encode: (value: string) => `ENC(${value})`,
    prependLnurl: (value: string) => `lightning:${value}`,
  },
}));

jest.mock('src/util/utils', () => ({
  ...jest.requireActual('src/util/utils'),
  fetchJson: (...args: unknown[]) => mockFetchJson(...args),
}));

import type { ApiError } from '@dfx.swiss/react';
import { act, render, waitFor } from '@testing-library/react';
import { PaymentLinkProvider, usePaymentLinkContext } from 'src/contexts/payment-link.context';

type ContextValue = ReturnType<typeof usePaymentLinkContext>;
type Route = [string, unknown];

const STORED_URL = 'https://api.example.com/v1/paymentLink/payment?routeId=1&externalId=e&amount=5';
const CALLBACK = 'https://api.example.com/v1/lnurlp/cb/pl_1';
// url() ends a path without a query part with a slash
const CALLBACK_REQUEST = `${CALLBACK}/`;

const merchantInfo = {
  displayName: 'Shop',
  mode: 'Multiple',
  recipient: { name: 'Shop AG' },
  transferAmounts: [{ method: 'Lightning', assets: [{ asset: 'BTC' }] }],
};

const ocpStandard = { id: 'OpenCryptoPay', label: 'OCP', description: 'ocp' };
const p2aStandard = { id: 'PayToAddress', label: 'P2A', description: 'p2a' };

const ethAsset = { name: 'ETH', blockchain: 'Ethereum', type: 'Coin' };
const usdtAsset = { name: 'USDT', blockchain: 'Ethereum', type: 'Token' };
const deuroAsset = { name: 'dEURO', blockchain: 'Ethereum', type: 'Token' };
const zchfAsset = { name: 'ZCHF', blockchain: 'Ethereum', type: 'Token' };

function quoted(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'pl-1',
    externalId: 'ext-1',
    standard: 'OpenCryptoPay',
    possibleStandards: ['OpenCryptoPay', 'PayToAddress', 'LightningBolt11'],
    transferAmounts: [
      { method: 'Lightning', minFee: 0, assets: [{ asset: 'BTC', amount: 1 }] },
      { method: 'Ethereum', minFee: 7, assets: [{ asset: 'ETH', amount: 2 }] },
      { method: 'Polygon', minFee: 0, available: false, assets: [] },
    ],
    quote: { id: 'quote-1', expiration: new Date(Date.now() + 10 * 60 * 1000).toISOString(), payment: 'pay-1' },
    callback: CALLBACK,
    minSendable: 1000,
    maxSendable: 2000,
    requestedAmount: { asset: 'CHF', amount: 5 },
    ...overrides,
  };
}

let requestedUrls: string[] = [];

// answers fetchJson by the first route whose key is part of the URL; a function answer gets the URL
function routeFetchJson(routes: Route[]): void {
  mockFetchJson.mockImplementation(async (target: string | URL) => {
    // the provider changes a URL object after the request, so keep the URL as it was requested
    const value = target.toString();
    requestedUrls.push(value);
    const match = routes.find(([key]) => value.includes(key));
    if (!match) throw new Error(`unexpected request ${value}`);
    const [, answer] = match;
    return typeof answer === 'function' ? answer(value) : answer;
  });
}

function fetchJsonUrls(): string[] {
  return requestedUrls;
}

function renderProvider(): { current: () => ContextValue; unmount: () => void; rerender: () => void } {
  let value: ContextValue | undefined;

  function Consumer(): null {
    value = usePaymentLinkContext();
    return null;
  }

  const tree = () => (
    <PaymentLinkProvider>
      <Consumer />
    </PaymentLinkProvider>
  );
  const { unmount, rerender } = render(tree());

  return { current: () => value as ContextValue, unmount, rerender: () => rerender(tree()) };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void } {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function mockStandards(standards: unknown[] | undefined): void {
  global.fetch = jest
    .fn()
    .mockResolvedValue(
      standards ? { ok: true, json: async () => standards } : { ok: false, status: 503 },
    ) as unknown as typeof fetch;
}

async function renderWithPayRequest(payRequest: Record<string, unknown>, routes: Route[] = []) {
  mockStoreGet.mockReturnValue(STORED_URL);
  routeFetchJson([['/paymentLink/payment', payRequest], ...routes]);
  const context = renderProvider();
  await waitFor(() => expect(context.current().payRequest).toEqual(payRequest));
  return context;
}

describe('PaymentLinkProvider', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchJson.mockReset();
    requestedUrls = [];
    mockSearchParams = new URLSearchParams();
    mockRedirectUri = undefined;
    mockAssets = new Map();
    mockAssetsLoading = false;
    mockStoreGet.mockReturnValue(undefined);
    mockMetaMask.isInstalled.mockReturnValue(false);
    mockMetaMask.getWalletType.mockReturnValue(undefined);
    mockStandards([]);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  describe('merchant page', () => {
    beforeEach(() => {
      mockSearchParams = new URLSearchParams('merchant=shop-route');
    });

    it('reads the merchant info for the route, creates no payment and reuses no stored payment URL', async () => {
      mockStoreGet.mockReturnValue(STORED_URL);
      mockGetPaymentMerchantInfo.mockResolvedValue(merchantInfo);

      const context = renderProvider();

      await waitFor(() => expect(context.current().merchantInfo).toEqual(merchantInfo));
      expect(mockGetPaymentMerchantInfo).toHaveBeenCalledTimes(1);
      expect(mockGetPaymentMerchantInfo).toHaveBeenCalledWith('shop-route');
      expect(context.current().merchant).toBe('shop-route');
      expect(context.current().isMerchantMode).toBe(true);
      expect(context.current().payRequest).toBeUndefined();
      expect(context.current().paymentHasQuote(context.current().payRequest)).toBe(false);
      expect(context.current().paymentLinkApiUrl.current).toBe('');
      expect(context.current().error).toBeUndefined();
      expect(mockFetchJson).not.toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('/paymentLink/standard');
      expect(mockStoreSet).not.toHaveBeenCalled();
      expect(mockStoreRemove).toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('is in merchant mode before the merchant info has loaded', () => {
      mockGetPaymentMerchantInfo.mockReturnValue(new Promise(() => undefined));

      const context = renderProvider();

      expect(context.current().isMerchantMode).toBe(true);
      expect(context.current().merchantInfo).toBeUndefined();
    });

    it('shows the API error when the route has no public merchant info', async () => {
      mockGetPaymentMerchantInfo.mockRejectedValue({ statusCode: 404, message: 'Payment route not found' });

      const context = renderProvider();

      await waitFor(() => expect(context.current().error).toBe('Payment route not found'));
      expect(context.current().merchantInfo).toBeUndefined();
      expect(context.current().payRequest).toBeUndefined();
      expect(mockFetchJson).not.toHaveBeenCalled();
    });

    it('shows a generic error when the API error has an empty message', async () => {
      // the SDK falls back to the HTTP status text, which is empty over HTTP/2
      const failure: ApiError = { statusCode: 500, message: '' };
      mockGetPaymentMerchantInfo.mockRejectedValue(failure);

      const context = renderProvider();

      await waitFor(() => expect(context.current().error).toBe('Unknown Error'));
    });

    describe('when the merchant route in the URL changes', () => {
      const infoB = { ...merchantInfo, displayName: 'Shop B' };

      function changeRoute(context: ReturnType<typeof renderProvider>, query: string): void {
        mockSearchParams = new URLSearchParams(query);
        context.rerender();
      }

      it('loads the new route and drops a late answer for the old one', async () => {
        const answerA = deferred<unknown>();
        mockGetPaymentMerchantInfo.mockReturnValueOnce(answerA.promise).mockResolvedValueOnce(infoB);
        const context = renderProvider();

        changeRoute(context, 'merchant=shop-b');
        await waitFor(() => expect(context.current().merchantInfo).toEqual(infoB));
        await act(async () => answerA.resolve(merchantInfo));

        expect(mockGetPaymentMerchantInfo.mock.calls).toEqual([['shop-route'], ['shop-b']]);
        expect(context.current().merchant).toBe('shop-b');
        expect(context.current().merchantInfo).toEqual(infoB);
        expect(context.current().error).toBeUndefined();
        expect(mockFetchJson).not.toHaveBeenCalled();
      });

      it('drops a late error for the old route', async () => {
        const answerA = deferred<unknown>();
        mockGetPaymentMerchantInfo.mockReturnValueOnce(answerA.promise).mockResolvedValueOnce(infoB);
        const context = renderProvider();

        changeRoute(context, 'merchant=shop-b');
        await waitFor(() => expect(context.current().merchantInfo).toEqual(infoB));
        const failure: ApiError = { statusCode: 404, message: 'Payment route not found' };
        await act(async () => answerA.reject(failure));

        expect(context.current().error).toBeUndefined();
        expect(context.current().merchantInfo).toEqual(infoB);
      });

      it('clears the error and the info of the old route while the new one loads', async () => {
        const failure: ApiError = { statusCode: 404, message: 'Payment route not found' };
        mockGetPaymentMerchantInfo.mockRejectedValueOnce(failure).mockReturnValueOnce(new Promise(() => undefined));
        const context = renderProvider();
        await waitFor(() => expect(context.current().error).toBe('Payment route not found'));

        changeRoute(context, 'merchant=shop-b');

        await waitFor(() => expect(context.current().merchant).toBe('shop-b'));
        expect(context.current().error).toBeUndefined();
        expect(context.current().merchantInfo).toBeUndefined();
      });

      it('keeps a loaded payment when the URL opens a merchant inside the app', async () => {
        mockSearchParams = new URLSearchParams();
        const payRequest = { id: 'pl-1', message: 'Payment complete' };
        const context = await renderWithPayRequest(payRequest);

        changeRoute(context, 'merchant=shop-route');

        expect(mockGetPaymentMerchantInfo).not.toHaveBeenCalled();
        expect(context.current().merchant).toBeUndefined();
        expect(context.current().isMerchantMode).toBe(false);
        expect(context.current().payRequest).toEqual(payRequest);
        expect(context.current().paymentLinkApiUrl.current).toBe(STORED_URL);
      });

      it('keeps the loaded info when the URL keeps the same route', async () => {
        mockGetPaymentMerchantInfo.mockResolvedValue(merchantInfo);
        const context = renderProvider();
        await waitFor(() => expect(context.current().merchantInfo).toEqual(merchantInfo));

        changeRoute(context, 'merchant=shop-route&wallet-id=7');

        expect(mockGetPaymentMerchantInfo).toHaveBeenCalledTimes(1);
        expect(context.current().merchantInfo).toEqual(merchantInfo);
      });
    });

    it('removes showAssets and showMap from the URL and exposes them', async () => {
      mockSearchParams = new URLSearchParams('merchant=SPAR&showAssets&showMap');
      mockGetPaymentMerchantInfo.mockResolvedValue(merchantInfo);

      const context = renderProvider();

      await waitFor(() => expect(context.current().merchantInfo).toEqual(merchantInfo));
      expect(context.current().showAssets).toBe(true);
      expect(context.current().showMap).toBe(true);
      expect(mockSetUrlParams).toHaveBeenCalledTimes(1);
      expect(mockSetUrlParams.mock.calls[0][0].toString()).toBe('merchant=SPAR');
    });
  });

  describe('URL parameters', () => {
    it('loads a stored payment request and clears it on unmount', async () => {
      const context = await renderWithPayRequest({ id: 'pl-1', message: 'payment complete' });

      expect(context.current().isMerchantMode).toBe(false);
      expect(context.current().merchantInfo).toBeUndefined();
      expect(context.current().paymentLinkApiUrl.current).toBe(STORED_URL);
      expect(mockGetPaymentMerchantInfo).not.toHaveBeenCalled();
      expect(mockStoreSet).toHaveBeenCalledWith(STORED_URL);

      context.unmount();

      expect(mockStoreRemove).toHaveBeenCalled();
      expect(mockPaymentPolling.stop).toHaveBeenCalled();
      expect(mockWaitPolling.stop).toHaveBeenCalled();
    });

    it('decodes a lightning parameter', async () => {
      mockSearchParams = new URLSearchParams('lightning=LNURL1');
      mockLnurlDecode.mockReturnValue('https://api.example.com/v1/lnurlp/pl_1');
      routeFetchJson([['/lnurlp/pl_1', { id: 'pl-1' }]]);

      const context = renderProvider();

      await waitFor(() => expect(context.current().payRequest).toEqual({ id: 'pl-1' }));
      expect(mockLnurlDecode).toHaveBeenCalledWith('LNURL1');
      expect(fetchJsonUrls()[0]).toBe('https://api.example.com/v1/lnurlp/pl_1?timeout=0');
    });

    it.each([['routeId=1&externalId=e&amount=5'], ['route=1&e=e&a=5'], ['r=1&message=m&amount=5'], ['r=1&m=m&a=5']])(
      'builds the invoice URL from %s and clears the parameters',
      async (query) => {
        mockSearchParams = new URLSearchParams(query);
        routeFetchJson([['/paymentLink/payment', { id: 'pl-1' }]]);

        const context = renderProvider();

        await waitFor(() => expect(context.current().payRequest).toEqual({ id: 'pl-1' }));
        expect(fetchJsonUrls()[0]).toContain(`https://api.example.com/v1/paymentLink/payment?${query}`);
        expect(mockSetUrlParams).toHaveBeenCalledWith(new URLSearchParams());
      },
    );

    it.each([[''], ['e=e&a=5'], ['r=1&a=5'], ['r=1&e=e']])(
      'goes home without a payment for the parameters %j',
      (query) => {
        mockSearchParams = new URLSearchParams(query);

        renderProvider();

        expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
        expect(mockFetchJson).not.toHaveBeenCalled();
        expect(mockStoreRemove).toHaveBeenCalled();
      },
    );

    it('stores a new session URL through setSessionApiUrl', () => {
      const context = renderProvider();

      act(() => context.current().setSessionApiUrl('https://api.example.com/v1/plp?r=2'));

      expect(context.current().paymentLinkApiUrl.current).toBe('https://api.example.com/v1/plp?r=2');
      expect(mockStoreSet).toHaveBeenCalledWith('https://api.example.com/v1/plp?r=2');
    });
  });

  describe('payment standards', () => {
    it('logs a failed standards request', async () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      mockStandards(undefined);

      renderProvider();

      await waitFor(() =>
        expect(error).toHaveBeenCalledWith(
          'Failed to load payment standards:',
          new Error('Failed to fetch payment standards: HTTP 503'),
        ),
      );
      error.mockRestore();
    });

    it('offers the known standards and one pay-to-address entry per available non-Lightning method', async () => {
      mockStandards([ocpStandard, p2aStandard]);

      const context = await renderWithPayRequest(quoted());

      await waitFor(() =>
        expect(context.current().paymentStandards).toEqual([ocpStandard, { ...p2aStandard, blockchain: 'Ethereum' }]),
      );
      const standards = context.current().paymentStandards;

      await act(async () => context.current().fetchPayRequest(STORED_URL));

      expect(context.current().paymentStandards).toBe(standards);
    });

    it('offers no standards for a request without a quote', async () => {
      mockStandards([ocpStandard]);

      const context = await renderWithPayRequest({ id: 'pl-1', possibleStandards: ['OpenCryptoPay'] });

      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      expect(context.current().paymentStandards).toBeUndefined();
    });
  });

  describe('fetchPayRequest', () => {
    it('opens the assign screen for a link that is not assigned', async () => {
      await renderWithPayRequest({ statusCode: 400, message: 'Payment link not assigned' });

      expect(mockNavigate).toHaveBeenCalledWith('/pl/assign');
      expect(mockPaymentPolling.init).not.toHaveBeenCalled();
    });

    it.each([[{ statusCode: 400, message: 'Bad request' }], [{ statusCode: 400 }], [{ id: 'pl-1' }]])(
      'polls a request without a quote: %j',
      async (payRequest) => {
        const context = await renderWithPayRequest(payRequest);

        expect(context.current().paymentStatus).toBe('NoPayment');
        expect(mockNavigate).not.toHaveBeenCalled();
        expect(mockPaymentPolling.init).toHaveBeenCalledTimes(1);
        expect(mockPaymentPolling.init.mock.calls[0][0].toString()).toContain('timeout=10');
      },
    );

    it('marks a completed payment and follows the polling responses', async () => {
      const context = await renderWithPayRequest({ id: 'pl-1', message: 'Payment complete' });
      expect(context.current().paymentStatus).toBe('Completed');
      const onResponse = mockPaymentPolling.init.mock.calls[0][1];

      act(() => onResponse({ id: 'pl-1', message: 'waiting' }));
      expect(context.current().paymentStatus).toBe('NoPayment');
      expect(mockPaymentPolling.stop).not.toHaveBeenCalled();

      act(() => onResponse({ id: 'pl-1', message: 'Payment complete' }));
      expect(context.current().paymentStatus).toBe('Completed');
      expect(mockPaymentPolling.stop).toHaveBeenCalledTimes(1);

      const payRequest = quoted();
      act(() => onResponse(payRequest));
      expect(context.current().payRequest).toEqual(payRequest);
      expect(context.current().paymentStatus).toBe('Pending');
      expect(mockPaymentPolling.stop).toHaveBeenCalledTimes(2);
      expect(mockWaitPolling.init).toHaveBeenCalledTimes(1);
    });

    it('waits for the payment of a quoted request', async () => {
      const payRequest = quoted();

      const context = await renderWithPayRequest(payRequest);

      expect(context.current().paymentStatus).toBe('Pending');
      expect(context.current().paymentHasQuote(payRequest as never)).toBe(true);
      expect(mockStartTimer).toHaveBeenCalledWith(new Date((payRequest.quote as { expiration: string }).expiration));
      expect(mockWaitPolling.init.mock.calls[0][0]).toContain('v1/lnurlp/wait/pay-1');
      expect(mockPaymentPolling.init).not.toHaveBeenCalled();
    });

    it.each([
      [new Error('network down'), 'network down'],
      [{}, 'Unknown Error'],
    ])('shows the error of a failed request', async (failure, message) => {
      mockStoreGet.mockReturnValue(STORED_URL);
      mockFetchJson.mockRejectedValue(failure);

      const context = renderProvider();

      await waitFor(() => expect(context.current().error).toBe(message));
    });
  });

  describe('waiting for the payment', () => {
    async function waitCallback() {
      const context = await renderWithPayRequest(quoted());
      return { context, onWait: mockWaitPolling.init.mock.calls[0][1] };
    }

    it('closes the services for a completed payment with a redirect', async () => {
      mockRedirectUri = 'https://shop.example.com';
      const { context, onWait } = await waitCallback();

      act(() => onWait({ status: 'Completed' }));

      expect(mockWaitPolling.stop).toHaveBeenCalled();
      expect(context.current().paymentStatus).toBe('Completed');
      expect(mockCloseServices).toHaveBeenCalledWith({ type: 'payment' }, false);
    });

    it('shows the new status and reloads the request after three seconds', async () => {
      const { context, onWait } = await waitCallback();
      jest.useFakeTimers();
      const calls = mockFetchJson.mock.calls.length;

      act(() => onWait({ status: 'Completed' }));

      expect(context.current().paymentStatus).toBe('Completed');
      expect(mockCloseServices).not.toHaveBeenCalled();
      expect(mockFetchJson).toHaveBeenCalledTimes(calls);
      await act(async () => {
        jest.advanceTimersByTime(3000);
      });
      expect(mockFetchJson).toHaveBeenCalledTimes(calls + 1);
    });

    it('reloads the request at once for a response without a status', async () => {
      const { onWait } = await waitCallback();
      const calls = mockFetchJson.mock.calls.length;

      await act(async () => onWait({}));

      expect(mockFetchJson).toHaveBeenCalledTimes(calls + 1);
    });
  });

  describe('fetchPaymentIdentifier', () => {
    it('does nothing for a request without a quote', async () => {
      const payRequest = { id: 'pl-1' };
      const context = await renderWithPayRequest(payRequest);
      const calls = mockFetchJson.mock.calls.length;

      await act(async () => context.current().fetchPaymentIdentifier(payRequest as never));

      expect(mockFetchJson).toHaveBeenCalledTimes(calls);
      expect(context.current().paymentIdentifier).toBeUndefined();
    });

    it('builds the short OpenCryptoPay link from the session URL', async () => {
      mockStoreGet.mockReturnValue(
        'https://api.example.com/v1/paymentLink/payment?routeId=1&externalId=e&message=m&amount=5&currency=CHF&expiryDate=d&standard=x',
      );
      const payRequest = quoted();
      routeFetchJson([['/paymentLink/payment', payRequest]]);
      const context = renderProvider();
      await waitFor(() => expect(context.current().payRequest).toEqual(payRequest));

      await act(async () => context.current().fetchPaymentIdentifier(payRequest as never));

      expect(context.current().callbackUrl.current).toBe(CALLBACK);
      expect(context.current().paymentIdentifier).toBe(
        'lightning:ENC(https://api.example.com/v1/plp?r=1&e=e&m=m&a=5&c=CHF&d=d&standard=x)',
      );
    });

    it('keeps a path that has no short form', async () => {
      mockSearchParams = new URLSearchParams('lightning=LNURL1');
      mockLnurlDecode.mockReturnValue('https://api.example.com/v1/lnurlp/pl_1');
      const payRequest = quoted();
      routeFetchJson([['/lnurlp/pl_1', payRequest]]);
      const context = renderProvider();
      await waitFor(() => expect(context.current().payRequest).toEqual(payRequest));

      await act(async () => context.current().fetchPaymentIdentifier(payRequest as never));

      expect(context.current().paymentIdentifier).toBe('lightning:ENC(https://api.example.com/v1/lnurlp/pl_1?)');
    });

    it('asks the callback for a Lightning invoice once per callback URL', async () => {
      const payRequest = quoted({ standard: 'LightningBolt11' });
      const context = await renderWithPayRequest(payRequest, [['/lnurlp/cb/', { pr: 'lnbc1' }]]);

      await act(async () => context.current().fetchPaymentIdentifier(payRequest as never));
      await act(async () => context.current().fetchPaymentIdentifier(payRequest as never));

      const callbacks = fetchJsonUrls().filter((value) => value.startsWith(CALLBACK));
      expect(callbacks).toEqual([`${CALLBACK_REQUEST}?quote=quote-1&amount=1000`]);
      expect(context.current().paymentIdentifier).toBe('lnbc1');
      expect(context.current().isLoadingPaymentIdentifier).toBe(false);
    });

    it('asks the callback for a pay-to-address URI with method and asset', async () => {
      const payRequest = quoted({ standard: 'PayToAddress' });
      const context = await renderWithPayRequest(payRequest, [['/lnurlp/cb/', { uri: 'ethereum:0x1' }]]);

      await act(async () => context.current().fetchPaymentIdentifier(payRequest as never, 'Ethereum' as never, 'ETH'));

      expect(fetchJsonUrls()).toContain(`${CALLBACK_REQUEST}?quote=quote-1&method=Ethereum&asset=ETH`);
      expect(context.current().paymentIdentifier).toBe('ethereum:0x1');
    });

    it.each([
      [undefined, 'ETH'],
      ['Ethereum', undefined],
    ])('waits for method %s and asset %s before asking for a pay-to-address URI', async (method, asset) => {
      const payRequest = quoted({ standard: 'PayToAddress' });
      const context = await renderWithPayRequest(payRequest);
      const calls = mockFetchJson.mock.calls.length;

      await act(async () => context.current().fetchPaymentIdentifier(payRequest as never, method as never, asset));

      expect(mockFetchJson).toHaveBeenCalledTimes(calls);
    });

    it.each([[{ statusCode: 409 }], [null]])('keeps no identifier for the callback answer %j', async (answer) => {
      const payRequest = quoted({ standard: 'LightningBolt11' });
      const context = await renderWithPayRequest(payRequest, [['/lnurlp/cb/', answer]]);

      await act(async () => context.current().fetchPaymentIdentifier(payRequest as never));

      expect(context.current().paymentIdentifier).toBeUndefined();
      expect(context.current().isLoadingPaymentIdentifier).toBe(false);
    });

    it('ignores an answer for a callback URL that is no longer current', async () => {
      const payRequest = quoted({ standard: 'PayToAddress' });
      let answerFirst: (value: unknown) => void = () => undefined;
      const context = await renderWithPayRequest(payRequest, [
        ['asset=ETH', () => new Promise((resolve) => (answerFirst = resolve))],
        ['asset=USDT', { uri: 'ethereum:usdt' }],
      ]);

      act(() => {
        context.current().fetchPaymentIdentifier(payRequest as never, 'Ethereum' as never, 'ETH');
      });
      await act(async () => context.current().fetchPaymentIdentifier(payRequest as never, 'Ethereum' as never, 'USDT'));
      await act(async () => answerFirst({ uri: 'ethereum:eth' }));

      expect(context.current().paymentIdentifier).toBe('ethereum:usdt');
    });

    it('shows a failed callback as an error', async () => {
      const payRequest = quoted({ standard: 'LightningBolt11' });
      const context = await renderWithPayRequest(payRequest, [
        [
          '/lnurlp/cb/',
          () => {
            throw new Error('callback failed');
          },
        ],
      ]);

      await act(async () => context.current().fetchPaymentIdentifier(payRequest as never));

      expect(context.current().error).toBe('callback failed');
      expect(context.current().paymentIdentifier).toBeUndefined();
      expect(context.current().isLoadingPaymentIdentifier).toBe(false);
    });
  });

  describe('MetaMask in-app browser', () => {
    function inAppBrowser(blockchain = 'Ethereum'): void {
      mockMetaMask.isInstalled.mockReturnValue(true);
      mockMetaMask.getWalletType.mockReturnValue('InAppBrowser');
      mockMetaMask.requestAccount.mockResolvedValue('0xabc');
      mockMetaMask.requestBlockchain.mockResolvedValue(blockchain);
    }

    const ethereumAmounts = [
      {
        method: 'Ethereum',
        minFee: 7,
        assets: [
          { asset: 'ZCHF' },
          { asset: 'dEURO', amount: 3 },
          { asset: 'USDT', amount: 5 },
          { asset: 'XYZ', amount: 1 },
        ],
      },
    ];

    it.each([
      ['not installed', () => mockMetaMask.isInstalled.mockReturnValue(false)],
      ['another wallet type', () => mockMetaMask.getWalletType.mockReturnValue('MetaMask')],
      ['assets still loading', () => (mockAssetsLoading = true)],
    ])('does not load MetaMask info when %s', async (_case, setup) => {
      inAppBrowser();
      setup();

      const context = await renderWithPayRequest(quoted());

      expect(mockMetaMask.requestAccount).not.toHaveBeenCalled();
      expect(context.current().metaMaskInfo).toBeUndefined();
    });

    it('picks the first asset with enough balance, dEURO first', async () => {
      inAppBrowser();
      mockAssets = new Map([['Ethereum', [usdtAsset, deuroAsset, zchfAsset]]]);
      mockMetaMask.readBalance.mockImplementation(async (asset: { name: string }) => ({
        amount: asset.name === 'USDT' ? 10 : 1,
      }));

      const context = await renderWithPayRequest(quoted({ transferAmounts: ethereumAmounts }));

      await waitFor(() =>
        expect(context.current().metaMaskInfo).toEqual({
          accountAddress: '0xabc',
          transferAsset: usdtAsset,
          transferAmount: 5,
          minFee: 7,
        }),
      );
      expect(mockMetaMask.readBalance.mock.calls.map(([asset]) => asset.name)).toEqual(['dEURO', 'ZCHF', 'USDT']);
      expect(context.current().isLoadingMetaMask).toBe(false);
    });

    it.each([
      ['no account', () => mockMetaMask.requestAccount.mockResolvedValue(undefined), 'Failed to get account'],
      ['no blockchain', () => mockMetaMask.requestBlockchain.mockResolvedValue(undefined), 'Failed to get account'],
      [
        'a blockchain the request does not offer',
        () => mockMetaMask.requestBlockchain.mockResolvedValue('Base'),
        'Selected blockchain is not supported',
      ],
    ])('reports %s', async (_case, setup, message) => {
      inAppBrowser();
      setup();

      const context = await renderWithPayRequest(quoted());

      await waitFor(() => expect(context.current().metaMaskError).toBe(message));
      expect(context.current().metaMaskInfo).toBeUndefined();
    });

    it('rejects Ethereum when the quote expires within a minute', async () => {
      inAppBrowser();
      const quote = { id: 'quote-1', expiration: new Date(Date.now() + 30 * 1000).toISOString(), payment: 'pay-1' };

      const context = await renderWithPayRequest(quoted({ quote }));

      await waitFor(() => expect(context.current().metaMaskError).toBe('Selected blockchain is not supported'));
    });

    it('reports that no asset has enough balance', async () => {
      inAppBrowser('Polygon');
      mockAssets = new Map([['Ethereum', [usdtAsset]]]);

      const context = await renderWithPayRequest(
        quoted({
          transferAmounts: [
            {
              method: 'Polygon',
              minFee: 0,
              assets: [
                { asset: 'USDT', amount: 5 },
                { asset: 'XYZ', amount: 1 },
              ],
            },
          ],
        }),
      );

      await waitFor(() =>
        expect(context.current().metaMaskError).toBe(
          'InApp Browser Payment is not yet activated. This function is still under development.',
        ),
      );
      expect(mockMetaMask.readBalance).not.toHaveBeenCalled();
    });

    describe('payWithMetaMask', () => {
      async function readyToPay(asset: { name: string }, callbackAnswer: unknown) {
        inAppBrowser();
        mockAssets = new Map([['Ethereum', [asset]]]);
        mockMetaMask.readBalance.mockResolvedValue({ amount: 100 });
        const context = await renderWithPayRequest(
          quoted({ transferAmounts: [{ method: 'Ethereum', minFee: 7, assets: [{ asset: asset.name, amount: 2 }] }] }),
          [
            ['/lnurlp/cb/', callbackAnswer],
            ['/lnurlp/tx/', {}],
          ],
        );
        await waitFor(() => expect(context.current().metaMaskInfo).toBeDefined());
        return context;
      }

      it('does nothing without MetaMask info', async () => {
        const context = await renderWithPayRequest(quoted());

        await act(async () => context.current().payWithMetaMask());

        expect(mockMetaMask.createTransaction).not.toHaveBeenCalled();
      });

      it('does nothing without a quote', async () => {
        const context = await renderWithPayRequest({ id: 'pl-1' });

        await act(async () => context.current().payWithMetaMask());

        expect(mockMetaMask.createTransaction).not.toHaveBeenCalled();
      });

      it('sends a coin to the address of the payment URI and reports the transaction', async () => {
        const context = await readyToPay(ethAsset, { uri: 'ethereum:coin' });
        mockEvmDecodeUri.mockReturnValue({ address: '0xshop', amount: '2000' });
        mockMetaMask.createTransaction.mockResolvedValue('0xtx');

        await act(async () => context.current().payWithMetaMask());

        const [amount, asset, from, to, options] = mockMetaMask.createTransaction.mock.calls[0];
        expect(amount.toString()).toBe('2000');
        expect([asset, from, to, options]).toEqual([ethAsset, '0xabc', '0xshop', { isWeiAmount: true, gasPrice: 7 }]);
        expect(mockEvmDecodeUri).toHaveBeenCalledWith('ethereum:coin');
        expect(fetchJsonUrls()).toContain(
          'https://api.example.com/v1/lnurlp/tx/pl_1/?quote=quote-1&method=Ethereum&tx=0xtx',
        );
        expect(context.current().isMetaMaskPaying).toBe(false);
        expect(context.current().metaMaskError).toBeUndefined();
      });

      it('sends a token to its contract address', async () => {
        const context = await readyToPay(usdtAsset, { uri: 'ethereum:token' });
        mockEvmDecodeUri.mockReturnValue({ address: '0xshop', tokenContractAddress: '0xusdt', amount: '5' });
        mockMetaMask.createTransaction.mockResolvedValue('0xtx');

        await act(async () => context.current().payWithMetaMask());

        expect(mockMetaMask.createTransaction.mock.calls[0][3]).toBe('0xusdt');
      });

      it.each([
        ['no payment URI', { statusCode: 409 }, undefined],
        ['an undecodable payment URI', { uri: 'ethereum:bad' }, undefined],
        ['a payment URI without amount', { uri: 'ethereum:bad' }, { address: '0xshop' }],
      ])('reports %s', async (_case, callbackAnswer, decoded) => {
        const context = await readyToPay(ethAsset, callbackAnswer);
        mockEvmDecodeUri.mockReturnValue(decoded);

        await act(async () => context.current().payWithMetaMask());

        expect(context.current().metaMaskError).toBe('Failed to get payment information');
        expect(mockMetaMask.createTransaction).not.toHaveBeenCalled();
        expect(context.current().isMetaMaskPaying).toBe(false);
      });
    });
  });

  it('assigns the link and reloads the payment request', async () => {
    const context = await renderWithPayRequest({ statusCode: 400, message: 'Payment link not assigned' });
    mockAssignPaymentLink.mockResolvedValue(undefined);
    const calls = mockFetchJson.mock.calls.length;

    await act(async () => context.current().assignLink('ext-1', 'Shop'));

    expect(mockAssignPaymentLink).toHaveBeenCalledWith({ publicName: 'Shop' }, undefined, 'ext-1');
    expect(mockFetchJson).toHaveBeenCalledTimes(calls + 1);
  });
});
