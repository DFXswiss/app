import { TextEncoder } from 'util';

(global as { TextEncoder: typeof TextEncoder }).TextEncoder = TextEncoder;

const mockCreate = jest.fn();
const mockToggle = jest.fn();
const mockCopy = jest.fn();
const mockPos = jest.fn();
const mockLoadLinks = jest.fn();
const mockLoadRoutes = jest.fn();
const mockGo = jest.fn();
const mockPopup: { opener: Window | null; location: { replace: jest.Mock }; close: jest.Mock } = {
  opener: window,
  location: { replace: jest.fn() },
  close: jest.fn(),
};

jest.mock('@dfx.swiss/react', () => ({
  ApiException: class ApiException extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  PaymentLinkStatus: { ACTIVE: 'Active', INACTIVE: 'Inactive' },
  Blockchain: { LIGHTNING: 'Lightning' },
}));

jest.mock('react-qr-code', () => ({
  __esModule: true,
  default: () => <div data-testid="qr" />,
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiException } from '@dfx.swiss/react';
import LinksView from '../screens/ocp/links';
import { LanguageProvider } from '../i18n';
import { ToastProvider } from '../components/ui';

function renderLinks(ocp: Record<string, unknown>) {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <LinksView ocp={ocp as never} go={mockGo} />
      </ToastProvider>
    </LanguageProvider>,
  );
}

describe('OCP links view', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue(undefined);
    mockToggle.mockResolvedValue(undefined);
    mockPos.mockResolvedValue('https://app.dfx.swiss/pos/1');
    mockPopup.opener = window;
    mockPopup.location.replace.mockReset();
    mockPopup.close.mockReset();
    jest.spyOn(window, 'open').mockImplementation(() => mockPopup as unknown as Window);
  });

  afterEach(() => {
    (window.open as jest.Mock).mockRestore();
  });

  it('loads while links are null and shows the empty state', () => {
    renderLinks({
      links: null,
      routes: null,
      lnSellRoutes: [],
      loadLinks: mockLoadLinks,
      loadRoutes: mockLoadRoutes,
    });
    expect(mockLoadLinks).toHaveBeenCalled();
    expect(mockLoadRoutes).toHaveBeenCalled();

    renderLinks({
      links: [],
      linksError: false,
      routes: { sell: [], buy: [], swap: [] },
      lnSellRoutes: [],
      loadLinks: mockLoadLinks,
      loadRoutes: mockLoadRoutes,
    });
    expect(screen.getByText(/no payment links|keine|nessun|aucun/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry|erneut|riprova|réessayer/i })).not.toBeInTheDocument();
  });

  it('shows a load error instead of the empty list when the request failed', () => {
    renderLinks({
      links: [],
      linksError: true,
      routes: { sell: [], buy: [], swap: [] },
      lnSellRoutes: [],
      loadLinks: mockLoadLinks,
      loadRoutes: mockLoadRoutes,
    });
    expect(
      screen.getByText(/couldn't load|konnte nicht laden|impossibile caricare|chargement impossible/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/no payment links yet|noch keine zahlungslinks|ancora nessun link|aucun lien de paiement/i),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry|erneut|riprova|réessayer/i }));
    expect(mockLoadLinks).toHaveBeenCalled();
  });

  it('lists a link, copies, toggles, opens POS and creates', async () => {
    const ocp = {
      links: [
        {
          id: 301,
          label: 'Front',
          routeId: 201,
          status: 'Active',
          lnurl: 'LNURL1DEMOFRONTCOUNTERXXXX',
          externalId: 'till-1',
          payment: { amount: 5, currency: 'CHF', status: 'Completed' },
        },
        { id: 302, status: 'Inactive', routeId: 201 },
      ],
      routes: { sell: [{ id: 201 }], buy: [], swap: [] },
      lnSellRoutes: [{ id: 201 }],
      loadLinks: mockLoadLinks,
      loadRoutes: mockLoadRoutes,
      createLink: mockCreate,
      toggleLink: mockToggle,
      createPosLink: mockPos,
      copy: mockCopy,
      demo: false,
    };
    renderLinks(ocp);

    fireEvent.click(screen.getAllByRole('button', { name: /copy lnurl/i })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: /copy lnurl/i })[1]);
    expect(mockCopy).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(mockToggle).toHaveBeenCalledWith(301, false));

    mockToggle.mockRejectedValueOnce(new Error('down'));
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));
    await waitFor(() => expect(mockToggle).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getAllByRole('button', { name: /open pos/i })[0]);
    await waitFor(() => expect(mockPopup.location.replace).toHaveBeenCalledWith('https://app.dfx.swiss/pos/1'));
    expect(window.open).toHaveBeenCalledWith('about:blank', '_blank');
    expect(mockPopup.opener).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Create payment link' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create payment link' })).not.toBeDisabled());
    expect(mockCreate).toHaveBeenCalledWith(201);

    mockCreate.mockRejectedValueOnce(new ApiException(400, 'nope'));
    fireEvent.click(screen.getByRole('button', { name: 'Create payment link' }));
    await waitFor(() => expect(screen.getByText(/nope/)).toBeInTheDocument());

    mockCreate.mockRejectedValueOnce(new Error('x'));
    fireEvent.click(screen.getByRole('button', { name: 'Create payment link' }));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(3));
  });

  it('opens the in-app POS in demo mode', async () => {
    renderLinks({
      links: [{ id: 1, status: 'Active', routeId: 1, lnurl: 'LNURL1X' }],
      routes: { sell: [{ id: 1 }], buy: [], swap: [] },
      lnSellRoutes: [{ id: 1 }],
      loadLinks: mockLoadLinks,
      loadRoutes: mockLoadRoutes,
      createPosLink: mockPos,
      copy: mockCopy,
      demo: true,
    });
    fireEvent.click(screen.getByRole('button', { name: /open pos/i }));
    expect(mockGo).toHaveBeenCalledWith('pos');
  });

  it('reserves the POS tab before waiting for link creation', async () => {
    let resolveLink!: (url: string) => void;
    mockPos.mockReturnValueOnce(new Promise<string>((resolve) => { resolveLink = resolve; }));
    renderLinks({
      links: [{ id: 1, status: 'Active', routeId: 1, lnurl: 'LNURL1X' }],
      routes: { sell: [{ id: 1 }], buy: [], swap: [] },
      lnSellRoutes: [{ id: 1 }],
      loadLinks: mockLoadLinks,
      loadRoutes: mockLoadRoutes,
      createPosLink: mockPos,
      copy: mockCopy,
      demo: false,
    });
    fireEvent.click(screen.getByRole('button', { name: /open pos/i }));

    expect(window.open).toHaveBeenCalledWith('about:blank', '_blank');
    expect(mockPos).toHaveBeenCalledWith(1);
    expect(mockPopup.location.replace).not.toHaveBeenCalled();
    resolveLink('https://app.dfx.swiss/pos/1');
    await waitFor(() => expect(mockPopup.location.replace).toHaveBeenCalledWith('https://app.dfx.swiss/pos/1'));
  });

  it('closes the reserved tab and falls back to the in-app POS when link creation returns no URL', async () => {
    mockPos.mockResolvedValueOnce(undefined);
    renderLinks({
      links: [{ id: 1, status: 'Active', routeId: 1, lnurl: 'LNURL1X' }],
      routes: { sell: [{ id: 1 }], buy: [], swap: [] },
      lnSellRoutes: [{ id: 1 }],
      loadLinks: mockLoadLinks,
      loadRoutes: mockLoadRoutes,
      createPosLink: mockPos,
      copy: mockCopy,
      demo: false,
    });
    fireEvent.click(screen.getByRole('button', { name: /open pos/i }));
    await waitFor(() => expect(mockGo).toHaveBeenCalledWith('pos'));
    expect(window.open).toHaveBeenCalledWith('about:blank', '_blank');
    expect(mockPopup.close).toHaveBeenCalled();
    expect(mockPopup.location.replace).not.toHaveBeenCalled();
  });

  it('closes the reserved tab and reports a POS-link creation failure', async () => {
    mockPos.mockRejectedValueOnce(new Error('create-pos-down'));
    renderLinks({
      links: [{ id: 1, status: 'Active', routeId: 1, lnurl: 'LNURL1X' }],
      routes: { sell: [{ id: 1 }], buy: [], swap: [] },
      lnSellRoutes: [{ id: 1 }],
      loadLinks: mockLoadLinks,
      loadRoutes: mockLoadRoutes,
      createPosLink: mockPos,
      copy: mockCopy,
      demo: false,
    });

    fireEvent.click(screen.getByRole('button', { name: /open pos/i }));

    await waitFor(() => expect(mockPopup.close).toHaveBeenCalled());
    expect(mockPopup.location.replace).not.toHaveBeenCalled();
    expect(screen.getByTestId('app2-toast')).toHaveTextContent(/something went wrong/i);
  });

  it('falls back to in-app POS without creating an external link when the popup is blocked', () => {
    (window.open as jest.Mock).mockReturnValueOnce(null);
    renderLinks({
      links: [{ id: 1, status: 'Active', routeId: 1, lnurl: 'LNURL1X' }],
      routes: { sell: [{ id: 1 }], buy: [], swap: [] },
      lnSellRoutes: [{ id: 1 }],
      loadLinks: mockLoadLinks,
      loadRoutes: mockLoadRoutes,
      createPosLink: mockPos,
      copy: mockCopy,
      demo: false,
    });
    fireEvent.click(screen.getByRole('button', { name: /open pos/i }));
    expect(mockGo).toHaveBeenCalledWith('pos');
    expect(mockPos).not.toHaveBeenCalled();
  });

  it('renders a nameless link and an object-shaped payment currency', () => {
    renderLinks({
      links: [
        {
          id: 9,
          externalId: 'ext-9',
          routeId: 1,
          status: 'Active',
          payment: { amount: 3, currency: {}, status: 'Pending' },
        },
      ],
      routes: { sell: [{ id: 1 }], buy: [], swap: [] },
      lnSellRoutes: [],
      loadLinks: mockLoadLinks,
      loadRoutes: mockLoadRoutes,
      copy: mockCopy,
      demo: false,
    });
    expect(screen.getAllByText(/#9|link 9/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/3/)).toBeInTheDocument();
    const create = screen.getByRole('button', { name: /create payment link/i }) as HTMLButtonElement;
    expect(create).toBeDisabled();
    create.disabled = false;
    fireEvent.click(create);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
