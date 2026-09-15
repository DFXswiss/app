// Component-level: TfaScreen tries handleMergedError first in every catch, and keeps existing
// error handling when it returns false.

const mockKycSetup2fa = jest.fn();
const mockKycVerify2fa = jest.fn();
const mockAuthSetup2fa = jest.fn();
const mockAuthVerify2fa = jest.fn();
const mockGoBack = jest.fn();
const mockHandleMergedError = jest.fn(() => false);

let mockSearch = '?code=SLAVE_CODE';
let mockFormData: { token: string } = { token: '123456' };

jest.mock('@dfx.swiss/react', () => ({
  useKyc: () => ({ setup2fa: mockKycSetup2fa, verify2fa: mockKycVerify2fa }),
  useAuth: () => ({ setup2fa: mockAuthSetup2fa, verify2fa: mockAuthVerify2fa }),
  useUserContext: () => ({ user: undefined }),
  TfaLevel: { BASIC: 'Basic', STRICT: 'Strict' },
  TfaType: { APP: 'App', MAIL: 'Mail' },
  Utils: { createRules: () => ({}) },
  Validations: { Required: undefined, Custom: () => undefined },
}));

jest.mock('@dfx.swiss/react-components', () => ({
  CopyButton: () => null,
  Form: ({ children }: any) => <div>{children}</div>,
  SpinnerSize: { LG: 'lg' },
  StyledButton: ({ label, onClick, type, disabled }: any) => (
    <button type={type || 'button'} onClick={onClick} disabled={disabled}>
      {label}
    </button>
  ),
  StyledButtonWidth: { MIN: 'min', FULL: 'full' },
  StyledInput: () => null,
  StyledLoadingSpinner: () => <div role="progressbar" />,
  StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('react-router-dom', () => ({
  useLocation: () => ({ search: mockSearch, state: undefined }),
}));

jest.mock('react-qr-code', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('src/util/app-store-badges', () => ({
  BadgeType: { PLAY_STORE: 'play', APP_STORE: 'app' },
}));

jest.mock('src/components/app-store-badge', () => ({
  AppStoreBadge: () => null,
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

jest.mock('src/hooks/clipboard.hook', () => ({
  useClipboard: () => ({ copy: jest.fn() }),
}));

jest.mock('src/hooks/guard.hook', () => ({
  useUserGuard: jest.fn(),
}));

jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));

jest.mock('src/hooks/merged-account.hook', () => ({
  useMergedAccount: () => ({ handleMergedError: mockHandleMergedError }),
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
}));

jest.mock('react-hook-form', () => ({
  useForm: () => ({
    control: {},
    handleSubmit: (fn: any) => () => fn(mockFormData),
    formState: { isValid: true, errors: {} },
  }),
}));

import { act, render, screen, waitFor } from '@testing-library/react';
import TfaScreen from 'src/screens/tfa.screen';

describe('TfaScreen handleMergedError', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHandleMergedError.mockReturnValue(false);
    mockSearch = '?code=SLAVE_CODE';
    mockFormData = { token: '123456' };
    mockKycSetup2fa.mockResolvedValue({ type: 'Mail', secret: '', uri: '' });
    mockKycVerify2fa.mockResolvedValue(undefined);
    mockAuthSetup2fa.mockResolvedValue({ type: 'Mail', secret: '', uri: '' });
    mockAuthVerify2fa.mockResolvedValue(undefined);
  });

  it('setup2fa/load catch: handleMergedError true skips setError', async () => {
    const error = { statusCode: 401, switchToCode: 'MASTER', message: 'unauthorized' };
    mockKycSetup2fa.mockRejectedValue(error);
    mockHandleMergedError.mockReturnValue(true);

    render(<TfaScreen />);

    await waitFor(() => {
      expect(mockHandleMergedError).toHaveBeenCalledWith(error);
    });
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
  });

  it('setup2fa/load catch: handleMergedError false keeps setError', async () => {
    const error = { statusCode: 401, switchToCode: 'MASTER', message: 'unauthorized' };
    mockKycSetup2fa.mockRejectedValue(error);

    render(<TfaScreen />);

    expect(await screen.findByTestId('error-hint')).toBeInTheDocument();
    expect(screen.getByTestId('error-hint')).toHaveTextContent('unauthorized');
    expect(mockHandleMergedError).toHaveBeenCalledWith(error);
  });

  it('setup2fa/load catch: does not call handleMergedError for a response that arrives after unmount', async () => {
    const error = { statusCode: 401, switchToCode: 'MASTER', message: 'unauthorized' };
    let rejectSetup2fa: (e: unknown) => void = () => undefined;
    mockKycSetup2fa.mockReturnValue(
      new Promise((_, reject) => {
        rejectSetup2fa = reject;
      }),
    );

    const { unmount } = render(<TfaScreen />);
    unmount();

    await act(async () => {
      rejectSetup2fa(error);
      await Promise.resolve();
    });

    expect(mockHandleMergedError).not.toHaveBeenCalled();
  });

  it('verify2fa/onSubmit catch: handleMergedError true skips setError', async () => {
    mockKycSetup2fa.mockResolvedValue({ type: 'Mail', secret: '', uri: '' });
    const error = { statusCode: 401, switchToCode: 'MASTER', message: 'unauthorized' };
    mockKycVerify2fa.mockRejectedValue(error);
    mockHandleMergedError.mockReturnValue(true);
    mockFormData = { token: '123456' };

    render(<TfaScreen />);
    const next = await screen.findByRole('button', { name: 'Next' });

    await act(async () => {
      next.click();
    });

    await waitFor(() => {
      expect(mockHandleMergedError).toHaveBeenCalledWith(error);
    });
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(screen.queryByText('Invalid or expired code')).not.toBeInTheDocument();
  });

  it('verify2fa/onSubmit catch: handleMergedError false keeps setError for non-403', async () => {
    mockKycSetup2fa.mockResolvedValue({ type: 'Mail', secret: '', uri: '' });
    const error = { statusCode: 500, switchToCode: 'MASTER', message: 'unauthorized' };
    mockKycVerify2fa.mockRejectedValue(error);
    mockFormData = { token: '123456' };

    render(<TfaScreen />);
    const next = await screen.findByRole('button', { name: 'Next' });

    await act(async () => {
      next.click();
    });

    expect(await screen.findByTestId('error-hint')).toBeInTheDocument();
    expect(mockHandleMergedError).toHaveBeenCalledWith(error);
  });
});
