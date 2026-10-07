const mockRequestMailLoginCode = jest.fn();
const mockSignInWithMail = jest.fn();
const mockSignInWithMailCode = jest.fn();
const mockSetSession = jest.fn();
const mockIsWidget = jest.fn();
const mockUseLocation = jest.fn();
const mockUseAppParams = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  Utils: {
    createRules: (ruleMap: Record<string, Array<(value: string) => true | string>>) =>
      Object.fromEntries(
        Object.entries(ruleMap).map(([name, validators]) => [
          name,
          {
            validate: (value: string) => {
              let validationError: string | undefined;
              for (const validator of validators) {
                const result = validator(value);
                if (result !== true && validationError === undefined) validationError = result;
              }
              return validationError ?? true;
            },
          },
        ]),
      ),
  },
  Validations: {
    Required: (value: string) => (value?.trim() ? true : 'required'),
    Mail: (value: string) => (value?.includes('@') ? true : 'mail'),
    Custom: (validator: (value: string) => true | string) => validator,
  },
  useAuth: () => ({
    requestMailLoginCode: mockRequestMailLoginCode,
    signInWithMail: mockSignInWithMail,
    signInWithMailCode: mockSignInWithMailCode,
  }),
}));

jest.mock('@dfx.swiss/react-components', () => {
  const React = jest.requireActual('react');
  const { useController } = jest.requireActual('react-hook-form');
  const FormContext = React.createContext(undefined);

  return {
    Form: ({ children, control, rules, onSubmit }: any) => (
      <FormContext.Provider value={{ control, rules }}>
        <form data-testid="form" onSubmit={onSubmit}>
          {children}
        </form>
      </FormContext.Provider>
    ),
    StyledButton: ({ label, onClick, type, disabled, isLoading }: any) => (
      <button type={type || 'button'} onClick={onClick} disabled={disabled} data-loading={isLoading ? 'true' : 'false'}>
        {label}
      </button>
    ),
    StyledButtonColor: { STURDY_WHITE: 'sturdy-white' },
    StyledButtonWidth: { MIN: 'min' },
    StyledInput: ({ name, placeholder, forceErrorMessage, ...props }: any) => {
      const context = React.useContext(FormContext) as any;
      const { field } = useController({
        name,
        control: context.control,
        rules: context.rules?.[name],
      });
      return (
        <>
          {forceErrorMessage && <span>{forceErrorMessage}</span>}
          <input
            aria-label={placeholder}
            value={field.value ?? ''}
            onChange={field.onChange}
            onBlur={field.onBlur}
            type={props.type}
            autoComplete={props.autocomplete}
            disabled={props.disabled}
          />
        </>
      );
    },
    StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
  };
});

jest.mock('react-i18next', () => ({
  Trans: ({ children }: any) => <>{children}</>,
}));

jest.mock('../hooks/report-displayed-error.hook', () => ({
  useReportDisplayedError: () => undefined,
}));

jest.mock('react-router-dom', () => ({
  useLocation: () => mockUseLocation(),
}));

jest.mock('../contexts/app-handling.context', () => ({
  useAppHandlingContext: () => ({
    redirectPath: '/buy',
    isWidget: mockIsWidget(),
    widgetPersonalIban: undefined,
  }),
}));

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_namespace: string, key: string) => key,
    translateError: (key: string) => key,
  }),
}));

jest.mock('../contexts/wallet.context', () => ({
  useWalletContext: () => ({ setSession: mockSetSession }),
}));

jest.mock('../hooks/app-params.hook', () => ({
  useAppParams: () => mockUseAppParams(),
}));

jest.mock('../hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import ConnectMailCode, { CODE_VALIDITY_MS, MAX_CODE_ATTEMPTS } from '../components/home/wallet/connect-mail-code';
import ConnectMail from '../components/home/wallet/connect-mail';
import type { WalletType } from '../contexts/wallet.context';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe('ConnectMailCode', () => {
  let now: number;
  let onResend: jest.Mock;
  let onSuccess: jest.Mock;
  let onBack: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    mockSignInWithMailCode.mockResolvedValue({ accessToken: 'access-token' });
    onResend = jest.fn().mockImplementation(() => Promise.resolve(now));
    onSuccess = jest.fn().mockResolvedValue(undefined);
    onBack = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function renderCode() {
    return render(
      <ConnectMailCode secret="secret" requestedAt={now} onResend={onResend} onSuccess={onSuccess} onBack={onBack} />,
    );
  }

  function enterCode(code = '123456'): void {
    const input = screen.getByLabelText('6-digit code');
    fireEvent.change(input, { target: { value: code } });
    fireEvent.blur(input);
  }

  async function submitCode(code = '123456'): Promise<void> {
    enterCode(code);
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form'));
    });
  }

  it('submits the trimmed code and forwards the access token', async () => {
    renderCode();
    await submitCode(' 123456 ');

    expect(mockSignInWithMailCode).toHaveBeenCalledWith('secret', '123456');
    expect(onSuccess).toHaveBeenCalledWith('access-token');
    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveAttribute('data-loading', 'true');
  });

  it('does not submit a code that is not six digits', async () => {
    renderCode();
    await submitCode('12345');

    expect(mockSignInWithMailCode).not.toHaveBeenCalled();
  });

  it('does not submit an empty code', async () => {
    renderCode();
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form'));
    });

    expect(mockSignInWithMailCode).not.toHaveBeenCalled();
  });

  it('shows an invalid message after a 401 and accepts a retry', async () => {
    mockSignInWithMailCode.mockRejectedValueOnce({ statusCode: 401 });
    renderCode();

    await submitCode();
    expect(screen.getByText('The code is incorrect. Please check it and try again.')).toBeInTheDocument();
    expect(screen.getByLabelText('6-digit code')).toHaveValue('');

    await submitCode('654321');
    expect(mockSignInWithMailCode).toHaveBeenLastCalledWith('secret', '654321');
    expect(onSuccess).toHaveBeenCalledWith('access-token');
  });

  it('locks after five incorrect attempts', async () => {
    mockSignInWithMailCode.mockRejectedValue({ statusCode: 401 });
    renderCode();

    for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt += 1) {
      await submitCode();
      await waitFor(() => expect(mockSignInWithMailCode).toHaveBeenCalledTimes(attempt));
    }

    expect(screen.getByText('Too many incorrect attempts. Please request a new code.')).toBeInTheDocument();
    expect(screen.queryByLabelText('6-digit code')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send new code' })).toBeInTheDocument();
  });

  it('expires before submit without calling the API', async () => {
    renderCode();
    now += CODE_VALIDITY_MS;

    await submitCode();

    expect(mockSignInWithMailCode).not.toHaveBeenCalled();
    expect(screen.getByText('This code has expired. Please request a new code.')).toBeInTheDocument();
    expect(screen.queryByLabelText('6-digit code')).not.toBeInTheDocument();
  });

  it('becomes expired when time elapses during a failed exchange', async () => {
    const exchange = deferred<{ accessToken: string }>();
    mockSignInWithMailCode.mockReturnValue(exchange.promise);
    renderCode();
    enterCode();
    fireEvent.submit(screen.getByTestId('form'));
    await waitFor(() => expect(mockSignInWithMailCode).toHaveBeenCalled());

    now += CODE_VALIDITY_MS;
    await act(async () => exchange.reject({ statusCode: 401 }));

    expect(screen.getByText('This code has expired. Please request a new code.')).toBeInTheDocument();
  });

  it.each([
    [429, 'Too many attempts. Please wait a moment and try again.'],
    [500, 'Something went wrong. Please try again.'],
  ])('maps exchange error %s to a generic message without counting an attempt', async (statusCode, message) => {
    mockSignInWithMailCode.mockRejectedValueOnce({ statusCode });
    renderCode();

    await submitCode();
    expect(screen.getByText(message)).toBeInTheDocument();

    mockSignInWithMailCode.mockRejectedValueOnce({ statusCode: 401 });
    await submitCode();
    expect(screen.getByText('The code is incorrect. Please check it and try again.')).toBeInTheDocument();
  });

  it('resends, clears the current status and resets incorrect attempts', async () => {
    mockSignInWithMailCode.mockRejectedValue({ statusCode: 401 });
    renderCode();

    for (let attempt = 1; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      await submitCode();
      await waitFor(() => expect(mockSignInWithMailCode).toHaveBeenCalledTimes(attempt));
    }

    now += CODE_VALIDITY_MS;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send new code' }));
    });

    expect(onResend).toHaveBeenCalled();
    expect(screen.getByText('We have sent you a new code.')).toBeInTheDocument();
    expect(screen.getByLabelText('6-digit code')).toHaveValue('');

    await submitCode();
    expect(screen.getByText('The code is incorrect. Please check it and try again.')).toBeInTheDocument();
  });

  it.each([
    [429, 'Too many attempts. Please wait a moment and try again.'],
    [500, 'Something went wrong. Please try again.'],
  ])('maps resend error %s and keeps the previous locked status', async (statusCode, message) => {
    mockSignInWithMailCode.mockRejectedValue({ statusCode: 401 });
    onResend.mockRejectedValue({ statusCode });
    renderCode();

    for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt += 1) {
      await submitCode();
      await waitFor(() => expect(mockSignInWithMailCode).toHaveBeenCalledTimes(attempt));
    }

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send new code' }));
    });

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByText('Too many incorrect attempts. Please request a new code.')).toBeInTheDocument();
    expect(screen.queryByLabelText('6-digit code')).not.toBeInTheDocument();
  });

  it('calls onBack', () => {
    renderCode();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('does not update state after unmounting during an exchange', async () => {
    const exchange = deferred<{ accessToken: string }>();
    mockSignInWithMailCode.mockReturnValue(exchange.promise);
    const { unmount } = renderCode();
    enterCode();
    fireEvent.submit(screen.getByTestId('form'));
    await waitFor(() => expect(mockSignInWithMailCode).toHaveBeenCalled());

    unmount();
    await act(async () => exchange.reject({ statusCode: 401 }));
  });

  it('does not complete the login when the step is left before the exchange succeeds', async () => {
    const exchange = deferred<{ accessToken: string }>();
    mockSignInWithMailCode.mockReturnValue(exchange.promise);
    const { unmount } = renderCode();
    enterCode();
    fireEvent.submit(screen.getByTestId('form'));
    await waitFor(() => expect(mockSignInWithMailCode).toHaveBeenCalled());

    unmount();
    await act(async () => exchange.resolve({ accessToken: 'access-token' }));

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('disables Back and Send new code while an exchange is pending', async () => {
    const exchange = deferred<{ accessToken: string }>();
    mockSignInWithMailCode.mockReturnValue(exchange.promise);
    renderCode();
    enterCode();
    fireEvent.submit(screen.getByTestId('form'));
    await waitFor(() => expect(mockSignInWithMailCode).toHaveBeenCalled());

    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send new code' })).toBeDisabled();

    await act(async () => exchange.reject({ statusCode: 401 }));

    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Send new code' })).toBeEnabled();
  });

  it('disables Back, Confirm and Send new code while a resend is pending', async () => {
    const resend = deferred<number>();
    onResend.mockReturnValue(resend.promise);
    renderCode();
    enterCode();
    fireEvent.click(screen.getByRole('button', { name: 'Send new code' }));
    await waitFor(() => expect(onResend).toHaveBeenCalled());

    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send new code' })).toBeDisabled();

    await act(async () => resend.resolve(now));

    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Send new code' })).toBeEnabled();
  });

  it('does not update state after unmounting during a resend', async () => {
    const resend = deferred<number>();
    onResend.mockReturnValue(resend.promise);
    const { unmount } = renderCode();
    fireEvent.click(screen.getByRole('button', { name: 'Send new code' }));
    await waitFor(() => expect(onResend).toHaveBeenCalled());

    unmount();
    await act(async () => resend.reject({ statusCode: 429 }));
  });
});

describe('ConnectMail widget code login', () => {
  const originalPublicUrl = process.env.REACT_APP_PUBLIC_URL;
  const onLogin = jest.fn();
  const onCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.REACT_APP_PUBLIC_URL;
    mockIsWidget.mockReturnValue(true);
    mockUseLocation.mockReturnValue({ search: '?user=user@example.com' });
    mockUseAppParams.mockReturnValue({ recommendationCode: 'REC1', wallet: 'Mail' });
    mockRequestMailLoginCode.mockResolvedValue({ secret: 'first-secret' });
    mockSignInWithMail.mockResolvedValue(undefined);
    mockSignInWithMailCode.mockResolvedValue({ accessToken: 'widget-token' });
    mockSetSession.mockResolvedValue(undefined);
  });

  afterAll(() => {
    if (originalPublicUrl === undefined) {
      delete process.env.REACT_APP_PUBLIC_URL;
    } else {
      process.env.REACT_APP_PUBLIC_URL = originalPublicUrl;
    }
  });

  function renderMail() {
    return render(
      <ConnectMail
        rootRef={createRef<HTMLDivElement>()}
        wallet={'Mail' as WalletType}
        blockchain={undefined}
        isConnect={false}
        onLogin={onLogin}
        onCancel={onCancel}
        onSwitch={jest.fn()}
      />,
    );
  }

  async function requestCode(): Promise<void> {
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form'));
    });
    await screen.findByLabelText('6-digit code');
  }

  it('requests a widget code and completes login through the wallet session', async () => {
    renderMail();
    await requestCode();

    expect(mockRequestMailLoginCode).toHaveBeenCalledWith('user@example.com', 'http://localhost/buy', 'REC1', 'Mail');
    expect(mockSignInWithMail).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '123456' } });
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form'));
    });

    expect(mockSignInWithMailCode).toHaveBeenCalledWith('first-secret', '123456');
    expect(mockSetSession).toHaveBeenCalledWith('widget-token');
    expect(onLogin).toHaveBeenCalled();
  });

  it('uses the replacement secret after resend', async () => {
    mockRequestMailLoginCode
      .mockResolvedValueOnce({ secret: 'first-secret' })
      .mockResolvedValueOnce({ secret: 'second-secret' });
    renderMail();
    await requestCode();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send new code' }));
    });
    fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '123456' } });
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form'));
    });

    expect(mockRequestMailLoginCode).toHaveBeenLastCalledWith(
      'user@example.com',
      'http://localhost/buy',
      'REC1',
      'Mail',
    );
    expect(mockSignInWithMailCode).toHaveBeenCalledWith('second-secret', '123456');
  });

  it('counts the code validity from the moment the code was requested', async () => {
    let now = 1_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    const request = deferred<{ secret: string }>();
    mockRequestMailLoginCode.mockReturnValue(request.promise);
    renderMail();
    fireEvent.submit(screen.getByTestId('form'));
    await waitFor(() => expect(mockRequestMailLoginCode).toHaveBeenCalled());

    now += CODE_VALIDITY_MS;
    await act(async () => request.resolve({ secret: 'first-secret' }));
    fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '123456' } });
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form'));
    });

    expect(mockSignInWithMailCode).not.toHaveBeenCalled();
    expect(screen.getByText('This code has expired. Please request a new code.')).toBeInTheDocument();
    nowSpy.mockRestore();
  });

  it('counts the validity of a resent code from the moment it was requested', async () => {
    let now = 1_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    renderMail();
    await requestCode();

    const resend = deferred<{ secret: string }>();
    mockRequestMailLoginCode.mockReturnValue(resend.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Send new code' }));
    await waitFor(() => expect(mockRequestMailLoginCode).toHaveBeenCalledTimes(2));

    now += CODE_VALIDITY_MS;
    await act(async () => resend.resolve({ secret: 'second-secret' }));
    fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '123456' } });
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form'));
    });

    expect(mockSignInWithMailCode).not.toHaveBeenCalled();
    expect(screen.getByText('This code has expired. Please request a new code.')).toBeInTheDocument();
    nowSpy.mockRestore();
  });

  it('returns to the prefilled mail form and drops the current code step', async () => {
    renderMail();
    await requestCode();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByLabelText('example@mail.com')).toHaveValue('user@example.com');
    expect(screen.queryByLabelText('6-digit code')).not.toBeInTheDocument();
  });

  it.each([
    [429, 'Too many attempts. Please wait a moment and try again.'],
    [500, 'Something went wrong. Please try again.'],
  ])('maps initial request error %s without rendering server text', async (statusCode, message) => {
    mockRequestMailLoginCode.mockRejectedValue({ statusCode, message: 'server text' });
    renderMail();

    await act(async () => {
      fireEvent.submit(screen.getByTestId('form'));
    });

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText('server text')).not.toBeInTheDocument();
  });

  it('keeps the standalone mail-link flow unchanged', async () => {
    mockIsWidget.mockReturnValue(false);
    renderMail();

    await act(async () => {
      fireEvent.submit(screen.getByTestId('form'));
    });

    expect(mockSignInWithMail).toHaveBeenCalledWith('user@example.com', 'http://localhost/buy', 'REC1', 'Mail');
    expect(mockRequestMailLoginCode).not.toHaveBeenCalled();
    expect(
      await screen.findByText('We have sent an email with further instructions to the address provided.'),
    ).toBeInTheDocument();
  });

  it('does not update state after unmounting during the initial request', async () => {
    const request = deferred<{ secret: string }>();
    mockRequestMailLoginCode.mockReturnValue(request.promise);
    const { unmount } = renderMail();
    fireEvent.submit(screen.getByTestId('form'));
    await waitFor(() => expect(mockRequestMailLoginCode).toHaveBeenCalled());

    unmount();
    await act(async () => request.resolve({ secret: 'unused-secret' }));
  });

  it('does not render a request error after unmounting', async () => {
    const request = deferred<{ secret: string }>();
    mockRequestMailLoginCode.mockReturnValue(request.promise);
    const { unmount } = renderMail();
    fireEvent.submit(screen.getByTestId('form'));
    await waitFor(() => expect(mockRequestMailLoginCode).toHaveBeenCalled());

    unmount();
    await act(async () => request.reject({ statusCode: 429, message: 'server text' }));
  });

  it('does not update state after unmounting during resend', async () => {
    const { unmount } = renderMail();
    await requestCode();
    const request = deferred<{ secret: string }>();
    mockRequestMailLoginCode.mockReturnValueOnce(request.promise);

    fireEvent.click(screen.getByRole('button', { name: 'Send new code' }));
    await waitFor(() => expect(mockRequestMailLoginCode).toHaveBeenCalledTimes(2));
    unmount();
    await act(async () => request.resolve({ secret: 'unused-secret' }));
  });
});
