import { useSessionContext } from '@dfx.swiss/react';
import { StyledButton, StyledButtonColor, StyledButtonWidth, StyledVerticalStack } from '@dfx.swiss/react-components';
import { PropsWithChildren } from 'react';
import { useSettingsContext } from '../contexts/settings.context';
import { useNavigation } from '../hooks/navigation.hook';
import { ErrorHint } from './error-hint';

// Stored in a screen's error state in place of the raw API message when a quote request is
// rejected with 401: a retry would resend the rejected request, so the customer signs in again.
export const SESSION_EXPIRED_ERROR = 'quote-request-error/session-expired';

interface QuoteRequestErrorProps extends PropsWithChildren {
  message: string;
  onRetry: () => void;
}

export function QuoteRequestError({ message, onRetry, children }: QuoteRequestErrorProps): JSX.Element {
  const { translate } = useSettingsContext();
  const { logout } = useSessionContext();
  const { navigate } = useNavigation();

  function onLogin() {
    logout();
    navigate('/login', { setRedirect: true });
  }

  return (
    <StyledVerticalStack center className="text-center">
      {message === SESSION_EXPIRED_ERROR ? (
        <>
          <p className="text-dfxRed-100">
            {translate('general/errors', 'Your login has expired. Please sign in again.')}
          </p>

          <StyledButton
            width={StyledButtonWidth.MIN}
            label={translate('general/actions', 'Login')}
            onClick={onLogin}
            className="mt-4"
            color={StyledButtonColor.STURDY_WHITE}
          />
        </>
      ) : (
        <>
          <ErrorHint message={message} />

          {children}

          <StyledButton
            width={StyledButtonWidth.MIN}
            label={translate('general/actions', 'Retry')}
            onClick={onRetry}
            className="mt-4"
            color={StyledButtonColor.STURDY_WHITE}
          />
        </>
      )}
    </StyledVerticalStack>
  );
}
