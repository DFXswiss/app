import {
  ApiError,
  Asset,
  BankAccount,
  Fiat,
  Sell,
  SellPaymentInfo,
  TransactionError,
  TransactionType,
  Utils,
  Validations,
  useAsset,
  useAssetContext,
  useBankAccount,
  useBankAccountContext,
  useFiat,
  useSell,
  useTransaction,
} from '@dfx.swiss/react';
import { Urls } from 'src/config/urls';
import {
  AlignContent,
  IconColor,
  SpinnerSize,
  SpinnerVariant,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledDataTable,
  StyledDataTableRow,
  StyledInfoText,
  StyledInfoTextSize,
  StyledLink,
  StyledLoadingSpinner,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { useEffect, useState } from 'react';
import { PaymentInformationContent } from 'src/components/payment/payment-info-sell';
import { useWalletContext } from 'src/contexts/wallet.context';
import { useCountdown } from 'src/hooks/countdown.hook';
import { useTxHelper } from 'src/hooks/tx-helper.hook';
import { ErrorHint } from '../components/error-hint';
import { SellCompletion } from '../components/payment/sell-completion';
import { QuoteErrorHint } from '../components/quote-error-hint';
import { CloseType, useAppHandlingContext } from '../contexts/app-handling.context';
import { useSettingsContext } from '../contexts/settings.context';
import { useAppParams } from '../hooks/app-params.hook';
import { useAddressGuard } from '../hooks/guard.hook';
import { useLayoutOptions } from '../hooks/layout-config.hook';

export default function SellInfoScreen(): JSX.Element {
  useAddressGuard();

  const { allowedCountries, translate } = useSettingsContext();
  const { bankAccounts, createAccount } = useBankAccountContext();
  const { getAccount } = useBankAccount();
  const {
    assetIn,
    assetOut,
    amountIn,
    amountOut,
    bankAccount: bankAccountParam,
    externalTransactionId,
    availableBlockchains,
  } = useAppParams();
  const { getAssets } = useAssetContext();
  const { getAsset } = useAsset();
  const { getCurrency } = useFiat();
  const { currencies, receiveFor } = useSell();
  const { closeServices } = useAppHandlingContext();
  const { sendTransaction, canSendTransaction } = useTxHelper();
  const { activeWallet } = useWalletContext();
  const { getTransactionByRequestId } = useTransaction();
  const { timer, remainingSeconds, startTimer } = useCountdown();

  const [isLoading, setIsLoading] = useState(true);
  const [paymentInfo, setPaymentInfo] = useState<Sell>();
  const [showsCompletion, setShowsCompletion] = useState(false);
  const [asset, setAsset] = useState<Asset>();
  const [currency, setCurrency] = useState<Fiat>();
  const [bankAccount, setBankAccount] = useState<BankAccount>();
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [customAmountError, setCustomAmountError] = useState<string>();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [kycError, setKycError] = useState<TransactionError>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [sellTxId, setSellTxId] = useState<string>();

  // default params
  useEffect(() => {
    const blockchains = availableBlockchains ?? [];
    const blockchainAssets = getAssets(blockchains, { sellable: true, comingSoon: false });

    if (!asset) setAsset(getAsset(blockchainAssets, assetIn));
  }, [assetIn, getAsset, getAssets]);

  useEffect(() => {
    if (!currency) setCurrency(getCurrency(currencies, assetOut));
  }, [assetOut, getCurrency, currencies]);

  useEffect(() => {
    if (bankAccountParam && bankAccounts !== undefined) {
      const account = getAccount(bankAccounts, bankAccountParam);
      if (account) {
        setBankAccount(account);
      } else if (!isCreatingAccount) {
        const ibanIsValid = Validations.Iban(allowedCountries).validate(bankAccountParam);
        if (ibanIsValid !== true) {
          setErrorMessage(`Invalid IBAN: ${ibanIsValid}`);
          return;
        }

        setIsCreatingAccount(true);
        createAccount({ iban: bankAccountParam })
          .then(setBankAccount)
          .catch(() => setErrorMessage(translate('screens/sell', 'The bank account could not be added.')))
          .finally(() => setIsCreatingAccount(false));
      }
    }
  }, [bankAccountParam, getAccount, bankAccounts, allowedCountries]);

  useEffect(() => {
    if (!paymentInfo || isLoading) return;
    const priceTimestamp = new Date(paymentInfo.timestamp);
    const expiration = priceTimestamp.setMinutes(priceTimestamp.getMinutes() + 15);
    startTimer(new Date(expiration));

    const checkTransactionInterval = setInterval(() => {
      getTransactionByRequestId(paymentInfo.id)
        .then((tx) => {
          setSellTxId(tx.inputTxId);
          setShowsCompletion(true);
          clearInterval(checkTransactionInterval);
        })
        .catch(() => {
          // ignore 404 Not Found
        });
    }, 5000);

    return () => {
      clearInterval(checkTransactionInterval);
    };
  }, [paymentInfo, isLoading]);

  useEffect(() => {
    if (remainingSeconds <= 1) fetchData();
  }, [remainingSeconds]);

  useEffect(() => fetchData(), [asset, currency, bankAccount, amountIn, amountOut]);

  function fetchData() {
    if (!(asset && currency && bankAccount && (amountIn || amountOut))) {
      const inputIsComplete = (amountIn || amountOut) && assetIn && assetOut && bankAccountParam;
      !inputIsComplete && setErrorMessage('Missing required information');
      return;
    }

    setErrorMessage(undefined);

    const request: SellPaymentInfo = {
      asset,
      currency,
      iban: bankAccount?.iban,
      externalTransactionId,
      exactPrice: true,
    };
    if (amountIn) {
      request.amount = +amountIn;
    } else if (amountOut) {
      request.targetAmount = +amountOut;
    }

    setIsLoading(true);
    receiveFor(request)
      .then(validateSell)
      .then(setPaymentInfo)
      .catch((error: ApiError) => {
        setPaymentInfo(undefined);
        setErrorMessage(error.message ?? 'Unknown error');
      })
      .finally(() => setIsLoading(false));
  }

  function validateSell(sell: Sell): Sell | undefined {
    switch (sell.error) {
      case TransactionError.AMOUNT_TOO_LOW:
        setCustomAmountError(
          translate('screens/payment', 'Entered amount is below minimum deposit of {{amount}} {{currency}}', {
            amount: Utils.formatAmountCrypto(sell.minVolume),
            currency: sell.asset.name,
          }),
        );
        return undefined;

      case TransactionError.AMOUNT_TOO_HIGH:
        setCustomAmountError(
          translate('screens/payment', 'Entered amount is above maximum deposit of {{amount}} {{currency}}', {
            amount: Utils.formatAmountCrypto(sell.maxVolume),
            currency: sell.asset.name,
          }),
        );
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
        return undefined;
    }

    setCustomAmountError(undefined);
    setKycError(undefined);

    return sell;
  }

  async function handleNext(paymentInfo: Sell): Promise<void> {
    setIsProcessing(true);

    if (canSendTransaction() && !activeWallet) {
      closeServices({ type: CloseType.SELL, isComplete: false, sell: paymentInfo }, false);
      return;
    }

    try {
      if (canSendTransaction()) await sendTransaction(paymentInfo).then(setSellTxId);
      setShowsCompletion(true);
    } finally {
      setIsProcessing(false);
    }
  }

  function getPaymentInfoString(paymentInfo: Sell, selectedBankAccount: BankAccount): string {
    return (
      paymentInfo &&
      selectedBankAccount &&
      translate('screens/payment', 'Please send the specified amount to the address below.')
    );
  }

  useLayoutOptions({ textStart: true, backButton: false });

  return (
    <>
      {showsCompletion && paymentInfo ? (
        <SellCompletion paymentInfo={paymentInfo} navigateOnClose={false} txId={sellTxId} />
      ) : errorMessage ? (
        <StyledVerticalStack center className="text-center">
          <ErrorHint message={errorMessage} />

          <StyledButton
            width={StyledButtonWidth.MIN}
            label={translate('general/actions', 'Retry')}
            onClick={fetchData}
            className="mt-4"
            color={StyledButtonColor.STURDY_WHITE}
          />
        </StyledVerticalStack>
      ) : !paymentInfo ? (
        <StyledLoadingSpinner size={SpinnerSize.LG} />
      ) : customAmountError ? (
        <>
          <StyledInfoText invertedIcon>{customAmountError}</StyledInfoText>
          <StyledButton
            width={StyledButtonWidth.FULL}
            label={translate('general/actions', 'Close')}
            onClick={() => closeServices({ type: CloseType.CANCEL }, false)}
          />
        </>
      ) : kycError ? (
        <QuoteErrorHint type={TransactionType.SELL} error={kycError} />
      ) : (
        bankAccount &&
        paymentInfo && (
          <>
            <StyledVerticalStack gap={8} full>
              <StyledVerticalStack gap={1} full>
                <StyledDataTable
                  label={translate('screens/payment', 'Transaction Details')}
                  alignContent={AlignContent.RIGHT}
                  showBorder
                  minWidth={false}
                >
                  <StyledDataTableRow label={translate('screens/payment', 'Amount')} isLoading={isLoading}>
                    {`${paymentInfo.estimatedAmount.toFixed(2)} ${paymentInfo.currency.name}`}
                  </StyledDataTableRow>
                  <StyledDataTableRow
                    label={`${translate('screens/payment', 'Beneficiary bank account')} (${translate(
                      'screens/payment',
                      'IBAN',
                    )})`}
                  >
                    {Utils.formatIban(paymentInfo.beneficiary.iban)}
                  </StyledDataTableRow>
                  {paymentInfo.beneficiary.name && (
                    <StyledDataTableRow label={translate('screens/payment', 'Beneficiary name')}>
                      {paymentInfo.beneficiary.name}
                    </StyledDataTableRow>
                  )}
                </StyledDataTable>
                <StyledInfoText
                  textSize={StyledInfoTextSize.XS}
                  iconColor={IconColor.GRAY}
                  isLoading={!(timer.minutes > 0 || timer.seconds > 0)}
                  discreet
                >
                  {translate(
                    'screens/payment',
                    'The exchange rate of {{rate}} {{currency}}/{{asset}} is fixed for {{timer}}, after which it will be recalculated.',
                    {
                      rate: Utils.formatAmount(1 / paymentInfo.rate),
                      currency: paymentInfo.currency.name,
                      asset: paymentInfo.asset.name,
                      timer: `${timer.minutes}m ${timer.seconds}s`,
                    },
                  )}
                </StyledInfoText>
              </StyledVerticalStack>

              {!isLoading ? (
                <PaymentInformationContent
                  info={paymentInfo}
                  infoText={getPaymentInfoString(paymentInfo, bankAccount)}
                  showAmount={true}
                />
              ) : (
                <div className="flex w-full items-center justify-center">
                  <StyledLoadingSpinner size={SpinnerSize.LG} variant={SpinnerVariant.LIGHT_MODE} />
                </div>
              )}
            </StyledVerticalStack>

            {!isLoading && (
              <>
                <div className="pt-2 w-full leading-none">
                  <StyledLink
                    label={translate(
                      'screens/payment',
                      'Please note that by using this service you automatically accept our terms and conditions.',
                    )}
                    url={Urls.termsAndConditions}
                    small
                    dark
                  />
                </div>

                {canSendTransaction() && (
                  <div className="pt-2 w-full leading-none">
                    <StyledButton
                      width={StyledButtonWidth.FULL}
                      label={translate('screens/sell', 'Complete transaction in your wallet')}
                      onClick={() => handleNext(paymentInfo)}
                      caps={false}
                      className="mt-4"
                      isLoading={isProcessing}
                    />
                  </div>
                )}
              </>
            )}
          </>
        )
      )}
    </>
  );
}
