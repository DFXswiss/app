import { ApiError, Utils, Validations, useAuth } from '@dfx.swiss/react';
import {
  Form,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledInput,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSettingsContext } from '../../../contexts/settings.context';
import { ConnectError } from '../connect-shared';

const MAX_CODE_ATTEMPTS = 5;
const CODE_VALIDITY_MS = 10 * 60 * 1000;

const TOO_MANY_ATTEMPTS = 'Too many attempts. Please wait a moment and try again.';
const GENERIC_ERROR = 'Something went wrong. Please try again.';
const INVALID_CODE = 'The code is incorrect. Please check it and try again.';
const EXPIRED_CODE = 'This code has expired. Please request a new code.';
const LOCKED_CODE = 'Too many incorrect attempts. Please request a new code.';

type CodeStatus = 'idle' | 'invalid' | 'expired' | 'locked';

interface FormData {
  code: string;
}

export interface ConnectMailCodeProps {
  secret: string;
  requestedAt: number;
  onResend: () => Promise<number>;
  onSuccess: (accessToken: string) => Promise<void> | void;
  onBack: () => void;
}

function genericError(error: ApiError): string {
  return error.statusCode === 429 ? TOO_MANY_ATTEMPTS : GENERIC_ERROR;
}

export default function ConnectMailCode({
  secret,
  requestedAt: initialRequestedAt,
  onResend,
  onSuccess,
  onBack,
}: ConnectMailCodeProps): JSX.Element {
  const { translate, translateError } = useSettingsContext();
  const { signInWithMailCode } = useAuth();
  const [attempts, setAttempts] = useState(0);
  const [requestedAt, setRequestedAt] = useState(initialRequestedAt);
  const [status, setStatus] = useState<CodeStatus>('idle');
  const [error, setError] = useState<string>();
  const [info, setInfo] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const {
    control,
    handleSubmit,
    resetField,
    formState: { isValid, errors },
  } = useForm<FormData>({ mode: 'onTouched' });

  const rules = Utils.createRules({
    code: [
      Validations.Required,
      Validations.Custom((v: string) => (/^\d{6}$/.test(v?.trim() ?? '') ? true : 'pattern')),
    ],
  });

  async function submit({ code }: FormData): Promise<void> {
    setError(undefined);
    setInfo(undefined);

    if (Date.now() - requestedAt >= CODE_VALIDITY_MS) {
      setStatus('expired');
      return;
    }

    setStatus('idle');
    setIsSubmitting(true);
    try {
      const { accessToken } = await signInWithMailCode(secret, code.trim());
      if (!isMounted.current) return;

      await onSuccess(accessToken);
    } catch (caughtError) {
      const apiError = caughtError as ApiError;
      if (apiError.statusCode === 401) {
        const nextAttempts = attempts + 1;
        setAttempts(nextAttempts);
        if (Date.now() - requestedAt >= CODE_VALIDITY_MS) {
          setStatus('expired');
        } else if (nextAttempts >= MAX_CODE_ATTEMPTS) {
          setStatus('locked');
        } else {
          setStatus('invalid');
          resetField('code');
        }
      } else {
        setError(genericError(apiError));
      }
      setIsSubmitting(false);
    }
  }

  async function resend(): Promise<void> {
    setError(undefined);
    setInfo(undefined);
    setIsResending(true);

    try {
      const newRequestedAt = await onResend();
      setAttempts(0);
      setRequestedAt(newRequestedAt);
      setStatus('idle');
      resetField('code');
      setInfo('We have sent you a new code.');
      setIsResending(false);
    } catch (caughtError) {
      setError(genericError(caughtError as ApiError));
      setIsResending(false);
    }
  }

  const codeUnavailable = status === 'expired' || status === 'locked';
  const invalidMessage = status === 'invalid' ? INVALID_CODE : undefined;
  const unavailableMessage = status === 'expired' ? EXPIRED_CODE : LOCKED_CODE;

  return (
    <Form control={control} rules={rules} errors={errors} onSubmit={handleSubmit(submit)} translate={translateError}>
      <StyledVerticalStack gap={6} full center>
        <p className="text-dfxGray-700">
          {translate('screens/home', 'We have sent you an email with a 6-digit code. Please enter it here to log in.')}
        </p>

        {codeUnavailable ? (
          <p className="text-dfxRed-150">{translate('screens/home', unavailableMessage)}</p>
        ) : (
          <StyledInput
            name="code"
            type="text"
            autocomplete="one-time-code"
            placeholder={translate('screens/home', '6-digit code')}
            forceError={status === 'invalid'}
            forceErrorMessage={invalidMessage && translate('screens/home', invalidMessage)}
            disabled={isSubmitting || isResending}
            full
            smallLabel
          />
        )}

        {info && <p className="text-dfxGray-700">{translate('screens/home', info)}</p>}

        {!codeUnavailable && (
          <StyledButton
            type="submit"
            disabled={!isValid || isResending}
            label={translate('general/actions', 'Confirm')}
            onClick={handleSubmit(submit)}
            width={StyledButtonWidth.MIN}
            isLoading={isSubmitting}
          />
        )}

        <StyledButton
          label={translate('screens/home', 'Send new code')}
          onClick={resend}
          disabled={isSubmitting || isResending}
          width={StyledButtonWidth.MIN}
          color={StyledButtonColor.STURDY_WHITE}
          isLoading={isResending}
        />

        <StyledButton
          label={translate('general/actions', 'Back')}
          onClick={onBack}
          disabled={isSubmitting || isResending}
          width={StyledButtonWidth.MIN}
          color={StyledButtonColor.STURDY_WHITE}
        />

        {error && <ConnectError error={error} />}
      </StyledVerticalStack>
    </Form>
  );
}
