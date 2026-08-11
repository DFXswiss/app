import { ApiError, Asset, BankAccount, Blockchain, CustodyOrder, CustodyOrderPaymentInfo, Fiat, FiatPaymentMethod, TransactionError, Utils, useAuthContext, useBuy, useUserContext } from '@dfx.swiss/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UseFormSetValue } from 'react-hook-form';
import { addressLabel } from 'src/config/labels';
import { useAppHandlingContext } from 'src/contexts/app-handling.context';
import { AssetBalance } from 'src/contexts/balance.context';
import { useSettingsContext } from 'src/contexts/settings.context';
import { deepEqual } from 'src/util/utils';
import { useAppParams } from './app-params.hook';
import { useBlockchain } from './blockchain.hook';
import { useNavigation } from './navigation.hook';
import { useTxHelper } from './tx-helper.hook';

export enum OrderType {
  BUY = 'buy',
  SELL = 'sell',
  SWAP = 'swap',
  DEPOSIT = 'deposit',
}

export enum Side {
  SOURCE = 'source',
  TARGET = 'target',
}

export interface OrderFormData {
  sourceAsset: Fiat | Asset;
  targetAsset: Fiat | Asset;
  sourceAmount?: string;
  targetAmount?: string;
  paymentMethod?: FiatPaymentMethod;
  bankAccount?: BankAccount;
  address?: Address;
  exactPrice?: boolean;
}

// TODO: Add Address to packages?
interface Address {
  address: string;
  label: string;
  chain?: Blockchain;
}

export interface AmountError {
  key: string;
  defaultValue: string;
  interpolation?: Record<string, string | number> | undefined;
  hideInfos: boolean;
}

interface UseOrderParams {
  orderType: OrderType;
  sourceAssets?: Asset[] | Fiat[];
  targetAssets?: Asset[] | Fiat[];
}

export interface UseOrderResult {
  isBuy: boolean;
  isSell?: boolean;
  isSwap?: boolean;
  sourceAssets?: Asset[] | Fiat[];
  targetAssets?: Asset[] | Fiat[];
  addressItems: Address[];
  cryptoBalances: AssetBalance[];
  paymentInfo?: CustodyOrder;
  isFetchingPaymentInfo: boolean;
  lastEditedFieldRef: React.MutableRefObject<Side>;
  paymentInfoError?: string;
  amountError?: AmountError;
  kycError?: TransactionError;
  setSelectedAddress: (address?: Address) => void;
  getAvailableCurrencies: (paymentMethod?: FiatPaymentMethod) => Fiat[];
  getAvailablePaymentMethods: (targetAsset?: Asset) => FiatPaymentMethod[];
  handlePaymentInfoFetch: (
    debouncedData: OrderFormData,
    onFetchPaymentInfo: (data: OrderFormData) => Promise<CustodyOrder>,
    setValue: UseFormSetValue<OrderFormData>,
  ) => void;
}

export function useOrder({ orderType, sourceAssets, targetAssets }: UseOrderParams): UseOrderResult {
  const { currencies } = useBuy();
  const { user } = useUserContext();
  const { session } = useAuthContext();
  const { getBalances } = useTxHelper();
  const { navigate } = useNavigation();
  const { translate } = useSettingsContext();
  const { toString: blockchainToString } = useBlockchain();
  const { isEmbedded, isDfxHosted } = useAppHandlingContext();
  const { wallet, availableBlockchains } = useAppParams();

  const [selectedAddress, setSelectedAddress] = useState<Address>();
  const [cryptoBalances, setCryptoBalances] = useState<AssetBalance[]>([]);
  const [paymentInfo, setPaymentInfo] = useState<CustodyOrder>();
  const [isFetchingPaymentInfo, setIsFetchingPaymentInfo] = useState(false);
  const [paymentInfoError, setPaymentInfoError] = useState<string>();
  const [amountError, setAmountError] = useState<AmountError>();
  const [kycError, setKycError] = useState<TransactionError>();

  const lastEditedFieldRef = useRef<Side>(Side.SOURCE);
  const lastFetchedDataRef = useRef<OrderFormData | null>(null);

  const isBuy = useMemo(() => [OrderType.BUY, OrderType.DEPOSIT].includes(orderType), [orderType]);
  const isSell = useMemo(() => orderType === OrderType.SELL, [orderType]);
  const isSwap = useMemo(() => orderType === OrderType.SWAP, [orderType]);

  // TODO (later): Set available source / target assets based on blockchain, availableBlockchains,
  // assets, assetIn, assetOut (from useAppParams) and blockchain from useWalletContext.
  // See buy.screen.tsx#L186, sell.screen.tsx#L179 and swap.screen.tsx#L207.

  // ---- Fetch crypto balances (across source and target assets) ----

  useEffect(() => {
    let cryptoAssets = isBuy ? targetAssets ?? [] : isSell ? sourceAssets ?? [] : [];
    cryptoAssets ??= isSwap ? (sourceAssets ?? []).concat(targetAssets ?? []) : [];

    if (cryptoAssets && selectedAddress?.address) {
      getBalances(cryptoAssets as Asset[], selectedAddress.address, selectedAddress.chain).then((balances) =>
        setCryptoBalances(balances ?? []),
      );
    }
  }, [isBuy, isSell, isSwap, targetAssets, sourceAssets, getBalances, selectedAddress]);

  // ---- Fetch available payment methods based on target asset ----

  const getAvailablePaymentMethods = useCallback(
    (_targetAsset?: Asset): FiatPaymentMethod[] => {
      if (!isBuy) return [];
      if (orderType === OrderType.DEPOSIT) return [FiatPaymentMethod.BANK]; // TODO: Add card deposit later

      // Credit card payments disabled
      // const pushCardPayment =
      //   (isDfxHosted || !isEmbedded) &&
      //   wallet !== EMBEDDED_WALLET &&
      //   user?.activeAddress?.wallet !== EMBEDDED_WALLET &&
      //   (!targetAsset || targetAsset.cardBuyable);

      return [FiatPaymentMethod.BANK];
    },
    [isBuy, isDfxHosted, isEmbedded, wallet, user],
  );

  // ---- Get available currencies based on payment method ----

  const getAvailableCurrencies = useCallback(
    (paymentMethod?: FiatPaymentMethod): Fiat[] =>
      currencies?.filter((c) =>
        paymentMethod === FiatPaymentMethod.CARD
          ? c.cardSellable
          : paymentMethod === FiatPaymentMethod.INSTANT
          ? c.instantSellable
          : c.sellable,
      ) ?? [],
    [currencies],
  );

  // ---- Fetch available blockchain addresses based on session and available crypto assets ----

  const addressItems: Address[] = useMemo(() => {
    const cryptoAssets = (isBuy ? targetAssets ?? [] : sourceAssets ?? []) as Asset[];
    const blockchains = availableBlockchains?.filter((b) => cryptoAssets?.some((a) => a.blockchain === b));

    return session?.address && blockchains?.length
      ? [
          ...blockchains.map((b) => ({
            address: addressLabel(session),
            label: blockchainToString(b),
            chain: b,
          })),
          {
            address: translate('screens/buy', 'Switch address'),
            label: translate('screens/buy', 'Login with a different address'),
          },
        ]
      : [];
  }, [session, targetAssets, sourceAssets, orderType, availableBlockchains, translate]);

  // ---- Handle validation of form data and fetching payment info ----

  const handlePaymentInfoFetch = useCallback(
    (
      debouncedData: OrderFormData,
      onFetchPaymentInfo: (data: OrderFormData) => Promise<CustodyOrder>,
      setValue: UseFormSetValue<OrderFormData>,
    ) => {
      let isRunning = true;

      const editedSource = lastEditedFieldRef.current === Side.SOURCE;
      const orderIsValid =
        debouncedData &&
        (!editedSource || Number(debouncedData.sourceAmount) > 0) &&
        (editedSource || Number(debouncedData.targetAmount) > 0) &&
        (!sourceAssets || debouncedData.sourceAsset) &&
        (!targetAssets || debouncedData.targetAsset) &&
        (!isSell || debouncedData.bankAccount);

      const validatedOrderForm = orderIsValid && {
        ...debouncedData,
        sourceAmount: editedSource ? debouncedData.sourceAmount : undefined,
        targetAmount: !editedSource ? debouncedData.targetAmount : undefined,
      };

      if (deepEqual(validatedOrderForm, lastFetchedDataRef.current)) return;

      setKycError(undefined);
      setAmountError(undefined);
      setPaymentInfo(undefined);
      setPaymentInfoError(undefined);
      if (!validatedOrderForm) return;

      setIsFetchingPaymentInfo(true);
      lastFetchedDataRef.current = validatedOrderForm;
      onFetchPaymentInfo(validatedOrderForm)
        .then((paymentInfo) => {
          if (isRunning && paymentInfo) {
            validateOrder(paymentInfo.paymentInfo);
            setPaymentInfo(paymentInfo);
            !editedSource && setValue('sourceAmount', paymentInfo.paymentInfo.amount.toString());
            editedSource && setValue('targetAmount', paymentInfo.paymentInfo.estimatedAmount.toString());

            // TODO (later): Load exact price buy, sell & swap
            // if (paymentInfo) {
            //   return onFetchPaymentInfo({ ...validatedOrderForm, exactPrice: true });
            // }
          }
        })
        .catch((error: ApiError) => {
          if (isRunning) {
            !editedSource && setValue('sourceAmount', undefined);
            editedSource && setValue('targetAmount', undefined);
            lastFetchedDataRef.current = null;
            if (error.statusCode === 400 && error.message === 'Ident data incomplete') {
              navigate('/profile');
            } else {
              setPaymentInfo(undefined);
              setPaymentInfoError(error.message ?? 'Unknown error');
            }
          }
        })
        .finally(() => isRunning && setIsFetchingPaymentInfo(false));

      return () => {
        isRunning = false;
      };
    },
    [],
  );

  // ---- Validate fetched order ----

  function validateOrder(order: CustodyOrderPaymentInfo): void {
    setAmountError(undefined);
    setKycError(undefined);

    switch (order.error) {
      case TransactionError.AMOUNT_TOO_LOW:
        setAmountError({
          key: 'screens/payment',
          defaultValue: 'Entered amount is below minimum deposit of {{amount}} {{currency}}',
          interpolation: {
            amount: Utils.formatAmount(order.minVolume),
            currency: order.sourceAsset,
          },
          hideInfos: true,
        });
        return;

      case TransactionError.AMOUNT_TOO_HIGH:
        setAmountError({
          key: 'screens/payment',
          defaultValue: 'Entered amount is above maximum deposit of {{amount}} {{currency}}',
          interpolation: {
            amount: Utils.formatAmount(order.maxVolume),
            currency: order.sourceAsset,
          },
          hideInfos: true,
        });
        return;

      case TransactionError.LIMIT_EXCEEDED:
      case TransactionError.KYC_REQUIRED:
      case TransactionError.KYC_DATA_REQUIRED:
      case TransactionError.KYC_REQUIRED_INSTANT:
      case TransactionError.BANK_TRANSACTION_MISSING:
      case TransactionError.BANK_TRANSACTION_OR_VIDEO_MISSING:
      case TransactionError.VIDEO_IDENT_REQUIRED:
      case TransactionError.NATIONALITY_NOT_ALLOWED:
      case TransactionError.PAYMENT_METHOD_NOT_ALLOWED:
      case TransactionError.TRADING_NOT_ALLOWED:
      case TransactionError.RECOMMENDATION_REQUIRED:
      case TransactionError.EMAIL_REQUIRED:
        setKycError(order.error);
        return;
    }
  }

  return useMemo(
    () => ({
      isBuy,
      isSell,
      isSwap,
      sourceAssets,
      targetAssets,
      addressItems,
      cryptoBalances,
      paymentInfo,
      isFetchingPaymentInfo,
      lastEditedFieldRef,
      paymentInfoError,
      amountError,
      kycError,
      setSelectedAddress,
      getAvailableCurrencies,
      getAvailablePaymentMethods,
      handlePaymentInfoFetch,
    }),
    [
      isBuy,
      isSell,
      isSwap,
      sourceAssets,
      targetAssets,
      addressItems,
      cryptoBalances,
      paymentInfo,
      isFetchingPaymentInfo,
      paymentInfoError,
      amountError,
      kycError,
      getAvailableCurrencies,
      getAvailablePaymentMethods,
      handlePaymentInfoFetch,
    ],
  );
}
