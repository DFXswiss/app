import {
  ApiError,
  Asset,
  AssetCategory,
  BankAccount,
  Blockchain,
  Fiat,
  Sell,
  SellPaymentInfo,
  TransactionError,
  TransactionType,
  Utils,
  Validations,
  useAsset,
  useAssetContext,
  useAuthContext,
  useBankAccountContext,
  useFiat,
  useSell,
  useSessionContext,
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
import { useEffect, useMemo, useRef, useState } from 'react';
import { FieldPath, FieldPathValue, useForm, useWatch } from 'react-hook-form';
import { BankAccountSelector } from 'src/components/order/bank-account-selector';
import { AddressSwitch } from 'src/components/payment/address-switch';
import { PaymentInformationContent } from 'src/components/payment/payment-info-sell';
import { PrivateAssetHint } from 'src/components/private-asset-hint';
import { addressLabel } from 'src/config/labels';
import { Urls } from 'src/config/urls';
import { useLayoutContext } from 'src/contexts/layout.context';
import { useWindowContext } from 'src/contexts/window.context';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { ErrorHint } from '../components/error-hint';
import { ExchangeRate } from '../components/exchange-rate';
import { SellCompletion } from '../components/payment/sell-completion';
import { QuoteErrorHint } from '../components/quote-error-hint';
import { SanctionHint } from '../components/sanction-hint';
import { CloseType, useAppHandlingContext } from '../contexts/app-handling.context';
import { AssetBalance } from '../contexts/balance.context';
import { useSettingsContext } from '../contexts/settings.context';
import { useWalletContext } from '../contexts/wallet.context';
import { useAppParams } from '../hooks/app-params.hook';
import { useBlockchain } from '../hooks/blockchain.hook';
import useDebounce from '../hooks/debounce.hook';
import { useAddressGuard } from '../hooks/guard.hook';
import { useNavigation } from '../hooks/navigation.hook';
import { useTxHelper } from '../hooks/tx-helper.hook';
import { getKycErrorFromMessage } from '../util/api-error';
import { blankedAddress } from '../util/utils';

enum Side {
  SPEND = 'SPEND',
  GET = 'GET',
}

interface Address {
  address: string;
  label: string;
  chain?: Blockchain;
}

interface FormData {
  bankAccount: BankAccount;
  currency: Fiat;
  asset: Asset;
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

interface ValidatedData extends SellPaymentInfo {
  sideToUpdate?: Side;
}

export default function SellScreen(): JSX.Element {
  useAddressGuard('/login');

  const { translate, translateError, currency: prefCurrency } = useSettingsContext();
  const { isInitialized, closeServices } = useAppHandlingContext();
  const { logout } = useSessionContext();
  const { session } = useAuthContext();
  const { width } = useWindowContext();
  const { bankAccounts, updateAccount } = useBankAccountContext();
  const { blockchain: walletBlockchain, activeWallet, switchBlockchain } = useWalletContext();
  const { getBalances, sendTransaction, canSendTransaction } = useTxHelper();
  const { assets, getAssets } = useAssetContext();
  const { getAsset, isSameAsset } = useAsset();
  const { navigate } = useNavigation();
  const {
    assets: assetFilter,
    assetIn,
    assetOut,
    amountIn,
    amountOut,
    blockchain,
    externalTransactionId,
    flags,
    setParams,
    hideTargetSelection,
    availableBlockchains,
  } = useAppParams();
  const { toDescription, getCurrency, getDefaultCurrency } = useFiat();
  const { currencies, receiveFor } = useSell();
  const sellableCurrencies = useMemo(() => currencies?.filter((c) => c.sellable), [currencies]);
  const { toString } = useBlockchain();
  const { rootRef } = useLayoutContext();

  const [availableAssets, setAvailableAssets] = useState<Asset[]>();
  const [customAmountError, setCustomAmountError] = useState<CustomAmountError>();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [kycError, setKycError] = useState<TransactionError>();
  const [isLoading, setIsLoading] = useState<Side>();
  const [paymentInfo, setPaymentInfo] = useState<Sell>();
  const [isQuoteFinal, setIsQuoteFinal] = useState(false);
  const [balances, setBalances] = useState<AssetBalance[]>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTxDone, setTxDone] = useState<boolean>(false);
  const [sellTxId, setSellTxId] = useState<string>();
  const [bankAccountSelection, setBankAccountSelection] = useState(false);
  const [showsSwitchScreen, setShowsSwitchScreen] = useState(false);
  const [validatedData, setValidatedData] = useState<ValidatedData>();
  const [retryToken, setRetryToken] = useState(0);

  // form
  const { control, handleSubmit, setValue, resetField } = useForm<FormData>({ mode: 'onTouched' });

  const selectedBankAccount = useWatch({ control, name: 'bankAccount' });
  const selectedAsset = useWatch({ control, name: 'asset' });
  const enteredAmount = useWatch({ control, name: 'amount' });
  const selectedCurrency = useWatch({ control, name: 'currency' });
  const selectedTargetAmount = useWatch({ control, name: 'targetAmount' });
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

  const availableBalance = selectedAsset && findBalance(selectedAsset);

  useEffect(() => {
    availableAssets && getBalances(availableAssets, selectedAddress?.address, selectedAddress?.chain).then(setBalances);
  }, [getBalances, availableAssets]);

  // default params
  function setVal(field: FieldPath<FormData>, value: FieldPathValue<FormData, FieldPath<FormData>>) {
    setValue(field, value, { shouldValidate: true });
  }

  const filteredAssets = assets && filterAssets(Array.from(assets.values()).flat(), assetFilter);
  const blockchains = availableBlockchains?.filter((b) => filteredAssets?.some((a) => a.blockchain === b));

  const addressItems: Address[] =
    session?.address && blockchains?.length
      ? [
          ...blockchains.map((b) => ({
            address: addressLabel(session),
            label: toString(b),
            chain: b,
          })),
          {
            address: translate('screens/buy', 'Switch address'),
            label: translate('screens/buy', 'Login with a different address'),
          },
        ]
      : [];

  useEffect(() => {
    const activeBlockchain = walletBlockchain ?? blockchain;
    const blockchains = activeBlockchain ? [activeBlockchain as Blockchain] : availableBlockchains ?? [];
    const blockchainAssets = getAssets(blockchains, { sellable: true, comingSoon: false }).filter(
      (a) => a.category === AssetCategory.PUBLIC || a.name === assetIn,
    );

    const activeAssets = filterAssets(blockchainAssets, assetFilter);
    setAvailableAssets(activeAssets);

    const asset = getAsset(activeAssets, assetIn) ?? (activeBlockchain && activeAssets[0]);
    if (asset) setVal('asset', asset);
  }, [assetIn, getAsset, getAssets, blockchain, walletBlockchain]);

  useEffect(() => {
    const currency =
      getCurrency(sellableCurrencies, assetOut) ??
      getCurrency(sellableCurrencies, prefCurrency?.name) ??
      getDefaultCurrency(sellableCurrencies);
    if (prefCurrency && currency) setVal('currency', currency);
  }, [assetOut, getCurrency, prefCurrency, sellableCurrencies]);

  useEffect(() => {
    if (amountIn) {
      if (!spendClearedByUserRef.current) setVal('amount', amountIn);
    } else if (amountOut) {
      if (!targetClearedByUserRef.current) setVal('targetAmount', amountOut);
    } else if (
      selectedAsset &&
      !enteredAmount &&
      !selectedTargetAmount &&
      !spendClearedByUserRef.current &&
      !targetClearedByUserRef.current
    ) {
      const defaultAmount =
        selectedAsset.name === 'BTC' ? '0.001' : selectedAsset.name === 'ETH' ? '0.1' : '300';
      setVal('amount', defaultAmount);
    }
  }, [amountIn, amountOut, selectedAsset]);

  useEffect(() => setAddress(), [session?.address, translate, addressItems.length]);

  useEffect(() => {
    if (selectedAddress) {
      if (selectedAddress.chain) {
        if (blockchain !== selectedAddress.chain) {
          setParams({ blockchain: selectedAddress.chain });
          switchBlockchain(selectedAddress.chain);
          resetField('asset');
          setAvailableAssets(undefined);
        }
      } else {
        setShowsSwitchScreen(true);
        setAddress();
      }
    }
  }, [selectedAddress]);

  useEffect(() => {
    if (!selectedBankAccount?.preferredCurrency) return;
    const currency = getCurrency(sellableCurrencies, selectedBankAccount.preferredCurrency.name);
    if (currency) setVal('currency', currency);
  }, [selectedBankAccount, sellableCurrencies, getCurrency]);

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
      enteredAmount !== paymentInfo?.amount?.toString() || selectedAsset?.uniqueName !== paymentInfo?.asset.uniqueName;

    const hasSpendData = enteredAmount && selectedAsset;
    const hasGetData = selectedTargetAmount && selectedCurrency && selectedBankAccount;

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
  }, [enteredAmount, selectedAsset]);

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

    const requiresUpdate =
      selectedTargetAmount !== paymentInfo?.estimatedAmount?.toString() ||
      selectedCurrency?.name !== paymentInfo?.currency?.name ||
      selectedBankAccount?.iban !== validatedData?.iban;

    const hasSpendData = enteredAmount && selectedAsset;
    const hasGetData = selectedTargetAmount && selectedCurrency && selectedBankAccount;

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
        const ibanOnlyChange =
          Boolean(enteredAmount) &&
          selectedBankAccount?.iban !== validatedData?.iban &&
          selectedTargetAmount === paymentInfo?.estimatedAmount?.toString() &&
          selectedCurrency?.name === paymentInfo?.currency?.name;
        updateData(ibanOnlyChange ? Side.GET : Side.SPEND);
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
  }, [selectedTargetAmount, selectedCurrency, selectedBankAccount]);

  function updateData(sideToUpdate: Side) {
    const data = validateData({
      amount: sideToUpdate === Side.GET ? enteredAmount : undefined,
      currency: selectedCurrency,
      asset: selectedAsset,
      targetAmount: sideToUpdate === Side.SPEND || enteredAmount === undefined ? selectedTargetAmount : undefined,
      bankAccount: selectedBankAccount,
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
    const data: SellPaymentInfo = { ...validatedData, externalTransactionId };

    setIsLoading(validatedData.sideToUpdate);
    receiveFor(data)
      .then((sell) => {
        if (!isRunning || !sell || generation !== quoteGeneration.current) return;
        validateSell(sell);
        setPaymentInfo(sell);
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

  function validateSell(sell: Sell): void {
    setCustomAmountError(undefined);
    setKycError(undefined);

    // tx errors
    switch (sell.error) {
      case TransactionError.AMOUNT_TOO_LOW:
        setCustomAmountError({
          key: 'screens/payment',
          defaultValue: 'Entered amount is below minimum deposit of {{amount}} {{currency}}',
          interpolation: {
            amount: Utils.formatAmountCrypto(sell.minVolume),
            currency: sell.asset.name,
          },
          hideInfos: true,
        });
        return;

      case TransactionError.AMOUNT_TOO_HIGH:
        setCustomAmountError({
          key: 'screens/payment',
          defaultValue: 'Entered amount is above maximum deposit of {{amount}} {{currency}}',
          interpolation: {
            amount: Utils.formatAmountCrypto(sell.maxVolume),
            currency: sell.asset.name,
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
        setKycError(sell.error);
        return;
    }

    // balance check
    const balance = findBalance(sell.asset) ?? 0;
    if (balances && sell.amount > Number(balance)) {
      setCustomAmountError({
        key: 'screens/payment',
        defaultValue: 'Entered amount is higher than available balance of {{amount}} {{asset}}',
        interpolation: {
          amount: balance,
          asset: sell.asset.name,
        },
        hideInfos: false,
      });
      return;
    }
  }

  function validateData({
    amount: amountStr,
    currency,
    asset,
    targetAmount: targetAmountStr,
    bankAccount,
  }: Partial<FormData>): SellPaymentInfo | undefined {
    const amount = Number(amountStr);
    const targetAmount = Number(targetAmountStr);
    if (asset != null && currency != null && bankAccount != null) {
      return amount > 0
        ? { amount, currency, asset, iban: bankAccount.iban }
        : targetAmount > 0
        ? { currency, asset, targetAmount, iban: bankAccount.iban }
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

  async function updateBankAccount(): Promise<BankAccount> {
    return updateAccount(selectedBankAccount.id, { preferredCurrency: selectedCurrency as Fiat });
  }

  function getPaymentInfoString(paymentInfo: Sell, selectedBankAccount: BankAccount): string {
    return (
      paymentInfo &&
      selectedBankAccount &&
      translate(
        'screens/sell',
        'Send the selected amount to the address below. This address can be used multiple times, it is always the same for payouts from {{chain}} to your IBAN {{iban}} in {{currency}}.',
        {
          chain: toString(paymentInfo.asset.blockchain),
          currency: paymentInfo.currency.name,
          iban: Utils.formatIban(selectedBankAccount.iban) ?? '',
        },
      )
    );
  }

  // misc
  function filterAssets(assets: Asset[], filter?: string): Asset[] {
    if (!filter) return assets;

    const allowedAssets = filter.split(',');
    return assets.filter((a) => allowedAssets.some((f) => isSameAsset(a, f)));
  }

  function onSubmit(_data?: FormData) {
    if (spendClearedByUserRef.current || targetClearedByUserRef.current) return;
    if (!paymentInfo || !isQuoteFinal || kycError || errorMessage || customAmountError?.hideInfos || isProcessing)
      return;
    if (selectedAsset?.category === AssetCategory.PRIVATE && !flags?.includes('private')) return;
    void handleNext(paymentInfo);
  }

  function setAddress() {
    if (isInitialized && session?.address && addressItems) {
      const address = addressItems.find((a) => blockchain && a.chain === blockchain) ?? addressItems[0];
      setVal('address', address);
    }
  }

  function onAddressSwitch() {
    logout();
    navigate('/connect', { setRedirect: true });
  }

  async function handleNext(paymentInfo: Sell): Promise<void> {
    setIsProcessing(true);
    setErrorMessage(undefined);

    try {
      await updateBankAccount();

      if (canSendTransaction() && !activeWallet) {
        closeServices({ type: CloseType.SELL, isComplete: false, sell: paymentInfo }, false);
        return;
      }

      if (canSendTransaction()) {
        await sendTransaction(paymentInfo).then(setSellTxId);
      }
      setTxDone(true);
    } catch (error: any) {
      // User rejected in wallet - silently return, user stays on form
      if (error.code === 4001) return;
      // Other errors - show message, user can click Retry to see deposit address for manual transfer
      setErrorMessage(translate('screens/sell', 'Transaction failed. Click Retry to see the deposit address for manual transfer.'));
    } finally {
      setIsProcessing(false);
    }
  }

  const rules = Utils.createRules({
    bankAccount: Validations.Required,
    asset: Validations.Required,
    currency: Validations.Required,
    amount: Validations.Required,
  });

  useLayoutOptions({
    title: bankAccountSelection
      ? translate('screens/sell', 'Select payment account')
      : translate('navigation/links', 'Sell'),
    onBack: bankAccountSelection ? () => setBankAccountSelection(false) : undefined,
    textStart: true,
  });

  return (
    <>
      {showsSwitchScreen ? (
        <AddressSwitch onClose={(r) => (r ? onAddressSwitch() : setShowsSwitchScreen(false))} />
      ) : paymentInfo && isTxDone ? (
        <SellCompletion paymentInfo={paymentInfo} navigateOnClose={true} txId={sellTxId} />
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
          {availableAssets && sellableCurrencies && bankAccounts && (
            <StyledVerticalStack gap={8} full center className="relative">
              <StyledVerticalStack gap={2} full>
                <h2 className="text-dfxGray-700">{translate('screens/buy', 'You spend')}</h2>
                <StyledHorizontalStack gap={1}>
                  <div className="flex-[3_1_9rem]">
                    <StyledInput
                      type="number"
                      placeholder="0.00"
                      prefix={selectedAsset && selectedAsset.name}
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
                      name="asset"
                      placeholder={translate('general/actions', 'Select') + '...'}
                      items={availableAssets.sort((a, b) => {
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
                {!hideTargetSelection && (
                  <StyledDropdown<Address>
                    rootRef={rootRef}
                    name="address"
                    items={addressItems}
                    labelFunc={(item) => blankedAddress(item.address, { width })}
                    descriptionFunc={(item) => item.label}
                    full
                    forceEnable
                  />
                )}
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
                    <StyledDropdown<Fiat>
                      rootRef={rootRef}
                      name="currency"
                      placeholder={translate('general/actions', 'Select') + '...'}
                      items={sellableCurrencies}
                      labelFunc={(item) => item.name}
                      descriptionFunc={(item) => toDescription(item)}
                      full
                    />
                  </div>
                </StyledHorizontalStack>
                <BankAccountSelector
                  value={selectedBankAccount}
                  onChange={(account) => setVal('bankAccount', account)}
                  placeholder={translate('screens/sell', 'Add or select your IBAN')}
                  isModalOpen={bankAccountSelection}
                  onModalToggle={setBankAccountSelection}
                />
              </StyledVerticalStack>

              {isLoading && !paymentInfo ? (
                <StyledVerticalStack center>
                  <StyledLoadingSpinner size={SpinnerSize.LG} />
                </StyledVerticalStack>
              ) : (
                <>
                  {kycError && !customAmountError && <QuoteErrorHint type={TransactionType.SELL} error={kycError} />}

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
                    (selectedAsset?.category === AssetCategory.PRIVATE && !flags?.includes('private') ? (
                      <PrivateAssetHint asset={selectedAsset} />
                    ) : (
                      <>
                        <ExchangeRate
                          exchangeRate={1 / paymentInfo.exchangeRate}
                          rate={1 / paymentInfo.rate}
                          fees={paymentInfo.feesTarget}
                          feeCurrency={paymentInfo.currency}
                          from={paymentInfo.currency}
                          to={paymentInfo.asset}
                          steps={paymentInfo.priceSteps}
                          amountIn={paymentInfo.amount}
                          amountOut={paymentInfo.estimatedAmount}
                          type={TransactionType.SELL}
                        />

                        <PaymentInformationContent
                          info={paymentInfo}
                          infoText={getPaymentInfoString(paymentInfo, selectedBankAccount)}
                        />

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
