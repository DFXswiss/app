import { ApiError, TfaLevel, TfaSetup, TfaType, Utils, Validations, useAuth, useKyc, useUserContext } from '@dfx.swiss/react';
import {
  CopyButton,
  Form,
  SpinnerSize,
  StyledButton,
  StyledButtonWidth,
  StyledInput,
  StyledLoadingSpinner,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import QRCode from 'react-qr-code';
import { useLocation } from 'react-router-dom';
import { BadgeType } from 'src/util/app-store-badges';
import { useMergedAccount } from 'src/hooks/merged-account.hook';
import { AppStoreBadge } from '../components/app-store-badge';
import { ErrorHint } from '../components/error-hint';
import { useSettingsContext } from '../contexts/settings.context';
import { useClipboard } from '../hooks/clipboard.hook';
import { useUserGuard } from '../hooks/guard.hook';
import { useLayoutOptions } from '../hooks/layout-config.hook';
import { useNavigation } from '../hooks/navigation.hook';

const IOS_AUTHENTICATOR_URL = 'https://apps.apple.com/de/app/google-authenticator/id388497605';
const ANDROID_AUTHENTICATOR_URL =
  'https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2';

export default function TfaScreen(): JSX.Element {
  const { translate, translateError } = useSettingsContext();
  const { setup2fa: kycSetup2fa, verify2fa: kycVerify2fa } = useKyc();
  const { setup2fa: authSetup2fa, verify2fa: authVerify2fa } = useAuth();
  const { user } = useUserContext();
  const { search, state } = useLocation();
  const { copy } = useClipboard();
  const { goBack } = useNavigation();
  const { handleMergedError } = useMergedAccount();

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [tokenInvalid, setTokenInvalid] = useState(false);

  const [setupInfo, setSetupInfo] = useState<TfaSetup>();

  const params = new URLSearchParams(search);
  const urlCode = params.get('code');
  // kyc 2FA resolves its code from the url or the logged-in user's kyc hash (unchanged for edit-mail/kyc flows).
  const kycCode = urlCode ?? user?.kyc.hash;
  // Session mode (staff, reached from the support dashboard) is opt-in via an explicit navigation flag and uses
  // the bearer-based auth/2fa endpoints. Everything else stays on the kyc-code-based endpoints as before.
  const isSessionMode = state?.sessionMode === true;
  const tfaLevel: TfaLevel | undefined = state?.level;

  useUserGuard('/login', isSessionMode || !kycCode);

  useEffect(() => {
    load();
  }, [isSessionMode, kycCode]);

  const {
    control,
    handleSubmit,
    formState: { isValid, errors },
  } = useForm<{ token: string }>({ mode: 'onTouched' });

  const rules = Utils.createRules({
    token: [Validations.Required, Validations.Custom((v: string) => (v?.length === 6 ? true : 'pattern'))],
  });

  async function load(): Promise<void> {
    if (!isSessionMode && !kycCode) return;
    return (isSessionMode ? authSetup2fa(tfaLevel) : kycSetup2fa(kycCode as string, tfaLevel))
      .then(setSetupInfo)
      .catch((error: ApiError) => {
        if (handleMergedError(error)) return;
        if (error.message !== '2FA already set up') {
          setError(error.message ?? 'Unknown error');
        }
      })
      .finally(() => setIsLoading(false));
  }

  async function onSubmit(data: { token: string }) {
    setError(undefined);
    setTokenInvalid(false);
    setIsSubmitting(true);

    (isSessionMode ? authVerify2fa(data.token) : kycVerify2fa(kycCode as string, data.token))
      .then(() => goBack())
      .catch((e: ApiError) => {
        if (handleMergedError(e)) return;
        if (e.statusCode === 403) {
          setTokenInvalid(true);
        } else {
          setError(e.message ?? 'Unknown error');
        }
      })
      .finally(() => setIsSubmitting(false));
  }

  useLayoutOptions({ title: translate('screens/2fa', '2FA') });

  return (
    <>
      {isLoading ? (
        <StyledLoadingSpinner size={SpinnerSize.LG} />
      ) : (
        <Form
          control={control}
          rules={rules}
          errors={errors}
          onSubmit={handleSubmit(onSubmit)}
          translate={translateError}
        >
          <div className="text-left">
            <StyledVerticalStack gap={10} full>
              <>
                {setupInfo?.uri && (
                  <>
                    {/* step 1 */}
                    <StyledVerticalStack gap={4} full>
                      <h2 className="text-dfxGray-700">
                        <span className="text-dfxGray-800">
                          {translate('screens/2fa', 'Step {{step}}', { step: 1 })}
                          {': '}
                        </span>
                        <span className="font-medium">
                          {translate(
                            'screens/2fa',
                            'Install Google Authenticator or another 2FA app on your smartphone',
                          )}
                        </span>
                      </h2>
                      <div className="flex flex-row gap-3 w-full justify-center pt-4 pb-2">
                        <AppStoreBadge type={BadgeType.PLAY_STORE} url={ANDROID_AUTHENTICATOR_URL} />
                        <AppStoreBadge type={BadgeType.APP_STORE} url={IOS_AUTHENTICATOR_URL} />
                      </div>
                    </StyledVerticalStack>

                    {/* step 2 */}
                    <StyledVerticalStack gap={4} full>
                      <h2 className="text-dfxGray-700">
                        <span className="text-dfxGray-800">
                          {translate('screens/2fa', 'Step {{step}}', { step: 2 })}
                          {': '}
                        </span>
                        <span className="font-medium">{translate('screens/2fa', 'Set up the 2FA authenticator')}</span>
                      </h2>
                      <p className="text-dfxGray-700">
                        {translate(
                          'screens/2fa',
                          'Click + in Google Authenticator to add a new account. You can scan the QR code or enter the secret provided to create your account in Google Authenticator.',
                        )}
                      </p>
                      <QRCode
                        className="mx-auto h-auto w-full max-w-[15rem]"
                        value={setupInfo.uri}
                        size={128}
                        fgColor={'#072440'}
                      />
                      <StyledVerticalStack full center>
                        <p className="text-dfxGray-800 italic">{translate('screens/2fa', 'Secret')}:</p>
                        <div className="flex flex-row items-center gap-2 px-4">
                          <p className="text-dfxGray-800 italic break-all">{setupInfo.secret}</p>
                          <CopyButton onCopy={() => copy(setupInfo.secret)} />
                        </div>
                      </StyledVerticalStack>
                    </StyledVerticalStack>
                  </>
                )}

                <StyledVerticalStack gap={4} full>
                  <h2 className="text-dfxGray-700">
                    {/* step 3 */}
                    {setupInfo?.uri && (
                      <span className="text-dfxGray-800">
                        {translate('screens/2fa', 'Step {{step}}', { step: 3 })}
                        {': '}
                      </span>
                    )}
                    <span className="font-medium">
                      {translate(
                        'screens/2fa',
                        setupInfo?.type === TfaType.MAIL
                          ? 'We have emailed you a 6-digit code. Please enter it here.'
                          : 'Enter the 6-digit dynamic code from your authenticator app',
                      )}
                    </span>
                  </h2>
                  <StyledInput
                    name="token"
                    type="number"
                    placeholder={translate(
                      'screens/2fa',
                      setupInfo?.type === TfaType.MAIL ? 'Email code' : 'Authenticator code',
                    )}
                    forceError={tokenInvalid}
                    forceErrorMessage={tokenInvalid ? translate('screens/2fa', 'Invalid or expired code') : undefined}
                    full
                  />

                  <StyledVerticalStack gap={2} full center>
                    <StyledButton
                      type="submit"
                      width={StyledButtonWidth.MIN}
                      label={translate('general/actions', 'Next')}
                      onClick={handleSubmit(onSubmit)}
                      isLoading={isSubmitting}
                      disabled={!isValid}
                    />
                  </StyledVerticalStack>
                </StyledVerticalStack>
              </>
              {error && (
                <StyledVerticalStack full center>
                  <ErrorHint message={error} />
                </StyledVerticalStack>
              )}
            </StyledVerticalStack>
          </div>
        </Form>
      )}
    </>
  );
}
