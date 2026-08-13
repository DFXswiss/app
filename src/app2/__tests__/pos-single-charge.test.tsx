// A POS till must create at most one live payment per cashier action.
// Double Enter / click while the request is in flight, or again while the
// QR is waiting, must not post a second createPaymentLinkPayment.

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
import { ApiException } from '@dfx.swiss/react';
import { LanguageProvider } from '../i18n';
import PosView from '../screens/ocp/pos';
import type { OcpApi } from '../screens/ocp/useOcp';

function buildOcp(overrides: Partial<OcpApi> = {}): OcpApi {
  return {
    demo: false,
    enableDemo: jest.fn(),
    disableDemo: jest.fn(),
    active: true,
    config: null,
    routes: { buy: [], sell: [] } as OcpApi['routes'],
    routesError: false,
    links: [{ id: 1, label: 'EUR Till', status: 'Active', routeId: 10 }] as OcpApi['links'],
    history: null,
    probe: jest.fn(),
    loadRoutes: jest.fn(),
    loadLinks: jest.fn(),
    loadHistory: jest.fn(),
    lightningReady: true,
    sellRoutes: [{ id: 10, currency: { name: 'EUR' } }] as OcpApi['sellRoutes'],
    lnSellRoutes: [],
    createRoute: jest.fn(),
    toggleRoute: jest.fn(),
    createLink: jest.fn(),
    toggleLink: jest.fn(),
    createPosLink: jest.fn(),
    createInvoice: jest.fn(),
    charge: jest.fn().mockResolvedValue({ lnurl: 'LNURL1TESTCHARGE' }),
    pollPayment: jest.fn().mockResolvedValue('Pending'),
    saveConfig: jest.fn(),
    copy: jest.fn(),
    apiBaseUrl: 'https://api.example',
    ...overrides,
  };
}

function renderPos(ocp: OcpApi) {
  return render(createElement(LanguageProvider, null, createElement(PosView, { ocp, go: jest.fn() })));
}

function amountField() {
  return screen.getByPlaceholderText('0.00');
}

function chargeButton() {
  return screen.getByRole('button', { name: /charge|kassieren/i });
}

describe('POS charges exactly once until the payment is terminal', () => {
  it('ignores double Enter and click while the charge request is in flight', async () => {
    let resolveCharge!: (v: { lnurl: string }) => void;
    const chargePromise = new Promise<{ lnurl: string }>((resolve) => {
      resolveCharge = resolve;
    });
    const ocp = buildOcp({ charge: jest.fn(() => chargePromise) });
    const view = renderPos(ocp);

    fireEvent.change(amountField(), { target: { value: '12' } });
    fireEvent.keyDown(amountField(), { key: 'Enter' });
    fireEvent.keyDown(amountField(), { key: 'Enter' });
    fireEvent.click(chargeButton());

    await waitFor(() => expect(ocp.charge).toHaveBeenCalledTimes(1));
    expect(ocp.charge).toHaveBeenCalledWith('1', 12);

    await act(async () => {
      resolveCharge({ lnurl: 'LNURL1ONCE' });
    });
    await waitFor(() => {
      expect(document.querySelector('.qcap')?.textContent?.trim()).toBe('EUR 12');
    });
    expect(ocp.charge).toHaveBeenCalledTimes(1);

    view.unmount();
  });

  it('keeps the till locked while a live QR is waiting, so a second charge cannot start', async () => {
    const ocp = buildOcp();
    const view = renderPos(ocp);

    fireEvent.change(amountField(), { target: { value: '25' } });
    fireEvent.click(chargeButton());
    await waitFor(() => expect(ocp.charge).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(document.querySelector('.qcap')).toBeTruthy());

    expect(chargeButton()).toBeDisabled();
    fireEvent.keyDown(amountField(), { key: 'Enter' });
    fireEvent.click(chargeButton());
    expect(ocp.charge).toHaveBeenCalledTimes(1);

    view.unmount();
  });

  it('unlocks after a failed charge so retry can post exactly one new payment', async () => {
    const ocp = buildOcp({
      charge: jest
        .fn()
        .mockRejectedValueOnce(new ApiException(500, 'busy'))
        .mockResolvedValueOnce({ lnurl: 'LNURL1RETRY' }),
    });
    const view = renderPos(ocp);

    fireEvent.change(amountField(), { target: { value: '8' } });
    fireEvent.click(chargeButton());
    await waitFor(() => expect(ocp.charge).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(document.querySelector('.paybox-note')).toBeTruthy());

    expect(chargeButton()).not.toBeDisabled();
    fireEvent.click(chargeButton());
    await waitFor(() => expect(ocp.charge).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(document.querySelector('.qcap')?.textContent?.trim()).toBe('EUR 8');
    });
    expect(ocp.charge).toHaveBeenCalledTimes(2);

    view.unmount();
  });

  it('unlocks after a completed payment so the next amount can be charged', async () => {
    const ocp = buildOcp({
      pollPayment: jest.fn().mockResolvedValue('Completed'),
    });
    const view = renderPos(ocp);

    fireEvent.change(amountField(), { target: { value: '5' } });
    fireEvent.click(chargeButton());
    await waitFor(() => expect(ocp.charge).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/paid|bezahlt/i)).toBeTruthy());
    expect(chargeButton()).not.toBeDisabled();

    fireEvent.change(amountField(), { target: { value: '7' } });
    fireEvent.click(chargeButton());
    await waitFor(() => expect(ocp.charge).toHaveBeenCalledTimes(2));
    expect(ocp.charge).toHaveBeenNthCalledWith(2, '1', 7);

    view.unmount();
  });
});
