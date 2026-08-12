import {
  ApiError,
  Asset,
  Buy,
  BuyPaymentInfo,
  Fiat,
  FiatPaymentMethod,
  PersonalIbanProvider,
  TransactionError,
  TransactionType,
  Utils,
  VirtualIban,
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
  getYapealAlternative,
  isExplicitPersonalIbanRequest,
  isKycRequiredMessage,
  isPersonalIbanApplicable,
  isUnrecognizedPersonalIbanSelector,
  isVerifiedFrickPersonalIbanResponse,
  isVerifiedYapealPersonalIbanResponse,
  toPersonalIbanProviderRequest,
} from '../util/personal-iban';

export default function BuyInfoScreen(): JSX.Element {
  useAddressGuard();

  const { translate } = useSettingsContext();
  const { user, isUserLoading } = useUserContext();
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
    customerIdentity,
    hasAuthenticatedCustomer,
  } = usePersonalIbanSelection();
  const { getAssets } = useAssetContext();
  const { getAsset } = useAsset();
  const { getCurrency } = useFiat();
  const { currencies, receiveFor, getPersonalIbans } = useBuy();
  const { closeServices } = useAppHandlingContext();
  const { isInitialized: isWalletInitialized } = useWalletContext();
  const { scrollToTop } = useLayoutContext();

  const [isLoading, setIsLoading] = useState(true);
  // Quote data and its sent provider are committed atomically and only remain active for the
  // customer identity that loaded them.
  const [paymentInfoState, setPaymentInfoState] = useState<{
    info: Buy;
    sentProvider: PersonalIbanProvider | undefined;
    identity: number | undefined;
  }>();
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
  const [continueWithoutPersonalIban, setContinueWithoutPersonalIban] = useState<{
    value: boolean;
    identity: number | undefined;
  }>();
  // Suppress an unrecognized selector so the customer can continue with an ordinary quote (A3).
  const [suppressPersonalIban, setSuppressPersonalIban] = useState<{
    value: boolean;
    identity: number | undefined;
  }>();
  // Selector acknowledgement and suppression only apply to the account that chose them. The
  // identity check closes the same-commit race in which the quote effect can run before the
  // selector-scoped reset has committed after an in-place account switch.
  const activeContinueWithoutPersonalIban =
    continueWithoutPersonalIban !== undefined &&
    continueWithoutPersonalIban.identity === customerIdentity
      ? continueWithoutPersonalIban.value
      : false;
  const activeSuppressPersonalIban =
    suppressPersonalIban !== undefined && suppressPersonalIban.identity === customerIdentity
      ? suppressPersonalIban.value
      : false;
  // Same mechanism as buy.screen.tsx - see the detailed comments there.
  const [personalIbans, setPersonalIbans] = useState<{
    identity: number | undefined;
    rows: VirtualIban[];
  }>();
  // The loaded row list only reflects the identity it was fetched for; a stale list from a
  // since-swapped account must never leak into a newer account's yapealAlternative/gate
  // computation. This closes the same class of race as the provider override, now for
  // personalIbans: the quote-load effect reacts to customerIdentity directly and can run in
  // the same commit as a still-pending personalIbans reset.
  const activePersonalIbans =
    personalIbans !== undefined && personalIbans.identity === customerIdentity
      ? personalIbans.rows
      : undefined;
  const [providerOverride, setProviderOverride] = useState<{
    provider: PersonalIbanProvider;
    identity: number | undefined;
  }>();
  // An override only applies to the account it was chosen for; a stale override from a
  // since-swapped account must never leak into a newer account's provider derivation. This
  // closes a race where the quote-load effect can run in the same commit as a still-pending
  // providerOverride reset.
  const activeProviderOverride =
    providerOverride !== undefined && providerOverride.identity === customerIdentity
      ? providerOverride.provider
      : undefined;
  const [frickDefaultKycFallback, setFrickDefaultKycFallback] = useState(false);
  const [userLoadTimeout, setUserLoadTimeout] = useState<{
    identity: number | undefined;
    timedOut: true;
  }>();
  const userLoadTimedOut =
    userLoadTimeout !== undefined &&
    userLoadTimeout.identity === customerIdentity &&
    userLoadTimeout.timedOut;
  const activePaymentInfoState =
    paymentInfoState !== undefined && paymentInfoState.identity === customerIdentity
      ? paymentInfoState
      : undefined;
  const paymentInfo = activePaymentInfoState?.info;
  const sentPersonalIbanProvider = activePaymentInfoState?.sentProvider;

  const quoteGeneration = useRef(0);
  const customerIdentityRef = useRef(customerIdentity);
  customerIdentityRef.current = customerIdentity;

  const effectivePersonalIban = activeSuppressPersonalIban ? undefined : personalIban;
  const personalIbanSelector = activeSuppressPersonalIban
    ? undefined
    : requestedPersonalIban;
  const isPersonalIbanEligible = isPersonalIbanApplicable(
    currency?.name,
    FiatPaymentMethod.BANK,
  );
  // NOT a ?? default: kyc is only readable once `user` exists, so both conditions are spelled
  // out explicitly.
  const kycAllowsFrick = user !== undefined && user.kyc.level >= 50;
  // Raw hook value (ignores local suppression state) - see buy.screen.tsx for why.
  const hasRequestedPersonalIbanSelector = requestedPersonalIban !== undefined;
  const hasApplicableExplicitPersonalIbanRequest =
    isPersonalIbanEligible &&
    isExplicitPersonalIbanRequest(personalIbanSelector);
  const shouldWaitForApplicableExplicitCustomer =
    hasApplicableExplicitPersonalIbanRequest &&
    (!isWalletInitialized || !hasAuthenticatedCustomer);
  // The row list only matters for the automatic Frick-default branch (no explicit override or
  // URL/widget selector, eligible currency, KYC permits Frick or is still loading, not already
  // retried this generation) - gating any other request would delay an unrelated quote.
  // The row list decides the default provider, so the first quote must not race it; a failed load
  // resolves the gate immediately via the empty list (see the personalIbans-load effect above).
  const shouldWaitForPersonalIbanRows =
    hasAuthenticatedCustomer &&
    isPersonalIbanEligible &&
    activeProviderOverride === undefined &&
    !hasRequestedPersonalIbanSelector &&
    !frickDefaultKycFallback &&
    ((isUserLoading && !userLoadTimedOut) ||
      (!isUserLoading && kycAllowsFrick && activePersonalIbans === undefined));

  // The customer's existing, still-payable Yapeal row for the selected currency, if any.
  const yapealAlternative = getYapealAlternative(activePersonalIbans, currency?.name);

  // Same explicit decision tree as buy.screen.tsx - see the detailed comments there.
  const effectiveProvider: PersonalIbanProvider | undefined =
    activeProviderOverride !== undefined
      ? activeProviderOverride
      : hasRequestedPersonalIbanSelector
      ? toPersonalIbanProviderRequest(effectivePersonalIban).personalIbanProvider
      : yapealAlternative !== undefined &&
        !isUserLoading &&
        kycAllowsFrick &&
        !frickDefaultKycFallback
      ? PersonalIbanProvider.FRICK
      : undefined;

  // default params
  useEffect(() => {
    const blockchains = availableBlockchains ?? [];
    const blockchainAssets = getAssets(blockchains, { buyable: true, comingSoon: false });

    if (!asset) setAsset(getAsset(blockchainAssets, assetOut));
  }, [assetOut, getAsset, getAssets]);

  // Currency-independent list of the customer's personal-IBAN rows; a failed load only
  // suppresses the switch-provider offer, never the ordinary quote flow itself.
  useEffect(() => {
    // An account swapped in place (deep-link param push) must never keep another account's row
    // list or provider choice.
    setPersonalIbans(undefined);
    setProviderOverride(undefined);
    setFrickDefaultKycFallback(false);
    setShowsCompletion(false);
    if (!hasAuthenticatedCustomer || customerIdentity === undefined) return;
    let isRunning = true;
    let settled = false;
    const loadingCustomerIdentity = customerIdentity;
    const timeoutId = window.setTimeout(() => {
      if (isRunning && !settled && customerIdentityRef.current === loadingCustomerIdentity) {
        settled = true;
        // Deliberate fail-open: an unavailable row-list endpoint suppresses only the optional
        // Frick default/provider switch and must never hold up the ordinary buy flow.
        setPersonalIbans({ identity: loadingCustomerIdentity, rows: [] });
      }
    }, 10000);
    getPersonalIbans()
      .then((ibans) => {
        if (isRunning && !settled && customerIdentityRef.current === loadingCustomerIdentity) {
          settled = true;
          window.clearTimeout(timeoutId);
          setPersonalIbans({ identity: loadingCustomerIdentity, rows: ibans });
        }
      })
      .catch(() => {
        if (isRunning && !settled && customerIdentityRef.current === loadingCustomerIdentity) {
          settled = true;
          window.clearTimeout(timeoutId);
          setPersonalIbans({ identity: loadingCustomerIdentity, rows: [] });
        }
      });
    return () => {
      isRunning = false;
      window.clearTimeout(timeoutId);
    };
  }, [hasAuthenticatedCustomer, customerIdentity, getPersonalIbans]);

  useEffect(() => {
    setUserLoadTimeout(undefined);
    if (!isUserLoading) return;
    let isRunning = true;
    const loadingCustomerIdentity = customerIdentity;
    const timeoutId = window.setTimeout(() => {
      if (isRunning && customerIdentityRef.current === loadingCustomerIdentity) {
        // Deliberate fail-open: after the cap, quote selector-less instead of blocking the core
        // buy flow. A late user-context load re-evaluates KYC and triggers the ordinary
        // corrective quote/provider-switch machinery when needed.
        setUserLoadTimeout({ identity: loadingCustomerIdentity, timedOut: true });
      }
    }, 10000);
    return () => {
      isRunning = false;
      window.clearTimeout(timeoutId);
    };
  }, [isUserLoading, customerIdentity]);

  useEffect(() => {
    if (!currency) setCurrency(getCurrency(currencies, assetIn));
  }, [assetIn, getCurrency, currencies]);

  // Reset acknowledgement / suppression when the account, live selector or quote inputs change.
  useEffect(() => {
    setContinueWithoutPersonalIban(undefined);
    setSuppressPersonalIban(undefined);
  }, [requestedPersonalIban, asset, currency, amountIn, amountOut, customerIdentity]);

  // The provider-switch override and the KYC fallback flag must not survive a selector or
  // currency change - otherwise a stale override could silently apply to an unrelated quote.
  useEffect(() => {
    setProviderOverride(undefined);
    setFrickDefaultKycFallback(false);
  }, [requestedPersonalIban, currency]);

  // Race-protected quote fetch: a stale response must never overwrite a newer one after
  // personalIban / inputs change at runtime (widget attribute, browser back/forward).
  useEffect(() => {
    let isRunning = true;
    const generation = ++quoteGeneration.current;
    const loadingCustomerIdentity = customerIdentity;

    if (shouldWaitForApplicableExplicitCustomer || shouldWaitForPersonalIbanRows) {
      setPaymentInfoState(undefined);
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
    setPaymentInfoState(undefined);

    const requestPersonalIbanProvider = isPersonalIbanEligible ? effectiveProvider : undefined;
    // Feature-specific errors apply only to a request that actually carried the provider.
    // personalIbanSelector keeps the raw requested value even when ineligible or unrecognized;
    // effectivePersonalIban reflects an explicitly recognized Frick selector (subject to
    // suppression), but is NOT filtered by currency/payment-method eligibility — that check
    // (isPersonalIbanEligible) is computed separately and re-applied at each call site above.
    const personalIbanErrorApplies = requestPersonalIbanProvider !== undefined;

    if (isUnrecognizedPersonalIbanSelector(personalIbanSelector)) {
      const personalIbanErrorText = getPersonalIbanErrorMessage('PersonalIbanProviderUnsupported');
      if (generation === quoteGeneration.current) {
        setPaymentInfoState(undefined);
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
        if (
          !isRunning ||
          generation !== quoteGeneration.current ||
          customerIdentityRef.current !== loadingCustomerIdentity
        )
          return;
        const validatedBuy = validateBuy(buy);
        setPaymentInfoState(
          validatedBuy === undefined
            ? undefined
            : {
                info: validatedBuy,
                sentProvider: request.personalIbanProvider,
                identity: loadingCustomerIdentity,
              },
        );
      })
      .catch((error: ApiError) => {
        if (
          !isRunning ||
          generation !== quoteGeneration.current ||
          customerIdentityRef.current !== loadingCustomerIdentity
        )
          return;
        setPaymentInfoState(undefined);

        // The client snapshot allowed the automatic Frick default, but the authoritative server
        // rejected it with KycRequired. Retry without a selector and keep a visible hint instead
        // of showing the blocking KYC screen; see buy.screen.tsx for the detailed rationale.
        const isAutoFrickDefaultRequest =
          requestPersonalIbanProvider === PersonalIbanProvider.FRICK &&
          !frickDefaultKycFallback &&
          activeProviderOverride === undefined &&
          requestedPersonalIban === undefined;
        if (isAutoFrickDefaultRequest && isKycRequiredMessage(error.message)) {
          setFrickDefaultKycFallback(true);
          setKycError(undefined);
          setKycMessageOverride(undefined);
          setErrorMessage(undefined);
          return;
        }

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
    effectiveProvider,
    personalIbanSelector,
    shouldWaitForApplicableExplicitCustomer,
    shouldWaitForPersonalIbanRows,
    retryToken,
    activeProviderOverride,
    requestedPersonalIban,
    yapealAlternative,
    frickDefaultKycFallback,
    customerIdentity,
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
    if (personalIbanProviderVerificationFailed) {
      // Discard an unverifiable provider-backed response before fetching standard details.
      // Together these state changes suppress URL, toggle and automatic-default provider paths.
      setPaymentInfoState(undefined);
      setContinueWithoutPersonalIban(undefined);
      setSuppressPersonalIban({ value: true, identity: customerIdentity });
      setProviderOverride(undefined);
      setFrickDefaultKycFallback(true);
    } else {
      // Inapplicable offers were already requested without a selector.
      setContinueWithoutPersonalIban({ value: true, identity: customerIdentity });
    }
  }

  function onSwitchPersonalIbanProvider(provider: PersonalIbanProvider) {
    setProviderOverride({ provider, identity: customerIdentity });
    setFrickDefaultKycFallback(false);
  }

  const verifiedFrick =
    paymentInfo != null &&
    sentPersonalIbanProvider === PersonalIbanProvider.FRICK &&
    isVerifiedFrickPersonalIbanResponse(paymentInfo);
  const verifiedYapeal =
    paymentInfo != null &&
    sentPersonalIbanProvider === PersonalIbanProvider.YAPEAL &&
    isVerifiedYapealPersonalIbanResponse(paymentInfo);
  const hasVerifiedYapealResponse =
    paymentInfo != null && isVerifiedYapealPersonalIbanResponse(paymentInfo);
  const personalIbanProviderVerificationFailed =
    paymentInfo != null &&
    ((sentPersonalIbanProvider === PersonalIbanProvider.FRICK && !verifiedFrick) ||
      (sentPersonalIbanProvider === PersonalIbanProvider.YAPEAL && !verifiedYapeal));
  const showBank = verifiedFrick;

  const switchTarget: PersonalIbanProvider | undefined =
    verifiedFrick && yapealAlternative !== undefined
      ? PersonalIbanProvider.YAPEAL
      : hasVerifiedYapealResponse &&
        sentPersonalIbanProvider !== PersonalIbanProvider.FRICK &&
        kycAllowsFrick
      ? PersonalIbanProvider.FRICK
      : undefined;

  // A selector not used for this offer (inapplicable currency/method), or a provider-backed
  // response that failed compatibility verification, requires explicit acknowledgement.
  const needsPersonalIbanAcknowledgement =
    paymentInfo != null &&
    !activeContinueWithoutPersonalIban &&
    ((personalIbanSelector !== undefined &&
      !isPersonalIbanApplicable(paymentInfo.currency.name, FiatPaymentMethod.BANK) &&
      !isPersonalIbanApplicable(currency?.name, FiatPaymentMethod.BANK)) ||
      personalIbanProviderVerificationFailed);

  const isUnrecognizedBlocked =
    isUnrecognizedPersonalIbanSelector(personalIbanSelector) &&
    errorMessage != null;
  const showsActiveCompletion = showsCompletion && paymentInfo !== undefined;

  useLayoutOptions({ textStart: true, backButton: false });

  return (
    <>
      {showsActiveCompletion && paymentInfo ? (
        <BuyCompletion user={user} paymentInfo={paymentInfo} navigateOnClose={false} />
      ) : isUnrecognizedBlocked ? (
        <StyledVerticalStack center className="text-center" gap={4}>
          <ErrorHint message={errorMessage} />
          <StyledButton
            width={StyledButtonWidth.FULL}
            label={translate('screens/payment', 'Continue without personal IBAN')}
            onClick={() =>
              setSuppressPersonalIban({ value: true, identity: customerIdentity })
            }
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
            {personalIbanProviderVerificationFailed
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
            <PaymentInformationContent
              info={paymentInfo}
              showBank={showBank}
              switchablePersonalIbanProvider={switchTarget}
              onSwitchPersonalIbanProvider={onSwitchPersonalIbanProvider}
            />

            {frickDefaultKycFallback && (
              <StyledInfoText invertedIcon>
                {translate(
                  'screens/payment',
                  'Your new Bank Frick IBAN requires KYC level 50 - we are showing your existing IBAN instead.',
                )}
              </StyledInfoText>
            )}

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
