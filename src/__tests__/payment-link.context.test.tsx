const mockGetPaymentMerchantInfo = jest.fn();
const mockFetchJson = jest.fn();
const mockNavigate = jest.fn();
const mockStoreGet = jest.fn();
const mockStoreSet = jest.fn();
const mockStoreRemove = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('@dfx.swiss/react', () => ({
  AssetType: { COIN: 'Coin' },
  Blockchain: { ETHEREUM: 'Ethereum', LIGHTNING: 'Lightning' },
  PaymentLinkPaymentStatus: { PENDING: 'Pending', COMPLETED: 'Completed' },
  PaymentStandardType: { PAY_TO_ADDRESS: 'PayToAddress' },
  useAssetContext: () => ({ assets: new Map(), assetsLoading: false }),
  usePaymentRoutes: () => ({ assignPaymentLink: jest.fn(), getPaymentMerchantInfo: mockGetPaymentMerchantInfo }),
}));

jest.mock('react-router-dom', () => ({
  useSearchParams: () => [mockSearchParams, jest.fn()],
}));

jest.mock('src/config/api', () => ({ Api: { url: 'https://api.example.com', version: 'v1' } }));

jest.mock('src/contexts/app-handling.context', () => ({
  CloseType: { PAYMENT: 'payment' },
  useAppHandlingContext: () => ({ closeServices: jest.fn() }),
}));

jest.mock('src/hooks/polling', () => ({
  usePolling: () => ({ init: jest.fn(), stop: jest.fn() }),
}));

jest.mock('src/hooks/session-store.hook', () => ({
  useSessionStore: () => ({
    paymentLinkApiUrlStore: { get: mockStoreGet, set: mockStoreSet, remove: mockStoreRemove },
  }),
}));

jest.mock('src/hooks/app-params.hook', () => ({ useAppParams: () => ({ redirectUri: undefined }) }));

jest.mock('src/hooks/countdown.hook', () => ({
  useCountdown: () => ({ timer: { minutes: 0, seconds: 0 }, startTimer: jest.fn() }),
}));

jest.mock('src/hooks/navigation.hook', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));

jest.mock('src/hooks/wallets/metamask.hook', () => ({
  WalletType: { IN_APP_BROWSER: 'InAppBrowser' },
  useMetaMask: () => ({
    isInstalled: () => false,
    getWalletType: jest.fn(),
    requestAccount: jest.fn(),
    requestBlockchain: jest.fn(),
    createTransaction: jest.fn(),
    readBalance: jest.fn(),
  }),
}));

jest.mock('src/util/evm', () => ({ Evm: {} }));
jest.mock('src/util/lnurl', () => ({ Lnurl: {} }));

jest.mock('src/util/utils', () => ({
  ...jest.requireActual('src/util/utils'),
  fetchJson: (...args: unknown[]) => mockFetchJson(...args),
}));

import { render, waitFor } from '@testing-library/react';
import { PaymentLinkProvider, usePaymentLinkContext } from 'src/contexts/payment-link.context';

type ContextValue = ReturnType<typeof usePaymentLinkContext>;

const merchantInfo = {
  displayName: 'Shop',
  mode: 'Multiple',
  recipient: { name: 'Shop AG' },
  transferAmounts: [{ method: 'Lightning', assets: [{ asset: 'BTC' }] }],
};

function renderProvider(): { current: () => ContextValue } {
  let value: ContextValue | undefined;

  function Consumer(): null {
    value = usePaymentLinkContext();
    return null;
  }

  render(
    <PaymentLinkProvider>
      <Consumer />
    </PaymentLinkProvider>,
  );

  return { current: () => value as ContextValue };
}

describe('PaymentLinkProvider', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockStoreGet.mockReturnValue(undefined);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [] }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('merchant page', () => {
    beforeEach(() => {
      mockSearchParams = new URLSearchParams('merchant=shop-route');
    });

    it('reads the merchant info for the route and creates no payment', async () => {
      mockGetPaymentMerchantInfo.mockResolvedValue(merchantInfo);

      const context = renderProvider();

      await waitFor(() => expect(context.current().merchantInfo).toEqual(merchantInfo));
      expect(mockGetPaymentMerchantInfo).toHaveBeenCalledTimes(1);
      expect(mockGetPaymentMerchantInfo).toHaveBeenCalledWith('shop-route');
      expect(context.current().merchant).toBe('shop-route');
      expect(context.current().isMerchantMode).toBe(true);
      expect(context.current().payRequest).toBeUndefined();
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

    it('shows a generic error when the API error has no message', async () => {
      mockGetPaymentMerchantInfo.mockRejectedValue({ statusCode: 500 });

      const context = renderProvider();

      await waitFor(() => expect(context.current().error).toBe('Unknown Error'));
    });
  });

  it('loads a stored payment request outside the merchant page', async () => {
    const payRequest = { id: 'pl-1', message: 'payment complete' };
    mockStoreGet.mockReturnValue('https://api.example.com/v1/paymentLink/payment?route=r&externalId=e&amount=1');
    mockFetchJson.mockResolvedValue(payRequest);

    const context = renderProvider();

    await waitFor(() => expect(context.current().payRequest).toEqual(payRequest));
    expect(context.current().isMerchantMode).toBe(false);
    expect(context.current().merchantInfo).toBeUndefined();
    expect(mockGetPaymentMerchantInfo).not.toHaveBeenCalled();
  });
});
