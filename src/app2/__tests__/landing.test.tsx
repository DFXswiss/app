const mockOpenConnect = jest.fn();
const mockSignInWithMail = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  useAuth: () => ({ signInWithMail: mockSignInWithMail }),
  AuthWalletType: {
    METAMASK: 'MetaMask',
    WALLET_BROWSER: 'WalletBrowser',
    RABBY: 'Rabby',
    WALLET_CONNECT: 'WalletConnect',
    BIT_BOX: 'BitBox',
    LEDGER: 'Ledger',
    TREZOR: 'Trezor',
    ALBY: 'Alby',
    PHANTOM: 'Phantom',
    TRUST: 'Trust',
    TRON_LINK: 'TronLink',
    CLI: 'CLI',
  },
  Blockchain: {
    ETHEREUM: 'Ethereum',
    ARBITRUM: 'Arbitrum',
    OPTIMISM: 'Optimism',
    POLYGON: 'Polygon',
    BASE: 'Base',
    BINANCE_SMART_CHAIN: 'BinanceSmartChain',
    GNOSIS: 'Gnosis',
    CITREA: 'Citrea',
    BITCOIN: 'Bitcoin',
    LIGHTNING: 'Lightning',
    SOLANA: 'Solana',
    TRON: 'Tron',
    INTERNET_COMPUTER: 'InternetComputer',
    CARDANO: 'Cardano',
  },
}));

jest.mock('../wallets/session', () => ({
  useWalletSession: () => ({ openConnect: mockOpenConnect }),
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Landing } from '../screens/parts/Landing';
import { LanguageProvider } from '../i18n';
import { ToastProvider } from '../components/ui';

function renderLanding() {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <Landing />
      </ToastProvider>
    </LanguageProvider>,
  );
}

describe('Landing', () => {
  beforeEach(() => {
    mockOpenConnect.mockReset();
    mockSignInWithMail.mockReset();
    mockSignInWithMail.mockResolvedValue(undefined);
  });

  it('opens connect from the wallet CTA and a strip chip', () => {
    renderLanding();
    fireEvent.click(screen.getByRole('button', { name: /connect/i }));
    expect(mockOpenConnect).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'MetaMask' }));
    expect(mockOpenConnect).toHaveBeenCalledTimes(2);
  });

  it('validates email, sends a magic link and toasts a failure', async () => {
    jest.useFakeTimers();
    renderLanding();
    fireEvent.click(screen.getByRole('button', { name: /email|e-mail|mail/i }));
    await act(async () => {
      jest.advanceTimersByTime(250);
    });
    jest.useRealTimers();
    const input = screen.getByLabelText(/email|e-mail|mail/i);
    fireEvent.click(screen.getByRole('button', { name: 'Send magic link' }));
    expect(screen.getByText(/valid email|gültige|valido|valide/i)).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'user@example.com' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(mockSignInWithMail).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Send magic link' })).not.toBeDisabled());
    mockSignInWithMail.mockRejectedValueOnce(new Error('down'));
    fireEvent.click(screen.getByRole('button', { name: 'Send magic link' }));
    await waitFor(() => expect(mockSignInWithMail).toHaveBeenCalledTimes(2));
  });

  it('toggles the invite field and flags an unrecognized code', async () => {
    jest.useFakeTimers();
    renderLanding();
    fireEvent.click(screen.getByRole('button', { name: /invite|einladung|invito|parrainage/i }));
    const invite = screen.getByLabelText(/invite|einladung|invito|code/i);
    await act(async () => {
      jest.advanceTimersByTime(250);
    });
    fireEvent.change(invite, { target: { value: 'not-a-real-code-at-all' } });
    expect(screen.getByText(/recognize|erkennen|riconosciamo|reconnaissons/i)).toBeInTheDocument();
    fireEvent.change(invite, { target: { value: 'ABC-123' } });
    expect(screen.getByText(/only works with wallet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /invite|einladung|invito|parrainage/i }));
    await act(async () => {
      jest.advanceTimersByTime(250);
    });
    jest.useRealTimers();
  });

  it('ignores a second submit while a magic link is in flight', async () => {
    let resolveSign: (() => void) | undefined;
    mockSignInWithMail.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSign = resolve;
        }),
    );
    renderLanding();
    fireEvent.click(screen.getByRole('button', { name: /email|e-mail|mail/i }));
    fireEvent.change(screen.getByLabelText(/email|e-mail|mail/i), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send magic link' }));
    fireEvent.keyDown(screen.getByLabelText(/email|e-mail|mail/i), { key: 'Enter' });
    expect(mockSignInWithMail).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveSign?.();
    });
  });

  it('replaces a broken strip icon once', () => {
    renderLanding();
    const img = screen.getByRole('button', { name: 'MetaMask' }).querySelector('img') as HTMLImageElement;
    fireEvent.error(img);
    expect(img.src).toContain('data:image/svg+xml');
    const after = img.src;
    fireEvent.error(img);
    expect(img.src).toBe(after);
  });

  it('forwards a recommendation code and wallet param on the mail path', async () => {
    window.history.replaceState({}, '', '/?code=AB-CDEF-GHIJ-KL&wallet=MetaMask');
    renderLanding();
    expect(screen.getByText(/invite applied|einladung übernommen|invito applicato|parrainage/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /email|e-mail|mail/i }));
    fireEvent.change(screen.getByLabelText(/email|e-mail|mail/i), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /email|e-mail|mail/i }));
    await waitFor(() =>
      expect(mockSignInWithMail).toHaveBeenCalledWith(
        'user@example.com',
        expect.any(String),
        'AB-CDEF-GHIJ-KL',
        'MetaMask',
      ),
    );
    window.history.replaceState({}, '', '/');
  });

  it('clears an invalid-email flag when the user types', () => {
    renderLanding();
    fireEvent.click(screen.getByRole('button', { name: /email|e-mail|mail/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Send magic link' }));
    expect(screen.getByText(/valid email|gültige|valido|valide/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/email|e-mail|mail/i), { target: { value: 'a' } });
    expect(screen.queryByText(/valid email|gültige|valido|valide/i)).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText(/email|e-mail|mail/i), { key: 'Tab' });
    fireEvent.keyDown(screen.getByLabelText(/email|e-mail|mail/i), { key: 'Enter' });
  });
});
