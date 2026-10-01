import { ApiError, Utils, Validations, useAuth } from '@dfx.swiss/react';
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
import { useNavigation } from '../../../hooks/navigation.hook';
import { appOrigin } from '../../../util/app-origin';
import { loginRedirectParams } from '../../../util/login-redirect';
import { relativeUrl } from '../../../util/utils';
import { ConnectError, ConnectProps } from '../connect-shared';

interface FormData {
  mail: string;
}

export default function ConnectMail({ onCancel }: ConnectProps): JSX.Element {
  const { translate, translateError } = useSettingsContext();
  const { signInWithMail } = useAuth();
  const { navigate } = useNavigation();
  const { redirectPath, isWidget, widgetPersonalIban } = useAppHandlingContext();
  const { search } = useLocation();
  const { wallet, recommendationCode } = useAppParams();

  const [isLoading, setIsLoading] = useState(false);
  const [mailSent, setMailSent] = useState(false);
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
    signInWithMail(mail, redirectUri, recommendationCode, wallet)
      .then(() => setMailSent(true))
      .catch((error: ApiError) => setError(error.message ?? 'Unknown error'))
      .finally(() => setIsLoading(false));
  }

  function goBack() {
    onCancel();
    navigate({ pathname: '/' }, { clearParams: ['user'] });
  }

  return (
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
