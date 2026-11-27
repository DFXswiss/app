const mockFromMnemonic = jest.fn();
const mockEsploraConstruct = jest.fn();
const mockBalance = jest.fn();
let mockWalletEnv: string | undefined = 'stg';
let mockHasEsploraClient = true;

jest.mock(
  '@dfx.swiss/wallet',
  () => ({
    KeyRing: { fromMnemonic: (...args: unknown[]) => mockFromMnemonic(...args) },
    get EsploraClient() {
      if (!mockHasEsploraClient) return undefined;
      return function EsploraClient(baseUrl: string, options: unknown) {
        mockEsploraConstruct(baseUrl, options);
        return { balance: (address: string) => mockBalance(address) };
      };
    },
  }),
  { virtual: true },
);

jest.mock('../util/test-network', () => ({
  BITCOIN_REGTEST: 'BitcoinRegtest',
  testWalletEnv: () => mockWalletEnv,
}));

jest.mock('../config/api', () => ({ Api: { url: 'https://stg.api.dfx.swiss/', version: 'v1' } }));

import {
  readRegtestBalance,
  readRegtestReceive,
  regtestAvailable,
  resetRegtestProbe,
  walletSupportsRegtest,
} from '../components/home/wallet/passkey-regtest-keys';
import { setOpenPasskey, type OpenPasskey } from '../components/home/wallet/passkey-session';

const PROBE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const PROBE_ADDRESS = 'bcrt1q6rz28mcfaxtmd6v789l9rrlrusdprr9pz3cppk';
const WORDS = 'legal winner thank year wave sausage worth useful legal winner thank yellow';

function ring(address: string) {
  return { bitcoinAddress: jest.fn(() => ({ address })), wipe: jest.fn() };
}

function session(overrides: Partial<OpenPasskey> = {}): OpenPasskey {
  return {
    accessToken: 'token',
    state: 'unlocked',
    keys: { mnemonic: () => WORDS },
    ...overrides,
  } as unknown as OpenPasskey;
}

describe('passkey regtest keys', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRegtestProbe();
    setOpenPasskey(undefined);
    mockWalletEnv = 'stg';
    mockHasEsploraClient = true;
  });

  it('detects regtest support once from the exact test vector and wipes the probe keys', () => {
    const probe = ring(PROBE_ADDRESS);
    mockFromMnemonic.mockReturnValue(probe);

    expect(walletSupportsRegtest('stg')).toBe(true);
    expect(walletSupportsRegtest('stg')).toBe(true);

    expect(mockFromMnemonic).toHaveBeenCalledTimes(1);
    expect(mockFromMnemonic).toHaveBeenCalledWith(PROBE, { bitcoinNetwork: 'regtest', env: 'stg' });
    expect(probe.bitcoinAddress).toHaveBeenCalledWith(0, 0);
    expect(probe.wipe).toHaveBeenCalledTimes(1);
  });

  it('treats a package that rejects the network as unsupported', () => {
    mockFromMnemonic.mockImplementation(() => {
      throw new Error('Unknown Bitcoin network: regtest');
    });

    expect(walletSupportsRegtest('dev')).toBe(false);
  });

  it.each([
    ['another network', 'tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl'],
    ['another path with the regtest prefix', 'bcrt1qd7spv5q28348xl4myc8zmh983w5jx32cs707jh'],
  ])('treats a package that derives %s as unsupported', (_case, address) => {
    mockFromMnemonic.mockReturnValue(ring(address));

    expect(walletSupportsRegtest('stg')).toBe(false);
  });

  it('treats a package without the Esplora client as unsupported and derives nothing', () => {
    mockHasEsploraClient = false;

    expect(walletSupportsRegtest('stg')).toBe(false);
    expect(mockFromMnemonic).not.toHaveBeenCalled();
  });

  it('is available only on a test build with a regtest wallet package', () => {
    mockFromMnemonic.mockReturnValue(ring(PROBE_ADDRESS));
    expect(regtestAvailable()).toBe(true);

    mockWalletEnv = undefined;
    resetRegtestProbe();
    mockFromMnemonic.mockClear();
    expect(regtestAvailable()).toBe(false);
    expect(mockFromMnemonic).not.toHaveBeenCalled();
  });

  it('derives the receive address of the open passkey for this build and wipes the regtest keys', () => {
    const keys = ring('bcrt1qreceive');
    mockFromMnemonic.mockReturnValue(keys);
    mockWalletEnv = 'loc';
    setOpenPasskey(session());

    expect(readRegtestReceive()).toBe('bcrt1qreceive');
    expect(mockFromMnemonic).toHaveBeenCalledWith(WORDS, { bitcoinNetwork: 'regtest', env: 'loc' });
    expect(keys.wipe).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['no open passkey', undefined],
    ['a locked passkey without keys', session({ state: 'locked', keys: undefined })],
    ['an open passkey without keys', session({ keys: undefined })],
  ])('refuses %s', (_case, open) => {
    setOpenPasskey(open);

    expect(() => readRegtestReceive()).toThrow('locked');
    expect(mockFromMnemonic).not.toHaveBeenCalled();
  });

  it('refuses a production build', () => {
    mockWalletEnv = undefined;
    setOpenPasskey(session());

    expect(() => readRegtestReceive()).toThrow('Bitcoin regtest is not available in this build.');
    expect(mockFromMnemonic).not.toHaveBeenCalled();
  });

  it('refuses an address outside regtest', () => {
    mockFromMnemonic.mockReturnValue(ring('tb1qtestnet'));
    setOpenPasskey(session());

    expect(() => readRegtestReceive()).toThrow('This wallet cannot derive a regtest address.');
  });

  it('reads the balance from the wallet package through the Esplora forward of the compiled API', async () => {
    mockBalance.mockResolvedValue({ confirmed: 150000000, unconfirmed: -1000 });

    await expect(readRegtestBalance('bcrt1qreceive')).resolves.toEqual({ confirmed: 150000000, unconfirmed: -1000 });

    expect(mockEsploraConstruct).toHaveBeenCalledWith(
      'https://stg.api.dfx.swiss/v1/walletData/esplora/BitcoinRegtest',
      {
        network: 'regtest',
        env: 'stg',
      },
    );
    expect(mockBalance).toHaveBeenCalledWith('bcrt1qreceive');
  });

  it('reads no balance without the Esplora client or on a production build', async () => {
    mockHasEsploraClient = false;
    await expect(readRegtestBalance('bcrt1qreceive')).rejects.toThrow(
      'Bitcoin regtest is not available in this build.',
    );

    mockHasEsploraClient = true;
    mockWalletEnv = undefined;
    await expect(readRegtestBalance('bcrt1qreceive')).rejects.toThrow(
      'Bitcoin regtest is not available in this build.',
    );
    expect(mockEsploraConstruct).not.toHaveBeenCalled();
  });
});
