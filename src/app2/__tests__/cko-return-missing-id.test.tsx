// /buy/success without a Checkout payment id must not claim the payment is
// confirmed. A whitespace-only id is the same as a missing one.

const mockGetTransactionByCkoId = jest.fn();
const mockOpenConnect = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  ApiException: class ApiException extends Error {
    statusCode: number;
    constructor(httpStatus: number, errorMessage: string) {
      super(errorMessage);
      this.statusCode = httpStatus;
    }
  },
  useApi: () => ({ call: jest.fn() }),
  useTransaction: () => ({ getTransactionByCkoId: mockGetTransactionByCkoId }),
  useApiSession: () => ({ updateSession: jest.fn() }),
}));

const mockSessionState = { isLoggedIn: true };

jest.mock('../wallets/session', () => ({
  useWalletSession: () => ({ isLoggedIn: mockSessionState.isLoggedIn, openConnect: mockOpenConnect }),
}));

const mockSearchState = { value: '' };

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
  useLocation: () => ({ pathname: '/buy/success' }),
  useSearchParams: () => [new URLSearchParams(mockSearchState.value), jest.fn()],
}));

import { fireEvent, render, screen } from '@testing-library/react';
import ReturnRouteScreen from '../screens/return-route';
import { LanguageProvider } from '../i18n';

describe('/buy/success without a Checkout id', () => {
  const originalSearch = window.location.search;

  beforeEach(() => {
    mockSearchState.value = '';
    mockSessionState.isLoggedIn = true;
    mockGetTransactionByCkoId.mockReset();
    mockOpenConnect.mockReset();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, search: '' },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, search: originalSearch },
    });
  });

  it('shows the incomplete-link warning and does not poll', () => {
    render(
      <LanguageProvider>
        <ReturnRouteScreen />
      </LanguageProvider>,
    );
    expect(screen.getByText(/confirmation link is incomplete|Bestätigungslink ist unvollständig/i)).toBeInTheDocument();
    expect(screen.queryByText(/Payment confirmed|Zahlung bestätigt/i)).not.toBeInTheDocument();
    expect(mockGetTransactionByCkoId).not.toHaveBeenCalled();
  });

  it('treats a whitespace-only cko-payment-id as missing', () => {
    mockSearchState.value = 'cko-payment-id=   ';
    render(
      <LanguageProvider>
        <ReturnRouteScreen />
      </LanguageProvider>,
    );
    expect(screen.getByText(/confirmation link is incomplete|Bestätigungslink ist unvollständig/i)).toBeInTheDocument();
    expect(mockGetTransactionByCkoId).not.toHaveBeenCalled();
  });
});

describe('/buy/success encodes the Checkout id before the SDK call', () => {
  const originalSearch = window.location.search;

  beforeEach(() => {
    mockSearchState.value = 'cko-payment-id=pay%2Fabc';
    mockSessionState.isLoggedIn = true;
    mockGetTransactionByCkoId.mockReset();
    mockGetTransactionByCkoId.mockResolvedValue(undefined);
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, search: '' },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, search: originalSearch },
    });
  });

  it('passes encodeURIComponent(ckoId) into getTransactionByCkoId', async () => {
    render(
      <LanguageProvider>
        <ReturnRouteScreen />
      </LanguageProvider>,
    );
    expect(mockGetTransactionByCkoId).toHaveBeenCalledWith(encodeURIComponent('pay/abc'));
    expect(mockGetTransactionByCkoId.mock.calls[0][0]).not.toBe('pay/abc');
  });
});

describe('/buy/success without a session', () => {
  beforeEach(() => {
    mockSearchState.value = 'cko-payment-id=pay_abc';
    mockSessionState.isLoggedIn = false;
    mockGetTransactionByCkoId.mockReset();
    mockOpenConnect.mockReset();
  });

  it('shows a connect action instead of auto-opening the sheet or claiming success', () => {
    render(
      <LanguageProvider>
        <ReturnRouteScreen />
      </LanguageProvider>,
    );
    expect(screen.getByText(/sign in to confirm|melde dich an/i)).toBeInTheDocument();
    expect(screen.queryByText(/Payment confirmed|Zahlung bestätigt/i)).not.toBeInTheDocument();
    expect(mockOpenConnect).not.toHaveBeenCalled();
    expect(mockGetTransactionByCkoId).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /connect wallet|wallet verbinden/i }));
    expect(mockOpenConnect).toHaveBeenCalledTimes(1);
    expect(mockOpenConnect).toHaveBeenCalledWith();
  });
});
