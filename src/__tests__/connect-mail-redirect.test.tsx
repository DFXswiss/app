// Component-level: ConnectMail builds redirectUri via relativeUrl so magic-link return
// keeps personal-iban and other query params from redirectPath / current search.
// Also covers the house-brand wallet default when no `?wallet=` URL param is present.

const mockSignInWithMail = jest.fn();
const mockRedirectPath = jest.fn();
const mockNavigate = jest.fn();
const mockUseAppParams = jest.fn();
const mockOnCancel = jest.fn();
const mockLocationSearch = jest.fn(() => '?user=user@example.com');

jest.mock('@dfx.swiss/react', () => ({
  Utils: { createRules: () => ({}) },
  Validations: { Required: undefined, Mail: undefined },
  useAuth: () => ({ signInWithMail: mockSignInWithMail }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  Form: ({ children }: any) => <div>{children}</div>,
  // Ignore disabled so we can exercise handleSubmit without RHF touch/isValid gating.
  StyledButton: ({ label, onClick, type }: any) => (
    <button type={type || 'button'} onClick={onClick}>
      {label}
    </button>
  ),
  StyledButtonColor: { STURDY_WHITE: 'sturdy-white' },
  StyledButtonWidth: { MIN: 'min' },
  StyledInput: () => null,
  StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('react-router-dom', () => ({
  useLocation: () => ({ search: mockLocationSearch() }),
}));

jest.mock('../contexts/app-handling.context', () => ({
  useAppHandlingContext: () => ({
    redirectPath: mockRedirectPath(),
  }),
}));

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_ns: string, key: string) => key,
    translateError: (key: string) => key,
  }),
}));

jest.mock('../hooks/app-params.hook', () => ({
  useAppParams: () => mockUseAppParams(),
}));

jest.mock('../hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('../components/home/connect-shared', () => ({
  ConnectError: ({ error }: { error: string }) => <div data-testid="connect-error">{error}</div>,
}));

import { act, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import ConnectMail from '../components/home/wallet/connect-mail';
import type { WalletType } from '../contexts/wallet.context';

describe('ConnectMail login redirect', () => {
  let locationStub: { href: string; search: string; origin: string; pathname: string };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSignInWithMail.mockResolvedValue(undefined);
    mockUseAppParams.mockReturnValue({ wallet: undefined, recommendationCode: undefined });
    mockRedirectPath.mockReturnValue('/buy');
    mockLocationSearch.mockReturnValue('?user=user@example.com');

    locationStub = {
      href: 'http://localhost/login',
      search: '',
      origin: 'http://localhost',
      pathname: '/login',
    };

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: locationStub,
      writable: true,
    });
  });

  function renderConnectMail() {
    return render(
      <ConnectMail
        rootRef={createRef<HTMLDivElement>()}
        wallet={'Mail' as WalletType}
        blockchain={undefined}
        isConnect={false}
        onLogin={jest.fn()}
        onCancel={mockOnCancel}
        onSwitch={jest.fn()}
      />,
    );
  }

  it('includes personal-iban in redirectUri when redirectPath carries it', async () => {
    mockRedirectPath.mockReturnValue('/buy?personal-iban=frick');

    renderConnectMail();

    await act(async () => {
      screen.getByRole('button', { name: 'Next' }).click();
    });

    await waitFor(() => expect(mockSignInWithMail).toHaveBeenCalled());

    const redirectUri = mockSignInWithMail.mock.calls[0][1] as string;
    expect(redirectUri).toContain('personal-iban=frick');
    expect(redirectUri.startsWith('http://localhost/buy')).toBe(true);
  });

  it('copies personal-iban from the live search when present, but no other query keys (A4)', async () => {
    mockRedirectPath.mockReturnValue('/buy');
    locationStub.search = '?user=alice@example.com&personal-iban=frick&arbitrary=value';

    renderConnectMail();

    await act(async () => {
      screen.getByRole('button', { name: 'Next' }).click();
    });

    await waitFor(() => expect(mockSignInWithMail).toHaveBeenCalled());

    const redirectUri = mockSignInWithMail.mock.calls[0][1] as string;
    expect(redirectUri).toContain('personal-iban=frick');
    expect(redirectUri).not.toContain('user=');
    expect(redirectUri).not.toContain('arbitrary=');
  });

  it('does not append a query string when redirectPath has no extra params', async () => {
    mockRedirectPath.mockReturnValue('/buy');
    locationStub.search = '';

    renderConnectMail();

    await act(async () => {
      screen.getByRole('button', { name: 'Next' }).click();
    });

    await waitFor(() => expect(mockSignInWithMail).toHaveBeenCalled());

    const redirectUri = mockSignInWithMail.mock.calls[0][1] as string;
    expect(redirectUri).toBe('http://localhost/buy');
    expect(redirectUri).not.toContain('?');
  });

  it('sends wallet=DFX Wallet when no wallet URL param is present', async () => {
    mockUseAppParams.mockReturnValue({ wallet: undefined, recommendationCode: undefined });

    renderConnectMail();

    await act(async () => {
      screen.getByRole('button', { name: 'Next' }).click();
    });

    await waitFor(() => expect(mockSignInWithMail).toHaveBeenCalled());

    expect(mockSignInWithMail).toHaveBeenCalledWith(
      'user@example.com',
      'http://localhost/buy',
      undefined,
      'DFX Wallet',
    );
  });

  it('forwards an explicit wallet URL param unchanged', async () => {
    mockUseAppParams.mockReturnValue({ wallet: 'RealUnit', recommendationCode: 'ref-1' });

    renderConnectMail();

    await act(async () => {
      screen.getByRole('button', { name: 'Next' }).click();
    });

    await waitFor(() => expect(mockSignInWithMail).toHaveBeenCalled());

    expect(mockSignInWithMail).toHaveBeenCalledWith(
      'user@example.com',
      'http://localhost/buy',
      'ref-1',
      'RealUnit',
    );
  });

  it('shows the sent confirmation and Back returns to home', async () => {
    renderConnectMail();

    await act(async () => {
      screen.getByRole('button', { name: 'Next' }).click();
    });

    await waitFor(() =>
      expect(
        screen.getByText('We have sent an email with further instructions to the address provided.'),
      ).toBeInTheDocument(),
    );

    await act(async () => {
      screen.getByRole('button', { name: 'Back' }).click();
    });

    expect(mockOnCancel).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/' }, { clearParams: ['user'] });
  });

  it('surfaces the API error message when sign-in fails', async () => {
    mockSignInWithMail.mockRejectedValue({ message: 'Mail service down' });

    renderConnectMail();

    await act(async () => {
      screen.getByRole('button', { name: 'Next' }).click();
    });

    await waitFor(() => expect(screen.getByTestId('connect-error')).toHaveTextContent('Mail service down'));
  });

  it('falls back to Unknown error when the rejection has no message', async () => {
    mockSignInWithMail.mockRejectedValue({});

    renderConnectMail();

    await act(async () => {
      screen.getByRole('button', { name: 'Next' }).click();
    });

    await waitFor(() => expect(screen.getByTestId('connect-error')).toHaveTextContent('Unknown error'));
  });

  it('omits redirectUri when redirectPath is unset', async () => {
    mockRedirectPath.mockReturnValue(undefined);

    renderConnectMail();

    await act(async () => {
      screen.getByRole('button', { name: 'Next' }).click();
    });

    await waitFor(() => expect(mockSignInWithMail).toHaveBeenCalled());

    expect(mockSignInWithMail.mock.calls[0][1]).toBeFalsy();
  });

  it('submits without a prefilled mail when the user query param is absent', async () => {
    mockLocationSearch.mockReturnValue('');

    renderConnectMail();

    await act(async () => {
      screen.getByRole('button', { name: 'Next' }).click();
    });

    await waitFor(() => expect(mockSignInWithMail).toHaveBeenCalled());

    // No `user` query → RHF default is undefined; the form still submits under the test mock.
    expect(mockSignInWithMail.mock.calls[0][0]).toBeUndefined();
    expect(mockSignInWithMail.mock.calls[0][3]).toBe('DFX Wallet');
  });
});
