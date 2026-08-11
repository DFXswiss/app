import {
  ApiError,
  Asset,
  Buy,
  BuyPaymentInfo,
  Fiat,
  FiatPaymentMethod,
  TransactionError,
  TransactionType,
  Utils,
  useAsset,
  useAssetContext,
  useBuy,
  useFiat,
  useUserContext,
} from '@dfx.swiss/react';
import {
  SpinnerSize,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledInfoText,
  StyledLink,
  StyledLoadingSpinner,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { useEffect, useRef, useState } from 'react';
import { Urls } from 'src/config/urls';
import { PaymentInformationContent } from 'src/components/payment/payment-info-buy';
import { ErrorHint } from '../components/error-hint';
import { BuyCompletion } from '../components/payment/buy-completion';
import { QuoteErrorHint } from '../components/quote-error-hint';
import { CloseType, useAppHandlingContext } from '../contexts/app-handling.context';
import { useLayoutContext } from '../contexts/layout.context';
import { useSettingsContext } from '../contexts/settings.context';
import { useWalletContext } from '../contexts/wallet.context';
import { useAppParams } from '../hooks/app-params.hook';
import { useAddressGuard } from '../hooks/guard.hook';
import { useLayoutOptions } from '../hooks/layout-config.hook';
import { usePersonalIbanSelection } from '../hooks/personal-iban.hook';
import { getKycErrorFromMessage } from '../util/api-error';
import {
  getPersonalIbanErrorMessage,
  getPersonalIbanKycMessage,
  isExplicitFrickPersonalIbanRequest,
  isKycRequiredMessage,
  isPersonalIbanApplicable,
  isUnrecognizedPersonalIbanSelector,
  isVerifiedFrickPersonalIbanResponse,
  toPersonalIbanProviderRequest,
} from '../util/personal-iban';

export default function BuyInfoScreen(): JSX.Element {
  useAddressGuard();

  const { translate } = useSettingsContext();
  const { user } = useUserContext();
  const {
    assetIn,
    assetOut,
    amountIn,
    amountOut,
    externalTransactionId,
    availableBlockchains,
  } = useAppParams();
  const {
    requestedPersonalIban,
    personalIban,
    hasAuthenticatedCustomer,
  } = usePersonalIbanSelection();
  const { getAssets } = useAssetContext();
  const { getAsset } = useAsset();
  const { getCurrency } = useFiat();
  const { currencies, receiveFor } = useBuy();
  const { closeServices } = useAppHandlingContext();
  const { isInitialized: isWalletInitialized } = useWalletContext();
  const { scrollToTop } = useLayoutContext();

  const [isLoading, setIsLoading] = useState(true);
  const [paymentInfo, setPaymentInfo] = useState<Buy>();
  const [showsCompletion, setShowsCompletion] = useState(false);
  const [asset, setAsset] = useState<Asset>();
  const [currency, setCurrency] = useState<Fiat>();
  const [customAmountError, setCustomAmountError] = useState<string>();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [kycError, setKycError] = useState<TransactionError>();
  const [kycMessageOverride, setKycMessageOverride] = useState<string>();
  // Bumps to re-run the guarded fetch from the Retry button without a second unguarded code path.
  const [retryToken, setRetryToken] = useState(0);
  // Explicit acknowledgement before showing ordinary details when the selector is set but
  // inapplicable or the Frick response failed compatibility checks (A2 / B1 / C1).
  const [continueWithoutPersonalIban, setContinueWithoutPersonalIban] = useState(false);
  // Suppress an unrecognized selector so the customer can continue with an ordinary quote (A3).
  const [suppressPersonalIban, setSuppressPersonalIban] = useState(false);

  const quoteGeneration = useRef(0);

  const effectivePersonalIban = suppressPersonalIban ? undefined : personalIban;
  const personalIbanSelector = suppressPersonalIban
    ? undefined
    : requestedPersonalIban;
  const isPersonalIbanEligible = isPersonalIbanApplicable(
    currency?.name,
    FiatPaymentMethod.BANK,
  );
  const hasApplicableFrickRequest =
    isPersonalIbanEligible &&
    isExplicitFrickPersonalIbanRequest(personalIbanSelector);
  const shouldWaitForApplicableFrickCustomer =
    hasApplicableFrickRequest &&
    (!isWalletInitialized || !hasAuthenticatedCustomer);

  // default params
  useEffect(() => {
    const blockchains = availableBlockchains ?? [];
    const blockchainAssets = getAssets(blockchains, { buyable: true, comingSoon: false });

    if (!asset) setAsset(getAsset(blockchainAssets, assetOut));
  }, [assetOut, getAsset, getAssets]);

  useEffect(() => {
    if (!currency) setCurrency(getCurrency(currencies, assetIn));
  }, [assetIn, getCurrency, currencies]);

  // Reset acknowledgement / suppression when the live selector or quote inputs change.
  useEffect(() => {
    setContinueWithoutPersonalIban(false);
    setSuppressPersonalIban(false);
  }, [requestedPersonalIban, asset, currency, amountIn, amountOut]);

  // Race-protected quote fetch: a stale response must never overwrite a newer one after
  // personalIban / inputs change at runtime (widget attribute, browser back/forward).
  useEffect(() => {
    let isRunning = true;
    const generation = ++quoteGeneration.current;

    if (shouldWaitForApplicableFrickCustomer) {
      setPaymentInfo(undefined);
      setErrorMessage(undefined);
      setKycError(undefined);
      setKycMessageOverride(undefined);
      setIsLoading(false);
      return () => {
        isRunning = false;
      };
    }

    if (!(asset && currency && (amountIn || amountOut))) {
      const inputIsComplete = (amountIn || amountOut) && assetIn && assetOut;
      if (!inputIsComplete) setErrorMessage('Missing required information');
      return () => {
        isRunning = false;
      };
    }

    setErrorMessage(undefined);
    setKycError(undefined);
    setKycMessageOverride(undefined);
    setPaymentInfo(undefined);

    const requestPersonalIbanProvider = isPersonalIbanEligible
      ? toPersonalIbanProviderRequest(effectivePersonalIban).personalIbanProvider
      : undefined;
    // Feature-specific errors apply only to a request that actually carried the provider.
    // personalIbanSelector keeps the raw requested value even when ineligible or unrecognized;
    // effectivePersonalIban reflects an explicitly recognized Frick selector (subject to
    // suppression), but is NOT filtered by currency/payment-method eligibility — that check
    // (isPersonalIbanEligible) is computed separately and re-applied at each call site above.
    const personalIbanErrorApplies = requestPersonalIbanProvider !== undefined;

    if (isUnrecognizedPersonalIbanSelector(personalIbanSelector)) {
      const personalIbanErrorText = getPersonalIbanErrorMessage('PersonalIbanProviderUnsupported');
      if (generation === quoteGeneration.current) {
        setPaymentInfo(undefined);
        setErrorMessage(
          personalIbanErrorText
            ? translate('screens/payment', personalIbanErrorText)
            : translate('screens/payment', 'The requested personal IBAN provider is not recognized.'),
        );
        setIsLoading(false);
      }
      return () => {
        isRunning = false;
      };
    }

    const request: BuyPaymentInfo = {
      asset,
      currency,
      externalTransactionId,
      ...(requestPersonalIbanProvider !== undefined
        ? { personalIbanProvider: requestPersonalIbanProvider }
        : {}),
    };
    if (amountIn) {
      request.amount = +amountIn;
    } else if (amountOut) {
      request.targetAmount = +amountOut;
    }

    setIsLoading(true);
    receiveFor(request)
      .then((buy) => {
        if (!isRunning || generation !== quoteGeneration.current) return;
        setPaymentInfo(validateBuy(buy));
      })
      .catch((error: ApiError) => {
        if (!isRunning || generation !== quoteGeneration.current) return;
        setPaymentInfo(undefined);
        // KycRequired with an actual selector → action-capable KYC path + feature explanation (A3/B3).
        if (personalIbanErrorApplies && isKycRequiredMessage(error.message)) {
          setKycError(TransactionError.KYC_REQUIRED);
          setKycMessageOverride(translate('screens/payment', getPersonalIbanKycMessage()));
          setErrorMessage(undefined);
          return;
        }
        const personalIbanErrorText = personalIbanErrorApplies
          ? getPersonalIbanErrorMessage(error.message)
          : undefined;
        if (personalIbanErrorText) {
          setErrorMessage(translate('screens/payment', personalIbanErrorText));
        } else {
          const kycErrorFromMessage = getKycErrorFromMessage(error.message);
          if (kycErrorFromMessage) {
            setKycError(kycErrorFromMessage);
            setKycMessageOverride(undefined);
          } else {
            setErrorMessage(error.message ?? 'Unknown error');
          }
        }
      })
      .finally(() => {
        if (isRunning && generation === quoteGeneration.current) setIsLoading(false);
      });

    return () => {
      isRunning = false;
    };
  }, [
    asset,
    currency,
    amountIn,
    amountOut,
    effectivePersonalIban,
    personalIbanSelector,
    shouldWaitForApplicableFrickCustomer,
    retryToken,
  ]);

  function validateBuy(buy: Buy): Buy | undefined {
    setCustomAmountError(undefined);
    setKycError(undefined);
    setKycMessageOverride(undefined);

    switch (buy.error) {
      case TransactionError.AMOUNT_TOO_LOW:
        setCustomAmountError(
          translate('screens/payment', 'Entered amount is below minimum deposit of {{amount}} {{currency}}', {
            amount: Utils.formatAmount(buy.minVolume),
            currency: buy.currency.name,
          }),
        );
        return undefined;

      case TransactionError.AMOUNT_TOO_HIGH:
        setCustomAmountError(
          translate('screens/payment', 'Entered amount is above maximum deposit of {{amount}} {{currency}}', {
            amount: Utils.formatAmount(buy.maxVolume),
            currency: buy.currency.name,
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
        setKycError(buy.error);
        return undefined;
    }

    return buy;
  }

  function handleContinueWithoutPersonalIban() {
    if (requestedFrick && !verifiedFrick) {
      // Discard the unverifiable selector-backed response before fetching the promised standard
      // payment details. The selector-free response is the only one allowed back into the view.
      setPaymentInfo(undefined);
      setContinueWithoutPersonalIban(false);
      setSuppressPersonalIban(true);
    } else {
      // Inapplicable offers were already requested without a selector.
      setContinueWithoutPersonalIban(true);
    }
  }

  const requestedFrick =
    isPersonalIbanApplicable(currency?.name, FiatPaymentMethod.BANK) &&
    isExplicitFrickPersonalIbanRequest(effectivePersonalIban);
  const verifiedFrick = paymentInfo != null && isVerifiedFrickPersonalIbanResponse(paymentInfo);
  const showBank = requestedFrick && verifiedFrick;

  // Selector present but not used for this offer (inapplicable currency/method), or Frick
  // request whose response failed compatibility — require explicit continue (A2 / B1 / C1).
  const needsPersonalIbanAcknowledgement =
    paymentInfo != null &&
    personalIbanSelector !== undefined &&
    !continueWithoutPersonalIban &&
    ((!isPersonalIbanApplicable(paymentInfo.currency.name, FiatPaymentMethod.BANK) &&
      !isPersonalIbanApplicable(currency?.name, FiatPaymentMethod.BANK)) ||
      (requestedFrick && !verifiedFrick));

  const isUnrecognizedBlocked =
    isUnrecognizedPersonalIbanSelector(personalIbanSelector) &&
    errorMessage != null;

  useLayoutOptions({ textStart: true, backButton: false });

  return (
    <>
      {showsCompletion && paymentInfo ? (
        <BuyCompletion user={user} paymentInfo={paymentInfo} navigateOnClose={false} />
      ) : isUnrecognizedBlocked ? (
        <StyledVerticalStack center className="text-center" gap={4}>
          <ErrorHint message={errorMessage} />
          <StyledButton
            width={StyledButtonWidth.FULL}
            label={translate('screens/payment', 'Continue without personal IBAN')}
            onClick={() => setSuppressPersonalIban(true)}
            color={StyledButtonColor.STURDY_WHITE}
          />
          <StyledButton
            width={StyledButtonWidth.FULL}
            label={translate('general/actions', 'Close')}
            onClick={() => closeServices({ type: CloseType.CANCEL }, false)}
          />
        </StyledVerticalStack>
      ) : errorMessage ? (
        <StyledVerticalStack center className="text-center">
          <ErrorHint message={errorMessage} />

          <StyledButton
            width={StyledButtonWidth.MIN}
            label={translate('general/actions', 'Retry')}
            onClick={() => setRetryToken((t) => t + 1)}
            className="mt-4"
            color={StyledButtonColor.STURDY_WHITE}
          />
          <StyledButton
            width={StyledButtonWidth.FULL}
            label={translate('general/actions', 'Close')}
            onClick={() => closeServices({ type: CloseType.CANCEL }, false)}
          />
        </StyledVerticalStack>
      ) : isLoading ? (
        <div className="mt-4">
          <StyledLoadingSpinner size={SpinnerSize.LG} />
        </div>
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
        <QuoteErrorHint type={TransactionType.BUY} error={kycError} message={kycMessageOverride} />
      ) : needsPersonalIbanAcknowledgement ? (
        <StyledVerticalStack center className="text-center" gap={4}>
          <StyledInfoText invertedIcon>
            {requestedFrick && !verifiedFrick
              ? translate(
                  'screens/payment',
                  'The personal IBAN response could not be verified for this offer. You can continue with the standard payment details, or cancel.',
                )
              : translate(
                  'screens/payment',
                  'Your requested personal IBAN is only available for EUR and CHF bank transfers, so it was not used for this offer.',
                )}
          </StyledInfoText>
          <StyledButton
            width={StyledButtonWidth.FULL}
            label={translate('screens/payment', 'Continue without personal IBAN')}
            onClick={handleContinueWithoutPersonalIban}
            color={StyledButtonColor.STURDY_WHITE}
          />
          <StyledButton
            width={StyledButtonWidth.FULL}
            label={translate('general/actions', 'Close')}
            onClick={() => closeServices({ type: CloseType.CANCEL }, false)}
          />
        </StyledVerticalStack>
      ) : (
        paymentInfo && (
          <>
            <PaymentInformationContent info={paymentInfo} showBank={showBank} />

            {effectivePersonalIban !== undefined &&
              !isPersonalIbanApplicable(paymentInfo.currency.name, FiatPaymentMethod.BANK) && (
                <StyledInfoText invertedIcon>
                  {translate(
                    'screens/payment',
                    'Your requested personal IBAN is only available for EUR and CHF bank transfers, so it was not used for this offer.',
                  )}
                </StyledInfoText>
              )}

            <div className="pt-4 leading-none">
              <StyledLink
                label={translate(
                  'screens/payment',
                  'Please note that by using this service you automatically accept our terms and conditions. The effective exchange rate is fixed when the money is received and processed by DFX.',
                )}
                url={Urls.termsAndConditions}
                small
                dark
              />
            </div>

            <StyledButton
              width={StyledButtonWidth.FULL}
              label={translate('screens/buy', 'Click here once you have issued the transfer')}
              onClick={() => {
                setShowsCompletion(true);
                scrollToTop();
              }}
              caps={false}
              className="mt-4"
            />
          </>
        )
      )}
    </>
  );
}
