import { TextEncoder } from 'util';

(global as { TextEncoder: typeof TextEncoder }).TextEncoder = TextEncoder;

const mockCall = jest.fn();
const mockGetPaymentLinks = jest.fn();
const mockGetPaymentRoutes = jest.fn();
const mockGetConfig = jest.fn();
const mockCreatePaymentLink = jest.fn();
const mockCreatePayment = jest.fn();
const mockUpdateLink = jest.fn();
const mockUpdateConfig = jest.fn();
const mockCreatePos = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  ApiException: class ApiException extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  Blockchain: { LIGHTNING: 'Lightning', BITCOIN: 'Bitcoin' },
  PaymentLinkStatus: { ACTIVE: 'Active', INACTIVE: 'Inactive' },
  useApi: () => ({ call: mockCall, defaultUrl: 'https://api.dfx.swiss/v1' }),
  usePaymentRoutes: () => ({
    getPaymentLinks: mockGetPaymentLinks,
    getPaymentRoutes: mockGetPaymentRoutes,
    getUserPaymentLinksConfig: mockGetConfig,
    createPaymentLink: mockCreatePaymentLink,
    createPaymentLinkPayment: mockCreatePayment,
    updatePaymentLink: mockUpdateLink,
    updateUserPaymentLinksConfig: mockUpdateConfig,
    createPosLink: mockCreatePos,
  }),
}));

const mockSessionBlockchains: { value: string[] | undefined } = { value: ['Lightning'] };

jest.mock('../wallets/session', () => ({
  useWalletSession: () => ({ blockchains: mockSessionBlockchains.value }),
}));

import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiException } from '@dfx.swiss/react';
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

describe('useOcp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSessionBlockchains.value = ['Lightning'];
    mockGetConfig.mockResolvedValue({ accessKey: 'k' });
    mockGetPaymentRoutes.mockResolvedValue({ sell: [], buy: [], swap: [] });
    mockGetPaymentLinks.mockResolvedValue([]);
    mockCall.mockResolvedValue([]);
    mockCreatePayment.mockResolvedValue({ lnurl: 'LNURL1DEMO' });
    mockCreatePos.mockResolvedValue({ url: 'https://app.dfx.swiss/pos/x' });
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } });
  });

  it('probes, loads, charges and copies in live mode', async () => {
    const { result } = renderHook(() => useOcp(), { wrapper });
    await act(async () => {
      await result.current.probe();
    });
    expect(result.current.active).toBe(true);

    mockGetConfig.mockRejectedValueOnce(new ApiException(403, 'no'));
    await act(async () => {
      await result.current.probe();
    });
    expect(result.current.active).toBe(false);

    mockGetConfig.mockRejectedValueOnce(new ApiException(500, 'down'));
    await act(async () => {
      await result.current.probe();
    });
    expect(result.current.probeError).toBe(true);

    await act(async () => {
      await result.current.loadRoutes();
      await result.current.loadLinks();
      await result.current.loadHistory();
    });
    expect(result.current.routes).toEqual({ sell: [], buy: [], swap: [] });
    expect(result.current.links).toEqual([]);

    mockCall.mockResolvedValueOnce([
      {
        payments: [{ id: 2, amount: 5, currency: 'CHF', status: 'Completed', date: '2026-01-01' }],
        totalCompletedAmount: 5,
      },
    ]);
    await act(async () => {
      await result.current.loadHistory();
    });
    expect(result.current.history?.total).toBe(5);

    await act(async () => {
      result.current.copy('abc');
    });
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('abc'));
  });

  it('runs demo builders and demo mutations', async () => {
    const { result } = renderHook(() => useOcp(), { wrapper });
    act(() => {
      result.current.enableDemo();
    });
    expect(result.current.demo).toBe(true);
    expect(result.current.active).toBe(true);

    await act(async () => {
      await result.current.probe();
      await result.current.loadRoutes();
      await result.current.loadLinks();
      await result.current.loadHistory();
      await result.current.createRoute({ iban: 'CH93 0076 2011 6238 5295 7' });
      await result.current.toggleRoute('sell', 201, false);
      await result.current.createLink(201);
      await result.current.toggleLink(301, false);
      await result.current.toggleLink(301, true);
      const inv = await result.current.createInvoice({ routeId: 201, amount: 10, currency: 'CHF', message: 'hi' });
      expect(inv.lnurl).toMatch(/^LNURL/i);
      const charged = await result.current.charge(1, 5);
      expect(charged.lnurl).toBeTruthy();
      await result.current.saveConfig({ displayQr: false } as never);
      expect(await result.current.createPosLink(1)).toBeUndefined();
    });

    await act(async () => {
      await result.current.probe();
      await result.current.loadRoutes();
      await result.current.loadLinks();
    });
    act(() => {
      result.current.disableDemo();
    });
    expect(result.current.demo).toBe(false);
  });

  it('creates live invoices, charges and polls', async () => {
    const { result } = renderHook(() => useOcp(), { wrapper });
    mockCall.mockResolvedValueOnce({ id: 'pay1' });
    await act(async () => {
      const inv = await result.current.createInvoice({ routeId: 1, amount: 3, currency: 'CHF', message: 'x' });
      expect(inv.lnurl).toMatch(/^LNURL/i);
    });

    mockCall.mockResolvedValueOnce({ payment: { status: 'Completed' } });
    await expect(result.current.pollPayment(1)).resolves.toBe('Completed');
    mockCall.mockRejectedValueOnce(new Error('down'));
    await expect(result.current.pollPayment(1)).resolves.toBeUndefined();

    mockGetPaymentRoutes.mockRejectedValueOnce(new Error('down'));
    await act(async () => {
      await result.current.loadRoutes();
    });
    expect(result.current.routesError).toBe(true);

    mockGetPaymentLinks.mockRejectedValueOnce(new Error('down'));
    await act(async () => {
      await result.current.loadLinks();
    });
    expect(result.current.links).toEqual([]);

    mockCall.mockRejectedValueOnce(new Error('down'));
    await act(async () => {
      await result.current.loadHistory();
    });
    expect(result.current.history).toEqual({ items: [], total: 0 });

    await act(async () => {
      await result.current.probe();
      await result.current.saveConfig({ displayQr: true } as never);
      await result.current.createRoute({ iban: 'CH93', currencyId: '1', blockchain: '' });
      await result.current.createRoute({ iban: 'CH93', blockchain: '' });
      await result.current.toggleRoute('sell', 1, false);
      await result.current.createLink(1);
      await result.current.toggleLink(1, true);
      await result.current.toggleLink(1, false);
      await result.current.saveConfig({ displayQr: true } as never);
      expect(await result.current.createPosLink(1)).toBe('https://app.dfx.swiss/pos/x');
    });

    Object.defineProperty(global, 'crypto', {
      configurable: true,
      value: { ...global.crypto, randomUUID: () => 'uuid-live' },
    });
    mockCreatePayment.mockResolvedValueOnce({ payment: { lnurl: 'LNURL1LIVE' } });
    await act(async () => {
      const charged = await result.current.charge(1, 4);
      expect(charged.lnurl).toBe('LNURL1LIVE');
    });

    mockCall.mockResolvedValueOnce({});
    await expect(
      result.current.createInvoice({ routeId: '1', amount: 1, currency: 'CHF', message: 'x' }),
    ).rejects.toBeTruthy();

    result.current.copy(undefined);
    Object.assign(navigator, { clipboard: undefined });
    result.current.copy('no-clip');
  });

  it('accepts only https DFX POS URLs and falls back when charge has no LNURL', async () => {
    const { result } = renderHook(() => useOcp(), { wrapper });
    mockCreatePos.mockResolvedValueOnce({ url: 'http://dfx.swiss/pos' });
    await expect(result.current.createPosLink(1)).resolves.toBeUndefined();
    mockCreatePos.mockResolvedValueOnce({ url: 'https://evil.example/pos' });
    await expect(result.current.createPosLink(1)).resolves.toBeUndefined();
    mockCreatePos.mockResolvedValueOnce({ url: 'not-a-url' });
    await expect(result.current.createPosLink(1)).resolves.toBeUndefined();
    mockCreatePos.mockResolvedValueOnce({ url: '' });
    await expect(result.current.createPosLink(1)).resolves.toBeUndefined();
    mockCreatePos.mockResolvedValueOnce({ url: 'https://dfx.swiss/pos/1' });
    await expect(result.current.createPosLink(1)).resolves.toBe('https://dfx.swiss/pos/1');

    mockCreatePayment.mockResolvedValueOnce({ payment: {} });
    await expect(result.current.charge(1, 2)).rejects.toBeTruthy();
  });

  it('builds a charge external id without randomUUID and copies with a failing clipboard', async () => {
    const { result } = renderHook(() => useOcp(), { wrapper });
    const originalCrypto = global.crypto;
    Object.defineProperty(global, 'crypto', { configurable: true, value: {} });
    mockCreatePayment.mockResolvedValueOnce({ payment: { lnurl: 'LNURL1FALLBACK' } });
    await act(async () => {
      const charged = await result.current.charge(1, 3);
      expect(charged.lnurl).toBe('LNURL1FALLBACK');
    });
    Object.defineProperty(global, 'crypto', { configurable: true, value: originalCrypto });

    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockRejectedValue(new Error('blocked')) } });
    await act(async () => {
      result.current.copy('abc');
    });
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('abc'));
  });

  it('normalizes odd history and route payloads', async () => {
    const { result } = renderHook(() => useOcp(), { wrapper });
    mockGetPaymentRoutes.mockResolvedValueOnce(null);
    await act(async () => {
      await result.current.loadRoutes();
    });
    expect(result.current.routes).toEqual({ buy: [], sell: [], swap: [] });

    mockGetPaymentLinks.mockResolvedValueOnce({ id: 7 });
    await act(async () => {
      await result.current.loadLinks();
    });
    expect(result.current.links).toEqual([{ id: 7 }]);

    mockCall.mockResolvedValueOnce('nope');
    await act(async () => {
      await result.current.loadHistory();
    });
    expect(result.current.history).toEqual({ items: [], total: 0 });

    mockCall.mockResolvedValueOnce([
      { payments: undefined, totalCompletedAmount: undefined },
      {
        payments: [
          { id: 1, amount: 2, currency: 'CHF', status: 'Completed' },
          { id: 3, amount: 1, currency: 'CHF', status: 'Completed' },
        ],
        totalCompletedAmount: 0,
      },
    ]);
    await act(async () => {
      await result.current.loadHistory();
    });
    expect(result.current.history?.items[0]).toMatchObject({ id: 3, note: '', when: '' });
    expect(result.current.history?.items.map((item) => item.id)).toEqual([3, 1]);
  });

  it('treats a non-API probe failure as transient and works without a blockchain list', async () => {
    mockSessionBlockchains.value = undefined;
    mockGetConfig.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useOcp(), { wrapper });
    await act(async () => {
      await result.current.probe();
    });
    expect(result.current.probeError).toBe(true);
    expect(result.current.lightningReady).toBe(false);
  });

  it('reuses demo state on a second probe and saves config before the first load', async () => {
    const { result } = renderHook(() => useOcp(), { wrapper });
    act(() => {
      result.current.enableDemo();
    });
    await act(async () => {
      await result.current.saveConfig({ displayQr: true } as never);
      await result.current.probe();
      await result.current.probe();
      await result.current.loadRoutes();
      await result.current.loadRoutes();
      await result.current.loadLinks();
      await result.current.loadLinks();
      await result.current.toggleLink(999, true);
      await result.current.createRoute({ iban: 'CH93' });
      const charged = await result.current.charge(404, 1);
      expect(charged.lnurl).toMatch(/^LNURL/i);
    });
  });

  it('keeps live config unchanged when none is loaded', async () => {
    const { result } = renderHook(() => useOcp(), { wrapper });
    await act(async () => {
      await result.current.saveConfig({ displayQr: true } as never);
    });
    expect(result.current.config).toBeNull();
  });
});
