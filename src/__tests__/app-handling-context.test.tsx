// Behaviour of AppHandlingContextProvider: parameter loading for the standalone app and the
// embedded widget, what a logout clears in each mode, and how closing hands the result back.

const mockReadBalances = jest.fn();
const mockSendMessage = jest.fn();
const mockRouterNavigate = jest.fn();
let mockSession: { isInitialized: boolean; isLoggedIn: boolean; availableBlockchains?: string[] };
let mockIsUsedByIframe = false;

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: { Bitcoin: 'Bitcoin', Ethereum: 'Ethereum' },
  useSessionContext: () => mockSession,
}));

jest.mock('../contexts/balance.context', () => ({
  useBalanceContext: () => ({ readBalances: mockReadBalances }),
}));

jest.mock('../hooks/iframe.hook', () => ({
  useIframe: () => ({ isUsedByIframe: mockIsUsedByIframe, sendMessage: mockSendMessage }),
}));

import { Router } from '@remix-run/router';
import { act, render } from '@testing-library/react';
import {
  AppHandlingContextProvider,
  AppParams,
  CloseType,
  useAppHandlingContext,
} from '../contexts/app-handling.context';

type Context = ReturnType<typeof useAppHandlingContext>;

const QUERY_PARAMS_KEY = 'dfx.srv.queryParams';
const REDIRECT_URI_KEY = 'dfx.srv.redirectUri';

const sell = {
  routeId: 7,
  amount: 0.5,
  asset: { name: 'BTC', blockchain: 'Bitcoin' },
} as never;
const swap = {
  routeId: 8,
  amount: 1.5,
  sourceAsset: { name: 'ETH', blockchain: 'Ethereum' },
} as never;
const sellWithUid = { ...(sell as object), uid: 'S-order-1' } as never;
const swapWithUid = { ...(swap as object), uid: 'W-order-2' } as never;

let ctx: Context;

function Probe() {
  ctx = useAppHandlingContext();
  return null;
}

function fakeRouter(pathname = '/buy'): Router {
  return { state: { location: { pathname } }, navigate: mockRouterNavigate } as unknown as Router;
}

interface ProviderOptions {
  isWidget?: boolean;
  params?: AppParams;
  closeCallback?: jest.Mock;
}

function provider({ isWidget = false, params, closeCallback }: ProviderOptions = {}): JSX.Element {
  return (
    <AppHandlingContextProvider
      isWidget={isWidget}
      params={params}
      router={fakeRouter()}
      closeCallback={closeCallback}
      service={undefined}
    >
      <Probe />
    </AppHandlingContextProvider>
  );
}

async function renderProvider(options?: ProviderOptions) {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(provider(options));
  });
  return result as ReturnType<typeof render>;
}

async function setLoggedIn(result: ReturnType<typeof render>, isLoggedIn: boolean, options?: ProviderOptions) {
  mockSession = { ...mockSession, isLoggedIn };
  await act(async () => {
    result.rerender(provider(options));
  });
}

function storedQueryParams(): AppParams | undefined {
  const value = localStorage.getItem(QUERY_PARAMS_KEY);
  return value ? JSON.parse(value) : undefined;
}

const originalLocation = window.location;
let assigned: string | undefined;

function recordLocation() {
  Object.defineProperty(window, 'location', {
    configurable: true,
    get: () => originalLocation,
    set: (value: string) => (assigned = value),
  });
}

function restoreLocation() {
  Object.defineProperty(window, 'location', { configurable: true, writable: true, value: originalLocation });
}

function advance(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

async function renderWithRedirectUri(redirectUri: string) {
  sessionStorage.setItem(REDIRECT_URI_KEY, redirectUri);
  const result = await renderProvider();
  recordLocation();
  return result;
}

describe('AppHandlingContextProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.removeItem('dfx.kyc.redirect');
    sessionStorage.removeItem(REDIRECT_URI_KEY);
    window.history.pushState({}, '', '/');
    mockSession = { isInitialized: true, isLoggedIn: false, availableBlockchains: ['Bitcoin', 'Ethereum'] };
    mockIsUsedByIframe = false;
  });

  it('restores a stored kyc redirect before the first render', async () => {
    sessionStorage.setItem('dfx.kyc.redirect', '/kyc?wallet=RealUnit');
    try {
      await renderProvider();
      expect(ctx.redirectPath).toBe('/kyc?wallet=RealUnit');
    } finally {
      sessionStorage.removeItem('dfx.kyc.redirect');
    }
  });

  it('ignores a stored redirect outside kyc before the first render', async () => {
    sessionStorage.setItem('dfx.kyc.redirect', '/sell');
    try {
      await renderProvider();
      expect(ctx.redirectPath).toBeUndefined();
    } finally {
      sessionStorage.removeItem('dfx.kyc.redirect');
    }
  });

  it('leaves the redirect unset when sessionStorage.getItem throws', async () => {
    const original = window.sessionStorage;
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: (key: string, value: string) => original.setItem(key, value),
        removeItem: (key: string) => original.removeItem(key),
        clear: () => original.clear(),
        key: (index: number) => original.key(index),
        get length() {
          return original.length;
        },
      },
    });
    try {
      await renderProvider();
      expect(ctx.redirectPath).toBeUndefined();
    } finally {
      Object.defineProperty(window, 'sessionStorage', { configurable: true, value: original });
      sessionStorage.removeItem('dfx.kyc.redirect');
    }
  });

  describe('standalone', () => {
    it('waits for the session before reading the parameters', async () => {
      mockSession = { ...mockSession, isInitialized: false };
      window.history.pushState({}, '', '/buy?wallet=Partner');

      await renderProvider();

      expect(ctx.isInitialized).toBe(false);
      expect(ctx.params).toEqual({});
    });

    it('reads the URL parameters, stores the storable ones and strips them from the address bar', async () => {
      window.history.pushState(
        {},
        '',
        '/buy?wallet=Partner&mode=partner&special-code=CODE&blockchain=ethereum&session=jwt&balances=BTC:1' +
          '&redirect-uri=https://partner.example/done&mail=customer@example.com',
      );

      await renderProvider();

      expect(ctx.isInitialized).toBe(true);
      expect(ctx.isWidget).toBe(false);
      expect(ctx.isEmbedded).toBe(false);
      expect(ctx.widgetPersonalIban).toBeUndefined();
      expect(ctx.hasSession).toBe(true);
      expect(ctx.canClose).toBe(true);
      expect(ctx.params).toMatchObject({
        wallet: 'Partner',
        mode: 'partner',
        specialCode: 'CODE',
        blockchain: 'Ethereum',
        session: 'jwt',
        mail: 'customer@example.com',
      });
      expect(mockReadBalances).toHaveBeenCalledWith('BTC:1');
      expect(storedQueryParams()).toMatchObject({ wallet: 'Partner', mode: 'partner' });
      expect(storedQueryParams()?.session).toBeUndefined();
      expect(sessionStorage.getItem(REDIRECT_URI_KEY)).toBe('https://partner.example/done');
      expect(localStorage.getItem(REDIRECT_URI_KEY)).toBeNull();
      expect(storedQueryParams()).not.toHaveProperty('redirectUri');
      expect(window.location.search).toBe('');
      expect(mockRouterNavigate).toHaveBeenCalledWith('/buy', { replace: true });
    });

    it('ignores and removes a redirect URI an older version left in localStorage', async () => {
      localStorage.setItem(REDIRECT_URI_KEY, 'https://partner.example/old');
      localStorage.setItem(
        QUERY_PARAMS_KEY,
        JSON.stringify({ wallet: 'Stored', redirectUri: 'https://partner.example/old' }),
      );

      await renderProvider();

      expect(ctx.canClose).toBe(false);
      expect(ctx.params.wallet).toBe('Stored');
      expect(ctx.params.redirectUri).toBeUndefined();
      expect(localStorage.getItem(REDIRECT_URI_KEY)).toBeNull();
      expect(storedQueryParams()).toEqual({ wallet: 'Stored' });
      expect(sessionStorage.getItem(REDIRECT_URI_KEY)).toBeNull();
    });

    it('keeps the redirect URI on a reload in the same session', async () => {
      sessionStorage.setItem(REDIRECT_URI_KEY, 'https://partner.example/done');
      localStorage.setItem(QUERY_PARAMS_KEY, JSON.stringify({ wallet: 'Stored' }));

      await renderProvider();

      expect(ctx.canClose).toBe(true);
      expect(ctx.params.wallet).toBe('Stored');
      expect(ctx.params.redirectUri).toBe('https://partner.example/done');
      expect(sessionStorage.getItem(REDIRECT_URI_KEY)).toBe('https://partner.example/done');
      expect(storedQueryParams()).toEqual({ wallet: 'Stored' });
    });

    it('keeps the redirect URI in the parameters on a reload with other URL parameters in the same session', async () => {
      sessionStorage.setItem(REDIRECT_URI_KEY, 'https://partner.example/done');
      window.history.pushState({}, '', '/buy?wallet=Partner');

      await renderProvider();

      expect(ctx.params).toMatchObject({ wallet: 'Partner', redirectUri: 'https://partner.example/done' });
      expect(ctx.canClose).toBe(true);
      expect(storedQueryParams()).toMatchObject({ wallet: 'Partner' });
      expect(storedQueryParams()).not.toHaveProperty('redirectUri');
      expect(localStorage.getItem(REDIRECT_URI_KEY)).toBeNull();
    });

    it('prefers the redirect URI in the URL over the one of the session', async () => {
      sessionStorage.setItem(REDIRECT_URI_KEY, 'https://partner.example/old');
      window.history.pushState({}, '', '/buy?redirect-uri=https://partner.example/new');

      await renderProvider();

      expect(ctx.params.redirectUri).toBe('https://partner.example/new');
      expect(sessionStorage.getItem(REDIRECT_URI_KEY)).toBe('https://partner.example/new');
      expect(storedQueryParams()).not.toHaveProperty('redirectUri');
    });

    it('has no redirect URI in the parameters in a new session', async () => {
      localStorage.setItem(QUERY_PARAMS_KEY, JSON.stringify({ wallet: 'Stored' }));

      await renderProvider();

      expect(ctx.params.wallet).toBe('Stored');
      expect(ctx.params.redirectUri).toBeUndefined();
      expect(ctx.canClose).toBe(false);
      expect(storedQueryParams()).toEqual({ wallet: 'Stored' });
    });

    it('keeps the session redirect URI out of the stored parameters on a parameter update', async () => {
      sessionStorage.setItem(REDIRECT_URI_KEY, 'https://partner.example/done');

      await renderProvider();
      act(() => ctx.setParams({ assetIn: 'EUR' }));

      expect(ctx.params).toMatchObject({ assetIn: 'EUR', redirectUri: 'https://partner.example/done' });
      expect(storedQueryParams()).toMatchObject({ assetIn: 'EUR' });
      expect(storedQueryParams()).not.toHaveProperty('redirectUri');
    });

    it('accepts an address/signature pair as a session and ignores an unknown blockchain', async () => {
      window.history.pushState({}, '', '/buy?address=addr&signature=sig&blockchain=unknown');

      await renderProvider();

      expect(ctx.hasSession).toBe(true);
      expect(ctx.params.blockchain).toBeUndefined();
      expect(mockReadBalances).toHaveBeenCalledWith(undefined);
    });

    it('falls back to the stored parameters when the URL carries none', async () => {
      localStorage.setItem(QUERY_PARAMS_KEY, JSON.stringify({ wallet: 'Stored', blockchains: 'bitcoin' }));

      await renderProvider();

      expect(ctx.params.wallet).toBe('Stored');
      expect(ctx.hasSession).toBe(false);
      expect(mockReadBalances).not.toHaveBeenCalled();
      expect(ctx.availableBlockchains).toEqual(['Bitcoin']);
      expect(mockRouterNavigate).not.toHaveBeenCalled();
    });

    it('starts without parameters when neither the URL nor the store has any', async () => {
      await renderProvider();

      expect(ctx.params).toMatchObject({ wallet: undefined });
      expect(ctx.availableBlockchains).toEqual(['Bitcoin', 'Ethereum']);
      expect(ctx.canClose).toBe(false);
    });

    it('drops an unsafe redirect URI', async () => {
      window.history.pushState({}, '', '/buy?redirect-uri=javascript:alert(1)');

      await renderProvider();

      expect(ctx.canClose).toBe(false);
      expect(sessionStorage.getItem(REDIRECT_URI_KEY)).toBeNull();
      expect(localStorage.getItem(REDIRECT_URI_KEY)).toBeNull();
    });

    it('merges parameter updates and stores them without credentials or the redirect URI', async () => {
      await renderProvider();

      act(() => ctx.setParams({ wallet: 'Partner', session: 'jwt', redirectUri: 'https://partner.example/done' }));
      act(() => ctx.setParams({ assetIn: 'EUR' }));

      expect(ctx.params).toMatchObject({
        wallet: 'Partner',
        session: 'jwt',
        assetIn: 'EUR',
        redirectUri: 'https://partner.example/done',
      });
      expect(storedQueryParams()).toMatchObject({ wallet: 'Partner', assetIn: 'EUR' });
      expect(storedQueryParams()?.session).toBeUndefined();
      expect(storedQueryParams()).not.toHaveProperty('redirectUri');
    });

    it('keeps the redirect path', async () => {
      await renderProvider();

      act(() => ctx.setRedirectPath('/sell'));

      expect(ctx.redirectPath).toBe('/sell');
    });

    it('keeps the parameters when the customer logs in', async () => {
      window.history.pushState({}, '', '/buy?wallet=Partner');
      const result = await renderProvider();

      await setLoggedIn(result, true);

      expect(ctx.params.wallet).toBe('Partner');
    });

    it('clears the parameters, the stored parameters and the redirect URI on logout', async () => {
      mockSession = { ...mockSession, isLoggedIn: true };
      window.history.pushState({}, '', '/buy?wallet=Partner&mode=partner&redirect-uri=https://partner.example/done');
      const result = await renderProvider();
      expect(ctx.canClose).toBe(true);

      await setLoggedIn(result, false);

      expect(ctx.params).toEqual({});
      expect(ctx.canClose).toBe(false);
      expect(storedQueryParams()).toBeUndefined();
      expect(sessionStorage.getItem(REDIRECT_URI_KEY)).toBeNull();
    });
  });

  describe('widget', () => {
    const widgetParams: AppParams = {
      mode: 'partner',
      wallet: 'Partner',
      specialCode: 'CODE',
      lang: 'de',
      mail: 'customer@example.com',
      session: 'jwt',
      address: 'addr',
      signature: 'sig',
      pubkey: 'pk',
      autoStart: 'true',
      personalIban: 'frick',
    };

    it('reads the widget attributes, the session from the host URL and keeps personalIban live', async () => {
      window.history.pushState({}, '', '/host?session=host-jwt&redirect=/sell&type=Address');

      await renderProvider({ isWidget: true, params: { wallet: 'Partner', personalIban: 'frick' } });

      expect(ctx.isWidget).toBe(true);
      expect(ctx.isEmbedded).toBe(true);
      expect(ctx.widgetPersonalIban).toBe('frick');
      expect(ctx.params).toMatchObject({ wallet: 'Partner', session: 'host-jwt', redirect: '/sell', type: 'Address' });
      expect(ctx.params.personalIban).toBeUndefined();
      expect(ctx.hasSession).toBe(true);
    });

    it('ignores attributes that are not strings', async () => {
      await renderProvider({ isWidget: true, params: { wallet: 'Partner', mode: 1 as never } });

      expect(ctx.params.wallet).toBe('Partner');
      expect(ctx.params.mode).toBeUndefined();
    });

    it('keeps the widget attributes without the credentials after a forced logout', async () => {
      mockSession = { ...mockSession, isLoggedIn: true };
      window.history.pushState({}, '', '/host?redirect=/sell&type=Address');
      const options = { isWidget: true, params: widgetParams };
      const result = await renderProvider(options);
      act(() => ctx.setParams({ assetIn: 'EUR' }));

      await setLoggedIn(result, false, options);

      expect(ctx.params).toEqual({
        mode: 'partner',
        wallet: 'Partner',
        specialCode: 'CODE',
        lang: 'de',
        mail: 'customer@example.com',
      });
      expect(ctx.widgetPersonalIban).toBe('frick');
      expect(storedQueryParams()).toBeUndefined();
    });
  });

  describe('closeServices', () => {
    it('hands the result to the widget callback, mapping unknown types to cancel', async () => {
      const closeCallback = jest.fn();
      await renderProvider({ isWidget: true, params: { wallet: 'Partner' }, closeCallback });

      expect(ctx.closeServices({ type: CloseType.BUY, isComplete: true }, false)).toBe(true);
      expect(closeCallback).toHaveBeenLastCalledWith({ type: CloseType.BUY, isComplete: true });

      expect(ctx.closeServices({ type: CloseType.PAYMENT }, false)).toBe(true);
      expect(closeCallback).toHaveBeenLastCalledWith({ type: CloseType.PAYMENT });

      expect(ctx.closeServices({ type: 'other' } as never, false)).toBe(true);
      expect(closeCallback).toHaveBeenLastCalledWith({ type: CloseType.CANCEL });
    });

    it('does not mark an open sell or swap as a hand-off', async () => {
      const closeCallback = jest.fn();
      await renderProvider({ isWidget: true, params: { wallet: 'Partner' }, closeCallback });

      expect(ctx.closeServices({ type: CloseType.SELL, isComplete: false, sell }, false)).toBe(true);
      expect(closeCallback).toHaveBeenLastCalledWith({ type: CloseType.SELL, isComplete: false, sell });
      expect(ctx.isHandingOff).toBe(false);

      expect(ctx.closeServices({ type: CloseType.SWAP, isComplete: false, swap }, false)).toBe(true);
      expect(closeCallback).toHaveBeenLastCalledWith({ type: CloseType.SWAP, isComplete: false, swap });
      expect(ctx.isHandingOff).toBe(false);
    });

    it('does not close a widget without a callback unless it navigates', async () => {
      await renderProvider({ isWidget: true, params: { wallet: 'Partner' } });

      expect(ctx.closeServices({ type: CloseType.CANCEL }, false)).toBe(false);
      expect(ctx.closeServices({ type: CloseType.CANCEL }, true)).toBe(true);
      expect(mockRouterNavigate).toHaveBeenCalledWith('/account');
    });

    it('posts the result to the parent frame', async () => {
      mockIsUsedByIframe = true;
      await renderProvider();

      expect(ctx.isEmbedded).toBe(true);
      expect(ctx.closeServices({ type: CloseType.SELL, isComplete: true, sell }, false)).toBe(true);
      expect(mockSendMessage).toHaveBeenCalledWith({ type: CloseType.SELL, isComplete: true, sell });
    });

    it('does nothing standalone without a frame or redirect URI', async () => {
      await renderProvider();

      expect(ctx.closeServices({ type: CloseType.CANCEL }, false)).toBe(false);
    });

    describe('redirect', () => {
      beforeEach(() => {
        jest.useFakeTimers();
        assigned = undefined;
      });

      afterEach(() => {
        jest.useRealTimers();
        restoreLocation();
      });

      function close(params: Parameters<Context['closeServices']>[0]): boolean {
        let closed = false;
        act(() => {
          closed = ctx.closeServices(params, false);
        });
        return closed;
      }

      async function closeWith(redirectUri: string, params: Parameters<Context['closeServices']>[0]) {
        await renderWithRedirectUri(redirectUri);

        return close(params);
      }

      it('redirects a buy to <uri>/buy and forgets the redirect URI', async () => {
        expect(await closeWith('https://partner.example/done', { type: CloseType.BUY, isComplete: true })).toBe(true);
        advance(1999);
        expect(assigned).toBeUndefined();
        advance(1);

        expect(assigned).toBe('https://partner.example/done/buy');
        expect(sessionStorage.getItem(REDIRECT_URI_KEY)).toBeNull();
        expect(ctx.canClose).toBe(false);
      });

      it('redirects an open sell after two seconds and forgets the redirect URI', async () => {
        const closed = await closeWith('https://partner.example/', { type: CloseType.SELL, isComplete: false, sell });

        expect(closed).toBe(true);
        advance(1999);
        expect(assigned).toBeUndefined();
        advance(1);

        expect(assigned).toBe(
          'https://partner.example/sell?routeId=7&amount=0.5&asset=BTC&blockchain=Bitcoin&isComplete=false',
        );
        expect(sessionStorage.getItem(REDIRECT_URI_KEY)).toBeNull();
        expect(ctx.canClose).toBe(false);
        expect(ctx.isHandingOff).toBe(false);
      });

      it('redirects an open swap after two seconds and forgets the redirect URI', async () => {
        expect(await closeWith('mywallet://', { type: CloseType.SWAP, isComplete: false, swap })).toBe(true);
        advance(1999);
        expect(assigned).toBeUndefined();
        advance(1);

        expect(assigned).toBe('mywallet://swap/?routeId=8&amount=1.5&asset=ETH&blockchain=Ethereum&isComplete=false');
        expect(sessionStorage.getItem(REDIRECT_URI_KEY)).toBeNull();
        expect(ctx.canClose).toBe(false);
        expect(ctx.isHandingOff).toBe(false);
      });

      it('redirects a completed sell after two seconds and forgets the redirect URI', async () => {
        await closeWith('https://partner.example/', { type: CloseType.SELL, isComplete: true, sell });
        advance(1999);
        expect(assigned).toBeUndefined();
        advance(1);

        expect(assigned).toBe(
          'https://partner.example/sell?routeId=7&amount=0.5&asset=BTC&blockchain=Bitcoin&isComplete=true',
        );
        expect(ctx.canClose).toBe(false);
        expect(ctx.isHandingOff).toBe(false);
      });

      it('names the confirmed sell order in the redirect', async () => {
        await closeWith('https://partner.example/', { type: CloseType.SELL, isComplete: true, sell: sellWithUid });
        advance(2000);

        expect(assigned).toBe(
          'https://partner.example/sell?routeId=7&amount=0.5&asset=BTC&blockchain=Bitcoin&isComplete=true' +
            '&orderUid=S-order-1',
        );
      });

      it('names the confirmed swap order in a deep link redirect', async () => {
        await closeWith('mywallet://', { type: CloseType.SWAP, isComplete: true, swap: swapWithUid });
        advance(2000);

        expect(assigned).toBe(
          'mywallet://swap/?routeId=8&amount=1.5&asset=ETH&blockchain=Ethereum&isComplete=true&orderUid=W-order-2',
        );
      });

      it('leaves the order out of the redirect when the payment info has no uid', async () => {
        await closeWith('https://partner.example/', { type: CloseType.SELL, isComplete: true, sell });
        advance(2000);

        expect(new URL(assigned as string).searchParams.has('orderUid')).toBe(false);
      });

      it('does not redirect a buy when only an older version left a redirect URI in localStorage', async () => {
        localStorage.setItem(REDIRECT_URI_KEY, 'https://partner.example/old');
        localStorage.setItem(QUERY_PARAMS_KEY, JSON.stringify({ redirectUri: 'https://partner.example/old' }));
        await renderProvider();
        recordLocation();

        expect(ctx.canClose).toBe(false);
        expect(close({ type: CloseType.BUY, isComplete: true })).toBe(false);
        advance(2000);

        expect(assigned).toBeUndefined();
        expect(localStorage.getItem(REDIRECT_URI_KEY)).toBeNull();
        expect(storedQueryParams()).toEqual({});
      });

      it('adds the swap details to a deep link redirect', async () => {
        await closeWith('mywallet://', { type: CloseType.SWAP, isComplete: true, swap });
        advance(1999);
        expect(assigned).toBeUndefined();
        advance(1);

        expect(assigned).toBe('mywallet://swap/?routeId=8&amount=1.5&asset=ETH&blockchain=Ethereum&isComplete=true');
      });

      it('appends the type to the path of a deep link redirect', async () => {
        await closeWith('mywallet:/callback', { type: CloseType.BUY, isComplete: true });
        advance(1999);
        expect(assigned).toBeUndefined();
        advance(1);

        expect(assigned).toBe('mywallet:/callback/buy/');
      });

      it('redirects a payment to the redirect URI as is', async () => {
        await closeWith('mywallet:', { type: CloseType.PAYMENT });
        advance(1999);
        expect(assigned).toBeUndefined();
        advance(1);

        expect(assigned).toBe('mywallet:');
      });

      it('discards an unsafe stored redirect URI', async () => {
        expect(await closeWith('javascript:alert(1)', { type: CloseType.CANCEL })).toBe(false);
        advance(2000);

        expect(assigned).toBeUndefined();
        expect(sessionStorage.getItem(REDIRECT_URI_KEY)).toBeNull();
        expect(ctx.canClose).toBe(false);
      });
    });
  });

  describe('handOff', () => {
    const sellUri = 'https://partner.example/sell?routeId=7&amount=0.5&asset=BTC&blockchain=Bitcoin&isComplete=false';

    beforeEach(() => {
      jest.useFakeTimers();
      assigned = undefined;
    });

    afterEach(() => {
      jest.useRealTimers();
      restoreLocation();
    });

    function handOff(params: Parameters<Context['handOff']>[0]): boolean {
      let closed = false;
      act(() => {
        closed = ctx.handOff(params);
      });
      return closed;
    }

    it('starts without a hand-off', async () => {
      await renderProvider();

      expect(ctx.isHandingOff).toBe(false);
    });

    it('redirects a sell at once and keeps the redirect URI for this page', async () => {
      await renderWithRedirectUri('https://partner.example/');

      expect(handOff({ type: CloseType.SELL, isComplete: false, sell })).toBe(true);
      expect(assigned).toBe(sellUri);
      expect(ctx.canClose).toBe(true);
      expect(sessionStorage.getItem(REDIRECT_URI_KEY)).toBeNull();
      expect(ctx.isHandingOff).toBe(true);
      expect(mockRouterNavigate).not.toHaveBeenCalled();

      assigned = undefined;
      expect(handOff({ type: CloseType.SELL, isComplete: false, sell })).toBe(true);
      expect(assigned).toBe(sellUri);
    });

    it('redirects a swap to a deep link at once', async () => {
      await renderWithRedirectUri('mywallet://');

      expect(handOff({ type: CloseType.SWAP, isComplete: false, swap })).toBe(true);
      expect(assigned).toBe('mywallet://swap/?routeId=8&amount=1.5&asset=ETH&blockchain=Ethereum&isComplete=false');
      expect(ctx.canClose).toBe(true);
    });

    it('names the confirmed order in the hand-off to a deep link', async () => {
      await renderWithRedirectUri('mywallet://');

      expect(handOff({ type: CloseType.SELL, isComplete: false, sell: sellWithUid })).toBe(true);
      expect(assigned).toBe(
        'mywallet://sell/?routeId=7&amount=0.5&asset=BTC&blockchain=Bitcoin&isComplete=false&orderUid=S-order-1',
      );
    });

    it('ends the hand-off state after three seconds', async () => {
      await renderWithRedirectUri('https://partner.example/');
      handOff({ type: CloseType.SELL, isComplete: false, sell });

      advance(2999);
      expect(ctx.isHandingOff).toBe(true);
      advance(1);
      expect(ctx.isHandingOff).toBe(false);
    });

    it('restarts the three seconds on another hand-off', async () => {
      await renderWithRedirectUri('https://partner.example/');
      handOff({ type: CloseType.SELL, isComplete: false, sell });
      advance(2000);
      handOff({ type: CloseType.SELL, isComplete: false, sell });

      advance(2999);
      expect(ctx.isHandingOff).toBe(true);
      advance(1);
      expect(ctx.isHandingOff).toBe(false);
    });

    it('stops the hand-off timer on unmount', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        const result = await renderWithRedirectUri('https://partner.example/');
        handOff({ type: CloseType.SELL, isComplete: false, sell });
        result.unmount();

        expect(jest.getTimerCount()).toBe(0);
        advance(3000);
        expect(consoleError).not.toHaveBeenCalled();
      } finally {
        consoleError.mockRestore();
      }
    });

    it('discards an unsafe stored redirect URI', async () => {
      await renderWithRedirectUri('javascript:alert(1)');

      expect(handOff({ type: CloseType.SELL, isComplete: false, sell })).toBe(false);
      advance(3000);

      expect(assigned).toBeUndefined();
      expect(sessionStorage.getItem(REDIRECT_URI_KEY)).toBeNull();
      expect(ctx.canClose).toBe(false);
      expect(ctx.isHandingOff).toBe(false);
    });

    it('hands off through the widget callback', async () => {
      const closeCallback = jest.fn();
      await renderProvider({ isWidget: true, params: { wallet: 'Partner' }, closeCallback });

      expect(handOff({ type: CloseType.SELL, isComplete: false, sell })).toBe(true);
      expect(closeCallback).toHaveBeenLastCalledWith({ type: CloseType.SELL, isComplete: false, sell });
      expect(ctx.isHandingOff).toBe(true);
      expect(mockRouterNavigate).not.toHaveBeenCalled();
    });

    it('does not hand off a widget without a callback', async () => {
      await renderProvider({ isWidget: true, params: { wallet: 'Partner' } });

      expect(handOff({ type: CloseType.SELL, isComplete: false, sell })).toBe(false);
      expect(ctx.isHandingOff).toBe(false);
      expect(mockRouterNavigate).not.toHaveBeenCalled();
    });

    it('posts the hand-off to the parent frame', async () => {
      mockIsUsedByIframe = true;
      await renderProvider();

      expect(handOff({ type: CloseType.SWAP, isComplete: false, swap })).toBe(true);
      expect(mockSendMessage).toHaveBeenCalledWith({ type: CloseType.SWAP, isComplete: false, swap });
      expect(ctx.isHandingOff).toBe(true);
    });

    it('does nothing standalone without a frame or redirect URI', async () => {
      await renderProvider();

      expect(handOff({ type: CloseType.SELL, isComplete: false, sell })).toBe(false);
      expect(ctx.isHandingOff).toBe(false);
      expect(mockRouterNavigate).not.toHaveBeenCalled();
    });
  });

  it('reports a dfx.swiss host', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, search: '', hostname: 'app.dfx.swiss' },
    });

    try {
      await renderProvider();
      expect(ctx.isDfxHosted).toBe(true);
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    }
  });
});
