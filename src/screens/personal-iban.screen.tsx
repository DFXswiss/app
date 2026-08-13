import { ApiError, VirtualIban } from '@dfx.swiss/react';
import {
  IconColor,
  SpinnerSize,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledInfoText,
  StyledLoadingSpinner,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ErrorHint } from '../components/error-hint';
import { useSettingsContext } from '../contexts/settings.context';
import { useAddressGuard } from '../hooks/guard.hook';
import { useLayoutOptions } from '../hooks/layout-config.hook';
import { useNavigation } from '../hooks/navigation.hook';
import useVirtualIban from '../hooks/virtual-iban.hook';

enum Status {
  INITIAL = 'INITIAL',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  KYC_REQUIRED = 'KYC_REQUIRED',
  ERROR = 'ERROR',
}

const MISSING_CURRENCY_MESSAGE =
  'No currency specified. Please go back and select a currency.';

const OWN_NAME_SUCCESS_MESSAGE =
  'Your personal IBAN for {{currency}} transactions is now available. Future bank transfers will be made to this IBAN in your own name.';

export default function PersonalIbanScreen(): JSX.Element {
  useAddressGuard('/login');

  const { translate } = useSettingsContext();
  const { navigate, goBack } = useNavigation();
  const { createPersonalIban } = useVirtualIban();
  const [params] = useSearchParams();

  // No silent currency default — the legacy endpoint requires an explicit supported currency.
  const currency = params.get('currency') ?? undefined;

  const [status, setStatus] = useState<Status>(Status.INITIAL);
  const [error, setError] = useState<string>();
  const [virtualIban, setVirtualIban] = useState<VirtualIban>();

  useLayoutOptions({
    title: translate('screens/personal-iban', 'Personal IBAN'),
    backButton: true,
    textStart: true,
  });

  useEffect(() => {
    if (status === Status.INITIAL) {
      generateIban();
    }
  }, []);

  async function generateIban() {
    if (!currency) {
      setError(translate('screens/personal-iban', MISSING_CURRENCY_MESSAGE));
      setStatus(Status.ERROR);
      return;
    }

    setStatus(Status.LOADING);
    setError(undefined);

    try {
      const result = await createPersonalIban({ currency });
      setVirtualIban(result);
      setStatus(Status.SUCCESS);
    } catch (e: unknown) {
      const apiError = e as ApiError;
      if (apiError.statusCode === 400 && apiError.message?.includes('KYC level')) {
        setStatus(Status.KYC_REQUIRED);
      } else {
        setError(apiError.message ?? 'Unknown error');
        setStatus(Status.ERROR);
      }
    }
  }

  function navigateToKyc() {
    navigate('/kyc', { setRedirect: true });
  }

  function navigateBack() {
    goBack();
  }

  return (
    <StyledVerticalStack gap={4} full center>
      <h2 className="text-dfxBlue-800 text-center">
        {translate('screens/personal-iban', 'Generate Personal IBAN')}
      </h2>

      {status === Status.LOADING && (
        <StyledVerticalStack gap={2} center>
          <StyledLoadingSpinner size={SpinnerSize.LG} />
          <p className="text-dfxGray-800">
            {translate('screens/personal-iban', 'Generating your personal IBAN...')}
          </p>
        </StyledVerticalStack>
      )}

      {status === Status.SUCCESS && virtualIban && currency && (
        <StyledVerticalStack gap={4} full>
          <div className="bg-dfxGray-300/50 rounded-md p-4">
            <StyledVerticalStack gap={2}>
              <p className="text-dfxGray-800 text-sm">
                {translate('screens/personal-iban', 'Your personal IBAN for {{currency}}:', { currency })}
              </p>
              <p className="text-dfxBlue-800 font-bold text-lg break-all">{virtualIban.iban}</p>
            </StyledVerticalStack>
          </div>

          <StyledInfoText iconColor={IconColor.BLUE}>
            {translate('screens/personal-iban', OWN_NAME_SUCCESS_MESSAGE, { currency })}
          </StyledInfoText>

          <StyledButton
            width={StyledButtonWidth.FULL}
            label={translate('general/actions', 'Back')}
            onClick={navigateBack}
            color={StyledButtonColor.STURDY_WHITE}
          />
        </StyledVerticalStack>
      )}

      {status === Status.KYC_REQUIRED && (
        <StyledVerticalStack gap={4} full>
          <StyledInfoText iconColor={IconColor.BLUE}>
            {translate(
              'screens/personal-iban',
              'To generate a personal IBAN, we need some additional information from you. Please complete the verification process.',
            )}
          </StyledInfoText>

          <StyledButton
            width={StyledButtonWidth.FULL}
            label={translate('screens/personal-iban', 'Complete verification')}
            onClick={navigateToKyc}
          />

          <StyledButton
            width={StyledButtonWidth.FULL}
            label={translate('general/actions', 'Back')}
            onClick={navigateBack}
            color={StyledButtonColor.STURDY_WHITE}
          />
        </StyledVerticalStack>
      )}

      {status === Status.ERROR && error && (
        <StyledVerticalStack gap={4} full>
          <ErrorHint message={error} />

          <StyledButton
            width={StyledButtonWidth.FULL}
            label={translate('general/actions', 'Try again')}
            onClick={generateIban}
          />

          <StyledButton
            width={StyledButtonWidth.FULL}
            label={translate('general/actions', 'Back')}
            onClick={navigateBack}
            color={StyledButtonColor.STURDY_WHITE}
          />
        </StyledVerticalStack>
      )}
    </StyledVerticalStack>
  );
}
