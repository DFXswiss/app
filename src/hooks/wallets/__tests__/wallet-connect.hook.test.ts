// useWalletConnect around the wagmi actions: the wallet list, the reconnect on mount, and the connect, sign, chain
// switch and transaction calls, including how a failure or a rejection in the wallet reaches the caller.

const mockGetAccount = jest.fn();
const mockGetConnectors = jest.fn();
const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
const mockReconnect = jest.fn();
const mockSignMessage = jest.fn();
const mockSwitchChain = jest.fn();
const mockSendTransaction = jest.fn();
const mockReadContract = jest.fn();
const mockSimulateContract = jest.fn();
const mockWriteContract = jest.fn();
const mockProviderOn = jest.fn();
let mockIsMobile = false;

jest.mock('@dfx.swiss/react', () => ({
  AssetType: { COIN: 'Coin', TOKEN: 'Token' },
  Blockchain: { ETHEREUM: 'Ethereum', POLYGON: 'Polygon' },
}));

jest.mock('@wagmi/core', () => ({
  BaseError: class BaseError extends Error {},
  getAccount: (...args: unknown[]) => mockGetAccount(...args),
  getConnectors: (...args: unknown[]) => mockGetConnectors(...args),
  connect: (...args: unknown[]) => mockConnect(...args),
  disconnect: (...args: unknown[]) => mockDisconnect(...args),
  reconnect: (...args: unknown[]) => mockReconnect(...args),
  signMessage: (...args: unknown[]) => mockSignMessage(...args),
  switchChain: (...args: unknown[]) => mockSwitchChain(...args),
  sendTransaction: (...args: unknown[]) => mockSendTransaction(...args),
  readContract: (...args: unknown[]) => mockReadContract(...args),
  simulateContract: (...args: unknown[]) => mockSimulateContract(...args),
  writeContract: (...args: unknown[]) => mockWriteContract(...args),
}));

// the real viem, which needs the encoders jsdom does not provide
jest.mock('viem', () => {
  const { TextDecoder, TextEncoder } = jest.requireActual('util');
  Object.assign(global, { TextDecoder, TextEncoder });
  return jest.requireActual('viem');
});

jest.mock('../../../wagmi.config', () => ({ config: { id: 'config' }, WALLET_CONNECT_PROJECT_ID: 'project' }));

jest.mock('../../web3.hook', () => ({
  useWeb3: () => ({ toChainId: (blockchain: string) => (blockchain === 'Ethereum' ? '1' : '137') }),
}));

jest.mock('react-device-detect', () => ({
  get isMobile() {
    return mockIsMobile;
  },
}));

import { Asset, AssetType, Blockchain } from '@dfx.swiss/react';
import { renderHook, waitFor } from '@testing-library/react';
import BigNumber from 'bignumber.js';
import { parseEther, parseUnits, UserRejectedRequestError } from 'viem';
import { UserRejectedError } from '../../../util/user-rejection';
import { useWalletConnect } from '../wallet-connect.hook';

const ADDRESS = '0x1234567890123456789012345678901234567890';
const connector = { id: 'walletConnect', getProvider: () => Promise.resolve({ events: { on: mockProviderOn } }) };

const listing = (id: string, desktop: string, mobile: string) => ({
  id,
  name: `Wallet ${id}`,
  desktop: { native: desktop },
  mobile: { native: mobile },
  image_url: { md: `${id}.png` },
});

const originalFetch = global.fetch;
let fetchMock: jest.Mock;

async function setup() {
  const hook = renderHook(() => useWalletConnect());
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  return hook;
}

beforeEach(() => {
  mockIsMobile = false;
  mockGetAccount.mockReturnValue({ isDisconnected: false, chainId: 1 });
  mockGetConnectors.mockReturnValue([{ id: 'injected' }, connector]);
  mockConnect.mockResolvedValue({ accounts: [ADDRESS] });
  mockDisconnect.mockResolvedValue(undefined);
  mockReconnect.mockResolvedValue([]);
  fetchMock = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ listings: {} }) });
  (global as any).fetch = fetchMock;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  global.fetch = originalFetch;
});

describe('wallets', () => {
  const listings = { a: listing('a', 'desktop-a:', 'mobile-a:'), b: listing('b', '', 'mobile-b:') };

  it('lists the wallets with a desktop link on desktop', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ listings }) });

    const { result } = await setup();

    await waitFor(() =>
      expect(result.current.wallets).toEqual([
        { id: 'a', name: 'Wallet a', deepLink: 'desktop-a:', imageUrl: 'a.png' },
      ]),
    );
    expect(fetchMock).toHaveBeenCalledWith('https://explorer-api.walletconnect.com/v3/wallets?projectId=project');
  });

  it('lists the wallets with a mobile link on mobile', async () => {
    mockIsMobile = true;
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ listings }) });

    const { result } = await setup();

    await waitFor(() => expect(result.current.wallets.map((w) => w.deepLink)).toEqual(['mobile-a:', 'mobile-b:']));
  });

  it('lists no wallets when the list cannot be loaded', async () => {
    fetchMock.mockResolvedValue({ ok: false, statusText: 'Forbidden' });

    const { result } = await setup();

    await waitFor(() =>
      expect(console.warn).toHaveBeenCalledWith('Failed to fetch WalletConnect wallets:', 'Forbidden'),
    );
    expect(result.current.wallets).toEqual([]);
  });

  it('lists no wallets when the request fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    const { result } = await setup();

    await waitFor(() => expect(console.warn).toHaveBeenCalledWith('Failed to fetch WalletConnect wallets:', 'offline'));
    expect(result.current.wallets).toEqual([]);
  });
});

describe('reconnect on mount', () => {
  it('reconnects a disconnected session', async () => {
    mockGetAccount.mockReturnValue({ isDisconnected: true });

    await setup();

    await waitFor(() => expect(mockReconnect).toHaveBeenCalledWith({ id: 'config' }, { connectors: [connector] }));
  });

  it('leaves a connected session as it is', async () => {
    await setup();

    expect(mockReconnect).not.toHaveBeenCalled();
  });
});

describe('connect', () => {
  it('connects on the chain of the blockchain and returns the account', async () => {
    const onConnectUri = jest.fn();
    const { result } = await setup();

    await expect(result.current.connect(Blockchain.POLYGON, onConnectUri)).resolves.toBe(ADDRESS);

    expect(mockDisconnect).toHaveBeenCalledWith({ id: 'config' }, { connector });
    expect(mockProviderOn).toHaveBeenCalledWith('display_uri', onConnectUri);
    expect(mockConnect).toHaveBeenCalledWith({ id: 'config' }, { chainId: '137', connector });
  });

  it('fails when there is no WalletConnect connector', async () => {
    mockGetConnectors.mockReturnValue([{ id: 'injected' }]);
    const { result } = await setup();

    await expect(result.current.connect(Blockchain.ETHEREUM, jest.fn())).rejects.toThrow(
      'WalletConnect connector not found',
    );
  });

  it('fails with the short message when the previous session cannot be ended', async () => {
    mockDisconnect.mockRejectedValue(Object.assign(new Error('long'), { shortMessage: 'Disconnect failed.' }));
    const { result } = await setup();

    await expect(result.current.connect(Blockchain.ETHEREUM, jest.fn())).rejects.toThrow('Disconnect failed.');
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('cancels when the user rejects the session', async () => {
    mockConnect.mockRejectedValue(new UserRejectedRequestError(new Error('User rejected.')));
    const { result } = await setup();

    await expect(result.current.connect(Blockchain.ETHEREUM, jest.fn())).rejects.toBeInstanceOf(UserRejectedError);
  });
});

describe('signMessage', () => {
  it('signs the message with the account', async () => {
    mockSignMessage.mockResolvedValue('0xsignature');
    const { result } = await setup();

    await expect(result.current.signMessage('message', ADDRESS, Blockchain.ETHEREUM)).resolves.toBe('0xsignature');
    expect(mockSignMessage).toHaveBeenCalledWith({ id: 'config' }, { message: 'message', account: ADDRESS, connector });
  });

  it('fails with the message when there is no short message', async () => {
    mockSignMessage.mockRejectedValue(new Error('Request expired'));
    const { result } = await setup();

    await expect(result.current.signMessage('message', ADDRESS, Blockchain.ETHEREUM)).rejects.toThrow(
      'Request expired',
    );
  });

  it('fails with a generic message when the error has none', async () => {
    mockSignMessage.mockRejectedValue({});
    const { result } = await setup();

    await expect(result.current.signMessage('message', ADDRESS, Blockchain.ETHEREUM)).rejects.toThrow(
      'An unexpected error occurred.',
    );
  });
});

describe('requestChangeToBlockchain', () => {
  it('does nothing without a blockchain', async () => {
    const { result } = await setup();

    await expect(result.current.requestChangeToBlockchain()).resolves.toBeUndefined();
    expect(mockSwitchChain).not.toHaveBeenCalled();
  });

  it('does not switch to the chain already active', async () => {
    const { result } = await setup();

    await expect(result.current.requestChangeToBlockchain(Blockchain.ETHEREUM)).resolves.toBeUndefined();
    expect(mockSwitchChain).not.toHaveBeenCalled();
  });

  it('switches the chain and gives the wallet time to follow', async () => {
    mockSwitchChain.mockResolvedValue(undefined);
    const { result } = await setup();
    const timeout = jest.spyOn(global, 'setTimeout').mockImplementation(((callback: () => void) => {
      callback();
      return 0;
    }) as unknown as typeof setTimeout);

    await expect(result.current.requestChangeToBlockchain(Blockchain.POLYGON)).resolves.toBeUndefined();

    expect(mockSwitchChain).toHaveBeenCalledWith({ id: 'config' }, { chainId: 137, connector });
    expect(timeout).toHaveBeenCalledWith(expect.any(Function), 5000);
  });

  // the connector wraps the wallet's answer in UserRejectedRequestError, also when adding the chain failed otherwise
  it.each([
    ['the WalletConnect code', 5000],
    ['the EIP-1193 code', 4001],
  ])('cancels with the code when the wallet rejects the switch with %s', async (_case, code) => {
    mockSwitchChain.mockRejectedValue(
      new UserRejectedRequestError(Object.assign(new Error('Request denied.'), { code })),
    );
    const { result } = await setup();

    const change = result.current.requestChangeToBlockchain(Blockchain.POLYGON);
    await expect(change).rejects.toBeInstanceOf(UserRejectedError);
    await expect(change).rejects.toHaveProperty('code', 4001);
  });

  it('cancels when the wallet rejects the switch without a code, as wagmi recognises it by the message', async () => {
    mockSwitchChain.mockRejectedValue(new UserRejectedRequestError(new Error('User rejected the switch.')));
    const { result } = await setup();

    await expect(result.current.requestChangeToBlockchain(Blockchain.POLYGON)).rejects.toBeInstanceOf(
      UserRejectedError,
    );
  });

  it('fails when the wallet answers the switch with another code, even with a rejection message', async () => {
    const answer = Object.assign(new Error('User rejected methods.'), { code: 5002 });
    mockSwitchChain.mockRejectedValue(new UserRejectedRequestError(answer));
    const { result } = await setup();

    const change = result.current.requestChangeToBlockchain(Blockchain.POLYGON);
    await expect(change).rejects.not.toBeInstanceOf(UserRejectedError);
    await expect(change).rejects.toThrow('User rejected methods.');
  });

  it.each([
    ['without an answer', undefined],
    ['with an answer that is no object', 'failed'],
  ])('fails with a generic message when adding the chain failed %s', async (_case, answer) => {
    const error = new UserRejectedRequestError(new Error('placeholder'));
    Object.defineProperty(error, 'cause', { value: answer });
    mockSwitchChain.mockRejectedValue(error);
    const { result } = await setup();

    const change = result.current.requestChangeToBlockchain(Blockchain.POLYGON);
    await expect(change).rejects.not.toBeInstanceOf(UserRejectedError);
    await expect(change).rejects.toThrow('An unexpected error occurred.');
  });

  it('fails with the answer of the wallet when adding the chain failed', async () => {
    const answer = Object.assign(new Error('Method not supported'), { code: -32601 });
    mockSwitchChain.mockRejectedValue(new UserRejectedRequestError(answer));
    const { result } = await setup();

    const change = result.current.requestChangeToBlockchain(Blockchain.POLYGON);
    await expect(change).rejects.not.toBeInstanceOf(UserRejectedError);
    await expect(change).rejects.toThrow('Method not supported');
  });

  it('fails with the message of another switch failure', async () => {
    mockSwitchChain.mockRejectedValue(Object.assign(new Error('long'), { shortMessage: 'Chain not configured.' }));
    const { result } = await setup();

    await expect(result.current.requestChangeToBlockchain(Blockchain.POLYGON)).rejects.toThrow('Chain not configured.');
  });
});

describe('createTransaction', () => {
  const amount = new BigNumber(1.5);

  it('sends a coin transaction', async () => {
    mockSendTransaction.mockResolvedValue('0xhash');
    const { result } = await setup();
    const asset = { type: AssetType.COIN, blockchain: Blockchain.POLYGON } as Asset;

    await expect(result.current.createTransaction(amount, asset, ADDRESS, '0xto')).resolves.toBe('0xhash');
    expect(mockSendTransaction).toHaveBeenCalledWith(
      { id: 'config' },
      { connector, account: ADDRESS, chainId: 137, to: '0xto', value: parseEther('1.5'), data: '0x' },
    );
  });

  it('sends a token transfer in the decimals of the token', async () => {
    const request = { functionName: 'transfer' };
    mockReadContract.mockResolvedValue(6);
    mockSimulateContract.mockResolvedValue({ request });
    mockWriteContract.mockResolvedValue('0xtokenhash');
    const { result } = await setup();
    const asset = { type: AssetType.TOKEN, blockchain: Blockchain.ETHEREUM, chainId: '0xtoken' } as Asset;

    await expect(result.current.createTransaction(amount, asset, ADDRESS, '0xto')).resolves.toBe('0xtokenhash');
    expect(mockReadContract).toHaveBeenCalledWith(
      { id: 'config' },
      expect.objectContaining({ address: '0xtoken', functionName: 'decimals', chainId: 1 }),
    );
    expect(mockSimulateContract).toHaveBeenCalledWith(
      { id: 'config' },
      expect.objectContaining({
        address: '0xtoken',
        functionName: 'transfer',
        chainId: 1,
        args: ['0xto', parseUnits('1.5', 6)],
        connector,
      }),
    );
    expect(mockWriteContract).toHaveBeenCalledWith({ id: 'config' }, request);
  });

  it('cancels with code 4001 when the user rejects the transaction, which keeps the user on the form', async () => {
    mockSendTransaction.mockRejectedValue(new UserRejectedRequestError(new Error('User rejected.')));
    const { result } = await setup();
    const asset = { type: AssetType.COIN, blockchain: Blockchain.ETHEREUM } as Asset;

    const transaction = result.current.createTransaction(amount, asset, ADDRESS, '0xto');
    await expect(transaction).rejects.toBeInstanceOf(UserRejectedError);
    await expect(transaction).rejects.toHaveProperty('code', 4001);
  });

  it('fails with the short message of another failure', async () => {
    mockReadContract.mockRejectedValue(Object.assign(new Error('long'), { shortMessage: 'Contract not found.' }));
    const { result } = await setup();
    const asset = { type: AssetType.TOKEN, blockchain: Blockchain.ETHEREUM, chainId: '0xtoken' } as Asset;

    await expect(result.current.createTransaction(amount, asset, ADDRESS, '0xto')).rejects.toThrow(
      'Contract not found.',
    );
  });
});
