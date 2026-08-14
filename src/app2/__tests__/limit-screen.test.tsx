// Limit screen: request form submits SupportIssue LimitRequest; registers mail first when missing.

const mockUpdateMail = jest.fn();
const mockCreateIssue = jest.fn();
const mockGetProfile = jest.fn();
const mockShowToast = jest.fn();
const mockSession = { isLoggedIn: true };
const mockUserState: {
  mail?: string;
  tradingLimit?: { limit: number; period: string };
  kyc?: { level: number };
} = {
  mail: 'user@example.com',
  tradingLimit: { limit: 100000, period: 'Month' },
  kyc: { level: 50 },
};

jest.mock('@dfx.swiss/react', () => ({
  ApiException: class ApiException extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  Blockchain: {
    BITCOIN: 'Bitcoin',
    ETHEREUM: 'Ethereum',
    SEPOLIA: 'Sepolia',
    BINANCE_SMART_CHAIN: 'BinanceSmartChain',
    OPTIMISM: 'Optimism',
    ARBITRUM: 'Arbitrum',
    POLYGON: 'Polygon',
    BASE: 'Base',
    GNOSIS: 'Gnosis',
    LIGHTNING: 'Lightning',
    SOLANA: 'Solana',
    MONERO: 'Monero',
    TRON: 'Tron',
    CARDANO: 'Cardano',
    INTERNET_COMPUTER: 'InternetComputer',
    CITREA: 'Citrea',
    CITREA_TESTNET: 'CitreaTestnet',
    FIRO: 'Firo',
    ZANO: 'Zano',
    SPARK: 'Spark',
    ARKADE: 'Arkade',
    LIQUID: 'Liquid',
    ARWEAVE: 'Arweave',
    RAILGUN: 'Railgun',
    DEFICHAIN: 'DeFiChain',
    HAQQ: 'Haqq',
  },
  FundOrigin: {
    SAVINGS: 'Savings',
    BUSINESS_PROFITS: 'BusinessProfits',
    STOCK_GAINS: 'StockGains',
    CRYPTO_GAINS: 'CryptoGains',
    INHERITANCE: 'Inheritance',
    OTHER: 'Other',
  },
  InvestmentDate: { NOW: 'Now', FUTURE: 'Future' },
  Limit: { K_500: 500000, M_1: 1000000, M_5: 5000000, M_10: 10000000, M_15: 15000000 },
  LimitPeriod: { DAY: 'Day', MONTH: 'Month', YEAR: 'Year' },
  SupportIssueReason: { OTHER: 'Other' },
  SupportIssueType: { LIMIT_REQUEST: 'LimitRequest' },
  useSupportChat: () => ({ createIssue: mockCreateIssue }),
  useUser: () => ({ getProfile: mockGetProfile }),
  useUserContext: () => ({
    user: mockUserState,
    updateMail: mockUpdateMail,
  }),
}));

jest.mock('../wallets/session', () => ({
  useWalletSession: () => mockSession,
}));

jest.mock('../components/ui', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiException } from '@dfx.swiss/react';
import { LanguageProvider } from '../i18n';
import LimitScreen from '../screens/limit';

function renderLimit() {
  return render(
    <LanguageProvider>
      <LimitScreen />
    </LanguageProvider>,
  );
}

describe('LimitScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession.isLoggedIn = true;
    mockUserState.mail = 'user@example.com';
    mockUserState.tradingLimit = { limit: 100000, period: 'Month' };
    mockUserState.kyc = { level: 50 };
    mockGetProfile.mockResolvedValue({ firstName: 'Ada', lastName: 'Lovelace' });
    mockCreateIssue.mockResolvedValue({ uid: 'LIM-1' });
    mockUpdateMail.mockResolvedValue(undefined);
  });

  it('submits a limit request with the chosen tier and fund origin', async () => {
    renderLimit();

    await waitFor(() => expect(mockGetProfile).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByDisplayValue('Ada Lovelace')).toBeInTheDocument());

    const send = screen.getByRole('button', { name: /Submit request/i });
    await act(async () => {
      fireEvent.click(send);
    });

    await waitFor(() => expect(mockCreateIssue).toHaveBeenCalledTimes(1));
    expect(mockCreateIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'LimitRequest',
        reason: 'Other',
        name: 'Ada Lovelace',
        limitRequest: expect.objectContaining({
          limit: 500000,
          investmentDate: 'Now',
          fundOrigin: 'Savings',
        }),
      }),
    );
    expect(mockUpdateMail).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalled();
  });

  it('does not submit when the name field is empty', async () => {
    mockGetProfile.mockResolvedValue(undefined);
    renderLimit();

    await waitFor(() => expect(mockGetProfile).toHaveBeenCalled());
    const send = screen.getByRole('button', { name: /Submit request/i });
    await act(async () => {
      fireEvent.click(send);
    });
    expect(mockCreateIssue).not.toHaveBeenCalled();
  });

  it('asks a logged-out visitor to connect', () => {
    mockSession.isLoggedIn = false;
    renderLimit();
    expect(screen.getByRole('heading')).toBeInTheDocument();
  });

  it('warns when KYC is below the sell level and accepts form changes', async () => {
    mockUserState.kyc = { level: 10 };
    mockUserState.tradingLimit = { limit: 1000, period: 'Day' };
    renderLimit();
    expect(await screen.findByText(/verify your identity|verifizieren \(kyc\)|verificare la tua|vérifier ton identité/i)).toBeInTheDocument();
    fireEvent.change(document.getElementById('lmLimit') as HTMLSelectElement, { target: { value: '1000000' } });
    fireEvent.change(document.getElementById('lmWhen') as HTMLSelectElement, { target: { value: 'Future' } });
    fireEvent.change(document.getElementById('lmOrigin') as HTMLSelectElement, { target: { value: 'Inheritance' } });
    fireEvent.change(document.getElementById('lmText') as HTMLTextAreaElement, { target: { value: 'family' } });
    fireEvent.click(screen.getByRole('button', { name: /submit request|anfrage senden|invia richiesta|envoyer/i }));
    await waitFor(() =>
      expect(mockCreateIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          limitRequest: expect.objectContaining({
            limit: 1000000,
            investmentDate: 'Future',
            fundOrigin: 'Inheritance',
            fundOriginText: 'family',
          }),
        }),
      ),
    );
  });

  it('registers a missing email and maps 409 plus a generic mail error', async () => {
    mockUserState.mail = undefined;
    const view = renderLimit();
    await waitFor(() => expect(screen.getByDisplayValue('Ada Lovelace')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /submit request|anfrage senden|invia richiesta|envoyer/i }));
    expect(await screen.findByText(/add an email|gib eine e-mail|aggiungi un'email|ajoute un e-mail/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('you@email.com'), { target: { value: 'new@example.com' } });
    mockUpdateMail.mockRejectedValueOnce(new ApiException(409, 'taken'));
    fireEvent.click(screen.getByRole('button', { name: /submit request|anfrage senden|invia richiesta|envoyer/i }));
    expect(await screen.findByText(/already|bereits|già|déjà|taken|verwendet/i)).toBeInTheDocument();
    view.unmount();

    mockUpdateMail.mockRejectedValueOnce(new Error('down'));
    const again = renderLimit();
    await waitFor(() => expect(screen.getByDisplayValue('Ada Lovelace')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('you@email.com'), { target: { value: 'new@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /submit request|anfrage senden|invia richiesta|envoyer/i }));
    expect(await screen.findByText(/could not send the code|code konnte nicht|impossibile inviare|impossible d'envoyer/i)).toBeInTheDocument();
    again.unmount();
  });

  it('surfaces a create-issue failure', async () => {
    mockCreateIssue.mockRejectedValueOnce(new Error('nope'));
    renderLimit();
    await waitFor(() => expect(screen.getByDisplayValue('Ada Lovelace')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /submit request|anfrage senden|invia richiesta|envoyer/i }));
    expect(await screen.findByText(/nope|something went wrong|schiefgelaufen/i)).toBeInTheDocument();
  });

  it('shows a dash when there is no trading limit and a year period', () => {
    mockUserState.tradingLimit = undefined;
    const none = renderLimit();
    expect(screen.getByText('—')).toBeInTheDocument();
    none.unmount();

    mockUserState.tradingLimit = { limit: 10, period: 'Year' };
    renderLimit();
    expect(screen.getByText('per year')).toBeInTheDocument();

    mockGetProfile.mockResolvedValueOnce({});
    mockUserState.tradingLimit = { limit: 10, period: 'Hour' };
    renderLimit();
    expect(screen.getByText('per month')).toBeInTheDocument();
  });

  it('swallows a profile error, keeps a typed name and skips a second submit', async () => {
    mockGetProfile.mockRejectedValueOnce(new Error('down'));
    const failed = renderLimit();
    await waitFor(() => expect(mockGetProfile).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText(/name|name|nome|nom/i), { target: { value: 'Typed' } });
    expect(screen.getByDisplayValue('Typed')).toBeInTheDocument();
    failed.unmount();

    let resolveProfile!: (value: { firstName: string }) => void;
    mockGetProfile.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveProfile = resolve;
      }),
    );
    const pending = renderLimit();
    fireEvent.change(screen.getByLabelText(/name|name|nome|nom/i), { target: { value: 'Keep' } });
    await act(async () => {
      resolveProfile({ firstName: 'Ada' });
    });
    expect(screen.getByDisplayValue('Keep')).toBeInTheDocument();
    pending.unmount();

    mockCreateIssue.mockImplementationOnce(
      () =>
        new Promise(() => {
          /* hang */
        }),
    );
    renderLimit();
    await waitFor(() => expect(screen.getByDisplayValue('Ada Lovelace')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /submit request|anfrage senden|invia richiesta|envoyer/i }));
    const submit = screen.getByRole('button', { name: /submit request|anfrage senden|invia richiesta|envoyer/i }) as HTMLButtonElement;
    submit.disabled = false;
    fireEvent.click(submit);
    await waitFor(() => expect(mockCreateIssue).toHaveBeenCalledTimes(1));
  });

  it('registers mail then creates, and accepts a create result without a uid', async () => {
    mockUserState.mail = undefined;
    mockCreateIssue.mockResolvedValueOnce({});
    renderLimit();
    await waitFor(() => expect(screen.getByDisplayValue('Ada Lovelace')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('you@email.com'), { target: { value: 'ok@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /submit request|anfrage senden|invia richiesta|envoyer/i }));
    await waitFor(() => expect(mockUpdateMail).toHaveBeenCalledWith('ok@example.com'));
    await waitFor(() => expect(mockCreateIssue).toHaveBeenCalled());
  });

  it('surfaces a non-Error create failure', async () => {
    mockCreateIssue.mockRejectedValueOnce('plain');
    renderLimit();
    await waitFor(() => expect(screen.getByDisplayValue('Ada Lovelace')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /submit request|anfrage senden|invia richiesta|envoyer/i }));
    expect(await screen.findByText(/something went wrong|schiefgelaufen|storto|produite/i)).toBeInTheDocument();
  });

  it('ignores a second submit while the first is in flight', async () => {
    let release: () => void = () => undefined;
    mockCreateIssue.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ uid: 'L-1' });
        }),
    );
    renderLimit();
    await waitFor(() => expect(screen.getByDisplayValue('Ada Lovelace')).toBeInTheDocument());
    const submit = screen.getByRole('button', { name: /submit request|anfrage senden|invia richiesta|envoyer/i }) as HTMLButtonElement;
    fireEvent.click(submit);
    await waitFor(() => expect(mockCreateIssue).toHaveBeenCalledTimes(1));
    submit.disabled = false;
    fireEvent.click(submit);
    expect(mockCreateIssue).toHaveBeenCalledTimes(1);
    release();
  });
});
