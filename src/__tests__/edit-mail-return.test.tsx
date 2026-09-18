// Component-level: EditMailScreen captures redirectPath into session store, consumes it on
// capture, and abandons it on Cancel / Merge-OK so a remount cannot rehydrate a stale origin.

const mockUpdateMail = jest.fn();
const mockVerifyMail = jest.fn();
const mockRedirectPath = jest.fn();
const mockSetRedirectPath = jest.fn();
const mockNavigate = jest.fn();
const mockHandleMergedError = jest.fn(() => false);
const mockCheck2fa = jest.fn(() => Promise.resolve());

let mockIsUserLoading = false;
let mockUser: { mail?: string } | undefined = { mail: 'old@example.com' };

jest.mock('@dfx.swiss/react', () => ({
  Utils: { createRules: () => ({}) },
  Validations: { Required: undefined, Mail: undefined },
  TfaLevel: { BASIC: 'Basic' },
  useUserContext: () => ({
    user: mockUser,
    isUserLoading: mockIsUserLoading,
    updateMail: mockUpdateMail,
    verifyMail: mockVerifyMail,
  }),
  useKyc: () => ({ check2fa: mockCheck2fa }),
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
  StyledLoadingSpinner: () => <div data-testid="loading-spinner" />,
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
  EditOverlay: ({ onCancel, onEdit, prefill }: any) => (
    <div>
      <span data-testid="mail-prefill">{prefill}</span>
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

async function clickSave() {
  const save = await screen.findByRole('button', { name: 'Save' });
  await act(async () => {
    save.click();
  });
}

async function clickNext() {
  const next = await screen.findByRole('button', { name: 'Next' });
  await act(async () => {
    next.click();
  });
}

describe('EditMailScreen return path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    mockRedirectPath.mockReturnValue(undefined);
    mockUpdateMail.mockResolvedValue(undefined);
    mockVerifyMail.mockResolvedValue(undefined);
    mockHandleMergedError.mockReturnValue(false);
    mockCheck2fa.mockReset();
    mockCheck2fa.mockResolvedValue(undefined);
    mockIsUserLoading = false;
    mockUser = { mail: 'old@example.com' };
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

  it('clears store and redirectPath when updateMail is a handled merge-401', async () => {
    sessionStorage.setItem(STORE_KEY, '/support/issue');
    mockHandleMergedError.mockReturnValue(true);
    mockUpdateMail.mockRejectedValue({ statusCode: 401, message: 'unauthorized' });

    render(<EditMailScreen />);
    const save = await screen.findByRole('button', { name: 'Save' });

    await act(async () => {
      save.click();
    });

    await waitFor(() => {
      expect(sessionStorage.getItem(STORE_KEY)).toBeNull();
    });
    expect(mockSetRedirectPath).toHaveBeenCalledWith(undefined);
    expect(mockNavigate).not.toHaveBeenCalledWith('/account');
  });

  it('clears store and redirectPath when verifyMail is a handled merge-401', async () => {
    sessionStorage.setItem(STORE_KEY, '/support/issue');
    mockVerifyMail.mockRejectedValue({ statusCode: 401, message: 'unauthorized' });

    render(<EditMailScreen />);
    const save = await screen.findByRole('button', { name: 'Save' });

    await act(async () => {
      save.click();
    });

    mockHandleMergedError.mockReturnValue(true);

    await act(async () => {
      (await screen.findByRole('button', { name: 'Next' })).click();
    });

    await waitFor(() => {
      expect(sessionStorage.getItem(STORE_KEY)).toBeNull();
    });
    expect(mockSetRedirectPath).toHaveBeenCalledWith(undefined);
  });

  it('navigates to /account after verify when no return path is stored', async () => {
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
      expect(mockNavigate).toHaveBeenCalledWith('/account');
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

  it('does not mount EditOverlay while isUserLoading after check2fa resolves', async () => {
    mockIsUserLoading = true;

    render(<EditMailScreen />);

    await waitFor(() => {
      expect(mockCheck2fa).toHaveBeenCalledWith('Basic');
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId('loading-spinner')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('mounts EditOverlay with the current mail once isUserLoading is false', async () => {
    mockIsUserLoading = true;
    const { rerender } = render(<EditMailScreen />);

    await waitFor(() => {
      expect(mockCheck2fa).toHaveBeenCalledWith('Basic');
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();

    mockIsUserLoading = false;
    rerender(<EditMailScreen />);

    await screen.findByRole('button', { name: 'Cancel' });
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(screen.getByTestId('mail-prefill').textContent).toBe('old@example.com');
  });

  it('mounts EditOverlay with empty prefill when the loaded user has no mail', async () => {
    mockUser = {};

    render(<EditMailScreen />);

    await screen.findByRole('button', { name: 'Save' });
    expect(screen.getByTestId('mail-prefill').textContent).toBe('');
  });

  it('navigates to /2fa when check2fa rejects', async () => {
    mockCheck2fa.mockRejectedValue({ message: '2fa required' });

    render(<EditMailScreen />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/2fa', { state: { level: 'Basic' }, setRedirect: true });
    });
  });

  it('shows ErrorHint when updateMail returns 409 exists without merge', async () => {
    mockUpdateMail.mockRejectedValue({ statusCode: 409, message: 'already exists' });

    render(<EditMailScreen />);
    await clickSave();

    await waitFor(() => {
      expect(screen.getByTestId('error-hint').textContent).toBe('already exists');
    });
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'OK' })).toBeNull();
  });

  it('shows ErrorHint when updateMail returns 409 without exists', async () => {
    mockUpdateMail.mockRejectedValue({ statusCode: 409, message: 'conflict' });

    render(<EditMailScreen />);
    await clickSave();

    await waitFor(() => {
      expect(screen.getByTestId('error-hint').textContent).toBe('conflict');
    });
  });

  it('does not show ErrorHint when updateMail returns 409 without a message', async () => {
    mockUpdateMail.mockRejectedValue({ statusCode: 409 });

    render(<EditMailScreen />);
    await clickSave();

    await waitFor(() => {
      expect(mockUpdateMail).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('error-hint')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });

  it('shows ErrorHint when updateMail fails with a generic error', async () => {
    mockUpdateMail.mockRejectedValue({ statusCode: 500, message: 'server error' });

    render(<EditMailScreen />);
    await clickSave();

    await waitFor(() => {
      expect(screen.getByTestId('error-hint').textContent).toBe('server error');
    });
  });

  it('keeps the Next button when verifyMail returns 403', async () => {
    mockVerifyMail.mockRejectedValue({ statusCode: 403, message: 'forbidden' });

    render(<EditMailScreen />);
    await clickSave();
    await clickNext();

    await waitFor(() => {
      expect(mockVerifyMail).toHaveBeenCalled();
    });
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'OK' })).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows the OK button when verifyMail returns 409 exists with merge', async () => {
    mockVerifyMail.mockRejectedValue({ statusCode: 409, message: 'exists merge' });

    render(<EditMailScreen />);
    await clickSave();
    await clickNext();

    await screen.findByRole('button', { name: 'OK' });
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  });

  it('shows ErrorHint when verifyMail returns 409 exists without merge', async () => {
    mockVerifyMail.mockRejectedValue({ statusCode: 409, message: 'already exists' });

    render(<EditMailScreen />);
    await clickSave();
    await clickNext();

    await waitFor(() => {
      expect(screen.getByTestId('error-hint').textContent).toBe('already exists');
    });
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'OK' })).toBeNull();
  });

  it('shows ErrorHint when verifyMail returns 409 without exists', async () => {
    mockVerifyMail.mockRejectedValue({ statusCode: 409, message: 'conflict' });

    render(<EditMailScreen />);
    await clickSave();
    await clickNext();

    await waitFor(() => {
      expect(screen.getByTestId('error-hint').textContent).toBe('conflict');
    });
  });

  it('shows ErrorHint when verifyMail fails with a generic error', async () => {
    mockVerifyMail.mockRejectedValue({ statusCode: 500, message: 'verify failed' });

    render(<EditMailScreen />);
    await clickSave();
    await clickNext();

    await waitFor(() => {
      expect(screen.getByTestId('error-hint').textContent).toBe('verify failed');
    });
  });

  it('shows Unknown error when verifyMail fails without a message', async () => {
    mockVerifyMail.mockRejectedValue({ statusCode: 500 });

    render(<EditMailScreen />);
    await clickSave();
    await clickNext();

    await waitFor(() => {
      expect(screen.getByTestId('error-hint').textContent).toBe('Unknown error');
    });
  });

  it('shows Unknown error when verifyMail returns 409 without a message', async () => {
    mockVerifyMail.mockRejectedValue({ statusCode: 409 });

    render(<EditMailScreen />);
    await clickSave();
    await clickNext();

    await waitFor(() => {
      expect(screen.getByTestId('error-hint').textContent).toBe('Unknown error');
    });
  });
});
