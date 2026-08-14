const mockNavigate = jest.fn();
const mockProbe = jest.fn();
const mockEnableDemo = jest.fn();
const mockDisableDemo = jest.fn();
const mockCopy = jest.fn();
const mockCreateIssue = jest.fn();
const mockGetProfile = jest.fn();
const mockUpdateMail = jest.fn();
const mockSession = { isLoggedIn: false };
const mockSearch = { params: new URLSearchParams() };
const mockUser: { mail?: string } = { mail: 'a@b.c' };
const mockOcp = {
  active: null as boolean | null,
  demo: false,
  probeError: null as string | null,
  config: { accessKey: '' } as { accessKey?: string },
  probe: mockProbe,
  enableDemo: mockEnableDemo,
  disableDemo: mockDisableDemo,
  copy: mockCopy,
};

jest.mock('@dfx.swiss/react', () => ({
  ApiException: class ApiException extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  SupportIssueReason: { OTHER: 'Other' },
  SupportIssueType: { PARTNERSHIP_REQUEST: 'PartnershipRequest' },
  useSupportChat: () => ({ createIssue: mockCreateIssue }),
  useUser: () => ({ getProfile: mockGetProfile }),
  useUserContext: () => ({ user: mockUser, updateMail: mockUpdateMail }),
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [mockSearch.params, jest.fn()],
}));

jest.mock('../wallets/session', () => ({
  useWalletSession: () => mockSession,
}));

jest.mock('../screens/ocp/useOcp', () => ({
  useOcp: () => mockOcp,
}));

jest.mock('../screens/ocp/config', () => ({ __esModule: true, default: () => <div>config</div> }));
jest.mock('../screens/ocp/history', () => ({ __esModule: true, default: () => <div>history</div> }));
jest.mock('../screens/ocp/invoice', () => ({ __esModule: true, default: () => <div>invoice</div> }));
jest.mock('../screens/ocp/links', () => ({ __esModule: true, default: () => <div>links</div> }));
jest.mock('../screens/ocp/pos', () => ({ __esModule: true, default: () => <div>pos</div> }));
jest.mock('../screens/ocp/routes', () => ({ __esModule: true, default: () => <div>routes</div> }));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import OcpScreen from '../screens/ocp/OcpScreen';
import { LanguageProvider } from '../i18n';
import { ToastProvider } from '../components/ui';

function renderOcp() {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <OcpScreen />
      </ToastProvider>
    </LanguageProvider>,
  );
}

describe('OcpScreen', () => {
  beforeEach(() => {
    mockSession.isLoggedIn = false;
    mockOcp.active = null;
    mockOcp.demo = false;
    mockOcp.probeError = null;
    mockOcp.config = { accessKey: '' };
    mockSearch.params = new URLSearchParams();
    mockNavigate.mockReset();
    mockProbe.mockReset();
    mockEnableDemo.mockReset();
    mockDisableDemo.mockReset();
    mockCopy.mockReset();
    mockCreateIssue.mockReset();
    mockCreateIssue.mockResolvedValue({ uid: 'iss-1' });
    mockGetProfile.mockReset();
    mockGetProfile.mockResolvedValue({ firstName: 'Ada', lastName: 'Lovelace' });
    mockUpdateMail.mockReset();
    mockUpdateMail.mockResolvedValue(undefined);
    mockUser.mail = 'a@b.c';
  });

  it('asks a logged-out visitor to connect', () => {
    renderOcp();
    expect(screen.getByRole('heading', { name: 'OpenCryptoPay' })).toBeInTheDocument();
  });

  it('probes while activation is unknown', () => {
    mockSession.isLoggedIn = true;
    mockOcp.active = null;
    renderOcp();
    expect(mockProbe).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/account');
  });

  it('shows the inactive hub apply CTA and demo toggle', () => {
    mockSession.isLoggedIn = true;
    mockOcp.active = false;
    renderOcp();
    fireEvent.click(screen.getByRole('button', { name: /apply for opencryptopay/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/ocp?sub=apply');
    fireEvent.click(screen.getByRole('button', { name: /try a live demo|live-demo|prova una demo|essayer une démo/i }));
    expect(mockEnableDemo).toHaveBeenCalled();
  });

  it('shows the active hub, copies the access key and opens a tile', () => {
    mockSession.isLoggedIn = true;
    mockOcp.active = true;
    mockOcp.demo = true;
    mockOcp.config = { accessKey: 'ocp_key_1' };
    renderOcp();
    fireEvent.click(screen.getByRole('button', { name: 'Copied' }));
    expect(mockCopy).toHaveBeenCalledWith('ocp_key_1');
    fireEvent.click(screen.getAllByRole('button').find((b) => /link/i.test(b.textContent ?? '')) as HTMLElement);
    expect(mockNavigate).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /demo mode is on|demo-modus ist an/i }));
    expect(mockDisableDemo).toHaveBeenCalled();
  });

  it('retries a probe error and renders gated sub-views', () => {
    mockSession.isLoggedIn = true;
    mockOcp.active = false;
    mockOcp.probeError = 'down';
    mockSearch.params = new URLSearchParams('sub=routes');
    renderOcp();
    fireEvent.click(screen.getByRole('button', { name: /retry|erneut|riprova|réessayer/i }));
    expect(mockProbe).toHaveBeenCalled();
  });

  it('renders a gated sub-view when the merchant is active', () => {
    mockSession.isLoggedIn = true;
    mockOcp.active = true;
    mockSearch.params = new URLSearchParams('sub=invoice');
    renderOcp();
    expect(screen.getByText('invoice')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/ocp');
  });

  it('submits an apply form', async () => {
    mockSession.isLoggedIn = true;
    mockSearch.params = new URLSearchParams('sub=apply');
    renderOcp();
    fireEvent.change(screen.getByLabelText('Business name'), { target: { value: 'Cafe' } });
    fireEvent.change(screen.getByLabelText('Contact name'), { target: { value: 'Ada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));
    await waitFor(() => expect(mockCreateIssue).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('iss-1')).toBeInTheDocument());
  });

  it('falls back to the hub for an unknown sub and a gated view before activation', () => {
    mockSession.isLoggedIn = true;
    mockOcp.active = false;
    mockSearch.params = new URLSearchParams('sub=not-a-view');
    const unknown = renderOcp();
    expect(screen.getByRole('heading', { level: 2, name: 'OpenCryptoPay' })).toBeInTheDocument();
    unknown.unmount();

    mockSearch.params = new URLSearchParams('sub=history');
    renderOcp();
    expect(mockNavigate).toHaveBeenCalledWith('/ocp');
  });

  it('shows the spinner while a gated sub waits for the probe', () => {
    mockSession.isLoggedIn = true;
    mockOcp.active = null;
    mockSearch.params = new URLSearchParams('sub=history');
    renderOcp();
    expect(document.querySelector('.spin')).toBeTruthy();
    expect(mockProbe).toHaveBeenCalled();
  });

  it('renders the remaining gated sub-views and the hub without an access key', () => {
    mockSession.isLoggedIn = true;
    mockOcp.active = true;
    mockOcp.config = {};
    for (const sub of ['routes', 'links', 'pos', 'history', 'config'] as const) {
      mockSearch.params = new URLSearchParams(`sub=${sub}`);
      const view = renderOcp();
      expect(screen.getByText(sub)).toBeInTheDocument();
      view.unmount();
    }
    mockSearch.params = new URLSearchParams();
    renderOcp();
    expect(screen.queryByLabelText('Copied')).not.toBeInTheDocument();
  });

  it('ignores an empty apply submit, then sends website and about', async () => {
    mockSession.isLoggedIn = true;
    mockSearch.params = new URLSearchParams('sub=apply');
    renderOcp();
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));
    expect(mockCreateIssue).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Business name'), { target: { value: '  Shop  ' } });
    fireEvent.change(screen.getByLabelText('Contact name'), { target: { value: '  Ada  ' } });
    fireEvent.change(screen.getByLabelText(/website|webseite|sito|site/i), { target: { value: 'https://shop.example' } });
    fireEvent.change(screen.getByLabelText(/sell|verkaufst|vendi|vendez/i), { target: { value: 'coffee' } });
    fireEvent.change(screen.getByLabelText(/type|typ|tipo|type/i), { target: { value: 'Physical' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));
    await waitFor(() => expect(mockCreateIssue).toHaveBeenCalled());
    const message = mockCreateIssue.mock.calls[0][0].message as string;
    expect(message).toContain('Website: https://shop.example');
    expect(message).toContain('coffee');
    expect(message).toContain('Type: Physical');
  });

  it('keeps a typed contact name when the profile arrives later', async () => {
    mockSession.isLoggedIn = true;
    mockSearch.params = new URLSearchParams('sub=apply');
    let resolveProfile!: (value: { firstName: string; lastName: string }) => void;
    mockGetProfile.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveProfile = resolve;
      }),
    );
    renderOcp();
    fireEvent.change(screen.getByLabelText('Contact name'), { target: { value: 'Typed' } });
    await waitFor(() => expect(mockGetProfile).toHaveBeenCalled());
    await act(async () => {
      resolveProfile({ firstName: 'Ada', lastName: 'Lovelace' });
    });
    expect(screen.getByLabelText('Contact name')).toHaveValue('Typed');
  });

  it('swallows a profile load error and an empty profile', async () => {
    mockSession.isLoggedIn = true;
    mockSearch.params = new URLSearchParams('sub=apply');
    mockGetProfile.mockRejectedValueOnce(new Error('down'));
    const first = renderOcp();
    await waitFor(() => expect(mockGetProfile).toHaveBeenCalled());
    expect(screen.getByLabelText('Contact name')).toHaveValue('');
    first.unmount();

    mockGetProfile.mockResolvedValueOnce({ firstName: '', lastName: '' });
    const empty = renderOcp();
    await waitFor(() => expect(mockGetProfile).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Contact name')).toHaveValue('');
    empty.unmount();

    mockGetProfile.mockResolvedValueOnce({ firstName: 'Ada', lastName: 'Lovelace' });
    renderOcp();
    await waitFor(() => expect(screen.getByLabelText('Contact name')).toHaveValue('Ada Lovelace'));
  });

  it('cancels an in-flight profile fill when the apply view unmounts', async () => {
    mockSession.isLoggedIn = true;
    mockSearch.params = new URLSearchParams('sub=apply');
    let resolveProfile!: (value: { firstName: string }) => void;
    mockGetProfile.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveProfile = resolve;
      }),
    );
    const view = renderOcp();
    await waitFor(() => expect(mockGetProfile).toHaveBeenCalled());
    view.unmount();
    await act(async () => {
      resolveProfile({ firstName: 'Ada' });
    });
  });

  it('registers a missing email and maps 409 plus a generic mail error', async () => {
    mockSession.isLoggedIn = true;
    mockUser.mail = undefined;
    mockSearch.params = new URLSearchParams('sub=apply');
    const view = renderOcp();
    fireEvent.change(screen.getByLabelText('Business name'), { target: { value: 'Cafe' } });
    fireEvent.change(screen.getByLabelText('Contact name'), { target: { value: 'Ada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));
    expect(await screen.findByText(/add an email|gib eine e-mail|aggiungi un'email|ajoute un e-mail/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('you@email.com'), { target: { value: 'new@example.com' } });
    mockUpdateMail.mockRejectedValueOnce(new (jest.requireMock('@dfx.swiss/react').ApiException)(409, 'taken'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));
    expect(await screen.findByText(/already|bereits|già|déjà|taken|verwendet/i)).toBeInTheDocument();
    view.unmount();

    mockUpdateMail.mockRejectedValueOnce(new Error('down'));
    const again = renderOcp();
    fireEvent.change(screen.getByLabelText('Business name'), { target: { value: 'Cafe' } });
    fireEvent.change(screen.getByLabelText('Contact name'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByPlaceholderText('you@email.com'), { target: { value: 'new@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));
    expect(await screen.findByText(/could not send the code|code konnte nicht|impossibile inviare|impossible d'envoyer/i)).toBeInTheDocument();
    again.unmount();
  });

  it('surfaces apply failures with and without a message and ignores a second submit', async () => {
    mockSession.isLoggedIn = true;
    mockSearch.params = new URLSearchParams('sub=apply');
    mockCreateIssue.mockRejectedValueOnce(new Error('nope'));
    const view = renderOcp();
    fireEvent.change(screen.getByLabelText('Business name'), { target: { value: 'Cafe' } });
    fireEvent.change(screen.getByLabelText('Contact name'), { target: { value: 'Ada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));
    expect(await screen.findByText(/nope/)).toBeInTheDocument();
    view.unmount();

    mockCreateIssue.mockRejectedValueOnce('plain');
    const again = renderOcp();
    fireEvent.change(screen.getByLabelText('Business name'), { target: { value: 'Cafe' } });
    fireEvent.change(screen.getByLabelText('Contact name'), { target: { value: 'Ada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));
    expect(await screen.findByText(/something went wrong|schiefgelaufen|storto|produite/i)).toBeInTheDocument();
    again.unmount();

    mockCreateIssue.mockReset();
    let releaseApply!: () => void;
    mockCreateIssue.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseApply = () => resolve({});
        }),
    );
    renderOcp();
    fireEvent.change(screen.getByLabelText('Business name'), { target: { value: 'Cafe' } });
    fireEvent.change(screen.getByLabelText('Contact name'), { target: { value: 'Ada' } });
    const apply = screen.getByRole('button', { name: 'Submit application' }) as HTMLButtonElement;
    fireEvent.click(apply);
    await waitFor(() => expect(mockCreateIssue).toHaveBeenCalledTimes(1));
    apply.disabled = false;
    fireEvent.click(apply);
    expect(mockCreateIssue).toHaveBeenCalledTimes(1);
    await act(async () => {
      releaseApply();
    });
  });

  it('drops a profile prefill after the apply view unmounts', async () => {
    mockSession.isLoggedIn = true;
    mockSearch.params = new URLSearchParams('sub=apply');
    let resolveProfile: (value: { firstName: string; lastName: string }) => void = () => undefined;
    mockGetProfile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveProfile = resolve;
        }),
    );
    const view = renderOcp();
    view.unmount();
    await act(async () => {
      resolveProfile({ firstName: 'Ada', lastName: 'Lovelace' });
      await Promise.resolve();
    });
  });
});
