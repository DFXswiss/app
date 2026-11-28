const mockNavigate = jest.fn();
const mockOnLogin = jest.fn();
const mockOnCancel = jest.fn();
const mockOnSwitch = jest.fn();
const mockLogin = jest.fn();
const mockRegister = jest.fn();
const mockCheckPasskeyPlatform = jest.fn();
const mockOpenInSystemBrowser = jest.fn();
const mockDeskProps = jest.fn();

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_namespace: string, text: string, values?: Record<string, string>) =>
      text.replace(/{{(\w+)}}/g, (match, key: string) => values?.[key] ?? match),
  }),
}));

jest.mock('../hooks/navigation.hook', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));

jest.mock(
  '@dfx.swiss/wallet',
  () => ({
    RP_IDS: { prd: 'app.dfx.swiss', dev: 'dev.app.dfx.swiss', stg: 'stg.app.dfx.swiss', loc: 'localhost' },
    checkPasskeyPlatform: (...args: unknown[]) => mockCheckPasskeyPlatform(...args),
    openInSystemBrowser: (...args: unknown[]) => mockOpenInSystemBrowser(...args),
  }),
  { virtual: true },
);

jest.mock('../components/home/wallet/wallet-client', () => ({
  createWalletClient: () => ({ login: () => mockLogin(), register: () => mockRegister() }),
}));

jest.mock('../components/home/wallet/passkey-desk', () => ({
  __esModule: true,
  default: (props: {
    onHome: () => void;
    onCancel: () => void;
    onRevoked: () => void;
    balance?: unknown;
    history?: unknown;
    assets?: unknown;
    receiveError?: unknown;
  }) => {
    mockDeskProps(props);
    return (
      <div data-testid="desk">
        <button type="button" onClick={props.onHome}>
          desk-home
        </button>
        <button
          type="button"
          onClick={() => {
            jest
              .requireActual<typeof import('../components/home/wallet/passkey-session')>(
                '../components/home/wallet/passkey-session',
              )
              .setOpenPasskey(undefined);
            props.onRevoked();
          }}
        >
          desk-revoked
        </button>
      </div>
    );
  },
}));

jest.mock('@dfx.swiss/react-components', () => ({
  StyledVerticalStack: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  StyledButton: ({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {label}
    </button>
  ),
  StyledButtonWidth: { FULL: 'FULL' },
  StyledButtonColor: { GRAY: 'GRAY', RED: 'RED' },
}));

import { RP_IDS } from '@dfx.swiss/wallet';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import ConnectPasskey, { passkeyPlatformBlock, walletEnvForHost } from '../components/home/wallet/connect-passkey';
import {
  PASSKEY_GENERIC_ERROR,
  passkeyDismissed,
  passkeyMessage,
  passkeyOsTooOld,
  passkeyPlatformView,
  passkeyPrfUnsupported,
  passkeyShowIosHint,
  passkeyUnknownCredential,
} from '../components/home/wallet/passkey-host';
import { getOpenPasskey, setOpenPasskey, type OpenPasskey } from '../components/home/wallet/passkey-session';

const READY = { available: true, prf: 'yes' };
const GENERIC = 'Something went wrong. Please try again.';
const PRF = 'This passkey cannot hold a wallet on this device.';
const DID_NOT_UNLOCK = 'This passkey did not unlock the wallet. Please try again with the passkey of this wallet.';

function keys() {
  return { wipe: jest.fn() } as unknown as NonNullable<OpenPasskey['keys']> & { wipe: jest.Mock };
}

function session(ring = keys()): OpenPasskey {
  return { token: 'wallet-token', credentialId: 'cred', keys: ring, bitcoinNetwork: 'regtest' };
}

function namedError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

function renderPasskey() {
  return render(
    <ConnectPasskey
      rootRef={createRef<HTMLDivElement>()}
      wallet={'Passkey' as never}
      isConnect={false}
      onLogin={mockOnLogin}
      onCancel={mockOnCancel}
      onSwitch={mockOnSwitch}
    />,
  );
}

async function renderReady(report: unknown = READY) {
  mockCheckPasskeyPlatform.mockResolvedValue(report);
  const view = renderPasskey();
  await act(async () => undefined);
  return view;
}

async function click(name: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

describe('ConnectPasskey', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setOpenPasskey(undefined);
    mockCheckPasskeyPlatform.mockImplementation(() => new Promise(() => undefined));
  });

  it('shows preparing with Close while the platform check is open', () => {
    renderPasskey();
    expect(screen.getByRole('status')).toHaveTextContent('Preparing your login…');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(mockOnCancel).toHaveBeenCalledTimes(1);
    expect(mockCheckPasskeyPlatform).toHaveBeenCalledWith('loc');
  });

  it('ignores a platform report that arrives after unmount', async () => {
    let resolve: (report: unknown) => void = () => undefined;
    mockCheckPasskeyPlatform.mockReturnValue(new Promise((next) => (resolve = next)));
    const view = renderPasskey();
    view.unmount();
    await act(async () => resolve(READY));
    expect(screen.queryByText('Log in with your device')).not.toBeInTheDocument();
  });

  it('shows the platform block', async () => {
    await renderReady({ available: false, reason: 'no-webauthn', prf: 'unknown' });
    expect(screen.getByText('This browser has no passkey support')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('shows the operating system hint with and without a version', async () => {
    const view = await renderReady({ available: false, reason: 'os-too-old', prf: 'unknown', os: '16.0' });
    expect(screen.getByRole('status')).toHaveTextContent('This operating system (16.0) cannot sign in with a passkey.');
    view.unmount();
    await renderReady({ available: false, reason: 'os-too-old', prf: 'unknown', os: 16 });
    expect(screen.getByRole('status')).toHaveTextContent('This operating system cannot sign in with a passkey.');
  });

  describe('in-app browser card', () => {
    const IN_APP = { available: false, reason: 'in-app-browser', prf: 'unknown' };
    const originalAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const originalExec = Object.getOwnPropertyDescriptor(document, 'execCommand');

    afterEach(() => {
      jest.useRealTimers();
      if (originalAgent) Object.defineProperty(navigator, 'userAgent', originalAgent);
      if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
      else delete (navigator as { clipboard?: unknown }).clipboard;
      if (originalExec) Object.defineProperty(document, 'execCommand', originalExec);
      else delete (document as { execCommand?: unknown }).execCommand;
    });

    function setClipboard(value: unknown): void {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value });
    }

    function setExec(impl: () => boolean): jest.Mock {
      const exec = jest.fn(impl);
      Object.defineProperty(document, 'execCommand', { configurable: true, writable: true, value: exec });
      return exec;
    }

    it('opens the page without its hash in the system browser and hints the iPhone icon', async () => {
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'iPhone Telegram' });
      window.history.pushState({}, '', '/wallet#section');
      await renderReady(IN_APP);
      expect(screen.getByText('Open this page in your browser')).toBeInTheDocument();
      expect(screen.getByText("On iPhone, you'll find the compass or Safari icon at the top right.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Open in browser' }));
      expect(mockOpenInSystemBrowser).toHaveBeenCalledWith(`${window.location.origin}/wallet`);
      window.history.pushState({}, '', '/');
    });

    it('copies the link, shows Copied for 1200 ms and restarts the timer on a second copy', async () => {
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Android Telegram' });
      const writeText = jest.fn().mockResolvedValue(undefined);
      setClipboard({ writeText });
      await renderReady(IN_APP);
      expect(screen.queryByText("On iPhone, you'll find the compass or Safari icon at the top right.")).toBeNull();
      jest.useFakeTimers();
      await click('Copy link');
      expect(writeText).toHaveBeenCalledWith(window.location.href.split('#')[0]);
      expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
      await click('Copied');
      act(() => jest.advanceTimersByTime(1200));
      expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    });

    it('falls back to execCommand without clipboard, after a rejected writeText and keeps the label on failure', async () => {
      setClipboard(undefined);
      const exec = setExec(() => true);
      const view = await renderReady(IN_APP);
      await click('Copy link');
      expect(exec).toHaveBeenCalledWith('copy');
      expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
      expect(document.querySelector('textarea')).toBeNull();
      view.unmount();

      setClipboard({ writeText: jest.fn().mockRejectedValue(new Error('denied')) });
      setExec(() => false);
      const second = await renderReady(IN_APP);
      await click('Copy link');
      expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
      second.unmount();

      setClipboard({});
      setExec(() => {
        throw new Error('exec failed');
      });
      await renderReady(IN_APP);
      await click('Copy link');
      expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    });

    it('clears a pending copied timer on unmount', async () => {
      setClipboard({ writeText: jest.fn().mockResolvedValue(undefined) });
      const view = await renderReady(IN_APP);
      jest.useFakeTimers();
      await click('Copy link');
      view.unmount();
      expect(() => act(() => jest.advanceTimersByTime(1200))).not.toThrow();
    });
  });

  it('logs in and opens the desk with the wallet-api session', async () => {
    const opened = session();
    mockLogin.mockResolvedValue(opened);
    await renderReady();
    expect(screen.getByText('Log in with your device')).toBeInTheDocument();
    await click('Log in');
    expect(getOpenPasskey()).toBe(opened);
    expect(screen.getByTestId('desk')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'desk-home' }));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('passes handbook fixtures to the desk outside production only', async () => {
    window.__dfxHandbookPasskeyBalance = { chf: 1, eur: 2 };
    try {
      setOpenPasskey(session());
      const view = renderPasskey();
      expect(mockDeskProps.mock.calls.at(-1)?.[0].balance).toEqual({ chf: 1, eur: 2 });
      view.unmount();
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        renderPasskey();
        expect(mockDeskProps.mock.calls.at(-1)?.[0].balance).toBeUndefined();
      } finally {
        process.env.NODE_ENV = previous;
      }
    } finally {
      delete window.__dfxHandbookPasskeyBalance;
    }
  });

  it('shows the revoked notice when the desk reports a revocation', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue(READY);
    setOpenPasskey(session());
    renderPasskey();
    await click('desk-revoked');
    expect(screen.getByText('The passkey wallet was revoked.')).toBeInTheDocument();
  });

  it('keeps a session without keys on the login card', async () => {
    mockLogin.mockResolvedValue({ ...session(), keys: undefined });
    await renderReady();
    await click('Log in');
    expect(screen.getByRole('alert')).toHaveTextContent(DID_NOT_UNLOCK);
    expect(getOpenPasskey()).toBeUndefined();
  });

  it('does not replace a session that opened while the login was running', async () => {
    const ring = keys();
    let finish: (value: OpenPasskey) => void = () => undefined;
    mockLogin.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await renderReady();
    await click('Log in');
    const other = { ...session(), token: 'other' };
    await act(async () => {
      setOpenPasskey(other);
      finish(session(ring));
    });
    expect(getOpenPasskey()).toBe(other);
    expect(ring.wipe).toHaveBeenCalledTimes(1);
  });

  it('wipes a login result that arrives after unmount', async () => {
    const ring = keys();
    let finish: (value: OpenPasskey) => void = () => undefined;
    mockLogin.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const view = await renderReady();
    await click('Log in');
    view.unmount();
    await act(async () => finish(session(ring)));
    expect(ring.wipe).toHaveBeenCalledTimes(1);
    expect(getOpenPasskey()).toBeUndefined();
  });

  it('ignores a login error after unmount', async () => {
    let fail: (error: unknown) => void = () => undefined;
    mockLogin.mockReturnValue(new Promise((_resolve, reject) => (fail = reject)));
    const view = await renderReady();
    await click('Log in');
    view.unmount();
    await act(async () => fail(new Error('late')));
    expect(getOpenPasskey()).toBeUndefined();
  });

  it('offers the account choice after a dismissed login and registers without an e-mail', async () => {
    mockLogin.mockRejectedValueOnce(namedError('NotAllowedError'));
    await renderReady();
    await click('Log in');
    expect(screen.getByText('Do you already have an account?')).toBeInTheDocument();
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();

    mockLogin.mockRejectedValueOnce(namedError('AbortError'));
    await click('Log in with existing account');
    expect(screen.getByText('Do you already have an account?')).toBeInTheDocument();

    mockRegister.mockRejectedValueOnce({ code: 'ceremony-cancelled' });
    await click('Open a new account');
    expect(screen.getByText('Do you already have an account?')).toBeInTheDocument();

    const opened = session();
    mockRegister.mockResolvedValueOnce(opened);
    await click('Open a new account');
    expect(mockRegister).toHaveBeenCalledTimes(2);
    expect(getOpenPasskey()).toBe(opened);
  });

  it('shows the unknown card and keeps it after a later dismissed login', async () => {
    mockLogin.mockRejectedValueOnce({ code: 'UnknownCredential' });
    await renderReady();
    await click('Log in');
    expect(screen.getByText('This passkey is not an account')).toBeInTheDocument();
    mockLogin.mockRejectedValueOnce(namedError('NotAllowedError'));
    await click('Try again');
    expect(screen.getByText('This passkey is not an account')).toBeInTheDocument();
    mockRegister.mockResolvedValueOnce(session());
    await click('Open a new account');
    expect(screen.getByTestId('desk')).toBeInTheDocument();
  });

  it('opens the unknown card from the existing-account login', async () => {
    mockLogin.mockRejectedValueOnce(namedError('NotAllowedError')).mockRejectedValueOnce({ message: 'Unknown credential' });
    await renderReady();
    await click('Log in');
    await click('Log in with existing account');
    expect(screen.getByText('This passkey is not an account')).toBeInTheDocument();
  });

  it.each([
    ['login', 'Log in'],
    ['authenticate', 'Log in with existing account'],
    ['register', 'Open a new account'],
  ])('shows the PRF sentence for %s and retries the same ceremony', async (entry, button) => {
    const prf = { code: 'prf-unavailable' };
    mockLogin.mockReset();
    mockRegister.mockReset();
    if (entry === 'login') mockLogin.mockRejectedValueOnce(prf);
    else mockLogin.mockRejectedValueOnce(namedError('NotAllowedError'));
    await renderReady();
    await click('Log in');
    if (entry !== 'login') {
      if (entry === 'authenticate') mockLogin.mockRejectedValueOnce(prf);
      else mockRegister.mockRejectedValueOnce(prf);
      await click(button);
    }
    expect(screen.getByRole('alert')).toHaveTextContent(PRF);
    const opened = session();
    mockLogin.mockResolvedValue(opened);
    mockRegister.mockResolvedValue(opened);
    await click('Try again');
    expect(getOpenPasskey()).toBe(opened);
    if (entry === 'register') expect(mockRegister).toHaveBeenCalledTimes(2);
  });

  it('shows the generic sentence for any other error and for an unknown credential on register', async () => {
    mockLogin.mockRejectedValueOnce(new Error('raw server text'));
    await renderReady();
    await click('Log in');
    expect(screen.getByRole('alert')).toHaveTextContent(GENERIC);
    expect(screen.queryByText('raw server text')).not.toBeInTheDocument();

    mockLogin.mockRejectedValueOnce(namedError('NotAllowedError'));
    await click('Try again');
    mockRegister.mockRejectedValueOnce({ code: 'UnknownCredential' });
    await click('Open a new account');
    expect(screen.getByRole('alert')).toHaveTextContent(GENERIC);
  });
});

describe('passkey platform helpers', () => {
  it('maps the page host onto the wallet environment', () => {
    expect(walletEnvForHost('localhost')).toBe('loc');
    expect(walletEnvForHost('127.0.0.1')).toBe('loc');
    expect(walletEnvForHost('dev.app.dfx.swiss')).toBe('dev');
    expect(String(walletEnvForHost('stg.app.dfx.swiss'))).toBe('stg');
    expect(walletEnvForHost('app.dfx.swiss')).toBe('prd');
    expect(walletEnvForHost('example.test')).toBe('prd');
  });

  it('keeps an older wallet package on the production check for the staging host', () => {
    const ids = RP_IDS as { stg?: string };
    const previous = ids.stg;
    delete ids.stg;
    try {
      expect(walletEnvForHost('stg.app.dfx.swiss')).toBe('prd');
    } finally {
      ids.stg = previous;
    }
  });

  it('explains only an unavailable platform', () => {
    expect(passkeyPlatformBlock(undefined)).toBeUndefined();
    expect(passkeyPlatformBlock({ available: true, prf: 'yes' })).toBeUndefined();
    expect(passkeyPlatformBlock({ available: false, prf: 'unknown' })).toBeUndefined();
    expect(passkeyPlatformBlock({ available: false, reason: 'no-webauthn', prf: 'unknown' })).toBe(
      'This browser has no passkey support',
    );
  });
});

describe('passkey ceremony helpers', () => {
  it('classifies dismissed, unknown, prf and platform reports', () => {
    expect(passkeyDismissed(null)).toBe(false);
    expect(passkeyDismissed('nope')).toBe(false);
    expect(passkeyDismissed(new Error('boom'))).toBe(false);
    expect(passkeyDismissed(namedError('NotAllowedError'))).toBe(true);
    expect(passkeyDismissed(namedError('AbortError'))).toBe(true);
    expect(passkeyDismissed({ code: 'ceremony-cancelled' })).toBe(true);

    expect(passkeyUnknownCredential(null)).toBe(false);
    expect(passkeyUnknownCredential({ message: 'Unknown credential' })).toBe(true);
    expect(passkeyUnknownCredential({ code: 'UNKNOWN CREDENTIAL' })).toBe(true);
    expect(passkeyUnknownCredential({ code: 'UnknownCredential', message: 'nope' })).toBe(true);
    expect(passkeyUnknownCredential({ code: 'unknown' })).toBe(false);
    expect(passkeyUnknownCredential({ message: 1 })).toBe(false);

    expect(passkeyPrfUnsupported(null)).toBe(false);
    expect(passkeyPrfUnsupported({ message: 'no PRF' })).toBe(true);
    expect(passkeyPrfUnsupported({ code: 'prf-unavailable' })).toBe(true);
    expect(passkeyPrfUnsupported({ message: 1 })).toBe(false);

    expect(passkeyOsTooOld(undefined)).toEqual({ key: 'This operating system cannot sign in with a passkey.' });
    expect(passkeyOsTooOld(' 17.0 ')).toEqual({
      key: 'This operating system ({{version}}) cannot sign in with a passkey.',
      version: '17.0',
    });

    expect(passkeyShowIosHint('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe(true);
    expect(passkeyShowIosHint('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(false);

    expect(passkeyPlatformView(undefined)).toBe('pending');
    expect(passkeyPlatformView({ available: true, reason: 'in-app-browser', prf: 'yes' })).toBe('in-app');
    expect(passkeyPlatformView({ available: false, reason: 'os-too-old', prf: 'unknown', os: '16.0' })).toBe('os-old');
    expect(passkeyPlatformView({ available: false, prf: 'unknown' })).toBe('blocked');
    expect(passkeyPlatformView({ available: true, prf: 'yes' })).toBe('ready');
  });

  it('returns the message of an error and the generic sentence otherwise', () => {
    expect(passkeyMessage(new Error('Insufficient funds'))).toBe('Insufficient funds');
    expect(passkeyMessage('nope')).toBe(PASSKEY_GENERIC_ERROR);
    expect(passkeyMessage(new Error('  '))).toBe(PASSKEY_GENERIC_ERROR);
  });
});
