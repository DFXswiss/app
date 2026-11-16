// useMetaMask against the real web3 and a replaced injected provider. Web3 only sees the hook's request adapter, which
// reads window.ethereum when the request is sent. A rejection that is not an Error but carries EIP-1193 code 4001 is
// turned into an Error that keeps the code; web3 would otherwise rewrite it and drop the code. Other failures reach
// the caller exactly as before. A missing provider fails with the missing-wallet hint.

jest.mock('@dfx.swiss/react', () => ({
  AssetType: { COIN: 'Coin', TOKEN: 'Token' },
  Blockchain: { ETHEREUM: 'Ethereum', POLYGON: 'Polygon' },
}));

jest.mock('../../web3.hook', () => ({
  useWeb3: () => ({
    toBlockchain: () => 'Ethereum',
    toChainHex: () => '0x89',
    toChainObject: () => ({ chainId: '0x89' }),
  }),
}));

jest.mock('react-device-detect', () => ({ isMobile: false }));

import { Asset, AssetType, Blockchain } from '@dfx.swiss/react';
import { renderHook } from '@testing-library/react';
import BigNumber from 'bignumber.js';
import Web3 from 'web3';
import { AbortError } from '../../../util/abort-error';
import { TranslatedError } from '../../../util/translated-error';
import { useMetaMask } from '../metamask.hook';

const ADDRESS = '0x1234567890123456789012345678901234567890';
const MISSING_WALLET = 'No wallet found. Please check your wallet extension or set one up, then reload this page.';

type Handler = (params?: unknown) => Promise<unknown>;

let handlers: Record<string, Handler>;
let givenProvider: unknown;

function createProvider() {
  return {
    request: jest.fn(({ method, params }: { method: string; params?: unknown }) =>
      handlers[method] ? handlers[method](params) : Promise.reject(new Error(`unexpected ${method}`)),
    ),
    on: jest.fn(),
  };
}

function useProvider(provider: unknown) {
  (window as any).ethereum = provider;
  (Web3 as any).givenProvider = provider;
}

function setup() {
  return renderHook(() => useMetaMask()).result.current;
}

function rejectWith(code: number, message: string, data?: unknown): Handler {
  return () => Promise.reject(data === undefined ? { code, message } : { code, message, data });
}

beforeEach(() => {
  givenProvider = (Web3 as any).givenProvider;
  // its keccak rejects the Uint8Array of jsdom, and the address is checksummed already
  jest.spyOn(Web3.utils, 'toChecksumAddress').mockImplementation((address: string) => address);

  handlers = {
    eth_accounts: () => Promise.resolve([ADDRESS]),
    eth_requestAccounts: () => Promise.resolve([ADDRESS]),
    eth_getBlockByNumber: () => Promise.resolve({ baseFeePerGas: '0x1' }),
    eth_gasPrice: () => Promise.resolve('0x1'),
  };
  useProvider(createProvider());
});

afterEach(() => {
  jest.restoreAllMocks();
  delete (window as any).ethereum;
  (Web3 as any).givenProvider = givenProvider;
});

const REJECT_ALL = { cause: 'rejectAllApprovals' };

describe('requestAccount', () => {
  it('returns the account', async () => {
    await expect(setup().requestAccount()).resolves.toBe(ADDRESS);
  });

  it.each([
    ['without data', undefined],
    ['with data', REJECT_ALL],
  ])('cancels on a rejection %s', async (_case, data) => {
    handlers.eth_requestAccounts = rejectWith(4001, 'User rejected the request.', data);

    await expect(setup().requestAccount()).rejects.toBeInstanceOf(AbortError);
  });

  it('keeps the hint for a pending request', async () => {
    handlers.eth_requestAccounts = rejectWith(-32002, 'Already processing eth_requestAccounts.');

    await expect(setup().requestAccount()).rejects.toBeInstanceOf(TranslatedError);
  });

  it('leaves the rewritten message of another failure with data as it was', async () => {
    handlers.eth_requestAccounts = rejectWith(-32603, 'Internal error', { reason: 'locked' });

    await expect(setup().requestAccount()).rejects.toThrow('Internal error\n{\n  "reason": "locked"\n}');
  });
});

describe('sign', () => {
  it('cancels on a rejection with data', async () => {
    handlers.personal_sign = rejectWith(4001, 'User rejected the request.', { location: 'confirmation', cause: null });

    await expect(setup().sign(ADDRESS, 'message')).rejects.toBeInstanceOf(AbortError);
  });

  it('passes on an Error the wallet rejected with', async () => {
    const error = Object.assign(new Error('User rejected the request.'), { code: 4001, data: REJECT_ALL });
    handlers.personal_sign = () => Promise.reject(error);

    await expect(setup().sign(ADDRESS, 'message')).rejects.toBeInstanceOf(AbortError);
  });
});

describe('createTransaction', () => {
  it('keeps the code of a rejected transaction with data, which keeps the user on the form', async () => {
    handlers.eth_sendTransaction = rejectWith(4001, 'User rejected the request.', REJECT_ALL);

    const transaction = setup().createTransaction(
      new BigNumber(1),
      { type: AssetType.COIN } as Asset,
      ADDRESS,
      ADDRESS,
    );

    await expect(transaction).rejects.toBeInstanceOf(Error);
    await expect(transaction).rejects.toMatchObject({ code: 4001, message: 'User rejected the request.' });
  });
});

describe('requestChangeToBlockchain', () => {
  beforeEach(() => {
    handlers.wallet_switchEthereumChain = rejectWith(4902, 'Unrecognized chain ID.');
  });

  it('adds the chain the wallet does not know', async () => {
    handlers.wallet_addEthereumChain = () => Promise.resolve(null);

    await expect(setup().requestChangeToBlockchain(Blockchain.POLYGON)).resolves.toBeNull();
  });

  it('cancels with the code when the user rejects the switch, which keeps the user on the form', async () => {
    handlers.wallet_switchEthereumChain = rejectWith(4001, 'User rejected the request.');

    const change = setup().requestChangeToBlockchain(Blockchain.POLYGON);
    await expect(change).rejects.toBeInstanceOf(AbortError);
    await expect(change).rejects.toHaveProperty('code', 4001);
  });

  it('cancels with the code when the user rejects adding the chain', async () => {
    handlers.wallet_addEthereumChain = rejectWith(4001, 'User rejected the request.');

    const change = setup().requestChangeToBlockchain(Blockchain.POLYGON);
    await expect(change).rejects.toBeInstanceOf(AbortError);
    await expect(change).rejects.toHaveProperty('code', 4001);
  });

  it('passes on another failure to add the chain', async () => {
    handlers.wallet_addEthereumChain = rejectWith(-32002, 'Request already pending.');

    await expect(setup().requestChangeToBlockchain(Blockchain.POLYGON)).rejects.toEqual({
      code: -32002,
      message: 'Request already pending.',
    });
  });
});

describe('provider passed to web3', () => {
  it('passes the subscriptions of web3 on to the wallet', () => {
    const provider = createProvider();
    useProvider(provider);

    setup();

    expect(provider.on).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('works with a wallet that does not emit events', async () => {
    const { request } = createProvider();
    useProvider({ request });

    await expect(setup().requestAccount()).resolves.toBe(ADDRESS);
  });

  it('still connects when reading on throws', async () => {
    const provider = createProvider();
    Object.defineProperty(provider, 'on', {
      configurable: true,
      get() {
        throw new TypeError('proxy');
      },
    });
    useProvider(provider);
    const hook = setup();
    const onAccountChanged = jest.fn();
    const onBlockchainChanged = jest.fn();

    expect(() => hook.register(onAccountChanged, onBlockchainChanged)).not.toThrow();
    await expect(hook.getAccount()).resolves.toBe(ADDRESS);
    await expect(hook.requestAccount()).resolves.toBe(ADDRESS);
  });
});

describe('provider read at request time', () => {
  it('uses a wallet injected after the hook was created', async () => {
    delete (window as any).ethereum;
    const hook = setup();
    (window as any).ethereum = createProvider();

    await expect(hook.getAccount()).resolves.toBe(ADDRESS);
    await expect(hook.requestAccount()).resolves.toBe(ADDRESS);
  });

  it('fails with the hint when no wallet is injected', async () => {
    delete (window as any).ethereum;
    const hook = setup();

    await expect(hook.getAccount()).rejects.toThrow(MISSING_WALLET);
    const request = hook.requestAccount();
    await expect(request).rejects.toBeInstanceOf(TranslatedError);
    await expect(request).rejects.toThrow(MISSING_WALLET);
  });

  it('fails with the hint when the provider has no request', async () => {
    useProvider({ isMetaMask: true, on: jest.fn() });

    const request = setup().requestAccount();
    await expect(request).rejects.toBeInstanceOf(TranslatedError);
    await expect(request).rejects.toThrow(MISSING_WALLET);
  });

  it('fails with the hint when reading the provider throws', async () => {
    Object.defineProperty(window, 'ethereum', {
      configurable: true,
      get() {
        throw new Error('unavailable');
      },
    });

    await expect(setup().requestAccount()).rejects.toThrow(MISSING_WALLET);
  });

  it('fails with the hint when reading request throws', async () => {
    const provider = { isMetaMask: true, on: jest.fn() };
    Object.defineProperty(provider, 'request', {
      configurable: true,
      get() {
        throw new Error('request unavailable');
      },
    });
    useProvider(provider);

    await expect(setup().requestAccount()).rejects.toThrow(MISSING_WALLET);
  });
});
