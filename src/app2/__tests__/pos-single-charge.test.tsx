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
import PosView, { currencyForPosLink } from '../screens/ocp/pos';
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
    fireEvent.keyDown(amountField(), { key: 'Tab' });
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

describe('POS extra paths', () => {
  it('resolves display currency from the sell route and falls back to CHF', () => {
    expect(currencyForPosLink(null, [])).toBe('CHF');
    expect(currencyForPosLink({ routeId: 99 }, [{ id: 10, currency: { name: 'EUR' } }])).toBe('CHF');
    expect(currencyForPosLink({ routeId: 10 }, [{ id: 10, currency: { name: 'USD' } }])).toBe('USD');
    expect(currencyForPosLink({ routeId: '10' }, [{ id: 10 }])).toBe('CHF');
  });

  it('shows loading, an empty till and an invalid amount', () => {
    const loading = renderPos(buildOcp({ links: null }));
    expect(screen.getByText(/loading|laden|caricamento|chargement/i)).toBeInTheDocument();
    loading.unmount();

    const go = jest.fn();
    const empty = render(
      createElement(LanguageProvider, null, createElement(PosView, { ocp: buildOcp({ links: [] }), go })),
    );
    fireEvent.click(screen.getByRole('button', { name: /create|erstellen|crea|créer/i }));
    expect(go).toHaveBeenCalledWith('links');
    empty.unmount();

    renderPos(buildOcp());
    fireEvent.change(amountField(), { target: { value: 'nope' } });
    fireEvent.click(chargeButton());
    expect(screen.getByText(/valid amount|gültigen betrag|importo valido|montant valide/i)).toBeInTheDocument();
  });

  it('marks a cancelled poll as failed', async () => {
    renderPos(buildOcp({ pollPayment: jest.fn().mockResolvedValue('Cancelled') }));
    fireEvent.change(amountField(), { target: { value: '3' } });
    fireEvent.click(chargeButton());
    expect(
      await screen.findByText(/not completed|nicht abgeschlossen|non completato|non abouti/i, { timeout: 4000 }),
    ).toBeInTheDocument();
  });

  it('resolves a demo charge as paid', async () => {
    jest.useFakeTimers();
    renderPos(buildOcp({ demo: true }));
    fireEvent.change(amountField(), { target: { value: '4' } });
    fireEvent.click(chargeButton());
    await waitFor(() => expect(document.querySelector('.qcap')).toBeTruthy());
    await act(async () => {
      jest.advanceTimersByTime(2700);
    });
    expect(screen.getByText(/paid|bezahlt|pagato|payé/i)).toBeInTheDocument();
    jest.useRealTimers();
  });

  it('loads links and routes on entry and keeps the selected till', () => {
    const ocp = buildOcp({
      links: null,
      routes: null,
      loadLinks: jest.fn(),
      loadRoutes: jest.fn(),
    });
    const loading = renderPos(ocp);
    expect(ocp.loadLinks).toHaveBeenCalled();
    expect(ocp.loadRoutes).toHaveBeenCalled();
    loading.unmount();

    renderPos(
      buildOcp({
        links: [
          { id: 1, label: 'EUR Till', status: 'Active', routeId: 10 },
          { id: 2, label: 'USD Till', status: 'Active', routeId: 11 },
        ] as never,
        sellRoutes: [
          { id: 10, currency: { name: 'EUR' } },
          { id: 11, currency: { name: 'USD' } },
        ] as never,
      }),
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } });
    expect(screen.getByRole('combobox')).toHaveValue('2');
    expect(screen.getAllByText(/USD/).length).toBeGreaterThan(0);
  });

  it('surfaces a generic charge error and labels a till without a name', async () => {
    renderPos(
      buildOcp({
        links: [{ id: 1, status: 'Active', routeId: 10 }] as never,
        charge: jest.fn().mockRejectedValue(new Error('x')),
      }),
    );
    expect(screen.getByRole('combobox').textContent).toMatch(/#1/);
    fireEvent.change(amountField(), { target: { value: '2' } });
    fireEvent.click(chargeButton());
    expect(await screen.findByText(/something went wrong|schiefgelaufen|storto|produite/i)).toBeInTheDocument();
  });

  it('marks an expired poll and retries from the fail state', async () => {
    const ocp = buildOcp({
      pollPayment: jest.fn().mockResolvedValueOnce('Expired').mockResolvedValue('Pending'),
    });
    renderPos(ocp);
    fireEvent.change(amountField(), { target: { value: '3' } });
    fireEvent.click(chargeButton());
    expect(
      await screen.findByText(/not completed|nicht abgeschlossen|non completato|non abouti/i, { timeout: 4000 }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry|erneut|riprova|réessayer/i }));
    await waitFor(() => expect(ocp.charge).toHaveBeenCalledTimes(2));
  });

  it('keeps polling while the payment is still pending', async () => {
    jest.useFakeTimers();
    const pollPayment = jest.fn().mockResolvedValue('Pending');
    renderPos(buildOcp({ pollPayment }));
    fireEvent.change(amountField(), { target: { value: '6' } });
    fireEvent.click(chargeButton());
    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(10000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(pollPayment.mock.calls.length).toBeGreaterThanOrEqual(1);
    jest.useRealTimers();
  });

  it('keeps the till locked when the local deadline elapses without a server status', async () => {
    jest.useFakeTimers();
    let now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const pollPayment = jest.fn().mockResolvedValue('Pending');
    renderPos(buildOcp({ pollPayment }));
    fireEvent.change(amountField(), { target: { value: '6' } });
    fireEvent.click(chargeButton());
    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    now = 1_000_000 + 300_000 + 1;
    await act(async () => {
      jest.advanceTimersByTime(2700);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText(/no confirmation|keine rückmeldung|nessuna conferma|pas encore de confirmation/i)).toBeInTheDocument();
    expect(chargeButton()).toBeDisabled();
    expect(document.querySelector('.qcap')).toBeTruthy();

    const pollsBeforeWait = pollPayment.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /keep waiting|weiter warten|continua ad aspettare|continuer d'attendre/i }));
    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(pollPayment.mock.calls.length).toBeGreaterThan(pollsBeforeWait);
    expect(chargeButton()).toBeDisabled();

    now = now + 300_000 + 1;
    await act(async () => {
      jest.advanceTimersByTime(2700);
      await Promise.resolve();
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: /end this payment|vorgang beenden|termina questo|terminer ce paiement/i }));
    expect(chargeButton()).not.toBeDisabled();
    expect(document.querySelector('.qcap')).toBeNull();

    jest.spyOn(Date, 'now').mockRestore();
    jest.useRealTimers();
  });

  it('drops a demo timeout and a live poll after unmount', async () => {
    jest.useFakeTimers();
    const demo = renderPos(buildOcp({ demo: true }));
    fireEvent.change(amountField(), { target: { value: '4' } });
    fireEvent.click(chargeButton());
    await waitFor(() => expect(document.querySelector('.qcap')).toBeTruthy());
    demo.unmount();
    await act(async () => {
      jest.advanceTimersByTime(2700);
    });
    jest.useRealTimers();

    let resolvePoll!: (value: string) => void;
    const pollPayment = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          resolvePoll = resolve;
        }),
    );
    jest.useFakeTimers();
    const live = renderPos(buildOcp({ pollPayment }));
    fireEvent.change(amountField(), { target: { value: '5' } });
    fireEvent.click(chargeButton());
    await waitFor(() => expect(document.querySelector('.qcap')).toBeTruthy());
    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    live.unmount();
    await act(async () => {
      resolvePoll?.('Completed');
    });
  });
});
