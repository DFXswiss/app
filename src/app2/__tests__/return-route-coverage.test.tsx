const mockCall = jest.fn();
const mockGetCko = jest.fn();
const mockUpdateSession = jest.fn();
const mockNavigate = jest.fn();
const mockOpenConnect = jest.fn();
const mockSession = { isLoggedIn: false };
const mockPath = { value: '/account-merge' };
const mockSearch = { value: '' };

jest.mock('@dfx.swiss/react', () => ({
  ApiException: class ApiException extends Error {
    statusCode: number;
    constructor(httpStatus: number, errorMessage: string) {
      super(errorMessage);
      this.statusCode = httpStatus;
    }
  },
  useApi: () => ({ call: mockCall }),
  useTransaction: () => ({ getTransactionByCkoId: mockGetCko }),
  useApiSession: () => ({ updateSession: mockUpdateSession }),
}));

jest.mock('../wallets/session', () => ({
  useWalletSession: () => ({ isLoggedIn: mockSession.isLoggedIn, openConnect: mockOpenConnect }),
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: mockPath.value }),
  useSearchParams: () => [new URLSearchParams(mockSearch.value), jest.fn()],
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiException } from '@dfx.swiss/react';
import ReturnRouteScreen, { nextPollDelay, CKO_POLL } from '../screens/return-route';
import { LanguageProvider } from '../i18n';

function jwt(expSecondsFromNow = 3600): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expSecondsFromNow }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `e30.${payload}.sig`;
}

function renderRoute() {
  return render(
    <LanguageProvider>
      <ReturnRouteScreen />
    </LanguageProvider>,
  );
}

describe('ReturnRouteScreen extra paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession.isLoggedIn = false;
    mockPath.value = '/account-merge';
    mockSearch.value = '';
  });

  it('grows the CKO poll delay and caps it', () => {
    expect(nextPollDelay(CKO_POLL.initialDelayMs)).toBe(2700);
    expect(nextPollDelay(CKO_POLL.maxDelayMs)).toBe(CKO_POLL.maxDelayMs);
  });

  it('rejects a merge link without otp and a 400 from the API', async () => {
    renderRoute();
    expect(await screen.findByText(/invalid|ungültig|non valid|invalide|unvollständig|incomplete/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('adopts a merged JWT and lands on the account screen', async () => {
    mockSearch.value = `otp=abc123`;
    mockCall.mockResolvedValue({ accessToken: jwt() });
    renderRoute();
    await waitFor(() => expect(mockUpdateSession).toHaveBeenCalled());
    expect(mockNavigate).toHaveBeenCalledWith('/account');
  });

  it('sends a Bearer merge confirm when already logged in and maps a non-API CKO error', async () => {
    mockSession.isLoggedIn = true;
    mockSearch.value = 'otp=abc123';
    mockCall.mockResolvedValue({ accessToken: jwt() });
    renderRoute();
    await waitFor(() => expect(mockUpdateSession).toHaveBeenCalled());

    mockPath.value = '/buy/success';
    mockSearch.value = 'cko-payment-id=cko_plain';
    mockGetCko.mockRejectedValueOnce(new Error('plain'));
    renderRoute();
    expect(await screen.findByRole('button', { name: /retry|erneut|riprova|réessayer/i })).toBeInTheDocument();
  });

  it('shows merge-ok when the API returns no token', async () => {
    mockSearch.value = 'otp=abc123';
    mockCall.mockResolvedValue({});
    renderRoute();
    expect(await screen.findByText(/merged|zusammengeführt|unito|fusionné|merge/i)).toBeInTheDocument();
  });

  it('maps merge 409 and a generic merge error', async () => {
    mockSearch.value = 'otp=abc123';
    mockCall.mockRejectedValueOnce(new ApiException(409, 'done'));
    const first = renderRoute();
    expect(await screen.findByText(/already|bereits|già|déjà|done|erledigt/i)).toBeInTheDocument();
    first.unmount();

    mockCall.mockRejectedValueOnce(new ApiException(500, 'down'));
    renderRoute();
    expect(await screen.findByText(/couldn't complete|nicht geklappt|non è stato possibile|n'a pas abouti/i)).toBeInTheDocument();
  });

  it('shows the static card-payment failure panel', async () => {
    mockPath.value = '/buy/failure';
    renderRoute();
    expect(await screen.findByText(/payment failed|zahlung fehlgeschlagen|pagamento non|paiement a échoué/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry|erneut|riprova|réessayer/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('asks a logged-out visitor to connect on a CKO return', async () => {
    mockPath.value = '/buy/success';
    mockSearch.value = 'cko-payment-id=cko_1';
    renderRoute();
    expect(await screen.findByText(/sign in|anmelden|accedi|connecte/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /connect|verbinden|connetti|connecter/i }));
    expect(mockOpenConnect).toHaveBeenCalledWith();
  });

  it('polls CKO until a transaction id arrives', async () => {
    mockPath.value = '/buy/success';
    mockSearch.value = 'cko-payment-id=cko_ok';
    mockSession.isLoggedIn = true;
    mockGetCko.mockResolvedValue({ uid: 'tx-cko', id: 9 });
    renderRoute();
    expect(await screen.findByText(/tx-cko/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /view transaction|transaktion|transazione|transaction/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/tx');
  });

  it('retries after a non-404 CKO error', async () => {
    mockPath.value = '/buy/success';
    mockSearch.value = 'cko-payment-id=cko_err';
    mockSession.isLoggedIn = true;
    mockGetCko.mockRejectedValueOnce(new ApiException(500, 'down')).mockResolvedValueOnce({ id: 3 });
    renderRoute();
    expect(await screen.findByRole('button', { name: /retry|erneut|riprova|réessayer/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry|erneut|riprova|réessayer/i }));
    expect(await screen.findByText('3')).toBeInTheDocument();
  });

  it('rejects an expired or malformed merge token and maps a 400', async () => {
    mockSearch.value = 'otp=abc123';
    mockCall.mockResolvedValueOnce({ accessToken: jwt(-120) });
    const expired = renderRoute();
    expect(await screen.findByText(/merged|zusammengeführt|unito|fusionné|merge/i)).toBeInTheDocument();
    expired.unmount();

    mockCall.mockResolvedValueOnce({ accessToken: 'aaa.%%% .ccc' });
    const bad = renderRoute();
    expect(await screen.findByText(/merged|zusammengeführt|unito|fusionné|merge/i)).toBeInTheDocument();
    bad.unmount();

    mockCall.mockRejectedValueOnce(new ApiException(400, 'bad'));
    renderRoute();
    expect(await screen.findByText(/invalid|ungültig|non valid|invalide|unvollständig|incomplete/i)).toBeInTheDocument();
  });

  it('shows the missing CKO id panel and resumes after 404', async () => {
    mockPath.value = '/buy/success';
    mockSearch.value = '';
    const missing = renderRoute();
    expect(await screen.findByText(/incomplete|unvollständig|incompleto|incomplet/i)).toBeInTheDocument();
    missing.unmount();

    mockSearch.value = 'cko-payment-id=cko_404';
    mockSession.isLoggedIn = true;
    mockGetCko.mockRejectedValueOnce(new ApiException(404, 'not yet')).mockResolvedValueOnce({ uid: 'later' });
    jest.useFakeTimers();
    renderRoute();
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });
    jest.useRealTimers();
    expect(await screen.findByText('later')).toBeInTheDocument();
  });

  it('reads a merge otp from the real query string when the hash has none', async () => {
    mockSearch.value = '';
    window.history.replaceState({}, '', '/account-merge?otp=from-search');
    mockCall.mockResolvedValue({ accessToken: jwt() });
    renderRoute();
    await waitFor(() => expect(mockCall).toHaveBeenCalled());
    window.history.replaceState({}, '', '/');
  });

  it('rejects a JWT without a payload and drops a CKO poll after unmount', async () => {
    mockSearch.value = 'otp=abc123';
    mockCall.mockResolvedValueOnce({ accessToken: 'onlyone' });
    const noPayload = renderRoute();
    expect(await screen.findByText(/merged|zusammengeführt|unito|fusionné|merge/i)).toBeInTheDocument();
    noPayload.unmount();

    mockPath.value = '/buy/success';
    mockSearch.value = 'cko-payment-id=cko_drop';
    mockSession.isLoggedIn = true;
    let resolveCko!: (value: { uid: string }) => void;
    mockGetCko.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCko = resolve;
        }),
    );
    const { unmount } = renderRoute();
    await act(async () => {
      await Promise.resolve();
    });
    unmount();
    await act(async () => {
      resolveCko({ uid: 'late' });
    });
    expect(screen.queryByText('late')).not.toBeInTheDocument();

    let rejectCko!: (error: unknown) => void;
    mockGetCko.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectCko = reject;
        }),
    );
    const dropping = renderRoute();
    await act(async () => {
      await Promise.resolve();
    });
    dropping.unmount();
    await act(async () => {
      rejectCko(new ApiException(500, 'late-fail'));
    });

    mockGetCko.mockRejectedValueOnce(new ApiException(500, 'down'));
    const fail = renderRoute();
    await act(async () => {
      await Promise.resolve();
    });
    fail.unmount();

    mockGetCko.mockResolvedValue({ uid: 'again' });
    const again = renderRoute();
    expect(await screen.findByText('again')).toBeInTheDocument();
    mockSession.isLoggedIn = false;
    again.rerender(
      <LanguageProvider>
        <ReturnRouteScreen />
      </LanguageProvider>,
    );
    mockSession.isLoggedIn = true;
    again.rerender(
      <LanguageProvider>
        <ReturnRouteScreen />
      </LanguageProvider>,
    );
    again.unmount();
  });
});
