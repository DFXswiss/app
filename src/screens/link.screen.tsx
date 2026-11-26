import {
  ApiError,
  KycContactData,
  KycInfo,
  KycLevel,
  KycSession,
  KycStepSession,
  KycStepStatus,
  Utils,
  Validations,
  isStepDone,
  useKyc,
  useUserContext,
} from '@dfx.swiss/react';
import {
  DfxIcon,
  Form,
  IconColor,
  IconVariant,
  SpinnerSize,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledInput,
  StyledLoadingSpinner,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ErrorHint } from '../components/error-hint';
import { AppParams, useAppHandlingContext } from '../contexts/app-handling.context';
import { useSettingsContext } from '../contexts/settings.context';
import { useLayoutOptions } from '../hooks/layout-config.hook';
import { useMergedAccount } from 'src/hooks/merged-account.hook';
import { useNavigation } from '../hooks/navigation.hook';
import { appOrigin } from '../util/app-origin';
import { loginRedirectParams } from '../util/login-redirect';
import { relativeUrl } from '../util/utils';

type ContactDataWithReturn = KycContactData & { redirectUri?: string };

const RETURN_PARAMS: [keyof AppParams, string][] = [
  ['amountIn', 'amount-in'],
  ['amountOut', 'amount-out'],
  ['assetIn', 'asset-in'],
  ['assetOut', 'asset-out'],
  ['blockchain', 'blockchain'],
];

const LOGIN_PARAMS = ['session', 'address', 'signature', 'pubkey', 'code', 'otp', 'user', 'mail'];

export default function LinkScreen(): JSX.Element {
  const { translate, translateError } = useSettingsContext();
  const { getKycInfo, continueKyc, setContactData } = useKyc();
  const { user, reloadUser } = useUserContext();
  const { navigate, goBack: navigateBack } = useNavigation();
  const { handleMergedError } = useMergedAccount();
  const { redirectPath, params, isWidget, widgetPersonalIban } = useAppHandlingContext();

  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [linkNotPossible, setLinkNotPossible] = useState(false);
  const [error, setError] = useState<string>();
  const [contactStep, setContactStep] = useState<KycStepSession>();
  const [showLinkHint, setShowLinkHint] = useState(false);

  const kycCode = user?.kyc.hash;

  useEffect(() => {
    if (!kycCode) return;
    // Local per-run flag, not a ref: a ref shared across effect re-runs would be reset to
    // false by a newer run while an older run's request is still in flight, un-cancelling it.
    let cancelled = false;

    function handleInitial(info: KycInfo) {
      if (info.kycLevel > 0 || !kycCode) {
        goBack();
      } else {
        return continueKyc(kycCode, false)
          .then((session) => {
            if (cancelled) return;
            handleReload(session);
          })
          .catch((error: ApiError) => {
            if (cancelled) return;
            if (handleMergedError(error)) return;
            setError(error.message ?? 'Unknown error');
          });
      }
    }

    getKycInfo(kycCode)
      .then((info) => {
        if (cancelled) return;
        return handleInitial(info);
      })
      .catch((error: ApiError) => {
        if (cancelled) return;
        if (handleMergedError(error)) return;
        setError(error.message ?? 'Unknown error');
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [kycCode]);

  function handleReload(info: KycSession) {
    if (info.kycLevel === KycLevel.Link) {
      // no account found
      linkFailed();
    } else if (info.kycLevel > KycLevel.Link) {
      // merged
      goBack();
    } else if (info.currentStep?.status === KycStepStatus.FAILED) {
      setShowLinkHint(true);
    } else {
      setContactStep(info.currentStep);
    }
  }

  function linkFailed() {
    setLinkNotPossible(true);
    setContactStep(undefined);
  }

  function goBack() {
    reloadUser();
    navigateBack();
  }

  const {
    control,
    handleSubmit,
    formState: { isValid, errors },
  } = useForm<KycContactData>({ mode: 'onTouched' });

  function returnUri(): string | undefined {
    if (!redirectPath) return undefined;

    const query = loginRedirectParams({ isWidget, widgetPersonalIban }, (window as Window).location.search);
    RETURN_PARAMS.forEach(([key, name]) => {
      const value = params[key];
      if (value) query.set(name, value);
    });

    const target = new URL(relativeUrl({ path: redirectPath, params: query }), appOrigin());
    LOGIN_PARAMS.forEach((name) => target.searchParams.delete(name));
    return target.href;
  }

  function onSubmit(data: KycContactData) {
    if (!contactStep?.session || !kycCode) return;

    const redirectUri = returnUri();
    const contactData: ContactDataWithReturn = redirectUri ? { ...data, redirectUri } : data;

    setIsUpdating(true);
    setError(undefined);
    setContactData(kycCode, contactStep.session.url, contactData)
      .then((r) => (isStepDone(r) ? linkFailed() : setShowLinkHint(true)))
      .catch((error: ApiError) => {
        if (handleMergedError(error)) return;
        setError(error.message ?? 'Unknown error');
      })
      .finally(() => setIsUpdating(false));
  }

  const rules = Utils.createRules({
    mail: [Validations.Required, Validations.Mail],
  });

  useLayoutOptions({ title: translate('screens/kyc', 'DFX KYC') });

  return (
    <>
      {isLoading ? (
        <StyledLoadingSpinner size={SpinnerSize.LG} />
      ) : linkNotPossible ? (
        <StyledVerticalStack gap={6} full center>
          <p className="text-dfxGray-700">{translate('screens/kyc', 'No matching account was found.')}</p>
          <StyledButton
            width={StyledButtonWidth.MIN}
            label={translate('screens/kyc', 'Complete KYC')}
            onClick={() => navigate('/kyc')}
          />
          <StyledButton
            width={StyledButtonWidth.MIN}
            label={translate('general/actions', 'Back')}
            onClick={goBack}
            color={StyledButtonColor.STURDY_WHITE}
          />
        </StyledVerticalStack>
      ) : showLinkHint ? (
        <StyledVerticalStack gap={6} full>
          <p className="text-dfxGray-700">
            {translate('screens/kyc', 'It looks like you already have an account with DFX.')}{' '}
            {translate(
              'screens/kyc',
              'We have just sent you an email. To continue with your existing account, please confirm your email address by clicking on the link sent.',
            )}
          </p>
          <StyledButton width={StyledButtonWidth.MIN} label={translate('general/actions', 'OK')} onClick={goBack} />
        </StyledVerticalStack>
      ) : (
        <Form
          control={control}
          rules={rules}
          errors={errors}
          onSubmit={handleSubmit(onSubmit)}
          translate={translateError}
        >
          <StyledVerticalStack gap={6} full center>
            <DfxIcon icon={IconVariant.USER_DATA} color={IconColor.BLUE} />
            <p className="text-base font-bold text-dfxBlue-800">
              {translate('screens/kyc', 'Please enter your contact information so that we can find your account')}
            </p>

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
              onClick={handleSubmit(onSubmit)}
              width={StyledButtonWidth.FULL}
              disabled={!isValid}
              isLoading={isUpdating}
            />

            {error && (
              <div>
                <ErrorHint message={error} />
              </div>
            )}
          </StyledVerticalStack>
        </Form>
      )}
    </>
  );
}
