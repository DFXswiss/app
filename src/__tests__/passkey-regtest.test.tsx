const mockAddressStats = jest.fn();
const mockCopy = jest.fn();
const mockReadRegtestReceive = jest.fn();
let mockIsCopying = false;

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_namespace: string, text: string, params?: Record<string, unknown>) =>
      Object.entries(params ?? {}).reduce((out, [key, value]) => out.replace(`{{${key}}}`, String(value)), text),
  }),
}));

jest.mock('../hooks/clipboard.hook', () => ({
  useClipboard: () => ({ copy: mockCopy, isCopying: mockIsCopying }),
}));

jest.mock('../components/payment/qr-code', () => ({
  QrBasic: ({ data }: { data: string }) => <div data-testid="qr">{data}</div>,
}));

jest.mock('../components/home/wallet/passkey-host', () => ({
  passkeyMessage: (error: unknown) =>
    error instanceof Error && error.message !== '' ? error.message : 'Something went wrong. Please try again.',
}));

jest.mock('../components/home/wallet/passkey-regtest-keys', () => ({
  readRegtestReceive: () => mockReadRegtestReceive(),
  readRegtestBalance: (address: string) => mockAddressStats(address),
}));

import { act, fireEvent, render, screen } from '@testing-library/react';
import PasskeyRegtest from '../components/home/wallet/passkey-regtest';

const ADDRESS = 'bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080';

// The wallet package's balance in satoshis: confirmed, and what the mempool adds or removes.
function stats(chain: [number, number], mempool: [number, number] = [0, 0]) {
  return { confirmed: chain[0] - chain[1], unconfirmed: mempool[0] - mempool[1] };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function balanceText(): string {
  return screen.getByTestId('passkey-regtest-balance').textContent ?? '';
}

describe('PasskeyRegtest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsCopying = false;
    mockReadRegtestReceive.mockReturnValue(ADDRESS);
  });

  it('marks the card as a test network without value', () => {
    render(<PasskeyRegtest unlocked={false} />);

    expect(screen.getByText('Bitcoin Regtest')).toBeInTheDocument();
    expect(screen.getByText('Test network')).toBeInTheDocument();
    expect(
      screen.getByText('Regtest coins exist only on the DFX test environment and have no value.'),
    ).toBeInTheDocument();
  });

  it('asks for the unlock and reads no keys while the wallet is locked', () => {
    render(<PasskeyRegtest unlocked={false} />);

    expect(screen.getByText('Unlock the wallet to show this address.')).toBeInTheDocument();
    expect(screen.queryByTestId('passkey-regtest-address')).not.toBeInTheDocument();
    expect(mockReadRegtestReceive).not.toHaveBeenCalled();
    expect(mockAddressStats).not.toHaveBeenCalled();
  });

  it('shows the receive address, its QR code and the confirmed balance of the wallet package', async () => {
    const response = deferred<unknown>();
    mockAddressStats.mockReturnValueOnce(response.promise);
    render(<PasskeyRegtest unlocked />);

    expect(screen.getByTestId('passkey-regtest-address')).toHaveTextContent(ADDRESS);
    expect(screen.getByTestId('qr')).toHaveTextContent(ADDRESS);
    expect(balanceText()).toBe('Loading balance…');
    expect(mockAddressStats).toHaveBeenCalledWith(ADDRESS);

    await act(async () => response.resolve(stats([150_000_000, 37_500_000])));

    expect(balanceText()).toBe('Balance: 1.125 BTC (regtest)');
  });

  it('shows a zero balance and the unconfirmed amount separately', async () => {
    mockAddressStats.mockResolvedValueOnce(stats([0, 0], [1_000, 0]));
    render(<PasskeyRegtest unlocked />);

    await act(async () => undefined);

    expect(balanceText()).toBe('Balance: 0 BTC (regtest) Pending: 0.00001 BTC');
  });

  it('shows whole bitcoins without decimals', async () => {
    mockAddressStats.mockResolvedValueOnce(stats([1_000_000_000, 0]));
    render(<PasskeyRegtest unlocked />);

    await act(async () => undefined);

    expect(balanceText()).toBe('Balance: 10 BTC (regtest)');
  });

  it('shows why the balance failed and loads it again on refresh', async () => {
    mockAddressStats.mockRejectedValueOnce(new Error('Esplora upstream unavailable'));
    render(<PasskeyRegtest unlocked />);

    await act(async () => undefined);
    expect(balanceText()).toBe('Balance not available: Esplora upstream unavailable');

    mockAddressStats.mockResolvedValueOnce(stats([200_000_000, 0]));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Refresh balance' }));
    });

    expect(mockAddressStats).toHaveBeenCalledTimes(2);
    expect(balanceText()).toBe('Balance: 2 BTC (regtest)');
  });

  it('blocks a second refresh while a balance loads', async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    mockAddressStats.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(<PasskeyRegtest unlocked />);

    expect(screen.getByRole('button', { name: 'Refresh balance' })).toBeDisabled();
    await act(async () => first.resolve(stats([100_000_000, 0])));
    expect(balanceText()).toBe('Balance: 1 BTC (regtest)');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh balance' }));
    expect(screen.getByRole('button', { name: 'Refresh balance' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh balance' }));
    expect(mockAddressStats).toHaveBeenCalledTimes(2);

    await act(async () => second.resolve(stats([300_000_000, 0])));
    expect(balanceText()).toBe('Balance: 3 BTC (regtest)');
  });

  it('drops balance answers that arrive after the wallet locked', async () => {
    const stale = deferred<unknown>();
    const staleError = deferred<unknown>();
    const fresh = deferred<unknown>();
    mockAddressStats
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(staleError.promise)
      .mockReturnValueOnce(fresh.promise);

    const view = render(<PasskeyRegtest unlocked />);
    view.rerender(<PasskeyRegtest unlocked={false} />);
    view.rerender(<PasskeyRegtest unlocked />);
    // Every unlock reads the address again and starts a request; a lock invalidates the open one.
    view.rerender(<PasskeyRegtest unlocked={false} />);
    view.rerender(<PasskeyRegtest unlocked />);
    expect(mockAddressStats).toHaveBeenCalledTimes(3);

    await act(async () => fresh.resolve(stats([500_000_000, 0])));
    await act(async () => stale.resolve(stats([100_000_000, 0])));
    await act(async () => staleError.reject(new Error('late failure')));

    expect(balanceText()).toBe('Balance: 5 BTC (regtest)');
  });

  it('copies the address and confirms the copy', () => {
    mockAddressStats.mockReturnValue(new Promise(() => undefined));
    const view = render(<PasskeyRegtest unlocked />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy address' }));
    expect(mockCopy).toHaveBeenCalledWith(ADDRESS);

    mockIsCopying = true;
    view.rerender(<PasskeyRegtest unlocked />);
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('shows why the address could not be derived', () => {
    mockReadRegtestReceive.mockImplementation(() => {
      throw new Error('This wallet cannot derive a regtest address.');
    });
    render(<PasskeyRegtest unlocked />);

    expect(screen.getByText('This wallet cannot derive a regtest address.')).toBeInTheDocument();
    expect(screen.queryByTestId('passkey-regtest-address')).not.toBeInTheDocument();
    expect(mockAddressStats).not.toHaveBeenCalled();
  });

  it('hides the address and its error again when the wallet locks', () => {
    mockReadRegtestReceive.mockImplementationOnce(() => {
      throw new Error('locked');
    });
    mockAddressStats.mockReturnValue(new Promise(() => undefined));
    const view = render(<PasskeyRegtest unlocked />);
    expect(screen.getByText('locked')).toBeInTheDocument();

    view.rerender(<PasskeyRegtest unlocked={false} />);
    expect(screen.queryByText('locked')).not.toBeInTheDocument();

    view.rerender(<PasskeyRegtest unlocked />);
    expect(screen.getByTestId('passkey-regtest-address')).toHaveTextContent(ADDRESS);

    view.rerender(<PasskeyRegtest unlocked={false} />);
    expect(screen.queryByTestId('passkey-regtest-address')).not.toBeInTheDocument();
    expect(screen.getByText('Unlock the wallet to show this address.')).toBeInTheDocument();
  });
});
