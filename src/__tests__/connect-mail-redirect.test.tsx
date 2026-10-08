// Component-level: ConnectMail builds redirectUri via relativeUrl so magic-link return
// keeps personal-iban and other query params from redirectPath / current search.

const mockSignInWithMail = jest.fn();
const mockRedirectPath = jest.fn();
const mockIsWidget = jest.fn();
const mockWidgetPersonalIban = jest.fn();
const mockNavigate = jest.fn();
const mockUseAppParams = jest.fn();
const mockUseLocation = jest.fn();

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
    redirectPath: mockRedirectPath(),
    isWidget: mockIsWidget(),
    widgetPersonalIban: mockWidgetPersonalIban(),
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

import { act, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import ConnectMail from '../components/home/wallet/connect-mail';
import type { WalletType } from '../contexts/wallet.context';

describe('ConnectMail login redirect', () => {
  const originalEnv = process.env.REACT_APP_PUBLIC_URL;
  const originalLocation = window.location;
  let locationStub: { href: string; search: string; origin: string; pathname: string };
  let onCancel: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.REACT_APP_PUBLIC_URL;
    mockSignInWithMail.mockResolvedValue(undefined);
    mockIsWidget.mockReturnValue(false);
    mockWidgetPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue({ wallet: undefined, recommendationCode: undefined });
    mockUseLocation.mockReturnValue({ search: '?user=user@example.com' });
    onCancel = jest.fn();

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

  afterAll(() => {
    if (originalEnv === undefined) {
      delete process.env.REACT_APP_PUBLIC_URL;
    } else {
      process.env.REACT_APP_PUBLIC_URL = originalEnv;
    }
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
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
        onCancel={onCancel}
        onSwitch={jest.fn()}
      />,
    );
  }

  async function submitNext() {
    await act(async () => {
      screen.getByRole('button', { name: 'Next' }).click();
    });
    await waitFor(() => expect(mockSignInWithMail).toHaveBeenCalled());
  }

  it('includes personal-iban in redirectUri when redirectPath carries it', async () => {
    mockRedirectPath.mockReturnValue('/buy?personal-iban=frick');

    renderConnectMail();
    await submitNext();

    const redirectUri = mockSignInWithMail.mock.calls[0][1] as string;
    expect(redirectUri).toContain('personal-iban=frick');
    expect(redirectUri.startsWith('http://localhost/buy')).toBe(true);
  });

  it('copies personal-iban from the live search when present, but no other query keys (A4)', async () => {
    mockRedirectPath.mockReturnValue('/buy');
    locationStub.search = '?user=alice@example.com&personal-iban=frick&arbitrary=value';

    renderConnectMail();
    await submitNext();

    const redirectUri = mockSignInWithMail.mock.calls[0][1] as string;
    expect(redirectUri).toContain('personal-iban=frick');
    expect(redirectUri).not.toContain('user=');
    expect(redirectUri).not.toContain('arbitrary=');
  });

  it('does not append a query string when redirectPath has no extra params', async () => {
    mockRedirectPath.mockReturnValue('/buy');
    locationStub.search = '';

    renderConnectMail();
    await submitNext();

    const redirectUri = mockSignInWithMail.mock.calls[0][1] as string;
    expect(redirectUri).toBe('http://localhost/buy');
    expect(redirectUri).not.toContain('?');
  });

  it('uses the app origin from the env when embedded on another site', async () => {
    process.env.REACT_APP_PUBLIC_URL = 'https://app.example.com';
    locationStub.origin = 'https://embedding.example.org';
    locationStub.search = '?foo=bar&personal-iban=yapeal';
    mockIsWidget.mockReturnValue(true);
    mockWidgetPersonalIban.mockReturnValue('frick');
    mockRedirectPath.mockReturnValue('/buy');

    renderConnectMail();
    await submitNext();

    expect(mockSignInWithMail.mock.calls[0][1]).toBe('https://app.example.com/buy?personal-iban=frick');
  });

  it('uses the app origin when embedded without a personal-iban attribute', async () => {
    process.env.REACT_APP_PUBLIC_URL = 'https://app.example.com';
    locationStub.origin = 'https://embedding.example.org';
    locationStub.search = '?foo=bar&personal-iban=yapeal';
    mockIsWidget.mockReturnValue(true);
    mockWidgetPersonalIban.mockReturnValue(undefined);
    mockRedirectPath.mockReturnValue('/buy');

    renderConnectMail();
    await submitNext();

    expect(mockSignInWithMail.mock.calls[0][1]).toBe('https://app.example.com/buy');
  });

  it('falls back to window.location.origin when the env var is unset', async () => {
    locationStub.origin = 'https://embedding.example.org';
    locationStub.search = '?foo=bar&personal-iban=frick';
    mockRedirectPath.mockReturnValue('/buy');

    renderConnectMail();
    await submitNext();

    expect(mockSignInWithMail.mock.calls[0][1]).toBe('https://embedding.example.org/buy?personal-iban=frick');
  });

  it('keeps the path and params after the origin identical with and without the env var', async () => {
    locationStub.origin = 'https://embedding.example.org';
    locationStub.search = '?foo=bar&personal-iban=frick';
    mockRedirectPath.mockReturnValue('/buy');

    const { unmount } = renderConnectMail();
    await submitNext();
    const withoutEnv = mockSignInWithMail.mock.calls[0][1] as string;

    unmount();
    jest.clearAllMocks();
    mockSignInWithMail.mockResolvedValue(undefined);
    process.env.REACT_APP_PUBLIC_URL = 'https://app.example.com';

    renderConnectMail();
    await submitNext();
    const withEnv = mockSignInWithMail.mock.calls[0][1] as string;

    expect(withoutEnv.slice('https://embedding.example.org'.length)).toBe(
      withEnv.slice('https://app.example.com'.length),
    );
  });

  it('passes undefined as redirectUri when redirectPath is undefined', async () => {
    mockRedirectPath.mockReturnValue(undefined);

    renderConnectMail();
    await submitNext();

    expect(mockSignInWithMail.mock.calls[0][1]).toBeUndefined();
  });

  it('passes recommendationCode and wallet from useAppParams as third/fourth arguments', async () => {
    mockRedirectPath.mockReturnValue('/buy');
    mockUseAppParams.mockReturnValue({ wallet: 'DFX', recommendationCode: 'REC1' });

    renderConnectMail();
    await submitNext();

    expect(mockSignInWithMail.mock.calls[0][2]).toBe('REC1');
    expect(mockSignInWithMail.mock.calls[0][3]).toBe('DFX');
  });

  it('shows the confirmation and Back navigates home clearing user', async () => {
    mockRedirectPath.mockReturnValue('/buy');

    renderConnectMail();
    await submitNext();

    await waitFor(() =>
      expect(
        screen.getByText('We have sent an email with further instructions to the address provided.'),
      ).toBeInTheDocument(),
    );

    screen.getByRole('button', { name: 'Back' }).click();
    expect(onCancel).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/' }, { clearParams: ['user'] });
  });

  it('shows the API error message when signInWithMail rejects with a message', async () => {
    mockRedirectPath.mockReturnValue('/buy');
    mockSignInWithMail.mockRejectedValue({ message: 'boom' });

    renderConnectMail();
    await act(async () => {
      screen.getByRole('button', { name: 'Next' }).click();
    });

    await waitFor(() => expect(screen.getByText('boom')).toBeInTheDocument());
    expect(screen.getByText('Connection failed!')).toBeInTheDocument();
  });

  it('shows Unknown error when signInWithMail rejects without a message', async () => {
    mockRedirectPath.mockReturnValue('/buy');
    mockSignInWithMail.mockRejectedValue({});

    renderConnectMail();
    await act(async () => {
      screen.getByRole('button', { name: 'Next' }).click();
    });

    await waitFor(() => expect(screen.getByText('Unknown error')).toBeInTheDocument());
  });

  it('treats a missing user query param as undefined mail default', async () => {
    mockUseLocation.mockReturnValue({ search: '' });
    mockRedirectPath.mockReturnValue('/buy');

    renderConnectMail();
    await submitNext();

    expect(mockSignInWithMail.mock.calls[0][0]).toBeUndefined();
  });
});
