const mockLogout = jest.fn();
const mockNavigate = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  useSessionContext: () => ({ logout: mockLogout }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  StyledButton: ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
  StyledButtonColor: { STURDY_WHITE: 'sturdy-white' },
  StyledButtonWidth: { MIN: 'min' },
  StyledVerticalStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));

jest.mock('../hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('../components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

import { fireEvent, render, screen } from '@testing-library/react';
import { QuoteRequestError, SESSION_EXPIRED_ERROR } from '../components/quote-request-error';

describe('QuoteRequestError', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the error hint, extra actions and a retry for ordinary errors', () => {
    const onRetry = jest.fn();
    render(
      <QuoteRequestError message="boom" onRetry={onRetry}>
        <span>extra action</span>
      </QuoteRequestError>,
    );

    expect(screen.getByTestId('error-hint')).toHaveTextContent('boom');
    expect(screen.getByText('extra action')).toBeInTheDocument();
    expect(screen.queryByText('Login')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('asks the customer to sign in again for an expired session and keeps the redirect path', () => {
    const onRetry = jest.fn();
    render(
      <QuoteRequestError message={SESSION_EXPIRED_ERROR} onRetry={onRetry}>
        <span>extra action</span>
      </QuoteRequestError>,
    );

    expect(screen.getByText('Your login has expired. Please sign in again.')).toBeInTheDocument();
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(screen.queryByText('extra action')).not.toBeInTheDocument();
    expect(screen.queryByText('Retry')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Login'));
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/login', { setRedirect: true });
    expect(onRetry).not.toHaveBeenCalled();
  });
});
