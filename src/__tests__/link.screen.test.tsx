// Component-level: LinkScreen tries handleMergedError first in every catch, keeps existing error handling when it
// returns false, and sends the page to return to as redirectUri with the contact data.

const mockGetKycInfo = jest.fn();
const mockContinueKyc = jest.fn();
const mockSetContactData = jest.fn();
const mockReloadUser = jest.fn();
const mockNavigate = jest.fn();
const mockNavigateBack = jest.fn();
const mockHandleMergedError = jest.fn(() => false);
const mockIsStepDone = jest.fn<boolean, [unknown]>(() => false);

let mockFormData: { mail: string } = { mail: 'test@example.com' };
let mockKycHash: string | undefined = 'SLAVE_CODE';
let mockAppHandling: {
  redirectPath?: string;
  params: Record<string, string | undefined>;
  isWidget: boolean;
  widgetPersonalIban?: string;
} = { params: {}, isWidget: false };

jest.mock('@dfx.swiss/react', () => ({
  useKyc: () => ({
    getKycInfo: mockGetKycInfo,
    continueKyc: mockContinueKyc,
    setContactData: mockSetContactData,
  }),
  useUserContext: () => ({
    user: { kyc: { hash: mockKycHash } },
    reloadUser: mockReloadUser,
  }),
  KycLevel: { Link: 10, Sell: 20, Completed: 50 },
  KycStepStatus: { FAILED: 'Failed', NOT_STARTED: 'NotStarted' },
  Utils: { createRules: () => ({}) },
  Validations: { Required: undefined, Mail: undefined },
  isStepDone: (r: unknown) => mockIsStepDone(r),
}));

jest.mock('src/contexts/app-handling.context', () => ({
  useAppHandlingContext: () => mockAppHandling,
}));

jest.mock('@dfx.swiss/react-components', () => ({
  DfxIcon: () => null,
  Form: ({ children }: any) => <div>{children}</div>,
  IconColor: { BLUE: 'blue' },
  IconVariant: { USER_DATA: 'user-data' },
  SpinnerSize: { LG: 'lg' },
  StyledButton: ({ label, onClick, type, disabled }: any) => (
    <button type={type || 'button'} onClick={onClick} disabled={disabled}>
      {label}
    </button>
  ),
  StyledButtonColor: { STURDY_WHITE: 'sturdy-white' },
  StyledButtonWidth: { MIN: 'min', FULL: 'full' },
  StyledInput: () => null,
  StyledLoadingSpinner: () => <div role="progressbar" />,
  StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_ns: string, key: string) => key,
    translateError: (key: string) => key,
  }),
}));

jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));

jest.mock('src/hooks/merged-account.hook', () => ({
  useMergedAccount: () => ({ handleMergedError: mockHandleMergedError }),
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockNavigateBack }),
}));

jest.mock('react-hook-form', () => ({
  useForm: () => ({
    control: {},
    handleSubmit: (fn: any) => () => fn(mockFormData),
    formState: { isValid: true, errors: {} },
  }),
}));

import { act, render, screen, waitFor } from '@testing-library/react';
import LinkScreen from 'src/screens/link.screen';

const mergeError = { statusCode: 401, switchToCode: 'MASTER' };

const originalPublicUrl = process.env.REACT_APP_PUBLIC_URL;

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.REACT_APP_PUBLIC_URL;
  window.sessionStorage.clear();
  window.history.replaceState(undefined, '', '/link');
  mockHandleMergedError.mockReturnValue(false);
  mockIsStepDone.mockReturnValue(false);
  mockFormData = { mail: 'test@example.com' };
  mockKycHash = 'SLAVE_CODE';
  mockAppHandling = { params: {}, isWidget: false };
  mockGetKycInfo.mockResolvedValue({ kycLevel: 0 });
  mockContinueKyc.mockResolvedValue({
    kycLevel: 5,
    currentStep: { status: 'InProgress', session: { url: 'https://example.com/step' } },
  });
  mockSetContactData.mockResolvedValue({});
});

afterAll(() => {
  if (originalPublicUrl === undefined) delete process.env.REACT_APP_PUBLIC_URL;
  else process.env.REACT_APP_PUBLIC_URL = originalPublicUrl;
});

async function submitForm() {
  const next = await screen.findByRole('button', { name: 'Next' });
  await act(async () => {
    next.click();
  });
}

describe('LinkScreen handleMergedError', () => {
  it('getKycInfo catch: handleMergedError true skips setError', async () => {
    mockGetKycInfo.mockRejectedValue(mergeError);
    mockHandleMergedError.mockReturnValue(true);

    render(<LinkScreen />);

    await waitFor(() => {
      expect(mockHandleMergedError).toHaveBeenCalledWith(mergeError);
    });
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
  });

  it('getKycInfo catch: handleMergedError false keeps setError', async () => {
    mockGetKycInfo.mockRejectedValue(mergeError);

    render(<LinkScreen />);

    expect(await screen.findByTestId('error-hint')).toBeInTheDocument();
    expect(mockHandleMergedError).toHaveBeenCalledWith(mergeError);
  });

  it('getKycInfo catch: does not call handleMergedError for a response that arrives after unmount', async () => {
    let rejectGetKycInfo: (e: unknown) => void = () => undefined;
    mockGetKycInfo.mockReturnValue(
      new Promise((_, reject) => {
        rejectGetKycInfo = reject;
      }),
    );

    const { unmount } = render(<LinkScreen />);
    unmount();

    await act(async () => {
      rejectGetKycInfo(mergeError);
      await Promise.resolve();
    });

    expect(mockHandleMergedError).not.toHaveBeenCalled();
  });

  it('getKycInfo catch: a re-run after kycCode changes does not un-cancel a still-pending prior run', async () => {
    let rejectFirstGetKycInfo: (e: unknown) => void = () => undefined;
    mockGetKycInfo.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectFirstGetKycInfo = reject;
        }),
    );
    mockGetKycInfo.mockResolvedValue({ kycLevel: 5 });

    const { rerender } = render(<LinkScreen />);

    mockKycHash = 'OTHER_MASTER_CODE';
    rerender(<LinkScreen />);

    await act(async () => {
      rejectFirstGetKycInfo(mergeError);
      await Promise.resolve();
    });

    expect(mockHandleMergedError).not.toHaveBeenCalled();
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
  });

  it('getKycInfo then: a stale resolve after a re-run does not act on stale data', async () => {
    let resolveFirstGetKycInfo: (info: unknown) => void = () => undefined;
    mockGetKycInfo.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirstGetKycInfo = resolve;
        }),
    );
    mockGetKycInfo.mockResolvedValueOnce({ kycLevel: 0 });

    const { rerender } = render(<LinkScreen />);

    mockKycHash = 'OTHER_MASTER_CODE';
    rerender(<LinkScreen />);

    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalled());

    await act(async () => {
      // A stale kycLevel > 0 would call goBack() via handleInitial if not guarded.
      resolveFirstGetKycInfo({ kycLevel: 1 });
      await Promise.resolve();
    });

    expect(mockNavigateBack).not.toHaveBeenCalled();
  });

  it('continueKyc catch: handleMergedError true skips setError', async () => {
    mockGetKycInfo.mockResolvedValue({ kycLevel: 0 });
    mockContinueKyc.mockRejectedValue(mergeError);
    mockHandleMergedError.mockReturnValue(true);

    render(<LinkScreen />);

    await waitFor(() => {
      expect(mockHandleMergedError).toHaveBeenCalledWith(mergeError);
    });
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
  });

  it('continueKyc catch: handleMergedError false keeps setError', async () => {
    mockGetKycInfo.mockResolvedValue({ kycLevel: 0 });
    mockContinueKyc.mockRejectedValue(mergeError);

    render(<LinkScreen />);

    expect(await screen.findByTestId('error-hint')).toBeInTheDocument();
    expect(mockHandleMergedError).toHaveBeenCalledWith(mergeError);
  });

  it('setContactData catch: handleMergedError true skips setError', async () => {
    mockGetKycInfo.mockResolvedValue({ kycLevel: 0 });
    mockContinueKyc.mockResolvedValue({
      kycLevel: 5,
      currentStep: { status: 'InProgress', session: { url: 'https://example.com/step' } },
    });
    mockSetContactData.mockRejectedValue(mergeError);
    mockHandleMergedError.mockReturnValue(true);
    mockFormData = { mail: 'test@example.com' };

    render(<LinkScreen />);
    const next = await screen.findByRole('button', { name: 'Next' });

    await act(async () => {
      next.click();
    });

    await waitFor(() => {
      expect(mockHandleMergedError).toHaveBeenCalledWith(mergeError);
    });
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
  });

  it('setContactData catch: handleMergedError false keeps setError', async () => {
    mockGetKycInfo.mockResolvedValue({ kycLevel: 0 });
    mockContinueKyc.mockResolvedValue({
      kycLevel: 5,
      currentStep: { status: 'InProgress', session: { url: 'https://example.com/step' } },
    });
    mockSetContactData.mockRejectedValue(mergeError);
    mockFormData = { mail: 'test@example.com' };

    render(<LinkScreen />);
    const next = await screen.findByRole('button', { name: 'Next' });

    await act(async () => {
      next.click();
    });

    expect(await screen.findByTestId('error-hint')).toBeInTheDocument();
    expect(mockHandleMergedError).toHaveBeenCalledWith(mergeError);
  });
});

describe('LinkScreen redirectUri', () => {
  const PARTNER_URI = 'https://partner.example/return';

  async function sentContactData(): Promise<unknown> {
    render(<LinkScreen />);
    await submitForm();
    await waitFor(() => expect(mockSetContactData).toHaveBeenCalled());
    expect(mockSetContactData.mock.calls[0][0]).toBe('SLAVE_CODE');
    expect(mockSetContactData.mock.calls[0][1]).toBe('https://example.com/step');
    return mockSetContactData.mock.calls[0][2];
  }

  it('sends no redirectUri without a redirect path', async () => {
    window.sessionStorage.setItem('dfx.srv.redirectUri', PARTNER_URI);
    mockAppHandling.params = { amountIn: '0.2', assetIn: 'ETH' };

    const sent = await sentContactData();

    expect(sent).toEqual({ mail: 'test@example.com' });
    expect(sent).not.toHaveProperty('redirectUri');
  });

  it('sends the return page with its parameters and without login parameters', async () => {
    mockAppHandling = {
      redirectPath: '/sell',
      params: {
        amountIn: '0.2',
        assetIn: 'ETH',
        session: 'jwt',
        address: '0xabc',
        signature: 'sig',
        mail: 'other@example.com',
        redirectUri: PARTNER_URI,
      },
      isWidget: false,
    };

    expect(await sentContactData()).toEqual({
      mail: 'test@example.com',
      redirectUri: 'http://localhost/sell?amount-in=0.2&asset-in=ETH',
    });
  });

  it('adds the partner redirect URI of this session', async () => {
    window.sessionStorage.setItem('dfx.srv.redirectUri', PARTNER_URI);
    mockAppHandling = { redirectPath: '/sell', params: { amountIn: '0.2', assetIn: 'ETH' }, isWidget: false };

    expect(await sentContactData()).toEqual({
      mail: 'test@example.com',
      redirectUri: `http://localhost/sell?redirect-uri=${encodeURIComponent(PARTNER_URI)}&amount-in=0.2&asset-in=ETH`,
    });
  });

  it('keeps amount-out, asset-out, blockchain and personal-iban', async () => {
    window.history.replaceState(undefined, '', '/link?personal-iban=frick&user=other@example.com');
    mockAppHandling = {
      redirectPath: '/sell',
      params: { amountOut: '100', assetOut: 'CHF', blockchain: 'Ethereum' },
      isWidget: false,
    };

    expect(await sentContactData()).toEqual({
      mail: 'test@example.com',
      redirectUri: 'http://localhost/sell?personal-iban=frick&amount-out=100&asset-out=CHF&blockchain=Ethereum',
    });
  });

  it('removes login parameters from the redirect path', async () => {
    mockAppHandling = {
      redirectPath: '/kyc?code=KYC&address=0xabc&signature=sig&session=jwt&wallet=RealUnit',
      params: {},
      isWidget: false,
    };

    expect(await sentContactData()).toEqual({
      mail: 'test@example.com',
      redirectUri: 'http://localhost/kyc?wallet=RealUnit',
    });
  });

  it('builds the URL on the app origin', async () => {
    process.env.REACT_APP_PUBLIC_URL = 'https://app.example.com';
    mockAppHandling = { redirectPath: '/sell', params: {}, isWidget: false };

    expect(await sentContactData()).toEqual({ mail: 'test@example.com', redirectUri: 'https://app.example.com/sell' });
  });

  it('takes personal-iban from the widget and no partner redirect URI when embedded', async () => {
    window.sessionStorage.setItem('dfx.srv.redirectUri', PARTNER_URI);
    mockAppHandling = { redirectPath: '/sell', params: {}, isWidget: true, widgetPersonalIban: 'frick' };

    expect(await sentContactData()).toEqual({
      mail: 'test@example.com',
      redirectUri: 'http://localhost/sell?personal-iban=frick',
    });
  });
});

describe('LinkScreen flow', () => {
  const HINT = /It looks like you already have an account with DFX\./;

  it('waits without a KYC code', () => {
    mockKycHash = undefined;

    render(<LinkScreen />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(mockGetKycInfo).not.toHaveBeenCalled();
  });

  it('goes back when the KYC level is already above 0', async () => {
    mockGetKycInfo.mockResolvedValue({ kycLevel: 10 });

    render(<LinkScreen />);

    await waitFor(() => expect(mockNavigateBack).toHaveBeenCalled());
    expect(mockReloadUser).toHaveBeenCalled();
    expect(mockContinueKyc).not.toHaveBeenCalled();
  });

  it('offers KYC and Back when no matching account was found', async () => {
    mockContinueKyc.mockResolvedValue({ kycLevel: 10 });

    render(<LinkScreen />);

    expect(await screen.findByText('No matching account was found.')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Complete KYC' }).click();
    expect(mockNavigate).toHaveBeenCalledWith('/kyc');
    screen.getByRole('button', { name: 'Back' }).click();
    expect(mockReloadUser).toHaveBeenCalled();
    expect(mockNavigateBack).toHaveBeenCalled();
  });

  it('goes back when the account is already merged', async () => {
    mockContinueKyc.mockResolvedValue({ kycLevel: 20 });

    render(<LinkScreen />);

    await waitFor(() => expect(mockNavigateBack).toHaveBeenCalled());
  });

  it('shows the hint when the current step failed, and OK goes back', async () => {
    mockContinueKyc.mockResolvedValue({ kycLevel: 5, currentStep: { status: 'Failed' } });

    render(<LinkScreen />);

    expect(await screen.findByText(HINT)).toBeInTheDocument();
    screen.getByRole('button', { name: 'OK' }).click();
    expect(mockNavigateBack).toHaveBeenCalled();
  });

  it('shows the hint after the contact data was sent', async () => {
    render(<LinkScreen />);
    await submitForm();

    expect(await screen.findByText(HINT)).toBeInTheDocument();
    expect(mockIsStepDone).toHaveBeenCalledWith({});
  });

  it('shows no matching account when the contact step completes', async () => {
    mockIsStepDone.mockReturnValue(true);

    render(<LinkScreen />);
    await submitForm();

    expect(await screen.findByText('No matching account was found.')).toBeInTheDocument();
  });

  it('sends nothing without a contact step session', async () => {
    mockContinueKyc.mockResolvedValue({ kycLevel: 5 });

    render(<LinkScreen />);
    await submitForm();

    expect(mockSetContactData).not.toHaveBeenCalled();
  });

  it('sends nothing once the KYC code is gone', async () => {
    const { rerender } = render(<LinkScreen />);
    await screen.findByRole('button', { name: 'Next' });

    mockKycHash = undefined;
    rerender(<LinkScreen />);
    await submitForm();

    expect(mockSetContactData).not.toHaveBeenCalled();
  });

  it('shows the message of a failed getKycInfo', async () => {
    mockGetKycInfo.mockRejectedValue({ message: 'boom' });

    render(<LinkScreen />);

    expect(await screen.findByTestId('error-hint')).toHaveTextContent('boom');
  });

  it('shows the message of a failed continueKyc', async () => {
    mockContinueKyc.mockRejectedValue({ message: 'boom' });

    render(<LinkScreen />);

    expect(await screen.findByTestId('error-hint')).toHaveTextContent('boom');
  });

  it('shows the message of a failed setContactData', async () => {
    mockSetContactData.mockRejectedValue({ message: 'boom' });

    render(<LinkScreen />);
    await submitForm();

    expect(await screen.findByTestId('error-hint')).toHaveTextContent('boom');
  });

  it('shows Unknown error for a failure without a message', async () => {
    mockSetContactData.mockRejectedValue({ statusCode: 500 });

    render(<LinkScreen />);
    await submitForm();

    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Unknown error');
  });

  it('ignores a continueKyc result that arrives after unmount', async () => {
    let resolveContinue: (session: unknown) => void = () => undefined;
    mockContinueKyc.mockReturnValue(new Promise((resolve) => (resolveContinue = resolve)));

    const { unmount } = render(<LinkScreen />);
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalled());
    unmount();

    await act(async () => {
      resolveContinue({ kycLevel: 20 });
      await Promise.resolve();
    });

    expect(mockNavigateBack).not.toHaveBeenCalled();
  });

  it('ignores a continueKyc failure that arrives after unmount', async () => {
    let rejectContinue: (e: unknown) => void = () => undefined;
    mockContinueKyc.mockReturnValue(new Promise((_, reject) => (rejectContinue = reject)));

    const { unmount } = render(<LinkScreen />);
    await waitFor(() => expect(mockContinueKyc).toHaveBeenCalled());
    unmount();

    await act(async () => {
      rejectContinue(mergeError);
      await Promise.resolve();
    });

    expect(mockHandleMergedError).not.toHaveBeenCalled();
  });
});
