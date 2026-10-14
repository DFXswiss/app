// useMetaMask with a replaced web3: the wallet type, the event registration, the connection check, balances, adding
// a token, transactions and the EIP-5792 and EIP-7702 calls, each with the failures the hook handles itself.

const mockGetAccounts = jest.fn();
const mockGetChainId = jest.fn();
const mockRequestAccounts = jest.fn();
const mockGetBalance = jest.fn();
const mockPersonalSign = jest.fn();
const mockSendTransaction = jest.fn();
const mockTimeout = jest.fn();
const mockContractMethods = {
  symbol: jest.fn(),
  decimals: jest.fn(),
  balanceOf: jest.fn(),
  transfer: jest.fn(),
};
const mockContract = jest.fn();
let mockIsMobile = false;

jest.mock('web3', () => {
  function MockWeb3() {
    return {
      eth: {
        getAccounts: (...args: unknown[]) => mockGetAccounts(...args),
        getChainId: (...args: unknown[]) => mockGetChainId(...args),
        requestAccounts: (...args: unknown[]) => mockRequestAccounts(...args),
        getBalance: (...args: unknown[]) => mockGetBalance(...args),
        personal: { sign: (...args: unknown[]) => mockPersonalSign(...args) },
        sendTransaction: (...args: unknown[]) => mockSendTransaction(...args),
        Contract: function Contract(...args: unknown[]) {
          mockContract(...args);
          return { methods: mockContractMethods };
        },
      },
      utils: { toWei: (value: string) => `${value}-wei` },
    };
  }
  MockWeb3.givenProvider = undefined;
  MockWeb3.utils = { toChecksumAddress: (address: string) => `checksum(${address})` };
  return MockWeb3;
});

jest.mock('@dfx.swiss/react', () => ({
  AssetType: { COIN: 'Coin', TOKEN: 'Token' },
  Blockchain: { ETHEREUM: 'Ethereum', POLYGON: 'Polygon' },
}));

jest.mock('../../web3.hook', () => ({
  useWeb3: () => ({
    toBlockchain: (chainId: string | number) => `chain-${chainId}`,
    toChainHex: (blockchain: string) => (blockchain === 'Ethereum' ? '0x1' : undefined),
    toChainObject: () => ({ chainId: '0x1' }),
  }),
}));

jest.mock('react-device-detect', () => ({
  get isMobile() {
    return mockIsMobile;
  },
}));

jest.mock('../../../util/utils', () => ({ timeout: (...args: unknown[]) => mockTimeout(...args) }));

import { Asset, AssetType, Blockchain } from '@dfx.swiss/react';
import { renderHook } from '@testing-library/react';
import BigNumber from 'bignumber.js';
import { AbortError } from '../../../util/abort-error';
import { Eip7702AuthorizationData, useMetaMask } from '../metamask.hook';

let ethereum: { request: jest.Mock; on: jest.Mock };
const originalLocation = window.location;

function setup() {
  return renderHook(() => useMetaMask()).result.current;
}

function call(value: unknown) {
  return { call: () => (value instanceof Error ? Promise.reject(value) : Promise.resolve(value)) };
}

beforeEach(() => {
  mockIsMobile = false;
  ethereum = { request: jest.fn(), on: jest.fn() };
  (window as any).ethereum = ethereum;
  mockTimeout.mockImplementation((promise: Promise<unknown>) => promise);
  mockGetAccounts.mockResolvedValue(['0xabc']);
});

afterEach(() => {
  delete (window as any).ethereum;
});

describe('getWalletType', () => {
  const userAgent = window.navigator.userAgent;

  afterEach(() => {
    Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: userAgent });
  });

  it('detects the browser inside a wallet app by its user agent', () => {
    Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 MetaMaskMobile' });
    (window as any).ethereum = { isMetaMask: true };

    expect(setup().getWalletType()).toBe('InAppBrowser');
  });

  it('detects the browser inside the Trust app on mobile', () => {
    mockIsMobile = true;
    (window as any).ethereum = { isTrust: true };

    expect(setup().getWalletType()).toBe('InAppBrowser');
  });

  it('does not know another injected wallet', () => {
    (window as any).ethereum = { isCoinbaseWallet: true };

    expect(setup().getWalletType()).toBeUndefined();
  });
});

describe('register', () => {
  it('reports the current and every changed account and chain', () => {
    const onAccountChanged = jest.fn();
    const onBlockchainChanged = jest.fn();
    mockGetAccounts.mockImplementation((callback: (e: unknown, a: string[]) => void) => callback(null, ['0xabc']));
    mockGetChainId.mockImplementation((callback: (e: unknown, c: number) => void) => callback(null, 1));

    setup().register(onAccountChanged, onBlockchainChanged);

    expect(onAccountChanged).toHaveBeenLastCalledWith('checksum(0xabc)');
    expect(onBlockchainChanged).toHaveBeenLastCalledWith('chain-1');

    const listeners = Object.fromEntries(ethereum.on.mock.calls);
    listeners.accountsChanged([]);
    listeners.chainChanged('0x89');

    expect(onAccountChanged).toHaveBeenLastCalledWith(undefined);
    expect(onBlockchainChanged).toHaveBeenLastCalledWith('chain-0x89');
  });

  it('registers only the web3 callbacks without an injected wallet', () => {
    delete (window as any).ethereum;
    const onAccountChanged = jest.fn();
    mockGetAccounts.mockImplementation((callback: (e: unknown, a?: string[]) => void) => callback(null, undefined));

    setup().register(onAccountChanged, jest.fn());

    expect(onAccountChanged).toHaveBeenCalledWith(undefined);
  });
});

describe('requestAccount', () => {
  beforeEach(() => {
    mockRequestAccounts.mockResolvedValue(['0xdef']);
  });

  it('reloads the page when the wallet does not answer in time', async () => {
    const reload = jest.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { reload } });
    mockTimeout.mockRejectedValue(new Error('Timeout'));

    try {
      await expect(setup().requestAccount()).resolves.toBe('checksum(0xdef)');
      expect(reload).toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    }
  });

  it('does not reload on another failure of the check', async () => {
    const reload = jest.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { reload } });
    mockTimeout.mockRejectedValue(new Error('Locked'));

    try {
      await expect(setup().requestAccount()).resolves.toBe('checksum(0xdef)');
      expect(reload).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    }
  });

  it('passes on a failure the hook does not handle', async () => {
    const error = { code: -32603, message: 'Internal error' };
    mockRequestAccounts.mockRejectedValue(error);

    await expect(setup().requestAccount()).rejects.toBe(error);
  });
});

describe('requestBlockchain and requestBalance', () => {
  it('returns the chain of the wallet', async () => {
    mockGetChainId.mockResolvedValue(137);

    await expect(setup().requestBlockchain()).resolves.toBe('chain-137');
  });

  it('returns the balance of the account', async () => {
    mockGetBalance.mockResolvedValue('42');

    await expect(setup().requestBalance('0xabc')).resolves.toBe('42');
    expect(mockGetBalance).toHaveBeenCalledWith('0xabc');
  });
});

describe('requestChangeToBlockchain', () => {
  it('does nothing without a blockchain', async () => {
    await expect(setup().requestChangeToBlockchain()).resolves.toBeUndefined();
    expect(ethereum.request).not.toHaveBeenCalled();
  });

  it('does nothing for a blockchain without a chain id', async () => {
    await expect(setup().requestChangeToBlockchain(Blockchain.POLYGON)).resolves.toBeUndefined();
    expect(ethereum.request).not.toHaveBeenCalled();
  });

  it('switches to the chain', async () => {
    ethereum.request.mockResolvedValue(null);

    await expect(setup().requestChangeToBlockchain(Blockchain.ETHEREUM)).resolves.toBeNull();
    expect(ethereum.request).toHaveBeenCalledWith({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x1' }],
    });
  });

  it('cancels when the user rejects the switch', async () => {
    ethereum.request.mockRejectedValue({ code: 4001, message: 'User rejected the request.' });

    await expect(setup().requestChangeToBlockchain(Blockchain.ETHEREUM)).rejects.toBeInstanceOf(AbortError);
  });

  it('fails reading the code of an empty failure of the switch', async () => {
    ethereum.request.mockRejectedValue(undefined);

    await expect(setup().requestChangeToBlockchain(Blockchain.ETHEREUM)).rejects.toBeInstanceOf(TypeError);
  });

  it('passes on an empty failure to add the chain', async () => {
    ethereum.request.mockRejectedValueOnce({ code: 4902, message: 'Unrecognized chain ID.' });
    ethereum.request.mockRejectedValueOnce(undefined);

    await expect(setup().requestChangeToBlockchain(Blockchain.ETHEREUM)).rejects.toBeUndefined();
  });
});

describe('sign', () => {
  it('returns the signature', async () => {
    mockPersonalSign.mockResolvedValue('0xsignature');

    await expect(setup().sign('0xabc', 'message')).resolves.toBe('0xsignature');
    expect(mockPersonalSign).toHaveBeenCalledWith('message', '0xabc', '');
  });
});

describe('addContract', () => {
  const asset = { blockchain: Blockchain.ETHEREUM, chainId: '0xtoken' } as Asset;

  it('switches to the chain of the token first', async () => {
    ethereum.request.mockResolvedValue(null);

    await expect(setup().addContract(asset, '<svg/>', Blockchain.POLYGON)).resolves.toBe(false);
    expect(ethereum.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'wallet_switchEthereumChain' }));
  });

  it('asks the wallet to watch the token', async () => {
    mockContractMethods.symbol.mockReturnValue(call('DFX'));
    mockContractMethods.decimals.mockReturnValue(call(18));
    ethereum.request.mockResolvedValue(true);

    await expect(setup().addContract(asset, '<svg/>', Blockchain.ETHEREUM)).resolves.toBe(true);
    expect(ethereum.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'wallet_watchAsset',
        params: {
          type: 'ERC20',
          options: {
            address: '0xtoken',
            symbol: 'DFX',
            decimals: 18,
            image: `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`,
          },
        },
      }),
    );
  });
});

describe('readBalance', () => {
  const coin = { type: AssetType.COIN } as Asset;
  const token = { type: AssetType.TOKEN, chainId: '0xtoken' } as Asset;

  it('reads nothing without an address', async () => {
    await expect(setup().readBalance(coin)).resolves.toEqual({ asset: coin, amount: 0 });
  });

  it('fails without an address when asked to', async () => {
    await expect(setup().readBalance(coin, undefined, true)).rejects.toThrow('No address or asset provided');
  });

  it('reads the coin balance', async () => {
    mockGetBalance.mockResolvedValue('1500000000000000000');

    await expect(setup().readBalance(coin, '0xabc')).resolves.toEqual({ asset: coin, amount: 1.5 });
  });

  it('reads the token balance with its decimals', async () => {
    mockContractMethods.decimals.mockReturnValue(call(6));
    mockContractMethods.balanceOf.mockReturnValue(call('2500000'));

    await expect(setup().readBalance(token, '0xabc')).resolves.toEqual({ asset: token, amount: 2.5 });
    expect(mockContractMethods.balanceOf).toHaveBeenCalledWith('0xabc');
  });

  it('reads zero when the balance fails', async () => {
    mockContractMethods.decimals.mockReturnValue(call(new Error('Execution reverted')));

    await expect(setup().readBalance(token, '0xabc')).resolves.toEqual({ asset: token, amount: 0 });
  });

  it('fails when the balance fails and it is asked to', async () => {
    mockContractMethods.decimals.mockReturnValue(call(new Error('Execution reverted')));

    await expect(setup().readBalance(token, '0xabc', true)).rejects.toThrow('Execution reverted');
  });
});

describe('createTransaction', () => {
  it('sends a coin amount converted to wei', async () => {
    mockSendTransaction.mockResolvedValue({ transactionHash: '0xhash' });

    await expect(
      setup().createTransaction(new BigNumber(1), { type: AssetType.COIN } as Asset, '0xfrom', '0xto', {
        gasPrice: 5,
      }),
    ).resolves.toBe('0xhash');
    expect(mockSendTransaction).toHaveBeenCalledWith({
      from: '0xfrom',
      to: '0xto',
      value: '1-wei',
      maxPriorityFeePerGas: null,
      maxFeePerGas: null,
      gasPrice: 5,
    });
  });

  it('sends a coin amount already in wei', async () => {
    mockSendTransaction.mockResolvedValue({ transactionHash: '0xhash' });

    await setup().createTransaction(new BigNumber(1000), { type: AssetType.COIN } as Asset, '0xfrom', '0xto', {
      isWeiAmount: true,
    });
    expect(mockSendTransaction).toHaveBeenCalledWith(expect.objectContaining({ value: '1000' }));
  });

  it('transfers a token amount converted with its decimals', async () => {
    const send = jest.fn().mockResolvedValue({ transactionHash: '0xtoken-hash' });
    mockContractMethods.decimals.mockReturnValue(call(6));
    mockContractMethods.transfer.mockReturnValue({ send });

    await expect(
      setup().createTransaction(
        new BigNumber(1.5),
        { type: AssetType.TOKEN, chainId: '0xtoken' } as Asset,
        '0xf',
        '0xt',
      ),
    ).resolves.toBe('0xtoken-hash');
    expect(mockContractMethods.transfer).toHaveBeenCalledWith('0xt', '1500000');
    expect(send).toHaveBeenCalledWith({
      from: '0xf',
      maxPriorityFeePerGas: null,
      maxFeePerGas: null,
      gasPrice: undefined,
    });
  });

  it('transfers a token amount already in its smallest unit', async () => {
    const send = jest.fn().mockResolvedValue({ transactionHash: '0xtoken-hash' });
    mockContractMethods.transfer.mockReturnValue({ send });

    await setup().createTransaction(
      new BigNumber(1500000),
      { type: AssetType.TOKEN, chainId: '0xtoken' } as Asset,
      '0xf',
      '0xt',
      { isWeiAmount: true, gasPrice: 7 },
    );
    expect(mockContractMethods.decimals).not.toHaveBeenCalled();
    expect(mockContractMethods.transfer).toHaveBeenCalledWith('0xt', '1500000');
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ gasPrice: 7 }));
  });
});

describe('signEip7702Authorization', () => {
  const authData: Eip7702AuthorizationData = {
    contractAddress: '0xdelegate',
    chainId: 1,
    nonce: 3,
    typedData: { domain: {}, types: {}, primaryType: 'Authorization', message: {} },
  };

  it('splits the typed data signature into its parts', async () => {
    const r = `0x${'a'.repeat(64)}`;
    const s = 'b'.repeat(64);
    ethereum.request.mockResolvedValue(`${r}${s}1c`);

    await expect(setup().signEip7702Authorization(authData)).resolves.toEqual({
      chainId: 1,
      address: '0xdelegate',
      nonce: 3,
      r,
      s: `0x${s}`,
      yParity: 1,
    });
    expect(ethereum.request).toHaveBeenCalledWith({
      method: 'eth_signTypedData_v4',
      params: ['checksum(0xabc)', JSON.stringify(authData.typedData)],
    });
  });

  it('fails without a connected account', async () => {
    mockGetAccounts.mockResolvedValue([]);

    await expect(setup().signEip7702Authorization(authData)).rejects.toThrow('No account connected');
  });

  it('cancels when the user rejects the signature', async () => {
    ethereum.request.mockRejectedValue({ code: 4001, message: 'User rejected the request.' });

    await expect(setup().signEip7702Authorization(authData)).rejects.toBeInstanceOf(AbortError);
  });
});

describe('EIP-5792 calls', () => {
  const calls = [{ to: '0xto', data: '0xdata', value: '0x0' }];

  it('reports no paymaster support without a connected account', async () => {
    mockGetAccounts.mockResolvedValue([]);

    await expect(setup().supportsEip5792Paymaster(1)).resolves.toBe(false);
  });

  it('fails to send calls without a connected account', async () => {
    mockGetAccounts.mockResolvedValue([]);

    await expect(setup().sendCallsWithPaymaster(calls, 'https://paymaster', 1)).rejects.toThrow('No account connected');
  });

  it('waits on the calls id the wallet returns as a plain value', async () => {
    ethereum.request.mockImplementation(({ method }: { method: string }) => {
      switch (method) {
        case 'wallet_getCapabilities':
          return Promise.resolve({ '0x1': { paymasterService: { supported: true } } });
        case 'wallet_sendCalls':
          return Promise.resolve('calls-id');
        default:
          return Promise.resolve({ status: 'CONFIRMED', receipts: [{ transactionHash: '0xhash' }] });
      }
    });

    await expect(setup().sendCallsWithPaymaster(calls, 'https://paymaster', 1)).resolves.toBe('0xhash');
    expect(ethereum.request).toHaveBeenCalledWith({ method: 'wallet_getCallsStatus', params: ['calls-id'] });
  });

  it('gives up waiting after two minutes', async () => {
    ethereum.request.mockImplementation(({ method }: { method: string }) => {
      switch (method) {
        case 'wallet_getCapabilities':
          return Promise.resolve({ '0x1': { paymasterService: { supported: true } } });
        case 'wallet_sendCalls':
          return Promise.resolve({ id: 'calls-id' });
        default:
          return Promise.resolve({ status: 'PENDING' });
      }
    });

    const { sendCallsWithPaymaster } = setup();
    // each poll waits a second
    const wait = jest.spyOn(global, 'setTimeout').mockImplementation((resolve: () => void) => {
      resolve();
      return 0 as unknown as NodeJS.Timeout;
    });

    try {
      await expect(sendCallsWithPaymaster(calls, 'https://paymaster', 1)).rejects.toThrow(
        'Transaction timeout - please check your wallet',
      );
      expect(wait).toHaveBeenCalledTimes(120);
    } finally {
      wait.mockRestore();
    }
    expect(ethereum.request).toHaveBeenCalledTimes(122);
  });
});
