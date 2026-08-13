// /account/mail must not mount EditOverlay until the user context has loaded.
// check2fa can finish first; prefilling from user?.mail on that first paint
// leaves the field empty forever (defaultValues are mount-only).

const mockCheck2fa = jest.fn();
const mockUserState: { user?: { mail?: string } } = {};

jest.mock('@dfx.swiss/react', () => ({
  ApiError: class ApiError extends Error {
    statusCode?: number;
  },
  TfaLevel: { BASIC: 'Basic' },
  Utils: { createRules: () => ({}) },
  Validations: { Mail: undefined, Required: undefined },
  useKyc: () => ({ check2fa: mockCheck2fa }),
  useUserContext: () => ({
    user: mockUserState.user,
    updateMail: jest.fn(),
    verifyMail: jest.fn(),
  }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  Form: ({ children }: { children: any }) => <div>{children}</div>,
  SpinnerSize: { LG: 'lg' },
  StyledButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
  StyledButtonWidth: { MIN: 'min' },
  StyledInput: () => null,
  StyledLoadingSpinner: () => <div data-testid="loading-spinner" />,
  StyledVerticalStack: ({ children }: { children: any }) => <div>{children}</div>,
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: () => null,
}));

jest.mock('src/components/overlay/edit-overlay', () => ({
  EditOverlay: ({ prefill }: { prefill?: string }) => (
    <input aria-label="Email address" readOnly value={prefill ?? ''} />
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
  useMergedAccount: () => ({ handleMergedError: () => false }),
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

import { act, render, screen, waitFor } from '@testing-library/react';
import EditMailScreen from '../screens/edit-mail.screen';

describe('EditMailScreen waits for the user before prefilling', () => {
  beforeEach(() => {
    mockUserState.user = undefined;
    mockCheck2fa.mockReset();
    mockCheck2fa.mockResolvedValue(undefined);
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
});
