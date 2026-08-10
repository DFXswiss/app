// Round-4 D2: OCP POS currency must come from the selected link's sell route
// (same source + fallback as invoice.tsx: route.currency?.name || 'CHF').
// Also freezes that currency on the open charge so a mid-charge select switch
// cannot rewrite the QR / paid caption (await-boundary state break).

jest.mock('@dfx.swiss/react', () => ({
  ApiException: class ApiException extends Error {
    statusCode: number;
    constructor(httpStatus: number, errorMessage: string) {
      super(errorMessage);
      this.statusCode = httpStatus;
    }
  },
  PaymentLinkStatus: { ACTIVE: 'Active', INACTIVE: 'Inactive' },
  PaymentLinkPaymentStatus: {
    PENDING: 'Pending',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
    EXPIRED: 'Expired',
  },
}));

jest.mock('react-qr-code', () => () => null);

import { createElement } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LanguageProvider } from '../i18n';
import PosView, { currencyForPosLink } from '../screens/ocp/pos';
import type { OcpApi } from '../screens/ocp/useOcp';

describe('currencyForPosLink (D2 POS currency from route)', () => {
  const sellRoutes = [
    { id: 10, currency: { name: 'EUR' } },
    { id: 20, currency: { name: 'USD' } },
    { id: 30, currency: null },
  ];

  it('reads the currency from the sell route matching the link routeId', () => {
    expect(currencyForPosLink({ routeId: 10 }, sellRoutes)).toBe('EUR');
    expect(currencyForPosLink({ routeId: '20' }, sellRoutes)).toBe('USD');
  });

  it("falls back to 'CHF' when the route has no currency name — same as invoice.tsx", () => {
    expect(currencyForPosLink({ routeId: 30 }, sellRoutes)).toBe('CHF');
    expect(currencyForPosLink({ routeId: 999 }, sellRoutes)).toBe('CHF');
    expect(currencyForPosLink(undefined, sellRoutes)).toBe('CHF');
    expect(currencyForPosLink(null, [])).toBe('CHF');
  });

  it('does not hardcode CHF when the matching route is EUR', () => {
    // Guards the three UI sites (label, QR caption, paid line) against regressing
    // to a literal 'CHF' by proving the resolver returns the route currency.
    const currency = currencyForPosLink({ routeId: 10 }, sellRoutes);
    expect(currency).not.toBe('CHF');
    expect(currency).toBe('EUR');
  });
});

describe('POS charge freezes currency at charge time', () => {
  function buildOcp(overrides: Partial<OcpApi> = {}): OcpApi {
    return {
      demo: true,
      enableDemo: jest.fn(),
      disableDemo: jest.fn(),
      active: true,
      config: null,
      routes: { buy: [], sell: [] } as OcpApi['routes'],
      routesError: false,
      links: [
        { id: 1, label: 'EUR Till', status: 'Active', routeId: 10 },
        { id: 2, label: 'USD Till', status: 'Active', routeId: 20 },
      ] as OcpApi['links'],
      history: null,
      probe: jest.fn(),
      loadRoutes: jest.fn(),
      loadLinks: jest.fn(),
      loadHistory: jest.fn(),
      lightningReady: true,
      sellRoutes: [
        { id: 10, currency: { name: 'EUR' } },
        { id: 20, currency: { name: 'USD' } },
      ] as OcpApi['sellRoutes'],
      lnSellRoutes: [],
      createRoute: jest.fn(),
      toggleRoute: jest.fn(),
      createLink: jest.fn(),
      toggleLink: jest.fn(),
      createPosLink: jest.fn(),
      createInvoice: jest.fn(),
      charge: jest.fn().mockResolvedValue({ lnurl: 'LNURL1TESTCHARGE' }),
      pollPayment: jest.fn(),
      saveConfig: jest.fn(),
      copy: jest.fn(),
      apiBaseUrl: 'https://api.example',
      ...overrides,
    };
  }

  function renderPos(ocp: OcpApi) {
    return render(createElement(LanguageProvider, null, createElement(PosView, { ocp, go: jest.fn() })));
  }

  it('keeps the charge QR currency when the cashier switches till after charging', async () => {
    // Charge under EUR, then pick the USD link: free label follows the select,
    // but the open QR caption must still read the frozen EUR.
    const ocp = buildOcp({ demo: false });
    const view = renderPos(ocp);

    // Default selection is the first active link (EUR Till / route 10 → EUR).
    expect(screen.getByText(/\(EUR\)/)).toBeInTheDocument();

    const amountInput = screen.getByPlaceholderText('0.00');
    fireEvent.change(amountInput, { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: /charge|kassieren/i }));

    await waitFor(() => {
      expect(ocp.charge).toHaveBeenCalledWith('1', 25);
    });
    await waitFor(() => {
      expect(document.querySelector('.qcap')?.textContent?.trim()).toBe('EUR 25');
    });

    // Switch the open till to the USD link while the charge is still showing.
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } });

    // Amount-field label tracks the new selection (free currency).
    expect(screen.getByText(/\(USD\)/)).toBeInTheDocument();
    // QR caption stays on the currency frozen at charge time.
    expect(document.querySelector('.qcap')?.textContent?.trim()).toBe('EUR 25');
    expect(document.querySelector('.qcap')?.textContent).not.toMatch(/USD/);

    view.unmount();
  });

  it('freezes currency before the charge await, not from the post-await select', async () => {
    // Plausible race: select flips while ocp.charge is in flight. Currency must
    // be captured before that await (same pattern as selectedId / amt).
    //
    // A same-closure read of `currency` after await would still be EUR (the
    // invoking render's binding). The property this pins is the *display*
    // snapshot: charge.currency on the QR, not the free render-scope currency.
    let resolveCharge!: (v: { lnurl: string }) => void;
    const chargePromise = new Promise<{ lnurl: string }>((resolve) => {
      resolveCharge = resolve;
    });
    const ocp = buildOcp({
      demo: false,
      charge: jest.fn(() => chargePromise),
      pollPayment: jest.fn().mockResolvedValue('Pending'),
    });
    const view = renderPos(ocp);

    const amountInput = screen.getByPlaceholderText('0.00');
    fireEvent.change(amountInput, { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /charge|kassieren/i }));

    await waitFor(() => expect(ocp.charge).toHaveBeenCalledWith('1', 10));

    // Mid-flight: cashier switches to USD till.
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } });
    expect(screen.getByText(/\(USD\)/)).toBeInTheDocument();

    await act(async () => {
      resolveCharge({ lnurl: 'LNURL1MIDFLIGHT' });
    });

    await waitFor(() => {
      expect(document.querySelector('.qcap')?.textContent?.trim()).toBe('EUR 10');
    });
    // Label may still show the new selection; charge display must not.
    expect(document.querySelector('.qcap')?.textContent).not.toMatch(/USD/);

    view.unmount();
  });
});
