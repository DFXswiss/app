// Limit screen: request form submits SupportIssue LimitRequest; registers mail first when missing.

const mockUpdateMail = jest.fn();
const mockCreateIssue = jest.fn();
const mockGetProfile = jest.fn();
const mockShowToast = jest.fn();

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
    user: {
      mail: 'user@example.com',
      tradingLimit: { limit: 100000, period: 'Month' },
      kyc: { level: 50 },
    },
    updateMail: mockUpdateMail,
  }),
}));

jest.mock('../wallets/session', () => ({
  useWalletSession: () => ({ isLoggedIn: true }),
}));

jest.mock('../components/ui', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    mockGetProfile.mockResolvedValue({ firstName: 'Ada', lastName: 'Lovelace' });
    mockCreateIssue.mockResolvedValue({ uid: 'LIM-1' });
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
});
