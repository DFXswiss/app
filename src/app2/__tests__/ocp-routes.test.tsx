const mockToggle = jest.fn();
const mockCreate = jest.fn();
const mockCopy = jest.fn();
const mockLoad = jest.fn();
const mockCurrencies = {
  currencies: [
    { id: 1, name: 'CHF', sellable: true },
    { id: 2, name: 'EUR', sellable: false },
  ],
};
const mockUser: { user: { currency?: { name: string }; kyc?: { level: number } } | undefined } = {
  user: { currency: { name: 'CHF' }, kyc: { level: 10 } },
};
const mockSession = { blockchains: ['Lightning', 'Bitcoin'] };

jest.mock('@dfx.swiss/react', () => ({
  ApiException: class ApiException extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  Blockchain: { LIGHTNING: 'Lightning', BITCOIN: 'Bitcoin' },
  useSell: () => mockCurrencies,
  useUserContext: () => mockUser,
}));

jest.mock('../wallets/session', () => ({
  useWalletSession: () => mockSession,
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiException } from '@dfx.swiss/react';
import RoutesView from '../screens/ocp/routes';
import { LanguageProvider } from '../i18n';
import { ToastProvider } from '../components/ui';

function renderRoutes(ocp: Record<string, unknown>) {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <RoutesView ocp={ocp as never} go={jest.fn()} />
      </ToastProvider>
    </LanguageProvider>,
  );
}

describe('OCP routes view', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockToggle.mockResolvedValue(undefined);
    mockCreate.mockResolvedValue(undefined);
    mockUser.user = { currency: { name: 'CHF' }, kyc: { level: 10 } };
    mockSession.blockchains = ['Lightning', 'Bitcoin'];
    mockCurrencies.currencies = [
      { id: 1, name: 'CHF', sellable: true },
      { id: 2, name: 'EUR', sellable: false },
    ];
  });

  it('loads when routes are null and retries after an error', () => {
    renderRoutes({ routes: null, routesError: false, loadRoutes: mockLoad, lightningReady: true });
    expect(mockLoad).toHaveBeenCalled();

    renderRoutes({
      routes: { sell: [], buy: [], swap: [] },
      routesError: true,
      loadRoutes: mockLoad,
      lightningReady: false,
    });
    fireEvent.click(screen.getByRole('button', { name: /retry|erneut|riprova|réessayer/i }));
    expect(mockLoad).toHaveBeenCalledTimes(2);
  });

  it('lists buy/sell/swap rows, copies, toggles and creates a route', async () => {
    const ocp = {
      routes: {
        sell: [
          {
            id: 201,
            active: true,
            currency: { name: 'CHF' },
            iban: 'CH9300762011623852957',
            deposit: { address: 'ln1abc', blockchains: ['Lightning'] },
            volume: 10,
            fee: 0.9,
          },
        ],
        buy: [
          {
            id: 188,
            active: false,
            asset: { name: 'BTC' },
            iban: 'CH9300762011623852957',
            bankUsage: 'REF',
            volume: 8,
            fee: 1,
          },
        ],
        swap: [
          {
            id: 77,
            active: true,
            asset: { name: 'ETH' },
            deposit: { address: '0xabc', blockchains: ['Ethereum'] },
            volume: 1,
            fee: 0.5,
          },
        ],
      },
      routesError: false,
      loadRoutes: mockLoad,
      toggleRoute: mockToggle,
      createRoute: mockCreate,
      copy: mockCopy,
      lightningReady: true,
    };
    renderRoutes(ocp);

    fireEvent.click(screen.getAllByRole('button', { name: /copied|kopiert|copiato|copié/i })[0]);
    expect(mockCopy).toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: 'Deactivate' })[0]);
    await waitFor(() => expect(mockToggle).toHaveBeenCalledWith('sell', 201, false));

    mockToggle.mockRejectedValueOnce(new Error('down'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Activate' })[0]);
    await waitFor(() => expect(mockToggle).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: /create route/i }));
    expect(screen.getByText(/invalid iban/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/payout iban/i), { target: { value: 'CH93 0076 2011 6238 5295 7' } });
    fireEvent.change(screen.getByLabelText(/payout currency|auszahlungswährung|valuta|devise/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/receive network/i), { target: { value: 'Bitcoin' } });
    fireEvent.click(screen.getByRole('button', { name: /create route/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /create route/i })).not.toBeDisabled());
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ currencyId: '1', blockchain: 'Bitcoin' }));

    mockCreate.mockRejectedValueOnce(new ApiException(400, 'iban-no'));
    fireEvent.change(screen.getByLabelText(/payout iban/i), { target: { value: 'CH93 0076 2011 6238 5295 7' } });
    fireEvent.click(screen.getByRole('button', { name: /create route/i }));
    await waitFor(() => expect(screen.getByText(/iban-no/)).toBeInTheDocument());

    mockCreate.mockRejectedValueOnce(new Error('x'));
    fireEvent.change(screen.getByLabelText(/payout iban/i), { target: { value: 'CH93 0076 2011 6238 5295 7' } });
    fireEvent.click(screen.getByRole('button', { name: /create route/i }));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(3));
  });

  it('ignores a second create while the first is in flight', async () => {
    let release!: () => void;
    mockCreate.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    renderRoutes({
      routes: { sell: [], buy: [], swap: [] },
      routesError: false,
      loadRoutes: mockLoad,
      createRoute: mockCreate,
      lightningReady: true,
    });
    fireEvent.change(screen.getByLabelText(/payout iban/i), { target: { value: 'CH93 0076 2011 6238 5295 7' } });
    const create = screen.getByRole('button', { name: /create route/i }) as HTMLButtonElement;
    fireEvent.click(create);
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    create.disabled = false;
    fireEvent.click(create);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    await act(async () => {
      release();
    });
  });

  it('preselects a non-Lightning chain when Lightning is missing', () => {
    mockSession.blockchains = ['Bitcoin'];
    mockUser.user = undefined;
    mockCurrencies.currencies = [{ name: 'USD', sellable: true } as never];
    renderRoutes({
      routes: { sell: [], buy: [], swap: [] },
      routesError: false,
      loadRoutes: mockLoad,
      lightningReady: false,
      createRoute: mockCreate,
    });
    expect(screen.getByLabelText(/receive network/i)).toHaveValue('Bitcoin');
  });

  it('keeps route creation disabled until a sellable currency is available', () => {
    mockCurrencies.currencies = undefined as never;
    mockSession.blockchains = ['Lightning'];
    renderRoutes({
      routes: { sell: [], buy: [], swap: [] },
      routesError: false,
      loadRoutes: mockLoad,
      createRoute: mockCreate,
      lightningReady: false,
    });

    const create = screen.getByRole('button', { name: /create route/i });
    expect(create).toBeDisabled();
    fireEvent.click(create);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('keeps route creation disabled until a payout network is available', () => {
    mockSession.blockchains = undefined as never;
    renderRoutes({
      routes: { sell: [], buy: [], swap: [] },
      routesError: false,
      loadRoutes: mockLoad,
      createRoute: mockCreate,
      lightningReady: false,
    });

    const create = screen.getByRole('button', { name: /create route/i });
    expect(create).toBeDisabled();
    fireEvent.click(create);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('does not submit if a currency or payout network is unavailable when the handler runs', async () => {
    // The API DTO type requires numeric ids, but a malformed empty id would otherwise match the
    // empty select state and let the form submit without a concrete payout currency.
    mockCurrencies.currencies = [{ id: '' as never, name: 'CHF', sellable: true }];
    mockSession.blockchains = ['Lightning'];
    const noCurrency = renderRoutes({
      routes: { sell: [], buy: [], swap: [] },
      routesError: false,
      loadRoutes: mockLoad,
      createRoute: mockCreate,
      lightningReady: true,
    });
    fireEvent.change(screen.getByLabelText(/payout iban/i), { target: { value: 'CH93 0076 2011 6238 5295 7' } });
    const currencyGuardButton = screen.getByRole('button', { name: /create route/i }) as HTMLButtonElement;
    expect(currencyGuardButton).toBeDisabled();
    const invokeReactClickHandler = async (button: HTMLButtonElement) => {
      const reactPropsKey = Object.keys(button).find((key) => key.startsWith('__reactProps$'));
      const onClick = reactPropsKey
        ? (button as unknown as Record<string, { onClick?: () => void | Promise<void> }>)[reactPropsKey]?.onClick
        : undefined;
      expect(onClick).toBeDefined();
      await act(async () => {
        await onClick?.();
      });
    };
    await invokeReactClickHandler(currencyGuardButton);
    expect(mockCreate).not.toHaveBeenCalled();
    noCurrency.unmount();

    mockCurrencies.currencies = [{ id: 1, name: 'CHF', sellable: true }];
    mockSession.blockchains = [];
    renderRoutes({
      routes: { sell: [], buy: [], swap: [] },
      routesError: false,
      loadRoutes: mockLoad,
      createRoute: mockCreate,
      lightningReady: false,
    });
    await waitFor(() => expect(screen.getByLabelText(/payout currency/i)).toHaveValue('1'));
    fireEvent.change(screen.getByLabelText(/payout iban/i), { target: { value: 'CH93 0076 2011 6238 5295 7' } });
    const chainGuardButton = screen.getByRole('button', { name: /create route/i }) as HTMLButtonElement;
    expect(chainGuardButton).toBeDisabled();
    await invokeReactClickHandler(chainGuardButton);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('shows the empty list, a KYC warning and sparse route rows', () => {
    mockUser.user = { kyc: { level: 10 } };
    mockSession.blockchains = undefined as never;
    mockCurrencies.currencies = undefined as never;
    renderRoutes({
      routes: {
        sell: [{ id: 1, active: false }],
        buy: [{ id: 2, active: true }],
        swap: [{ id: 3, active: false, deposit: { address: '0xabc' } }, { id: 4, active: true }],
      },
      routesError: false,
      loadRoutes: mockLoad,
      lightningReady: false,
      toggleRoute: mockToggle,
      createRoute: mockCreate,
      copy: mockCopy,
    });
    expect(screen.getByText(/verify your identity|verifizieren \(kyc\)|verificare la tua|vérifier ton identité/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/receive network/i).textContent).toMatch(/—/);
    expect(screen.getAllByRole('button', { name: /activate|aktivieren|attiva|activer/i }).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText(/payout iban/i), { target: { value: 'CH93 0076 2011 6238 5295 7' } });
    fireEvent.click(screen.getByRole('button', { name: /create route/i }));
  });

  it('ignores a second create while one is in flight', async () => {
    let resolveCreate!: () => void;
    mockCreate.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    renderRoutes({
      routes: { sell: [], buy: [], swap: [] },
      routesError: false,
      loadRoutes: mockLoad,
      lightningReady: true,
      createRoute: mockCreate,
    });
    fireEvent.change(screen.getByLabelText(/payout iban/i), { target: { value: 'CH93 0076 2011 6238 5295 7' } });
    fireEvent.click(screen.getByRole('button', { name: /create route/i }));
    const createBtn = screen.getByRole('button', { name: /create route/i }) as HTMLButtonElement;
    createBtn.disabled = false;
    fireEvent.click(createBtn);
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    await act(async () => {
      resolveCreate();
    });
  });
});
