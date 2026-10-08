import { Blockchain, Buy, Sell, Swap, useSessionContext } from '@dfx.swiss/react';
import { Router } from '@remix-run/router';
import {
  PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useChange } from 'src/hooks/change.hook';
import { Service } from '../App';
import { useIframe } from '../hooks/iframe.hook';
import { useStore } from '../hooks/store.hook';
import { isSafeRedirectUri, relativeUrl, url } from '../util/utils';
import { useBalanceContext } from './balance.context';

// --- INTERFACES --- //
// CAUTION: params need to be added to index-widget.tsx
// Session-hygiene list: strip one-shot auth/session/PII/config values from the address bar after
// init so they do not linger. `personal-iban` is intentionally NOT listed — it is a public,
// non-secret customer intent selector and the durable source of truth for the current purchase
// (visible in the address bar for the whole lifetime of the selection).
const urlParamsToRemove = [
  'headless',
  'borderless',
  'hide-target-selection',
  'flags',
  'lang',
  'address',
  'signature',
  'pubkey',
  'mail',
  'account-type',
  'first-name',
  'last-name',
  'street',
  'house-number',
  'zip',
  'city',
  'country',
  'organization-name',
  'organization-street',
  'organization-house-number',
  'organization-zip',
  'organization-city',
  'organization-country',
  'phone',
  'wallet',
  'wallets',
  'refcode',
  'special-code',
  'recommendation-code',
  'session',
  'redirect',
  'type',
  'redirect-uri',
  'auto-start',
  'mode',
  'blockchain',
  'blockchains',
  'balances',
  'amount-in',
  'amount-out',
  'assets',
  'asset-in',
  'asset-out',
  'payment-method',
  'bank-account',
  'external-transaction-id',
  'trezor-connect-src',
];

export interface AppParams {
  headless?: string;
  borderless?: string;
  hideTargetSelection?: string;
  flags?: string;
  lang?: string;
  address?: string;
  signature?: string;
  pubkey?: string;
  mail?: string;
  accountType?: string;
  firstName?: string;
  lastName?: string;
  street?: string;
  houseNumber?: string;
  zip?: string;
  city?: string;
  country?: string;
  organizationName?: string;
  organizationStreet?: string;
  organizationHouseNumber?: string;
  organizationZip?: string;
  organizationCity?: string;
  organizationCountry?: string;
  phone?: string;
  wallet?: string;
  wallets?: string;
  refcode?: string;
  specialCode?: string;
  recommendationCode?: string;
  session?: string;
  redirect?: string;
  type?: string;
  redirectUri?: string;
  autoStart?: string;
  mode?: string;
  blockchain?: string;
  blockchains?: string;
  balances?: string;
  amountIn?: string;
  amountOut?: string;
  assets?: string;
  assetIn?: string;
  assetOut?: string;
  paymentMethod?: string;
  bankAccount?: string;
  externalTransactionId?: string;
  /** Explicit personal IBAN selector. Public URL name: `personal-iban`. */
  personalIban?: string;
}

export enum CloseType {
  BUY = 'buy',
  SELL = 'sell',
  SWAP = 'swap',
  PAYMENT = 'payment',
  CANCEL = 'cancel',
}

export interface CloseMessageData {
  type: CloseType;
  isComplete?: boolean;
  buy?: Buy;
  sell?: Sell;
  swap?: Swap;
}

export interface CancelServicesParams extends CloseMessageData {
  type: CloseType.CANCEL;
}

export interface BuyServicesParams extends CloseMessageData {
  type: CloseType.BUY;
  isComplete: boolean;
  buy?: Buy;
}

export interface SellServicesParams extends CloseMessageData {
  type: CloseType.SELL;
  isComplete: boolean;
  sell: Sell;
}

export interface SwapServicesParams extends CloseMessageData {
  type: CloseType.SWAP;
  isComplete: boolean;
  swap: Swap;
}

export interface PaymentLinkServicesParams extends CloseMessageData {
  type: CloseType.PAYMENT;
}

export type CloseServicesParams =
  | CancelServicesParams
  | BuyServicesParams
  | SellServicesParams
  | SwapServicesParams
  | PaymentLinkServicesParams;

// --- CONTEXT --- //
interface AppHandlingContextInterface {
  isInitialized: boolean;
  hasSession: boolean;
  isEmbedded: boolean;
  isDfxHosted: boolean;
  /** True when running as the embedded web component (not standalone browser). */
  isWidget: boolean;
  /**
   * Live widget `personal-iban` / `personalIban` attribute/property value (widget only).
   * Read by usePersonalIbanSelection (src/hooks/personal-iban.hook.ts); not part of params state.
   */
  widgetPersonalIban?: string;
  availableBlockchains?: Blockchain[];
  params: AppParams;
  setParams: (params: Partial<AppParams>) => void;
  closeServices: (params: CloseServicesParams, navigate: boolean) => boolean;
  redirectPath?: string;
  setRedirectPath: (path?: string) => void;
  canClose: boolean;
  service?: Service;
}

interface AppHandlingContextProps extends PropsWithChildren {
  isWidget: boolean;
  service?: Service;
  params?: AppParams;
  router: Router;
  closeCallback?: (data: CloseMessageData) => void;
}

const AppHandlingContext = createContext<AppHandlingContextInterface>(undefined as any);

export function useAppHandlingContext(): AppHandlingContextInterface {
  return useContext(AppHandlingContext);
}

// personalIban is never copied into params state: its source remains the `personal-iban` URL
// parameter (standalone) or live widget property (embedded). See src/hooks/personal-iban.hook.ts
// for source derivation. Customer ownership is checked when a quote applies the selector.
export function removeNonStorageParams(params: AppParams): AppParams {
  const copy = { ...params };

  delete copy.address;
  delete copy.signature;
  delete copy.pubkey;
  delete copy.session;
  delete copy.autoStart;

  return copy;
}

export function AppHandlingContextProvider(props: AppHandlingContextProps): JSX.Element {
  const { redirectUri: storeRedirectUri, queryParams: storeQueryParams } = useStore();
  const { isUsedByIframe, sendMessage } = useIframe();
  const { readBalances } = useBalanceContext();
  const { isInitialized: isSessionInitialized, isLoggedIn, availableBlockchains } = useSessionContext();

  const [isInitialized, setIsInitialized] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [redirectUri, setRedirectUri] = useState<string>();
  const [params, setParams] = useState<AppParams>({});
  const [redirectPath, setRedirectPath] = useState<string>();
  const search = (window as Window).location.search;
  const query = new URLSearchParams(search);

  useChange((newVal, oldVal) => {
    if (!newVal && oldVal) {
      clearCustomerSessionState();
    }
  }, isLoggedIn);

  useEffect(() => {
    isSessionInitialized && init();
  }, [isSessionInitialized]);

  // runs once on mount, when redirectUri is still unset
  useEffect(() => {
    setRedirectUri(storeRedirectUri.get());
  }, []);

  // parameters
  function getParameter(query: URLSearchParams, key: string): string | undefined {
    return query.get(key) ?? undefined;
  }

  function clearCustomerSessionState() {
    storeQueryParams.remove();
    storeRedirectUri.remove();
    // The widget's attributes are the host page's configuration, not customer session state: keep
    // them (minus the one-shot credentials) so a forced logout returns to the configured flow.
    setParams(props.params ? removeNonStorageParams(extractWidgetParams(props.params)) : {});
    setRedirectUri(undefined);
  }

  function setParameters(params: Partial<AppParams>) {
    setParams((p) => {
      const updatedParams = { ...p, ...params };
      storeQueryParams.set(removeNonStorageParams(updatedParams));
      return updatedParams;
    });
  }

  function paramsIsNotEmpty(paramSet: AppParams): boolean {
    return Object.values(paramSet).some((value) => value !== undefined);
  }

  function paramsHasSession(params?: AppParams): boolean {
    return Boolean(params?.session || (params?.address && params.signature));
  }

  function loadQueryParams(): AppParams {
    const queryParams = extractUrlParams(props.params);
    const storeParams = removeNonStorageParams(queryParams);

    const storedParams = storeQueryParams.get();
    if (paramsIsNotEmpty(storeParams)) {
      storeQueryParams.set(storeParams);
    } else {
      Object.assign(queryParams, storedParams ?? {});
    }

    setParams(queryParams);
    return queryParams;
  }

  async function init() {
    const params = loadQueryParams();

    if (params.redirectUri && isSafeRedirectUri(params.redirectUri)) {
      setRedirectUri(params.redirectUri);
      storeRedirectUri.set(params.redirectUri);
    }

    const hasSession = paramsHasSession(params);
    setHasSession(hasSession);
    if (params.balances || hasSession) {
      readBalances(params.balances);
    }

    setIsInitialized(true);

    removeUrlParams(query);
  }

  function extractUrlParams(params?: AppParams): AppParams {
    return params
      ? {
          session: getParameter(query, 'session'),
          redirect: getParameter(query, 'redirect'),
          type: getParameter(query, 'type'),
          ...extractWidgetParams(params),
        }
      : {
          headless: getParameter(query, 'headless'),
          borderless: getParameter(query, 'borderless'),
          hideTargetSelection: getParameter(query, 'hide-target-selection'),
          flags: getParameter(query, 'flags'),
          lang: getParameter(query, 'lang'),
          address: getParameter(query, 'address'),
          signature: getParameter(query, 'signature'),
          pubkey: getParameter(query, 'pubkey'),
          mail: getParameter(query, 'mail'),
          accountType: getParameter(query, 'account-type'),
          firstName: getParameter(query, 'first-name'),
          lastName: getParameter(query, 'last-name'),
          street: getParameter(query, 'street'),
          houseNumber: getParameter(query, 'house-number'),
          zip: getParameter(query, 'zip'),
          city: getParameter(query, 'city'),
          country: getParameter(query, 'country'),
          organizationName: getParameter(query, 'organization-name'),
          organizationStreet: getParameter(query, 'organization-street'),
          organizationHouseNumber: getParameter(query, 'organization-house-number'),
          organizationZip: getParameter(query, 'organization-zip'),
          organizationCity: getParameter(query, 'organization-city'),
          organizationCountry: getParameter(query, 'organization-country'),
          phone: getParameter(query, 'phone'),
          wallet: getParameter(query, 'wallet'),
          wallets: getParameter(query, 'wallets'),
          refcode: getParameter(query, 'refcode'),
          specialCode: getParameter(query, 'special-code'),
          recommendationCode: getParameter(query, 'recommendation-code'),
          session: getParameter(query, 'session'),
          redirect: getParameter(query, 'redirect'),
          type: getParameter(query, 'type'),
          redirectUri: getParameter(query, 'redirect-uri'),
          autoStart: getParameter(query, 'auto-start'),
          mode: getParameter(query, 'mode'),
          blockchain: Object.values(Blockchain).find(
            (b) => b.toLowerCase() === getParameter(query, 'blockchain')?.toLowerCase(),
          ),
          blockchains: getParameter(query, 'blockchains'),
          balances: getParameter(query, 'balances'),
          amountIn: getParameter(query, 'amount-in'),
          amountOut: getParameter(query, 'amount-out'),
          assets: getParameter(query, 'assets'),
          assetIn: getParameter(query, 'asset-in'),
          assetOut: getParameter(query, 'asset-out'),
          paymentMethod: getParameter(query, 'payment-method'),
          bankAccount: getParameter(query, 'bank-account'),
          externalTransactionId: getParameter(query, 'external-transaction-id'),
        };
  }

  function extractWidgetParams(params: AppParams): AppParams {
    return (
      Object.entries(params)
        // personalIban stays live and is read by usePersonalIbanSelection (src/hooks/personal-iban.hook.ts).
        .filter(([key, val]) => typeof val === 'string' && key !== 'personalIban')
        .reduce(
          (prev, [key, val]) => {
            prev[key] = val;
            return prev;
          },
          {} as { [key: string]: string },
        )
    );
  }

  function removeUrlParams(query: URLSearchParams) {
    if (urlParamsToRemove.map((param) => query.has(param)).every((b) => !b)) return;
    urlParamsToRemove.forEach((param) => query.delete(param));

    const path = props.router.state.location.pathname;
    props.router.navigate(relativeUrl({ path, params: query }), { replace: true });

    const { location, history } = window;
    history.replaceState(undefined, '', url({ base: location.origin, path: location.pathname, params: query }));
  }

  // closing
  function closeServices(params: CloseServicesParams, navigate: boolean): boolean {
    let closed = false;

    if (props.isWidget) {
      if (props.closeCallback) {
        props.closeCallback(createCloseMessageData(params));
        closed = true;
      }
    } else {
      if (isUsedByIframe) {
        sendMessage(createCloseMessageData(params));
        closed = true;
      }

      if (redirectUri) {
        storeRedirectUri.remove();
        setRedirectUri(undefined);

        // discard unsafe URIs (e.g. javascript:) to prevent script execution and phishing redirects
        if (isSafeRedirectUri(redirectUri)) {
          const uri = getRedirectUri(redirectUri, params);
          setTimeout(() => ((window as Window).location = uri), 2000);
          closed = true;
        }
      }
    }

    if (navigate) {
      props.router.navigate('/account');
      closed = true;
    }

    return closed;
  }

  function getRedirectUri(baseUri: string, params: CloseServicesParams): string {
    let uri = new URL(baseUri);

    switch (params.type) {
      case CloseType.BUY:
        uri = adaptUri(uri, params.type);
        break;

      case CloseType.SELL:
        uri = adaptUri(uri, params.type, {
          routeId: params.sell.routeId.toString(),
          amount: params.sell.amount.toString(),
          asset: params.sell.asset.name,
          blockchain: params.sell.asset.blockchain,
          isComplete: params.isComplete.toString(),
        });
        break;

      case CloseType.SWAP:
        uri = adaptUri(uri, params.type, {
          routeId: params.swap.routeId.toString(),
          amount: params.swap.amount.toString(),
          asset: params.swap.sourceAsset.name,
          blockchain: params.swap.sourceAsset.blockchain,
          isComplete: params.isComplete.toString(),
        });
        break;

      default:
        break;
    }

    return uri.toString();
  }

  function adaptUri(uri: URL, path: string, params?: object): URL {
    params && Object.entries(params).forEach(([key, val]) => uri.searchParams.set(key, val));

    if (uri.origin === 'null') {
      // custom solution for deep link URIs
      const pathname = uri.pathname ? uri.pathname : '//';
      const newUrl = adaptPath(uri.protocol + pathname, path);
      return new URL(url({ base: newUrl, params: uri.searchParams }));
    } else {
      uri.pathname = adaptPath(uri.pathname, path);

      return uri;
    }
  }

  function adaptPath(path: string, newElement: string): string {
    return path + (path.endsWith('/') ? newElement : `/${newElement}`);
  }

  function createCloseMessageData(params: CloseServicesParams): CloseMessageData {
    switch (params.type) {
      case CloseType.BUY:
      case CloseType.SELL:
      case CloseType.SWAP:
      case CloseType.PAYMENT:
        return params;

      default:
        return { type: CloseType.CANCEL };
    }
  }

  const widgetPersonalIban = props.isWidget ? props.params?.personalIban : undefined;

  const context = useMemo(
    () => ({
      isEmbedded: props.isWidget || isUsedByIframe,
      isWidget: props.isWidget,
      widgetPersonalIban,
      hasSession,
      isDfxHosted: window.location.hostname?.split('.').slice(-2).join('.') === 'dfx.swiss',
      closeServices,
      isInitialized,
      params,
      setParams: setParameters,
      availableBlockchains: availableBlockchains?.filter(
        (b) =>
          !params.blockchains ||
          params.blockchains
            .split(',')
            .map((b1) => b1.toLowerCase())
            .includes(b.toLowerCase()),
      ),
      redirectPath,
      setRedirectPath,
      canClose: redirectUri != null,
      service: props.service,
    }),
    [
      props.isWidget,
      widgetPersonalIban,
      props.service,
      isUsedByIframe,
      redirectUri,
      isInitialized,
      params,
      redirectPath,
      availableBlockchains,
    ],
  );

  return <AppHandlingContext.Provider value={context}>{props.children}</AppHandlingContext.Provider>;
}
