import { TextEncoder } from 'util';

(global as { TextEncoder: typeof TextEncoder }).TextEncoder = TextEncoder;

const mockApiSession: { account?: number | null } | null = null;
const mockWalletSession: { blockchains?: string[]; address?: string } = {};

jest.mock('@dfx.swiss/react', () => ({
  ApiException: class ApiException extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  Blockchain: { LIGHTNING: 'Lightning', BITCOIN: 'Bitcoin' },
  PaymentLinkPaymentStatus: { COMPLETED: 'Completed' },
  PaymentLinkStatus: { ACTIVE: 'Active', INACTIVE: 'Inactive' },
  useApi: () => ({ defaultUrl: 'https://api.dfx.swiss/v1' }),
  useApiSession: () => ({ session: mockApiSession }),
  usePaymentRoutes: () => ({
    getPaymentLinks: jest.fn(),
    getPaymentRoutes: jest.fn(),
    getUserPaymentLinksConfig: jest.fn(),
    createPaymentLink: jest.fn(),
    createPaymentLinkPayment: jest.fn(),
    updatePaymentLink: jest.fn(),
    updateUserPaymentLinksConfig: jest.fn(),
    createPosLink: jest.fn(),
    deletePaymentRoute: jest.fn(),
    getPaymentLinkHistory: jest.fn(),
    createPaymentLinkInvoice: jest.fn(),
    createSellPaymentRoute: jest.fn(),
    activatePaymentRoute: jest.fn(),
  }),
}));

jest.mock('../wallets/session', () => ({
  useWalletSession: () => mockWalletSession,
}));

import { renderHook } from '@testing-library/react';
import { LanguageProvider } from '../i18n';
import { ToastProvider } from '../components/ui';
import { useOcp } from '../screens/ocp/useOcp';

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <ToastProvider>{children}</ToastProvider>
    </LanguageProvider>
  );
}

describe('useOcp anonymous identity', () => {
  it('uses null sentinels when no API account or wallet identity is available', () => {
    const { result } = renderHook(() => useOcp(), { wrapper });

    expect(result.current.sessionIdentity).toBe('[null,null]');
    expect(result.current.sessionAddress).toBeUndefined();
  });
});
