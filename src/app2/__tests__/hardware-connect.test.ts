jest.mock('../wallets/providers', () => ({
  WalletConnectorError: class WalletConnectorError extends Error {
    reason: string;
    constructor(message: string, reason: string) {
      super(message);
      this.reason = reason;
    }
  },
}));

import { isWebHidAvailable } from '../wallets/hardware-providers';

describe('isWebHidAvailable', () => {
  const originalHid = (navigator as { hid?: unknown }).hid;

  afterEach(() => {
    if (originalHid === undefined) delete (navigator as { hid?: unknown }).hid;
    else (navigator as { hid?: unknown }).hid = originalHid;
  });

  it('reports WebHID availability', () => {
    delete (navigator as { hid?: unknown }).hid;
    expect(isWebHidAvailable()).toBe(false);
    (navigator as { hid: unknown }).hid = {};
    expect(isWebHidAvailable()).toBe(true);
  });
});

describe('connectHardware', () => {
  beforeEach(() => {
    jest.resetModules();
    (navigator as { hid: unknown }).hid = {};
  });

  async function loadConnect(opts: { pairingCode?: string | undefined; closeRejects?: boolean } = { pairingCode: '12-34' }) {
    jest.doMock('../wallets/providers', () => ({
      WalletConnectorError: class WalletConnectorError extends Error {
        reason: string;
        constructor(message: string, reason: string) {
          super(message);
          this.reason = reason;
        }
      },
    }));
    const device = {
      btcAddress: jest.fn().mockResolvedValue('bc1qtest'),
      ethAddress: jest.fn().mockResolvedValue('0xeth'),
      btcSignMessage: jest.fn().mockResolvedValue({ electrumSig65: Uint8Array.from([1, 2, 3]) }),
      ethSignMessage: jest.fn().mockResolvedValue({
        r: Uint8Array.from([1]),
        s: Uint8Array.from([2]),
        v: Uint8Array.from([3]),
      }),
    };
    jest.doMock(
      'bitbox-api',
      () => ({
        bitbox02ConnectWebHID: jest.fn(async () => ({
          unlockAndPair: async () => ({
            getPairingCode: () => ('pairingCode' in opts ? opts.pairingCode : '12-34'),
            waitConfirm: async () => device,
          }),
        })),
      }),
      { virtual: true },
    );
    const ethClient = {
      getAddress: jest.fn().mockResolvedValue({ address: '0xledger' }),
      signPersonalMessage: jest.fn().mockResolvedValue({ r: 'aa', s: 'bb', v: 1 }),
    };
    const btcClient = {
      getMasterFingerprint: jest.fn().mockResolvedValue('fpr'),
      getExtendedPubkey: jest.fn().mockResolvedValue('xpub'),
      getWalletAddress: jest.fn().mockResolvedValue('bc1qledger'),
      signMessage: jest.fn().mockResolvedValue('btc-sig'),
    };
    jest.doMock(
      '@ledgerhq/hw-transport-webhid',
      () => ({
        __esModule: true,
        default: {
          create: async () => ({
            close: async () => {
              if (opts.closeRejects) throw new Error('already closed');
            },
          }),
        },
      }),
      { virtual: true },
    );
    jest.doMock('@ledgerhq/hw-app-eth', () => ({ __esModule: true, default: function Eth() { return ethClient; } }), {
      virtual: true,
    });
    jest.doMock(
      'ledger-bitcoin',
      () => ({
        __esModule: true,
        default: function Btc() {
          return btcClient;
        },
        DefaultWalletPolicy: function Policy() {
          return {};
        },
      }),
      { virtual: true },
    );
    const trezor = {
      init: jest.fn().mockResolvedValue(undefined),
      getAddress: jest.fn().mockResolvedValue({ success: true, payload: { address: 'bc1qtrezor' } }),
      signMessage: jest.fn().mockResolvedValue({ success: true, payload: { signature: 't-sig' } }),
      ethereumGetAddress: jest.fn().mockResolvedValue({ success: true, payload: { address: '0xtrezor' } }),
      ethereumSignMessage: jest.fn().mockResolvedValue({ success: true, payload: { signature: 'ethsig' } }),
    };
    jest.doMock('@trezor/connect-web', () => ({ __esModule: true, default: trezor }), { virtual: true });
    const mod = await import('../wallets/hardware-providers');
    return {
      connectHardware: mod.connectHardware,
      formatLedgerEthSignature: mod.formatLedgerEthSignature,
      device,
      ethClient,
      btcClient,
      trezor,
    };
  }

  it('refuses BitBox without WebHID', async () => {
    delete (navigator as { hid?: unknown }).hid;
    const { connectHardware } = await loadConnect();
    await expect(connectHardware('bitbox', 'btc')).rejects.toMatchObject({ reason: 'not-installed' });
  });

  it('connects BitBox, Ledger and Trezor', async () => {
    const { connectHardware, trezor } = await loadConnect();
    const btc = await connectHardware('bitbox', 'btc', { onStatus: jest.fn(), onPairingCode: jest.fn() });
    expect(btc.address).toBe('bc1qtest');
    await expect(btc.sign('hi')).resolves.toBeTruthy();

    const eth = await connectHardware('bitbox', 'eth');
    expect(eth.address).toBe('0xeth');
    await expect(eth.sign('hi')).resolves.toMatch(/^0x/);

    const ledgerEth = await connectHardware('ledger', 'eth');
    expect(ledgerEth.address).toBe('0xledger');
    await expect(ledgerEth.sign('m')).resolves.toMatch(/^0x/);

    const ledgerBtc = await connectHardware('ledger', 'btc');
    expect(ledgerBtc.address).toBe('bc1qledger');

    const trezorBtc = await connectHardware('trezor', 'btc');
    expect(trezorBtc.address).toBe('bc1qtrezor');
    const trezorEth = await connectHardware('trezor', 'eth');
    expect(trezorEth.address).toBe('0xtrezor');
    trezor.getAddress.mockResolvedValueOnce({ success: false, payload: { error: 'cancelled by user' } });
    await expect(connectHardware('trezor', 'btc')).rejects.toMatchObject({ reason: 'rejected' });
  });

  it('signs Ledger Bitcoin and Trezor messages and pads Ledger ETH v', async () => {
    const { connectHardware, formatLedgerEthSignature, btcClient, trezor } = await loadConnect();
    expect(formatLedgerEthSignature('aa', 'bb', 1)).toBe('0xaabb01');

    const ledgerBtc = await connectHardware('ledger', 'btc');
    await expect(ledgerBtc.sign('hello')).resolves.toBeTruthy();
    expect(btcClient.signMessage).toHaveBeenCalled();

    const trezorBtc = await connectHardware('trezor', 'btc');
    await expect(trezorBtc.sign('hello')).resolves.toBe('t-sig');
    const trezorEth = await connectHardware('trezor', 'eth');
    await expect(trezorEth.sign('hello')).resolves.toBe('0xethsig');
    trezor.signMessage.mockResolvedValueOnce({ success: false, payload: { error: 'cancelled by user' } });
    await expect(trezorBtc.sign('nope')).rejects.toMatchObject({ reason: 'rejected' });
  });

  it('maps device aborts, derive failures, dispose and a failed Trezor init', async () => {
    const { connectHardware: connectNoCode } = await loadConnect({ pairingCode: undefined });
    const bitbox = await connectNoCode('bitbox', 'btc', { onStatus: jest.fn() });
    expect(bitbox.address).toBe('bc1qtest');

    jest.resetModules();
    (navigator as { hid: unknown }).hid = {};
    const { connectHardware, ethClient, trezor } = await loadConnect({ closeRejects: true });
    ethClient.getAddress.mockRejectedValueOnce(new Error('user cancelled'));
    await expect(connectHardware('ledger', 'eth')).rejects.toMatchObject({ reason: 'rejected' });

    ethClient.getAddress.mockRejectedValueOnce(new Error('transport down'));
    await expect(connectHardware('ledger', 'eth')).rejects.toMatchObject({ reason: 'failed' });

    const ledger = await connectHardware('ledger', 'eth');
    await ledger.dispose?.();

    trezor.init.mockRejectedValueOnce(new Error('popup blocked'));
    await expect(connectHardware('trezor', 'btc')).rejects.toMatchObject({ reason: 'failed' });
    const trezorBtc = await connectHardware('trezor', 'btc');
    expect(trezorBtc.address).toBe('bc1qtrezor');
    trezor.getAddress.mockResolvedValueOnce({ success: false, payload: { error: 'device locked' } });
    await expect(connectHardware('trezor', 'btc')).rejects.toMatchObject({ reason: 'failed' });

    ethClient.getAddress.mockRejectedValueOnce({});
    await expect(connectHardware('ledger', 'eth')).rejects.toMatchObject({ reason: 'failed' });
    ethClient.getAddress.mockRejectedValueOnce({ code: 'USER_CANCEL', message: 'cancelled', name: 'Abort' });
    await expect(connectHardware('ledger', 'eth')).rejects.toMatchObject({ reason: 'rejected' });

    trezor.getAddress.mockResolvedValueOnce({ success: false, payload: {} });
    await expect(connectHardware('trezor', 'btc')).rejects.toMatchObject({ reason: 'failed' });
    trezor.ethereumSignMessage.mockResolvedValueOnce({ success: true, payload: { signature: '0xalready' } });
    const trezorEthPrefixed = await connectHardware('trezor', 'eth');
    await expect(trezorEthPrefixed.sign('hello')).resolves.toBe('0xalready');
  });

  it('loads Trezor when the module has no default export', async () => {
    jest.resetModules();
    (navigator as { hid: unknown }).hid = {};
    jest.doMock('../wallets/providers', () => ({
      WalletConnectorError: class WalletConnectorError extends Error {
        reason: string;
        constructor(message: string, reason: string) {
          super(message);
          this.reason = reason;
        }
      },
    }));
    const trezor = {
      init: jest.fn().mockResolvedValue(undefined),
      getAddress: jest.fn().mockResolvedValue({ success: true, payload: { address: 'bc1qmod' } }),
      signMessage: jest.fn(),
      ethereumGetAddress: jest.fn(),
      ethereumSignMessage: jest.fn(),
    };
    jest.doMock(
      '@trezor/connect-web',
      () => ({ __esModule: true, default: undefined, ...trezor }),
      { virtual: true },
    );
    jest.doMock('bitbox-api', () => ({ bitbox02ConnectWebHID: jest.fn() }), { virtual: true });
    jest.doMock('@ledgerhq/hw-transport-webhid', () => ({ __esModule: true, default: { create: async () => ({}) } }), {
      virtual: true,
    });
    jest.doMock('@ledgerhq/hw-app-eth', () => ({ __esModule: true, default: function Eth() { return {}; } }), {
      virtual: true,
    });
    jest.doMock('ledger-bitcoin', () => ({ __esModule: true, default: function Btc() { return {}; } }), { virtual: true });
    const { connectHardware } = await import('../wallets/hardware-providers');
    const session = await connectHardware('trezor', 'btc');
    expect(session.address).toBe('bc1qmod');
  });
});
