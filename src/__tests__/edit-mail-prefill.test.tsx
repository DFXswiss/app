// Loading/prefill while isUserLoading is covered by edit-mail-return.test.tsx.
// This file keeps the branches that file does not: ErrorHint when user is missing
// after load, and `e.message || 'Unknown error'` on an empty string.

const mockCheck2fa = jest.fn();
const mockUpdateMail = jest.fn();
const mockVerifyMail = jest.fn();
const mockNavigate = jest.fn();
const mockHandleMergedError = jest.fn();
const mockSetRedirectPath = jest.fn();
const mockEditMailReturn = {
  get: jest.fn(),
  set: jest.fn(),
  remove: jest.fn(),
};
const mockUserState: { user?: { mail?: string }; isUserLoading: boolean } = { isUserLoading: false };

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
    isUserLoading: mockUserState.isUserLoading,
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

jest.mock('src/components/overlay/edit-overlay', () => {
  const { useState } = jest.requireActual<typeof import('react')>('react');
  return {
    EditOverlay: ({
      prefill,
      onEdit,
      onCancel,
    }: {
      prefill?: string;
      onEdit: (value: string) => Promise<void> | void;
      onCancel: () => void;
    }) => {
      const [value, setValue] = useState(prefill ?? '');
      return (
        <div>
          <input
            aria-label="Email address"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <button type="button" onClick={() => onEdit('new@example.com')}>
            Save email
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      );
    },
  };
});

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

jest.mock('src/contexts/app-handling.context', () => ({
  useAppHandlingContext: () => ({
    redirectPath: undefined,
    setRedirectPath: mockSetRedirectPath,
  }),
}));

jest.mock('src/hooks/session-store.hook', () => ({
  useSessionStore: () => ({
    editMailReturn: mockEditMailReturn,
  }),
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import EditMailScreen from '../screens/edit-mail.screen';

describe('EditMailScreen waits for the user before prefilling', () => {
  beforeEach(() => {
    mockUserState.user = undefined;
    mockUserState.isUserLoading = false;
    mockCheck2fa.mockReset();
    mockCheck2fa.mockResolvedValue(undefined);
    mockUpdateMail.mockReset();
    mockVerifyMail.mockReset();
    mockNavigate.mockReset();
    mockHandleMergedError.mockReset();
    mockHandleMergedError.mockReturnValue(false);
    mockSetRedirectPath.mockReset();
    mockEditMailReturn.get.mockReset();
    mockEditMailReturn.set.mockReset();
    mockEditMailReturn.remove.mockReset();
    mockEditMailReturn.get.mockReturnValue(undefined);
  });

  it('shows an error instead of a spinner when the user failed to load', async () => {
    render(<EditMailScreen />);
    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() => expect(mockCheck2fa).toHaveBeenCalled());
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load user');
    expect(screen.queryByRole('textbox', { name: 'Email address' })).not.toBeInTheDocument();
  });

  it('falls back to Unknown error when an update failure has an empty message', async () => {
    mockUserState.user = { mail: 'old@example.com' };
    mockUpdateMail.mockRejectedValue(new MockApiError(500, ''));
    render(<EditMailScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save email' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unknown error');
  });

  it('falls back to Unknown error when a verification failure has an empty message', async () => {
    mockUserState.user = { mail: 'old@example.com' };
    mockUpdateMail.mockResolvedValue(undefined);
    mockVerifyMail.mockRejectedValue(new MockApiError(500, ''));
    render(<EditMailScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save email' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unknown error');
  });
});
