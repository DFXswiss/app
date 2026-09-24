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
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiException } from '@dfx.swiss/react';
import { LanguageProvider } from '../i18n';
import { lnurlEncode } from '../screens/ocp/lnurl';
import PosView, { currencyForPosLink } from '../screens/ocp/pos';
import type { OcpApi } from '../screens/ocp/useOcp';

(global as { TextEncoder: typeof TextEncoder }).TextEncoder = TextEncoder;
const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
let mockUuidCounter = 0;

beforeEach(() => {
  mockUuidCounter = 0;
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      randomUUID: () => `00000000-0000-4000-8000-${(++mockUuidCounter).toString(16).padStart(12, '0')}`,
    },
  });
});

afterAll(() => {
  if (originalCryptoDescriptor) Object.defineProperty(globalThis, 'crypto', originalCryptoDescriptor);
  else Reflect.deleteProperty(globalThis, 'crypto');
});

afterEach(() => {
  jest.restoreAllMocks();
});

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
    sellRoutes: [{ id: 10, active: true, currency: { name: 'EUR' } }] as OcpApi['sellRoutes'],
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

async function readyRecoveryRefreshButton() {
  const button = await screen.findByRole('button', { name: /refresh payment status/i });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

describe('POS charges exactly once until the payment is terminal', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });
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
    expect(ocp.charge).toHaveBeenCalledWith('1', 12, expect.any(String));

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

  it('keeps a failed charge locked after an empty list refresh until its exact status is terminal', async () => {
    const pollPayment = jest.fn().mockResolvedValue('Pending');
    const loadLinks = jest.fn().mockResolvedValue([]);
    const ocp = buildOcp({
      charge: jest
        .fn()
        .mockRejectedValueOnce(new ApiException(500, 'busy'))
        .mockResolvedValueOnce({ lnurl: 'LNURL1RETRY', externalId: 'charge-retry' }),
      pollPayment,
      loadLinks,
    });
    const view = renderPos(ocp);

    fireEvent.change(amountField(), { target: { value: '8' } });
    fireEvent.click(chargeButton());
    await waitFor(() => expect(ocp.charge).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('ocp-pos-ambiguous-charge')).toBeInTheDocument());
    await waitFor(() => expect(loadLinks).toHaveBeenCalledTimes(1));

    expect(screen.queryByRole('button', { name: /^(charge|kassieren)$/i })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('0.00')).not.toBeInTheDocument();
    expect(ocp.charge).toHaveBeenCalledWith('1', 8, expect.any(String));
    fireEvent.click(await readyRecoveryRefreshButton());
    await waitFor(() => expect(pollPayment).toHaveBeenCalledWith('1', (ocp.charge as jest.Mock).mock.calls[0][2]));
    expect(screen.queryByRole('button', { name: /^(charge|kassieren)$/i })).not.toBeInTheDocument();
    expect(ocp.charge).toHaveBeenCalledTimes(1);

    pollPayment.mockResolvedValueOnce(undefined);
    const pollCountBeforeUnknown = pollPayment.mock.calls.length;
    fireEvent.click(await readyRecoveryRefreshButton());
    await waitFor(() => expect(pollPayment.mock.calls.length).toBeGreaterThan(pollCountBeforeUnknown));
    expect(screen.queryByRole('button', { name: /^(charge|kassieren)$/i })).not.toBeInTheDocument();
    expect(ocp.charge).toHaveBeenCalledTimes(1);

    pollPayment.mockResolvedValueOnce('Completed');
    fireEvent.click(await readyRecoveryRefreshButton());
    await waitFor(() => expect(chargeButton()).not.toBeDisabled());
    fireEvent.change(amountField(), { target: { value: '9' } });
    fireEvent.click(chargeButton());
    await waitFor(() => expect(ocp.charge).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(document.querySelector('.qcap')?.textContent?.trim()).toBe('EUR 9');
    });

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
    expect(ocp.pollPayment).toHaveBeenCalledWith('1', (ocp.charge as jest.Mock).mock.calls[0][2]);
    expect(chargeButton()).not.toBeDisabled();

    fireEvent.change(amountField(), { target: { value: '7' } });
    fireEvent.click(chargeButton());
    await waitFor(() => expect(ocp.charge).toHaveBeenCalledTimes(2));
    expect(ocp.charge).toHaveBeenNthCalledWith(2, '1', 7, expect.any(String));

    view.unmount();
  });
});

describe('POS extra paths', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('restores the failed POST attempt after POS remount and does not unlock on empty list data', async () => {
    const firstPoll = jest.fn().mockResolvedValue('Pending');
    const first = renderPos(buildOcp({
      charge: jest.fn().mockRejectedValue(new ApiException(500, 'lost response')),
      pollPayment: firstPoll,
      loadLinks: jest.fn().mockResolvedValue([]),
    }));
    fireEvent.change(amountField(), { target: { value: '13' } });
    fireEvent.click(chargeButton());
    await waitFor(() => expect(screen.getByTestId('ocp-pos-ambiguous-charge')).toBeInTheDocument());
    const attemptedExternalId = JSON.parse(
      sessionStorage.getItem('ocp-pos-ambiguous-charge:["account-A","wallet-A"]') ?? '{}',
    ).externalId as string;
    expect(attemptedExternalId).toBeTruthy();
    first.unmount();

    const secondPoll = jest.fn().mockResolvedValue('Pending');
    renderPos(buildOcp({ links: [], pollPayment: secondPoll, loadLinks: jest.fn().mockResolvedValue([]) }));
    expect(screen.getByTestId('ocp-pos-ambiguous-charge')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(charge|kassieren)$/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('ocp-pos-ambiguous-charge-amount')).toHaveTextContent('EUR 13');
    fireEvent.click(await readyRecoveryRefreshButton());
    await waitFor(() => expect(secondPoll).toHaveBeenCalledWith('1', attemptedExternalId));
    expect(screen.queryByRole('button', { name: /^(charge|kassieren)$/i })).not.toBeInTheDocument();
  });

  it('reconciles a saved attempt with its exact pending server payment after remount', async () => {
    const identity = JSON.stringify(['account-A', 'wallet-A']);
    const externalId = 'saved-committed-payment';
    sessionStorage.setItem(
      `ocp-pos-ambiguous-charge:${identity}`,
      JSON.stringify({ ownerIdentity: identity, linkId: '1', externalId, amount: 12, currency: 'EUR' }),
    );
    const links = [{
      id: 1,
      label: 'EUR Till',
      status: 'Inactive',
      routeId: 10,
      payment: {
        id: 21,
        externalId,
        status: 'Pending',
        amount: 12,
        // Currency is optional in older payment-list responses; when omitted,
        // the selected sell route remains the display source.
        lnurl: lnurlEncode('https://api.example/lnurlp/saved'),
      },
    }];
    const ocp = buildOcp({ links: null });
    const view = renderPos(ocp);
    view.rerender(createElement(LanguageProvider, null, createElement(PosView, {
      ocp: buildOcp({ links: links as OcpApi['links'] }),
      go: jest.fn(),
    })));

    expect(await screen.findByTestId('ocp-pos-charge-amount')).toHaveTextContent('EUR 12');
    expect(screen.queryByTestId('ocp-pos-ambiguous-charge')).not.toBeInTheDocument();
    expect(chargeButton()).toBeDisabled();
    expect(sessionStorage.getItem(`ocp-pos-ambiguous-charge:${identity}`)).toBeNull();
    expect(ocp.charge).not.toHaveBeenCalled();
  });

  it('reconciles a saved attempt when the payment-list DTO reports currency as a string', async () => {
    const identity = JSON.stringify(['account-A', 'wallet-A']);
    const externalId = 'saved-string-currency';
    sessionStorage.setItem(
      `ocp-pos-ambiguous-charge:${identity}`,
      JSON.stringify({ ownerIdentity: identity, linkId: '1', externalId, amount: 12, currency: 'EUR' }),
    );
    const paymentLink = {
      id: 1,
      label: 'EUR Till',
      status: 'Inactive',
      routeId: 10,
      payment: {
        id: 26,
        externalId,
        status: 'Pending',
        amount: 12,
        currency: 'EUR',
        lnurl: lnurlEncode('https://api.example/lnurlp/string-currency'),
      },
    };
    renderPos(buildOcp({ links: [paymentLink] as OcpApi['links'] }));

    expect(await screen.findByTestId('ocp-pos-charge-amount')).toHaveTextContent('EUR 12');
    expect(chargeButton()).toBeDisabled();
    expect(sessionStorage.getItem(`ocp-pos-ambiguous-charge:${identity}`)).toBeNull();
  });

  it.each([
    ['a matching ID with a different amount', { externalId: 'saved-id', amount: 13, currency: 'EUR' }],
    ['a matching ID with a different currency', { externalId: 'saved-id', amount: 12, currency: 'CHF' }],
    ['a link with no payment record', undefined],
  ])('keeps a saved attempt locked for %s', async (_reason, payment) => {
    const identity = JSON.stringify(['account-A', 'wallet-A']);
    const externalId = 'saved-reconciliation-case';
    const matchingPayment = payment && payment.externalId === 'saved-id'
      ? { ...payment, externalId }
      : payment;
    sessionStorage.setItem(
      `ocp-pos-ambiguous-charge:${identity}`,
      JSON.stringify({ ownerIdentity: identity, linkId: '1', externalId, amount: 12, currency: 'EUR' }),
    );
    const paymentLink = {
      id: 1,
      label: 'EUR Till',
      status: 'Inactive',
      routeId: 10,
      payment: matchingPayment ? {
        id: 27,
        status: 'Pending',
        lnurl: lnurlEncode('https://api.example/lnurlp/mismatch'),
        ...matchingPayment,
      } : undefined,
    };
    renderPos(buildOcp({ links: [paymentLink] as OcpApi['links'] }));

    expect(await screen.findByTestId('ocp-pos-ambiguous-charge')).toBeInTheDocument();
    expect(screen.queryByTestId('ocp-pos-charge-amount')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(charge|kassieren)$/i })).not.toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem(`ocp-pos-ambiguous-charge:${identity}`) ?? '{}').externalId).toBe(externalId);
  });

  it('recovers the exact server payment when a committed POST response is lost', async () => {
    const lnurl = lnurlEncode('https://api.example/lnurlp/lost-response');
    const charge = jest.fn().mockRejectedValue(new ApiException(500, 'response lost'));
    let refreshedLinks: NonNullable<OcpApi['links']> = [];
    const loadLinks = jest.fn().mockImplementation(async () => {
      refreshedLinks = [{
        id: 1,
        label: 'EUR Till',
        status: 'Active',
        routeId: 10,
        payment: {
          id: 22,
          externalId: charge.mock.calls[0][2],
          status: 'Pending',
          amount: 12,
          currency: { name: 'EUR' },
          lnurl,
        },
      }] as NonNullable<OcpApi['links']>;
      return refreshedLinks;
    });
    const ocp = buildOcp({ charge, loadLinks });
    const identity = ocp.sessionIdentity;
    const view = renderPos(ocp);

    fireEvent.change(amountField(), { target: { value: '12' } });
    fireEvent.click(chargeButton());

    expect(await screen.findByTestId('ocp-pos-charge-amount')).toHaveTextContent('EUR 12');
    expect(screen.queryByTestId('ocp-pos-ambiguous-charge')).not.toBeInTheDocument();
    expect(loadLinks).toHaveBeenCalledTimes(1);
    expect(chargeButton()).toBeDisabled();
    expect(sessionStorage.getItem(`ocp-pos-ambiguous-charge:${identity}`)).toBeNull();
    expect(charge).toHaveBeenCalledTimes(1);

    view.rerender(createElement(LanguageProvider, null, createElement(PosView, {
      ocp: buildOcp({ links: refreshedLinks }),
      go: jest.fn(),
    })));
    expect(await screen.findByTestId('ocp-pos-charge-amount')).toHaveTextContent('EUR 12');
    expect(chargeButton()).toBeDisabled();
  });

  it('keeps the adopted QR when the refreshed list prop arrives before loadLinks resolves', async () => {
    let resolveLoadLinks!: (links: NonNullable<OcpApi['links']>) => void;
    let refreshedLinks: NonNullable<OcpApi['links']> = [];
    const loadLinks = jest.fn(() => new Promise<NonNullable<OcpApi['links']>>((resolve) => {
      resolveLoadLinks = resolve;
    }));
    const charge = jest.fn().mockRejectedValue(new ApiException(500, 'response lost'));
    const initialOcp = buildOcp({ charge, loadLinks });
    const view = renderPos(initialOcp);

    fireEvent.change(amountField(), { target: { value: '12' } });
    fireEvent.click(chargeButton());
    await waitFor(() => expect(loadLinks).toHaveBeenCalledTimes(1));
    const externalId = charge.mock.calls[0][2] as string;
    refreshedLinks = [{
      id: 1,
      label: 'EUR Till',
      status: 'Active',
      routeId: 10,
      payment: {
        id: 28,
        externalId,
        status: 'Pending',
        amount: 12,
        currency: 'EUR',
        lnurl: lnurlEncode('https://api.example/lnurlp/prop-race'),
      },
    }] as NonNullable<OcpApi['links']>;

    view.rerender(createElement(LanguageProvider, null, createElement(PosView, {
      ocp: buildOcp({ charge, loadLinks, links: refreshedLinks }),
      go: jest.fn(),
    })));
    expect(await screen.findByTestId('ocp-pos-charge-amount')).toHaveTextContent('EUR 12');
    await act(async () => {
      resolveLoadLinks(refreshedLinks);
      await Promise.resolve();
    });

    expect(screen.getByTestId('ocp-pos-charge-amount')).toHaveTextContent('EUR 12');
    expect(screen.queryByText(/response lost/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/existing payment is still open/i)).not.toBeInTheDocument();
    expect(chargeButton()).toBeDisabled();
  });

  it('recovers a pending payment on an inactive Sell route without offering that till for a new charge', async () => {
    jest.useFakeTimers();
    const inactivePending = {
      id: 20,
      label: 'Inactive till',
      status: 'Active',
      routeId: 10,
      payment: {
        id: 30,
        externalId: 'inactive-route-payment',
        status: 'Pending',
        amount: 19,
        currency: { name: 'EUR' },
        lnurl: lnurlEncode('https://api.example/lnurlp/inactive-route'),
      },
    };
    const ocp = buildOcp({
      links: [
        inactivePending,
        { id: 21, label: 'Active till', status: 'Active', routeId: 11 },
      ] as never,
      sellRoutes: [
        { id: 11, active: true, currency: { name: 'CHF' } },
      ] as never,
      pollPayment: jest.fn().mockResolvedValue('Pending'),
    });
    renderPos(ocp);

    expect(screen.getByTestId('ocp-pos-charge-amount')).toHaveTextContent('EUR 19');
    expect(chargeButton()).toBeDisabled();
    fireEvent.change(amountField(), { target: { value: '25' } });
    fireEvent.keyDown(amountField(), { key: 'Enter' });
    expect(ocp.charge).not.toHaveBeenCalled();
    const register = screen.getByTestId('ocp-pos-register');
    expect(within(register).getByRole('option', { name: 'Active till' })).toBeInTheDocument();
    expect(within(register).queryByRole('option', { name: 'Inactive till' })).not.toBeInTheDocument();
    expect(ocp.charge).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(ocp.pollPayment).toHaveBeenCalledWith('20', 'inactive-route-payment');
    jest.useRealTimers();
  });

  it('shows route loading and then exposes a valid till when Sell routes arrive', async () => {
    const loadingOcp = buildOcp({ routes: null, sellRoutes: [] });
    const view = renderPos(loadingOcp);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByText(/create an active payment link first/i)).not.toBeInTheDocument();

    view.rerender(createElement(LanguageProvider, null, createElement(PosView, {
      ocp: buildOcp({
        sellRoutes: [{ id: 10, active: true, currency: { name: 'EUR' } }],
      }),
      go: jest.fn(),
    })));
    expect(screen.getByTestId('ocp-pos-register')).toBeInTheDocument();
    expect(chargeButton()).toBeEnabled();
  });

  it('offers route retry instead of presenting a false empty till state after route loading fails', () => {
    const loadRoutes = jest.fn();
    renderPos(buildOcp({ routesError: true, loadRoutes }));

    expect(screen.getByText(/couldn.t load|laden/i)).toBeInTheDocument();
    expect(screen.queryByText(/create an active payment link first/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry|erneut/i }));
    expect(loadRoutes).toHaveBeenCalledTimes(1);
  });

  it('keeps a pending QR and charge lock visible while Sell routes are still loading', () => {
    const pending = {
      id: 31,
      label: 'Waiting till',
      status: 'Active',
      routeId: 10,
      payment: {
        id: 41,
        externalId: 'route-load-pending',
        status: 'Pending',
        amount: 9,
        currency: { name: 'EUR' },
        lnurl: lnurlEncode('https://api.example/lnurlp/routes-loading'),
      },
    };
    const ocp = buildOcp({ routes: null, sellRoutes: [], links: [pending] as never });
    renderPos(ocp);

    expect(screen.getByTestId('ocp-pos-charge-amount')).toHaveTextContent('EUR 9');
    expect(screen.getByTestId('ocp-pos-routes-unavailable')).toHaveTextContent(/loading/i);
    expect(chargeButton()).toBeDisabled();
    fireEvent.keyDown(amountField(), { key: 'Enter' });
    expect(ocp.charge).not.toHaveBeenCalled();
  });

  it('keeps a pending QR and charge lock while route loading fails and can be retried', () => {
    const loadRoutes = jest.fn();
    const pending = {
      id: 32,
      label: 'Waiting till',
      status: 'Active',
      routeId: 10,
      payment: {
        id: 42,
        externalId: 'route-error-pending',
        status: 'Pending',
        amount: 11,
        currency: { name: 'EUR' },
        lnurl: lnurlEncode('https://api.example/lnurlp/routes-error'),
      },
    };
    const ocp = buildOcp({
      routesError: true,
      loadRoutes,
      sellRoutes: [],
      links: [pending] as never,
    });
    renderPos(ocp);

    expect(screen.getByTestId('ocp-pos-charge-amount')).toHaveTextContent('EUR 11');
    expect(screen.getByTestId('ocp-pos-routes-unavailable')).toHaveTextContent(/couldn.t load|laden/i);
    expect(chargeButton()).toBeDisabled();
    fireEvent.click(within(screen.getByTestId('ocp-pos-routes-unavailable')).getByRole('button', { name: /retry/i }));
    expect(loadRoutes).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('ocp-pos-charge-amount')).toHaveTextContent('EUR 11');
    expect(chargeButton()).toBeDisabled();
  });

  it('keeps the ambiguous attempt locked and omits an absent API error message when refresh fails', async () => {
    const charge = jest.fn().mockRejectedValue(new Error('transport reset'));
    const ocp = buildOcp({ charge, loadLinks: jest.fn().mockResolvedValue(null) });
    renderPos(ocp);

    fireEvent.change(amountField(), { target: { value: '12' } });
    fireEvent.click(chargeButton());

    const warning = await screen.findByTestId('ocp-pos-ambiguous-charge');
    expect(warning).not.toHaveTextContent('transport reset');
    expect(screen.queryByPlaceholderText('0.00')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(charge|kassieren)$/i })).not.toBeInTheDocument();
    expect(JSON.parse(
      sessionStorage.getItem(`ocp-pos-ambiguous-charge:${ocp.sessionIdentity}`) ?? '{}',
    ).externalId).toBe(charge.mock.calls[0][2]);
  });

  it('adopts a different pending payment only for the exact same-link 409 conflict', async () => {
    const lnurl = lnurlEncode('https://api.example/lnurlp/other-tab');
    const charge = jest.fn().mockRejectedValue(new ApiException(
      409,
      'There is already a pending payment for the specified payment link',
    ));
    const refreshedLinks: NonNullable<OcpApi['links']> = [{
      id: 1,
      label: 'EUR Till',
      status: 'Active',
      routeId: 10,
      payment: {
        id: 23,
        externalId: 'payment-created-in-another-tab',
        status: 'Pending',
        amount: 17,
        currency: { name: 'CHF' },
        lnurl,
      },
    }] as NonNullable<OcpApi['links']>;
    const loadLinks = jest.fn().mockResolvedValue(refreshedLinks);
    const ocp = buildOcp({ charge, loadLinks });
    const view = renderPos(ocp);

    fireEvent.change(amountField(), { target: { value: '12' } });
    fireEvent.click(chargeButton());

    expect(await screen.findByTestId('ocp-pos-charge-amount')).toHaveTextContent('CHF 17');
    expect(screen.getByText(/existing payment is still open.*entered amount was not changed/i)).toBeInTheDocument();
    expect(amountField()).toHaveValue('12');
    expect(screen.queryByTestId('ocp-pos-ambiguous-charge')).not.toBeInTheDocument();
    expect(chargeButton()).toBeDisabled();
    expect(loadLinks).toHaveBeenCalledTimes(1);
    expect(charge).toHaveBeenCalledTimes(1);

    view.rerender(createElement(LanguageProvider, null, createElement(PosView, {
      ocp: buildOcp({ links: refreshedLinks }),
      go: jest.fn(),
    })));
    expect(await screen.findByTestId('ocp-pos-charge-amount')).toHaveTextContent('CHF 17');
    expect(screen.getByText(/existing payment is still open.*entered amount was not changed/i)).toBeInTheDocument();
    expect(chargeButton()).toBeDisabled();
  });

  it('does not adopt another payment for an unrelated 409 response', async () => {
    const charge = jest.fn().mockRejectedValue(new ApiException(409, 'Payment already exists'));
    const ocp = buildOcp({
      charge,
      loadLinks: jest.fn().mockResolvedValue([{
        id: 1,
        label: 'EUR Till',
        status: 'Active',
        routeId: 10,
        payment: {
          id: 25,
          externalId: 'other-tab-payment',
          status: 'Pending',
          amount: 19,
          currency: { name: 'CHF' },
          lnurl: lnurlEncode('https://api.example/lnurlp/unrelated-409'),
        },
      }]),
    });
    renderPos(ocp);

    fireEvent.change(amountField(), { target: { value: '12' } });
    fireEvent.click(chargeButton());

    expect(await screen.findByTestId('ocp-pos-ambiguous-charge')).toBeInTheDocument();
    expect(screen.queryByTestId('ocp-pos-charge-amount')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(charge|kassieren)$/i })).not.toBeInTheDocument();
    expect(charge).toHaveBeenCalledTimes(1);
  });

  it('keeps the ambiguous lock when the specific 409 has no valid same-link payment to recover', async () => {
    const charge = jest.fn().mockRejectedValue(new ApiException(
      409,
      'There is already a pending payment for the specified payment link',
    ));
    const ocp = buildOcp({ charge, loadLinks: jest.fn().mockResolvedValue([]) });
    renderPos(ocp);

    fireEvent.change(amountField(), { target: { value: '12' } });
    fireEvent.click(chargeButton());

    expect(await screen.findByTestId('ocp-pos-ambiguous-charge')).toBeInTheDocument();
    expect(screen.queryByTestId('ocp-pos-charge-amount')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(charge|kassieren)$/i })).not.toBeInTheDocument();
    const stored = JSON.parse(sessionStorage.getItem(`ocp-pos-ambiguous-charge:${ocp.sessionIdentity}`) ?? '{}');
    expect(stored.externalId).toBe(charge.mock.calls[0][2]);
    expect(charge).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['no list', null],
    ['an empty list', []],
    ['a different external ID after a lost response', [{
      id: 1, status: 'Active', routeId: 10,
      payment: { externalId: 'different-payment', status: 'Pending', amount: 12, currency: 'EUR', lnurl: lnurlEncode('https://api.example/lnurlp/different') },
    }]],
    ['an amount mismatch', [{
      id: 1, status: 'Active', routeId: 10,
      payment: { externalId: 'saved-id', status: 'Pending', amount: 13, currency: 'EUR', lnurl: lnurlEncode('https://api.example/lnurlp/wrong-amount') },
    }]],
    ['a currency mismatch', [{
      id: 1, status: 'Active', routeId: 10,
      payment: { externalId: 'saved-id', status: 'Pending', amount: 12, currency: 'CHF', lnurl: lnurlEncode('https://api.example/lnurlp/wrong-currency') },
    }]],
    ['a malformed pending payment', [{
      id: 1, status: 'Active', routeId: 10,
      payment: { externalId: 'saved-id', status: 'Pending', amount: 12, currency: 'EUR', lnurl: 'not-an-lnurl' },
    }]],
  ])('keeps the ambiguous lock for %s', async (_description, refreshedLinks) => {
    const charge = jest.fn().mockRejectedValue(new ApiException(500, 'response lost'));
    const loadLinks = jest.fn().mockImplementation(async () => {
      if (!refreshedLinks) return refreshedLinks;
      return (refreshedLinks as Array<Record<string, unknown>>).map((link) => {
        const payment = link.payment as Record<string, unknown> | undefined;
        return payment?.externalId === 'saved-id'
          ? { ...link, payment: { ...payment, externalId: charge.mock.calls[0][2] } }
          : link;
      });
    });
    const ocp = buildOcp({
      charge,
      loadLinks,
    });
    renderPos(ocp);

    fireEvent.change(amountField(), { target: { value: '12' } });
    fireEvent.click(chargeButton());

    expect(await screen.findByTestId('ocp-pos-ambiguous-charge')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(charge|kassieren)$/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('ocp-pos-charge-amount')).not.toBeInTheDocument();
    const saved = JSON.parse(
      sessionStorage.getItem(`ocp-pos-ambiguous-charge:${ocp.sessionIdentity}`) ?? '{}',
    );
    expect(saved.externalId).toBe(charge.mock.calls[0][2]);
    expect(charge).toHaveBeenCalledTimes(1);
  });

  it('does not adopt an old-account list response after switching accounts', async () => {
    let resolveLinks!: (links: NonNullable<OcpApi['links']>) => void;
    const loadLinks = jest.fn(() => new Promise<NonNullable<OcpApi['links']>>((resolve) => {
      resolveLinks = resolve;
    }));
    const charge = jest.fn().mockRejectedValue(new ApiException(500, 'response lost'));
    const ocpA = buildOcp({ charge, loadLinks });
    const identityA = ocpA.sessionIdentity;
    const view = renderPos(ocpA);

    fireEvent.change(amountField(), { target: { value: '12' } });
    fireEvent.click(chargeButton());
    await waitFor(() => expect(loadLinks).toHaveBeenCalledTimes(1));
    const oldExternalId = charge.mock.calls[0][2] as string;

    const identityB = JSON.stringify(['account-B', 'wallet-B']);
    view.rerender(createElement(LanguageProvider, null, createElement(PosView, {
      ocp: buildOcp({
        sessionAddress: 'wallet-B',
        sessionIdentity: identityB,
        linksIdentity: identityB,
        links: [{ id: 2, label: 'B Till', status: 'Active', routeId: 10 }] as OcpApi['links'],
      }),
      go: jest.fn(),
    })));

    await act(async () => {
      resolveLinks([{
        id: 1,
        label: 'A Till',
        status: 'Active',
        routeId: 10,
        payment: {
          id: 24,
          externalId: oldExternalId,
          status: 'Pending',
          amount: 12,
          currency: { name: 'EUR' },
          lnurl: lnurlEncode('https://api.example/lnurlp/old-account'),
        },
      }] as NonNullable<OcpApi['links']>);
      await Promise.resolve();
    });

    expect(screen.queryByTestId('ocp-pos-charge-amount')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ocp-pos-ambiguous-charge')).not.toBeInTheDocument();
    expect(chargeButton()).not.toBeDisabled();
    expect(sessionStorage.getItem(`ocp-pos-ambiguous-charge:${identityA}`)).not.toBeNull();
  });

  it('does not restore or poll an ambiguous attempt into another account using the same wallet', async () => {
    jest.useFakeTimers();
    const identityA = JSON.stringify(['account-A', 'wallet-shared']);
    sessionStorage.setItem(
      `ocp-pos-ambiguous-charge:${identityA}`,
      JSON.stringify({
        ownerIdentity: identityA,
        linkId: '1',
        externalId: 'account-a-charge',
        amount: 4,
        currency: 'EUR',
      }),
    );
    const pollA = jest.fn().mockResolvedValue('Pending');
    const view = renderPos(buildOcp({
      sessionAddress: 'wallet-shared',
      sessionIdentity: identityA,
      linksIdentity: identityA,
      pollPayment: pollA,
    }));
    expect(screen.queryByRole('button', { name: /^(charge|kassieren)$/i })).not.toBeInTheDocument();

    const identityB = JSON.stringify(['account-B', 'wallet-shared']);
    const pollB = jest.fn().mockResolvedValue('Pending');
    view.rerender(
      createElement(
        LanguageProvider,
        null,
        createElement(PosView, {
          ocp: buildOcp({
            sessionAddress: 'wallet-shared',
            sessionIdentity: identityB,
            linksIdentity: identityB,
            links: [{ id: 2, label: 'Other till', status: 'Active', routeId: 10 }] as OcpApi['links'],
            pollPayment: pollB,
          }),
          go: jest.fn(),
        }),
      ),
    );
    expect(chargeButton()).not.toBeDisabled();
    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByTestId('ocp-pos-ambiguous-charge')).not.toBeInTheDocument();
    expect(pollB).not.toHaveBeenCalled();
    expect(pollA).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(`ocp-pos-ambiguous-charge:${identityA}`)).not.toBeNull();
    view.unmount();
    jest.useRealTimers();
  });

  it('ignores a late terminal response from the previous account after switching POS identity', async () => {
    const identityA = JSON.stringify(['account-A', 'wallet-shared']);
    sessionStorage.setItem(
      `ocp-pos-ambiguous-charge:${identityA}`,
      JSON.stringify({ ownerIdentity: identityA, linkId: '1', externalId: 'late-a', amount: 4, currency: 'EUR' }),
    );
    let resolvePollA!: (status: string) => void;
    const pollA = jest.fn(
      () => new Promise<string>((resolve) => {
        resolvePollA = resolve;
      }),
    );
    const view = renderPos(buildOcp({
      sessionAddress: 'wallet-shared',
      sessionIdentity: identityA,
      linksIdentity: identityA,
      pollPayment: pollA,
    }));
    await act(async () => {
      fireEvent.click(await readyRecoveryRefreshButton());
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(pollA).toHaveBeenCalledTimes(1);

    const identityB = JSON.stringify(['account-B', 'wallet-shared']);
    view.rerender(
      createElement(
        LanguageProvider,
        null,
        createElement(PosView, {
          ocp: buildOcp({
            sessionAddress: 'wallet-shared',
            sessionIdentity: identityB,
            linksIdentity: identityB,
            links: [{ id: 2, label: 'B till', status: 'Active', routeId: 10 }] as OcpApi['links'],
          }),
          go: jest.fn(),
        }),
      ),
    );
    await waitFor(() => expect(chargeButton()).not.toBeDisabled());

    await act(async () => {
      resolvePollA('Completed');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(chargeButton()).not.toBeDisabled();
    expect(screen.queryByTestId('ocp-pos-terminal-receipt')).not.toBeInTheDocument();
    expect(sessionStorage.getItem(`ocp-pos-ambiguous-charge:${identityA}`)).not.toBeNull();
  });

  it.each(['Cancelled', 'Expired'])('unlocks an ambiguous attempt only after server status %s', async (terminalStatus) => {
    const identity = JSON.stringify(['account-A', 'wallet-A']);
    sessionStorage.setItem(
      `ocp-pos-ambiguous-charge:${identity}`,
      JSON.stringify({
        ownerIdentity: identity,
        linkId: '1',
        externalId: `charge-${terminalStatus}`,
        amount: 6,
        currency: 'EUR',
      }),
    );
    const pollPayment = jest.fn().mockResolvedValue(terminalStatus);
    const ocp = buildOcp({ pollPayment });
    renderPos(ocp);

    expect(screen.queryByRole('button', { name: /^(charge|kassieren)$/i })).not.toBeInTheDocument();
    fireEvent.click(await readyRecoveryRefreshButton());
    await waitFor(() => expect(chargeButton()).not.toBeDisabled());
    expect(pollPayment).toHaveBeenCalledWith('1', `charge-${terminalStatus}`);
    expect(sessionStorage.getItem(`ocp-pos-ambiguous-charge:${identity}`)).toBeNull();
    expect(ocp.charge).not.toHaveBeenCalled();
  });

  it.each([
    ['Completed', /paid|bezahlt/i],
    ['Cancelled', /not completed|nicht abgeschlossen/i],
  ])('shows the %s receipt after its link is no longer active', async (terminalStatus, receiptText) => {
    const identity = JSON.stringify(['account-A', 'wallet-A']);
    sessionStorage.setItem(
      `ocp-pos-ambiguous-charge:${identity}`,
      JSON.stringify({
        ownerIdentity: identity,
        linkId: 'inactive-till',
        externalId: `charge-${terminalStatus}`,
        amount: 6,
        currency: 'EUR',
      }),
    );
    const pollPayment = jest.fn().mockResolvedValue(terminalStatus);
    const ocp = buildOcp({ links: [], pollPayment });
    const go = jest.fn();
    render(createElement(LanguageProvider, null, createElement(PosView, { ocp, go })));

    expect(screen.queryByRole('button', { name: /^(charge|kassieren)$/i })).not.toBeInTheDocument();
    fireEvent.click(await readyRecoveryRefreshButton());
    expect(await screen.findByTestId('ocp-pos-terminal-receipt')).toHaveTextContent(receiptText);
    expect(screen.getByTestId('ocp-pos-terminal-receipt')).toHaveTextContent('EUR 6');
    expect(screen.getByTestId('ocp-pos-terminal-receipt')).toHaveTextContent('inactive-till');
    expect(screen.getByTestId('ocp-pos-terminal-external-id')).toHaveTextContent(`charge-${terminalStatus}`);
    expect(screen.queryByRole('button', { name: /^(charge|kassieren)$/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /create payment link/i }));
    expect(go).toHaveBeenCalledWith('links');
  });

  it('shows an identifying terminal receipt while its till remains active and permits the next charge', async () => {
    const identity = JSON.stringify(['account-A', 'wallet-A']);
    sessionStorage.setItem(
      `ocp-pos-ambiguous-charge:${identity}`,
      JSON.stringify({
        ownerIdentity: identity,
        linkId: '1',
        externalId: 'completed-active-charge',
        amount: 6,
        currency: 'EUR',
      }),
    );
    const pollPayment = jest.fn().mockResolvedValueOnce('Completed').mockResolvedValue('Pending');
    const charge = jest.fn().mockResolvedValue({ lnurl: 'LNURL1NEXTCHARGE', externalId: 'next-charge' });
    const ocp = buildOcp({ pollPayment, charge });
    renderPos(ocp);

    fireEvent.click(await readyRecoveryRefreshButton());
    const receipt = await screen.findByTestId('ocp-pos-terminal-receipt');
    expect(receipt).toHaveTextContent(/paid|bezahlt/i);
    expect(receipt).toHaveTextContent('EUR 6');
    expect(receipt).toHaveTextContent('1');
    expect(screen.getByTestId('ocp-pos-terminal-external-id')).toHaveTextContent('completed-active-charge');
    expect(chargeButton()).not.toBeDisabled();

    fireEvent.change(amountField(), { target: { value: '10' } });
    fireEvent.click(chargeButton());
    await waitFor(() => expect(charge).toHaveBeenCalledWith('1', 10, expect.any(String)));
    expect(screen.queryByTestId('ocp-pos-terminal-receipt')).not.toBeInTheDocument();
    expect(await screen.findByTestId('ocp-pos-charge-amount')).toHaveTextContent('EUR 10');
  });

  it.each([
    ['invalid JSON', '{'],
    ['a non-object JSON value', 'null'],
    ['an attempt owned by a different session', JSON.stringify({ ownerIdentity: 'another-session', linkId: '1', externalId: 'x', amount: 2, currency: 'EUR' })],
    ['an invalid amount', JSON.stringify({ ownerIdentity: JSON.stringify(['account-A', 'wallet-A']), linkId: '1', externalId: 'x', amount: '2', currency: 'EUR' })],
  ])('ignores %s in saved ambiguous-attempt state without locking the till', (_label, serialized) => {
    const identity = JSON.stringify(['account-A', 'wallet-A']);
    sessionStorage.setItem(`ocp-pos-ambiguous-charge:${identity}`, serialized);
    const pollPayment = jest.fn();
    renderPos(buildOcp({ pollPayment }));
    expect(chargeButton()).not.toBeDisabled();
    expect(screen.queryByTestId('ocp-pos-ambiguous-charge')).not.toBeInTheDocument();
    expect(pollPayment).not.toHaveBeenCalled();
  });

  it('fails closed with a clear error when secure UUID generation is unavailable', () => {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
    const ocp = buildOcp();
    renderPos(ocp);
    fireEvent.change(amountField(), { target: { value: '5' } });
    fireEvent.click(chargeButton());
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(ocp.charge).not.toHaveBeenCalled();
    expect(chargeButton()).not.toBeDisabled();
    expect(sessionStorage.getItem('ocp-pos-ambiguous-charge:["account-A","wallet-A"]')).toBeNull();
  });

  it('uses secure getRandomValues to create a UUIDv4 when randomUUID is unavailable', async () => {
    const getRandomValues = jest.fn((bytes: Uint8Array) => {
      bytes.set(Array.from({ length: 16 }, (_, index) => index + 1));
      return bytes;
    });
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { randomUUID: undefined, getRandomValues },
    });
    const ocp = buildOcp();
    renderPos(ocp);
    fireEvent.change(amountField(), { target: { value: '5' } });
    fireEvent.click(chargeButton());
    await waitFor(() =>
      expect(ocp.charge).toHaveBeenCalledWith('1', 5, '01020304-0506-4708-890a-0b0c0d0e0f10'),
    );
    expect(getRandomValues).toHaveBeenCalledTimes(1);
  });

  it('fails closed when neither secure UUID API is available', () => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { randomUUID: undefined, getRandomValues: undefined },
    });
    const ocp = buildOcp();
    renderPos(ocp);
    fireEvent.change(amountField(), { target: { value: '5' } });
    fireEvent.click(chargeButton());
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(ocp.charge).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('ocp-pos-ambiguous-charge:["account-A","wallet-A"]')).toBeNull();
  });

  it('unlocks without creating a charge when session storage cannot persist an attempt', () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('storage unavailable');
    });
    const ocp = buildOcp();
    renderPos(ocp);
    fireEvent.change(amountField(), { target: { value: '5' } });
    fireEvent.click(chargeButton());
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(ocp.charge).not.toHaveBeenCalled();
    expect(chargeButton()).not.toBeDisabled();
    setItem.mockRestore();
  });

  it('continues without a restored attempt when session storage read throws', () => {
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    const ocp = buildOcp();
    renderPos(ocp);
    expect(chargeButton()).not.toBeDisabled();
    expect(screen.queryByTestId('ocp-pos-ambiguous-charge')).not.toBeInTheDocument();
    getItem.mockRestore();
  });

  it('keeps the recovery warning and exposes load failure while refreshing unavailable links', async () => {
    const links = [{
      id: 'unavailable-till',
      label: 'Unavailable till',
      status: 'Inactive',
      routeId: 10,
      payment: { id: 'payment-id', status: 'Pending', amount: 5 },
    }];
    const view = renderPos(buildOcp({ links: links as never }));
    expect(await screen.findByTestId('ocp-pos-recovery-error')).toBeInTheDocument();
    view.rerender(
      createElement(
        LanguageProvider,
        null,
        createElement(PosView, {
          ocp: buildOcp({ links: links as never, linksError: true }),
          go: jest.fn(),
        }),
      ),
    );
    expect(await screen.findByTestId('ocp-pos-recovery-error')).toHaveTextContent(/couldn't load|laden/i);
    expect(chargeButton()).toBeDisabled();
  });

  it('keeps malformed pending invoices locked until the API provides complete recovery data', async () => {
    const linkFor = (payment: Record<string, unknown>) => ({
      id: 'recoverable-till',
      label: 'Recoverable till',
      status: 'Inactive',
      routeId: 10,
      payment: { id: 'pending-id', status: 'Pending', ...payment },
    });
    const initialLinks = [linkFor({ externalId: '', lnurl: 'bad', amount: 0 })];
    const view = renderPos(buildOcp({ links: initialLinks as never }));
    expect(await screen.findByTestId('ocp-pos-recovery-error')).toBeInTheDocument();
    expect(chargeButton()).toBeDisabled();

    const incompleteInvoices = [
      linkFor({ externalId: 'charge-id', lnurl: 'not-a-lnurl', amount: 4 }),
      linkFor({ externalId: 'charge-id', lnurl: lnurlEncode('https://api.example/lnurlp/till'), amount: '4' }),
      linkFor({ externalId: 'charge-id', lnurl: lnurlEncode('https://api.example/lnurlp/till'), amount: Infinity }),
      linkFor({ externalId: 'charge-id', lnurl: lnurlEncode('https://api.example/lnurlp/till'), amount: 0 }),
    ];
    for (const paymentLink of incompleteInvoices) {
      const links = [paymentLink];
      view.rerender(
        createElement(
          LanguageProvider,
          null,
          createElement(PosView, { ocp: buildOcp({ links: links as never }), go: jest.fn() }),
        ),
      );
      expect(await screen.findByTestId('ocp-pos-recovery-error')).toBeInTheDocument();
      expect(chargeButton()).toBeDisabled();
      expect(screen.queryByTestId('ocp-pos-pending-charge')).not.toBeInTheDocument();
    }

    const recoveredLinks = [
      linkFor({
        externalId: 'charge-id',
        lnurl: lnurlEncode('https://api.example/lnurlp/till'),
        amount: 4,
        currency: { name: 'EUR' },
      }),
    ];
    view.rerender(
      createElement(
        LanguageProvider,
        null,
        createElement(PosView, {
          ocp: buildOcp({ links: recoveredLinks as never, pollPayment: jest.fn().mockResolvedValue('Pending') }),
          go: jest.fn(),
        }),
      ),
    );
    expect(screen.getByTestId('ocp-pos-charge-amount')).toHaveTextContent('EUR 4');
    expect(screen.queryByTestId('ocp-pos-recovery-error')).not.toBeInTheDocument();
    expect(chargeButton()).toBeDisabled();
  });

  it('releases an unrecoverable pending lock when the API later confirms a terminal status', async () => {
    const link = {
      id: 'terminal-till',
      label: 'Terminal till',
      status: 'Inactive',
      routeId: 10,
      payment: { id: 'payment-id', status: 'Pending', amount: 5 },
    };
    const view = renderPos(buildOcp({ links: [link] as never }));
    expect(await screen.findByTestId('ocp-pos-recovery-error')).toBeInTheDocument();
    expect(chargeButton()).toBeDisabled();

    const terminalLink = { ...link, payment: { ...link.payment, status: 'Completed' } };
    view.rerender(
      createElement(
        LanguageProvider,
        null,
        createElement(PosView, { ocp: buildOcp({ links: [terminalLink] as never }), go: jest.fn() }),
      ),
    );
    expect(await screen.findByText(/create an active payment link first/i)).toBeInTheDocument();
    expect(screen.queryByTestId('ocp-pos-recovery-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ocp-pos-pending-charge')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ocp-pos-ambiguous-charge')).not.toBeInTheDocument();

    const activeTerminalLink = { ...terminalLink, status: 'Active' };
    view.rerender(
      createElement(
        LanguageProvider,
        null,
        createElement(PosView, { ocp: buildOcp({ links: [activeTerminalLink] as never }), go: jest.fn() }),
      ),
    );
    await waitFor(() => expect(chargeButton()).not.toBeDisabled());
  });

  it('allows manual retry after stalled polls and unlocks only after Completed without auto-polling', async () => {
    jest.useFakeTimers();
    let resolveFirst!: (status: string) => void;
    const firstNeverSettles = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });
    let resolveSecond!: (status: string) => void;
    const secondNeverSettles = new Promise<string>((resolve) => {
      resolveSecond = resolve;
    });
    const pollPayment = jest
      .fn()
      .mockReturnValueOnce(firstNeverSettles)
      .mockReturnValueOnce(secondNeverSettles)
      .mockResolvedValueOnce('Completed');
    const identity = JSON.stringify(['account-A', 'wallet-A']);
    sessionStorage.clear();
    const ocp = buildOcp({
      charge: jest.fn().mockRejectedValue(new ApiException(500, 'lost response')),
      pollPayment,
    });
    const view = renderPos(ocp);
    fireEvent.change(amountField(), { target: { value: '11' } });
    fireEvent.click(chargeButton());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const externalId = sessionStorage.getItem(`ocp-pos-ambiguous-charge:${identity}`)
      ? JSON.parse(sessionStorage.getItem(`ocp-pos-ambiguous-charge:${identity}`) as string).externalId as string
      : '';
    expect(externalId).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(pollPayment).toHaveBeenCalledTimes(1);
    expect(pollPayment).toHaveBeenCalledWith('1', externalId);

    await act(async () => {
      jest.advanceTimersByTime(19999);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(pollPayment).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();
    });
    let refresh = screen.getByRole('button', { name: /refresh payment status/i });
    expect(refresh).toBeEnabled();
    expect(screen.queryByRole('button', { name: /^(charge|kassieren)$/i })).not.toBeInTheDocument();
    // A timed-out first request does not restart automatic polling or pile up
    // requests in the background. Only an explicit cashier refresh does so.
    await act(async () => {
      jest.advanceTimersByTime(60000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(pollPayment).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(refresh);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(pollPayment).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: /^(charge|kassieren)$/i })).not.toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(20000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByRole('button', { name: /^(charge|kassieren)$/i })).not.toBeInTheDocument();
    expect(pollPayment).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('ocp-pos-status-check-limit')).toBeInTheDocument();
    expect(screen.getByTestId('ocp-pos-ambiguous-charge-reference')).toHaveTextContent(externalId);
    expect(screen.getByTestId('ocp-pos-ambiguous-charge-amount')).toHaveTextContent('EUR 11');
    expect(screen.getByTestId('ocp-pos-ambiguous-charge-link')).toHaveTextContent('1');
    expect(screen.getAllByTestId('ocp-pos-ambiguous-charge')).toHaveLength(1);
    expect(screen.queryByPlaceholderText('0.00')).not.toBeInTheDocument();
    expect(screen.queryByText(/response lost/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /refresh payment status/i })).not.toBeInTheDocument();

    // A late response releases one real in-flight slot; the next explicit
    // status check becomes available, but this late Pending response cannot
    // unlock the till because its 20s UI race already ended.
    await act(async () => {
      resolveFirst('Pending');
      await Promise.resolve();
      await Promise.resolve();
    });
    refresh = await readyRecoveryRefreshButton();
    await act(async () => {
      fireEvent.click(refresh);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(pollPayment).toHaveBeenCalledTimes(3);
    expect(await screen.findByTestId('ocp-pos-terminal-receipt')).toHaveTextContent('EUR 11');
    await waitFor(() => expect(chargeButton()).toBeEnabled());
    expect(ocp.charge).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSecond('Pending');
      await Promise.resolve();
      await Promise.resolve();
    });

    view.unmount();
    jest.useRealTimers();
  });

  it('keeps the two-request safety cap across POS remounts and restores refresh after a late response', async () => {
    jest.useFakeTimers();
    const identity = JSON.stringify(['account-A', 'wallet-A']);
    sessionStorage.setItem(
      `ocp-pos-ambiguous-charge:${identity}`,
      JSON.stringify({ ownerIdentity: identity, linkId: '1', externalId: 'remount-id', amount: 4, currency: 'EUR' }),
    );
    let resolveFirst!: (status: string) => void;
    const firstNeverSettles = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });
    let resolveSecond!: (status: string) => void;
    const secondNeverSettles = new Promise<string>((resolve) => {
      resolveSecond = resolve;
    });
    const pollPayment = jest.fn().mockReturnValueOnce(firstNeverSettles).mockReturnValueOnce(secondNeverSettles);
    const firstView = renderPos(buildOcp({ pollPayment }));
    await act(async () => {
      fireEvent.click(await readyRecoveryRefreshButton());
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(pollPayment).toHaveBeenCalledTimes(1);
    firstView.unmount();

    renderPos(buildOcp({ pollPayment }));
    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(pollPayment).toHaveBeenCalledTimes(2);
    await act(async () => {
      jest.advanceTimersByTime(20000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId('ocp-pos-status-check-limit')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /refresh payment status/i })).not.toBeInTheDocument();

    await act(async () => {
      resolveFirst('Pending');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(await readyRecoveryRefreshButton()).toBeEnabled();
    expect(screen.queryByRole('button', { name: /^(charge|kassieren)$/i })).not.toBeInTheDocument();
    await act(async () => {
      resolveSecond('Pending');
      await Promise.resolve();
      await Promise.resolve();
    });
    jest.useRealTimers();
  });

  it('caps simultaneous status checks across three cashier views for one charge', async () => {
    const identity = JSON.stringify(['account-A', 'wallet-A']);
    sessionStorage.setItem(
      `ocp-pos-ambiguous-charge:${identity}`,
      JSON.stringify({ ownerIdentity: identity, linkId: '1', externalId: 'shared-charge', amount: 4, currency: 'EUR' }),
    );
    const settle: Array<(status: string) => void> = [];
    const pollPayment = jest.fn(
      () => new Promise<string>((resolve) => settle.push(resolve)),
    );
    const views = Array.from({ length: 3 }, () => renderPos(buildOcp({ pollPayment })));
    const refreshButtons = views.map((view) =>
      within(view.container).getByRole('button', { name: /refresh payment status/i }),
    );

    await act(async () => {
      refreshButtons.forEach((button) => fireEvent.click(button));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(pollPayment).toHaveBeenCalledTimes(2);
    expect(screen.getAllByTestId('ocp-pos-status-check-limit')).toHaveLength(3);
    expect(screen.queryAllByRole('button', { name: /^(charge|kassieren)$/i })).toHaveLength(0);
    expect(screen.queryAllByPlaceholderText('0.00')).toHaveLength(0);

    await act(async () => {
      settle.forEach((resolve) => resolve('Pending'));
      await Promise.resolve();
      await Promise.resolve();
    });
    views.forEach((view) => view.unmount());
  });

  it('does not start recovered polling while two status requests for that payment remain in flight', async () => {
    jest.useFakeTimers();
    const identity = JSON.stringify(['account-A', 'wallet-A']);
    const externalId = 'shared-recovery-charge';
    sessionStorage.setItem(
      `ocp-pos-ambiguous-charge:${identity}`,
      JSON.stringify({ ownerIdentity: identity, linkId: '1', externalId, amount: 4, currency: 'EUR' }),
    );
    const settlements: Array<(status: string) => void> = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const pollPayment = jest.fn(() => new Promise<string>((resolve) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      settlements.push((status) => {
        inFlight -= 1;
        resolve(status);
      });
    }));
    const linksWithoutPayment = [{ id: 1, label: 'EUR Till', status: 'Active', routeId: 10 }] as OcpApi['links'];
    const views = Array.from({ length: 3 }, () => renderPos(buildOcp({
      links: linksWithoutPayment,
      pollPayment,
    })));
    const refreshers = views.slice(1).map((view) =>
      within(view.container).getByRole('button', { name: /refresh payment status/i }),
    );
    await act(async () => {
      refreshers.forEach((button) => fireEvent.click(button));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(pollPayment).toHaveBeenCalledTimes(2);

    views[1].unmount();
    views[2].unmount();
    const pendingLink = {
      id: 1,
      label: 'EUR Till',
      status: 'Active',
      routeId: 10,
      payment: {
        id: 29,
        externalId,
        status: 'Pending',
        amount: 4,
        currency: { name: 'EUR' },
        lnurl: lnurlEncode('https://api.example/lnurlp/shared-recovery'),
      },
    };
    views[0].rerender(createElement(LanguageProvider, null, createElement(PosView, {
      ocp: buildOcp({ links: [pendingLink] as OcpApi['links'], pollPayment }),
      go: jest.fn(),
    })));
    expect(await screen.findByTestId('ocp-pos-charge-amount')).toHaveTextContent('EUR 4');

    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(pollPayment).toHaveBeenCalledTimes(2);
    expect(chargeButton()).toBeDisabled();

    await act(async () => {
      settlements[0]('Pending');
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(4000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(chargeButton()).toBeDisabled();

    views[0].unmount();
    settlements.slice(1).forEach((settle) => settle('Pending'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    jest.useRealTimers();
  });

  it('does not overlap a scheduled poll with a manual check or restart after its timeout', async () => {
    jest.useFakeTimers();
    const identity = JSON.stringify(['account-A', 'wallet-A']);
    sessionStorage.setItem(
      `ocp-pos-ambiguous-charge:${identity}`,
      JSON.stringify({ ownerIdentity: identity, linkId: '1', externalId: 'overlap-id', amount: 4, currency: 'EUR' }),
    );
    let resolvePoll!: (status: string) => void;
    const pollPayment = jest.fn(
      () => new Promise<string>((resolve) => {
        resolvePoll = resolve;
      }),
    );
    renderPos(buildOcp({ pollPayment }));
    fireEvent.click(await readyRecoveryRefreshButton());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(pollPayment).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(pollPayment).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(25000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(pollPayment).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /^(charge|kassieren)$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh payment status/i })).toBeEnabled();

    await act(async () => {
      resolvePoll('Pending');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByRole('button', { name: /^(charge|kassieren)$/i })).not.toBeInTheDocument();
    jest.useRealTimers();
  });

  it('keeps the charge locked and makes status refresh available after a rejected GET', async () => {
    const identity = JSON.stringify(['account-A', 'wallet-A']);
    sessionStorage.setItem(
      `ocp-pos-ambiguous-charge:${identity}`,
      JSON.stringify({ ownerIdentity: identity, linkId: '1', externalId: 'rejected-id', amount: 4, currency: 'EUR' }),
    );
    const pollPayment = jest.fn().mockRejectedValue(new Error('status service unavailable'));
    renderPos(buildOcp({ pollPayment }));
    fireEvent.click(await readyRecoveryRefreshButton());
    await waitFor(() => expect(pollPayment).toHaveBeenCalledTimes(1));
    expect(await readyRecoveryRefreshButton()).toBeEnabled();
    expect(screen.queryByRole('button', { name: /^(charge|kassieren)$/i })).not.toBeInTheDocument();
  });

  it('keeps the automatic status backoff across renders and increases its interval', async () => {
    jest.useFakeTimers();
    const identity = JSON.stringify(['account-A', 'wallet-A']);
    sessionStorage.setItem(
      `ocp-pos-ambiguous-charge:${identity}`,
      JSON.stringify({ ownerIdentity: identity, linkId: '1', externalId: 'backoff-id', amount: 4, currency: 'EUR' }),
    );
    const pollPayment = jest.fn().mockResolvedValue('Pending');
    const view = renderPos(buildOcp({ pollPayment }));

    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(pollPayment).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(1999);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(pollPayment).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(pollPayment).toHaveBeenCalledTimes(2);

    await act(async () => {
      jest.advanceTimersByTime(2699);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(pollPayment).toHaveBeenCalledTimes(2);
    await act(async () => {
      jest.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(pollPayment).toHaveBeenCalledTimes(3);

    view.unmount();
    jest.useRealTimers();
  });


  it('keeps an ambiguous charge locked when the reconciliation refresh fails', async () => {
    const loadLinks = jest.fn().mockResolvedValue(null);
    const charge = jest.fn().mockRejectedValue(new ApiException(500, 'busy'));
    const ocp = buildOcp({ charge, loadLinks });
    renderPos(ocp);

    fireEvent.change(amountField(), { target: { value: '8' } });
    fireEvent.click(chargeButton());
    await waitFor(() => expect(loadLinks).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId('ocp-pos-ambiguous-charge')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('0.00')).not.toBeInTheDocument();
    expect(charge).toHaveBeenCalledTimes(1);

    expect(screen.queryByRole('button', { name: /^(charge|kassieren)$/i })).not.toBeInTheDocument();
    expect(charge).toHaveBeenCalledTimes(1);
  });

  it('offers payment-link review while an ambiguous charge is locked', () => {
    const identity = JSON.stringify(['account-A', 'wallet-A']);
    sessionStorage.setItem(
      `ocp-pos-ambiguous-charge:${identity}`,
      JSON.stringify({ ownerIdentity: identity, linkId: '1', externalId: 'review-id', amount: 4, currency: 'EUR' }),
    );
    const go = jest.fn();
    render(createElement(LanguageProvider, null, createElement(PosView, { ocp: buildOcp(), go })));
    fireEvent.click(screen.getByRole('button', { name: /review payment links/i }));
    expect(go).toHaveBeenCalledWith('links');
    expect(screen.queryByRole('button', { name: /^(charge|kassieren)$/i })).not.toBeInTheDocument();
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
    expect(screen.getByTestId('ocp-pos-ambiguous-charge')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(charge|kassieren)$/i })).not.toBeInTheDocument();
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
          { id: 10, active: true, currency: { name: 'EUR' } },
          { id: 11, active: true, currency: { name: 'USD' } },
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
    expect(await screen.findByText(/payment is still open|zahlung ist noch offen|un pagamento è ancora aperto|paiement est toujours ouvert/i)).toBeInTheDocument();
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
    const activeTill = { id: 22, label: 'Active till', status: 'Active', routeId: 11 };
    const completedLink = { ...link, payment: { ...link.payment, status: 'Completed' } };
    const sellRoutes = [
      { id: 10, active: false, currency: { name: 'EUR' } },
      { id: 11, active: true, currency: { name: 'CHF' } },
    ];
    const ocp = buildOcp({
      links: [link, activeTill] as never,
      sellRoutes: sellRoutes as never,
      pollPayment: jest.fn().mockResolvedValue('Completed'),
      loadLinks: jest.fn().mockResolvedValue([completedLink, activeTill]),
    });
    const view = renderPos(ocp);

    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(ocp.loadLinks).toHaveBeenCalledTimes(1);

    view.rerender(createElement(LanguageProvider, null, createElement(PosView, { ocp: { ...ocp, links: [completedLink, activeTill] as never }, go: jest.fn() })));
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
    const activeTill = { id: 23, label: 'Active till', status: 'Active', routeId: 11 };
    const expiredLink = { ...link, payment: { ...link.payment, status: 'Expired' } };
    const ocp = buildOcp({
      links: [link, activeTill] as never,
      sellRoutes: [
        { id: 10, active: false, currency: { name: 'EUR' } },
        { id: 11, active: true, currency: { name: 'CHF' } },
      ] as never,
      pollPayment: jest.fn().mockResolvedValue('Expired'),
      loadLinks: jest.fn().mockResolvedValue([expiredLink, activeTill]),
    });
    const view = renderPos(ocp);

    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });
    view.rerender(createElement(LanguageProvider, null, createElement(PosView, { ocp: { ...ocp, links: [expiredLink, activeTill] as never }, go: jest.fn() })));
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

  it('ignores a prior-account charge success after switching account with the same wallet', async () => {
    let resolveCharge!: (result: { lnurl: string; externalId: string }) => void;
    const charge = jest.fn(
      () => new Promise<{ lnurl: string; externalId: string }>((resolve) => {
        resolveCharge = resolve;
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
      resolveCharge({ lnurl: 'LNURL1PRIORACCOUNT', externalId: 'prior-account-charge' });
      await Promise.resolve();
    });

    expect(document.querySelector('.qrcard')).not.toBeTruthy();
    expect(screen.queryByText(/prior account/i)).not.toBeInTheDocument();
    expect(chargeButton()).not.toBeDisabled();
    expect(otherAccount.pollPayment).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('ocp-pos-ambiguous-charge:["account-A","wallet-A"]')).not.toBeNull();
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
    expect(pollPayment).toHaveBeenCalledWith('1', (ocp.charge as jest.Mock).mock.calls[0][2]);

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
