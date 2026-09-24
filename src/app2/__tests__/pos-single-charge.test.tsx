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
import { TextEncoder } from 'util';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiException } from '@dfx.swiss/react';
import { LanguageProvider } from '../i18n';
import { lnurlEncode } from '../screens/ocp/lnurl';
import PosView, { currencyForPosLink } from '../screens/ocp/pos';
import type { OcpApi } from '../screens/ocp/useOcp';

(global as { TextEncoder: typeof TextEncoder }).TextEncoder = TextEncoder;

function buildOcp(overrides: Partial<OcpApi> = {}): OcpApi {
  return {
    demo: false,
    enableDemo: jest.fn(),
    disableDemo: jest.fn(),
    active: true,
    sessionAddress: 'wallet-A',
    sessionIdentity: JSON.stringify(['account-A', 'wallet-A']),
    config: null,
    routes: { buy: [], sell: [] } as OcpApi['routes'],
    routesError: false,
    linksError: false,
    linksIdentity: JSON.stringify(['account-A', 'wallet-A']),
    links: [{ id: 1, label: 'EUR Till', status: 'Active', routeId: 10 }] as OcpApi['links'],
    history: null,
    historyError: false,
    probe: jest.fn(),
    loadRoutes: jest.fn(),
    loadLinks: jest.fn().mockResolvedValue([]),
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
    charge: jest.fn().mockResolvedValue({ lnurl: 'LNURL1TESTCHARGE', externalId: 'charge-1' }),
    pollPayment: jest.fn().mockResolvedValue('Pending'),
    saveConfig: jest.fn(),
    copy: jest.fn(),
    apiBaseUrl: 'https://api.example',
    ...overrides,
  };
}

function renderPos(ocp: OcpApi, go = jest.fn()) {
  return render(createElement(LanguageProvider, null, createElement(PosView, { ocp, go })));
}

function amountField() {
  return screen.getByPlaceholderText('0.00');
}

function chargeButton() {
  return screen.getByRole('button', { name: /^(charge|kassieren)$/i });
}

describe('POS charges exactly once until the payment is terminal', () => {
  it('ignores double Enter and click while the charge request is in flight', async () => {
    let resolveCharge!: (v: { lnurl: string; externalId: string }) => void;
    const chargePromise = new Promise<{ lnurl: string; externalId: string }>((resolve) => {
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
      resolveCharge({ lnurl: 'LNURL1ONCE', externalId: 'charge-once' });
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
        .mockResolvedValueOnce({ lnurl: 'LNURL1RETRY', externalId: 'charge-retry' }),
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
    expect(ocp.pollPayment).toHaveBeenCalledWith('1', 'charge-1');
    expect(chargeButton()).not.toBeDisabled();

    fireEvent.change(amountField(), { target: { value: '7' } });
    fireEvent.click(chargeButton());
    await waitFor(() => expect(ocp.charge).toHaveBeenCalledTimes(2));
    expect(ocp.charge).toHaveBeenNthCalledWith(2, '1', 7);

    view.unmount();
  });
});

describe('POS extra paths', () => {
  it('keeps an ambiguous charge locked when the reconciliation refresh fails', async () => {
    const loadLinks = jest.fn().mockResolvedValue(null);
    const charge = jest.fn().mockRejectedValue(new ApiException(500, 'busy'));
    const ocp = buildOcp({ charge, loadLinks });
    renderPos(ocp);

    fireEvent.change(amountField(), { target: { value: '8' } });
    fireEvent.click(chargeButton());
    await waitFor(() => expect(loadLinks).toHaveBeenCalledTimes(1));
    expect(chargeButton()).toBeDisabled();
    expect(charge).toHaveBeenCalledTimes(1);

    fireEvent.click(chargeButton());
    expect(charge).toHaveBeenCalledTimes(1);
  });

  it('keeps the till locked when the reconciliation refresh finds a pending payment', async () => {
    const pending = {
      id: 'till-1',
      status: 'Inactive',
      payment: { status: 'Pending', externalId: 'maybe-created', amount: 8 },
    };
    const loadLinks = jest.fn().mockResolvedValue([pending]);
    const charge = jest.fn().mockRejectedValue(new ApiException(500, 'busy'));
    const ocp = buildOcp({ charge, loadLinks });
    renderPos(ocp);

    fireEvent.change(amountField(), { target: { value: '8' } });
    fireEvent.click(chargeButton());
    await waitFor(() => expect(loadLinks).toHaveBeenCalledTimes(1));
    expect(chargeButton()).toBeDisabled();
    fireEvent.click(chargeButton());
    expect(charge).toHaveBeenCalledTimes(1);
  });

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

  it('shows a retry for failed link loads and keeps the create-link CTA for confirmed empty data', () => {
    const loadLinks = jest.fn();
    const failed = renderPos(buildOcp({ links: [], linksError: true, loadLinks }));
    expect(screen.getByText(/couldn't load/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create|erstellen|crea|créer/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(loadLinks).toHaveBeenCalledTimes(1);
    failed.unmount();

    renderPos(buildOcp({ links: [], linksError: false }));
    expect(screen.getByText(/create an active payment link first/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create|erstellen|crea|créer/i })).toBeInTheDocument();
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
    const pollPayment = jest.fn().mockResolvedValue('Pending');
    const ocp = buildOcp({ pollPayment });
    renderPos(ocp);
    fireEvent.change(amountField(), { target: { value: '6' } });
    fireEvent.click(chargeButton());
    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(300_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      screen.getByText(/no confirmation|keine rückmeldung|nessuna conferma|pas encore de confirmation/i),
    ).toBeInTheDocument();
    expect(chargeButton()).toBeDisabled();
    expect(document.querySelector('.qcap')).toBeTruthy();

    const pollsBeforeWait = pollPayment.mock.calls.length;
    fireEvent.click(
      screen.getByRole('button', { name: /keep waiting|weiter warten|continua ad aspettare|continuer d'attendre/i }),
    );
    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(pollPayment.mock.calls.length).toBeGreaterThan(pollsBeforeWait);
    expect(chargeButton()).toBeDisabled();

    await act(async () => {
      jest.advanceTimersByTime(300_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(chargeButton()).toBeDisabled();
    expect(document.querySelector('.qcap')).toBeTruthy();
    expect(
      screen.queryByRole('button', {
        name: /end this payment|vorgang beenden|termina questo|terminer ce paiement|posEndCharge/i,
      }),
    ).not.toBeInTheDocument();
    expect(ocp.charge).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('restores every pending server payment after POS remount and lets the cashier select each QR', async () => {
    jest.useFakeTimers();
    const pendingLink = (id: string, label: string, externalId: string, amount: number) => ({
      id,
      label,
      status: 'Inactive',
      routeId: 10,
      payment: {
        id: `${id}-payment`,
        externalId,
        status: 'Pending',
        amount,
        currency: { name: 'EUR' },
        lnurl: lnurlEncode(`https://api.example/lnurlp/${id}`),
      },
    });
    const ocp = buildOcp({
      links: [
        pendingLink('old-till', 'Old till', 'old-charge', 14),
        pendingLink('front-till', 'Front till', 'front-charge', 21),
      ] as never,
      pollPayment: jest.fn().mockResolvedValue('Pending'),
    });
    const firstMount = renderPos(ocp);
    expect(screen.getByTestId('ocp-pos-pending-charge')).toBeInTheDocument();
    expect(document.querySelector('.qcap')?.textContent?.trim()).toBe('EUR 21');
    expect(chargeButton()).toBeDisabled();
    expect(ocp.charge).not.toHaveBeenCalled();
    firstMount.unmount();

    renderPos(ocp);
    expect(document.querySelector('.qcap')?.textContent?.trim()).toBe('EUR 21');
    fireEvent.change(screen.getByTestId('ocp-pos-pending-charge'), { target: { value: 'old-till:old-charge' } });
    expect(document.querySelector('.qcap')?.textContent?.trim()).toBe('EUR 14');
    expect(chargeButton()).toBeDisabled();
    expect(ocp.charge).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(ocp.pollPayment).toHaveBeenCalledWith('old-till', 'old-charge');
    expect(ocp.pollPayment).toHaveBeenCalledWith('front-till', 'front-charge');
    jest.useRealTimers();
  });

  it('sorts same-label recovered tills by stable key and accepts string payment currency', () => {
    const pending = (id: string, externalId: string, amount: number, currency: string) => ({
      id,
      label: 'Shared till',
      status: 'Inactive',
      routeId: 10,
      payment: {
        id: `${id}-payment`,
        externalId,
        status: 'Pending',
        amount,
        currency,
        lnurl: lnurlEncode(`https://api.example/lnurlp/${id}`),
      },
    });
    renderPos(
      buildOcp({
        links: [pending('z-till', 'z-charge', 9, 'USD'), pending('a-till', 'a-charge', 5, 'EUR')] as never,
      }),
    );

    const selector = screen.getByTestId('ocp-pos-pending-charge') as HTMLSelectElement;
    expect(selector.options[0].textContent).toContain('EUR 5');
    expect(selector.options[1].textContent).toContain('USD 9');
    expect(document.querySelector('.qcap')?.textContent?.trim()).toBe('EUR 5');
  });

  it('uses stable fallback names and route currency for legacy recovered till records', () => {
    const pending = (id: string, externalId: string, amount: number) => ({
      id,
      label: '',
      externalId,
      status: 'Inactive',
      routeId: 10,
      payment: {
        id: `${id}-payment`,
        externalId: `${id}-charge`,
        status: 'Pending',
        amount,
        lnurl: lnurlEncode(`https://api.example/lnurlp/${id}`),
      },
    });
    renderPos(buildOcp({ links: [pending('unnamed', '', 4), pending('legacy', 'legacy-ref', 6)] as never }));

    const options = Array.from((screen.getByTestId('ocp-pos-pending-charge') as HTMLSelectElement).options).map(
      (option) => option.textContent,
    );
    expect(options).toEqual(expect.arrayContaining(['#unnamed · EUR 4', 'legacy-ref · EUR 6']));
  });

  it('keeps a recovered receipt visible after the successful refresh reports it completed', async () => {
    jest.useFakeTimers();
    const link = {
      id: 'till-1',
      label: 'Front till',
      status: 'Inactive',
      routeId: 10,
      payment: {
        id: 'payment-1',
        externalId: 'charge-1',
        status: 'Pending',
        amount: 12,
        currency: { name: 'EUR' },
        lnurl: lnurlEncode('https://api.example/lnurlp/till-1'),
      },
    };
    const completedLink = { ...link, payment: { ...link.payment, status: 'Completed' } };
    const ocp = buildOcp({
      links: [link] as never,
      pollPayment: jest.fn().mockResolvedValue('Completed'),
      loadLinks: jest.fn().mockResolvedValue([completedLink]),
    });
    const view = renderPos(ocp);

    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(ocp.loadLinks).toHaveBeenCalledTimes(1);

    view.rerender(createElement(LanguageProvider, null, createElement(PosView, { ocp: { ...ocp, links: [completedLink] as never }, go: jest.fn() })));
    expect(screen.getByText(/paid|bezahlt|pagato|payé/i)).toBeInTheDocument();
    expect(document.querySelector('.qcap')?.textContent?.trim()).toBe('EUR 12');
    expect(chargeButton()).not.toBeDisabled();
    jest.useRealTimers();
  });

  it('retains a terminal receipt while another recovered till remains pending', async () => {
    jest.useFakeTimers();
    const pendingLink = (id: string, status: string, amount: number) => ({
      id,
      label: id,
      status: 'Inactive',
      routeId: 10,
      payment: {
        id: `${id}-payment`,
        externalId: `${id}-charge`,
        status,
        amount,
        currency: { name: 'EUR' },
        lnurl: lnurlEncode(`https://api.example/lnurlp/${id}`),
      },
    });
    const firstPending = pendingLink('a-till', 'Pending', 5);
    const secondPending = pendingLink('b-till', 'Pending', 9);
    const firstCompleted = pendingLink('a-till', 'Completed', 5);
    const firstCharge = jest.fn().mockResolvedValue('Completed');
    const secondCharge = jest.fn().mockResolvedValue('Pending');
    const pollPayment = jest.fn((linkId: string) => (linkId === 'a-till' ? firstCharge() : secondCharge()));
    const ocp = buildOcp({
      links: [firstPending, secondPending] as never,
      pollPayment,
      loadLinks: jest.fn().mockResolvedValue([firstCompleted, secondPending]),
    });
    const view = renderPos(ocp);

    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(ocp.loadLinks).toHaveBeenCalledTimes(1);
    view.rerender(
      createElement(
        LanguageProvider,
        null,
        createElement(PosView, { ocp: { ...ocp, links: [firstCompleted, secondPending] as never }, go: jest.fn() }),
      ),
    );

    const selector = screen.getByTestId('ocp-pos-pending-charge') as HTMLSelectElement;
    expect(selector.options).toHaveLength(2);
    fireEvent.change(selector, { target: { value: 'a-till:a-till-charge' } });
    expect(screen.getByText(/paid|bezahlt|pagato|payé/i)).toBeInTheDocument();
    expect(chargeButton()).toBeDisabled();
    jest.useRealTimers();
  });

  it('marks an expired recovered payment failed and keeps that receipt after refresh', async () => {
    jest.useFakeTimers();
    const link = {
      id: 'till-expired',
      label: 'Expired till',
      status: 'Inactive',
      routeId: 10,
      payment: {
        id: 'payment-expired',
        externalId: 'charge-expired',
        status: 'Pending',
        amount: 7,
        currency: { name: 'EUR' },
        lnurl: lnurlEncode('https://api.example/lnurlp/till-expired'),
      },
    };
    const expiredLink = { ...link, payment: { ...link.payment, status: 'Expired' } };
    const ocp = buildOcp({
      links: [link] as never,
      pollPayment: jest.fn().mockResolvedValue('Expired'),
      loadLinks: jest.fn().mockResolvedValue([expiredLink]),
    });
    const view = renderPos(ocp);

    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });
    view.rerender(createElement(LanguageProvider, null, createElement(PosView, { ocp: { ...ocp, links: [expiredLink] as never }, go: jest.fn() })));
    expect(screen.getByText(/not completed|nicht abgeschlossen|non completato|non abouti/i)).toBeInTheDocument();
    expect(document.querySelector('.qcap')?.textContent?.trim()).toBe('EUR 7');
    expect(chargeButton()).not.toBeDisabled();
    jest.useRealTimers();
  });

  it('shows the local deadline for a recovered payment whose poll never settles', async () => {
    jest.useFakeTimers();
    const link = {
      id: 'till-stalled',
      label: 'Stalled till',
      status: 'Inactive',
      routeId: 10,
      payment: {
        id: 'payment-stalled',
        externalId: 'charge-stalled',
        status: 'Pending',
        amount: 6,
        currency: { name: 'EUR' },
        lnurl: lnurlEncode('https://api.example/lnurlp/till-stalled'),
      },
    };
    const pollPayment = jest.fn(() => new Promise<string>(() => undefined));
    const ocp = buildOcp({ links: [link] as never, pollPayment });
    renderPos(ocp);

    await act(async () => {
      jest.advanceTimersByTime(302_000);
      await Promise.resolve();
    });
    expect(pollPayment).toHaveBeenCalledWith('till-stalled', 'charge-stalled');
    expect(
      screen.getByText(/no confirmation|keine rückmeldung|nessuna conferma|pas encore de confirmation/i),
    ).toBeInTheDocument();
    expect(chargeButton()).toBeDisabled();
    expect(ocp.charge).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('does not refresh recovered payment state when a poll settles after leaving POS', async () => {
    jest.useFakeTimers();
    let resolvePoll!: (status: string) => void;
    const pollPayment = jest.fn(
      () => new Promise<string>((resolve) => {
        resolvePoll = resolve;
      }),
    );
    const loadLinks = jest.fn().mockResolvedValue([]);
    const link = {
      id: 'till-unmounted',
      label: 'Unmounted till',
      status: 'Inactive',
      routeId: 10,
      payment: {
        id: 'payment-unmounted',
        externalId: 'charge-unmounted',
        status: 'Pending',
        amount: 6,
        currency: { name: 'EUR' },
        lnurl: lnurlEncode('https://api.example/lnurlp/till-unmounted'),
      },
    };
    const view = renderPos(buildOcp({ links: [link] as never, pollPayment, loadLinks }));

    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    expect(pollPayment).toHaveBeenCalledWith('till-unmounted', 'charge-unmounted');
    view.unmount();
    await act(async () => {
      resolvePoll('Completed');
      await Promise.resolve();
    });

    expect(loadLinks).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('hides and clears the previous account QR when the wallet identity changes', async () => {
    const ocp = buildOcp();
    const view = renderPos(ocp);
    fireEvent.change(amountField(), { target: { value: '15' } });
    fireEvent.click(chargeButton());
    await waitFor(() => expect(document.querySelector('.qrcard')).toBeTruthy());

    const chargeCallsBeforeSwitch = (ocp.charge as jest.Mock).mock.calls.length;
    const otherAccount = {
      ...ocp,
      sessionAddress: 'wallet-B',
      sessionIdentity: JSON.stringify(['account-B', 'wallet-B']),
      linksIdentity: ocp.sessionIdentity,
    };
    view.rerender(createElement(LanguageProvider, null, createElement(PosView, { ocp: otherAccount, go: jest.fn() })));
    expect(document.querySelector('.qrcard')).not.toBeTruthy();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByTestId('ocp-pos-register')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /charge|kassieren/i })).not.toBeInTheDocument();
    expect((otherAccount.charge as jest.Mock).mock.calls).toHaveLength(chargeCallsBeforeSwitch);
  });

  it('hides a recovered QR when the API account changes but keeps the same wallet address', async () => {
    const pending = {
      id: 'same-wallet-till',
      label: 'Pending till',
      status: 'Inactive',
      routeId: 10,
      payment: {
        id: 'payment-A',
        externalId: 'charge-A',
        status: 'Pending',
        amount: 15,
        currency: { name: 'EUR' },
        lnurl: lnurlEncode('https://api.example/lnurlp/account-a'),
      },
    };
    const ocp = buildOcp({ links: [pending] as never });
    const view = renderPos(ocp);
    await waitFor(() => expect(document.querySelector('.qrcard')).toBeTruthy());

    const otherAccount = {
      ...ocp,
      sessionIdentity: JSON.stringify(['account-B', 'wallet-A']),
      linksIdentity: ocp.sessionIdentity,
    };
    view.rerender(createElement(LanguageProvider, null, createElement(PosView, { ocp: otherAccount, go: jest.fn() })));

    expect(otherAccount.sessionAddress).toBe(ocp.sessionAddress);
    expect(document.querySelector('.qrcard')).not.toBeTruthy();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByTestId('ocp-pos-register')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /charge|kassieren/i })).not.toBeInTheDocument();
    expect(otherAccount.charge).not.toHaveBeenCalled();
  });

  it('ignores a prior-account charge rejection after switching account with the same wallet', async () => {
    let rejectCharge!: (error: Error) => void;
    const charge = jest.fn(
      () => new Promise<{ lnurl: string; externalId: string }>((_resolve, reject) => {
        rejectCharge = reject;
      }),
    );
    const ocp = buildOcp({ charge });
    const view = renderPos(ocp);
    fireEvent.change(amountField(), { target: { value: '15' } });
    fireEvent.click(chargeButton());
    expect(charge).toHaveBeenCalledTimes(1);

    const otherAccount = {
      ...ocp,
      sessionIdentity: JSON.stringify(['account-B', 'wallet-A']),
      linksIdentity: JSON.stringify(['account-B', 'wallet-A']),
      links: [{ id: 2, label: 'B till', status: 'Active', routeId: 10 }],
    };
    view.rerender(createElement(LanguageProvider, null, createElement(PosView, { ocp: otherAccount, go: jest.fn() })));
    await waitFor(() => expect(chargeButton()).not.toBeDisabled());

    await act(async () => {
      rejectCharge(new ApiException(500, 'prior account failed'));
      await Promise.resolve();
    });

    expect(screen.queryByText(/prior account failed/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('ocp-pos-awaiting-reconciliation')).not.toBeInTheDocument();
    expect(chargeButton()).not.toBeDisabled();
    expect(otherAccount.loadLinks).not.toHaveBeenCalled();
  });

  it('keeps the POS loading until the new account link list arrives', () => {
    const ocp = buildOcp();
    const view = renderPos(ocp);
    const otherAccount = {
      ...ocp,
      sessionAddress: 'wallet-B',
      sessionIdentity: JSON.stringify(['account-B', 'wallet-B']),
      linksIdentity: ocp.sessionIdentity,
    };

    view.rerender(createElement(LanguageProvider, null, createElement(PosView, { ocp: otherAccount, go: jest.fn() })));

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByTestId('ocp-pos-register')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /charge|kassieren/i })).not.toBeInTheDocument();
    expect(otherAccount.charge).not.toHaveBeenCalled();
  });

  it('keeps a live QR visible and locked while refreshing links after a load error', async () => {
    const ocp = buildOcp();
    const view = renderPos(ocp);
    fireEvent.change(amountField(), { target: { value: '15' } });
    fireEvent.click(chargeButton());
    await waitFor(() => expect(document.querySelector('.qrcard')).toBeTruthy());

    const retryLinks = jest.fn();
    const failedRefresh = { ...ocp, links: [], linksError: true, loadLinks: retryLinks };
    view.rerender(
      createElement(LanguageProvider, null, createElement(PosView, { ocp: failedRefresh, go: jest.fn() })),
    );
    expect(document.querySelector('.qrcard')).toBeTruthy();
    expect(screen.getByText(/couldn't load/i)).toBeInTheDocument();
    expect(chargeButton()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(retryLinks).toHaveBeenCalled();
  });

  it('offers status recovery for an invalid pending LNURL while keeping replacement charge locked', async () => {
    const go = jest.fn();
    const loadLinks = jest.fn().mockResolvedValue(null);
    const ocp = buildOcp({
      loadLinks,
      links: [
        { id: 1, label: 'EUR Till', status: 'Active', routeId: 10 },
        {
          id: 'broken-till',
          label: 'Broken till',
          status: 'Inactive',
          routeId: 10,
          payment: {
            id: 'broken-payment',
            externalId: 'broken-charge',
            status: 'Pending',
            amount: 11,
            currency: { name: 'EUR' },
            lnurl: 'not-an-lnurl',
          },
        },
      ] as never,
    });
    const view = renderPos(ocp, go);
    expect(screen.getByTestId('ocp-pos-recovery-error')).toBeInTheDocument();
    expect(screen.getByText(/payment is still open.*status is unclear/i)).toBeInTheDocument();
    expect(document.querySelector('.qrcard')).not.toBeTruthy();
    expect(chargeButton()).toBeDisabled();
    expect(ocp.charge).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /refresh payment status/i }));
    await waitFor(() => expect(loadLinks).toHaveBeenCalledTimes(1));
    expect(chargeButton()).toBeDisabled();
    expect(ocp.charge).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /review payment links/i }));
    expect(go).toHaveBeenCalledWith('links');
    expect(chargeButton()).toBeDisabled();

    const updatedLinks = {
      ...ocp,
      links: [
        { id: 1, label: 'EUR Till', status: 'Active', routeId: 10 },
        { id: 'broken-till', label: 'Broken till', status: 'Inactive', routeId: 10 },
      ] as never,
      linksError: false,
    };
    view.rerender(
      createElement(LanguageProvider, null, createElement(PosView, { ocp: updatedLinks, go })),
    );
    expect(chargeButton()).toBeDisabled();

    const terminalLinks = {
      ...updatedLinks,
      links: [
        { id: 1, label: 'EUR Till', status: 'Active', routeId: 10 },
        {
          id: 'broken-till',
          label: 'Broken till',
          status: 'Inactive',
          routeId: 10,
          payment: { status: 'Completed' },
        },
      ] as never,
    };
    view.rerender(
      createElement(LanguageProvider, null, createElement(PosView, { ocp: terminalLinks, go })),
    );
    await waitFor(() => expect(chargeButton()).not.toBeDisabled());
    expect(ocp.charge).not.toHaveBeenCalled();
  });

  it('keeps the existing payable QR if a later link refresh omits its LNURL', () => {
    const pending = {
      id: 'till-1',
      label: 'Front till',
      status: 'Active',
      routeId: 10,
      payment: {
        id: 'payment-1',
        externalId: 'charge-1',
        status: 'Pending',
        amount: 12,
        currency: { name: 'EUR' },
        lnurl: lnurlEncode('https://api.example/lnurlp/till-1'),
      },
    };
    const ocp = buildOcp({ links: [pending] as never });
    const view = renderPos(ocp);
    expect(document.querySelector('.qcap')?.textContent?.trim()).toBe('EUR 12');

    const missingLnurl = {
      ...ocp,
      links: [{ ...pending, payment: { ...pending.payment, lnurl: '' } }] as never,
    };
    view.rerender(createElement(LanguageProvider, null, createElement(PosView, { ocp: missingLnurl, go: jest.fn() })));
    expect(document.querySelector('.qcap')?.textContent?.trim()).toBe('EUR 12');
    expect(chargeButton()).toBeDisabled();
  });

  it('shows the local deadline while a poll never settles and keeps the charge locked', async () => {
    jest.useFakeTimers();
    const pollPayment = jest.fn(() => new Promise<string>(() => undefined));
    const ocp = buildOcp({ pollPayment });
    const view = renderPos(ocp);

    fireEvent.change(amountField(), { target: { value: '9' } });
    await act(async () => {
      fireEvent.click(chargeButton());
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(document.querySelector('.qrcard')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    expect(pollPayment).toHaveBeenCalledWith('1', 'charge-1');

    await act(async () => {
      jest.advanceTimersByTime(300_000);
      await Promise.resolve();
    });

    expect(
      screen.getByText(/no confirmation|keine rückmeldung|nessuna conferma|pas encore de confirmation/i),
    ).toBeInTheDocument();
    expect(chargeButton()).toBeDisabled();
    expect(document.querySelector('.qrcard')).toBeTruthy();
    expect(ocp.charge).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: /keep waiting|weiter warten|continua ad aspettare|continuer d'attendre/i }),
    ).toBeInTheDocument();

    view.unmount();
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
