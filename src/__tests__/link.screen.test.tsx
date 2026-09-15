// Component-level: LinkScreen tries handleMergedError first in every catch, and keeps existing
// error handling when it returns false.

const mockGetKycInfo = jest.fn();
const mockContinueKyc = jest.fn();
const mockSetContactData = jest.fn();
const mockReloadUser = jest.fn();
const mockNavigate = jest.fn();
const mockNavigateBack = jest.fn();
const mockHandleMergedError = jest.fn(() => false);

let mockFormData: { mail: string } = { mail: 'test@example.com' };
let mockKycHash = 'SLAVE_CODE';

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
  isStepDone: () => false,
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

describe('LinkScreen handleMergedError', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHandleMergedError.mockReturnValue(false);
    mockFormData = { mail: 'test@example.com' };
    mockKycHash = 'SLAVE_CODE';
    mockGetKycInfo.mockResolvedValue({ kycLevel: 0 });
    mockContinueKyc.mockResolvedValue({
      kycLevel: 5,
      currentStep: { status: 'InProgress', session: { url: 'https://example.com/step' } },
    });
    mockSetContactData.mockResolvedValue({});
  });

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
