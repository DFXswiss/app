import {
  ApiError,
  Asset,
  AssetCategory,
  Blockchain,
  Buy,
  BuyPaymentInfo,
  Fiat,
  FiatPaymentMethod,
  PersonalIbanProvider,
  TransactionError,
  TransactionType,
  useAsset,
  useAssetContext,
  useAuthContext,
  useBuy,
  useFiat,
  useSessionContext,
  useUserContext,
  Utils,
  Validations,
} from '@dfx.swiss/react';
import { Urls } from 'src/config/urls';
import {
  AssetIconVariant,
  Form,
  IconColor,
  SpinnerSize,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledDropdown,
  StyledHorizontalStack,
  StyledInfoText,
  StyledInput,
  StyledLink,
  StyledLoadingSpinner,
  StyledSearchDropdown,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { useEffect, useRef, useState } from 'react';
import { FieldPath, FieldPathValue, useForm, useWatch } from 'react-hook-form';
import { PaymentInformationContent } from 'src/components/payment/payment-info-buy';
import { useWindowContext } from 'src/contexts/window.context';
import { getKycErrorFromMessage } from 'src/util/api-error';
import { blankedAddress } from 'src/util/utils';
import { ErrorHint } from '../components/error-hint';
import { ExchangeRate } from '../components/exchange-rate';
import { AddressSwitch } from '../components/payment/address-switch';
import { BuyCompletion } from '../components/payment/buy-completion';
import { PrivateAssetHint } from '../components/private-asset-hint';
import { QuoteErrorHint } from '../components/quote-error-hint';
import { SanctionHint } from '../components/sanction-hint';
import { addressLabel } from '../config/labels';
import { useAppHandlingContext } from '../contexts/app-handling.context';
import { useLayoutContext } from '../contexts/layout.context';
import { useSettingsContext } from '../contexts/settings.context';
import { useWalletContext } from '../contexts/wallet.context';
import { useAppParams } from '../hooks/app-params.hook';
import { useBlockchain } from '../hooks/blockchain.hook';
import useDebounce from '../hooks/debounce.hook';
import { useAddressGuard } from '../hooks/guard.hook';
import { useLayoutOptions } from '../hooks/layout-config.hook';
import { useNavigation } from '../hooks/navigation.hook';
import { usePersonalIbanRows } from '../hooks/personal-iban-rows.hook';
import { usePersonalIbanSelection } from '../hooks/personal-iban.hook';
import {
  FRICK_CURRENCIES,
  deriveEffectivePersonalIbanProvider,
  getPersonalIbanErrorMessage,
  getPersonalIbanKycMessage,
  getYapealAlternative,
  isExplicitPersonalIbanRequest,
  isKycRequiredMessage,
  isPersonalIbanApplicable,
  isUnrecognizedPersonalIbanSelector,
  isVerifiedFrickPersonalIbanResponse,
  isVerifiedYapealPersonalIbanResponse,
} from '../util/personal-iban';

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
  amount: string;
  currency: Fiat;
  paymentMethod: FiatPaymentMethod;
  asset: Asset;
  targetAmount: string;
  address: Address;
}

interface ValidatedData extends BuyPaymentInfo {
  sideToUpdate?: Side;
}

interface QuoteRequestSignatureData {
  amount?: string | number;
  targetAmount?: string | number;
  currencyName?: string;
  assetUniqueName?: string;
  paymentMethod?: FiatPaymentMethod;
  personalIbanProvider?: BuyPaymentInfo['personalIbanProvider'];
  customerIdentity?: number;
}

function quoteRequestSignature(data: QuoteRequestSignatureData): string {
  return JSON.stringify({
    amount: data.amount ? Number(data.amount) : undefined,
    targetAmount: data.targetAmount ? Number(data.targetAmount) : undefined,
    currency: data.currencyName,
    asset: data.assetUniqueName,
    paymentMethod: data.paymentMethod,
    personalIbanProvider: data.personalIbanProvider,
    customerIdentity: data.customerIdentity,
    hasCompleteSpendSide: Boolean(data.amount && data.currencyName && data.paymentMethod),
    hasCompleteGetSide: Boolean(data.targetAmount && data.assetUniqueName),
  });
}

export default function BuyScreen(): JSX.Element {
  useAddressGuard('/login');

  const { translate, translateError, currency: prefCurrency } = useSettingsContext();
  const { logout } = useSessionContext();
  const { session } = useAuthContext();
  const { currencies, receiveFor, confirmFor } = useBuy();
  const { toSymbol } = useFiat();
  const { assets, getAssets } = useAssetContext();
  const { getAsset, isSameAsset } = useAsset();
  const {
    assets: assetFilter,
    assetIn,
    assetOut,
    amountIn,
    amountOut,
    blockchain,
    paymentMethod,
    externalTransactionId,
    flags,
    setParams,
    hideTargetSelection,
    availableBlockchains,
  } = useAppParams();
  const {
    requestedPersonalIban,
    personalIban,
    customerIdentity,
    hasAuthenticatedCustomer,
  } = usePersonalIbanSelection();
  const { toDescription, getCurrency, getDefaultCurrency } = useFiat();
  const { navigate } = useNavigation();
  const { user, isUserLoading } = useUserContext();
  const {
    blockchain: walletBlockchain,
    isInitialized: isWalletInitialized,
    switchBlockchain,
  } = useWalletContext();
  const { scrollToTop } = useLayoutContext();
  const { toString } = useBlockchain();
  const { width } = useWindowContext();
  const { rootRef } = useLayoutContext();
  const { isInitialized } = useAppHandlingContext();
  const activeUser =
    user !== undefined && user.accountId === customerIdentity ? user : undefined;
  const isActiveUserLoading =
    isUserLoading || (hasAuthenticatedCustomer && activeUser === undefined);
  const {
    activePersonalIbans,
    personalIbanRowsSettled,
    userLoadTimedOut,
  } = usePersonalIbanRows(
    customerIdentity,
    hasAuthenticatedCustomer,
    isActiveUserLoading,
  );

  const [availableAssets, setAvailableAssets] = useState<Asset[]>();
  // Quote metadata is committed atomically and only remains active for the customer it belongs to.
  // The payment method is included because Buy has no paymentMethod field, while the sent provider
  // must never be inferred from live selector state after a request has started.
  const [paymentInfoState, setPaymentInfoState] = useState<{
    info: Buy;
    paymentMethod: FiatPaymentMethod | undefined;
    sentProvider: PersonalIbanProvider | undefined;
    identity: number | undefined;
    isFinalQuote: boolean;
  }>();
  const [customAmountError, setCustomAmountError] = useState<string>();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [personalIbanProviderUnavailable, setPersonalIbanProviderUnavailable] = useState<{
    value: true;
    identity: number | undefined;
  }>();
  const [kycError, setKycError] = useState<TransactionError>();
  const [kycMessageOverride, setKycMessageOverride] = useState<string>();
  const [showsCompletion, setShowsCompletion] = useState(false);
  const [completedPaymentInfo, setCompletedPaymentInfo] = useState<{
    info: Buy;
    identity: number | undefined;
  }>();
  const [showsSwitchScreen, setShowsSwitchScreen] = useState(false);
  const [isLoading, setIsLoading] = useState<Side>();
  const [isConfirming, setIsConfirming] = useState(false);
  const [validatedData, setValidatedData] = useState<ValidatedData>();
  // Re-run the guarded quote effect when Retry is clicked even if the canonical request is equal.
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
  // Explicit customer choice from the provider-switch button; always wins over the automatic
  // Frick default and over an unset selector, and is cleared whenever the selector or the
  // currency changes so it can never silently apply to an unrelated quote.
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
  // Prevents the effective-provider derivation below from rebuilding an automatic Frick request
  // after either a failed default or an explicit recovery action.
  const [automaticFrickSuppressed, setAutomaticFrickSuppressed] = useState<{
    value: boolean;
    identity: number | undefined;
  }>();
  const activeAutomaticFrickSuppressed =
    automaticFrickSuppressed !== undefined &&
    automaticFrickSuppressed.identity === customerIdentity
      ? automaticFrickSuppressed.value
      : false;
  const [frickKycFallbackHint, setFrickKycFallbackHint] = useState<{
    value: boolean;
    identity: number | undefined;
  }>();
  const activeFrickKycFallbackHint =
    frickKycFallbackHint !== undefined &&
    frickKycFallbackHint.identity === customerIdentity
      ? frickKycFallbackHint.value
      : false;
  const activeCompletedPaymentInfo =
    completedPaymentInfo !== undefined && completedPaymentInfo.identity === customerIdentity
      ? completedPaymentInfo.info
      : undefined;
  const activePersonalIbanProviderUnavailable =
    personalIbanProviderUnavailable !== undefined &&
    personalIbanProviderUnavailable.identity === customerIdentity &&
    personalIbanProviderUnavailable.value;
  const activePaymentInfoState =
    paymentInfoState !== undefined && paymentInfoState.identity === customerIdentity
      ? paymentInfoState
      : undefined;
  const paymentInfo = activePaymentInfoState?.info;
  const paymentInfoPaymentMethod = activePaymentInfoState?.paymentMethod;
  const sentPersonalIbanProvider = activePaymentInfoState?.sentProvider;
  const isQuoteFinal = activePaymentInfoState?.isFinalQuote === true;

  // Live-input generation: bumps immediately when form inputs or selector change so stale
  // debounced responses and confirm actions never commit against a newer form state (B4).
  const quoteGeneration = useRef(0);
  const lastQuoteRequestSignature = useRef<string>();
  const pendingFormSynchronization = useRef<string>();
  const customerIdentityRef = useRef(customerIdentity);
  customerIdentityRef.current = customerIdentity;
  const activePaymentInfoIdRef = useRef<number>();
  activePaymentInfoIdRef.current = paymentInfo?.id;
  const isMountedRef = useRef(true);
  // A field the user emptied stays an edit in progress until they type again. The one-frame
  // non-empty → empty edge is not enough: a later currency/asset effect would otherwise take
  // the cross-side fallback and the exact-price echo would write back into the empty field.
  // Never-set fields (deep links, first render) still resolve over the fallbacks.
  const previousAmountRef = useRef<string>();
  const previousTargetAmountRef = useRef<string>();
  const spendClearedByUserRef = useRef(false);
  const targetClearedByUserRef = useRef(false);

  const effectivePersonalIban = activeSuppressPersonalIban ? undefined : personalIban;
  const personalIbanSelector = activeSuppressPersonalIban
    ? undefined
    : requestedPersonalIban;

  // form
  const { control, handleSubmit, setValue, resetField } = useForm<FormData>();

  const selectedAmount = useWatch({ control, name: 'amount' });
  const selectedCurrency = useWatch({ control, name: 'currency' });
  const selectedAsset = useWatch({ control, name: 'asset' });
  const selectedTargetAmount = useWatch({ control, name: 'targetAmount' });
  const selectedPaymentMethod = useWatch({ control, name: 'paymentMethod' });
  const selectedAddress = useWatch({ control, name: 'address' });

  // Same-turn clear+resolveExact: the amount effect has not run yet, so latch here.
  if (!selectedAmount && previousAmountRef.current) spendClearedByUserRef.current = true;
  if (!selectedTargetAmount && previousTargetAmountRef.current) targetClearedByUserRef.current = true;

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
  const availablePaymentMethods = [FiatPaymentMethod.BANK];

  const availableCurrencies = currencies?.filter((c) => c.sellable);

  useEffect(() => {
    const activeBlockchain = walletBlockchain ?? blockchain;
    const activeBlockchains = activeBlockchain ? [activeBlockchain as Blockchain] : availableBlockchains ?? [];
    const blockchainAssets = getAssets(activeBlockchains, { buyable: true, comingSoon: false }).filter(
      (a) => a.category === AssetCategory.PUBLIC || a.name === assetOut,
    );
    const activeAssets = filterAssets(blockchainAssets, assetFilter);

    setAvailableAssets(activeAssets);

    const asset = getAsset(activeAssets, assetOut) ?? (activeBlockchain && activeAssets[0]);
    if (asset) setVal('asset', asset);
  }, [assetOut, assetFilter, getAsset, getAssets, blockchain, walletBlockchain, availableBlockchains]);

  useEffect(() => {
    const currency =
      getCurrency(availableCurrencies, selectedCurrency?.name) ??
      getCurrency(availableCurrencies, assetIn) ??
      getCurrency(availableCurrencies, prefCurrency?.name) ??
      getDefaultCurrency(availableCurrencies);
    if (prefCurrency && currency) setVal('currency', currency);
  }, [assetIn, getCurrency, prefCurrency, currencies]);

  useEffect(() => {
    const selectedMethod =
      availablePaymentMethods.find((m) => m === selectedPaymentMethod) ??
      availablePaymentMethods.find((m) => m.toLowerCase() === paymentMethod?.toLowerCase()) ??
      FiatPaymentMethod.BANK;

    if (isInitialized && selectedMethod) setVal('paymentMethod', selectedMethod);
  }, [availablePaymentMethods, paymentMethod]);

  useEffect(() => {
    if (amountIn) {
      if (!spendClearedByUserRef.current) setVal('amount', amountIn);
    } else if (amountOut) {
      if (!targetClearedByUserRef.current) setVal('targetAmount', amountOut);
    } else if (
      selectedAsset &&
      !selectedAmount &&
      !selectedTargetAmount &&
      !spendClearedByUserRef.current &&
      !targetClearedByUserRef.current
    ) {
      // Always set amount (input field) - backend calculates targetAmount.
      // Do not restore the default into a field the user just emptied.
      setVal('amount', '300');
    }
  }, [amountIn, amountOut, selectedAsset]);

  useEffect(() => {
    setProviderOverride(undefined);
    setAutomaticFrickSuppressed(undefined);
    setFrickKycFallbackHint(undefined);
    setShowsCompletion(false);
    setCompletedPaymentInfo(undefined);
    setIsConfirming(false);
  }, [customerIdentity]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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
    if (!selectedAmount) {
      setCustomAmountError(undefined);
    }
  }, [selectedAmount]);

  // SPEND data changed
  useEffect(() => {
    if (selectedAmount) {
      spendClearedByUserRef.current = false;
      // A newly typed spend amount starts a spend-side quote. Exact-price echo must not
      // look like typing: it sets pendingFormSynchronization before writing the field.
      if (selectedAmount !== previousAmountRef.current && pendingFormSynchronization.current == null) {
        targetClearedByUserRef.current = false;
      }
    } else if (previousAmountRef.current) {
      spendClearedByUserRef.current = true;
    }
    previousAmountRef.current = selectedAmount;

    const requiresUpdate =
      selectedAmount !== paymentInfo?.amount?.toString() ||
      selectedCurrency?.name !== paymentInfo?.currency.name ||
      selectedPaymentMethod !== validatedData?.paymentMethod;

    const hasSpendData = selectedAmount && selectedCurrency && selectedPaymentMethod;
    const hasGetData = selectedTargetAmount && selectedAsset;

    if (requiresUpdate) {
      if (hasSpendData && !targetClearedByUserRef.current) {
        updateData(Side.GET);
      } else if (spendClearedByUserRef.current || targetClearedByUserRef.current) {
        // the user is retyping — never refill the emptied field from the opposite side
        setValidatedData(undefined);
        setIsLoading(undefined);
      } else if (hasGetData) {
        updateData(Side.SPEND);
      }
    }
  }, [selectedAmount, selectedCurrency, selectedPaymentMethod]);

  // GET data changed
  useEffect(() => {
    if (selectedTargetAmount) {
      targetClearedByUserRef.current = false;
      if (selectedTargetAmount !== previousTargetAmountRef.current && pendingFormSynchronization.current == null) {
        spendClearedByUserRef.current = false;
      }
    } else if (previousTargetAmountRef.current) {
      targetClearedByUserRef.current = true;
    }
    previousTargetAmountRef.current = selectedTargetAmount;

    const isSameTargetAmount = selectedTargetAmount === paymentInfo?.estimatedAmount?.toString();
    const requiresUpdate = !isSameTargetAmount || selectedAsset?.uniqueName !== paymentInfo?.asset?.uniqueName;

    const hasSpendData = selectedAmount && selectedCurrency && selectedPaymentMethod;
    const hasGetData = selectedTargetAmount && selectedAsset;

    if (requiresUpdate) {
      if (hasGetData && !spendClearedByUserRef.current) {
        updateData(Side.SPEND);
      } else if (targetClearedByUserRef.current || spendClearedByUserRef.current) {
        // the user is retyping — never refill the emptied field from the opposite side
        setValidatedData(undefined);
        setIsLoading(undefined);
      } else if (hasSpendData) {
        updateData(Side.GET);
      }
    }
  }, [selectedTargetAmount, selectedAsset]);

  function updateData(sideToUpdate: Side) {
    const data = validateData({
      amount: sideToUpdate === Side.GET ? selectedAmount : undefined,
      currency: selectedCurrency,
      asset: selectedAsset,
      targetAmount: sideToUpdate === Side.SPEND || selectedAmount === undefined ? selectedTargetAmount : undefined,
      paymentMethod: selectedPaymentMethod,
    });

    setValidatedData(data ? { ...data, sideToUpdate } : undefined);
  }

  const hasCompleteSpendSide = Boolean(selectedAmount && selectedCurrency && selectedPaymentMethod);
  const hasCompleteGetSide = Boolean(selectedTargetAmount && selectedAsset);

  // The customer's existing, still-payable Yapeal row for the selected currency, if any.
  const yapealAlternative = getYapealAlternative(activePersonalIbans, selectedCurrency?.name);
  // NOT a ?? default: kyc is only readable once `user` exists, so both conditions are spelled
  // out explicitly.
  const kycAllowsFrick = activeUser !== undefined && activeUser.kyc.level >= 50;
  // Raw hook value (ignores local suppression state) - any URL/widget selector, even one that
  // later gets suppressed for being unrecognized, must take this customer out of the automatic
  // default path entirely rather than falling through to it.
  const hasRequestedPersonalIbanSelector = requestedPersonalIban !== undefined;

  // Explicit decision tree, no ?? cascade:
  // 1) an explicit toggle-button choice always wins;
  // 2) an explicit URL/widget selector is untouched, existing logic applies as before;
  // 3) otherwise, an existing Yapeal holder with KYC >= 50 gets the new Bank Frick IBAN by
  //    default (unless that default already failed KYC once this generation);
  // 4) otherwise no selector is sent - the server defaults to the customer's existing Yapeal row.
  const effectiveProvider = deriveEffectivePersonalIbanProvider({
    providerOverride: activeProviderOverride,
    hasRequestedPersonalIbanSelector,
    personalIban: effectivePersonalIban,
    hasYapealAlternative: yapealAlternative !== undefined,
    isUserLoading: isActiveUserLoading,
    kycAllowsFrick,
    automaticFrickSuppressed: activeAutomaticFrickSuppressed,
  });

  const selectedPersonalIbanProvider = isPersonalIbanApplicable(
    selectedCurrency?.name,
    selectedPaymentMethod,
  )
    ? effectiveProvider
    : undefined;
  const currentQuoteRequestSignature = quoteRequestSignature({
    amount: selectedAmount,
    targetAmount: selectedTargetAmount,
    currencyName: selectedCurrency?.name,
    assetUniqueName: selectedAsset?.uniqueName,
    paymentMethod: selectedPaymentMethod,
    personalIbanProvider: selectedPersonalIbanProvider,
    customerIdentity,
  });

  // Invalidate against the canonical API request rather than raw strings/object identities.
  // Debounce only launches a replacement request; clearing the last complete side must also clear
  // request state.
  useEffect(() => {
    if (currentQuoteRequestSignature === lastQuoteRequestSignature.current) return;
    lastQuoteRequestSignature.current = currentQuoteRequestSignature;

    const synchronizedRequestSignature = pendingFormSynchronization.current;
    pendingFormSynchronization.current = undefined;
    const isExactPriceSynchronization =
      synchronizedRequestSignature != null &&
      currentQuoteRequestSignature === synchronizedRequestSignature;

    // Exact-price synchronization writes the calculated opposite amount into the form. It is
    // not a customer edit and must not invalidate the response it came from.
    if (isExactPriceSynchronization) return;

    quoteGeneration.current += 1;
    setErrorMessage(undefined);
    setKycError(undefined);
    setKycMessageOverride(undefined);
    setPaymentInfoState(undefined);
    setIsConfirming(false);
    setContinueWithoutPersonalIban(undefined);
    if (spendClearedByUserRef.current || targetClearedByUserRef.current) {
      setIsLoading(undefined);
    } else if (!hasCompleteSpendSide && !hasCompleteGetSide) {
      setValidatedData(undefined);
      setIsLoading(undefined);
    } else {
      setIsLoading(hasCompleteSpendSide ? Side.GET : Side.SPEND);
    }
  }, [currentQuoteRequestSignature]);

  // Selector/account-scoped UI state changes with the live intent even when the request cannot
  // carry it.
  useEffect(() => {
    setContinueWithoutPersonalIban(undefined);
    setSuppressPersonalIban(undefined);
  }, [requestedPersonalIban, customerIdentity]);

  // The provider-switch override and Frick fallback state must not survive a selector or
  // currency change - otherwise a stale override could silently apply to an unrelated quote.
  useEffect(() => {
    setProviderOverride(undefined);
    setAutomaticFrickSuppressed(undefined);
    setFrickKycFallbackHint(undefined);
  }, [requestedPersonalIban, selectedCurrency?.name]);

  const debouncedValidatedData = useDebounce(validatedData, 500);
  const requestYapealAlternative = getYapealAlternative(
    activePersonalIbans,
    debouncedValidatedData?.currency.name,
  );
  // The request provider must use the same debounced currency snapshot as the request body.
  // The live effectiveProvider above remains part of the signature so live edits invalidate
  // immediately while the replacement request is still debouncing.
  const requestEffectiveProvider = deriveEffectivePersonalIbanProvider({
    providerOverride: activeProviderOverride,
    hasRequestedPersonalIbanSelector,
    personalIban: effectivePersonalIban,
    hasYapealAlternative: requestYapealAlternative !== undefined,
    isUserLoading: isActiveUserLoading,
    kycAllowsFrick,
    automaticFrickSuppressed: activeAutomaticFrickSuppressed,
  });
  const isPersonalIbanEligible =
    debouncedValidatedData &&
    isPersonalIbanApplicable(
      debouncedValidatedData.currency.name,
      debouncedValidatedData.paymentMethod,
    );
  const requestPersonalIbanProvider = isPersonalIbanEligible
    ? requestEffectiveProvider
    : undefined;
  const hasUnsupportedPersonalIbanRequest =
    isUnrecognizedPersonalIbanSelector(personalIbanSelector);
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
  // resolves the gate immediately via the empty list from the usePersonalIbanRows hook.
  const shouldWaitForPersonalIbanRows =
    hasAuthenticatedCustomer &&
    isPersonalIbanEligible &&
    activeProviderOverride === undefined &&
    !hasRequestedPersonalIbanSelector &&
    !activeAutomaticFrickSuppressed &&
    ((isActiveUserLoading && !userLoadTimedOut) ||
      (!isActiveUserLoading && kycAllowsFrick && !personalIbanRowsSettled));
  const personalIbanErrorApplies =
    (isPersonalIbanEligible && requestPersonalIbanProvider !== undefined) ||
    hasUnsupportedPersonalIbanRequest;

  // load payment infos
  useEffect(() => {
    let isRunning = true;
    const generation = quoteGeneration.current;
    const loadingCustomerIdentity = customerIdentity;
    setPersonalIbanProviderUnavailable(undefined);

    if (!debouncedValidatedData) {
      setIsLoading(undefined);
      return () => {
        isRunning = false;
      };
    }

    // Live clear invalidates immediately; debounce can still hold the previous request.
    // Extra effect deps (personal-IBAN rows, provider, retry) must not restart that request,
    // including when the user already typed a new non-empty amount.
    if (
      !validatedData ||
      spendClearedByUserRef.current ||
      targetClearedByUserRef.current ||
      validatedData.sideToUpdate !== debouncedValidatedData.sideToUpdate ||
      validatedData.amount !== debouncedValidatedData.amount ||
      validatedData.targetAmount !== debouncedValidatedData.targetAmount ||
      validatedData.currency?.name !== debouncedValidatedData.currency?.name ||
      validatedData.asset?.uniqueName !== debouncedValidatedData.asset?.uniqueName ||
      validatedData.paymentMethod !== debouncedValidatedData.paymentMethod
    ) {
      setIsLoading(undefined);
      return () => {
        isRunning = false;
      };
    }

    if (shouldWaitForApplicableExplicitCustomer || shouldWaitForPersonalIbanRows) {
      setPaymentInfoState(undefined);
      setErrorMessage(undefined);
      setKycError(undefined);
      setKycMessageOverride(undefined);
      setIsLoading(undefined);
      return () => {
        isRunning = false;
      };
    }

    if (hasUnsupportedPersonalIbanRequest) {
      setPaymentInfoState(undefined);
      setErrorMessage(
        translate('screens/payment', 'The requested personal IBAN provider is not recognized.'),
      );
      setIsLoading(undefined);
      return () => {
        isRunning = false;
      };
    }

    const data: BuyPaymentInfo = {
      ...debouncedValidatedData,
      externalTransactionId,
      ...(requestPersonalIbanProvider !== undefined
        ? { personalIbanProvider: requestPersonalIbanProvider }
        : {}),
    };

    setErrorMessage(undefined);
    setKycError(undefined);
    setKycMessageOverride(undefined);
    setPaymentInfoState(undefined);
    setIsLoading(debouncedValidatedData.sideToUpdate);
    receiveFor(data)
      .then((buy) => {
        if (
          !isRunning ||
          generation !== quoteGeneration.current ||
          customerIdentityRef.current !== loadingCustomerIdentity ||
          !buy
        )
          return;
        validateBuy(buy);
        setPaymentInfoState({
          info: buy,
          paymentMethod: data.paymentMethod,
          sentProvider: data.personalIbanProvider,
          identity: loadingCustomerIdentity,
          isFinalQuote: false,
        });
        return receiveFor({ ...data, exactPrice: true });
      })
      .then((info) => {
        if (!isRunning || !info) return;
        if (spendClearedByUserRef.current || targetClearedByUserRef.current) return;
        if (generation !== quoteGeneration.current || customerIdentityRef.current !== loadingCustomerIdentity) return;
        const synchronizedAmount =
          debouncedValidatedData.sideToUpdate === Side.SPEND
            ? info.amount.toString()
            : debouncedValidatedData.amount?.toString();
        const synchronizedTargetAmount =
          debouncedValidatedData.sideToUpdate === Side.GET
            ? info.estimatedAmount.toString()
            : debouncedValidatedData.targetAmount?.toString();
        pendingFormSynchronization.current = quoteRequestSignature({
          amount: synchronizedAmount,
          targetAmount: synchronizedTargetAmount,
          currencyName: debouncedValidatedData.currency.name,
          assetUniqueName: debouncedValidatedData.asset.uniqueName,
          paymentMethod: debouncedValidatedData.paymentMethod,
          personalIbanProvider: data.personalIbanProvider,
          customerIdentity: loadingCustomerIdentity,
        });
        if (debouncedValidatedData.sideToUpdate === Side.SPEND) {
          setVal('amount', info.amount.toString());
        } else {
          setVal('targetAmount', info.estimatedAmount.toString());
        }
        setPaymentInfoState({
          info,
          paymentMethod: data.paymentMethod,
          sentProvider: data.personalIbanProvider,
          identity: loadingCustomerIdentity,
          isFinalQuote: true,
        });
      })
      .catch((error: ApiError) => {
        if (
          !isRunning ||
          generation !== quoteGeneration.current ||
          customerIdentityRef.current !== loadingCustomerIdentity
        )
          return;
        setPaymentInfoState(undefined);

        // The client snapshot allowed the automatic Frick default (KYC >= 50), but the
        // authoritative server-side check rejected it with KycRequired. Do not show the blocking
        // KYC screen for a choice the customer never made themselves: retry without a selector
        // (the server re-derives the existing Yapeal IBAN) and keep a permanently visible hint.
        const isAutoFrickDefaultRequest =
          requestPersonalIbanProvider === PersonalIbanProvider.FRICK &&
          !activeAutomaticFrickSuppressed &&
          activeProviderOverride === undefined &&
          requestedPersonalIban === undefined;
        if (isAutoFrickDefaultRequest && isKycRequiredMessage(error.message)) {
          setAutomaticFrickSuppressed({ value: true, identity: loadingCustomerIdentity });
          setFrickKycFallbackHint({ value: true, identity: loadingCustomerIdentity });
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
          if (error.message?.includes('PersonalIbanProviderNotAvailable') === true) {
            setPersonalIbanProviderUnavailable({
              value: true,
              identity: loadingCustomerIdentity,
            });
          }
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
        if (isRunning && generation === quoteGeneration.current) setIsLoading(undefined);
      });

    return () => {
      isRunning = false;
    };
  }, [
    debouncedValidatedData,
    requestPersonalIbanProvider,
    hasUnsupportedPersonalIbanRequest,
    personalIbanErrorApplies,
    shouldWaitForApplicableExplicitCustomer,
    shouldWaitForPersonalIbanRows,
    retryToken,
    activeProviderOverride,
    requestedPersonalIban,
    activeAutomaticFrickSuppressed,
    customerIdentity,
  ]);

  function validateBuy(buy: Buy): void {
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
        return;

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
        return;
    }
  }

  function handleContinueWithoutPersonalIban() {
    if (personalIbanProviderVerificationFailed) {
      // Reject an unverifiable provider-backed response completely. Suppression handles an URL
      // selector, clearing the override handles a toggle, and the fallback flag prevents the
      // automatic Frick default from immediately rebuilding the same request.
      setPaymentInfoState(undefined);
      setContinueWithoutPersonalIban(undefined);
      setSuppressPersonalIban({ value: true, identity: customerIdentity });
      setProviderOverride(undefined);
      setAutomaticFrickSuppressed({ value: true, identity: customerIdentity });
    } else {
      // The offer was already selector-free (for example CHF), so acknowledgement is sufficient.
      setContinueWithoutPersonalIban({ value: true, identity: customerIdentity });
    }
  }

  function validateData({
    amount: amountStr,
    currency,
    asset,
    targetAmount: targetAmountStr,
    paymentMethod,
  }: Partial<FormData>): BuyPaymentInfo | undefined {
    const amount = Number(amountStr);
    const targetAmount = Number(targetAmountStr);
    if (asset != null && currency != null && paymentMethod != null) {
      return amount > 0
        ? { amount, currency, asset, paymentMethod }
        : targetAmount > 0
        ? { currency, asset, targetAmount, paymentMethod }
        : undefined;
    }
  }

  // misc
  function filterAssets(assets: Asset[], filter?: string): Asset[] {
    if (!filter) return assets;

    const allowedAssets = filter.split(',');
    return assets.filter((a) => allowedAssets.some((f) => isSameAsset(a, f)));
  }

  function onSubmit(_data?: FormData) {
    if (spendClearedByUserRef.current || targetClearedByUserRef.current) return;
    if (
      !paymentInfo ||
      kycError ||
      errorMessage ||
      customAmountError ||
      needsPersonalIbanAcknowledgement ||
      isConfirming
    ) {
      return;
    }
    if (selectedAsset?.category === AssetCategory.PRIVATE && !flags?.includes('private')) return;
    confirm(paymentInfo.id);
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

  function confirm(id: number) {
    const confirmingGeneration = quoteGeneration.current;
    if (activePaymentInfoState?.isFinalQuote !== true || activePaymentInfoState.info.id !== id)
      return;

    const confirmingRequestId = id;
    const confirmingPaymentInfo = activePaymentInfoState.info;
    const confirmingCustomerIdentity = customerIdentity;
    setIsConfirming(true);

    confirmFor(confirmingRequestId)
      .then(() => {
        if (
          !isMountedRef.current ||
          customerIdentityRef.current !== confirmingCustomerIdentity ||
          quoteGeneration.current !== confirmingGeneration ||
          activePaymentInfoIdRef.current !== confirmingRequestId
        ) {
          return;
        }
        setCompletedPaymentInfo({
          info: confirmingPaymentInfo,
          identity: confirmingCustomerIdentity,
        });
        setShowsCompletion(true);
        scrollToTop();
      })
      .catch((error: ApiError) => {
        if (
          !isMountedRef.current ||
          customerIdentityRef.current !== confirmingCustomerIdentity ||
          quoteGeneration.current !== confirmingGeneration ||
          activePaymentInfoIdRef.current !== confirmingRequestId
        ) {
          return;
        }
        setPersonalIbanProviderUnavailable(undefined);
        setErrorMessage(
          error.message !== undefined ? error.message : 'Unknown error',
        );
      })
      .finally(() => {
        if (
          !isMountedRef.current ||
          customerIdentityRef.current !== confirmingCustomerIdentity ||
          quoteGeneration.current !== confirmingGeneration
        ) {
          return;
        }
        setIsConfirming(false);
      });
  }

  function onCreatePersonalIban(currencyName: string) {
    navigate({ pathname: '/buy/personal-iban', search: `?currency=${currencyName}` }, { setRedirect: true });
  }

  function onSwitchPersonalIbanProvider(provider: PersonalIbanProvider) {
    setProviderOverride({ provider, identity: customerIdentity });
    setAutomaticFrickSuppressed(undefined);
    setFrickKycFallbackHint(undefined);
  }

  function handleShowAvailableIban() {
    setPaymentInfoState(undefined);
    setErrorMessage(undefined);
    setPersonalIbanProviderUnavailable(undefined);
    setContinueWithoutPersonalIban(undefined);
    setProviderOverride(undefined);
    setSuppressPersonalIban({ value: true, identity: customerIdentity });
    setAutomaticFrickSuppressed({ value: true, identity: customerIdentity });
  }

  const rules = Utils.createRules({
    asset: Validations.Required,
    currency: Validations.Required,
  });

  const showsActiveCompletion = showsCompletion && activeCompletedPaymentInfo !== undefined;
  const title = showsActiveCompletion
    ? translate('screens/buy', 'Done!')
    : showsSwitchScreen
    ? translate('screens/buy', 'Switch address')
    : translate('navigation/links', 'Buy');

  useLayoutOptions({
    title,
    backButton: !showsActiveCompletion,
    textStart: true,
  });

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

  // Offer a switch to the OTHER provider next to whichever verified response is currently shown.
  const switchTarget: PersonalIbanProvider | undefined =
    verifiedFrick && yapealAlternative !== undefined
      ? PersonalIbanProvider.YAPEAL
      : hasVerifiedYapealResponse &&
        sentPersonalIbanProvider !== PersonalIbanProvider.FRICK &&
        kycAllowsFrick
      ? PersonalIbanProvider.FRICK
      : undefined;

  // A selector not used for this offer (inapplicable), or a provider-backed response that failed
  // compatibility verification, requires explicit acknowledgement before payment details.
  const needsPersonalIbanAcknowledgement =
    paymentInfo != null &&
    !activeContinueWithoutPersonalIban &&
    ((personalIbanSelector !== undefined &&
      paymentInfoPaymentMethod !== undefined &&
      !isPersonalIbanApplicable(paymentInfo.currency.name, paymentInfoPaymentMethod)) ||
      personalIbanProviderVerificationFailed);

  const isUnrecognizedBlocked =
    validatedData != null &&
    isUnrecognizedPersonalIbanSelector(personalIbanSelector) &&
    errorMessage != null;

  return (
    <>
      {showsSwitchScreen ? (
        <AddressSwitch onClose={(r) => (r ? onAddressSwitch() : setShowsSwitchScreen(false))} />
      ) : showsActiveCompletion && activeCompletedPaymentInfo ? (
        // BuyCompletion treats a missing user as a spinner with no back button. Pass the raw context
        // value because an identity-filtered undefined would strand the customer here.
        <BuyCompletion
          user={user}
          paymentInfo={activeCompletedPaymentInfo}
          navigateOnClose
        />
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
          <StyledVerticalStack gap={8} full center>
            {availableCurrencies && availableAssets && (
              <>
                <StyledVerticalStack gap={2} full>
                  <h2 className="text-dfxGray-700">{translate('screens/buy', 'You spend')}</h2>
                  <StyledHorizontalStack gap={1}>
                    <div className="flex-[3_1_9rem]">
                      <StyledInput
                        type="number"
                        placeholder="0.00"
                        prefix={selectedCurrency && toSymbol(selectedCurrency)}
                        name="amount"
                        forceError={customAmountError != null}
                        forceErrorMessage={customAmountError}
                        loading={isLoading === Side.SPEND}
                        disabled={isLoading === Side.SPEND}
                        full
                      />
                    </div>
                    <div className="flex-[1_0_9rem]">
                      <StyledDropdown<Fiat>
                        rootRef={rootRef}
                        name="currency"
                        placeholder={translate('general/actions', 'Select') + '...'}
                        items={availableCurrencies}
                        labelFunc={(item) => item.name}
                        descriptionFunc={(item) => toDescription(item)}
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
                      <StyledSearchDropdown<Asset>
                        rootRef={rootRef}
                        name="asset"
                        placeholder={translate('general/actions', 'Select') + '...'}
                        items={availableAssets}
                        labelFunc={(item) => item.name}
                        assetIconFunc={(item) => item.name as AssetIconVariant}
                        descriptionFunc={(item) => item.description}
                        filterFunc={(item: Asset, search?: string | undefined) =>
                          !search || item.name.toLowerCase().includes(search.toLowerCase())
                        }
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

                {isLoading && !paymentInfo ? (
                  <StyledVerticalStack center>
                    <StyledLoadingSpinner size={SpinnerSize.LG} />
                  </StyledVerticalStack>
                ) : (
                  <>
                    {kycError && (
                      <QuoteErrorHint type={TransactionType.BUY} error={kycError} message={kycMessageOverride} />
                    )}

                    {isUnrecognizedBlocked && (
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
                      </StyledVerticalStack>
                    )}

                    {errorMessage && !isUnrecognizedBlocked && (
                      <StyledVerticalStack center className="text-center">
                        <ErrorHint message={errorMessage} />

                        {activePersonalIbanProviderUnavailable && (
                          <StyledButton
                            width={StyledButtonWidth.FULL}
                            label={translate('screens/payment', 'Show available IBAN')}
                            onClick={handleShowAvailableIban}
                            color={StyledButtonColor.STURDY_WHITE}
                          />
                        )}

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
                      !customAmountError &&
                      (selectedAsset?.category === AssetCategory.PRIVATE && !flags?.includes('private') ? (
                        <PrivateAssetHint asset={selectedAsset} />
                      ) : needsPersonalIbanAcknowledgement ? (
                        <StyledVerticalStack center className="text-center" gap={4}>
                          <StyledInfoText iconColor={IconColor.BLUE}>
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
                        </StyledVerticalStack>
                      ) : (
                        <>
                          <ExchangeRate
                            exchangeRate={paymentInfo.exchangeRate}
                            rate={paymentInfo.rate}
                            fees={paymentInfo.fees}
                            feeCurrency={paymentInfo.currency}
                            from={paymentInfo.currency}
                            to={paymentInfo.asset}
                            steps={paymentInfo.priceSteps}
                            amountIn={paymentInfo.amount}
                            amountOut={paymentInfo.estimatedAmount}
                            type={TransactionType.BUY}
                          />

                          <div>
                            <PaymentInformationContent
                              info={paymentInfo}
                              showBank={showBank}
                              personalIbanProviderSwitch={
                                switchTarget === undefined
                                  ? undefined
                                  : {
                                      target: switchTarget,
                                      onSwitch: onSwitchPersonalIbanProvider,
                                    }
                              }
                            />
                          </div>
                          <SanctionHint />
                          {activeFrickKycFallbackHint && (
                            <StyledInfoText iconColor={IconColor.BLUE}>
                              {translate(
                                'screens/payment',
                                'Your new Bank Frick IBAN requires KYC level 50 - we are showing your existing IBAN instead.',
                              )}
                            </StyledInfoText>
                          )}
                          {effectivePersonalIban !== undefined &&
                            paymentInfoPaymentMethod !== undefined &&
                            !isPersonalIbanApplicable(
                              paymentInfo.currency.name,
                              paymentInfoPaymentMethod,
                            ) && (
                              <StyledInfoText iconColor={IconColor.BLUE}>
                                {translate(
                                  'screens/payment',
                                  'Your requested personal IBAN is only available for EUR and CHF bank transfers, so it was not used for this offer.',
                                )}
                              </StyledInfoText>
                            )}
                          {!paymentInfo.isPersonalIban &&
                            (selectedCurrency?.name === undefined ||
                              !FRICK_CURRENCIES.includes(selectedCurrency.name)) &&
                            effectivePersonalIban === undefined && (
                              <StyledVerticalStack gap={4}>
                                <h2 className="text-dfxBlue-800 text-center">
                                  {translate('screens/payment', 'New: Personal IBAN in your own name!')}
                                </h2>
                                <StyledInfoText iconColor={IconColor.BLUE}>
                                  {translate(
                                    'screens/payment',
                                    'Personal IBANs are in your own name, which means you make the transfer to yourself instead of DFX AG. Such transactions are often processed faster and more reliably by banks.',
                                  )}
                                </StyledInfoText>
                                <StyledButton
                                  width={StyledButtonWidth.FULL}
                                  label={translate('screens/payment', 'Generate personal IBAN')}
                                  onClick={() => onCreatePersonalIban(paymentInfo.currency.name)}
                                  color={StyledButtonColor.STURDY_WHITE}
                                />
                              </StyledVerticalStack>
                            )}
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
                              label={translate('screens/buy', 'Click here once you have issued the transfer')}
                              onClick={() => onSubmit()}
                              disabled={!isQuoteFinal}
                              isLoading={isConfirming}
                              caps={false}
                              className="mt-4"
                            />
                          </div>
                        </>
                      ))}
                  </>
                )}
              </>
            )}
          </StyledVerticalStack>
        </Form>
        </form>
      )}
    </>
  );
}
