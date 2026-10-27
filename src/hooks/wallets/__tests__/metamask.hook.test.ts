import { renderHook } from '@testing-library/react';
import BigNumber from 'bignumber.js';
import { AbortError } from 'src/util/abort-error';

const web3Instances: any[] = [];
const mockTimeout = jest.fn();
const mockDevice = { isMobile: false };
const mockToChainHex = jest.fn((chain?: string) => (chain ? '0x1' : undefined));
const mockToChainObject = jest.fn(() => ({ chainId: '0x1', chainName: 'Ethereum' }));
const mockToWei = (value: string) => new BigNumber(value).shiftedBy(18).toFixed();

function createWeb3() {
  const instance = {
    eth: {
      getAccounts: jest.fn().mockResolvedValue([]),
      getChainId: jest.fn().mockResolvedValue(1),
      requestAccounts: jest.fn().mockResolvedValue([]),
      getBalance: jest.fn().mockResolvedValue('0'),
      personal: { sign: jest.fn().mockResolvedValue('signed') },
      sendTransaction: jest.fn().mockResolvedValue({ transactionHash: 'coin-hash' }),
      Contract: jest.fn().mockReturnValue({ methods: {} }),
    },
    utils: {
      toChecksumAddress: (address: string) => address,
      toHex: (value: number) => `0x${value.toString(16)}`,
      toWei: mockToWei,
    },
  };
  web3Instances.push(instance);
  return instance;
}

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: { ETHEREUM: 'Ethereum' },
  AssetType: { COIN: 'Coin', TOKEN: 'Token' },
}));
jest.mock('../../web3.hook', () => ({
  useWeb3: () => ({
    toBlockchain: (chainId: number | string) => (Number(chainId) === 1 ? 'Ethereum' : undefined),
    toChainHex: (chain?: string) => mockToChainHex(chain),
    toChainObject: (chain: string) => mockToChainObject(chain),
  }),
}));
jest.mock('../../../util/utils', () => ({ timeout: (...args: unknown[]) => mockTimeout(...args) }));
jest.mock('react-device-detect', () => ({
  get isMobile() {
    return mockDevice.isMobile;
  },
}));
jest.mock('web3', () => {
  const Web3Mock: any = jest.fn();
  Web3Mock.givenProvider = {};
  Web3Mock.utils = {
    toChecksumAddress: (address: string) => address,
    toHex: (value: number) => `0x${value.toString(16)}`,
    toWei: (value: string) => value,
  };
  return Web3Mock;
});

import Web3 from 'web3';
import { useMetaMask } from '../metamask.hook';

const account = '0x1234567890123456789012345678901234567890';

function setup(provider: Record<string, unknown> = {}) {
  (window as any).ethereum = provider;
  const hook = renderHook(() => useMetaMask());
  const web3 = web3Instances[web3Instances.length - 1];
  web3.eth.getAccounts.mockResolvedValue([account]);
  web3.eth.requestAccounts.mockResolvedValue([account]);
  mockTimeout.mockImplementation((promise: Promise<unknown>) => promise);
  return { ...hook, web3 };
}

beforeEach(() => {
  web3Instances.length = 0;
  (Web3 as unknown as jest.Mock).mockImplementation(createWeb3);
  mockTimeout.mockReset();
  mockTimeout.mockImplementation((promise: Promise<unknown>) => promise);
  mockToChainHex.mockImplementation((chain?: string) => (chain ? '0x1' : undefined));
  mockToChainObject.mockImplementation(() => ({ chainId: '0x1', chainName: 'Ethereum' }));
  mockDevice.isMobile = false;
});

afterEach(() => delete (window as any).ethereum);

describe('useMetaMask', () => {
  it('detects wallet types and conflicting injected providers', () => {
    expect(setup().result.current.isInstalled()).toBe(false);
    const originalAgent = window.navigator.userAgent;
    Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: 'Rainbow Wallet' });
    const { result } = setup({ isMetaMask: true });
    expect(result.current.isInstalled()).toBe(true);
    expect(result.current.getWalletType()).toBe('InAppBrowser');
    Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: 'Desktop browser' });
    expect(result.current.getWalletType()).toBe('MetaMask');
    const rabby = setup({ isRabby: true });
    expect(rabby.result.current.isInstalled()).toBe(true);
    expect(rabby.result.current.getWalletType()).toBe('Rabby');
    expect(setup({}).result.current.getWalletType()).toBeUndefined();
    expect(setup({ isCoinbaseWallet: true }).result.current.isInstalled()).toBe(true);
    mockDevice.isMobile = true;
    const trust = setup({ isTrust: true });
    expect(trust.result.current.isInstalled()).toBe(true);
    expect(trust.result.current.getWalletType()).toBe('InAppBrowser');
    (Web3 as unknown as jest.Mock).mockImplementationOnce(() => {
      throw new Error('provider proxy');
    });
    expect(setup({ isMetaMask: true }).result.current.isInstalled()).toBe(true);
    expect(Web3).toHaveBeenLastCalledWith();
    delete (window as any).ethereum;
    expect(result.current.isInstalled()).toBe(false);
    Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: originalAgent });
  });

  it('registers provider events and reads account, chain and balance', async () => {
    const listeners: Record<string, (value: any) => void> = {};
    const provider = { on: jest.fn((event: string, callback: (value: any) => void) => (listeners[event] = callback)) };
    const { result, web3 } = setup(provider);
    const accountChanged = jest.fn();
    const chainChanged = jest.fn();
    web3.eth.getAccounts.mockImplementation((callback?: (error: unknown, accounts: string[]) => void) => {
      callback?.(null, [account]);
      return Promise.resolve([account]);
    });
    web3.eth.getChainId.mockImplementation((callback?: (error: unknown, chainId: number) => void) => {
      callback?.(null, 1);
      return Promise.resolve(1);
    });
    web3.eth.getBalance.mockResolvedValue('42');
    result.current.register(accountChanged, chainChanged);
    listeners.accountsChanged([]);
    listeners.chainChanged('0x1');
    await expect(result.current.getAccount()).resolves.toBe(account);
    await expect(result.current.requestAccount()).resolves.toBe(account);
    await expect(result.current.requestBlockchain()).resolves.toBe('Ethereum');
    await expect(result.current.requestBalance(account)).resolves.toBe('42');
    expect(accountChanged).toHaveBeenCalledWith(undefined);
    expect(accountChanged).toHaveBeenCalledWith(account);
    expect(chainChanged).toHaveBeenCalledWith('Ethereum');
    web3.eth.getAccounts.mockResolvedValue([]);
    await expect(result.current.getAccount()).resolves.toBeUndefined();
    web3.eth.getChainId.mockResolvedValue(99);
    await expect(result.current.requestBlockchain()).resolves.toBeUndefined();
  });

  it('registers without an injected provider and returns no wallet type', () => {
    const { result } = setup();
    delete (window as any).ethereum;
    expect(result.current.isInstalled()).toBe(false);
    expect(result.current.getWalletType()).toBeUndefined();
    expect(() => result.current.register(jest.fn(), jest.fn())).not.toThrow();
  });

  it('returns undefined when account requests return undefined', async () => {
    const { result, web3 } = setup();
    web3.eth.getAccounts.mockResolvedValue(undefined);
    web3.eth.requestAccounts.mockResolvedValue(undefined);

    await expect(result.current.getAccount()).resolves.toBeUndefined();
    await expect(result.current.requestAccount()).resolves.toBeUndefined();
  });

  it('maps account errors and recovers from a connection timeout', async () => {
    const { result, web3 } = setup();
    web3.eth.requestAccounts.mockRejectedValueOnce({ code: 4001, message: 'Rejected' });
    const accountRejection = result.current.requestAccount();
    await expect(accountRejection).rejects.toBeInstanceOf(AbortError);
    await expect(accountRejection).rejects.toMatchObject({ message: 'User cancelled', code: 4001 });
    web3.eth.requestAccounts.mockRejectedValueOnce({ code: -32002, message: 'Pending' });
    await expect(result.current.requestAccount()).rejects.toThrow('There is already a request pending');
    const unexpected = { code: -32603, message: 'RPC failure' };
    web3.eth.requestAccounts.mockRejectedValueOnce(unexpected);
    await expect(result.current.requestAccount()).rejects.toBe(unexpected);
    web3.eth.requestAccounts.mockResolvedValueOnce([]);
    await expect(result.current.requestAccount()).resolves.toBeUndefined();
    const location = Object.getOwnPropertyDescriptor(window, 'location');
    const reload = jest.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload } });
    mockTimeout.mockRejectedValueOnce(new Error('Timeout connecting'));
    try {
      await expect(result.current.requestAccount()).resolves.toBe(account);
      expect(reload).toHaveBeenCalledTimes(1);
      mockTimeout.mockRejectedValueOnce(new Error('Provider unavailable'));
      web3.eth.requestAccounts.mockResolvedValueOnce([account]);
      await expect(result.current.requestAccount()).resolves.toBe(account);
    } finally {
      if (location) Object.defineProperty(window, 'location', location);
    }
  });

  it('switches and adds chains and maps wallet signing errors', async () => {
    const provider = { request: jest.fn().mockResolvedValue(undefined) };
    const { result, web3 } = setup(provider);
    await result.current.requestChangeToBlockchain(undefined);
    mockToChainHex.mockReturnValueOnce(undefined);
    await result.current.requestChangeToBlockchain('Ethereum' as any);
    provider.request.mockRejectedValueOnce({ code: 4902, message: 'Unknown chain' });
    await result.current.requestChangeToBlockchain('Ethereum' as any);
    expect(provider.request).toHaveBeenLastCalledWith({
      method: 'wallet_addEthereumChain',
      params: [expect.objectContaining({ chainId: '0x1' })],
    });
    provider.request.mockRejectedValueOnce({ code: 4001, message: 'Rejected' });
    const chainRejection = result.current.requestChangeToBlockchain('Ethereum' as any);
    await expect(chainRejection).rejects.toBeInstanceOf(AbortError);
    await expect(chainRejection).rejects.toMatchObject({ message: 'User cancelled', code: 4001 });
    web3.eth.personal.sign.mockRejectedValueOnce({ code: -32002, message: 'Pending' });
    await expect(result.current.sign(account, 'hello')).rejects.toThrow('There is already a request pending');
    const rpcError = { code: -32603, message: 'RPC error' };
    provider.request.mockRejectedValueOnce(rpcError);
    await expect(result.current.requestChangeToBlockchain('Ethereum' as any)).rejects.toBe(rpcError);
    await expect(result.current.sign(account, 'hello')).resolves.toBe('signed');
    web3.eth.personal.sign.mockRejectedValueOnce({ code: 4001, message: 'Rejected' });
    const signRejection = result.current.sign(account, 'hello');
    await expect(signRejection).rejects.toBeInstanceOf(AbortError);
    await expect(signRejection).rejects.toMatchObject({ message: 'User cancelled', code: 4001 });
  });

  it('adds token metadata and reads coin and token balances', async () => {
    const provider = { request: jest.fn().mockResolvedValue(true) };
    const { result, web3 } = setup(provider);
    const contract = {
      methods: {
        symbol: () => ({ call: jest.fn().mockResolvedValue('TOK') }),
        decimals: () => ({ call: jest.fn().mockResolvedValue(6) }),
        balanceOf: () => ({ call: jest.fn().mockResolvedValue('2500000') }),
      },
    };
    web3.eth.Contract.mockReturnValue(contract);
    const token = { type: 'Token', blockchain: 'Ethereum', chainId: '0xtoken' };
    await expect(result.current.addContract(token as any, '<svg/>', undefined)).resolves.toBe(false);
    await expect(result.current.addContract(token as any, '<svg/>', 'Ethereum' as any)).resolves.toBe(true);
    expect(provider.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'wallet_watchAsset' }));
    const coin = { type: 'Coin' };
    web3.eth.getBalance.mockResolvedValue('1000000000000000000');
    await expect(result.current.readBalance(coin as any, account)).resolves.toEqual({ asset: coin, amount: 1 });
    await expect(result.current.readBalance(token as any, account)).resolves.toEqual({ asset: token, amount: 2.5 });
    await expect(result.current.readBalance(token as any)).resolves.toEqual({ asset: token, amount: 0 });
    await expect(result.current.readBalance(undefined as any, account, true)).rejects.toThrow(
      'No address or asset provided',
    );
    web3.eth.Contract.mockReturnValue({
      methods: { decimals: () => ({ call: jest.fn().mockRejectedValue(new Error('token RPC failed')) }) },
    });
    await expect(result.current.readBalance(token as any, account)).resolves.toEqual({ asset: token, amount: 0 });
    await expect(result.current.readBalance(token as any, account, true)).rejects.toThrow('token RPC failed');
  });

  it('sends native and token transfers in regular units and wei', async () => {
    const { result, web3 } = setup();
    const coin = { type: 'Coin' };
    const token = { type: 'Token', chainId: '0xtoken' };
    await expect(result.current.createTransaction(new BigNumber('0.5'), coin as any, account, '0xto')).resolves.toBe(
      'coin-hash',
    );
    await result.current.createTransaction(new BigNumber('500'), coin as any, account, '0xto', {
      isWeiAmount: true,
      gasPrice: 5,
    });
    expect(web3.eth.sendTransaction).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        value: '500000000000000000',
        from: account,
        to: '0xto',
      }),
    );
    expect(web3.eth.sendTransaction).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ value: '500', from: account, to: '0xto' }),
    );
    const transfer = jest.fn().mockReturnValue({
      send: jest.fn().mockResolvedValue({ transactionHash: 'token-hash' }),
    });
    web3.eth.Contract.mockReturnValue({
      methods: { decimals: () => ({ call: jest.fn().mockResolvedValue(6) }), transfer },
    });
    await expect(result.current.createTransaction(new BigNumber('1.25'), token as any, account, '0xto')).resolves.toBe(
      'token-hash',
    );
    expect(transfer).toHaveBeenNthCalledWith(1, '0xto', '1250000');
    await result.current.createTransaction(new BigNumber('125'), token as any, account, '0xto', { isWeiAmount: true });
    expect(transfer).toHaveBeenLastCalledWith('0xto', '125');
  });
});
