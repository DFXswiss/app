import { TextEncoder } from 'util';

(global as { TextEncoder: typeof TextEncoder }).TextEncoder = TextEncoder;

const mockPhantom = {
  connect: jest.fn(),
  publicKey: { toBase58: () => 'solAddr' } as { toBase58: () => string } | null,
  signMessage: jest.fn(),
};
const mockTrustSol = {
  connect: jest.fn(),
  publicKey: { toBase58: () => 'trustSol' },
  signMessage: jest.fn(),
};
const mockTronLink = {
  connect: jest.fn(),
  address: 'Txyz' as string | null,
  signMessage: jest.fn(),
};
const mockTrustTrx = {
  connect: jest.fn(),
  address: 'Ttrust',
  signMessage: jest.fn(),
};

jest.mock('ethers', () => ({
  encodeBase58: () => 'b58sig',
}));

jest.mock('../wallets/providers', () => ({
  WalletConnectorError: class WalletConnectorError extends Error {
    reason: string;
    constructor(message: string, reason: string) {
      super(message);
      this.reason = reason;
    }
  },
}));

jest.mock('@solana/wallet-adapter-phantom', () => ({
  PhantomWalletAdapter: jest.fn(() => mockPhantom),
}));
jest.mock('@solana/wallet-adapter-trust', () => ({
  TrustWalletAdapter: jest.fn(() => mockTrustSol),
}));
jest.mock('@tronweb3/tronwallet-adapter-tronlink', () => ({
  TronLinkAdapter: jest.fn(() => mockTronLink),
}));
jest.mock('@tronweb3/tronwallet-adapter-trust', () => ({
  TrustAdapter: jest.fn(() => mockTrustTrx),
}));

import { connectChainWallet } from '../wallets/chain-providers';
import type { WalletCatalogEntry } from '../wallets/catalog';

function entry(connector: 'solana' | 'tron', adapterId?: WalletCatalogEntry['adapterId']): WalletCatalogEntry {
  return { id: 'w', name: 'w', icon: '', connector, adapterId } as WalletCatalogEntry;
}

describe('connectChainWallet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPhantom.connect.mockResolvedValue(undefined);
    mockPhantom.publicKey = { toBase58: () => 'solAddr' };
    mockPhantom.signMessage.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mockTrustSol.connect.mockResolvedValue(undefined);
    mockTrustSol.signMessage.mockResolvedValue(new Uint8Array([4]));
    mockTronLink.connect.mockResolvedValue(undefined);
    mockTronLink.address = 'Txyz';
    mockTronLink.signMessage.mockResolvedValue('tron-sig');
    mockTrustTrx.connect.mockResolvedValue(undefined);
    mockTrustTrx.signMessage.mockResolvedValue('trust-sig');
  });

  it('rejects a catalog row without an adapter', async () => {
    await expect(connectChainWallet(entry('solana'))).rejects.toMatchObject({ reason: 'failed' });
  });

  it('connects Phantom, signs, and maps connect/sign failures', async () => {
    const session = await connectChainWallet(entry('solana', 'phantom'));
    expect(session.address).toBe('solAddr');
    await expect(session.sign('hi')).resolves.toBe('b58sig');

    mockPhantom.signMessage.mockRejectedValueOnce(new Error('user rejected'));
    await expect(session.sign('hi')).rejects.toMatchObject({ reason: 'rejected' });

    mockPhantom.connect.mockRejectedValueOnce(new Error('bridge down'));
    await expect(connectChainWallet(entry('solana', 'phantom'))).rejects.toMatchObject({ reason: 'failed' });

    const { WalletConnectorError } = jest.requireMock('../wallets/providers') as {
      WalletConnectorError: new (message: string, reason: string) => Error;
    };
    mockPhantom.connect.mockRejectedValueOnce(new WalletConnectorError('already', 'rejected'));
    await expect(connectChainWallet(entry('solana', 'phantom'))).rejects.toMatchObject({ reason: 'rejected' });

    mockPhantom.publicKey = null;
    mockPhantom.connect.mockResolvedValue(undefined);
    await expect(connectChainWallet(entry('solana', 'phantom'))).rejects.toMatchObject({ reason: 'no-account' });
  });

  it('connects Trust Solana, TronLink and Trust Tron', async () => {
    await expect(connectChainWallet(entry('solana', 'trust-sol'))).resolves.toMatchObject({ address: 'trustSol' });
    const tron = await connectChainWallet(entry('tron', 'tronlink'));
    expect(tron.address).toBe('Txyz');
    await expect(tron.sign('m')).resolves.toBe('tron-sig');
    mockTronLink.signMessage.mockRejectedValueOnce({ code: 4001 });
    await expect(tron.sign('m')).rejects.toMatchObject({ reason: 'rejected' });

    await expect(connectChainWallet(entry('tron', 'trust-trx'))).resolves.toMatchObject({ address: 'Ttrust' });
    mockTronLink.address = null;
    await expect(connectChainWallet(entry('tron', 'tronlink'))).rejects.toMatchObject({ reason: 'no-account' });

    mockTronLink.connect.mockRejectedValueOnce(new Error('bridge down'));
    await expect(connectChainWallet(entry('tron', 'tronlink'))).rejects.toMatchObject({ reason: 'failed' });
    mockTronLink.connect.mockRejectedValueOnce({ code: 4001 });
    await expect(connectChainWallet(entry('tron', 'tronlink'))).rejects.toMatchObject({ reason: 'rejected' });
    mockTronLink.connect.mockRejectedValueOnce(undefined);
    await expect(connectChainWallet(entry('tron', 'tronlink'))).rejects.toMatchObject({ reason: 'failed' });
  });
});
