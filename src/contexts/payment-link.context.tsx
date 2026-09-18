import {
  AssetType,
  Blockchain,
  PaymentLinkPaymentStatus,
  PaymentStandardType,
  useAssetContext,
  usePaymentRoutes,
} from '@dfx.swiss/react';
import BigNumber from 'bignumber.js';
import { addMinutes } from 'date-fns';
import {
  createContext,
  MutableRefObject,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { Api } from 'src/config/api';
import { CloseType, useAppHandlingContext } from 'src/contexts/app-handling.context';
import { AssetBalance } from 'src/contexts/balance.context';
import {
  PaymentAmount,
  PaymentLinkPayRequest,
  PaymentLinkPayResponse,
  PaymentLinkPayTerminal,
  PaymentStandard,
  hasPaymentQuote as hasQuoteField,
} from '@dfx.swiss/react';
import { ExtendedPaymentLinkStatus, MetaMaskInfo, NoPaymentLinkPaymentStatus } from 'src/dto/payment-link.dto';
import { usePolling } from 'src/hooks/polling';
import { useSessionStore } from 'src/hooks/session-store.hook';
import { Evm } from 'src/util/evm';
import { Lnurl } from 'src/util/lnurl';
import { fetchJson, url } from 'src/util/utils';
import { useAppParams } from '../hooks/app-params.hook';
import { Timer, useCountdown } from '../hooks/countdown.hook';
import { useNavigation } from '../hooks/navigation.hook';
import { useMetaMask, WalletType } from '../hooks/wallets/metamask.hook';

const MERCHANT_INFO_KEY = 'merchant-info';

async function fetchPaymentStandards(): Promise<PaymentStandard[]> {
  const apiUrl = url({
    base: Api.url,
    path: `/${Api.version}/paymentLink/standard`,
  });

  const response = await fetch(apiUrl);
  if (!response.ok) throw new Error(`Failed to fetch payment standards: HTTP ${response.status}`);

  return response.json();
}

interface PaymentLinkInterface {
  error: string | undefined;
  merchant: string | undefined;
  payRequest: PaymentLinkPayRequest | PaymentLinkPayTerminal | undefined;
  isMerchantMode: boolean;
  showAssets: boolean;
  showMap: boolean;
  timer: Timer;
  paymentLinkApiUrl: MutableRefObject<string>;
  callbackUrl: MutableRefObject<string | undefined>;
  paymentStandards: PaymentStandard[] | undefined;
  paymentIdentifier: string | undefined;
  isLoadingPaymentIdentifier: boolean;
  paymentStatus: ExtendedPaymentLinkStatus;
  isLoadingMetaMask: boolean;
  metaMaskInfo: MetaMaskInfo | undefined;
  metaMaskError: string | undefined;
  isMetaMaskPaying: boolean;
  paymentHasQuote: (request?: PaymentLinkPayTerminal | PaymentLinkPayRequest) => request is PaymentLinkPayRequest;
  setPaymentIdentifier: (id: string | undefined) => void;
  setSessionApiUrl: (url?: string) => void;
  fetchPayRequest: (url: string) => Promise<void>;
  fetchPaymentIdentifier: (
    payRequest: PaymentLinkPayTerminal | PaymentLinkPayRequest,
    selectedPaymentMethod?: Blockchain,
    selectedAsset?: string,
  ) => Promise<void>;
  payWithMetaMask: () => Promise<void>;
  assignLink: (externalId: string, publicName: string) => Promise<void>;
}

const PaymentLinkContext = createContext<PaymentLinkInterface>(undefined as any);

export function usePaymentLinkContext(): PaymentLinkInterface {
  return useContext(PaymentLinkContext);
}

export function PaymentLinkProvider(props: PropsWithChildren): JSX.Element {
  const { navigate } = useNavigation();
  const { assets, assetsLoading } = useAssetContext();
  const { timer, startTimer } = useCountdown();
  const { closeServices } = useAppHandlingContext();
  const { paymentLinkApiUrlStore } = useSessionStore();
  const { redirectUri } = useAppParams();
  const { assignPaymentLink } = usePaymentRoutes();

  const { isInstalled, getWalletType, requestAccount, requestBlockchain, createTransaction, readBalance } =
    useMetaMask();

  const { init: initPaymentPolling, stop: stopPaymentPolling } = usePolling();
  const { init: initWaitPolling, stop: stopWaitPolling } = usePolling({ timeInterval: 2000 });

  const [error, setError] = useState<string>();
  const [merchant, setMerchant] = useState<string>();
  const [showAssets, setShowAssets] = useState<boolean>(false);
  const [showMap, setShowMap] = useState<boolean>(false);
  const [urlParams, setUrlParams] = useSearchParams();
  const [apiPaymentStandards, setApiPaymentStandards] = useState<Record<string, PaymentStandard>>({});
  const [paymentStandards, setPaymentStandards] = useState<PaymentStandard[]>();
  const [payRequest, setPayRequest] = useState<PaymentLinkPayTerminal | PaymentLinkPayRequest>();
  const [paymentStatus, setPaymentStatus] = useState<ExtendedPaymentLinkStatus>(PaymentLinkPaymentStatus.PENDING);

  const [paymentIdentifier, setPaymentIdentifier] = useState<string>();
  const [isLoadingPaymentIdentifier, setIsLoadingPaymentIdentifier] = useState(false);

  const [isLoadingMetaMask, setIsLoadingMetaMask] = useState(false);
  const [metaMaskInfo, setMetaMaskInfo] = useState<MetaMaskInfo>();
  const [isMetaMaskPaying, setIsMetaMaskPaying] = useState(false);
  const [metaMaskError, setMetaMaskError] = useState<string>();

  const sessionApiUrl = useRef<string>(paymentLinkApiUrlStore.get() ?? '');

  const callbackUrl = useRef<string>();

  useEffect(() => {
    fetchPaymentStandards()
      .then((standards) => {
        const standardsMap = Object.fromEntries(standards.map((standard) => [standard.id, standard]));
        setApiPaymentStandards(standardsMap);
      })
      .catch((error) => console.error('Failed to load payment standards:', error));
  }, []);

  useEffect(() => {
    if (Object.keys(apiPaymentStandards).length > 0 && payRequest) {
      setPaymentStandardSelection(payRequest);
    }
  }, [apiPaymentStandards, payRequest]);

  const setSessionApiUrl = (newUrl?: string) => {
    sessionApiUrl.current = newUrl || '';
    newUrl ? paymentLinkApiUrlStore.set(newUrl) : paymentLinkApiUrlStore.remove();
  };

  const isPaymentInvoiceRequest = (params: URLSearchParams) => {
    const routeId = params.get('routeId') || params.get('route') || params.get('r');
    const externalId = params.get('externalId') || params.get('e') || params.get('message') || params.get('m');
    const amount = params.get('amount') || params.get('a');

    return routeId && externalId && amount;
  };

  // Handle URL parameters
  useEffect(() => {
    const lightningUrlParam = urlParams.get('lightning');
    const merchantUrlParam = urlParams.get('merchant');
    const showAssets = urlParams.has('showAssets');
    const showMap = urlParams.has('showMap');

    setShowAssets(showAssets);
    setShowMap(showMap);

    if (showAssets || showMap) {
      const newParams = new URLSearchParams(urlParams);
      newParams.delete('showAssets');
      newParams.delete('showMap');
      setUrlParams(newParams);
    }

    if (merchantUrlParam) {
      setMerchant(merchantUrlParam);

      // Dummy payment to fetch available payment methods
      const minimalPaymentUrl = url({
        base: Api.url,
        path: `/${Api.version}/paymentLink/payment`,
        params: new URLSearchParams({
          route: merchantUrlParam,
          amount: '0.01',
          currency: 'CHF',
          externalId: `${MERCHANT_INFO_KEY}-${Date.now()}`,
          message: 'Fetch merchant info',
        }),
      });

      setSessionApiUrl(minimalPaymentUrl);
      fetchPayRequest(minimalPaymentUrl, true);
      return;
    }

    let apiUrl: string | undefined = sessionApiUrl.current;
    if (lightningUrlParam) {
      apiUrl = Lnurl.decode(lightningUrlParam);
    } else if (isPaymentInvoiceRequest(urlParams)) {
      apiUrl = url({
        base: Api.url,
        path: `/${Api.version}/paymentLink/payment`,
        params: urlParams,
      });
      setUrlParams(new URLSearchParams());
    }

    setSessionApiUrl(apiUrl);

    if (sessionApiUrl.current) {
      fetchPayRequest(sessionApiUrl.current);
    } else {
      navigate('/', { replace: true });
    }

    return () => {
      setSessionApiUrl(undefined);
      stopPaymentPolling();
      stopWaitPolling();
    };
  }, []);

  // MetaMask in-app browser
  useEffect(() => {
    if (hasQuote(payRequest) && isInstalled() && getWalletType() === WalletType.IN_APP_BROWSER && !assetsLoading) {
      loadMetaMaskInfo();
    } else {
      setMetaMaskInfo(undefined);
    }
  }, [payRequest, isInstalled, getWalletType, assetsLoading]);

  async function fetchPayRequest(url: string, merchantMode = false): Promise<void> {
    setError(undefined);

    try {
      const urlObj = new URL(url);
      urlObj.searchParams.set('timeout', '0');
      const payRequest = await fetchJson<PaymentLinkPayResponse>(urlObj);

      if (merchantMode) {
        setPayRequest(payRequest);
        return;
      }

      if (!hasQuoteField(payRequest) && payRequest.statusCode === 400 && payRequest.message.includes('not assigned')) {
        setPayRequest(payRequest);
        navigate('/pl/assign');
        return;
      }

      const status = getStatusFromPayRequest(payRequest);

      setPayRequest(payRequest);
      setPaymentStatus(status);

      // A pending status is only ever derived from a quoted response, but the type cannot know that.
      if (status === PaymentLinkPaymentStatus.PENDING && hasQuoteField(payRequest)) {
        return waitPayment(payRequest);
      }

      urlObj.searchParams.set('timeout', '10');
      initPaymentPolling(urlObj, (response) => {
        setPayRequest(response);

        const status = getStatusFromPayRequest(response);
        setPaymentStatus(status);

        switch (status) {
          case PaymentLinkPaymentStatus.PENDING:
            stopPaymentPolling();
            waitPayment(response);
            break;
          case PaymentLinkPaymentStatus.COMPLETED:
            stopPaymentPolling();
            break;
        }
      });
    } catch (error: any) {
      setError(error.message ?? 'Unknown Error');
    }
  }

  function setPaymentStandardSelection(data: PaymentLinkPayRequest | PaymentLinkPayTerminal) {
    if (!hasQuote(data) || paymentStandards) return;

    const possibleStandards: PaymentStandard[] = data.possibleStandards.flatMap((type: PaymentStandardType) => {
      const paymentStandard = apiPaymentStandards[type];

      if (!paymentStandard) return [];

      if (type !== PaymentStandardType.PAY_TO_ADDRESS) {
        return paymentStandard;
      } else {
        return data.transferAmounts
          .filter((ta) => ta.method !== 'Lightning')
          .filter((ta) => ta.available !== false)
          .map((ta) => {
            return {
              ...paymentStandard,
              blockchain: ta.method as Blockchain,
            };
          });
      }
    });

    setPaymentStandards(possibleStandards);
  }

  async function waitPayment(paymentRequest: PaymentLinkPayRequest) {
    setPaymentStatus(PaymentLinkPaymentStatus.PENDING);
    startTimer(new Date(paymentRequest.quote.expiration));

    const lnurlpUrl = url({
      base: Api.url,
      path: `${Api.version}/lnurlp/wait/${paymentRequest.quote.payment}`,
    });

    initWaitPolling(lnurlpUrl, (response) => {
      stopWaitPolling();

      if (response.status === PaymentLinkPaymentStatus.COMPLETED && redirectUri) {
        setPaymentStatus(PaymentLinkPaymentStatus.COMPLETED);
        closeServices({ type: CloseType.PAYMENT }, false);
      } else if (response.status) {
        setPaymentStatus(response.status);
        setTimeout(() => fetchPayRequest(sessionApiUrl.current), 3 * 1000);
      } else {
        fetchPayRequest(sessionApiUrl.current);
      }
    });
  }

  function hasQuote(request?: PaymentLinkPayTerminal | PaymentLinkPayRequest): request is PaymentLinkPayRequest {
    return !!request && 'quote' in request && !payRequest?.externalId?.includes(MERCHANT_INFO_KEY);
  }

  const getStatusFromPayRequest = (payRequest: PaymentLinkPayRequest | PaymentLinkPayTerminal) => {
    if (hasQuote(payRequest)) {
      return PaymentLinkPaymentStatus.PENDING;
    } else if (payRequest.message?.toLowerCase().includes('payment complete')) {
      return PaymentLinkPaymentStatus.COMPLETED;
    } else {
      return NoPaymentLinkPaymentStatus.NO_PAYMENT;
    }
  };

  async function invokeCallback(_callbackUrl: string): Promise<string | undefined> {
    if (callbackUrl.current === _callbackUrl) return;
    callbackUrl.current = _callbackUrl;

    setIsLoadingPaymentIdentifier(true);
    setPaymentIdentifier(undefined);
    return fetchJson(_callbackUrl)
      .then((response) => {
        if (response && response.statusCode !== 409 && _callbackUrl === callbackUrl.current) {
          const identifier = response.uri ?? response.pr;
          setPaymentIdentifier(identifier);
          return identifier;
        }
      })
      .catch((error) => {
        setError(error.message);
        setPaymentIdentifier(undefined);
      })
      .finally(() => setIsLoadingPaymentIdentifier(false));
  }

  async function fetchPaymentIdentifier(
    payRequest: PaymentLinkPayTerminal | PaymentLinkPayRequest,
    selectedPaymentMethod?: Blockchain,
    selectedAsset?: string,
  ): Promise<void> {
    if (
      !hasQuote(payRequest) ||
      (payRequest.standard === PaymentStandardType.PAY_TO_ADDRESS && !(selectedPaymentMethod && selectedAsset))
    ) {
      return;
    }

    switch (payRequest.standard) {
      case PaymentStandardType.OPEN_CRYPTO_PAY:
        callbackUrl.current = payRequest.callback;
        setPaymentIdentifier(Lnurl.prependLnurl(Lnurl.encode(simplifyPaymentLinkUrl(sessionApiUrl.current))));
        break;
      case PaymentStandardType.LIGHTNING_BOLT11:
        invokeCallback(
          url({
            base: payRequest.callback,
            params: new URLSearchParams({ quote: payRequest.quote.id, amount: payRequest.minSendable.toString() }),
          }),
        );
        break;
      case PaymentStandardType.PAY_TO_ADDRESS:
        invokeCallback(
          url({
            base: payRequest.callback,
            params: new URLSearchParams({
              quote: payRequest.quote.id,
              method: selectedPaymentMethod ?? '',
              asset: selectedAsset ?? '',
            }),
          }),
        );
        break;
    }
  }

  function simplifyPaymentLinkUrl(url: string): string {
    const replacementMap: { [key: string]: string } = {
      [`/${Api.version}/paymentLink/payment`]: `/${Api.version}/plp`,
      routeId: 'r',
      externalId: 'e',
      message: 'm',
      amount: 'a',
      currency: 'c',
      expiryDate: 'd',
    };

    const urlObj = new URL(url);
    const newPath = replacementMap[urlObj.pathname] || urlObj.pathname;
    const newParams = new URLSearchParams();
    urlObj.searchParams.forEach((value, key) => {
      const shortKey = replacementMap[key] || key;
      newParams.append(shortKey, value);
    });

    return `${urlObj.origin}${newPath}?${newParams.toString()}`;
  }

  // --- META MASK IN-APP BROWSER --- //
  async function loadMetaMaskInfo() {
    if (!hasQuote(payRequest)) return;

    setIsLoadingMetaMask(true);

    try {
      const address = await requestAccount();
      const blockchain = await requestBlockchain();
      if (!address || !blockchain) throw new Error('Failed to get account');

      const hasShortExpiration = new Date(payRequest.quote.expiration) < addMinutes(new Date(), 1);

      const matchingTransferAmount = payRequest.transferAmounts.find((item) => item.method === blockchain);
      if (!matchingTransferAmount || (hasShortExpiration && blockchain === Blockchain.ETHEREUM))
        throw new Error('Selected blockchain is not supported');

      const transferAsset = await findAssetWithBalance(
        address,
        blockchain as Blockchain,
        matchingTransferAmount.assets,
      );
      if (!transferAsset)
        throw new Error('InApp Browser Payment is not yet activated. This function is still under development.');

      setMetaMaskInfo({
        accountAddress: address,
        transferAsset: transferAsset.asset,
        transferAmount: transferAsset.amount,
        minFee: matchingTransferAmount.minFee,
      });
    } catch (e) {
      const error = e as Error;
      setMetaMaskError(error.message);
    } finally {
      setIsLoadingMetaMask(false);
    }
  }

  async function findAssetWithBalance(
    address: string,
    blockchain: Blockchain,
    transferAmounts: PaymentAmount[],
  ): Promise<AssetBalance | undefined> {
    transferAmounts.sort((a, b) => (a.asset === 'dEURO' ? -1 : b.asset === 'dEURO' ? 1 : 0));

    for (const transferAmount of transferAmounts) {
      const asset = assets.get(blockchain)?.find((a) => a.name === transferAmount.asset);
      if (!asset) continue;

      const balance = await readBalance(asset, address, true);
      if (transferAmount.amount && balance.amount >= transferAmount.amount)
        return { asset: asset, amount: transferAmount.amount };
    }
  }

  async function payWithMetaMask() {
    if (!hasQuote(payRequest) || !metaMaskInfo) return;

    setIsMetaMaskPaying(true);

    try {
      const asset = metaMaskInfo.transferAsset;

      const paymentUri = await invokeCallback(
        url({
          base: payRequest.callback,
          params: new URLSearchParams({
            quote: payRequest.quote.id,
            method: asset.blockchain,
            asset: asset.name,
          }),
        }),
      );
      if (!paymentUri) throw new Error('Failed to get payment information');

      const paymentData = Evm.decodeUri(paymentUri);

      const address = asset.type === AssetType.COIN ? paymentData?.address : paymentData?.tokenContractAddress;
      const amount = paymentData?.amount;
      if (!address || !amount) throw new Error('Failed to get payment information');

      const tx = await createTransaction(new BigNumber(amount), asset, metaMaskInfo.accountAddress, address, {
        isWeiAmount: true,
        gasPrice: metaMaskInfo.minFee,
      });
      await fetchJson(
        url({
          base: payRequest.callback.replace('/cb', '/tx'),
          params: new URLSearchParams({ quote: payRequest.quote.id, method: asset.blockchain, tx }),
        }),
      );
    } catch (e) {
      const error = e as Error;
      setMetaMaskError(error.message);
    } finally {
      setIsMetaMaskPaying(false);
    }
  }

  async function assignLink(externalId: string, publicName: string): Promise<void> {
    await assignPaymentLink({ publicName }, undefined, externalId);
    await fetchPayRequest(sessionApiUrl.current);
  }

  const context = useMemo(
    () => ({
      error,
      merchant,
      payRequest,
      isMerchantMode: payRequest?.externalId?.includes(MERCHANT_INFO_KEY) || false,
      showAssets,
      showMap,
      timer,
      paymentLinkApiUrl: sessionApiUrl,
      callbackUrl,
      paymentStandards,
      paymentIdentifier,
      isLoadingPaymentIdentifier,
      paymentStatus,
      isLoadingMetaMask,
      metaMaskInfo,
      metaMaskError,
      isMetaMaskPaying,
      paymentHasQuote: hasQuote,
      setPaymentIdentifier,
      setSessionApiUrl,
      fetchPayRequest,
      fetchPaymentIdentifier,
      payWithMetaMask,
      assignLink,
    }),
    [
      error,
      merchant,
      payRequest,
      timer,
      paymentStandards,
      paymentIdentifier,
      isLoadingPaymentIdentifier,
      paymentStatus,
      isLoadingMetaMask,
      metaMaskInfo,
      metaMaskError,
      isMetaMaskPaying,
      showAssets,
      showMap,
    ],
  );

  return <PaymentLinkContext.Provider value={context}>{props.children}</PaymentLinkContext.Provider>;
}
