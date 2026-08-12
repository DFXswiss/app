/**
 * Tests for useMetaMask hook.
 *
 * Note: EIP-5792 flow logic is also tested in src/__tests__/eip5792-flow.test.ts
 * with proper isolation. These tests cover the hook itself: wallet detection,
 * account/chain handling, balance reads, transactions, signing and the
 * EIP-5792/EIP-7702 wallet requests, against mocked viem clients.
 */
import { renderHook, waitFor } from '@testing-library/react';

// Mock @dfx.swiss/react
jest.mock('@dfx.swiss/react', () => ({
  Blockchain: {
    ETHEREUM: 'Ethereum',
    OPTIMISM: 'Optimism',
    POLYGON: 'Polygon',
    ARBITRUM: 'Arbitrum',
    BASE: 'Base',
    BINANCE_SMART_CHAIN: 'BinanceSmartChain',
  },
  AssetType: {
    COIN: 'Coin',
    TOKEN: 'Token',
  },
}));

// Mock useWeb3 hook (configurable per test)
const mockToBlockchain = jest.fn();
const mockToChainHex = jest.fn();
const mockToChainObject = jest.fn();
jest.mock('../../web3.hook', () => ({
  useWeb3: () => ({
    toBlockchain: mockToBlockchain,
    toChainHex: mockToChainHex,
    toChainObject: mockToChainObject,
  }),
}));

// Mock react-device-detect (settable per test)
let mockIsMobile = false;
jest.mock('react-device-detect', () => ({
  get isMobile() {
    return mockIsMobile;
  },
}));

// Mock the viem client factories so hook logic (argument construction, error handling,
// amount math) can be tested without a real wallet/RPC endpoint. The factory arguments
// are captured so the transport built around the fallback provider can be exercised.
const mockPublicClient = {
  getBalance: jest.fn(),
  readContract: jest.fn(),
  getChainId: jest.fn(),
  getGasPrice: jest.fn(),
  waitForTransactionReceipt: jest.fn(),
};
const mockWalletClient = {
  getAddresses: jest.fn(),
  requestAddresses: jest.fn(),
  signMessage: jest.fn(),
  sendTransaction: jest.fn(),
  writeContract: jest.fn(),
};
let mockCapturedPublicClientOpts: any;
jest.mock('viem', () => ({
  ...jest.requireActual('viem'),
  createPublicClient: (opts: any) => {
    mockCapturedPublicClientOpts = opts;
    return mockPublicClient;
  },
  createWalletClient: () => mockWalletClient,
}));

import BigNumber from 'bignumber.js';
import { BaseError, getAddress, UserRejectedRequestError } from 'viem';
import { AbortError } from '../../../util/abort-error';
import { TranslatedError } from '../../../util/translated-error';
import { useMetaMask } from '../metamask.hook';

const COIN_ASSET = { type: 'Coin', blockchain: 'Ethereum' } as any;
const TOKEN_ASSET = { type: 'Token', blockchain: 'Ethereum', chainId: '0xTokenAddress' } as any;
const TEST_ADDRESS = '0x1234567890123456789012345678901234567890';
const CHECKSUMMED_ADDRESS = getAddress(TEST_ADDRESS);

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}

// This Jest version has no async fake-timer API, so let waiting code run without delay instead.
function makeTimersImmediate() {
  jest.spyOn(global, 'setTimeout').mockImplementation(((cb: () => void) => {
    cb();
    return 0;
  }) as any);
}

describe('useMetaMask', () => {
  const originalLocation = window.location;

  beforeAll(() => {
    delete (window as any).location;
    (window as any).location = { ...originalLocation, reload: jest.fn() };
  });

  afterAll(() => {
    (window as any).location = originalLocation;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsMobile = false;
    mockToBlockchain.mockReturnValue('Ethereum');
    mockToChainHex.mockReturnValue('0x1');
    mockToChainObject.mockReturnValue(undefined);
  });

  afterEach(() => {
    delete (window as any).ethereum;
    delete (window.navigator as any).userAgent;
    jest.restoreAllMocks();
  });

  describe('provider fallback', () => {
    it('defers a missing provider to an error on first use instead of throwing at setup', async () => {
      renderHook(() => useMetaMask());

      const transport = mockCapturedPublicClientOpts.transport({});
      await expect(transport.request({ method: 'eth_chainId' })).rejects.toThrow(/No wallet provider available/);
    });
  });

  describe('isInstalled', () => {
    it('should return true when MetaMask is installed', () => {
      (window as any).ethereum = { isMetaMask: true };
      const { result } = renderHook(() => useMetaMask());
      expect(result.current.isInstalled()).toBe(true);
    });

    it('should return false when ethereum is not available', () => {
      const { result } = renderHook(() => useMetaMask());
      expect(result.current.isInstalled()).toBe(false);
    });

    it('should return false when the provider is none of the known wallets', () => {
      (window as any).ethereum = {};
      const { result } = renderHook(() => useMetaMask());
      expect(result.current.isInstalled()).toBe(false);
    });

    it('should return true for Rabby wallet', () => {
      (window as any).ethereum = { isRabby: true };
      const { result } = renderHook(() => useMetaMask());
      expect(result.current.isInstalled()).toBe(true);
    });

    it('should return true for CoinbaseWallet', () => {
      (window as any).ethereum = { isCoinbaseWallet: true };
      const { result } = renderHook(() => useMetaMask());
      expect(result.current.isInstalled()).toBe(true);
    });

    it('should return true for Trust wallet', () => {
      (window as any).ethereum = { isTrust: true };
      const { result } = renderHook(() => useMetaMask());
      expect(result.current.isInstalled()).toBe(true);
    });
  });

  describe('getWalletType', () => {
    it('should return META_MASK for MetaMask wallet', () => {
      (window as any).ethereum = { isMetaMask: true };
      const { result } = renderHook(() => useMetaMask());
      expect(result.current.getWalletType()).toBe('MetaMask');
    });

    it('should return RABBY for Rabby wallet', () => {
      (window as any).ethereum = { isRabby: true };
      const { result } = renderHook(() => useMetaMask());
      expect(result.current.getWalletType()).toBe('Rabby');
    });

    it('should return undefined when no wallet is detected', () => {
      const { result } = renderHook(() => useMetaMask());
      expect(result.current.getWalletType()).toBeUndefined();
    });

    it('should return undefined for an unknown provider', () => {
      (window as any).ethereum = {};
      const { result } = renderHook(() => useMetaMask());
      expect(result.current.getWalletType()).toBeUndefined();
    });

    it('should return IN_APP_BROWSER when the user agent names a wallet', () => {
      setUserAgent('Mozilla/5.0 MetaMaskMobile/7.0');
      (window as any).ethereum = { isMetaMask: true };
      const { result } = renderHook(() => useMetaMask());
      expect(result.current.getWalletType()).toBe('InAppBrowser');
    });

    it('should return IN_APP_BROWSER for Trust wallet on mobile', () => {
      mockIsMobile = true;
      (window as any).ethereum = { isTrust: true };
      const { result } = renderHook(() => useMetaMask());
      expect(result.current.getWalletType()).toBe('InAppBrowser');
    });

    it('should return IN_APP_BROWSER for CoinbaseWallet on mobile', () => {
      mockIsMobile = true;
      (window as any).ethereum = { isCoinbaseWallet: true };
      const { result } = renderHook(() => useMetaMask());
      expect(result.current.getWalletType()).toBe('InAppBrowser');
    });

    it('should not treat Trust wallet on desktop as an in-app browser', () => {
      (window as any).ethereum = { isTrust: true };
      const { result } = renderHook(() => useMetaMask());
      expect(result.current.getWalletType()).toBeUndefined();
    });
  });

  describe('hook interface', () => {
    it('should expose all required functions', () => {
      (window as any).ethereum = { isMetaMask: true, request: jest.fn(), on: jest.fn() };
      const { result } = renderHook(() => useMetaMask());

      expect(typeof result.current.isInstalled).toBe('function');
      expect(typeof result.current.getWalletType).toBe('function');
      expect(typeof result.current.register).toBe('function');
      expect(typeof result.current.getAccount).toBe('function');
      expect(typeof result.current.requestAccount).toBe('function');
      expect(typeof result.current.requestBlockchain).toBe('function');
      expect(typeof result.current.requestChangeToBlockchain).toBe('function');
      expect(typeof result.current.requestBalance).toBe('function');
      expect(typeof result.current.sign).toBe('function');
      expect(typeof result.current.addContract).toBe('function');
      expect(typeof result.current.readBalance).toBe('function');
      expect(typeof result.current.createTransaction).toBe('function');
      expect(typeof result.current.sendCallsWithPaymaster).toBe('function');
      expect(typeof result.current.supportsEip5792Paymaster).toBe('function');
      expect(typeof result.current.signEip7702Authorization).toBe('function');
    });
  });

  describe('register', () => {
    it('reports the current account and chain and forwards provider events', async () => {
      const on = jest.fn();
      (window as any).ethereum = { isMetaMask: true, request: jest.fn(), on };
      mockWalletClient.getAddresses.mockResolvedValue([TEST_ADDRESS]);
      mockPublicClient.getChainId.mockResolvedValue(1);
      const onAccountChanged = jest.fn();
      const onBlockchainChanged = jest.fn();

      const { result } = renderHook(() => useMetaMask());
      result.current.register(onAccountChanged, onBlockchainChanged);

      await waitFor(() => expect(onAccountChanged).toHaveBeenCalledWith(CHECKSUMMED_ADDRESS));
      await waitFor(() => expect(onBlockchainChanged).toHaveBeenCalledWith('Ethereum'));

      const accountsHandler = on.mock.calls.find((c) => c[0] === 'accountsChanged')?.[1];
      const chainHandler = on.mock.calls.find((c) => c[0] === 'chainChanged')?.[1];

      accountsHandler([]);
      expect(onAccountChanged).toHaveBeenLastCalledWith(undefined);
      accountsHandler(undefined);
      expect(onAccountChanged).toHaveBeenLastCalledWith(undefined);
      accountsHandler([TEST_ADDRESS]);
      expect(onAccountChanged).toHaveBeenLastCalledWith(CHECKSUMMED_ADDRESS);

      chainHandler('0x1');
      expect(onBlockchainChanged).toHaveBeenLastCalledWith('Ethereum');
    });

    it('reports undefined when the account and chain cannot be read', async () => {
      (window as any).ethereum = { isMetaMask: true, request: jest.fn(), on: jest.fn() };
      mockWalletClient.getAddresses.mockRejectedValue(new Error('not connected'));
      mockPublicClient.getChainId.mockRejectedValue(new Error('not connected'));
      const onAccountChanged = jest.fn();
      const onBlockchainChanged = jest.fn();

      const { result } = renderHook(() => useMetaMask());
      result.current.register(onAccountChanged, onBlockchainChanged);

      await waitFor(() => expect(onAccountChanged).toHaveBeenCalledWith(undefined));
      await waitFor(() => expect(onBlockchainChanged).toHaveBeenCalledWith(undefined));
    });

    it('does not subscribe to provider events when no provider is injected', async () => {
      mockWalletClient.getAddresses.mockResolvedValue([]);
      mockPublicClient.getChainId.mockResolvedValue(1);
      const onAccountChanged = jest.fn();
      const onBlockchainChanged = jest.fn();

      const { result } = renderHook(() => useMetaMask());
      result.current.register(onAccountChanged, onBlockchainChanged);

      await waitFor(() => expect(onAccountChanged).toHaveBeenCalledWith(undefined));
      await waitFor(() => expect(onBlockchainChanged).toHaveBeenCalledWith('Ethereum'));
    });
  });

  describe('requestAccount', () => {
    beforeEach(() => {
      (window as any).ethereum = { isMetaMask: true, request: jest.fn(), on: jest.fn() };
    });

    it('requests wallet addresses and returns the checksummed account', async () => {
      mockWalletClient.getAddresses.mockResolvedValue([TEST_ADDRESS]);
      mockWalletClient.requestAddresses.mockResolvedValue([TEST_ADDRESS]);

      const { result } = renderHook(() => useMetaMask());
      await expect(result.current.requestAccount()).resolves.toBe(CHECKSUMMED_ADDRESS);
      expect((window as any).location.reload).not.toHaveBeenCalled();
    });

    it('reloads the page when the connection check times out', async () => {
      mockWalletClient.getAddresses.mockReturnValue(new Promise(() => undefined));
      mockWalletClient.requestAddresses.mockResolvedValue([TEST_ADDRESS]);

      const { result } = renderHook(() => useMetaMask());
      makeTimersImmediate();
      await result.current.requestAccount();

      expect((window as any).location.reload).toHaveBeenCalled();
    });

    it('does not reload the page when the connection check fails for another reason', async () => {
      mockWalletClient.getAddresses.mockRejectedValue(new Error('provider gone'));
      mockWalletClient.requestAddresses.mockResolvedValue([TEST_ADDRESS]);

      const { result } = renderHook(() => useMetaMask());
      await expect(result.current.requestAccount()).resolves.toBe(CHECKSUMMED_ADDRESS);
      expect((window as any).location.reload).not.toHaveBeenCalled();
    });

    it('maps a user rejection to an AbortError', async () => {
      mockWalletClient.getAddresses.mockResolvedValue([TEST_ADDRESS]);
      mockWalletClient.requestAddresses.mockRejectedValue({ code: 4001, message: 'User rejected' });

      const { result } = renderHook(() => useMetaMask());
      const promise = result.current.requestAccount();
      await expect(promise).rejects.toBeInstanceOf(AbortError);
      await expect(result.current.requestAccount()).rejects.toThrow('User cancelled');
    });

    it('maps a pending-request error to a TranslatedError', async () => {
      mockWalletClient.getAddresses.mockResolvedValue([TEST_ADDRESS]);
      mockWalletClient.requestAddresses.mockRejectedValue({ code: -32002, message: 'Already processing' });

      const { result } = renderHook(() => useMetaMask());
      const promise = result.current.requestAccount();
      await expect(promise).rejects.toBeInstanceOf(TranslatedError);
      await expect(result.current.requestAccount()).rejects.toThrow(
        'There is already a request pending. Please confirm it in your MetaMask and retry.',
      );
    });

    it('rethrows unknown wallet errors unchanged', async () => {
      const error = { code: 123, message: 'unknown' };
      mockWalletClient.getAddresses.mockResolvedValue([TEST_ADDRESS]);
      mockWalletClient.requestAddresses.mockRejectedValue(error);

      const { result } = renderHook(() => useMetaMask());
      await expect(result.current.requestAccount()).rejects.toBe(error);
    });
  });

  describe('getAccount', () => {
    it('returns undefined when no account is connected', async () => {
      (window as any).ethereum = { isMetaMask: true, request: jest.fn(), on: jest.fn() };
      mockWalletClient.getAddresses.mockResolvedValue([]);

      const { result } = renderHook(() => useMetaMask());
      await expect(result.current.getAccount()).resolves.toBeUndefined();
    });
  });

  describe('requestBlockchain', () => {
    it('maps the current chain id to a blockchain', async () => {
      (window as any).ethereum = { isMetaMask: true, request: jest.fn(), on: jest.fn() };
      mockPublicClient.getChainId.mockResolvedValue(1);

      const { result } = renderHook(() => useMetaMask());
      await expect(result.current.requestBlockchain()).resolves.toBe('Ethereum');
      expect(mockToBlockchain).toHaveBeenCalledWith(1);
    });
  });

  describe('requestChangeToBlockchain', () => {
    let request: jest.Mock;

    beforeEach(() => {
      request = jest.fn();
      (window as any).ethereum = { isMetaMask: true, request, on: jest.fn() };
    });

    it('does nothing without a blockchain', async () => {
      const { result } = renderHook(() => useMetaMask());
      await result.current.requestChangeToBlockchain(undefined);
      expect(request).not.toHaveBeenCalled();
    });

    it('does nothing for a blockchain without a chain id', async () => {
      mockToChainHex.mockReturnValue(undefined);

      const { result } = renderHook(() => useMetaMask());
      await result.current.requestChangeToBlockchain('Ethereum' as any);
      expect(request).not.toHaveBeenCalled();
    });

    it('switches the wallet to the requested chain', async () => {
      request.mockResolvedValue(null);

      const { result } = renderHook(() => useMetaMask());
      await result.current.requestChangeToBlockchain('Ethereum' as any);

      expect(request).toHaveBeenCalledWith({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x1' }],
      });
    });

    it('adds the chain to the wallet when it is not registered yet', async () => {
      const chain = { chainId: '0x1', chainName: 'Ethereum Mainnet' };
      mockToChainObject.mockReturnValue(chain);
      request.mockRejectedValueOnce({ code: 4902, message: 'Unrecognized chain' }).mockResolvedValueOnce(null);

      const { result } = renderHook(() => useMetaMask());
      await result.current.requestChangeToBlockchain('Ethereum' as any);

      expect(request).toHaveBeenLastCalledWith({
        method: 'wallet_addEthereumChain',
        params: [chain],
      });
    });

    it('maps a user rejection to an AbortError', async () => {
      request.mockRejectedValue({ code: 4001, message: 'User rejected' });

      const { result } = renderHook(() => useMetaMask());
      await expect(result.current.requestChangeToBlockchain('Ethereum' as any)).rejects.toBeInstanceOf(AbortError);
    });

    it('fails on a rejection without an error object', async () => {
      request.mockRejectedValue(undefined);

      const { result } = renderHook(() => useMetaMask());
      await expect(result.current.requestChangeToBlockchain('Ethereum' as any)).rejects.toThrow(TypeError);
    });
  });

  describe('requestBalance', () => {
    it('returns the native balance as a string', async () => {
      (window as any).ethereum = { isMetaMask: true, request: jest.fn(), on: jest.fn() };
      mockPublicClient.getBalance.mockResolvedValue(123n);

      const { result } = renderHook(() => useMetaMask());
      await expect(result.current.requestBalance(TEST_ADDRESS)).resolves.toBe('123');
      expect(mockPublicClient.getBalance).toHaveBeenCalledWith({ address: TEST_ADDRESS });
    });
  });

  describe('sign', () => {
    it('signs a message with the given account', async () => {
      (window as any).ethereum = { isMetaMask: true, request: jest.fn(), on: jest.fn() };
      mockWalletClient.signMessage.mockResolvedValue('0xsignature');

      const { result } = renderHook(() => useMetaMask());
      const signature = await result.current.sign(TEST_ADDRESS, 'hello');

      expect(mockWalletClient.signMessage).toHaveBeenCalledWith({ account: TEST_ADDRESS, message: 'hello' });
      expect(signature).toBe('0xsignature');
    });

    it('signs a hex-shaped message as the bytes it encodes', async () => {
      (window as any).ethereum = { isMetaMask: true, request: jest.fn(), on: jest.fn() };
      mockWalletClient.signMessage.mockResolvedValue('0xsignature');

      const { result } = renderHook(() => useMetaMask());
      await result.current.sign(TEST_ADDRESS, '0xdeadbeef');

      expect(mockWalletClient.signMessage).toHaveBeenCalledWith({
        account: TEST_ADDRESS,
        message: { raw: '0xdeadbeef' },
      });
    });

    it('maps a user rejection to an AbortError', async () => {
      (window as any).ethereum = { isMetaMask: true, request: jest.fn(), on: jest.fn() };
      mockWalletClient.signMessage.mockRejectedValue({ code: 4001, message: 'User rejected' });

      const { result } = renderHook(() => useMetaMask());
      await expect(result.current.sign(TEST_ADDRESS, 'hello')).rejects.toBeInstanceOf(AbortError);
    });
  });

  describe('addContract', () => {
    let request: jest.Mock;

    beforeEach(() => {
      request = jest.fn();
      (window as any).ethereum = { isMetaMask: true, request, on: jest.fn() };
    });

    it('switches the chain and reports failure when the wallet is on another blockchain', async () => {
      request.mockResolvedValue(null);

      const { result } = renderHook(() => useMetaMask());
      await expect(result.current.addContract(TOKEN_ASSET, '<svg/>', 'Polygon' as any)).resolves.toBe(false);

      expect(request).toHaveBeenCalledWith({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x1' }],
      });
    });

    it('registers the token with its on-chain symbol, decimals and icon', async () => {
      mockPublicClient.readContract.mockImplementation(({ functionName }: { functionName: string }) => {
        if (functionName === 'symbol') return Promise.resolve('USDT');
        if (functionName === 'decimals') return Promise.resolve(6);
        throw new Error(`unexpected call: ${functionName}`);
      });
      request.mockResolvedValue(true);

      const { result } = renderHook(() => useMetaMask());
      await expect(result.current.addContract(TOKEN_ASSET, '<svg/>', 'Ethereum' as any)).resolves.toBe(true);

      const call = request.mock.calls[0][0];
      expect(call.method).toBe('wallet_watchAsset');
      expect(call.params.options).toEqual({
        address: TOKEN_ASSET.chainId,
        symbol: 'USDT',
        decimals: 6,
        image: `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`,
      });
    });
  });

  describe('readBalance', () => {
    beforeEach(() => {
      (window as any).ethereum = { isMetaMask: true, request: jest.fn(), on: jest.fn() };
    });

    it('reads a native coin balance', async () => {
      mockPublicClient.getBalance.mockResolvedValue(1_500000000000000000n); // 1.5 ETH in wei

      const { result } = renderHook(() => useMetaMask());
      const balance = await result.current.readBalance(COIN_ASSET, TEST_ADDRESS);

      expect(mockPublicClient.getBalance).toHaveBeenCalledWith({ address: TEST_ADDRESS });
      expect(balance.amount).toBeCloseTo(1.5);
    });

    it('reads an ERC20 token balance using its own decimals', async () => {
      mockPublicClient.readContract.mockImplementation(({ functionName }: { functionName: string }) => {
        if (functionName === 'decimals') return Promise.resolve(6);
        if (functionName === 'balanceOf') return Promise.resolve(2_500000n); // 2.5 tokens at 6 decimals
        throw new Error(`unexpected call: ${functionName}`);
      });

      const { result } = renderHook(() => useMetaMask());
      const balance = await result.current.readBalance(TOKEN_ASSET, TEST_ADDRESS);

      expect(balance.amount).toBeCloseTo(2.5);
    });

    it('returns a zero balance when no address is given', async () => {
      const { result } = renderHook(() => useMetaMask());
      await expect(result.current.readBalance(COIN_ASSET)).resolves.toEqual({ asset: COIN_ASSET, amount: 0 });
    });

    it('throws when no asset is given and throwExceptions is set', async () => {
      const { result } = renderHook(() => useMetaMask());
      await expect(result.current.readBalance(undefined as any, TEST_ADDRESS, true)).rejects.toThrow(
        'No address or asset provided',
      );
    });

    it('falls back to a zero balance instead of throwing when throwExceptions is not set', async () => {
      mockPublicClient.getBalance.mockRejectedValue(new Error('RPC unavailable'));

      const { result } = renderHook(() => useMetaMask());
      const balance = await result.current.readBalance(COIN_ASSET, TEST_ADDRESS);

      expect(balance).toEqual({ asset: COIN_ASSET, amount: 0 });
    });

    it('propagates the error when throwExceptions is true', async () => {
      mockPublicClient.getBalance.mockRejectedValue(new Error('RPC unavailable'));

      const { result } = renderHook(() => useMetaMask());
      await expect(result.current.readBalance(COIN_ASSET, TEST_ADDRESS, true)).rejects.toThrow('RPC unavailable');
    });
  });

  describe('createTransaction', () => {
    beforeEach(() => {
      (window as any).ethereum = { isMetaMask: true, request: jest.fn(), on: jest.fn() };
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({ status: 'success', transactionHash: '0xhash' });
    });

    it('sends no fee fields when no override is given, leaving estimation to the wallet', async () => {
      mockWalletClient.sendTransaction.mockResolvedValue('0xhash');

      const { result } = renderHook(() => useMetaMask());
      await result.current.createTransaction(new BigNumber(1), COIN_ASSET, TEST_ADDRESS, TEST_ADDRESS);

      expect(mockPublicClient.getGasPrice).not.toHaveBeenCalled();
      const call = mockWalletClient.sendTransaction.mock.calls[0][0];
      expect(call.gasPrice).toBeUndefined();
      expect(call.maxFeePerGas).toBeUndefined();
      expect(call.maxPriorityFeePerGas).toBeUndefined();
    });

    it('uses the provided gasPrice override instead of fetching the network gas price', async () => {
      mockWalletClient.sendTransaction.mockResolvedValue('0xhash');

      const { result } = renderHook(() => useMetaMask());
      await result.current.createTransaction(new BigNumber(1), COIN_ASSET, TEST_ADDRESS, TEST_ADDRESS, {
        isWeiAmount: true,
        gasPrice: 99,
      });

      expect(mockPublicClient.getGasPrice).not.toHaveBeenCalled();
      const call = mockWalletClient.sendTransaction.mock.calls[0][0];
      expect(call.gasPrice).toBe(99n);
    });

    it('waits for the transaction to be mined before returning the hash', async () => {
      mockWalletClient.sendTransaction.mockResolvedValue('0xhash');

      const { result } = renderHook(() => useMetaMask());
      const hash = await result.current.createTransaction(new BigNumber(1), COIN_ASSET, TEST_ADDRESS, TEST_ADDRESS);

      expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ hash: '0xhash', timeout: 750_000 }),
      );
      expect(hash).toBe('0xhash');
    });

    it('rejects when the mined transaction was reverted', async () => {
      mockWalletClient.sendTransaction.mockResolvedValue('0xhash');
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({ status: 'reverted', transactionHash: '0xhash' });

      const { result } = renderHook(() => useMetaMask());
      await expect(
        result.current.createTransaction(new BigNumber(1), COIN_ASSET, TEST_ADDRESS, TEST_ADDRESS),
      ).rejects.toThrow('Transaction has been reverted by the EVM: 0xhash');
    });

    it('returns the hash that actually mined when the wallet repriced the transaction', async () => {
      mockWalletClient.sendTransaction.mockResolvedValue('0xhash');
      mockPublicClient.waitForTransactionReceipt.mockImplementation(({ onReplaced }: { onReplaced: any }) => {
        onReplaced({ reason: 'repriced' });
        return Promise.resolve({ status: 'success', transactionHash: '0xspedup' });
      });

      const { result } = renderHook(() => useMetaMask());
      await expect(
        result.current.createTransaction(new BigNumber(1), COIN_ASSET, TEST_ADDRESS, TEST_ADDRESS),
      ).resolves.toBe('0xspedup');
    });

    it('rejects when the wallet cancelled the transaction', async () => {
      mockWalletClient.sendTransaction.mockResolvedValue('0xhash');
      mockPublicClient.waitForTransactionReceipt.mockImplementation(({ onReplaced }: { onReplaced: any }) => {
        onReplaced({ reason: 'cancelled' });
        return Promise.resolve({ status: 'success', transactionHash: '0xcancel' });
      });

      const { result } = renderHook(() => useMetaMask());
      await expect(
        result.current.createTransaction(new BigNumber(1), COIN_ASSET, TEST_ADDRESS, TEST_ADDRESS),
      ).rejects.toThrow('Transaction was cancelled in the wallet');
    });

    it('rejects when the wallet replaced the transaction with a different one', async () => {
      mockWalletClient.sendTransaction.mockResolvedValue('0xhash');
      mockPublicClient.waitForTransactionReceipt.mockImplementation(({ onReplaced }: { onReplaced: any }) => {
        onReplaced({ reason: 'replaced' });
        return Promise.resolve({ status: 'success', transactionHash: '0xother' });
      });

      const { result } = renderHook(() => useMetaMask());
      await expect(
        result.current.createTransaction(new BigNumber(1), COIN_ASSET, TEST_ADDRESS, TEST_ADDRESS),
      ).rejects.toThrow('Transaction was replaced in the wallet');
    });

    it('converts a native coin amount to wei without losing precision', async () => {
      mockWalletClient.sendTransaction.mockResolvedValue('0xhash');

      const { result } = renderHook(() => useMetaMask());
      await result.current.createTransaction(new BigNumber('1.000000000000000001'), COIN_ASSET, TEST_ADDRESS, TEST_ADDRESS);

      expect(mockWalletClient.sendTransaction.mock.calls[0][0].value).toBe(1_000000000000000001n);
    });

    it('rejects a native coin amount with sub-wei precision', async () => {
      mockWalletClient.sendTransaction.mockResolvedValue('0xhash');

      const { result } = renderHook(() => useMetaMask());
      await expect(
        result.current.createTransaction(new BigNumber('1.0000000000000000005'), COIN_ASSET, TEST_ADDRESS, TEST_ADDRESS),
      ).rejects.toThrow('Cannot convert 1000000000000000000.5 to a BigInt');

      expect(mockWalletClient.sendTransaction).not.toHaveBeenCalled();
    });

    it('serializes amounts from 1e21 without exponential notation', async () => {
      mockWalletClient.sendTransaction.mockResolvedValue('0xhash');

      const { result } = renderHook(() => useMetaMask());
      await result.current.createTransaction(new BigNumber('1.5e21'), COIN_ASSET, TEST_ADDRESS, TEST_ADDRESS, {
        isWeiAmount: true,
      });

      expect(mockWalletClient.sendTransaction.mock.calls[0][0].value).toBe(1_500000000000000000000n);
    });

    it('sends an ERC20 transfer with the amount adjusted for the token decimals', async () => {
      mockPublicClient.readContract.mockResolvedValue(6); // decimals
      mockWalletClient.writeContract.mockResolvedValue('0xhash');

      const { result } = renderHook(() => useMetaMask());
      await result.current.createTransaction(new BigNumber(2.5), TOKEN_ASSET, TEST_ADDRESS, TEST_ADDRESS);

      const call = mockWalletClient.writeContract.mock.calls[0][0];
      expect(call.functionName).toBe('transfer');
      expect(call.args).toEqual([TEST_ADDRESS, 2_500000n]);
      expect(call.gasPrice).toBeUndefined();
    });

    it('rejects an ERC20 amount with more precision than the token supports', async () => {
      mockPublicClient.readContract.mockResolvedValue(6); // decimals
      mockWalletClient.writeContract.mockResolvedValue('0xhash');

      const { result } = renderHook(() => useMetaMask());
      await expect(
        result.current.createTransaction(new BigNumber('0.0000005'), TOKEN_ASSET, TEST_ADDRESS, TEST_ADDRESS),
      ).rejects.toThrow('Cannot convert 0.5 to a BigInt');

      expect(mockWalletClient.writeContract).not.toHaveBeenCalled();
    });

    it('sends an ERC20 transfer without a decimals read when the amount is already in wei', async () => {
      mockWalletClient.writeContract.mockResolvedValue('0xhash');

      const { result } = renderHook(() => useMetaMask());
      const hash = await result.current.createTransaction(
        new BigNumber('2.5e21'),
        TOKEN_ASSET,
        TEST_ADDRESS,
        TEST_ADDRESS,
        { isWeiAmount: true },
      );

      expect(hash).toBe('0xhash');
      expect(mockPublicClient.readContract).not.toHaveBeenCalled();
      const call = mockWalletClient.writeContract.mock.calls[0][0];
      expect(call.args).toEqual([TEST_ADDRESS, 2_500000000000000000000n]);
      expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ hash: '0xhash', timeout: 750_000 }),
      );
    });

    it('unwraps a viem-wrapped user rejection so callers still see the EIP-1193 code', async () => {
      const rejection = new UserRejectedRequestError(new Error('User denied transaction signature'));
      mockWalletClient.sendTransaction.mockRejectedValue(new BaseError('tx failed', { cause: rejection }));

      const { result } = renderHook(() => useMetaMask());
      const promise = result.current.createTransaction(new BigNumber(1), COIN_ASSET, TEST_ADDRESS, TEST_ADDRESS);

      await expect(promise).rejects.toBe(rejection);
      await expect(promise).rejects.toMatchObject({ code: 4001 });
      expect(mockPublicClient.waitForTransactionReceipt).not.toHaveBeenCalled();
    });

    it('rethrows a viem error without a coded cause unchanged', async () => {
      const error = new BaseError('nonce too low');
      mockPublicClient.readContract.mockResolvedValue(6); // decimals
      mockWalletClient.writeContract.mockRejectedValue(error);

      const { result } = renderHook(() => useMetaMask());
      await expect(
        result.current.createTransaction(new BigNumber(1), TOKEN_ASSET, TEST_ADDRESS, TEST_ADDRESS),
      ).rejects.toBe(error);
    });

    it('rethrows a non-viem error unchanged', async () => {
      const error = new Error('connection lost');
      mockWalletClient.sendTransaction.mockRejectedValue(error);

      const { result } = renderHook(() => useMetaMask());
      await expect(
        result.current.createTransaction(new BigNumber(1), COIN_ASSET, TEST_ADDRESS, TEST_ADDRESS),
      ).rejects.toBe(error);
    });
  });

  describe('supportsEip5792Paymaster', () => {
    let request: jest.Mock;

    beforeEach(() => {
      request = jest.fn();
      (window as any).ethereum = { isMetaMask: true, request, on: jest.fn() };
      mockWalletClient.getAddresses.mockResolvedValue([TEST_ADDRESS]);
    });

    it('returns false when no account is connected', async () => {
      mockWalletClient.getAddresses.mockResolvedValue([]);

      const { result } = renderHook(() => useMetaMask());
      await expect(result.current.supportsEip5792Paymaster(1)).resolves.toBe(false);
      expect(request).not.toHaveBeenCalled();
    });

    it('returns true when the wallet reports paymaster support for the chain', async () => {
      request.mockResolvedValue({ '0x1': { paymasterService: { supported: true } } });

      const { result } = renderHook(() => useMetaMask());
      await expect(result.current.supportsEip5792Paymaster(1)).resolves.toBe(true);
      expect(request).toHaveBeenCalledWith({ method: 'wallet_getCapabilities', params: [CHECKSUMMED_ADDRESS] });
    });

    it('returns false when the wallet reports no capabilities', async () => {
      request.mockResolvedValue(undefined);

      const { result } = renderHook(() => useMetaMask());
      await expect(result.current.supportsEip5792Paymaster(1)).resolves.toBe(false);
    });

    it('returns false when the chain is not listed', async () => {
      request.mockResolvedValue({});

      const { result } = renderHook(() => useMetaMask());
      await expect(result.current.supportsEip5792Paymaster(1)).resolves.toBe(false);
    });

    it('returns false when the chain has no paymaster service', async () => {
      request.mockResolvedValue({ '0x1': {} });

      const { result } = renderHook(() => useMetaMask());
      await expect(result.current.supportsEip5792Paymaster(1)).resolves.toBe(false);
    });

    it('returns false when support is not exactly true', async () => {
      request.mockResolvedValue({ '0x1': { paymasterService: { supported: 'yes' } } });

      const { result } = renderHook(() => useMetaMask());
      await expect(result.current.supportsEip5792Paymaster(1)).resolves.toBe(false);
    });

    it('returns false when the capability request fails', async () => {
      request.mockRejectedValue(new Error('not supported'));

      const { result } = renderHook(() => useMetaMask());
      await expect(result.current.supportsEip5792Paymaster(1)).resolves.toBe(false);
    });
  });

  describe('sendCallsWithPaymaster', () => {
    const CALLS = [{ to: '0xto', data: '0xdata', value: '0x0' }] as any[];
    let request: jest.Mock;

    beforeEach(() => {
      request = jest.fn();
      (window as any).ethereum = { isMetaMask: true, request, on: jest.fn() };
      mockWalletClient.getAddresses.mockResolvedValue([TEST_ADDRESS]);
    });

    it('rejects when no account is connected', async () => {
      mockWalletClient.getAddresses.mockResolvedValue([]);

      const { result } = renderHook(() => useMetaMask());
      await expect(result.current.sendCallsWithPaymaster(CALLS, 'https://paymaster', 1)).rejects.toThrow(
        'No account connected',
      );
    });

    it('rejects with a translated error when the wallet does not support paymasters', async () => {
      request.mockResolvedValue({});

      const { result } = renderHook(() => useMetaMask());
      const promise = result.current.sendCallsWithPaymaster(CALLS, 'https://paymaster', 1);
      await expect(promise).rejects.toBeInstanceOf(TranslatedError);
      await expect(result.current.sendCallsWithPaymaster(CALLS, 'https://paymaster', 1)).rejects.toThrow(
        /gasless transactions/,
      );
    });

    it('sends the calls with the paymaster capability and returns the confirmed transaction hash', async () => {
      request.mockImplementation(({ method }: { method: string }) => {
        if (method === 'wallet_getCapabilities') {
          return Promise.resolve({ '0x1': { paymasterService: { supported: true } } });
        }
        if (method === 'wallet_sendCalls') return Promise.resolve({ id: 'calls-1' });
        if (method === 'wallet_getCallsStatus') {
          return Promise.resolve({ status: 'CONFIRMED', receipts: [{ transactionHash: '0xtxhash' }] });
        }
        throw new Error(`unexpected call: ${method}`);
      });

      const { result } = renderHook(() => useMetaMask());
      await expect(result.current.sendCallsWithPaymaster(CALLS, 'https://paymaster', 1)).resolves.toBe('0xtxhash');

      const sendCall = request.mock.calls.find((c) => c[0].method === 'wallet_sendCalls')?.[0];
      expect(sendCall.params[0]).toEqual({
        version: '1.0',
        chainId: '0x1',
        from: CHECKSUMMED_ADDRESS,
        calls: [{ to: '0xto', data: '0xdata', value: '0x0' }],
        capabilities: { paymasterService: { url: 'https://paymaster' } },
      });
      const statusCall = request.mock.calls.find((c) => c[0].method === 'wallet_getCallsStatus')?.[0];
      expect(statusCall.params).toEqual(['calls-1']);
    });

    it('accepts a bare calls id and rejects when the transaction fails', async () => {
      request.mockImplementation(({ method }: { method: string }) => {
        if (method === 'wallet_getCapabilities') {
          return Promise.resolve({ '0x1': { paymasterService: { supported: true } } });
        }
        if (method === 'wallet_sendCalls') return Promise.resolve('calls-2');
        if (method === 'wallet_getCallsStatus') return Promise.resolve({ status: 'FAILED' });
        throw new Error(`unexpected call: ${method}`);
      });

      const { result } = renderHook(() => useMetaMask());
      await expect(result.current.sendCallsWithPaymaster(CALLS, 'https://paymaster', 1)).rejects.toThrow(
        'Transaction failed',
      );

      const statusCall = request.mock.calls.find((c) => c[0].method === 'wallet_getCallsStatus')?.[0];
      expect(statusCall.params).toEqual(['calls-2']);
    });

    it('polls until the transaction is confirmed', async () => {
      let statusCalls = 0;
      request.mockImplementation(({ method }: { method: string }) => {
        if (method === 'wallet_getCapabilities') {
          return Promise.resolve({ '0x1': { paymasterService: { supported: true } } });
        }
        if (method === 'wallet_sendCalls') return Promise.resolve({ id: 'calls-3' });
        if (method === 'wallet_getCallsStatus') {
          statusCalls++;
          return Promise.resolve(
            statusCalls < 2 ? { status: 'PENDING' } : { status: 'CONFIRMED', receipts: [{ transactionHash: '0xtxhash' }] },
          );
        }
        throw new Error(`unexpected call: ${method}`);
      });

      const { result } = renderHook(() => useMetaMask());
      makeTimersImmediate();
      await expect(result.current.sendCallsWithPaymaster(CALLS, 'https://paymaster', 1)).resolves.toBe('0xtxhash');
      expect(statusCalls).toBe(2);
    });

    it('gives up with a translated error when the transaction is never confirmed', async () => {
      request.mockImplementation(({ method }: { method: string }) => {
        if (method === 'wallet_getCapabilities') {
          return Promise.resolve({ '0x1': { paymasterService: { supported: true } } });
        }
        if (method === 'wallet_sendCalls') return Promise.resolve({ id: 'calls-4' });
        if (method === 'wallet_getCallsStatus') return Promise.resolve({ status: 'PENDING' });
        throw new Error(`unexpected call: ${method}`);
      });

      const { result } = renderHook(() => useMetaMask());
      makeTimersImmediate();
      await expect(result.current.sendCallsWithPaymaster(CALLS, 'https://paymaster', 1)).rejects.toThrow(
        'Transaction timeout - please check your wallet',
      );
    });
  });

  describe('signEip7702Authorization', () => {
    const AUTH_DATA = {
      contractAddress: '0xcontract',
      chainId: 1,
      nonce: 5,
      typedData: { domain: {}, types: {}, primaryType: 'Authorization', message: {} },
    } as any;
    let request: jest.Mock;

    beforeEach(() => {
      request = jest.fn();
      (window as any).ethereum = { isMetaMask: true, request, on: jest.fn() };
      mockWalletClient.getAddresses.mockResolvedValue([TEST_ADDRESS]);
    });

    it('rejects when no account is connected', async () => {
      mockWalletClient.getAddresses.mockResolvedValue([]);

      const { result } = renderHook(() => useMetaMask());
      await expect(result.current.signEip7702Authorization(AUTH_DATA)).rejects.toThrow('No account connected');
    });

    it('signs the typed data and splits the signature into its components', async () => {
      const signature = `0x${'a'.repeat(64)}${'b'.repeat(64)}1c`; // v = 0x1c = 28
      request.mockResolvedValue(signature);

      const { result } = renderHook(() => useMetaMask());
      await expect(result.current.signEip7702Authorization(AUTH_DATA)).resolves.toEqual({
        chainId: 1,
        address: '0xcontract',
        nonce: 5,
        r: `0x${'a'.repeat(64)}`,
        s: `0x${'b'.repeat(64)}`,
        yParity: 1,
      });

      expect(request).toHaveBeenCalledWith({
        method: 'eth_signTypedData_v4',
        params: [CHECKSUMMED_ADDRESS, JSON.stringify(AUTH_DATA.typedData)],
      });
    });

    it('maps a user rejection to an AbortError', async () => {
      request.mockRejectedValue({ code: 4001, message: 'User rejected' });

      const { result } = renderHook(() => useMetaMask());
      await expect(result.current.signEip7702Authorization(AUTH_DATA)).rejects.toBeInstanceOf(AbortError);
    });
  });
});
