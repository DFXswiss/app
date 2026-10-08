import { ApiError, Utils, Validations, useAuth, useSessionContext } from '@dfx.swiss/react';
import {
  Form,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledInput,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation } from 'react-router-dom';
import { useAppParams } from 'src/hooks/app-params.hook';
import { useAppHandlingContext } from '../../../contexts/app-handling.context';
import { useSettingsContext } from '../../../contexts/settings.context';
import { useWalletContext } from '../../../contexts/wallet.context';
import { useNavigation } from '../../../hooks/navigation.hook';
import { appOrigin } from '../../../util/app-origin';
import { loginRedirectParams } from '../../../util/login-redirect';
import { relativeUrl } from '../../../util/utils';
import { ConnectError, ConnectProps } from '../connect-shared';
import ConnectMailCode from './connect-mail-code';

interface FormData {
  mail: string;
}

interface CodeMode {
  mail: string;
  secret: string;
  requestedAt: number;
}

const TOO_MANY_ATTEMPTS = 'Too many attempts. Please wait a moment and try again.';
const GENERIC_ERROR = 'Something went wrong. Please try again.';

export default function ConnectMail({ isConnect, onLogin, onCancel }: ConnectProps): JSX.Element {
  const { translate, translateError } = useSettingsContext();
  const { requestMailLoginCode, signInWithMail } = useAuth();
  const { setSession } = useWalletContext();
  const { logout } = useSessionContext();
  const { navigate } = useNavigation();
  const { redirectPath, isWidget, widgetPersonalIban } = useAppHandlingContext();
  const { search } = useLocation();
  const { wallet, recommendationCode } = useAppParams();

  const [isLoading, setIsLoading] = useState(false);
  const [mailSent, setMailSent] = useState(false);
  const [codeMode, setCodeMode] = useState<CodeMode>();
  const [error, setError] = useState<string>();

  const mail = new URLSearchParams(search).get('user') || undefined;

  const win: Window = window;
  // Merge redirectPath with personal-iban from the widget attribute when embedded, otherwise from the page query.
  // Do not copy the entire live search — that would forward user=/arbitrary= into the magic link.
  // The origin is the app's own, not the embedding page's (the API only accepts the app's origins as login redirect).
  const redirectUri =
    redirectPath &&
    `${appOrigin()}${relativeUrl({
      path: redirectPath,
      params: loginRedirectParams({ isWidget, widgetPersonalIban }, win.location.search),
    })}`;

  const {
    control,
    handleSubmit,
    formState: { isValid, errors },
  } = useForm<FormData>({
    mode: 'onTouched',
    defaultValues: { mail },
  });

  const rules = Utils.createRules({
    mail: [Validations.Required, Validations.Mail],
  });

  async function submit({ mail }: FormData): Promise<void> {
    setIsLoading(true);
    setError(undefined);
    if (isWidget) {
      // The code's validity starts when it is requested, not when the response arrives.
      const requestedAt = Date.now();
      requestMailLoginCode(mail, redirectUri, recommendationCode, wallet)
        .then(({ secret }) => setCodeMode({ mail, secret, requestedAt }))
        .catch((error: ApiError) => setError(error.statusCode === 429 ? TOO_MANY_ATTEMPTS : GENERIC_ERROR))
        .finally(() => setIsLoading(false));
      return;
    }

    signInWithMail(mail, redirectUri, recommendationCode, wallet)
      .then(() => setMailSent(true))
      .catch((error: ApiError) => setError(error.message ?? 'Unknown error'))
      .finally(() => setIsLoading(false));
  }

  async function resendCode(mail: string): Promise<number> {
    const requestedAt = Date.now();
    const { secret } = await requestMailLoginCode(mail, redirectUri, recommendationCode, wallet);
    setCodeMode({ mail, secret, requestedAt });
    return requestedAt;
  }

  async function completeLogin(accessToken: string): Promise<void> {
    if (!isConnect) await logout();
    await setSession(accessToken);
    onLogin();
    // Unlike the mail link, the code login completes without a page load, so the connect step has to be left here.
    onCancel();
  }

  function goBack() {
    onCancel();
    navigate({ pathname: '/' }, { clearParams: ['user'] });
  }

  return codeMode ? (
    <ConnectMailCode
      secret={codeMode.secret}
      requestedAt={codeMode.requestedAt}
      onResend={() => resendCode(codeMode.mail)}
      onSuccess={completeLogin}
      onBack={() => setCodeMode(undefined)}
    />
  ) : (
    <Form control={control} rules={rules} errors={errors} onSubmit={handleSubmit(submit)} translate={translateError}>
      <StyledVerticalStack gap={6} full center>
        {mailSent ? (
          <>
            <p className="text-dfxGray-700">
              {translate('screens/home', 'We have sent an email with further instructions to the address provided.')}
            </p>

            <StyledButton
              label={translate('general/actions', 'Back')}
              onClick={goBack}
              width={StyledButtonWidth.MIN}
              color={StyledButtonColor.STURDY_WHITE}
            />
          </>
        ) : (
          <>
            <StyledInput
              name="mail"
              autocomplete="email"
              type="email"
              label={translate('screens/kyc', 'Email address')}
              placeholder={translate('screens/kyc', 'example@mail.com')}
              disabled={isLoading}
              full
              smallLabel
            />

            <StyledButton
              type="submit"
              disabled={!isValid}
              label={translate('general/actions', 'Next')}
              onClick={handleSubmit(submit)}
              width={StyledButtonWidth.MIN}
              className="self-center"
              isLoading={isLoading}
            />

            {error && <ConnectError error={error} />}
          </>
        )}
      </StyledVerticalStack>
    </Form>
  );
}
