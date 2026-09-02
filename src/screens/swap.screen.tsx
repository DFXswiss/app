import {
  ApiError,
  Asset,
  AssetCategory,
  Blockchain,
  Session,
  Swap,
  SwapPaymentInfo,
  TransactionError,
  TransactionType,
  UserAddress,
  Utils,
  Validations,
  useAsset,
  useAssetContext,
  useAuthContext,
  useSessionContext,
  useSwap,
  useUserContext,
} from '@dfx.swiss/react';
import {
  AssetIconVariant,
  Form,
  SpinnerSize,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledDropdown,
  StyledHorizontalStack,
  StyledInput,
  StyledLink,
  StyledLoadingSpinner,
  StyledSearchDropdown,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { useEffect, useRef, useState } from 'react';
import { FieldPath, FieldPathValue, useForm, useWatch } from 'react-hook-form';
import { PaymentInformationContent } from 'src/components/payment/payment-info-sell';
import { PrivateAssetHint } from 'src/components/private-asset-hint';
import { addressLabel } from 'src/config/labels';
import { Urls } from 'src/config/urls';
import { useLayoutContext } from 'src/contexts/layout.context';
import { useWindowContext } from 'src/contexts/window.context';
import useDebounce from 'src/hooks/debounce.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { getKycErrorFromMessage } from 'src/util/api-error';
import { blankedAddress } from 'src/util/utils';
import { ErrorHint } from '../components/error-hint';
import { ExchangeRate } from '../components/exchange-rate';
import { AddressSwitch } from '../components/payment/address-switch';
import { SwapCompletion } from '../components/payment/swap-completion';
import { QuoteErrorHint } from '../components/quote-error-hint';
import { SanctionHint } from '../components/sanction-hint';
import { CloseType, useAppHandlingContext } from '../contexts/app-handling.context';
import { AssetBalance } from '../contexts/balance.context';
import { useSettingsContext } from '../contexts/settings.context';
import { useWalletContext } from '../contexts/wallet.context';
import { useAppParams } from '../hooks/app-params.hook';
import { useBlockchain } from '../hooks/blockchain.hook';
import { useAddressGuard } from '../hooks/guard.hook';
import { useNavigation } from '../hooks/navigation.hook';
import { useTxHelper } from '../hooks/tx-helper.hook';
import { resolveWalletTxError } from '../util/wallet-tx-error';

enum Side {
  SPEND = 'SPEND',
  GET = 'GET',
}

interface Address {
  address?: string;
  addressLabel: string;
  label: string;
  chain?: Blockchain;
}

interface FormData {
  sourceAsset: Asset;
  targetAsset: Asset;
  amount: string;
  targetAmount: string;
  address: Address;
}

interface CustomAmountError {
  key: string;
  defaultValue: string;
  interpolation?: Record<string, string | number> | undefined;
  hideInfos: boolean;
}

interface ValidatedData extends SwapPaymentInfo {
  sideToUpdate?: Side;
}

export default function SwapScreen(): JSX.Element {
  useAddressGuard('/login');

  const { translate, translateError } = useSettingsContext();
  const { closeServices } = useAppHandlingContext();
  const { blockchain: walletBlockchain, activeWallet, switchBlockchain } = useWalletContext();
  const { getBalances, sendTransaction, canSendTransaction } = useTxHelper();
  const { logout } = useSessionContext();
  const { session } = useAuthContext();
  const { width } = useWindowContext();
  const { userAddresses } = useUserContext();
  const { assets, getAssets } = useAssetContext();
  const { getAsset, isSameAsset } = useAsset();
  const { navigate } = useNavigation();
  const {
    assets: assetFilter,
    assetIn,
    assetOut,
    amountIn,
    blockchain,
    hideTargetSelection,
    externalTransactionId,
    flags,
    setParams,
  } = useAppParams();
  const { receiveFor } = useSwap();
  const { toString } = useBlockchain();
  const { rootRef } = useLayoutContext();

  const [sourceAssets, setSourceAssets] = useState<Asset[]>();
  const [targetAssets, setTargetAssets] = useState<Asset[]>();
  const [customAmountError, setCustomAmountError] = useState<CustomAmountError>();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [kycError, setKycError] = useState<TransactionError>();
  const [isLoading, setIsLoading] = useState<Side>();
  const [paymentInfo, setPaymentInfo] = useState<Swap>();
  const [isQuoteFinal, setIsQuoteFinal] = useState(false);
  const [balances, setBalances] = useState<AssetBalance[]>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTxDone, setTxDone] = useState<boolean>(false);
  const [swapTxId, setSwapTxId] = useState<string>();
  const [showsSwitchScreen, setShowsSwitchScreen] = useState(false);
  const [validatedData, setValidatedData] = useState<ValidatedData>();
  const [retryToken, setRetryToken] = useState(0);

  // form
  const { control, handleSubmit, setValue, resetField } = useForm<FormData>({ mode: 'onTouched' });

  const enteredAmount = useWatch({ control, name: 'amount' });
  const selectedSourceAsset = useWatch({ control, name: 'sourceAsset' });
  const selectedTargetAmount = useWatch({ control, name: 'targetAmount' });
  const selectedTargetAsset = useWatch({ control, name: 'targetAsset' });
  const selectedAddress = useWatch({ control, name: 'address' });

  const previousAmountRef = useRef<string>();
  const previousTargetAmountRef = useRef<string>();
  const spendClearedByUserRef = useRef(false);
  const targetClearedByUserRef = useRef(false);
  const isExactPriceWriteRef = useRef(false);
  const quoteGeneration = useRef(0);
  const enteredAmountLiveRef = useRef(enteredAmount);
  const selectedTargetAmountLiveRef = useRef(selectedTargetAmount);
  enteredAmountLiveRef.current = enteredAmount;
  selectedTargetAmountLiveRef.current = selectedTargetAmount;
  if (!enteredAmount && previousAmountRef.current) spendClearedByUserRef.current = true;
  if (!selectedTargetAmount && previousTargetAmountRef.current) targetClearedByUserRef.current = true;

  useEffect(() => {
    if (sourceAssets && session?.address) {
      const assetMap = sourceAssets.reduce<Record<Blockchain, Asset[]>>(
        (acc, asset) => {
          if (!acc[asset.blockchain]) acc[asset.blockchain] = [];
          acc[asset.blockchain].push(asset);
          return acc;
        },
        {} as Record<Blockchain, Asset[]>,
      );

      Promise.all(
        Object.entries(assetMap).map(
          ([chain, assets]) => session.address && getBalances(assets, session.address, chain as Blockchain),
        ),
      ).then((results) => setBalances(results.flat().filter((b) => b) as AssetBalance[]));
    }
  }, [getBalances, sourceAssets]);

  // default params
  function setVal(field: FieldPath<FormData>, value: FieldPathValue<FormData, FieldPath<FormData>>) {
    setValue(field, value, { shouldValidate: true });
  }

  const availableBalance = selectedSourceAsset && findBalance(selectedSourceAsset);

  const filteredAssets = assets && filterAssets(Array.from(assets.values()).flat(), assetFilter);

  const userSessions = [session, ...userAddresses].filter(
    (a, i, arr) => a && arr.findIndex((b) => b?.address === a.address) === i,
  ) as (Session | UserAddress)[];

  const userAddressItems = userSessions.map((a) => ({
    address: a.address,
    addressLabel: addressLabel(a),
    blockchains: a.blockchains,
  }));

  // Source blockchains: all blockchains from user addresses (including linked addresses like Lightning)
  const sourceBlockchains = userAddressItems
    .flatMap((a) => a.blockchains)
    .filter((b, i, arr) => arr.indexOf(b) === i)
    .filter((b) => filteredAssets?.some((a) => a.blockchain === b));

  const targetBlockchains = userAddressItems
    .flatMap((a) => a.blockchains)
    .filter((b, i, arr) => arr.indexOf(b) === i)
    .filter((b) => filteredAssets?.some((a) => a.blockchain === b));

  const addressItems: Address[] =
    userAddressItems.length > 0 && targetBlockchains.length
      ? [
          ...targetBlockchains.flatMap((b) => {
            const addresses = userAddressItems.filter((a) => a.blockchains.includes(b));
            return addresses.map((a) => ({
              address: a.address,
              addressLabel: a.addressLabel,
              label: toString(b),
              chain: b,
            }));
          }),
          {
            addressLabel: translate('screens/buy', 'Switch address'),
            label: translate('screens/buy', 'Login with a different address'),
          },
        ]
      : [];

  useEffect(() => {
    const blockchainSourceAssets = getAssets(sourceBlockchains, { sellable: true, comingSoon: false });
    const activeSourceAssets = filterAssets(blockchainSourceAssets, assetFilter);
    setSourceAssets(activeSourceAssets);

    const activeTargetBlockchains = blockchain ? [blockchain as Blockchain] : targetBlockchains;
    const blockchainTargetAssets = getAssets(activeTargetBlockchains, { buyable: true, comingSoon: false });
    const activeTargetAssets = filterAssets(blockchainTargetAssets, assetFilter);
    setTargetAssets(activeTargetAssets);

    const sourceAsset =
      getAsset(activeSourceAssets, assetIn) ??
      (walletBlockchain && activeSourceAssets.find((a) => a.blockchain === walletBlockchain));
    if (sourceAsset) setVal('sourceAsset', sourceAsset);

    const targetAsset = getAsset(activeTargetAssets, assetOut) ?? (blockchain && activeTargetAssets[0]);
    if (targetAsset) setVal('targetAsset', targetAsset);
  }, [
    assetFilter,
    assetIn,
    assetOut,
    getAsset,
    getAssets,
    blockchain,
    walletBlockchain,
    sourceBlockchains?.length,
    targetBlockchains?.length,
    userAddresses.length,
  ]);

  useEffect(() => {
    if (amountIn) {
      if (!spendClearedByUserRef.current) setVal('amount', amountIn);
    } else if (
      selectedSourceAsset &&
      !enteredAmount &&
      !selectedTargetAmount &&
      !spendClearedByUserRef.current &&
      !targetClearedByUserRef.current
    ) {
      const isStablecoin = ['USDT', 'USDC', 'DAI', 'ZCHF', 'dEURO', 'XCHF'].includes(selectedSourceAsset.name);
      setVal('amount', isStablecoin ? '100' : '0.1');
    }
  }, [amountIn, selectedSourceAsset]);

  useEffect(() => setAddress(), [session?.address, translate, blockchain, userAddresses, addressItems.length]);

  // When assetOut is set and userAddresses are loaded, ensure the correct blockchain is selected
  useEffect(() => {
    if (assetOut && userAddresses.length > 0) {
      const assetOutBlockchain = assetOut.split('/')[0];
      const hasAddressForBlockchain = addressItems.some((a) => a.chain === assetOutBlockchain);

      // If we have an address for the assetOut blockchain and blockchain doesn't match, update it
      if (hasAddressForBlockchain && blockchain !== assetOutBlockchain) {
        setParams({ blockchain: assetOutBlockchain as Blockchain });
        switchBlockchain(assetOutBlockchain as Blockchain);
      }
    }
  }, [assetOut, userAddresses.length, addressItems.length]);

  useEffect(() => {
    if (selectedAddress) {
      if (selectedAddress.chain) {
        // If assetOut is set and points to a different blockchain, don't override it
        const assetOutBlockchain = assetOut?.split('/')[0];
        const shouldSkipBlockchainChange =
          assetOutBlockchain && addressItems.some((a) => a.chain === assetOutBlockchain);

        if (blockchain !== selectedAddress.chain && !shouldSkipBlockchainChange) {
          setParams({ blockchain: selectedAddress.chain });
          switchBlockchain(selectedAddress.chain);
          resetField('targetAsset');
          setTargetAssets(undefined);
        }
      } else {
        setShowsSwitchScreen(true);
        setAddress();
      }
    }
  }, [selectedAddress]);

  useEffect(() => {
    if (!enteredAmount) {
      setCustomAmountError(undefined);
    }
  }, [enteredAmount]);

  // A field the user emptied stays an edit in progress until they type again.
  // SPEND data changed
  useEffect(() => {
    const exactPriceWrite = isExactPriceWriteRef.current;
    if (enteredAmount) {
      spendClearedByUserRef.current = false;
      if (enteredAmount !== previousAmountRef.current && !exactPriceWrite) {
        targetClearedByUserRef.current = false;
      }
    } else if (previousAmountRef.current) {
      spendClearedByUserRef.current = true;
    }
    if (enteredAmount !== previousAmountRef.current) isExactPriceWriteRef.current = false;
    previousAmountRef.current = enteredAmount;

    const requiresUpdate =
      enteredAmount !== paymentInfo?.amount?.toString() ||
      selectedSourceAsset?.uniqueName !== paymentInfo?.sourceAsset.uniqueName;

    const hasSpendData = enteredAmount && selectedSourceAsset;
    const hasGetData = selectedTargetAmount && selectedTargetAsset && selectedAddress;

    if (spendClearedByUserRef.current || targetClearedByUserRef.current) {
      quoteGeneration.current += 1;
      isExactPriceWriteRef.current = false;
      setIsQuoteFinal(false);
    } else if (requiresUpdate && !exactPriceWrite) {
      quoteGeneration.current += 1;
      setIsQuoteFinal(false);
      setPaymentInfo(undefined);
    }

    if (requiresUpdate) {
      if (hasSpendData && !targetClearedByUserRef.current) {
        updateData(Side.GET);
      } else if (spendClearedByUserRef.current || targetClearedByUserRef.current) {
        setValidatedData(undefined);
        setPaymentInfo(undefined);
        setKycError(undefined);
        setErrorMessage(undefined);
        setCustomAmountError(undefined);
        setIsLoading(undefined);
      } else if (hasGetData) {
        updateData(Side.SPEND);
      }
    }
  }, [enteredAmount, selectedSourceAsset]);

  // GET data changed
  useEffect(() => {
    const exactPriceWrite = isExactPriceWriteRef.current;
    if (selectedTargetAmount) {
      targetClearedByUserRef.current = false;
      if (selectedTargetAmount !== previousTargetAmountRef.current && !exactPriceWrite) {
        spendClearedByUserRef.current = false;
      }
    } else if (previousTargetAmountRef.current) {
      targetClearedByUserRef.current = true;
    }
    if (selectedTargetAmount !== previousTargetAmountRef.current) isExactPriceWriteRef.current = false;
    previousTargetAmountRef.current = selectedTargetAmount;

    const isSameTargetAmount = selectedTargetAmount === paymentInfo?.estimatedAmount?.toString();
    const requiresUpdate =
      !isSameTargetAmount ||
      selectedTargetAsset?.uniqueName !== paymentInfo?.targetAsset?.uniqueName ||
      selectedAddress?.address !== validatedData?.receiverAddress;

    const hasSpendData = enteredAmount && selectedSourceAsset;
    const hasGetData = selectedTargetAmount && selectedTargetAsset && selectedAddress;

    if (spendClearedByUserRef.current || targetClearedByUserRef.current) {
      quoteGeneration.current += 1;
      isExactPriceWriteRef.current = false;
      setIsQuoteFinal(false);
    } else if (requiresUpdate && !exactPriceWrite) {
      quoteGeneration.current += 1;
      setIsQuoteFinal(false);
      setPaymentInfo(undefined);
    }

    if (requiresUpdate) {
      if (hasGetData && !spendClearedByUserRef.current) {
        const addressOnlyChange =
          Boolean(enteredAmount) &&
          selectedAddress?.address !== validatedData?.receiverAddress &&
          selectedTargetAmount === paymentInfo?.estimatedAmount?.toString() &&
          selectedTargetAsset?.uniqueName === paymentInfo?.targetAsset?.uniqueName;
        updateData(addressOnlyChange ? Side.GET : Side.SPEND);
      } else if (targetClearedByUserRef.current || spendClearedByUserRef.current) {
        setValidatedData(undefined);
        setPaymentInfo(undefined);
        setKycError(undefined);
        setErrorMessage(undefined);
        setCustomAmountError(undefined);
        setIsLoading(undefined);
      } else if (hasSpendData) {
        updateData(Side.GET);
      }
    }
  }, [selectedTargetAmount, selectedTargetAsset, selectedAddress]);

  function updateData(sideToUpdate: Side) {
    const data = validateData({
      amount: sideToUpdate === Side.GET ? enteredAmount : undefined,
      sourceAsset: selectedSourceAsset,
      targetAsset: selectedTargetAsset,
      targetAmount: sideToUpdate === Side.SPEND || enteredAmount === undefined ? selectedTargetAmount : undefined,
      address: selectedAddress,
    });

    setValidatedData(data ? { ...data, sideToUpdate } : undefined);
  }

  useEffect(() => {
    let isRunning = true;

    setErrorMessage(undefined);
    setKycError(undefined);
    setPaymentInfo(undefined);
    setIsQuoteFinal(false);
    setIsLoading(undefined);

    if (!validatedData) return;

    const generation = quoteGeneration.current;
    const data: SwapPaymentInfo = { ...validatedData, externalTransactionId };

    setIsLoading(validatedData.sideToUpdate);
    receiveFor(data)
      .then((swap) => {
        if (!isRunning || !swap || generation !== quoteGeneration.current) return;
        validateSwap(swap);
        setPaymentInfo(swap);
        return receiveFor({ ...data, exactPrice: true });
      })
      .then((info) => {
        if (!isRunning || !info) return;
        if (spendClearedByUserRef.current || targetClearedByUserRef.current) return;
        if (generation !== quoteGeneration.current) return;
        if (validatedData.sideToUpdate === Side.SPEND) {
          const nextAmount = info.amount.toString();
          if (enteredAmountLiveRef.current !== nextAmount) {
            isExactPriceWriteRef.current = true;
            setVal('amount', nextAmount);
          } else {
            isExactPriceWriteRef.current = false;
          }
        } else {
          const nextTarget = info.estimatedAmount.toString();
          if (selectedTargetAmountLiveRef.current !== nextTarget) {
            isExactPriceWriteRef.current = true;
            setVal('targetAmount', nextTarget);
          } else {
            isExactPriceWriteRef.current = false;
          }
        }
        setPaymentInfo(info);
        setIsQuoteFinal(true);
      })
      .catch((error: ApiError) => {
        if (!isRunning || generation !== quoteGeneration.current) return;
        if (error.statusCode === 400 && error.message === 'Ident data incomplete') {
          navigate('/profile');
        } else {
          setPaymentInfo(undefined);
          setIsQuoteFinal(false);
          const kycErrorFromMessage = getKycErrorFromMessage(error.message);
          if (kycErrorFromMessage) {
            setKycError(kycErrorFromMessage);
          } else {
            setErrorMessage(error.message ?? 'Unknown error');
          }
        }
      })
      .finally(() => {
        if (isRunning && generation === quoteGeneration.current) setIsLoading(undefined);
      });

    return () => {
      isRunning = false;
    };
  }, [useDebounce(validatedData, 500), retryToken]);

  function validateSwap(swap: Swap): void {
    setCustomAmountError(undefined);
    setKycError(undefined);

    // tx errors
    switch (swap.error) {
      case TransactionError.AMOUNT_TOO_LOW:
        setCustomAmountError({
          key: 'screens/payment',
          defaultValue: 'Entered amount is below minimum deposit of {{amount}} {{currency}}',
          interpolation: {
            amount: Utils.formatAmountCrypto(swap.minVolume),
            currency: swap.sourceAsset.name,
          },
          hideInfos: true,
        });
        return;

      case TransactionError.AMOUNT_TOO_HIGH:
        setCustomAmountError({
          key: 'screens/payment',
          defaultValue: 'Entered amount is above maximum deposit of {{amount}} {{currency}}',
          interpolation: {
            amount: Utils.formatAmountCrypto(swap.maxVolume),
            currency: swap.sourceAsset.name,
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
      case TransactionError.IBAN_CURRENCY_MISMATCH:
      case TransactionError.PAYMENT_METHOD_NOT_ALLOWED:
      case TransactionError.TRADING_NOT_ALLOWED:
      case TransactionError.RECOMMENDATION_REQUIRED:
      case TransactionError.EMAIL_REQUIRED:
        setKycError(swap.error);
        return;
    }

    // balance check
    const balance = findBalance(swap.sourceAsset) ?? 0;
    if (balances && swap.amount > Number(balance)) {
      setCustomAmountError({
        key: 'screens/payment',
        defaultValue: 'Entered amount is higher than available balance of {{amount}} {{asset}}',
        interpolation: {
          amount: balance,
          asset: swap.sourceAsset.name,
        },
        hideInfos: false,
      });
      return;
    }
  }

  function validateData({
    amount: amountStr,
    sourceAsset,
    targetAsset,
    targetAmount: targetAmountStr,
    address,
  }: Partial<FormData>): SwapPaymentInfo | undefined {
    const amount = Number(amountStr);
    const targetAmount = Number(targetAmountStr);
    if (sourceAsset != null && targetAsset != null && address != null) {
      return amount > 0
        ? { amount, sourceAsset, targetAsset, receiverAddress: address.address }
        : targetAmount > 0
          ? { sourceAsset, targetAsset, targetAmount, receiverAddress: address.address }
          : undefined;
    }
  }

  function findBalance(asset: Asset): number | undefined {
    return balances?.find((b) => b.asset.id === asset.id)?.amount;
  }

  function findBalanceString(asset: Asset): string {
    const balance = findBalance(asset);
    return balance != null ? Utils.formatAmountCrypto(balance) : '';
  }

  // misc
  function filterAssets(assets: Asset[], filter?: string): Asset[] {
    if (!filter) return assets;

    const allowedAssets = filter.split(',');
    return assets.filter((a) => allowedAssets.some((f) => isSameAsset(a, f)));
  }

  function getPaymentInfoString(paymentInfo: Swap): string {
    return translate(
      'screens/swap',
      'Send the selected amount to the address below. This address can be used multiple times, it is always the same for swaps from {{sourceChain}} to {{asset}} on {{targetChain}}.',
      {
        sourceChain: toString(paymentInfo.sourceAsset.blockchain),
        targetChain: toString(paymentInfo.targetAsset.blockchain),
        asset: paymentInfo.targetAsset.name,
      },
    );
  }

  function onSubmit(_data?: FormData) {
    if (spendClearedByUserRef.current || targetClearedByUserRef.current) return;
    if (!paymentInfo || !isQuoteFinal || kycError || errorMessage || customAmountError?.hideInfos || isProcessing)
      return;
    if (
      (selectedSourceAsset?.category === AssetCategory.PRIVATE ||
        selectedTargetAsset?.category === AssetCategory.PRIVATE) &&
      !flags?.includes('private')
    ) {
      return;
    }
    void handleNext(paymentInfo);
  }

  function setAddress() {
    if (session?.address && addressItems.length > 0) {
      // Prefer URL blockchain, then assetOut chain, then the first address.
      let preferredChain = blockchain;
      if (!preferredChain && assetOut) {
        // Extract blockchain from assetOut (format: Blockchain/AssetName)
        const assetOutBlockchain = assetOut.split('/')[0];
        if (addressItems.some((a) => a.chain === assetOutBlockchain)) {
          preferredChain = assetOutBlockchain as Blockchain;
        }
      }
      const address = addressItems.find((a) => preferredChain && a.chain === preferredChain) ?? addressItems[0];
      setVal('address', address);
    }
  }

  function onAddressSwitch() {
    logout();
    navigate('/connect', { setRedirect: true });
  }

  async function handleNext(paymentInfo: Swap): Promise<void> {
    setIsProcessing(true);
    setErrorMessage(undefined);

    try {
      if (canSendTransaction() && !activeWallet) {
        close(paymentInfo, false);
        return;
      }

      if (canSendTransaction()) {
        await sendTransaction(paymentInfo).then(setSwapTxId);
      }

      setTxDone(true);
    } catch (error: any) {
      const { cancelled, messageKey } = resolveWalletTxError(error);
      if (cancelled) return;
      setErrorMessage(
        messageKey
          ? translate('screens/home', messageKey)
          : translate(
              'screens/swap',
              'Transaction failed. Click Retry to see the deposit address for manual transfer.',
            ),
      );
    } finally {
      setIsProcessing(false);
    }
  }

  function close(swap: Swap, isComplete: boolean) {
    closeServices({ type: CloseType.SWAP, isComplete, swap }, isComplete);
  }

  const rules = Utils.createRules({
    bankAccount: Validations.Required,
    asset: Validations.Required,
    currency: Validations.Required,
    amount: Validations.Required,
  });

  useLayoutOptions({ title: translate('navigation/links', 'Swap'), textStart: true });

  return (
    <>
      {paymentInfo && isTxDone ? (
        <SwapCompletion paymentInfo={paymentInfo} navigateOnClose={true} txId={swapTxId} />
      ) : showsSwitchScreen ? (
        <AddressSwitch onClose={(r) => (r ? onAddressSwitch() : setShowsSwitchScreen(false))} />
      ) : (
        <form
          className="w-full"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
        <Form
          control={control}
          rules={rules}
          errors={{}}
          onSubmit={handleSubmit(onSubmit)}
          translate={translateError}
          hasFormElement={false}
        >
          {sourceAssets && targetAssets && (
            <StyledVerticalStack gap={8} full center className="relative">
              <StyledVerticalStack gap={2} full>
                <h2 className="text-dfxGray-700">{translate('screens/buy', 'You spend')}</h2>
                <StyledHorizontalStack gap={1}>
                  <div className="flex-[3_1_9rem]">
                    <StyledInput
                      type="number"
                      placeholder="0.00"
                      prefix={selectedSourceAsset && selectedSourceAsset.name}
                      name="amount"
                      buttonLabel={availableBalance ? 'MAX' : undefined}
                      buttonClick={() => availableBalance && setVal('amount', `${availableBalance}`)}
                      forceError={
                        (kycError &&
                          [
                            TransactionError.BANK_TRANSACTION_MISSING,
                            TransactionError.BANK_TRANSACTION_OR_VIDEO_MISSING,
                          ].includes(kycError)) ||
                        customAmountError != null
                      }
                      forceErrorMessage={
                        customAmountError &&
                        translate(
                          customAmountError.key,
                          customAmountError.defaultValue,
                          customAmountError.interpolation,
                        )
                      }
                      loading={isLoading === Side.SPEND}
                      disabled={isLoading === Side.SPEND}
                      full
                    />
                  </div>

                  <div className="flex-[1_0_9rem]">
                    <StyledSearchDropdown<Asset>
                      rootRef={rootRef}
                      name="sourceAsset"
                      placeholder={translate('general/actions', 'Select') + '...'}
                      items={sourceAssets.sort((a, b) => {
                        const balanceA = findBalance(a) || 0;
                        const balanceB = findBalance(b) || 0;
                        return balanceB - balanceA;
                      })}
                      labelFunc={(item) => item.name}
                      balanceFunc={findBalanceString}
                      assetIconFunc={(item) => item.name as AssetIconVariant}
                      descriptionFunc={(item) => toString(item.blockchain)}
                      filterFunc={(item: Asset, search?: string | undefined) =>
                        !search || item.name.toLowerCase().includes(search.toLowerCase())
                      }
                      hideBalanceWhenClosed
                      full
                    />
                  </div>
                </StyledHorizontalStack>
              </StyledVerticalStack>

              <StyledVerticalStack gap={2} full>
                <h2 className="text-dfxGray-700">
                  {translate('screens/buy', paymentInfo?.rate === 1 ? 'You get' : 'You get about')}
                </h2>

                <StyledHorizontalStack gap={1}>
                  <div className="flex-[3_1_9rem]">
                    <StyledInput
                      type="number"
                      name="targetAmount"
                      loading={isLoading === Side.GET}
                      disabled={isLoading === Side.GET}
                      full
                    />
                  </div>
                  <div className="flex-[1_0_9rem]">
                    <div className="flex-[1_0_9rem]">
                      <StyledSearchDropdown<Asset>
                        rootRef={rootRef}
                        name="targetAsset"
                        placeholder={translate('general/actions', 'Select') + '...'}
                        items={targetAssets}
                        labelFunc={(item) => item.name}
                        balanceFunc={findBalanceString}
                        assetIconFunc={(item) => item.name as AssetIconVariant}
                        descriptionFunc={(item) => item.description}
                        filterFunc={(item: Asset, search?: string | undefined) =>
                          !search || item.name.toLowerCase().includes(search.toLowerCase())
                        }
                        hideBalanceWhenClosed
                        full
                      />
                    </div>
                  </div>
                </StyledHorizontalStack>

                {!hideTargetSelection && (
                  <StyledDropdown<Address>
                    rootRef={rootRef}
                    name="address"
                    items={addressItems}
                    labelFunc={(item) => blankedAddress(item.addressLabel, { width })}
                    descriptionFunc={(item) => item.label}
                    full
                    forceEnable
                  />
                )}
              </StyledVerticalStack>

              {isLoading ? (
                <StyledVerticalStack center>
                  <StyledLoadingSpinner size={SpinnerSize.LG} />
                </StyledVerticalStack>
              ) : (
                <>
                  {kycError && !customAmountError && <QuoteErrorHint type={TransactionType.SWAP} error={kycError} />}

                  {errorMessage && (
                    <StyledVerticalStack center className="text-center">
                      <ErrorHint message={errorMessage} />

                      <StyledButton
                        width={StyledButtonWidth.MIN}
                        label={translate('general/actions', 'Retry')}
                        onClick={() => setRetryToken((token) => token + 1)}
                        className="mt-4"
                        color={StyledButtonColor.STURDY_WHITE}
                      />
                    </StyledVerticalStack>
                  )}

                  {paymentInfo &&
                    !kycError &&
                    !errorMessage &&
                    !customAmountError?.hideInfos &&
                    ((selectedSourceAsset?.category === AssetCategory.PRIVATE ||
                      selectedTargetAsset?.category === AssetCategory.PRIVATE) &&
                    !flags?.includes('private') ? (
                      <PrivateAssetHint
                        asset={
                          selectedSourceAsset?.category === AssetCategory.PRIVATE
                            ? selectedSourceAsset
                            : selectedTargetAsset
                        }
                      />
                    ) : (
                      <>
                        <ExchangeRate
                          exchangeRate={paymentInfo.exchangeRate}
                          rate={paymentInfo.rate}
                          fees={paymentInfo.fees}
                          feeCurrency={paymentInfo.sourceAsset}
                          from={paymentInfo.sourceAsset}
                          to={paymentInfo.targetAsset}
                          steps={paymentInfo.priceSteps}
                          amountIn={paymentInfo.amount}
                          amountOut={paymentInfo.estimatedAmount}
                          type={TransactionType.SWAP}
                        />

                        <PaymentInformationContent info={paymentInfo} infoText={getPaymentInfoString(paymentInfo)} />

                        <SanctionHint />

                        <div className="w-full leading-none">
                          <StyledLink
                            label={translate(
                              'screens/payment',
                              'Please note that by using this service you automatically accept our terms and conditions. The effective exchange rate is fixed when the money is received and processed by DFX.',
                            )}
                            url={Urls.termsAndConditions}
                            small
                            dark
                          />
                          <StyledButton
                            width={StyledButtonWidth.FULL}
                            label={translate(
                              'screens/sell',
                              canSendTransaction()
                                ? 'Complete transaction in your wallet'
                                : 'Click here once you have issued the transaction',
                            )}
                            onClick={() => onSubmit()}
                            disabled={!isQuoteFinal}
                            caps={false}
                            className="mt-4"
                            isLoading={isProcessing}
                          />
                        </div>
                      </>
                    ))}
                </>
              )}
            </StyledVerticalStack>
          )}
        </Form>
        </form>
      )}
    </>
  );
}
