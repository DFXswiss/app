// useMetaMask against the real web3 and a replaced injected provider: a request the user rejected in the wallet keeps
// its EIP-1193 code through web3, which rewrites a rejection that is not an Error but carries data into a new Error
// without the code. Other failures reach the caller exactly as before.

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

  it('leaves a legacy provider without request to web3', async () => {
    const legacy = {
      sendAsync: jest.fn((payload: { id: number }, callback: (e: unknown, r: unknown) => void) =>
        callback(null, { jsonrpc: '2.0', id: payload.id, result: [ADDRESS] }),
      ),
    };
    (Web3 as any).givenProvider = legacy;

    await expect(setup().getAccount()).resolves.toBe(ADDRESS);
    expect(legacy.sendAsync).toHaveBeenCalled();
  });
});
