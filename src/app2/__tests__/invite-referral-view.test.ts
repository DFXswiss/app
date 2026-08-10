// AccountSheets' referral prop must reach InviteSheet as a usable
// summary (code/link/commission/userCount) — typed + commented, previously unwired.

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
  KycLevel: { Completed: 50 },
  PhoneCallTime: {},
  useApi: () => ({ call: jest.fn() }),
  useBankAccountContext: () => ({ bankAccounts: [], createAccount: jest.fn() }),
  useFiatContext: () => ({ currencies: [] }),
  useUserContext: () => ({ user: undefined, changeMail: jest.fn(), addBankAccount: jest.fn() }),
}));

jest.mock('../components/ui', () => ({
  Sheet: ({ children }: { children: unknown }) => children,
  SheetHeader: () => null,
  Spinner: () => null,
  useToast: () => ({ showToast: jest.fn() }),
}));

jest.mock('../components/LanguageSheet', () => ({
  LanguageSheet: () => null,
}));

jest.mock('../components/pickers/FiatPicker', () => ({
  FiatPicker: () => null,
}));

import { inviteReferralView } from '../components/AccountSheets';
import type { Referral } from '@dfx.swiss/react';

describe('inviteReferralView (referral prop wiring)', () => {
  it('builds the shareable summary from a referral with a code', () => {
    const referral = {
      code: 'AB-CDEF-GHIJ-KL',
      commission: 0.0025,
      volume: 1000,
      credit: 10,
      paidCredit: 5,
      userCount: 3,
      activeUserCount: 2,
    } as Referral;

    expect(inviteReferralView(referral)).toEqual({
      code: 'AB-CDEF-GHIJ-KL',
      link: 'https://app.dfx.swiss/login?code=AB-CDEF-GHIJ-KL',
      commission: 0.0025,
      userCount: 3,
    });
  });

  it('returns null when there is no code — InviteSheet shows no summary block', () => {
    expect(inviteReferralView(undefined)).toBeNull();
    expect(inviteReferralView(null)).toBeNull();
    expect(
      inviteReferralView({
        commission: 0.01,
        volume: 0,
        credit: 0,
        paidCredit: 0,
        userCount: 0,
        activeUserCount: 0,
      } as Referral),
    ).toBeNull();
  });

  it('URL-encodes the code in the share link', () => {
    const referral = {
      code: 'ab/cd',
      commission: 0,
      volume: 0,
      credit: 0,
      paidCredit: 0,
      userCount: 0,
      activeUserCount: 0,
    } as Referral;
    expect(inviteReferralView(referral)?.link).toBe('https://app.dfx.swiss/login?code=' + encodeURIComponent('ab/cd'));
  });
});
