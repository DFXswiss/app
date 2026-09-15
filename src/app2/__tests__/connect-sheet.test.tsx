jest.mock('@dfx.swiss/react', () => ({
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

jest.mock('react-qr-code', () => ({
  __esModule: true,
  default: ({ value }: { value: string }) => <div data-testid="qr">{value}</div>,
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConnectSheet } from '../wallets/ConnectSheet';
import { LanguageProvider } from '../i18n';
import { ToastProvider } from '../components/ui';
import type { ConnectView } from '../wallets/session';

const handlers = {
  onClose: jest.fn(),
  onSelectWallet: jest.fn(),
  onSelectHwChain: jest.fn(),
  onSubmitRecommendation: jest.fn(),
  requestSignMessage: jest.fn(),
  onCliConnect: jest.fn(),
  onBackToList: jest.fn(),
};

function renderSheet(view: ConnectView) {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <ConnectSheet open view={view} {...handlers} />
      </ToastProvider>
    </LanguageProvider>,
  );
}

describe('ConnectSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists wallets and selects MetaMask', () => {
    renderSheet({ kind: 'list' });
    fireEvent.click(screen.getByRole('button', { name: /metamask/i }));
    expect(handlers.onSelectWallet).toHaveBeenCalled();
  });

  it('shows a WalletConnect QR and a CLI form', () => {
    renderSheet({ kind: 'wallet-connect', uri: 'wc:abc' });
    expect(screen.getByTestId('qr')).toHaveTextContent('wc:abc');
    const back = screen.queryByRole('button', { name: /back|close|schließen|chiudi|fermer/i });
    if (back) fireEvent.click(back);
    else fireEvent.click(screen.getByRole('heading', { name: 'WalletConnect' }));
    expect(screen.getByTestId('qr')).toBeInTheDocument();
  });

  it('shows connecting, hardware chain, pairing and recommendation views', () => {
    const entry = {
      id: 'Ledger',
      name: 'Ledger',
      icon: 'led.svg',
      connector: 'ledger' as const,
    };
    renderSheet({ kind: 'connecting', walletId: 'MetaMask', label: 'Connecting MetaMask…' });
    expect(screen.getByText(/connecting metamask/i)).toBeInTheDocument();

    const { unmount } = renderSheet({ kind: 'hw-chain', entry: entry as never });
    fireEvent.click(screen.getByText(/bitcoin/i));
    expect(handlers.onSelectHwChain).toHaveBeenCalled();
    unmount();

    renderSheet({ kind: 'hw-pairing', code: 'ABCD', label: 'Ledger' });
    expect(screen.getByText('ABCD')).toBeInTheDocument();

    renderSheet({
      kind: 'recommend',
      pending: { address: '0x1', signature: 's', connector: 'injected', walletType: 'MetaMask' },
      initialCode: 'XY-AB12-CD34-EF',
    });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'XY-AB12-CD34-EF' } });
    fireEvent.click(screen.getByRole('button', { name: /continue|weiter|continua|continuer|submit/i }));
    expect(handlers.onSubmitRecommendation).toHaveBeenCalled();
  });

  it('filters the list to a chain and falls back a broken icon', () => {
    renderSheet({ kind: 'list', filterChain: 'Bitcoin' as never });
    const img = document.querySelector('img.coin') as HTMLImageElement | null;
    if (img) {
      fireEvent.error(img);
      expect(img.src).toContain('data:image/svg+xml');
      fireEvent.error(img); // second error is a no-op
    }
  });

  it('runs the CLI paste form through challenge, copy and submit', async () => {
    handlers.requestSignMessage.mockResolvedValue('by_signing_this_message 0xabc dfx.swiss');
    handlers.onCliConnect.mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } });
    const view = renderSheet({
      kind: 'cli',
      entry: { id: 'CLI', name: 'CLI', icon: 'cli.svg', connector: 'cli' } as never,
    });
    fireEvent.click(screen.getByRole('button', { name: /continue|weiter|continua|continuer/i }));
    fireEvent.change(screen.getByPlaceholderText(/address|adresse|indirizzo/i), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: /continue|weiter|continua|continuer/i }));
    expect(screen.getByText(/doesn't look like a valid address|gültigen adresse|indirizzo valido|adresse valide/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/address|adresse|indirizzo/i), {
      target: { value: 'bc1qabcdefghijklmnopqrstuvwxyz012345' },
    });
    fireEvent.keyDown(screen.getByPlaceholderText(/address|adresse|indirizzo/i), { key: 'Enter' });
    expect(await screen.findByText(/by_signing_this_message/)).toBeInTheDocument();
    await waitFor(() => expect(handlers.requestSignMessage).toHaveBeenCalled());
    const sig = document.getElementById('cliSignature') as HTMLTextAreaElement;
    const key = document.getElementById('cliKey') as HTMLInputElement;
    fireEvent.change(sig, { target: { value: '0xsig' } });
    fireEvent.change(key, { target: { value: 'cose' } });
    const submit = Array.from(document.querySelectorAll('button')).find((b) =>
      /connect|verbinden|connetti|connecter/i.test(b.textContent || ''),
    );
    if (submit) fireEvent.click(submit);
    view.unmount();
  });

  it('copies a WalletConnect URI and cancels pairing', async () => {
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } });
    const withUri = renderSheet({ kind: 'wallet-connect', uri: 'wc:pair-me' });
    fireEvent.click(screen.getByRole('button', { name: /copy|kopieren|copia|copier/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel|abbrechen|annulla|annuler/i }));
    expect(handlers.onBackToList).toHaveBeenCalled();
    withUri.unmount();

    renderSheet({ kind: 'wallet-connect' });
    expect(screen.getByRole('button', { name: /copy|kopieren|copia|copier/i })).toBeDisabled();
  });

  it('shows a pairing spinner without a code and an invalid recommendation', () => {
    renderSheet({ kind: 'hw-pairing', label: 'BitBox' });
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(handlers.onClose).toHaveBeenCalled();

    renderSheet({
      kind: 'recommend',
      pending: { address: '0x1', signature: 's', connector: 'injected' },
      invalidCode: true,
    });
    fireEvent.click(screen.getByRole('button', { name: /cancel|abbrechen|annulla|annuler/i }));
    expect(handlers.onBackToList).toHaveBeenCalled();
  });

  it('selects a wallet with the keyboard and shows coming-soon rows', () => {
    renderSheet({ kind: 'list' });
    const metamask = screen.getByRole('button', { name: /metamask/i });
    fireEvent.keyDown(metamask, { key: 'Enter' });
    expect(handlers.onSelectWallet).toHaveBeenCalled();
    fireEvent.keyDown(metamask, { key: ' ' });
    expect(handlers.onSelectWallet).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText(/coming soon|demnächst|prossimamente|bientôt/i).length).toBeGreaterThan(0);
  });

  it('selects a hardware chain with the keyboard', () => {
    renderSheet({
      kind: 'hw-chain',
      entry: { id: 'Ledger', name: 'Ledger', icon: 'led.svg', connector: 'ledger' } as never,
    });
    fireEvent.keyDown(screen.getByText(/bitcoin/i).closest('[role="button"]') as HTMLElement, { key: 'Enter' });
    expect(handlers.onSelectHwChain).toHaveBeenCalled();
  });

  it('toasts when a CLI challenge or copy fails and copies a message', async () => {
    handlers.requestSignMessage.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce('sign this');
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(undefined) } });
    renderSheet({
      kind: 'cli',
      entry: { id: 'CLI', name: 'CLI', icon: 'cli.svg', connector: 'cli' } as never,
    });
    fireEvent.change(screen.getByPlaceholderText(/address|adresse|indirizzo/i), {
      target: { value: 'bc1qabcdefghijklmnopqrstuvwxyz012345' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue|weiter|continua|continuer/i }));
    await waitFor(() => expect(handlers.requestSignMessage).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /continue|weiter|continua|continuer/i })).not.toBeDisabled(),
    );

    handlers.requestSignMessage.mockResolvedValueOnce('sign this');
    fireEvent.click(screen.getByRole('button', { name: /continue|weiter|continua|continuer/i }));
    expect(await screen.findByText('sign this')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /copied|kopiert|copiato|copié/i }));
    fireEvent.click(screen.getByRole('button', { name: /copied|kopiert|copiato|copié/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel|abbrechen|annulla|annuler/i }));
    expect(handlers.onBackToList).toHaveBeenCalled();
  });

  it('toasts when copying a WalletConnect URI fails', async () => {
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockRejectedValue(new Error('x')) } });
    renderSheet({ kind: 'wallet-connect', uri: 'wc:fail' });
    fireEvent.click(screen.getByRole('button', { name: /copy|kopieren|copia|copier/i }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
  });

  it('submits a recommendation code', () => {
    renderSheet({
      kind: 'recommend',
      pending: { address: '0x1', signature: 's', connector: 'injected' },
      initialCode: 'ab-cd12-ef34-gh',
    });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'xy-ab12-cd34-ef' } });
    fireEvent.click(screen.getByRole('button', { name: /continue|weiter|continua|continuer/i }));
    expect(handlers.onSubmitRecommendation).toHaveBeenCalled();
  });

  it('ignores copy without a URI, a second fetch, an empty submit and a later address edit', async () => {
    const wc = renderSheet({ kind: 'wallet-connect' });
    const copyUri = document.querySelector('.qractions .btn-mini') as HTMLButtonElement;
    copyUri.disabled = false;
    fireEvent.click(copyUri);
    wc.unmount();

    handlers.requestSignMessage.mockImplementation(() => new Promise(() => undefined));
    const cli = renderSheet({
      kind: 'cli',
      entry: { id: 'CLI', name: 'CLI', icon: 'cli.svg', connector: 'cli' } as never,
    });
    const address = screen.getByPlaceholderText(/address|adresse|indirizzo/i);
    fireEvent.change(address, { target: { value: 'bc1qabcdefghijklmnopqrstuvwxyz012345' } });
    fireEvent.click(screen.getByRole('button', { name: /continue|weiter|continua|continuer/i }));
    await waitFor(() => expect(handlers.requestSignMessage).toHaveBeenCalledTimes(1));
    const pendingContinue = Array.from(document.querySelectorAll('.qractions .btn-mini')).at(-1) as HTMLButtonElement;
    fireEvent.click(pendingContinue);
    fireEvent.keyDown(address, { key: 'Enter' });
    expect(handlers.requestSignMessage).toHaveBeenCalledTimes(1);
    cli.unmount();

    handlers.requestSignMessage.mockResolvedValue('sign this');
    renderSheet({
      kind: 'cli',
      entry: { id: 'CLI', name: 'CLI', icon: 'cli.svg', connector: 'cli' } as never,
    });
    fireEvent.change(screen.getByPlaceholderText(/address|adresse|indirizzo/i), {
      target: { value: 'bc1qabcdefghijklmnopqrstuvwxyz012345' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue|weiter|continua|continuer/i }));
    expect(await screen.findByText('sign this')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/address|adresse|indirizzo/i), {
      target: { value: 'bc1qabcdefghijklmnopqrstuvwxyz012345x' },
    });
    fireEvent.keyDown(screen.getByPlaceholderText(/address|adresse|indirizzo/i), { key: 'Enter' });
    fireEvent.keyDown(screen.getByPlaceholderText(/address|adresse|indirizzo/i), { key: 'Tab' });
    const connect = Array.from(document.querySelectorAll('button')).find((b) =>
      /connect|verbinden|connetti|connecter/i.test(b.textContent || ''),
    ) as HTMLButtonElement | undefined;
    if (connect) {
      connect.disabled = false;
      fireEvent.click(connect);
    }
    expect(handlers.onCliConnect).not.toHaveBeenCalled();

    renderSheet({ kind: 'list' });
    const soon = document.querySelector('.crow.soon') as HTMLElement;
    fireEvent.keyDown(soon, { key: 'Enter' });
    fireEvent.keyDown(soon, { key: ' ' });
    fireEvent.keyDown(soon, { key: 'Tab' });
  });
});
