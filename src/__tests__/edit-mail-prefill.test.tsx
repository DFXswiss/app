// /account/mail must not mount EditOverlay until the user context has loaded.
// check2fa can finish first; prefilling from user?.mail on that first paint
// leaves the field empty forever (defaultValues are mount-only).

const mockCheck2fa = jest.fn();
const mockUpdateMail = jest.fn();
const mockVerifyMail = jest.fn();
const mockNavigate = jest.fn();
const mockHandleMergedError = jest.fn();
const mockUserState: { user?: { mail?: string } } = {};

class MockApiError extends Error {
  statusCode?: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

jest.mock('@dfx.swiss/react', () => ({
  ApiError: class ApiError extends Error {
    statusCode?: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  TfaLevel: { BASIC: 'Basic' },
  Utils: { createRules: () => ({}) },
  Validations: { Mail: undefined, Required: undefined },
  useKyc: () => ({ check2fa: mockCheck2fa }),
  useUserContext: () => ({
    user: mockUserState.user,
    updateMail: mockUpdateMail,
    verifyMail: mockVerifyMail,
  }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  Form: ({ children, onSubmit }: { children: React.ReactNode; onSubmit?: (event: React.FormEvent) => void }) => (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.(event);
      }}
    >
      {children}
    </form>
  ),
  SpinnerSize: { LG: 'lg' },
  StyledButton: ({ label, onClick, type }: { label: string; onClick?: () => void; type?: 'button' | 'submit' }) => (
    <button type={type ?? 'button'} onClick={onClick}>
      {label}
    </button>
  ),
  StyledButtonWidth: { MIN: 'min' },
  StyledInput: () => <input aria-label="Email code" />,
  StyledLoadingSpinner: () => <div data-testid="loading-spinner" />,
  StyledVerticalStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div role="alert">{message}</div>,
}));

jest.mock('src/components/overlay/edit-overlay', () => ({
  EditOverlay: ({
    prefill,
    onEdit,
    onCancel,
  }: {
    prefill?: string;
    onEdit: (value: string) => Promise<void> | void;
    onCancel: () => void;
  }) => (
    <div>
      <input aria-label="Email address" readOnly value={prefill ?? ''} />
      <button type="button" onClick={() => onEdit('new@example.com')}>
        Save email
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  ),
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
  useNavigation: () => ({ navigate: mockNavigate }),
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import EditMailScreen from '../screens/edit-mail.screen';

describe('EditMailScreen waits for the user before prefilling', () => {
  beforeEach(() => {
    mockUserState.user = undefined;
    mockCheck2fa.mockReset();
    mockCheck2fa.mockResolvedValue(undefined);
    mockUpdateMail.mockReset();
    mockVerifyMail.mockReset();
    mockNavigate.mockReset();
    mockHandleMergedError.mockReset();
    mockHandleMergedError.mockReturnValue(false);
  });

  it('keeps the spinner after 2FA until the user context arrives', async () => {
    render(<EditMailScreen />);
    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() => expect(mockCheck2fa).toHaveBeenCalled());
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Email address' })).not.toBeInTheDocument();
  });

  it('prefills the current mail once the user is loaded', async () => {
    mockUserState.user = { mail: 'e2e+acct-mail-chg@dfx.swiss' };
    render(<EditMailScreen />);
    const input = await screen.findByRole('textbox', { name: 'Email address' });
    expect((input as HTMLInputElement).value).toBe('e2e+acct-mail-chg@dfx.swiss');
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
  });

  it('does not mount an empty field when the user arrives after check2fa', async () => {
    const view = render(<EditMailScreen />);
    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() => expect(mockCheck2fa).toHaveBeenCalled());
    expect(screen.queryByRole('textbox', { name: 'Email address' })).not.toBeInTheDocument();

    mockUserState.user = { mail: 'e2e+acct-mail-chg@dfx.swiss' };
    view.rerender(<EditMailScreen />);

    const input = await screen.findByRole('textbox', { name: 'Email address' });
    expect((input as HTMLInputElement).value).toBe('e2e+acct-mail-chg@dfx.swiss');
  });

  it('sends a 2FA failure to the 2FA screen', async () => {
    mockCheck2fa.mockRejectedValueOnce(new Error('need 2fa'));
    render(<EditMailScreen />);
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/2fa', { state: { level: 'Basic' }, setRedirect: true }),
    );
  });

  it('moves to the verification step after a successful mail update', async () => {
    mockUserState.user = { mail: 'old@example.com' };
    mockUpdateMail.mockResolvedValue(undefined);
    render(<EditMailScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save email' }));
    expect(await screen.findByRole('textbox', { name: 'Email code' })).toBeInTheDocument();
  });

  it('shows the merge hint when the new mail already belongs to another account', async () => {
    mockUserState.user = { mail: 'old@example.com' };
    mockUpdateMail.mockRejectedValue(new MockApiError(409, 'mail exists please merge'));
    render(<EditMailScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save email' }));
    expect(await screen.findByText(/already have an account/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(mockNavigate).toHaveBeenCalledWith('/account');
  });

  it('surfaces a 409 that is not a merge as an error', async () => {
    mockUserState.user = { mail: 'old@example.com' };
    mockUpdateMail.mockRejectedValue(new MockApiError(409, 'mail exists'));
    render(<EditMailScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save email' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('mail exists');
  });

  it('surfaces any other update failure as an error', async () => {
    mockUserState.user = { mail: 'old@example.com' };
    mockUpdateMail.mockRejectedValue(new MockApiError(500, 'server down'));
    render(<EditMailScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save email' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('server down');
  });

  it('does not show an error when the merge handler consumes the update failure', async () => {
    mockUserState.user = { mail: 'old@example.com' };
    mockHandleMergedError.mockReturnValue(true);
    mockUpdateMail.mockRejectedValue(new MockApiError(409, 'mail exists please merge'));
    render(<EditMailScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save email' }));
    await waitFor(() => expect(mockHandleMergedError).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('navigates home after a successful verification', async () => {
    mockUserState.user = { mail: 'old@example.com' };
    mockUpdateMail.mockResolvedValue(undefined);
    mockVerifyMail.mockResolvedValue(undefined);
    render(<EditMailScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save email' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/account'));
  });

  it('marks an invalid verification code', async () => {
    mockUserState.user = { mail: 'old@example.com' };
    mockUpdateMail.mockResolvedValue(undefined);
    mockVerifyMail.mockRejectedValue(new MockApiError(403, 'bad'));
    render(<EditMailScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save email' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    await waitFor(() => expect(mockVerifyMail).toHaveBeenCalled());
  });

  it('shows the merge hint when verification reports an existing account', async () => {
    mockUserState.user = { mail: 'old@example.com' };
    mockUpdateMail.mockResolvedValue(undefined);
    mockVerifyMail.mockRejectedValue(new MockApiError(409, 'exists merge'));
    render(<EditMailScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save email' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    expect(await screen.findByText(/already have an account/i)).toBeInTheDocument();
  });

  it('surfaces a 409 verification error that is not a merge', async () => {
    mockUserState.user = { mail: 'old@example.com' };
    mockUpdateMail.mockResolvedValue(undefined);
    mockVerifyMail.mockRejectedValue(new MockApiError(409, 'exists'));
    render(<EditMailScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save email' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('exists');
  });

  it('surfaces any other verification failure', async () => {
    mockUserState.user = { mail: 'old@example.com' };
    mockUpdateMail.mockResolvedValue(undefined);
    mockVerifyMail.mockRejectedValue(new MockApiError(500, 'verify failed'));
    render(<EditMailScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save email' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('verify failed');
  });
});
