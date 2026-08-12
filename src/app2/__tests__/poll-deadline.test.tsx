// CKO return-route poll must hard-stop at the deadline and surface
// waitTimedOut. Constants alone are not enough — the deadline branch in
// scheduleNext has to run under fake timers.

const mockCall = jest.fn();
const mockOpenConnect = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  ApiException: class ApiException extends Error {
    statusCode: number;
    constructor(httpStatus: number, errorMessage: string) {
      super(errorMessage);
      this.statusCode = httpStatus;
    }
  },
  Blockchain: {
    BITCOIN: 'Bitcoin',
    ETHEREUM: 'Ethereum',
    SEPOLIA: 'Sepolia',
    BINANCE_SMART_CHAIN: 'BinanceSmartChain',
    ARBITRUM: 'Arbitrum',
    OPTIMISM: 'Optimism',
    POLYGON: 'Polygon',
    BASE: 'Base',
    GNOSIS: 'Gnosis',
    HAQQ: 'Haqq',
    SOLANA: 'Solana',
    MONERO: 'Monero',
    TRON: 'Tron',
    CARDANO: 'Cardano',
    INTERNET_COMPUTER: 'InternetComputer',
    LIGHTNING: 'Lightning',
  },
  TransactionUrl: { single: 'transaction/single' },
  useApi: () => ({ call: mockCall }),
  useTransaction: () => ({ getTransactionByCkoId: mockCall }),
  useApiSession: () => ({ updateSession: jest.fn() }),
  useKyc: () => ({ continueKyc: jest.fn() }),
  useUserContext: () => ({ user: undefined }),
  useCountry: () => ({ getCountries: jest.fn() }),
  AccountType: { PERSONAL: 'Personal', BUSINESS: 'Business' },
  isStepDone: () => false,
  KycStepName: { IDENT: 'Ident' },
  KycStepStatus: {},
  LegalEntity: {},
  QuestionType: {},
  SignatoryPower: {},
  UrlType: { TOKEN: 'Token', BROWSER: 'Browser' },
}));

jest.mock('../wallets/session', () => ({
  useWalletSession: () => ({ isLoggedIn: true, openConnect: mockOpenConnect }),
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
  useLocation: () => ({ pathname: '/buy/success' }),
  useSearchParams: () => [new URLSearchParams('cko-payment-id=cko_test_1'), jest.fn()],
}));

jest.mock('@sumsub/websdk-react', () => () => null);

jest.mock('../components/ui', () => ({
  LoadingRow: () => null,
  useToast: () => ({ showToast: jest.fn() }),
}));

import { act, render, screen, waitFor } from '@testing-library/react';
import ReturnRouteScreen, { CKO_POLL, nextPollDelay } from '../screens/return-route';
import { IDENT_POLL, nextIdentPollDelay } from '../screens/kyc-steps';
import { LanguageProvider } from '../i18n';

describe('poll deadline + backoff (mirrors ocp/pos.tsx)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockCall.mockReset();
    mockOpenConnect.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('CKO_POLL matches pos.tsx: 5-min deadline, 2s start, 10s cap, 1.35 growth', () => {
    expect(CKO_POLL.deadlineMs).toBe(300_000);
    expect(CKO_POLL.initialDelayMs).toBe(2_000);
    expect(CKO_POLL.maxDelayMs).toBe(10_000);
    expect(CKO_POLL.growth).toBe(1.35);
  });

  it('IDENT_POLL matches the same pos.tsx schedule constants', () => {
    expect(IDENT_POLL.deadlineMs).toBe(CKO_POLL.deadlineMs);
    expect(IDENT_POLL.initialDelayMs).toBe(CKO_POLL.initialDelayMs);
    expect(IDENT_POLL.maxDelayMs).toBe(CKO_POLL.maxDelayMs);
    expect(IDENT_POLL.growth).toBe(CKO_POLL.growth);
  });

  it('nextPollDelay grows by 1.35 and caps at 10s', () => {
    expect(nextPollDelay(2_000)).toBe(Math.round(2_000 * 1.35)); // 2700
    expect(nextPollDelay(2_700)).toBe(Math.round(2_700 * 1.35)); // 3645
    expect(nextPollDelay(10_000)).toBe(10_000);
    expect(nextPollDelay(9_000)).toBe(10_000);
  });

  it('nextIdentPollDelay is the same growth function as nextPollDelay', () => {
    expect(nextIdentPollDelay(2_000)).toBe(nextPollDelay(2_000));
    expect(nextIdentPollDelay(5_000)).toBe(nextPollDelay(5_000));
    expect(nextIdentPollDelay(10_000)).toBe(10_000);
  });

  it('deadline branch surfaces waitTimedOut after 5 minutes of unresolved polls', async () => {
    // Every tick returns "no tx yet" so scheduleNext keeps re-arming until the deadline.
    mockCall.mockResolvedValue({});

    render(
      <LanguageProvider>
        <ReturnRouteScreen />
      </LanguageProvider>,
    );

    // Initial tick runs immediately (void tick()) — still waiting.
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockCall).toHaveBeenCalled();
    expect(screen.queryByText(/taking longer than expected|dauert länger als erwartet/i)).not.toBeInTheDocument();

    // Advance past the hard stop. Without the `if (Date.now() >= deadline)` branch
    // the panel would stay on the spinner forever and this assertion would fail.
    await act(async () => {
      jest.advanceTimersByTime(CKO_POLL.deadlineMs + CKO_POLL.maxDelayMs + 1_000);
      // Flush any pending microtasks from tick()/setPanel.
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText(/taking longer than expected|dauert länger als erwartet/i)).toBeInTheDocument();
    });
    // Retry is offered — not a silent hang.
    expect(screen.getByRole('button', { name: /retry|erneut/i })).toBeInTheDocument();
  });
});
