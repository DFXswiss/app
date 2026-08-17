// Component-level: EditMailScreen captures redirectPath into session store, consumes it on
// capture, and abandons it on Cancel / Merge-OK so a remount cannot rehydrate a stale origin.

const mockUpdateMail = jest.fn();
const mockVerifyMail = jest.fn();
const mockRedirectPath = jest.fn();
const mockSetRedirectPath = jest.fn();
const mockNavigate = jest.fn();
const mockHandleMergedError = jest.fn(() => false);

jest.mock('@dfx.swiss/react', () => ({
  Utils: { createRules: () => ({}) },
  Validations: { Required: undefined, Mail: undefined },
  TfaLevel: { BASIC: 'Basic' },
  useUserContext: () => ({
    user: { mail: 'old@example.com' },
    updateMail: mockUpdateMail,
    verifyMail: mockVerifyMail,
  }),
  useKyc: () => ({ check2fa: () => Promise.resolve() }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  Form: ({ children }: any) => <div>{children}</div>,
  StyledButton: ({ label, onClick, type }: any) => (
    <button type={type || 'button'} onClick={onClick}>
      {label}
    </button>
  ),
  StyledButtonWidth: { MIN: 'min' },
  StyledInput: () => null,
  StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
  StyledLoadingSpinner: () => null,
  SpinnerSize: { LG: 'lg' },
}));

jest.mock('src/contexts/app-handling.context', () => ({
  useAppHandlingContext: () => ({
    redirectPath: mockRedirectPath(),
    setRedirectPath: mockSetRedirectPath,
  }),
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

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('src/hooks/merged-account.hook', () => ({
  useMergedAccount: () => ({ handleMergedError: mockHandleMergedError }),
}));

jest.mock('src/components/overlay/edit-overlay', () => ({
  EditOverlay: ({ onCancel, onEdit }: any) => (
    <div>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
      <button
        type="button"
        onClick={() => {
          void onEdit('new@example.com');
        }}
      >
        Save
      </button>
    </div>
  ),
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

import { act, render, screen, waitFor } from '@testing-library/react';
import EditMailScreen from 'src/screens/edit-mail.screen';

const STORE_KEY = 'dfx.editMailReturn';

describe('EditMailScreen return path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    mockRedirectPath.mockReturnValue(undefined);
    mockUpdateMail.mockResolvedValue(undefined);
    mockVerifyMail.mockResolvedValue(undefined);
    mockHandleMergedError.mockReturnValue(false);
  });

  it('writes a valid redirectPath into the session store and consumes it', async () => {
    mockRedirectPath.mockReturnValue('/support/issue');

    render(<EditMailScreen />);

    await waitFor(() => {
      expect(sessionStorage.getItem(STORE_KEY)).toBe('/support/issue');
    });
    expect(mockSetRedirectPath).toHaveBeenCalledWith(undefined);
  });

  it('does not write redirectPath when it is /account/mail', async () => {
    mockRedirectPath.mockReturnValue('/account/mail');

    render(<EditMailScreen />);

    await screen.findByRole('button', { name: 'Cancel' });
    expect(sessionStorage.getItem(STORE_KEY)).toBeNull();
    expect(mockSetRedirectPath).not.toHaveBeenCalled();
  });

  it('clears store and redirectPath on Cancel and navigates to /account', async () => {
    mockRedirectPath.mockReturnValue('/support/issue');

    render(<EditMailScreen />);

    await waitFor(() => {
      expect(sessionStorage.getItem(STORE_KEY)).toBe('/support/issue');
    });

    await act(async () => {
      (await screen.findByRole('button', { name: 'Cancel' })).click();
    });

    expect(sessionStorage.getItem(STORE_KEY)).toBeNull();
    expect(mockSetRedirectPath).toHaveBeenCalledWith(undefined);
    expect(mockNavigate).toHaveBeenCalledWith('/account');
  });

  it('navigates to the stored path after successful verify and clears the store', async () => {
    sessionStorage.setItem(STORE_KEY, '/support/issue');
    mockUpdateMail.mockResolvedValue(undefined);
    mockVerifyMail.mockResolvedValue(undefined);

    render(<EditMailScreen />);
    const save = await screen.findByRole('button', { name: 'Save' });

    await act(async () => {
      save.click();
    });

    await act(async () => {
      (await screen.findByRole('button', { name: 'Next' })).click();
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/support/issue');
    });
    expect(sessionStorage.getItem(STORE_KEY)).toBeNull();
  });

  it('clears store and redirectPath on Merge-OK and navigates to /account', async () => {
    sessionStorage.setItem(STORE_KEY, '/support/issue');
    mockUpdateMail.mockRejectedValue({ statusCode: 409, message: 'exists merge' });

    render(<EditMailScreen />);
    const save = await screen.findByRole('button', { name: 'Save' });

    await act(async () => {
      save.click();
    });

    await act(async () => {
      (await screen.findByRole('button', { name: 'OK' })).click();
    });

    expect(sessionStorage.getItem(STORE_KEY)).toBeNull();
    expect(mockSetRedirectPath).toHaveBeenCalledWith(undefined);
    expect(mockNavigate).toHaveBeenCalledWith('/account');
  });
});
