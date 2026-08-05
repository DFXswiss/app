import {
  AccountType,
  ApiError,
  ContactPersonData,
  Country,
  DocumentType,
  GenderType,
  GoodsCategory,
  GoodsType,
  KycAddress,
  KycBeneficialData,
  KycContactData,
  KycFinancialOption,
  KycFinancialQuestion,
  KycFinancialResponse,
  KycInfo,
  KycLevel,
  KycManualIdentData,
  KycNationalityData,
  KycOperationalData,
  KycPersonalData,
  KycRecommendationData,
  KycSession,
  KycSignatoryPowerData,
  KycStepBase,
  KycStepCancelable,
  KycStepName,
  KycStepReason,
  KycStepSession,
  KycStepStatus,
  KycStepType,
  Language,
  LegalEntity,
  MerchantCategory,
  PaymentData,
  QuestionType,
  RecallData,
  SignatoryPower,
  StoreType,
  SupportIssueType,
  UrlType,
  Utils,
  Validations,
  isStepDone,
  useKyc,
  useSessionContext,
  useUserContext,
} from '@dfx.swiss/react';
import {
  DfxIcon,
  Form,
  IconColor,
  IconSize,
  IconVariant,
  SpinnerSize,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledCheckboxRow,
  StyledCollapsible,
  StyledDropdown,
  StyledDropdownMultiChoice,
  StyledFileUpload,
  StyledHorizontalStack,
  StyledIconButton,
  StyledInput,
  StyledLink,
  StyledLoadingSpinner,
  StyledSearchDropdown,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import SumsubWebSdk from '@sumsub/websdk-react';
import { RefObject, useEffect, useState } from 'react';
import { isMobile } from 'react-device-detect';
import { useForm, useWatch } from 'react-hook-form';
import { Trans } from 'react-i18next';
import { FaHandshake } from 'react-icons/fa';
import { useLocation } from 'react-router-dom';
import { DefaultFileTypes } from 'src/config/file-types';
import { Urls } from 'src/config/urls';
import { useAppHandlingContext } from 'src/contexts/app-handling.context';
import { useLayoutContext } from 'src/contexts/layout.context';
import { SumsubReviewAnswer, SumsubReviewRejectType } from 'src/dto/sumsub.dto';
import { useAppParams } from 'src/hooks/app-params.hook';
import { ErrorHint } from '../components/error-hint';
import { KycStepResultHint } from '../components/kyc-step-result-hint';
import { KycStatusTable } from '../components/kyc-status';
import { useSettingsContext } from '../contexts/settings.context';
import { useGeoLocation } from '../hooks/geo-location.hook';
import { useUserGuard } from '../hooks/guard.hook';
import { useKycHelper } from '../hooks/kyc-helper.hook';
import { useLayoutOptions } from '../hooks/layout-config.hook';
import { useNavigation } from '../hooks/navigation.hook';
import { delay, toBase64, url } from '../util/utils';
import { AddressZipValidation } from '../util/validation-rules';
import { IframeMessageType } from './kyc-redirect.screen';

enum Mode {
  KYC = 'KYC',
  CONTACT = 'Contact',
  PROFILE = 'Profile',
}

const RequiredKycLevel = {
  [Mode.CONTACT]: KycLevel.Link,
  [Mode.PROFILE]: KycLevel.Sell,
};

export default function KycScreen(): JSX.Element {
  const { clearParams } = useNavigation();
  const { translate, changeLanguage, processingKycData } = useSettingsContext();
  const { user, reloadUser } = useUserContext();
  const { getKycInfo, continueKyc, startStep, addTransferClient, cancelStep } = useKyc();
  const { nameToString } = useKycHelper();
  const { pathname, search } = useLocation();
  const { navigate, goBack } = useNavigation();
  const { logout } = useSessionContext();
  const { isInitialized, params, setParams } = useAppHandlingContext();
  const { lang } = useAppParams();

  const [info, setInfo] = useState<KycInfo | KycSession>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAutoStarting, setIsAutoStarting] = useState(true);
  const [consentClient, setConsentClient] = useState<string>();
  const [stepInProgress, setStepInProgress] = useState<KycStepSession>();
  const [error, setError] = useState<string>();
  const [showLinkHint, setShowLinkHint] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const { rootRef } = useLayoutContext();

  const mode = pathname.includes('/profile') ? Mode.PROFILE : pathname.includes('/contact') ? Mode.CONTACT : Mode.KYC;
  const urlParams = new URLSearchParams(search);
  const kycStarted = info?.kycSteps.some((s) => s.status !== KycStepStatus.NOT_STARTED);
  const allStepsCompleted = info?.kycSteps.every((s) => isStepDone(s));
  const canContinue = !allStepsCompleted || (info && info.kycLevel >= KycLevel.Completed);

  // params
  const [step, stepSequence] = urlParams.get('step')?.split(':') ?? [];
  const [stepName, stepType] = step?.split('/') ?? [];
  const paramKycCode = urlParams.get('code');
  const kycCode = paramKycCode ?? user?.kyc.hash;
  const redirectUri = urlParams.get('kyc-redirect');
  const client = urlParams.get('client') ?? undefined;

  useUserGuard('/login', !kycCode);

  useEffect(() => {
    if (!lang && info) changeLanguage(info.language);
  }, [info, lang]);

  useEffect(() => {
    if (!isInitialized) return;
    if (params.autoStart !== 'true') {
      setIsAutoStarting(false);
    } else if (!processingKycData && kycCode) {
      onLoad(true).finally(() => {
        setIsAutoStarting(false);
        setParams({ autoStart: undefined });
      });
    }
  }, [isInitialized, kycCode, processingKycData]);

  useEffect(() => {
    if (info) {
      const missingClient = client && !info.kycClients.includes(client) ? client : undefined;

      if (missingClient && (allStepsCompleted || 'currentStep' in info)) {
        setStepInProgress(undefined);
        setConsentClient(missingClient);
      } else if (allStepsCompleted && redirectUri) {
        try {
          const validatedUrl = new URL(redirectUri);

          if (validatedUrl.protocol === 'https:') {
            setIsLoading(true);
            // lgtm[js/client-side-unvalidated-url-redirection] - Trusted KYC partner redirect flow
            window.open(validatedUrl.href, '_self');
          }
        } catch {
          // Invalid URL - ignore redirect
        }
      }
    }
  }, [redirectUri, info, client]);

  useEffect(() => {
    if (!kycCode) return;

    const request = stepName
      ? callKyc(() =>
          startStep(
            kycCode,
            stepName as KycStepName,
            stepType?.toLowerCase() === KycStepType.VIDEO.toLowerCase()
              ? KycStepType.SUMSUB_VIDEO
              : stepType?.toLowerCase() === KycStepType.AUTO.toLowerCase()
                ? KycStepType.SUMSUB_AUTO
                : (stepType as KycStepType),
            stepSequence ? +stepSequence : undefined,
          ),
        )
          .then(handleReload)
          .then(() => clearParams(['step']))
      : callKyc(() => getKycInfo(kycCode)).then(handleInitial);

    request
      .then(() => setError(undefined))
      .catch((error: ApiError) => setError(error.message ?? 'Unknown error'))
      .finally(() => setIsLoading(false));
  }, [kycCode, stepName, stepType]);

  async function onLoad(next: boolean): Promise<void> {
    if (!kycCode) return;

    setIsSubmitting(true);
    setError(undefined);
    setShowLinkHint(false);
    setConsentClient(undefined);
    return (next ? callKyc(() => continueKyc(kycCode)) : callKyc(() => getKycInfo(kycCode)))
      .then(handleReload)
      .catch((error: ApiError) => setError(error.message ?? 'Unknown error'))
      .finally(() => setIsSubmitting(false));
  }

  async function handleInitial(info: KycInfo): Promise<void> {
    if (mode === Mode.KYC) {
      setInfo(info);
    } else {
      if (info.kycLevel >= RequiredKycLevel[mode] || !kycCode) {
        goBack();
      } else {
        return callKyc(() => continueKyc(kycCode)).then(handleReload);
      }
    }
  }

  async function handleReload(info: KycSession): Promise<void> {
    if ((mode === Mode.CONTACT || mode === Mode.PROFILE) && info.kycLevel >= RequiredKycLevel[mode]) {
      return reloadUser()
        .then(() => delay(0.01))
        .then(() => goBack());
    } else {
      setInfo(info);

      if (info.currentStep?.name === KycStepName.CONTACT_DATA && info.currentStep?.status === KycStepStatus.FAILED) {
        info.currentStep.reason === KycStepReason.ACCOUNT_MERGE_REQUESTED
          ? onLink()
          : setError(info.currentStep.reason);
      } else {
        setStepInProgress(info.currentStep);
      }
    }
  }

  async function callKyc<T>(call: () => Promise<T>): Promise<T> {
    return call().catch((e: ApiError) => {
      if (e.statusCode === 401 && 'switchToCode' in e) {
        setIsLoading(true);
        navigate({ search: `?code=${e.switchToCode}` });
        logout();
      } else if (e.code === 'TFA_REQUIRED') {
        setParams({ autoStart: 'true' });
        navigate('/2fa', { setRedirect: true });
      } else if (e.statusCode === 409 && e.message?.includes('exists')) {
        if (e.message.includes('merge')) {
          onLink();
        } else {
          setError(e.message);
        }
      }

      throw e;
    });
  }

  function onLink() {
    setStepInProgress(undefined);
    setShowLinkHint(true);
  }

  function retryLink() {
    setIsLoading(true);
    onLoad(false).finally(() => setIsLoading(false));
  }

  function onContinue() {
    return allStepsCompleted
      ? navigate({ pathname: '/support/issue', search: '?issue-type=LimitRequest' })
      : onLoad(true);
  }

  function onConsent(client: string) {
    if (!kycCode) return;

    setIsSubmitting(true);

    addTransferClient(kycCode, client)
      .then(() => onLoad(true))
      .catch((error: ApiError) => {
        setError(error.message ?? 'Unknown error');
        setIsSubmitting(false);
      });
  }

  const handleBack = () => {
    if (stepInProgress) {
      setStepInProgress(undefined);
    } else if (showLinkHint || consentClient) {
      onLoad(false);
    }
  };

  const handleCancel = () => {
    if (!stepInProgress?.session || !kycCode) return;

    setIsCanceling(true);
    setError(undefined);
    cancelStep(kycCode, stepInProgress.session.url)
      .then(() => onLoad(false))
      .catch((error: ApiError) => setError(error.message ?? 'Unknown error'))
      .finally(() => setIsCanceling(false));
  };

  useLayoutOptions({
    title: stepInProgress ? nameToString(stepInProgress.name) : translate('screens/kyc', 'DFX KYC'),
    backButton: !!(stepInProgress || showLinkHint || consentClient),
    onBack: handleBack,
    noPadding: isMobile && stepInProgress?.session?.type === UrlType.BROWSER,
  });

  return (
    <>
      {isLoading || isAutoStarting ? (
        <StyledLoadingSpinner size={SpinnerSize.LG} />
      ) : showLinkHint ? (
        <StyledVerticalStack gap={6} full>
          <p className="text-dfxGray-700">
            {translate('screens/kyc', 'It looks like you already have an account with DFX.')}{' '}
            {translate(
              'screens/kyc',
              'We have just sent you an email. To continue with your existing account, please confirm your email address by clicking on the link sent.',
            )}
          </p>
          <StyledButton
            width={StyledButtonWidth.MIN}
            label={translate('general/actions', 'OK')}
            onClick={retryLink}
            isLoading={isLoading}
          />
        </StyledVerticalStack>
      ) : consentClient ? (
        <StyledVerticalStack gap={6} full>
          <p className="text-dfxGray-700">
            {translate('screens/kyc', 'I hereby authorize DFX to transfer my KYC data to {{client}}.', {
              client: consentClient,
            })}
          </p>
          <StyledButton
            width={StyledButtonWidth.MIN}
            label={translate('general/actions', 'Next')}
            onClick={() => onConsent(consentClient)}
            isLoading={isSubmitting}
          />
          {error && (
            <div>
              <ErrorHint message={error} />
            </div>
          )}
        </StyledVerticalStack>
      ) : info && stepInProgress && kycCode && !error ? (
        [KycStepStatus.NOT_STARTED, KycStepStatus.IN_PROGRESS].includes(stepInProgress.status) ? (
          <KycEdit
            rootRef={rootRef}
            mode={mode}
            code={kycCode}
            isLoading={isSubmitting}
            step={stepInProgress}
            lang={info.language}
            onDone={() => onLoad(true)}
            onBack={() => onLoad(false)}
            onCancel={KycStepCancelable.includes(stepInProgress.name) ? handleCancel : undefined}
            isCanceling={isCanceling}
            onError={setError}
            showLinkHint={onLink}
          />
        ) : (
          <StyledVerticalStack gap={6} full center>
            <KycStepResultHint step={stepInProgress} />

            <StyledButton
              width={StyledButtonWidth.MIN}
              label={translate('general/actions', 'Continue')}
              isLoading={isSubmitting}
              onClick={() => onLoad(false)}
            />
          </StyledVerticalStack>
        )
      ) : (
        <StyledVerticalStack gap={6} full center>
          {info && (
            <>
              <KycStatusTable
                kycInfo={info}
                tradingLimit={info.tradingLimit}
                showLabel={false}
                onLimitIncrease={canContinue ? onContinue : undefined}
                isLoading={isSubmitting}
              />

              {!allStepsCompleted && (
                <StyledButton
                  width={StyledButtonWidth.MIN}
                  label={translate('general/actions', kycStarted ? 'Continue' : 'Start')}
                  isLoading={isSubmitting}
                  onClick={() => onLoad(true)}
                />
              )}
            </>
          )}
          {error && (
            <div>
              <ErrorHint message={error} />
            </div>
          )}
        </StyledVerticalStack>
      )}
    </>
  );
}

interface EditProps {
  rootRef: RefObject<HTMLDivElement>;
  mode: Mode;
  code: string;
  isLoading: boolean;
  step: KycStepSession;
  lang: Language;
  onDone: () => void;
  onBack: () => void;
  onCancel?: () => void;
  isCanceling?: boolean;
  onError: (error: string) => void;
  showLinkHint: () => void;
}

function KycEdit(props: EditProps): JSX.Element {
  const { translate } = useSettingsContext();

  switch (props.step.name) {
    case KycStepName.CONTACT_DATA:
      return <ContactData {...props} />;

    case KycStepName.PERSONAL_DATA:
      return <PersonalData {...props} />;

    case KycStepName.LEGAL_ENTITY:
      return <LegalEntityData {...props} />;

    case KycStepName.COMMERCIAL_REGISTER:
      // commercial register step is merged into legal entity
      return <></>;

    case KycStepName.SOLE_PROPRIETORSHIP_CONFIRMATION:
      return (
        <FileUpload
          {...props}
          hint={translate(
            'screens/kyc',
            'Commercial register extract, trade license/permit, AHV confirmation, or another document proving the existence of the business',
          )}
        />
      );

    case KycStepName.OWNER_DIRECTORY: {
      const urls = {
        EN: 'https://docs.google.com/document/d/1ICxt-RZihMyiz486NMS4gEJZdgrZG_LVTuDiLMbzyC0/edit',
        DE: 'https://docs.google.com/document/d/11m3MkP0RALZFYRoxZNdY0SwVv8oN3Vl_gzXaIO_YIxY/edit',
        FR: 'https://docs.google.com/document/d/1uRV6Z1D6FYmF6VQZLfXK8GniR7hf5a9phBRqGNYlqW4/edit',
      };

      return <FileUpload {...props} templateUrls={urls} />;
    }

    case KycStepName.NATIONALITY_DATA:
      return <NationalityData {...props} />;

    case KycStepName.RECOMMENDATION:
      return <RecommendationData {...props} />;

    case KycStepName.SIGNATORY_POWER:
      return <SignatoryPowerData {...props} />;

    case KycStepName.AUTHORITY: {
      const urls = {
        EN: 'https://docs.google.com/document/d/1PKk0XvX6v7wdcO-bjCVJXj56uuIlDToca6Zpzff_t6g/edit',
        DE: 'https://docs.google.com/document/d/1Sqob5OAM93Uwni7U099XOXxztytXfN6i6upO9ymDgGw/edit',
        FR: 'https://docs.google.com/document/d/17H2f0gAlNpp8e_1aEE6jTbEHbQnoLgr821yWfaSElms/edit',
      };

      return <FileUpload {...props} templateUrls={urls} />;
    }

    case KycStepName.BENEFICIAL_OWNER:
      return <BeneficialOwner {...props} />;

    case KycStepName.OPERATIONAL_ACTIVITY:
      return <OperationalActivity {...props} />;

    case KycStepName.IDENT:
      if (props.step.type === KycStepType.MANUAL) {
        return <ManualIdent {...props} />;
      } else {
        return <Ident {...props} />;
      }

    case KycStepName.FINANCIAL_DATA:
      return <FinancialData {...props} />;

    case KycStepName.ADDITIONAL_DOCUMENTS:
      return <FileUpload {...props} />;

    case KycStepName.RESIDENCE_PERMIT:
      return <FileUpload {...props} />;

    case KycStepName.STATUTES:
      return <FileUpload {...props} />;

    case KycStepName.DFX_APPROVAL:
      return <></>;

    case KycStepName.PAYMENT_AGREEMENT:
      return <PaymentAgreement {...props} />;

    case KycStepName.RECALL_AGREEMENT:
      return <RecallAgreement {...props} />;

    case KycStepName.PHONE_CHANGE:
      return <PhoneChangeData {...props} />;

    case KycStepName.ADDRESS_CHANGE:
      return <AddressChangeData {...props} />;

    case KycStepName.NAME_CHANGE:
      return <NameChangeData {...props} />;

    default:
      return <></>;
  }
}

function ContactData({ code, mode, isLoading, step, onDone, onBack, showLinkHint }: EditProps): JSX.Element {
  const { translate, translateError } = useSettingsContext();
  const { setContactData } = useKyc();

  const [isUpdating, setIsUpdating] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingData, setPendingData] = useState<KycContactData>();
  const [error, setError] = useState<string>();

  const {
    control,
    handleSubmit,
    formState: { isValid, errors },
  } = useForm<KycContactData>({ mode: 'onTouched' });

  function showMailConfirmation(data: KycContactData): void {
    setPendingData(data);
    setShowConfirmation(true);
  }

  function onSubmit(data: KycContactData): void {
    if (!step.session) return;

    setIsUpdating(true);
    setError(undefined);
    setContactData(code, step.session.url, data)
      .then((r) => {
        if (isStepDone(r)) {
          onDone();
        } else if (r.status === KycStepStatus.FAILED) {
          r.reason === KycStepReason.ACCOUNT_MERGE_REQUESTED ? showLinkHint() : setError(r.reason);
        }
      })
      .finally(() => setIsUpdating(false));
  }

  const rules = Utils.createRules({
    mail: [Validations.Required, Validations.Mail],
  });

  return (
    <StyledVerticalStack gap={6} full>
      {error ? (
        <div>
          <ErrorHint message={error} onBack={onBack} />
        </div>
      ) : showConfirmation && pendingData ? (
        <StyledVerticalStack gap={6} full center>
          <p className="text-dfxGray-700">{translate('screens/kyc', 'Is this email address correct?')}</p>
          <p className="text-lg font-bold text-dfxBlue-800 break-all">{pendingData.mail}</p>

          <StyledHorizontalStack gap={4} spanAcross>
            <StyledButton
              label={translate('general/actions', 'Change')}
              onClick={() => setShowConfirmation(false)}
              color={StyledButtonColor.STURDY_WHITE}
              width={StyledButtonWidth.FULL}
            />
            <StyledButton
              label={translate('general/actions', 'Confirm')}
              onClick={() => onSubmit(pendingData)}
              width={StyledButtonWidth.FULL}
              isLoading={isUpdating || isLoading}
            />
          </StyledHorizontalStack>
        </StyledVerticalStack>
      ) : (
        <Form
          control={control}
          rules={rules}
          errors={errors}
          onSubmit={handleSubmit(showMailConfirmation)}
          translate={translateError}
        >
          <StyledVerticalStack gap={6} full center>
            {mode !== Mode.KYC && (
              <>
                <DfxIcon icon={IconVariant.USER_DATA} color={IconColor.BLUE} />
                <p className="text-base font-bold text-dfxBlue-800">
                  {translate('screens/kyc', 'Please fill in personal information to continue')}
                </p>
              </>
            )}

            <StyledInput
              name="mail"
              autocomplete="email"
              type="email"
              label={translate('screens/kyc', 'Email address')}
              placeholder={translate('screens/kyc', 'example@mail.com')}
              full
            />

            <StyledButton
              type="submit"
              label={translate('general/actions', 'Next')}
              onClick={handleSubmit(showMailConfirmation)}
              width={StyledButtonWidth.FULL}
              disabled={!isValid}
              isLoading={isUpdating || isLoading}
            />
          </StyledVerticalStack>
        </Form>
      )}
    </StyledVerticalStack>
  );
}

function PersonalData({ rootRef, mode, code, isLoading, step, onDone, onBack }: EditProps): JSX.Element {
  const { allowedCountries, allowedOrganizationCountries, translate, translateError } = useSettingsContext();
  const { setPersonalData } = useKyc();
  const { accountTypeToString } = useKycHelper();

  const { countryCode } = useGeoLocation();

  const [countries, setCountries] = useState<Country[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string>();

  const {
    control,
    handleSubmit,
    getValues,
    reset,
    formState: { isValid, errors },
  } = useForm<KycPersonalData>({ mode: 'onTouched', defaultValues: { organizationAddress: {} } });

  const selectedAccountType = useWatch({ control, name: 'accountType' });

  useEffect(() => {
    if (!selectedAccountType) return;

    const countries = selectedAccountType === AccountType.PERSONAL ? allowedCountries : allowedOrganizationCountries;
    const ipCountry = countries.find((c) => c.symbol === countryCode);

    reset({
      ...getValues(),
      accountType: selectedAccountType,
      address: {
        street: undefined,
        zip: undefined,
        city: undefined,
        country: ipCountry,
      },
      organizationAddress: {
        street: undefined,
        zip: undefined,
        city: undefined,
        country: undefined,
      },
    });

    setCountries(countries);
  }, [selectedAccountType, countryCode, allowedCountries, allowedOrganizationCountries]);

  function onSubmit(data: KycPersonalData) {
    if (!step.session) return;

    setIsUpdating(true);
    setError(undefined);
    setPersonalData(code, step.session.url, data)
      .then(() => (mode === Mode.KYC ? onDone() : onBack()))
      .catch((error: ApiError) => setError(error.message ?? 'Unknown error'))
      .finally(() => setIsUpdating(false));
  }

  const rules = Utils.createRules({
    accountType: Validations.Required,

    firstName: Validations.Required,
    lastName: Validations.Required,
    phone: [Validations.Required, Validations.Phone],

    ['address.street']: Validations.Required,
    ['address.zip']: AddressZipValidation,
    ['address.city']: Validations.Required,
    ['address.country']: Validations.Required,

    organizationName: Validations.Required,
    ['organizationAddress.street']: Validations.Required,
    ['organizationAddress.city']: Validations.Required,
    ['organizationAddress.zip']: AddressZipValidation,
    ['organizationAddress.country']: Validations.Required,
  });

  return (
    <Form control={control} rules={rules} errors={errors} onSubmit={handleSubmit(onSubmit)} translate={translateError}>
      <StyledVerticalStack gap={6} full center>
        <StyledVerticalStack gap={2} full>
          <p className="text-dfxGray-700 text-xs font-semibold uppercase text-start ml-3">
            {translate('screens/kyc', 'Account Type')}
          </p>
          <StyledDropdown
            rootRef={rootRef}
            name="accountType"
            label=""
            placeholder={translate('general/actions', 'Select') + '...'}
            items={Object.values(AccountType)}
            labelFunc={(item) => translate('screens/kyc', accountTypeToString(item))}
          />
        </StyledVerticalStack>
        {selectedAccountType && (
          <>
            <StyledVerticalStack gap={2} full>
              <p className="text-dfxGray-700 text-xs font-semibold uppercase text-start ml-3">
                {translate('screens/kyc', 'Personal Information')}
              </p>
              <StyledHorizontalStack gap={2}>
                <StyledInput
                  name="firstName"
                  autocomplete="firstname"
                  label={translate('screens/kyc', 'First name')}
                  placeholder={translate('screens/kyc', 'John')}
                  full
                  smallLabel
                />
                <StyledInput
                  name="lastName"
                  autocomplete="lastname"
                  label={translate('screens/kyc', 'Last name')}
                  placeholder={translate('screens/kyc', 'Doe')}
                  full
                  smallLabel
                />
              </StyledHorizontalStack>
              <StyledHorizontalStack gap={2}>
                <StyledInput
                  name="address.street"
                  autocomplete="street"
                  label={translate('screens/kyc', 'Street')}
                  placeholder={translate('screens/kyc', 'Street')}
                  full
                  smallLabel
                />
                <StyledInput
                  name="address.houseNumber"
                  autocomplete="house-number"
                  label={translate('screens/kyc', 'House nr.')}
                  placeholder="xx"
                  small
                  smallLabel
                />
              </StyledHorizontalStack>
              <StyledHorizontalStack gap={2}>
                <StyledInput
                  name="address.zip"
                  autocomplete="zip"
                  label={translate('screens/kyc', 'ZIP code')}
                  placeholder="12345"
                  small
                  smallLabel
                />
                <StyledInput
                  name="address.city"
                  autocomplete="city"
                  label={translate('screens/kyc', 'City')}
                  placeholder="Berlin"
                  full
                  smallLabel
                />
              </StyledHorizontalStack>
              <StyledSearchDropdown<Country>
                rootRef={rootRef}
                name="address.country"
                autocomplete="country"
                label={translate('screens/kyc', 'Country')}
                placeholder={translate('general/actions', 'Select') + '...'}
                items={countries}
                labelFunc={(item) => item.name}
                filterFunc={(i, s) => !s || [i.name, i.symbol].some((w) => w.toLowerCase().includes(s.toLowerCase()))}
                matchFunc={(i, s) => i.name.toLowerCase() === s?.toLowerCase()}
                smallLabel
              />
              <StyledInput
                name="phone"
                autocomplete="phone"
                type="tel"
                label={translate('screens/kyc', 'Mobile number')}
                placeholder="+49 12345678"
                smallLabel
              />
            </StyledVerticalStack>

            {selectedAccountType !== AccountType.PERSONAL && (
              <StyledVerticalStack gap={2} full>
                <p className="text-dfxGray-700 text-xs font-semibold uppercase text-start ml-3">
                  {translate('screens/kyc', 'Organization Information')}
                </p>
                <StyledInput
                  name="organizationName"
                  autocomplete="organization-name"
                  label={translate('screens/kyc', 'Organization name')}
                  placeholder={translate('screens/kyc', 'Example inc.')}
                  full
                  smallLabel
                />
                <StyledHorizontalStack gap={2}>
                  <StyledInput
                    name="organizationAddress.street"
                    autocomplete="street"
                    label={translate('screens/kyc', 'Street')}
                    placeholder={translate('screens/kyc', 'Street')}
                    full
                    smallLabel
                  />
                  <StyledInput
                    name="organizationAddress.houseNumber"
                    autocomplete="house-number"
                    label={translate('screens/kyc', 'House nr.')}
                    placeholder="xx"
                    small
                    smallLabel
                  />
                </StyledHorizontalStack>
                <StyledHorizontalStack gap={2}>
                  <StyledInput
                    name="organizationAddress.zip"
                    autocomplete="zip"
                    type="number"
                    label={translate('screens/kyc', 'ZIP code')}
                    placeholder="12345"
                    small
                    smallLabel
                  />
                  <StyledInput
                    name="organizationAddress.city"
                    autocomplete="city"
                    label={translate('screens/kyc', 'City')}
                    placeholder="Berlin"
                    full
                    smallLabel
                  />
                </StyledHorizontalStack>
                <StyledSearchDropdown<Country>
                  rootRef={rootRef}
                  name="organizationAddress.country"
                  autocomplete="country"
                  label={translate('screens/kyc', 'Country')}
                  placeholder={translate('general/actions', 'Select') + '...'}
                  items={countries}
                  labelFunc={(item) => item.name}
                  filterFunc={(i, s) => !s || [i.name, i.symbol].some((w) => w.toLowerCase().includes(s.toLowerCase()))}
                  matchFunc={(i, s) => i.name.toLowerCase() === s?.toLowerCase()}
                  smallLabel
                />
              </StyledVerticalStack>
            )}

            {error && (
              <div>
                <ErrorHint message={error} />
              </div>
            )}

            <StyledButton
              type="submit"
              label={translate('general/actions', 'Next')}
              onClick={handleSubmit(onSubmit)}
              width={StyledButtonWidth.FULL}
              disabled={!isValid}
              isLoading={isUpdating || isLoading}
            />
          </>
        )}
      </StyledVerticalStack>
    </Form>
  );
}

interface LegalEntityFormData {
  legalEntity: LegalEntity;
  file: File;
}

function LegalEntityData({ rootRef, code, isLoading, step, onDone }: EditProps): JSX.Element {
  const { translate, translateError } = useSettingsContext();
  const { setLegalEntityData } = useKyc();
  const { legalEntityToString, legalEntityToDescription } = useKycHelper();

  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string>();

  const {
    control,
    handleSubmit,
    formState: { isValid, errors },
  } = useForm<LegalEntityFormData>({ mode: 'onTouched' });

  async function onSubmit(data: LegalEntityFormData) {
    if (!step.session) return;

    const file = data.file && (await toBase64(data.file));
    if (!file) {
      setError('No file selected');
      return;
    }

    const fileName = data.file.name;

    setIsUpdating(true);
    setError(undefined);
    setLegalEntityData(code, step.session.url, { legalEntity: data.legalEntity, file, fileName })
      .then(onDone)
      .catch((error: ApiError) => setError(error.message ?? 'Unknown error'))
      .finally(() => setIsUpdating(false));
  }

  const rules = Utils.createRules({
    legalEntity: Validations.Required,
  });

  return (
    <Form control={control} rules={rules} errors={errors} onSubmit={handleSubmit(onSubmit)} translate={translateError}>
      <StyledVerticalStack gap={6} full center>
        <StyledVerticalStack gap={2} full center>
          <p className="w-full text-dfxGray-700 text-xs font-semibold uppercase text-start ml-3">
            {translate('screens/kyc', 'Legal entity')}
          </p>
          <StyledDropdown
            rootRef={rootRef}
            name="legalEntity"
            full
            label=""
            placeholder={translate('general/actions', 'Select') + '...'}
            items={Object.values(LegalEntity)}
            labelFunc={(item) => legalEntityToString(item)}
            descriptionFunc={(item) => legalEntityToDescription(item) ?? ''}
          />
        </StyledVerticalStack>

        <StyledVerticalStack gap={2} full>
          <p className="text-dfxGray-700 text-xs font-semibold uppercase text-start ml-3">
            {translate('screens/kyc', 'Commercial register')}
          </p>
          <StyledFileUpload
            name="file"
            label=""
            placeholder={translate('general/actions', 'Drop files here')}
            buttonLabel={translate('general/actions', 'Browse')}
            full
          />

          <div className="text-dfxGray-700 text-sm">
            {translate(
              'screens/kyc',
              'An internet excerpt is sufficient. No notarization is required. The extract must not be older than 2 months.',
            )}
          </div>
        </StyledVerticalStack>

        {error && (
          <div>
            <ErrorHint message={error} />
          </div>
        )}

        <StyledButton
          type="submit"
          label={translate('general/actions', 'Next')}
          onClick={handleSubmit(onSubmit)}
          width={StyledButtonWidth.FULL}
          disabled={!isValid}
          isLoading={isUpdating || isLoading}
        />
      </StyledVerticalStack>
    </Form>
  );
}

function NationalityData({ rootRef, code, isLoading, step, onDone }: EditProps): JSX.Element {
  const { nationalityCountries, translate, translateError } = useSettingsContext();
  const { setNationalityData } = useKyc();

  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string>();

  const {
    control,
    handleSubmit,
    formState: { isValid, errors },
  } = useForm<KycNationalityData>({ mode: 'onTouched' });

  function onSubmit(data: KycNationalityData) {
    if (!step.session) return;

    setIsUpdating(true);
    setError(undefined);
    setNationalityData(code, step.session.url, data)
      .then(onDone)
      .catch((error: ApiError) => setError(error.message ?? 'Unknown error'))
      .finally(() => setIsUpdating(false));
  }

  const rules = Utils.createRules({
    nationality: Validations.Required,
  });

  return (
    <Form control={control} rules={rules} errors={errors} onSubmit={handleSubmit(onSubmit)} translate={translateError}>
      <StyledVerticalStack gap={6} full center>
        <StyledVerticalStack gap={2} full center>
          <p className="w-full text-dfxGray-700 text-xs font-semibold uppercase text-start ml-3">
            {translate('screens/kyc', 'Nationality (according to identification document)')}
          </p>
          {
            <StyledSearchDropdown
              rootRef={rootRef}
              full
              name="nationality"
              autocomplete="nationality"
              label=""
              placeholder={translate('general/actions', 'Select') + '...'}
              items={nationalityCountries ?? []}
              labelFunc={(item) => item.name}
              filterFunc={(i, s) => !s || [i.name, i.symbol].some((w) => w.toLowerCase().includes(s.toLowerCase()))}
              matchFunc={(i, s) => i.name.toLowerCase() === s?.toLowerCase()}
            />
          }
        </StyledVerticalStack>

        {error && (
          <div>
            <ErrorHint message={error} />
          </div>
        )}

        <StyledButton
          type="submit"
          label={translate('general/actions', 'Next')}
          onClick={handleSubmit(onSubmit)}
          width={StyledButtonWidth.FULL}
          disabled={!isValid}
          isLoading={isUpdating || isLoading}
        />
      </StyledVerticalStack>
    </Form>
  );
}

function RecommendationData({ code, isLoading, step, onDone }: EditProps): JSX.Element {
  const { translate, translateError } = useSettingsContext();
  const { setRecommendationData } = useKyc();

  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string>();
  const [keyError, setKeyError] = useState<string>();

  const {
    control,
    handleSubmit,
    formState: { isValid, errors },
  } = useForm<KycRecommendationData>({ mode: 'onTouched' });

  function onSubmit(data: KycRecommendationData) {
    if (!step.session) return;

    setIsUpdating(true);
    setError(undefined);
    setKeyError(undefined);

    setRecommendationData(code, step.session.url, data)
      .then(onDone)
      .catch((error: ApiError) => {
        if (error.statusCode === 404) {
          setKeyError('No matching user found');
        } else if (error.statusCode === 400) {
          if (error.message.toLowerCase().includes('recommendation code')) {
            setKeyError('Invalid invitation code');
          } else {
            setKeyError('Invalid key');
          }
        } else {
          setError(error.message ?? 'Unknown error');
        }
      })
      .finally(() => setIsUpdating(false));
  }

  const rules = Utils.createRules({
    key: Validations.Required,
  });

  const faqs = [
    {
      question: 'How can I become a DFX customer?',
      answer:
        'Opening an account with DFX is only possible through a referral. You need either the ref code, ref link, or email address of an existing customer. This person serves as your point of contact and must additionally confirm their referral. Once this confirmation is received, you can complete your onboarding and use your DFX account.',
    },
    {
      question: 'What is a referral code?',
      answer:
        'A referral code is your personal code at DFX. When someone registers using your code or ref link and successfully completes the KYC process, the connection is automatically recognized.',
    },
    {
      question: 'Who can make a referral?',
      answer: 'Referrals can be made by all customers who already have an account with DFX.',
    },
    {
      question: 'Why does DFX only accept new customers by referral?',
      answer:
        'DFX uses a referral system to ensure a safe and trustworthy environment. New customers can only open an account through an existing customer who already uses and trusts DFX. This makes onboarding safer, prevents abuse, and maintains the quality of our community in the long term.',
    },
    {
      question: 'What risks in the crypto space should I know about beforehand?',
      answer:
        'The crypto market is very volatile, and losses can occur quickly. Common mistakes include sending coins to the wrong address, losing access credentials, or clicking on phishing links. Additionally, fraudulent projects and a constantly changing legal framework pose additional risks. A basic understanding of the processes helps to avoid these mistakes and navigate the crypto world more safely.',
    },
    {
      question: 'What happens if the referral is not confirmed?',
      answer:
        'If your referral is not confirmed by your contact person, your onboarding is considered incomplete and an account cannot be set up.',
    },
    {
      question: 'Can I complete the onboarding without a referral?',
      answer:
        'No. Onboarding at DFX is only possible through a referral. You need the ref code, ref link, or email address of an existing customer who confirms your registration.',
    },
  ];

  return (
    <Form control={control} rules={rules} errors={errors} onSubmit={handleSubmit(onSubmit)} translate={translateError}>
      <StyledVerticalStack gap={6} full center>
        <FaHandshake className="text-dfxBlue-800" size={40} />
        <p className="text-base font-bold text-dfxBlue-800">
          {translate('screens/kyc', 'How did you hear about DFX?')}
        </p>

        <div className="text-dfxGray-700 w-full text-sm text-left">
          {translate(
            'screens/kyc',
            'Please enter the email address or referral code of your contact person. This lets us know you have a trusted contact to guide you into the crypto space.',
          )}
        </div>

        <StyledInput
          name="key"
          placeholder={translate('screens/kyc', 'Invitation/referral code or email')}
          full
          forceError={!!keyError}
          forceErrorMessage={keyError && translate('screens/kyc', keyError)}
        />

        <StyledButton
          type="submit"
          label={translate('general/actions', 'Next')}
          onClick={handleSubmit(onSubmit)}
          width={StyledButtonWidth.FULL}
          disabled={!isValid}
          isLoading={isUpdating || isLoading}
        />

        {error && (
          <div>
            <ErrorHint message={error} />
          </div>
        )}

        <StyledVerticalStack gap={2} full>
          <p className="text-base font-bold text-dfxBlue-800">{translate('screens/kyc', 'FAQ')}</p>
          {faqs.map((faq) => (
            <StyledCollapsible
              key={faq.question}
              full
              titleContent={
                <p className="text-dfxBlue-800 font-semibold text-left">{translate('screens/kyc', faq.question)}</p>
              }
            >
              <p className="text-dfxGray-700 text-sm">{translate('screens/kyc', faq.answer)}</p>
            </StyledCollapsible>
          ))}
        </StyledVerticalStack>
      </StyledVerticalStack>
    </Form>
  );
}

interface FormDataFile {
  file: File;
}

interface FileUploadProps extends EditProps {
  templateUrls?: { [lang: string]: string };
  hint?: string;
}

function FileUpload({ code, isLoading, step, onDone, templateUrls, hint }: FileUploadProps): JSX.Element {
  const { translate, translateError, language } = useSettingsContext();
  const { nameToString } = useKycHelper();
  const { setFileData } = useKyc();

  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string>();

  const templateUrl = language && templateUrls && (templateUrls[language.symbol] ?? templateUrls.EN);

  const {
    control,
    handleSubmit,
    resetField,
    formState: { isValid, errors },
  } = useForm<FormDataFile>({ mode: 'onChange' });

  async function onSubmit(data: FormDataFile) {
    if (!step.session) return;

    const file = data.file && (await toBase64(data.file));
    if (!file) {
      setError('No file selected');
      return;
    }

    const fileName = data.file.name;

    setIsUpdating(true);
    setError(undefined);
    setFileData(code, step.session.url, { file, fileName })
      .then(onDone)
      .catch((error: ApiError) => setError(error.message ?? 'Unknown error'))
      .finally(() => {
        setIsUpdating(false);
        resetField('file');
      });
  }

  const rules = Utils.createRules({
    file: [
      Validations.Required,
      Validations.Custom((file) => (!file || DefaultFileTypes.includes(file.type) ? true : 'file_type')),
    ],
  });

  return (
    <Form control={control} rules={rules} errors={errors} onSubmit={handleSubmit(onSubmit)} translate={translateError}>
      <StyledVerticalStack gap={6} full center>
        <StyledVerticalStack gap={2} full>
          <p className="text-dfxGray-700 text-xs font-semibold uppercase text-start ml-3">
            {translate('screens/kyc', nameToString(step.name))}
          </p>
          <StyledFileUpload
            name="file"
            label=""
            placeholder={translate('general/actions', 'Drop files here')}
            buttonLabel={translate('general/actions', 'Browse')}
            full
          />
        </StyledVerticalStack>

        {templateUrl && (
          <StyledButton
            type="button"
            label={translate('screens/kyc', 'Document template')}
            onClick={() => window.open(templateUrl, '_blank')}
            width={StyledButtonWidth.FULL}
            color={StyledButtonColor.GRAY_OUTLINE}
          />
        )}

        {hint && <div className="text-dfxGray-700 text-sm">{hint}</div>}

        {error && (
          <div>
            <ErrorHint message={error} />
          </div>
        )}

        <StyledButton
          type="submit"
          label={translate('general/actions', 'Next')}
          onClick={handleSubmit(onSubmit)}
          width={StyledButtonWidth.FULL}
          disabled={!isValid}
          isLoading={isUpdating || isLoading}
        />
      </StyledVerticalStack>
    </Form>
  );
}

function SignatoryPowerData({ rootRef, code, isLoading, step, onDone }: EditProps): JSX.Element {
  const { translate, translateError } = useSettingsContext();
  const { setSignatoryPowerData } = useKyc();
  const { signatoryPowerToString } = useKycHelper();

  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string>();

  const {
    control,
    handleSubmit,
    formState: { isValid, errors },
  } = useForm<KycSignatoryPowerData>({ mode: 'onTouched' });

  function onSubmit(data: KycSignatoryPowerData) {
    if (!step.session) return;

    setIsUpdating(true);
    setError(undefined);
    setSignatoryPowerData(code, step.session.url, data)
      .then(onDone)
      .catch((error: ApiError) => setError(error.message ?? 'Unknown error'))
      .finally(() => setIsUpdating(false));
  }

  const rules = Utils.createRules({
    signatoryPower: Validations.Required,
  });

  return (
    <Form control={control} rules={rules} errors={errors} onSubmit={handleSubmit(onSubmit)} translate={translateError}>
      <StyledVerticalStack gap={6} full center>
        <StyledVerticalStack gap={2} full center>
          <p className="w-full text-dfxGray-700 text-xs font-semibold uppercase text-start ml-3">
            {translate('screens/kyc', 'Signatory power')}
          </p>
          <StyledDropdown
            rootRef={rootRef}
            name="signatoryPower"
            full
            label=""
            placeholder={translate('general/actions', 'Select') + '...'}
            items={Object.values(SignatoryPower)}
            labelFunc={(item) => signatoryPowerToString(item)}
          />
        </StyledVerticalStack>

        {error && (
          <div>
            <ErrorHint message={error} />
          </div>
        )}

        <StyledButton
          type="submit"
          label={translate('general/actions', 'Next')}
          onClick={handleSubmit(onSubmit)}
          width={StyledButtonWidth.FULL}
          disabled={!isValid}
          isLoading={isUpdating || isLoading}
        />
      </StyledVerticalStack>
    </Form>
  );
}

enum BeneficialDataStep {
  OWNER_COUNT = 'OwnerCount',
  ACCOUNT_HOLDER_INVOLVED = 'AccountHolderInvolved',
  CONTACT_DATA = 'ContactData',
}

interface BeneficialOwnerFormData {
  ownerCount: number;
  isAccountHolderInvolved: boolean;
  owners?: ContactPersonData[];
  director?: ContactPersonData;
}

function BeneficialOwner({ rootRef, code, isLoading, step, onDone }: EditProps): JSX.Element {
  const { translate, translateError, allowedCountries } = useSettingsContext();
  const { setBeneficialData } = useKyc();

  const [currentStep, setCurrentStep] = useState(BeneficialDataStep.OWNER_COUNT);
  const [ownerIndex, setOwnerIndex] = useState(0);

  const [reload, setReload] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string>();

  const {
    control,
    handleSubmit,
    formState: { isValid, errors },
    setValue,
  } = useForm<BeneficialOwnerFormData>({ mode: 'onTouched' });

  const maxOwnerCount = 4;
  const ownerCount = useWatch({ control, name: 'ownerCount' });
  const isAccountHolderInvolved = useWatch({ control, name: 'isAccountHolderInvolved' });
  const currentOwner = ownerIndex + 1 + (isAccountHolderInvolved ? 1 : 0);

  function onSubmit(formData: BeneficialOwnerFormData) {
    if (!step.session) return;

    setError(undefined);

    const requiredOwnerCount = ownerCount - (formData.isAccountHolderInvolved ? 1 : 0);

    switch (currentStep) {
      case BeneficialDataStep.OWNER_COUNT:
        if (ownerCount === 0) {
          setValue('owners', undefined);
        } else {
          setValue('director', undefined);
        }
        setCurrentStep(BeneficialDataStep.ACCOUNT_HOLDER_INVOLVED);
        clearInputs();
        return;

      case BeneficialDataStep.ACCOUNT_HOLDER_INVOLVED:
        if ((ownerCount === 0 && !formData.isAccountHolderInvolved) || requiredOwnerCount > 0) {
          setCurrentStep(BeneficialDataStep.CONTACT_DATA);
          clearInputs();
          return;
        }
        break;

      case BeneficialDataStep.CONTACT_DATA:
        if (ownerIndex + 1 < requiredOwnerCount) {
          setOwnerIndex((i) => (i ?? -1) + 1);
          clearInputs();
          return;
        }
        break;
    }

    const data: KycBeneficialData = {
      hasBeneficialOwners: ownerCount > 0,
      isAccountHolderInvolved: formData.isAccountHolderInvolved,
      beneficialOwners: formData.owners,
      managingDirector: formData.director,
    };

    setIsUpdating(true);
    setBeneficialData(code, step.session.url, data)
      .then(onDone)
      .catch((error: ApiError) => setError(error.message ?? 'Unknown error'))
      .finally(() => setIsUpdating(false));
  }

  function clearInputs() {
    // reload input fields to trigger UI refresh
    setReload(true);
    setTimeout(() => setReload(false));
  }

  function back() {
    switch (currentStep) {
      case BeneficialDataStep.ACCOUNT_HOLDER_INVOLVED:
        setCurrentStep(BeneficialDataStep.OWNER_COUNT);
        break;

      case BeneficialDataStep.CONTACT_DATA:
        if (ownerIndex) {
          setOwnerIndex((i) => i - 1);
        } else {
          setCurrentStep(BeneficialDataStep.ACCOUNT_HOLDER_INVOLVED);
        }
        break;
    }

    clearInputs();
  }

  const rules = Utils.createRules({
    ownerCount: Validations.Required,
    isAccountHolderInvolved: Validations.Custom((v) => (v == null ? 'required' : true)),

    ...Array.from({ length: maxOwnerCount })
      .map((_, i) => i)
      .map((c) => ({
        [`owners.${c}.firstName`]: Validations.Required,
        [`owners.${c}.lastName`]: Validations.Required,
        [`owners.${c}.street`]: Validations.Required,
        [`owners.${c}.zip`]: Validations.Required,
        [`owners.${c}.city`]: Validations.Required,
        [`owners.${c}.country`]: Validations.Required,
      }))
      .reduce((prev, curr) => ({ ...prev, ...curr })),

    [`director.firstName`]: Validations.Required,
    [`director.lastName`]: Validations.Required,
    [`director.street`]: Validations.Required,
    [`director.zip`]: Validations.Required,
    [`director.city`]: Validations.Required,
    [`director.country`]: Validations.Required,
  });

  const contactPersonLabel =
    ownerCount === 0
      ? translate('screens/kyc', 'Managing director')
      : translate('screens/kyc', 'Beneficial owner') +
        (currentOwner === 1 && ownerCount === 1 ? '' : ` ${currentOwner}/${ownerCount}`);
  const contactPersonPrefix = ownerCount === 0 ? 'director' : `owners.${ownerIndex}`;

  return (
    <Form control={control} rules={rules} errors={errors} onSubmit={handleSubmit(onSubmit)} translate={translateError}>
      {!reload && (
        <StyledVerticalStack gap={6} full center>
          {currentStep === BeneficialDataStep.OWNER_COUNT ? (
            <StyledVerticalStack gap={2} full center>
              <p className="w-full text-dfxGray-700 text-xs font-semibold uppercase text-start ml-3">
                {translate(
                  'screens/kyc',
                  'How many natural persons are there who directly or indirectly hold 25% or more of company shares?',
                )}
              </p>
              <StyledDropdown
                rootRef={rootRef}
                name="ownerCount"
                full
                label=""
                placeholder={translate('general/actions', 'Select') + '...'}
                items={Array.from({ length: maxOwnerCount + 1 }).map((_, i) => i)}
                labelFunc={(item) => (item ? `${item}` : translate('screens/kyc', 'None'))}
              />
            </StyledVerticalStack>
          ) : currentStep === BeneficialDataStep.ACCOUNT_HOLDER_INVOLVED ? (
            <StyledVerticalStack gap={2} full center>
              <p className="w-full text-dfxGray-700 text-xs font-semibold uppercase text-start ml-3">
                {translate('screens/kyc', 'Is the account holder {{name}}{{role}}?', {
                  name: step.session?.additionalInfo?.accountHolder
                    ? `(${step.session?.additionalInfo?.accountHolder}) `
                    : '',
                  role:
                    ownerCount === 0
                      ? translate('screens/kyc', 'the managing director')
                      : translate('screens/kyc', 'a beneficial owner'),
                })}
              </p>
              <StyledDropdown
                rootRef={rootRef}
                name="isAccountHolderInvolved"
                full
                label=""
                placeholder={translate('general/actions', 'Select') + '...'}
                items={[true, false]}
                labelFunc={(item) => translate('general/actions', item ? 'Yes' : 'No')}
              />
            </StyledVerticalStack>
          ) : (
            <StyledVerticalStack gap={2} full>
              <p className="text-dfxGray-700 text-xs font-semibold uppercase text-start ml-3">{contactPersonLabel}</p>
              <StyledHorizontalStack gap={2}>
                <StyledInput
                  name={`${contactPersonPrefix}.firstName`}
                  autocomplete="firstname"
                  label={translate('screens/kyc', 'First name')}
                  placeholder={translate('screens/kyc', 'John')}
                  full
                  smallLabel
                />
                <StyledInput
                  name={`${contactPersonPrefix}.lastName`}
                  autocomplete="lastname"
                  label={translate('screens/kyc', 'Last name')}
                  placeholder={translate('screens/kyc', 'Doe')}
                  full
                  smallLabel
                />
              </StyledHorizontalStack>
              <StyledHorizontalStack gap={2}>
                <StyledInput
                  name={`${contactPersonPrefix}.street`}
                  autocomplete="street"
                  label={translate('screens/kyc', 'Street')}
                  placeholder={translate('screens/kyc', 'Street')}
                  full
                  smallLabel
                />
                <StyledInput
                  name={`${contactPersonPrefix}.houseNumber`}
                  autocomplete="house-number"
                  label={translate('screens/kyc', 'House nr.')}
                  placeholder="xx"
                  small
                  smallLabel
                />
              </StyledHorizontalStack>
              <StyledHorizontalStack gap={2}>
                <StyledInput
                  name={`${contactPersonPrefix}.zip`}
                  autocomplete="zip"
                  label={translate('screens/kyc', 'ZIP code')}
                  placeholder="12345"
                  small
                  smallLabel
                />
                <StyledInput
                  name={`${contactPersonPrefix}.city`}
                  autocomplete="city"
                  label={translate('screens/kyc', 'City')}
                  placeholder="Berlin"
                  full
                  smallLabel
                />
              </StyledHorizontalStack>
              <StyledSearchDropdown<Country>
                rootRef={rootRef}
                name={`${contactPersonPrefix}.country`}
                autocomplete="country"
                label={translate('screens/kyc', 'Country')}
                placeholder={translate('general/actions', 'Select') + '...'}
                items={allowedCountries}
                labelFunc={(item) => item.name}
                filterFunc={(i, s) => !s || [i.name, i.symbol].some((w) => w.toLowerCase().includes(s.toLowerCase()))}
                matchFunc={(i, s) => i.name.toLowerCase() === s?.toLowerCase()}
                smallLabel
              />
            </StyledVerticalStack>
          )}

          {error && (
            <div>
              <ErrorHint message={error} />
            </div>
          )}

          <div className="w-full flex flex-col gap-2">
            <StyledButton
              type="submit"
              label={translate('general/actions', 'Next')}
              onClick={handleSubmit(onSubmit)}
              width={StyledButtonWidth.FULL}
              disabled={!isValid}
              isLoading={isUpdating || isLoading}
            />
            {currentStep !== BeneficialDataStep.OWNER_COUNT && !(isUpdating || isLoading) && (
              <StyledButton
                type="button"
                label={translate('general/actions', 'Back')}
                onClick={back}
                width={StyledButtonWidth.FULL}
                color={StyledButtonColor.STURDY_WHITE}
              />
            )}
          </div>
        </StyledVerticalStack>
      )}
    </Form>
  );
}

interface OperationalActivityFormData {
  isOperational: boolean;
  website?: string;
}

function OperationalActivity({ rootRef, code, isLoading, step, onDone }: EditProps): JSX.Element {
  const { translate, translateError } = useSettingsContext();
  const { setOperationalData } = useKyc();

  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string>();

  const {
    control,
    handleSubmit,
    formState: { isValid, errors },
  } = useForm<OperationalActivityFormData>({ mode: 'onTouched' });

  const isOperational = useWatch({ control, name: 'isOperational' });

  function onSubmit(formData: OperationalActivityFormData) {
    if (!step.session) return;

    setError(undefined);

    const data: KycOperationalData = {
      isOperational: formData.isOperational,
      websiteUrl: formData.website,
    };

    setIsUpdating(true);
    setOperationalData(code, step.session.url, data)
      .then(onDone)
      .catch((error: ApiError) => setError(error.message ?? 'Unknown error'))
      .finally(() => setIsUpdating(false));
  }

  const rules = Utils.createRules({
    isOperational: Validations.Custom((v) => (v == null ? 'required' : true)),
    website: Validations.Custom((v) =>
      !v || /^https:\/\/[a-zA-Z0-9.-]+(?:\.[a-zA-Z]{2,})+(?:\/[^\s]*)?$/.test(v) ? true : 'pattern',
    ),
  });

  return (
    <Form control={control} rules={rules} errors={errors} onSubmit={handleSubmit(onSubmit)} translate={translateError}>
      {
        <StyledVerticalStack gap={6} full center>
          <StyledVerticalStack gap={2} full center>
            <p className="w-full text-dfxGray-700 text-xs font-semibold uppercase text-start ml-3">
              {translate('screens/kyc', 'Is the organization operationally active?')}
            </p>
            <p className="w-full text-dfxGray-700 text-xs text-start">
              {translate(
                'screens/kyc',
                'Organizations that primarily manage their own money, such as investment companies, are considered non-operating. Operationally active organizations are those that offer and sell goods or services, conduct regular business activities that generate revenue, employ staff and have operational structures.',
              )}
            </p>
            <StyledDropdown
              rootRef={rootRef}
              name="isOperational"
              full
              label=""
              placeholder={translate('general/actions', 'Select') + '...'}
              items={[true, false]}
              labelFunc={(item) => translate('general/actions', item ? 'Yes' : 'No')}
            />
          </StyledVerticalStack>

          {isOperational && (
            <StyledVerticalStack gap={2} full>
              <p className="text-dfxGray-700 text-xs font-semibold uppercase text-start ml-3">
                {translate('screens/kyc', 'Organization website (optional)')}
              </p>
              <StyledInput
                name="website"
                autocomplete="website"
                type="url"
                placeholder={translate('screens/kyc', 'https://my-organization.org')}
                full
                smallLabel
              />
            </StyledVerticalStack>
          )}

          {error && (
            <div>
              <ErrorHint message={error} />
            </div>
          )}

          <div className="w-full flex flex-col gap-2">
            <StyledButton
              type="submit"
              label={translate('general/actions', 'Next')}
              onClick={handleSubmit(onSubmit)}
              width={StyledButtonWidth.FULL}
              disabled={!isValid}
              isLoading={isUpdating || isLoading}
            />
          </div>
        </StyledVerticalStack>
      }
    </Form>
  );
}

function Ident({ step, lang, onDone, onBack, onError }: EditProps): JSX.Element {
  const { translate } = useSettingsContext();

  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    onDone();

    const refreshInterval = setInterval(() => isDone && onDone(), 1000);
    return () => clearInterval(refreshInterval);
  }, [isDone]);

  // listen to close events
  useEffect(() => {
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('keydown', onMessage);
  }, []);

  function onMessage(e: Event) {
    const message = (e as MessageEvent<{ type: string; status: KycStepStatus }>).data;
    if (message.type === IframeMessageType) isStepDone(message as KycStepBase) ? onDone() : onBack();
  }

  return step.session ? (
    error ? (
      <div>
        <p className="text-dfxRed-100">{translate('screens/kyc', 'The identification has failed.')}</p>
        <p className="text-dfxGray-800 text-sm">{error}</p>

        <div className="flex justify-center">
          <StyledButton
            className="mt-4"
            label={translate('general/actions', 'Ok')}
            color={StyledButtonColor.GRAY_OUTLINE}
            onClick={onBack}
          />
        </div>
      </div>
    ) : isDone ? (
      <StyledLoadingSpinner size={SpinnerSize.LG} />
    ) : (
      <>
        {step.session.type === UrlType.TOKEN ? (
          <SumsubWebSdk
            className="w-full h-full max-h-[900px]"
            accessToken={step.session.url}
            expirationHandler={() => {
              onError('Token expired');
              return Promise.resolve('');
            }}
            config={{ lang: lang.symbol.toLowerCase() }}
            onMessage={(type: string, payload: any) => {
              switch (type) {
                case 'idCheck.onApplicantStatusChanged':
                  if (
                    payload?.reviewResult?.reviewAnswer === SumsubReviewAnswer.RED &&
                    payload?.reviewResult?.reviewRejectType === SumsubReviewRejectType.FINAL
                  ) {
                    setError(payload.reviewResult.moderationComment ?? 'Unknown error');
                  } else {
                    payload?.reviewResult?.reviewAnswer === SumsubReviewAnswer.GREEN && setIsDone(true);
                  }
                  break;

                case 'idCheck.onStepCompleted':
                  step.type === KycStepType.SUMSUB_VIDEO && setIsDone(true);
                  break;
              }
            }}
            onError={({ error }: { error: string }) => setError(error)}
          />
        ) : (
          <iframe
            src={step.session.url}
            allow="camera *; microphone *"
            allowFullScreen={true}
            className="w-full h-full max-h-[900px]"
          ></iframe>
        )}
      </>
    )
  ) : (
    <ErrorHint message="No session URL" />
  );
}

interface FormData {
  text?: string;
  selection?: KycFinancialOption;
  selectionMC?: KycFinancialOption[];
}

function FinancialData({ rootRef, code, step, onDone, onBack }: EditProps): JSX.Element {
  const { translate } = useSettingsContext();
  const { language } = useSettingsContext();
  const { getFinancialData, setFinancialData } = useKyc();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [questions, setQuestions] = useState<KycFinancialQuestion[]>([]);
  const [responses, setResponses] = useState<KycFinancialResponse[]>([]);
  const [index, setIndex] = useState<number>();

  const visibleQuestions = filterQuestions(questions);
  const currentQuestion = index != null ? visibleQuestions[index - 1] : undefined;
  const currentOptions = currentQuestion?.options ?? [];
  const currentResponse = responses.find((r) => currentQuestion?.key === r.key);
  const nocLinkText = 'app.dfx.swiss/support/issue';
  const params = new URLSearchParams({ 'issue-type': SupportIssueType.NOTIFICATION_OF_CHANGES });
  const nocSupportLink = url({ path: '/support/issue', params });

  useEffect(() => {
    if (!step.session) return;

    setIsLoading(true);
    getFinancialData(code, step.session.url, language?.symbol)
      .then(({ questions, responses }) => {
        setQuestions(questions);
        setResponses(responses);

        const visibleQuestions = filterQuestions(questions);
        const currentQuestion = visibleQuestions.find((q) => !responses.find((r) => q.key === r.key));

        currentQuestion && setIndex(visibleQuestions.indexOf(currentQuestion) + 1);
      })
      .catch((error: ApiError) => setError(error.message ?? 'Unknown error'))
      .finally(() => setIsLoading(false));
  }, [code, language]);

  useEffect(() => {
    if (!step.session) return;

    responses.length &&
      setFinancialData(code, step.session.url, { responses })
        .then((r) => isStepDone(r) && onDone())
        .catch((error: ApiError) => setError(error.message ?? 'Unknown error'));
  }, [responses]);

  useEffect(() => {
    setValue(currentResponse?.value);
  }, [currentQuestion]);

  const { control, handleSubmit, setValue: setFormValue, reset } = useForm<FormData>({ mode: 'onTouched' });

  const currentText = useWatch({ control, name: 'text' });
  const currentSelection = useWatch({ control, name: 'selection' })?.key;
  const currentSelectionMC = useWatch({ control, name: 'selectionMC' })?.map((o) => o.key);
  const currentValue = currentText ?? currentSelection ?? (currentSelectionMC?.length ? currentSelectionMC : undefined);

  function onSubmit({ text, selection, selectionMC }: FormData) {
    const value = text ?? selection?.key ?? selectionMC?.map((o) => o.key).join(',');
    if (!currentQuestion || !value) return;

    if (!currentResponse) {
      setResponses((r) => [...r, { key: currentQuestion.key, value }]);
    } else if (currentResponse.value !== value) {
      currentResponse.value = value;
      setResponses((r) => [...r]);
    }

    setIndex((i) => i && i + 1);
    reset();
  }

  function goBack() {
    setIndex((i) => i && i - 1);
  }

  function setValue(value?: string) {
    const isText = !currentQuestion?.options?.length;
    const isMC = currentQuestion?.type === QuestionType.MULTIPLE_CHOICE;

    setFormValue('text', isText ? value : undefined);
    setFormValue('selection', !isText && !isMC ? currentQuestion?.options?.find((o) => o.key === value) : undefined);
    setFormValue(
      'selectionMC',
      isMC ? currentQuestion?.options?.filter((o) => value?.split(',').includes(o.key)) : undefined,
    );
  }

  function filterQuestions(questions: KycFinancialQuestion[]): KycFinancialQuestion[] {
    return questions.filter(
      (q) =>
        !q.conditions?.length ||
        q.conditions.some((c) => responses.some((r) => r.key === c.question && r.value === c.response)),
    );
  }

  return error ? (
    <StyledVerticalStack gap={6} full center>
      <ErrorHint message={error} onBack={onBack} />
    </StyledVerticalStack>
  ) : index && currentQuestion && !isLoading ? (
    <Form control={control} errors={{}} onSubmit={handleSubmit(onSubmit)}>
      <StyledVerticalStack gap={6} full center>
        <div className="w-full flex flex-row items-center justify-between">
          {index > 1 ? <StyledIconButton icon={IconVariant.CHEV_LEFT} size={IconSize.XL} onClick={goBack} /> : <div />}
          <h2 className="text-dfxGray-700">{currentQuestion.title}</h2>
          <p className="text-dfxGray-700">
            {index}/{visibleQuestions.length}
          </p>
        </div>

        {currentQuestion.type === QuestionType.CONFIRMATION ? (
          <>
            <StyledCheckboxRow
              isChecked={currentSelection === currentOptions[0].key}
              onChange={(checked) => setValue(checked ? currentOptions[0].key : undefined)}
            >
              {currentQuestion.key === 'tnc' ? (
                <StyledLink label={currentQuestion.description} url={Urls.termsAndConditions} dark />
              ) : currentQuestion.key === 'notification_of_changes' ? (
                <div>
                  {currentQuestion.description.split(nocLinkText)[0]}
                  <StyledLink label={nocLinkText} onClick={() => window.open(nocSupportLink, '_blank')} dark />
                  {currentQuestion.description.split(nocLinkText)[1]}
                </div>
              ) : (
                currentQuestion.description
              )}
            </StyledCheckboxRow>
            {currentQuestion.key === 'own_funds' && (
              <p className="text-dfxGray-700 text-xs">
                <Trans i18nKey="screens/kyc.ownFundsWarning">
                  The <strong>deliberate</strong> provision of false information in this form is a criminal offense
                  (forgery of documents pursuant to Article 251 of the Swiss Criminal Code).
                </Trans>
              </p>
            )}
          </>
        ) : currentQuestion.type === QuestionType.SINGLE_CHOICE ? (
          <>
            <StyledDropdown
              name="selection"
              rootRef={rootRef}
              label={currentQuestion.description}
              placeholder={translate('general/actions', 'Select') + '...'}
              items={currentOptions}
              labelFunc={(item) => item.text}
              full
            />
          </>
        ) : currentQuestion.type === QuestionType.MULTIPLE_CHOICE ? (
          <StyledDropdownMultiChoice
            name="selectionMC"
            rootRef={rootRef}
            label={currentQuestion.description}
            placeholder={translate('general/actions', 'Select') + '...'}
            items={currentOptions}
            labelFunc={(item) => item.text}
            full
          />
        ) : (
          <StyledInput name="text" label={currentQuestion.description} full />
        )}
        <StyledButton
          type="submit"
          label={translate('general/actions', 'Next')}
          onClick={handleSubmit(onSubmit)}
          width={StyledButtonWidth.FULL}
          disabled={!currentValue}
        />
      </StyledVerticalStack>
    </Form>
  ) : (
    <StyledLoadingSpinner size={SpinnerSize.LG} />
  );
}

export interface KycManualIdentFormData {
  gender?: GenderType;
  firstName: string;
  lastName: string;
  birthName?: string;
  birthday: string;
  nationality: Country;
  birthplace?: string;
  documentType: DocumentType;
  documentNumber: string;
  file: File;
}

function ManualIdent({ rootRef, code, step, onDone }: EditProps): JSX.Element {
  const { nationalityCountries, translate, translateError } = useSettingsContext();
  const { setManualIdentData } = useKyc();
  const { genderTypeToString, documentTypeToString } = useKycHelper();
  const { countryCode } = useGeoLocation();

  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const ipCountry = nationalityCountries?.find((c) => c.symbol === countryCode);
    if (ipCountry && !isDirty) {
      setValue('nationality', ipCountry);
    }
  }, [nationalityCountries, countryCode]);

  const {
    control,
    handleSubmit,
    setValue,
    formState: { isValid, isDirty, errors },
  } = useForm<KycManualIdentFormData>({ mode: 'onTouched' });

  async function onSubmit(data: KycManualIdentFormData) {
    if (!step.session) return;

    const requestData: KycManualIdentData = {
      firstName: data.firstName,
      lastName: data.lastName,
      birthName: data.birthName,
      birthday: new Date(data.birthday),
      nationality: data.nationality,
      birthplace: data.birthplace,
      gender: data.gender,
      documentType: data.documentType,
      documentNumber: data.documentNumber,
      document: { file: (await toBase64(data.file)) ?? '', fileName: data.file.name },
    };

    setIsUpdating(true);
    setError(undefined);
    setManualIdentData(code, step.session.url, requestData)
      .then(onDone)
      .catch((error: ApiError) => setError(error.message ?? 'Unknown error'))
      .finally(() => setIsUpdating(false));
  }

  const rules = Utils.createRules({
    firstName: Validations.Required,
    lastName: Validations.Required,
    birthday: [
      Validations.Required,
      Validations.Custom((birthday) => {
        const date = new Date(birthday);
        return date instanceof Date && !isNaN(date.getTime()) ? true : 'date_format';
      }),
    ],
    nationality: Validations.Required,
    documentType: Validations.Required,
    documentNumber: Validations.Required,
    file: [
      Validations.Required,
      Validations.Custom((file) => (!file || DefaultFileTypes.includes(file.type) ? true : 'file_type')),
    ],
  });

  return (
    <Form control={control} rules={rules} errors={errors} onSubmit={handleSubmit(onSubmit)} translate={translateError}>
      <StyledVerticalStack gap={6} full center>
        <StyledVerticalStack gap={6} full>
          <StyledVerticalStack gap={2} full>
            <StyledDropdown
              rootRef={rootRef}
              name="gender"
              label={`${translate('screens/kyc', 'Gender')} (${translate('screens/kyc', 'Optional').toLowerCase()})`}
              placeholder={translate('general/actions', 'Select') + '...'}
              items={Object.values(GenderType)}
              labelFunc={(item) => genderTypeToString(item)}
              smallLabel
            />
            <StyledHorizontalStack gap={2}>
              <StyledInput
                name="firstName"
                autocomplete="firstname"
                label={translate('screens/kyc', 'First name')}
                placeholder={translate('screens/kyc', 'John')}
                full
                smallLabel
              />
              <StyledInput
                name="lastName"
                autocomplete="lastname"
                label={translate('screens/kyc', 'Last name')}
                placeholder={translate('screens/kyc', 'Doe')}
                full
                smallLabel
              />
            </StyledHorizontalStack>

            <StyledInput
              name="birthName"
              autocomplete="lastname"
              label={translate('screens/kyc', 'Birth name')}
              placeholder={translate('screens/kyc', 'John Doe')}
              full
              smallLabel
            />

            <StyledInput
              name="birthday"
              autocomplete="birthday"
              label={translate('screens/kyc', 'Birthday')}
              placeholder={translate('screens/kyc', 'YYYY-MM-DD')}
              full
              smallLabel
            />

            <StyledInput
              name="birthplace"
              autocomplete="birthplace"
              label={`${translate('screens/kyc', 'Birthplace')} (${translate(
                'screens/kyc',
                'Optional',
              ).toLowerCase()})`}
              placeholder={translate('screens/kyc', 'New York, USA')}
              full
              smallLabel
            />
            <StyledSearchDropdown
              rootRef={rootRef}
              name="nationality"
              autocomplete="nationality"
              label={translate('screens/kyc', 'Nationality')}
              placeholder={translate('general/actions', 'Select') + '...'}
              items={nationalityCountries}
              labelFunc={(item) => item.name}
              filterFunc={(i, s) => !s || [i.name, i.symbol].some((w) => w.toLowerCase().includes(s.toLowerCase()))}
              matchFunc={(i, s) => i.name.toLowerCase() === s?.toLowerCase()}
              smallLabel
            />
          </StyledVerticalStack>

          <StyledVerticalStack gap={2}>
            <p className="text-dfxGray-700 text-xs font-semibold uppercase text-start ml-3">
              {translate('screens/kyc', 'Identification document')}
            </p>
            <StyledDropdown
              rootRef={rootRef}
              name="documentType"
              label={translate('screens/kyc', 'Document type')}
              placeholder={translate('general/actions', 'Select') + '...'}
              items={Object.values(DocumentType)}
              labelFunc={(item) => documentTypeToString(item)}
              smallLabel
            />
            <StyledInput
              name="documentNumber"
              autocomplete="ident-document"
              label={translate('screens/kyc', 'Document number')}
              placeholder="12345"
              full
              smallLabel
            />
            <StyledFileUpload
              name="file"
              label={translate('screens/support', 'Document')}
              placeholder={translate('general/actions', 'Drop files here')}
              buttonLabel={translate('general/actions', 'Browse')}
              full
              smallLabel
            />
          </StyledVerticalStack>
        </StyledVerticalStack>

        {error && (
          <div>
            <ErrorHint message={error} />
          </div>
        )}

        <StyledButton
          type="submit"
          label={translate('general/actions', 'Next')}
          onClick={handleSubmit(onSubmit)}
          width={StyledButtonWidth.FULL}
          disabled={!isValid}
          isLoading={isUpdating}
        />
      </StyledVerticalStack>
    </Form>
  );
}

// --- Change Steps ---

interface PhoneChangeFormData {
  phone: string;
}

function PhoneChangeData({ code, isLoading, step, onDone, onCancel, isCanceling }: EditProps): JSX.Element {
  const { translate, translateError } = useSettingsContext();
  const { setPhoneChangeData } = useKyc();

  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string>();

  const {
    control,
    handleSubmit,
    formState: { isValid, errors },
  } = useForm<PhoneChangeFormData>({ mode: 'onTouched' });

  function onSubmit(data: PhoneChangeFormData) {
    if (!step.session) return;

    setIsUpdating(true);
    setError(undefined);
    setPhoneChangeData(code, step.session.url, { phone: data.phone })
      .then(onDone)
      .catch((error: ApiError) => setError(error.message ?? 'Unknown error'))
      .finally(() => setIsUpdating(false));
  }

  const rules = Utils.createRules({
    phone: [Validations.Required, Validations.Phone],
  });

  return (
    <Form control={control} rules={rules} errors={errors} onSubmit={handleSubmit(onSubmit)} translate={translateError}>
      <StyledVerticalStack gap={6} full center>
        <StyledInput
          name="phone"
          autocomplete="phone"
          type="tel"
          label={translate('screens/kyc', 'Phone number')}
          placeholder="+49 12345678"
          full
          smallLabel
        />

        {error && (
          <div>
            <ErrorHint message={error} />
          </div>
        )}

        <StyledHorizontalStack gap={4} spanAcross>
          {onCancel && (
            <StyledButton
              color={StyledButtonColor.STURDY_WHITE}
              width={StyledButtonWidth.FULL}
              label={translate('general/actions', 'Cancel')}
              onClick={onCancel}
              isLoading={isCanceling}
            />
          )}
          <StyledButton
            type="submit"
            label={translate('general/actions', 'Next')}
            onClick={handleSubmit(onSubmit)}
            width={StyledButtonWidth.FULL}
            disabled={!isValid}
            isLoading={isUpdating || isLoading}
          />
        </StyledHorizontalStack>
      </StyledVerticalStack>
    </Form>
  );
}

interface AddressChangeFormData {
  file: File;
  address: KycAddress;
}

function AddressChangeData({ rootRef, code, isLoading, step, onDone, onCancel, isCanceling }: EditProps): JSX.Element {
  const { allowedCountries, translate, translateError } = useSettingsContext();
  const { setAddressChangeData } = useKyc();
  const { countryCode } = useGeoLocation();

  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string>();

  const ipCountry = allowedCountries.find((c) => c.symbol === countryCode);

  const {
    control,
    handleSubmit,
    formState: { isValid, errors },
  } = useForm<AddressChangeFormData>({ mode: 'onTouched', defaultValues: { address: { country: ipCountry } } });

  async function onSubmit(data: AddressChangeFormData) {
    if (!step.session) return;

    const file = data.file && (await toBase64(data.file));
    if (!file) {
      setError('No file selected');
      return;
    }

    setIsUpdating(true);
    setError(undefined);
    setAddressChangeData(code, step.session.url, {
      file,
      fileName: data.file.name,
      address: data.address,
    })
      .then(onDone)
      .catch((error: ApiError) => setError(error.message ?? 'Unknown error'))
      .finally(() => setIsUpdating(false));
  }

  const rules = Utils.createRules({
    ['address.street']: Validations.Required,
    ['address.zip']: AddressZipValidation,
    ['address.city']: Validations.Required,
    ['address.country']: Validations.Required,
    file: [
      Validations.Required,
      Validations.Custom((file) => (!file || DefaultFileTypes.includes(file.type) ? true : 'file_type')),
    ],
  });

  return (
    <Form control={control} rules={rules} errors={errors} onSubmit={handleSubmit(onSubmit)} translate={translateError}>
      <StyledVerticalStack gap={6} full center>
        <StyledVerticalStack gap={2} full>
          <p className="text-dfxGray-700 text-xs font-semibold uppercase text-start ml-3">
            {translate('screens/kyc', 'New address')}
          </p>
          <StyledHorizontalStack gap={2}>
            <StyledInput
              name="address.street"
              autocomplete="street"
              label={translate('screens/kyc', 'Street')}
              placeholder={translate('screens/kyc', 'Street')}
              full
              smallLabel
            />
            <StyledInput
              name="address.houseNumber"
              autocomplete="house-number"
              label={translate('screens/kyc', 'House nr.')}
              placeholder="xx"
              small
              smallLabel
            />
          </StyledHorizontalStack>
          <StyledHorizontalStack gap={2}>
            <StyledInput
              name="address.zip"
              autocomplete="zip"
              label={translate('screens/kyc', 'ZIP code')}
              placeholder="12345"
              small
              smallLabel
            />
            <StyledInput
              name="address.city"
              autocomplete="city"
              label={translate('screens/kyc', 'City')}
              placeholder="Berlin"
              full
              smallLabel
            />
          </StyledHorizontalStack>
          <StyledSearchDropdown<Country>
            rootRef={rootRef}
            name="address.country"
            autocomplete="country"
            label={translate('screens/kyc', 'Country')}
            placeholder={translate('general/actions', 'Select') + '...'}
            items={allowedCountries}
            labelFunc={(item) => item.name}
            filterFunc={(i, s) => !s || [i.name, i.symbol].some((w) => w.toLowerCase().includes(s.toLowerCase()))}
            matchFunc={(i, s) => i.name.toLowerCase() === s?.toLowerCase()}
            smallLabel
          />
        </StyledVerticalStack>

        <StyledVerticalStack gap={2} full>
          <p className="text-dfxGray-700 text-xs font-semibold uppercase text-start ml-3">
            {translate('screens/kyc', 'Proof document')}
          </p>
          <StyledFileUpload
            name="file"
            label=""
            placeholder={translate('general/actions', 'Drop files here')}
            buttonLabel={translate('general/actions', 'Browse')}
            full
          />
        </StyledVerticalStack>

        {error && (
          <div>
            <ErrorHint message={error} />
          </div>
        )}

        <StyledHorizontalStack gap={4} spanAcross>
          {onCancel && (
            <StyledButton
              color={StyledButtonColor.STURDY_WHITE}
              width={StyledButtonWidth.FULL}
              label={translate('general/actions', 'Cancel')}
              onClick={onCancel}
              isLoading={isCanceling}
            />
          )}
          <StyledButton
            type="submit"
            label={translate('general/actions', 'Next')}
            onClick={handleSubmit(onSubmit)}
            width={StyledButtonWidth.FULL}
            disabled={!isValid}
            isLoading={isUpdating || isLoading}
          />
        </StyledHorizontalStack>
      </StyledVerticalStack>
    </Form>
  );
}

interface NameChangeFormData {
  file: File;
  firstName: string;
  lastName: string;
}

function NameChangeData({ code, isLoading, step, onDone, onCancel, isCanceling }: EditProps): JSX.Element {
  const { translate, translateError } = useSettingsContext();
  const { setNameChangeData } = useKyc();

  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string>();

  const {
    control,
    handleSubmit,
    formState: { isValid, errors },
  } = useForm<NameChangeFormData>({ mode: 'onTouched' });

  async function onSubmit(data: NameChangeFormData) {
    if (!step.session) return;

    const file = data.file && (await toBase64(data.file));
    if (!file) {
      setError('No file selected');
      return;
    }

    setIsUpdating(true);
    setError(undefined);
    setNameChangeData(code, step.session.url, {
      file,
      fileName: data.file.name,
      firstName: data.firstName,
      lastName: data.lastName,
    })
      .then(onDone)
      .catch((error: ApiError) => setError(error.message ?? 'Unknown error'))
      .finally(() => setIsUpdating(false));
  }

  const rules = Utils.createRules({
    firstName: Validations.Required,
    lastName: Validations.Required,
    file: [
      Validations.Required,
      Validations.Custom((file) => (!file || DefaultFileTypes.includes(file.type) ? true : 'file_type')),
    ],
  });

  return (
    <Form control={control} rules={rules} errors={errors} onSubmit={handleSubmit(onSubmit)} translate={translateError}>
      <StyledVerticalStack gap={6} full center>
        <StyledVerticalStack gap={2} full>
          <p className="text-dfxGray-700 text-xs font-semibold uppercase text-start ml-3">
            {translate('screens/kyc', 'New name')}
          </p>
          <StyledHorizontalStack gap={2}>
            <StyledInput
              name="firstName"
              autocomplete="firstname"
              label={translate('screens/kyc', 'First name')}
              placeholder={translate('screens/kyc', 'John')}
              full
              smallLabel
            />
            <StyledInput
              name="lastName"
              autocomplete="lastname"
              label={translate('screens/kyc', 'Last name')}
              placeholder={translate('screens/kyc', 'Doe')}
              full
              smallLabel
            />
          </StyledHorizontalStack>
        </StyledVerticalStack>

        <StyledVerticalStack gap={2} full>
          <p className="text-dfxGray-700 text-xs font-semibold uppercase text-start ml-3">
            {translate('screens/kyc', 'Proof document')}
          </p>
          <StyledFileUpload
            name="file"
            label=""
            placeholder={translate('general/actions', 'Drop files here')}
            buttonLabel={translate('general/actions', 'Browse')}
            full
          />
        </StyledVerticalStack>

        {error && (
          <div>
            <ErrorHint message={error} />
          </div>
        )}

        <StyledHorizontalStack gap={4} spanAcross>
          {onCancel && (
            <StyledButton
              color={StyledButtonColor.STURDY_WHITE}
              width={StyledButtonWidth.FULL}
              label={translate('general/actions', 'Cancel')}
              onClick={onCancel}
              isLoading={isCanceling}
            />
          )}
          <StyledButton
            type="submit"
            label={translate('general/actions', 'Next')}
            onClick={handleSubmit(onSubmit)}
            width={StyledButtonWidth.FULL}
            disabled={!isValid}
            isLoading={isUpdating || isLoading}
          />
        </StyledHorizontalStack>
      </StyledVerticalStack>
    </Form>
  );
}

function PaymentAgreement({ code, step, onDone }: EditProps): JSX.Element {
  const { translate, translateError } = useSettingsContext();
  const { setPaymentData } = useKyc();
  const { goodsCategoryToString, storeTypeToString, merchantCategoryToString } = useKycHelper();
  const { rootRef } = useLayoutContext();

  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string>();

  const {
    control,
    handleSubmit,
    setValue,
    formState: { isValid, errors },
  } = useForm<PaymentData>({ mode: 'onTouched' });

  const accepted = useWatch({ control, name: 'contractAccepted' });

  const valid = isValid && accepted;

  async function onSubmit(data: PaymentData) {
    if (!step.session) return;

    setIsUpdating(true);
    setError(undefined);
    setPaymentData(code, step.session.url, { ...data, website: data.website || undefined })
      .then(onDone)
      .catch((error: ApiError) => setError(error.message ?? 'Unknown error'))
      .finally(() => setIsUpdating(false));
  }

  const rules = Utils.createRules({
    name: Validations.Required,
    registrationNumber: Validations.Required,
    storeType: Validations.Required,
    merchantCategory: Validations.Required,
    goodsType: Validations.Required,
    goodsCategory: Validations.Required,
    purpose: Validations.Required,
  });

  return (
    <Form control={control} rules={rules} errors={errors} onSubmit={handleSubmit(onSubmit)} translate={translateError}>
      <StyledVerticalStack gap={6} full center>
        <StyledVerticalStack gap={2} full center>
          <p className="w-full text-dfxGray-700 text-xs font-semibold uppercase text-start ml-3">
            {translate('screens/kyc', 'Public name')}
          </p>
          <StyledInput
            name="name"
            label={''}
            placeholder={translate('screens/kyc', 'My organization')}
            full
            smallLabel
          />
        </StyledVerticalStack>

        <StyledVerticalStack gap={2} full>
          <p className="text-dfxGray-700 text-xs font-semibold uppercase text-start ml-3">
            {translate('screens/kyc', 'Website')}
          </p>
          <StyledInput
            name="website"
            autocomplete="website"
            type="url"
            placeholder={translate('screens/kyc', 'https://my-organization.org')}
            full
            smallLabel
          />
        </StyledVerticalStack>

        <StyledVerticalStack gap={2} full>
          <p className="text-dfxGray-700 text-xs font-semibold uppercase text-start ml-3">
            {translate('screens/kyc', 'Registration number')}
          </p>
          <StyledInput
            name="registrationNumber"
            placeholder={translate('screens/kyc', 'CHE-000.000.000')}
            full
            smallLabel
          />
        </StyledVerticalStack>

        <StyledVerticalStack gap={2} full>
          <p className="text-dfxGray-700 text-xs font-semibold uppercase text-start ml-3">
            {translate('screens/kyc', 'Store type')}
          </p>
          <StyledDropdown
            rootRef={rootRef}
            name="storeType"
            label=""
            placeholder={translate('general/actions', 'Select') + '...'}
            items={Object.values(StoreType)}
            labelFunc={(item) => translate('screens/kyc', storeTypeToString(item))}
          />
        </StyledVerticalStack>

        <StyledVerticalStack gap={2} full>
          <p className="text-dfxGray-700 text-xs font-semibold uppercase text-start ml-3">
            {translate('screens/kyc', 'Merchant category')}
          </p>
          <StyledDropdown
            rootRef={rootRef}
            name="merchantCategory"
            label=""
            placeholder={translate('general/actions', 'Select') + '...'}
            items={Object.values(MerchantCategory)}
            labelFunc={(item) => translate('screens/kyc', merchantCategoryToString(item))}
          />
        </StyledVerticalStack>

        <StyledVerticalStack gap={2} full>
          <p className="text-dfxGray-700 text-xs font-semibold uppercase text-start ml-3">
            {translate('screens/kyc', 'Goods type')}
          </p>
          <StyledDropdown
            rootRef={rootRef}
            name="goodsType"
            label=""
            placeholder={translate('general/actions', 'Select') + '...'}
            items={Object.values(GoodsType)}
            labelFunc={(item) => translate('screens/kyc', item)}
          />
        </StyledVerticalStack>

        <StyledVerticalStack gap={2} full>
          <p className="text-dfxGray-700 text-xs font-semibold uppercase text-start ml-3">
            {translate('screens/kyc', 'Goods category')}
          </p>
          <StyledDropdown
            rootRef={rootRef}
            name="goodsCategory"
            label=""
            placeholder={translate('general/actions', 'Select') + '...'}
            items={Object.values(GoodsCategory)}
            labelFunc={(item) => translate('screens/kyc', goodsCategoryToString(item))}
          />
        </StyledVerticalStack>

        <StyledVerticalStack gap={2} full center>
          <p className="w-full text-dfxGray-700 text-xs font-semibold uppercase text-start ml-3">
            {translate('screens/kyc', 'Purpose of the payments')}
          </p>
          <StyledInput name="purpose" label={''} placeholder={translate('screens/kyc', 'Purpose')} full smallLabel />
        </StyledVerticalStack>

        <StyledVerticalStack gap={2} full>
          <p className="text-dfxGray-700 text-xs font-semibold uppercase text-start ml-3">
            {translate('screens/kyc', 'Assignment agreement')}
          </p>
          <p className="text-dfxGray-700 text-start">
            <Trans i18nKey="screens/kyc.agreement">
              DFX offers its customers the option of assigning outstanding receivables from the sale of goods and
              services to DFX in order to enable payment using cryptocurrencies. The customer has the option of
              transferring an outstanding claim via our API (api.dfx.swiss) or via the front end (app.dfx.swiss).
              <br />
              <br />
              The amount owed will be paid out to the customer after deduction of a processing fee of 0.2%. Depending on
              the customer-specific configuration, the payment can be made either in cryptocurrencies or as fiat
              currency via bank transaction.
              <br />
              <br />
              The DFX GTC apply to all transactions. The assignment ends automatically when the DFX account is closed or
              can be terminated immediately by DFX or the customer in the event of breaches of contract or insolvency.
              <br />
              <br />
              A signature is not required. The assignment of claims agreement will be sent to the customer by e-mail for
              confirmation.
              <br />
              <br />
              The Swiss Code of Obligations (OR) and contract law apply to all other legal points.
            </Trans>
          </p>
        </StyledVerticalStack>

        <StyledCheckboxRow isChecked={accepted} onChange={(checked) => setValue('contractAccepted', checked)} centered>
          {translate('screens/kyc', 'I accept the agreement')}
        </StyledCheckboxRow>

        {error && (
          <div>
            <ErrorHint message={error} />
          </div>
        )}

        <StyledButton
          type="submit"
          label={translate('general/actions', 'Next')}
          onClick={handleSubmit(onSubmit)}
          width={StyledButtonWidth.FULL}
          disabled={!valid}
          isLoading={isUpdating}
        />
      </StyledVerticalStack>
    </Form>
  );
}

function RecallAgreement({ code, step, onDone }: EditProps): JSX.Element {
  const { translate, translateError } = useSettingsContext();
  const { setRecallData } = useKyc();

  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string>();

  const {
    control,
    handleSubmit,
    setValue,
    formState: { isValid, errors },
  } = useForm<RecallData>({ mode: 'onTouched' });

  const accepted = useWatch({ control, name: 'accepted' });

  async function onSubmit(data: RecallData) {
    if (!step.session) return;

    setIsUpdating(true);
    setError(undefined);
    setRecallData(code, step.session.url, { accepted: Boolean(data.accepted) })
      .then(onDone)
      .catch((error: ApiError) => setError(error.message ?? 'Unknown error'))
      .finally(() => setIsUpdating(false));
  }

  return (
    <Form control={control} errors={errors} onSubmit={handleSubmit(onSubmit)} translate={translateError}>
      <StyledVerticalStack gap={6} full center>
        <p className="text-dfxGray-700 text-start">{translate('screens/kyc', 'TODO: recall agreement text')}</p>

        <StyledCheckboxRow isChecked={accepted} onChange={(checked) => setValue('accepted', checked)} centered>
          {translate('screens/kyc', 'I accept the agreement')}
        </StyledCheckboxRow>

        {error && (
          <div>
            <ErrorHint message={error} />
          </div>
        )}

        <StyledButton
          type="submit"
          label={translate('general/actions', 'Next')}
          onClick={handleSubmit(onSubmit)}
          width={StyledButtonWidth.FULL}
          disabled={!isValid}
          isLoading={isUpdating}
        />
      </StyledVerticalStack>
    </Form>
  );
}
