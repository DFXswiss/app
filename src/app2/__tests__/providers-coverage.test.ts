import { TextEncoder } from 'util';

(global as { TextEncoder: typeof TextEncoder }).TextEncoder = TextEncoder;

const mockWc = {
  on: jest.fn(),
  enable: jest.fn(),
  removeListener: jest.fn(),
  disconnect: jest.fn(),
  request: jest.fn(),
};

jest.mock('@walletconnect/ethereum-provider', () => ({
  EthereumProvider: {
    init: jest.fn().mockImplementation(() => Promise.resolve(mockWc)),
  },
}));

jest.mock('ethers', () => ({
  getAddress: (address: string) => {
    if (!address.startsWith('0x') || address.length !== 42) throw new Error('bad');
    return address.toLowerCase();
  },
}));

import { EthereumProvider } from '@walletconnect/ethereum-provider';
import {
  checksumAddress,
  connectInjected,
  connectWalletConnect,
  createCancelToken,
  disconnectWalletConnect,
  getInjectedProvider,
  isUserRejection,
  resolveInjectedProvider,
  signWithInjected,
  signWithWalletConnect,
  WalletConnectorError,
} from '../wallets/providers';

describe('injected provider resolution', () => {
  afterEach(() => {
    delete (window as { ethereum?: unknown }).ethereum;
  });

  it('ignores a missing or non-request window.ethereum', () => {
    expect(getInjectedProvider()).toBeUndefined();
    (window as { ethereum: unknown }).ethereum = { not: true };
    expect(getInjectedProvider()).toBeUndefined();
  });

  it('resolves via EIP-6963 then falls back to a flavored window.ethereum', () => {
    const announced = { request: jest.fn(), isRabby: true };
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: { info: { rdns: 'io.rabby' }, provider: announced },
      }),
    );
    expect(resolveInjectedProvider({ rdns: 'io.rabby' })).toBe(announced);

    (window as { ethereum: unknown }).ethereum = { request: jest.fn(), isMetaMask: true };
    expect(resolveInjectedProvider({ flavor: 'isMetaMask' })).toBeTruthy();
    expect(resolveInjectedProvider({ flavor: 'isRabby' })).toBeUndefined();
    expect(resolveInjectedProvider({})).toBeTruthy();
  });

  it('connects and signs through the injected provider', async () => {
    const request = jest.fn().mockResolvedValueOnce(['0x' + '11'.repeat(20)]).mockResolvedValueOnce('0xsig');
    const provider = { request };
    await expect(connectInjected(provider)).resolves.toBe('0x' + '11'.repeat(20));
    await expect(signWithInjected(provider, '0x' + '11'.repeat(20), 'hi')).resolves.toBe('0xsig');
    request.mockResolvedValueOnce([]);
    await expect(connectInjected(provider)).rejects.toMatchObject({ reason: 'no-account' });
  });

  it('maps user-rejection codes and checksum failures', () => {
    expect(isUserRejection({ code: 4001 })).toBe(true);
    expect(isUserRejection({ code: 5000 })).toBe(true);
    expect(isUserRejection(new Error('denied'))).toBe(true);
    expect(isUserRejection(new Error('ok'))).toBe(false);
    expect(() => checksumAddress('not-an-address')).toThrow(WalletConnectorError);
  });
});

describe('WalletConnect cancel token', () => {
  it('rejects immediately when the token is already cancelled', async () => {
    const token = createCancelToken();
    const pending = token.promise.catch((error) => error);
    token.cancel(new WalletConnectorError('Connection cancelled', 'rejected'));
    token.cancel(new WalletConnectorError('again', 'rejected'));
    await pending;
    await expect(connectWalletConnect(jest.fn(), token)).rejects.toMatchObject({ reason: 'rejected' });
  });
});

describe('WalletConnect pairing and teardown', () => {
  beforeEach(() => {
    mockWc.on.mockReset();
    mockWc.enable.mockReset();
    mockWc.removeListener.mockReset();
    mockWc.disconnect.mockReset();
    mockWc.request.mockReset();
    mockWc.disconnect.mockResolvedValue(undefined);
    (EthereumProvider.init as jest.Mock).mockReset();
    (EthereumProvider.init as jest.Mock).mockResolvedValue(mockWc);
    return disconnectWalletConnect();
  });

  it('pairs, signs, and disconnects a WalletConnect session', async () => {
    mockWc.enable.mockResolvedValue(['0x' + '11'.repeat(20)]);
    mockWc.request.mockResolvedValue('0xsig');
    mockWc.on.mockImplementation((event: string, handler: (uri: string) => void) => {
      if (event === 'display_uri') handler('wc:uri');
    });
    const onUri = jest.fn();
    const token = createCancelToken();
    const session = await connectWalletConnect(onUri, token);
    expect(onUri).toHaveBeenCalledWith('wc:uri');
    expect(session.address.toLowerCase()).toBe('0x' + '11'.repeat(20));
    await expect(signWithWalletConnect(session.provider, session.address, 'hi')).resolves.toBe('0xsig');
    await disconnectWalletConnect();
    expect(mockWc.disconnect).toHaveBeenCalled();
  });

  it('maps a missing account, a user rejection and a generic enable failure', async () => {
    mockWc.enable.mockResolvedValueOnce([]);
    await expect(connectWalletConnect(jest.fn(), createCancelToken())).rejects.toMatchObject({
      reason: 'no-account',
    });

    mockWc.enable.mockRejectedValueOnce({ code: 4001 });
    await expect(connectWalletConnect(jest.fn(), createCancelToken())).rejects.toMatchObject({
      reason: 'rejected',
    });

    mockWc.enable.mockRejectedValueOnce(new Error('bridge'));
    await expect(connectWalletConnect(jest.fn(), createCancelToken())).rejects.toMatchObject({
      message: 'bridge',
    });
  });

  it('treats a nullish rejection as not a user abort', () => {
    expect(isUserRejection(undefined)).toBe(false);
    expect(isUserRejection(null)).toBe(false);
  });

  it('ignores an EIP-6963 announcement without an rdns or provider', () => {
    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: {} }));
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', { detail: { info: { rdns: 'io.x' }, provider: {} } }),
    );
    expect(resolveInjectedProvider({ rdns: 'io.x' })).toBeUndefined();
  });

  it('maps an init failure and a bad account checksum', async () => {
    (EthereumProvider.init as jest.Mock).mockRejectedValueOnce(new Error('init'));
    await expect(connectWalletConnect(jest.fn(), createCancelToken())).rejects.toMatchObject({ reason: 'failed' });

    mockWc.enable.mockResolvedValueOnce(['not-an-address']);
    await expect(connectWalletConnect(jest.fn(), createCancelToken())).rejects.toMatchObject({
      reason: 'no-account',
    });
  });

  it('cancels while the first disconnect is still running', async () => {
    mockWc.enable.mockImplementation(() => new Promise(() => undefined));
    const token = createCancelToken();
    const swallow = token.promise.catch((error) => error);
    const pending = connectWalletConnect(jest.fn(), token);
    token.cancel(new WalletConnectorError('Connection cancelled', 'rejected'));
    await swallow;
    await expect(pending).rejects.toMatchObject({ reason: 'rejected' });
  });

  it('cancels after init has started and before enable settles', async () => {
    let resolveEnable!: (accounts: string[]) => void;
    mockWc.enable.mockImplementationOnce(
      () =>
        new Promise<string[]>((resolve) => {
          resolveEnable = resolve;
        }),
    );
    const token = createCancelToken();
    const swallow = token.promise.catch((error) => error);
    const pending = connectWalletConnect(jest.fn(), token);
    await Promise.resolve();
    await Promise.resolve();
    token.cancel(new WalletConnectorError('Connection cancelled', 'rejected'));
    await swallow;
    await expect(pending).rejects.toMatchObject({ reason: 'rejected' });
    resolveEnable?.(['0x' + '11'.repeat(20)]);
  });

  it('disconnects a provider whose init later fails', async () => {
    (EthereumProvider.init as jest.Mock).mockRejectedValueOnce(new Error('gone'));
    const token = createCancelToken();
    const pending = connectWalletConnect(jest.fn(), token).catch(() => undefined);
    await Promise.resolve();
    await disconnectWalletConnect();
    await pending;
  });

  it('cancels after init resolves, races two teardowns and swallows a failed disconnect', async () => {
    const token = createCancelToken();
    const swallow = token.promise.catch((error) => error);
    (EthereumProvider.init as jest.Mock).mockImplementationOnce(async () => {
      queueMicrotask(() => token.cancel(new WalletConnectorError('Connection cancelled', 'rejected')));
      return mockWc;
    });
    await expect(connectWalletConnect(jest.fn(), token)).rejects.toMatchObject({ reason: 'rejected' });
    await swallow;

    await disconnectWalletConnect();
    await Promise.all([disconnectWalletConnect(), disconnectWalletConnect()]);
    await Promise.all([disconnectWalletConnect(), disconnectWalletConnect()]);

    mockWc.enable.mockResolvedValueOnce(['0x' + '11'.repeat(20)]);
    await connectWalletConnect(jest.fn(), createCancelToken());
    mockWc.disconnect.mockRejectedValueOnce(new Error('already gone'));
    await disconnectWalletConnect();

    let rejectInit!: (error: Error) => void;
    (EthereumProvider.init as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectInit = reject;
        }),
    );
    const hanging = connectWalletConnect(jest.fn(), createCancelToken()).catch(() => undefined);
    await Promise.resolve();
    await Promise.resolve();
    const teardown = disconnectWalletConnect();
    rejectInit(new Error('init-gone'));
    await teardown;
    await hanging;
  });
});
