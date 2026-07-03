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
import { personalIbanOnlyParams } from '../../../util/personal-iban';
import { relativeUrl } from '../../../util/utils';
import { ConnectError, ConnectProps } from '../connect-shared';

interface FormData {
  mail: string;
}

// Resolvable name of the backend default wallet (wallet table: "DFX Wallet", Config.defaultWalletId = 1).
// Sent when no explicit `wallet` URL param is present, so POST /v1/auth/mail resolves the login wallet by
// name rather than via getDefault(). Partner embeds that pass `?wallet=` keep their value (??).
const DFX_WALLET_NAME = 'DFX Wallet';

export default function ConnectMail({ onCancel }: ConnectProps): JSX.Element {
  const { translate, translateError } = useSettingsContext();
  const { signInWithMail } = useAuth();
  const { navigate } = useNavigation();
  const { redirectPath } = useAppHandlingContext();
  const { search } = useLocation();
  const { wallet, recommendationCode } = useAppParams();

  const [isLoading, setIsLoading] = useState(false);
  const [mailSent, setMailSent] = useState(false);
  const [error, setError] = useState<string>();

  const mail = new URLSearchParams(search).get('user') || undefined;

  const win: Window = window;
  // Merge redirectPath with an allowlisted callback param set (only personal-iban when present).
  // Do not copy the entire live search — that would forward user=/arbitrary= into the magic link.
  const redirectUri =
    redirectPath &&
    `${win.location.origin}${relativeUrl({
      path: redirectPath,
      params: personalIbanOnlyParams(win.location.search),
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
    signInWithMail(mail, redirectUri, recommendationCode, wallet ?? DFX_WALLET_NAME)
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
