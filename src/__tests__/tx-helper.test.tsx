import BigNumber from 'bignumber.js';
import { act, renderHook } from '@testing-library/react';

const mockCreateTransactionMetaMask = jest.fn();
const mockRequestChangeToBlockchainMetaMask = jest.fn();
const mockSendCallsWithPaymaster = jest.fn();
const mockSignEip7702Authorization = jest.fn();
const mockCreateTransactionWalletConnect = jest.fn();
const mockRequestChangeToBlockchainWalletConnect = jest.fn();
const mockCreateTransactionPhantomSol = jest.fn();
const mockCreateTransactionTrustSol = jest.fn();
const mockCreateTransactionTrustTrx = jest.fn();
const mockCreateTransactionTronLinkTrx = jest.fn();
const mockGetParamBalances = jest.fn();
const mockGetAddressBalances = jest.fn();
const mockConfirmSell = jest.fn();
const mockConfirmSwap = jest.fn();

let mockActiveWallet: string | undefined;
let mockSession: { address?: string } | undefined;
let mockCanClose = false;

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: { BITCOIN: 'Bitcoin', ETHEREUM: 'Ethereum', SOLANA: 'Solana', TRON: 'Tron' },
  useAuthContext: () => ({ session: mockSession }),
  useSell: () => ({ confirmSell: mockConfirmSell }),
  useSwap: () => ({ confirmSwap: mockConfirmSwap }),
}));

jest.mock('../contexts/app-handling.context', () => ({
  useAppHandlingContext: () => ({ canClose: mockCanClose }),
}));

jest.mock('../contexts/balance.context', () => ({
  useBalanceContext: () => ({ getBalances: mockGetParamBalances }),
}));

jest.mock('../contexts/wallet.context', () => ({
  WalletType: {
    META_MASK: 'MetaMask',
    WALLET_CONNECT: 'WalletConnect',
    LEDGER_ETH: 'LedgerEth',
    TREZOR_ETH: 'TrezorEth',
    BITBOX_ETH: 'BitBoxEth',
    CLI_ETH: 'CliEth',
    PHANTOM_SOL: 'PhantomSol',
    TRUST_SOL: 'TrustSol',
    CLI_SOL: 'CliSol',
    TRUST_TRX: 'TrustTrx',
    TRONLINK_TRX: 'TronLinkTrx',
    CLI_TRX: 'CliTrx',
    MAIL: 'Mail',
  },
  useWalletContext: () => ({ activeWallet: mockActiveWallet }),
}));

jest.mock('../hooks/blockchain-balance.hook', () => ({
  useBlockchainBalance: () => ({ getAddressBalances: mockGetAddressBalances }),
}));

jest.mock('../hooks/wallets/metamask.hook', () => ({
  useMetaMask: () => ({
    createTransaction: mockCreateTransactionMetaMask,
    requestChangeToBlockchain: mockRequestChangeToBlockchainMetaMask,
    sendCallsWithPaymaster: mockSendCallsWithPaymaster,
    signEip7702Authorization: mockSignEip7702Authorization,
  }),
}));

jest.mock('../hooks/wallets/wallet-connect.hook', () => ({
  useWalletConnect: () => ({
    createTransaction: mockCreateTransactionWalletConnect,
    requestChangeToBlockchain: mockRequestChangeToBlockchainWalletConnect,
  }),
}));

jest.mock('../hooks/wallets/phantom.hook', () => ({
  usePhantom: () => ({ createTransaction: mockCreateTransactionPhantomSol }),
}));

jest.mock('../hooks/wallets/trust-sol.hook', () => ({
  useTrustSol: () => ({ createTransaction: mockCreateTransactionTrustSol }),
}));

jest.mock('../hooks/wallets/trust-trx.hook', () => ({
  useTrustTrx: () => ({ createTransaction: mockCreateTransactionTrustTrx }),
}));

jest.mock('../hooks/wallets/tronlink-trx.hook', () => ({
  useTronLinkTrx: () => ({ createTransaction: mockCreateTransactionTronLinkTrx }),
}));

import { Blockchain } from '@dfx.swiss/react';
import type { Asset, Sell, Swap } from '@dfx.swiss/react';
import { WalletType } from '../contexts/wallet.context';
import { useTxHelper } from '../hooks/tx-helper.hook';
import { TranslatedError } from '../util/translated-error';

const asset = { id: 1, blockchain: Blockchain.BITCOIN, name: 'BTC' } as Asset;
const otherAsset = { id: 2, blockchain: Blockchain.ETHEREUM, name: 'ETH' } as Asset;

// Gasless fields the API adds to the payment info; the SDK type does not declare them yet.
interface GaslessPaymentInfo {
  gaslessAvailable?: boolean;
  eip7702Authorization?: { contractAddress?: string };
}

type SellTest = Sell & GaslessPaymentInfo;
type SwapTest = Swap & GaslessPaymentInfo;

function sell(overrides: Record<string, unknown> = {}): SellTest {
  return { id: 11, amount: '1.5', asset, depositAddress: 'deposit-address', ...overrides } as unknown as SellTest;
}

function swap(overrides: Record<string, unknown> = {}): SwapTest {
  return {
    id: 12,
    amount: '2.5',
    sourceAsset: otherAsset,
    depositAddress: 'deposit-address',
    ...overrides,
  } as unknown as SwapTest;
}

function reset(): void {
  jest.clearAllMocks();
  mockActiveWallet = undefined;
  mockSession = { address: 'session-address' };
  mockCanClose = false;
  mockCreateTransactionMetaMask.mockResolvedValue('metamask-hash');
  mockRequestChangeToBlockchainMetaMask.mockResolvedValue(undefined);
  mockSendCallsWithPaymaster.mockResolvedValue('paymaster-hash');
  mockSignEip7702Authorization.mockResolvedValue('signed-authorization');
  mockCreateTransactionWalletConnect.mockResolvedValue('walletconnect-hash');
  mockRequestChangeToBlockchainWalletConnect.mockResolvedValue(undefined);
  mockCreateTransactionPhantomSol.mockResolvedValue('phantom-hash');
  mockCreateTransactionTrustSol.mockResolvedValue('trust-sol-hash');
  mockCreateTransactionTrustTrx.mockResolvedValue('trust-trx-hash');
  mockCreateTransactionTronLinkTrx.mockResolvedValue('tronlink-hash');
  mockGetParamBalances.mockReturnValue(undefined);
  mockGetAddressBalances.mockResolvedValue([]);
  mockConfirmSell.mockResolvedValue({ id: 1 });
  mockConfirmSwap.mockResolvedValue({ id: 2 });
}

beforeEach(reset);

describe('useTxHelper getBalances', () => {
  it('falls back to the parameter balances without an active wallet, an address or a blockchain', async () => {
    const { result, rerender } = renderHook(() => useTxHelper());
    const assets: Asset[] = [asset];
    const stored = [{ asset, amount: 1 }];
    mockGetParamBalances.mockReturnValue(stored);

    mockActiveWallet = undefined;
    rerender();
    await expect(result.current.getBalances(assets, 'address', Blockchain.BITCOIN)).resolves.toBe(stored);
    expect(mockGetParamBalances).toHaveBeenLastCalledWith(assets);

    mockActiveWallet = WalletType.META_MASK;
    rerender();
    await expect(result.current.getBalances(assets, '', Blockchain.BITCOIN)).resolves.toBe(stored);

    mockActiveWallet = WalletType.META_MASK;
    rerender();
    await expect(result.current.getBalances(assets, 'address', undefined)).resolves.toBe(stored);

    expect(mockGetParamBalances).toHaveBeenCalledTimes(3);
    expect(mockGetAddressBalances).not.toHaveBeenCalled();
  });

  it('reads the address balances for a supported wallet', async () => {
    mockActiveWallet = WalletType.META_MASK;
    const { result } = renderHook(() => useTxHelper());
    const assets: Asset[] = [asset];
    const balances = [{ asset, amount: 2 }];
    mockGetAddressBalances.mockResolvedValue(balances);

    await expect(result.current.getBalances(assets, 'address', Blockchain.BITCOIN)).resolves.toBe(balances);
    expect(mockGetAddressBalances).toHaveBeenCalledWith(assets, 'address', Blockchain.BITCOIN);
    expect(mockGetParamBalances).not.toHaveBeenCalled();
  });

  it.each([
    WalletType.WALLET_CONNECT,
    WalletType.LEDGER_ETH,
    WalletType.TREZOR_ETH,
    WalletType.BITBOX_ETH,
    WalletType.CLI_ETH,
    WalletType.PHANTOM_SOL,
    WalletType.TRUST_SOL,
    WalletType.CLI_SOL,
    WalletType.TRUST_TRX,
    WalletType.TRONLINK_TRX,
    WalletType.CLI_TRX,
  ])('reads the address balances for the supported wallet %s', async (wallet) => {
    mockActiveWallet = wallet;
    const { result } = renderHook(() => useTxHelper());

    await result.current.getBalances([asset], 'address', Blockchain.BITCOIN);

    expect(mockGetAddressBalances).toHaveBeenCalledWith([asset], 'address', Blockchain.BITCOIN);
  });

  it('returns undefined when reading the address balances fails', async () => {
    mockActiveWallet = WalletType.META_MASK;
    mockGetAddressBalances.mockRejectedValue(new Error('node unavailable'));
    const { result } = renderHook(() => useTxHelper());

    await expect(result.current.getBalances([asset], 'address', Blockchain.BITCOIN)).resolves.toBeUndefined();
  });

  it('returns undefined without asking for balances of an unsupported wallet', async () => {
    mockActiveWallet = WalletType.MAIL;
    const { result } = renderHook(() => useTxHelper());

    await expect(result.current.getBalances([asset], 'address', Blockchain.BITCOIN)).resolves.toBeUndefined();
    expect(mockGetAddressBalances).not.toHaveBeenCalled();
    expect(mockGetParamBalances).not.toHaveBeenCalled();
  });
});

describe('useTxHelper sendTransaction', () => {
  it('rejects without an active wallet', async () => {
    const { result } = renderHook(() => useTxHelper());

    await act(async () => {
      await expect(result.current.sendTransaction(sell())).rejects.toThrow('No wallet connected');
    });
  });

  it('rejects for a wallet without a session address', async () => {
    const { result, rerender } = renderHook(() => useTxHelper());

    for (const wallet of [
      WalletType.META_MASK,
      WalletType.WALLET_CONNECT,
      WalletType.PHANTOM_SOL,
      WalletType.TRUST_SOL,
      WalletType.TRUST_TRX,
      WalletType.TRONLINK_TRX,
    ]) {
      mockActiveWallet = wallet;
      mockSession = {};
      rerender();
      await act(async () => {
        await expect(result.current.sendTransaction(sell())).rejects.toThrow('Address is not defined');
      });

      mockSession = undefined;
      rerender();
      await act(async () => {
        await expect(result.current.sendTransaction(sell())).rejects.toThrow('Address is not defined');
      });
    }
  });

  it('sends a sell through MetaMask', async () => {
    mockActiveWallet = WalletType.META_MASK;
    const { result } = renderHook(() => useTxHelper());
    const tx = sell();

    let hash: string | undefined;
    await act(async () => {
      hash = await result.current.sendTransaction(tx);
    });

    expect(hash).toBe('metamask-hash');
    expect(mockRequestChangeToBlockchainMetaMask).toHaveBeenCalledWith(Blockchain.BITCOIN);
    expect(mockCreateTransactionMetaMask).toHaveBeenCalledTimes(1);
    const args = mockCreateTransactionMetaMask.mock.calls[0];
    expect((args[0] as BigNumber).toString()).toBe('1.5');
    expect(args[1]).toBe(asset);
    expect(args[2]).toBe('session-address');
    expect(args[3]).toBe('deposit-address');
  });

  it('sends a swap through MetaMask using the source asset', async () => {
    mockActiveWallet = WalletType.META_MASK;
    const { result } = renderHook(() => useTxHelper());
    const tx = swap();

    await act(async () => {
      await result.current.sendTransaction(tx);
    });

    expect(mockRequestChangeToBlockchainMetaMask).toHaveBeenCalledWith(Blockchain.ETHEREUM);
    expect(mockCreateTransactionMetaMask.mock.calls[0][1]).toBe(otherAsset);
  });

  it('does not use a deposit transaction without eip5792 data', async () => {
    mockActiveWallet = WalletType.META_MASK;
    const { result } = renderHook(() => useTxHelper());

    await act(async () => {
      await result.current.sendTransaction(sell({ depositTx: {} }));
    });

    expect(mockCreateTransactionMetaMask).toHaveBeenCalledTimes(1);
  });

  it('executes a gasless sell with an EIP-7702 authorization', async () => {
    mockActiveWallet = WalletType.META_MASK;
    const { result } = renderHook(() => useTxHelper());
    const tx = sell({ gaslessAvailable: true, eip7702Authorization: { contractAddress: 'contract' } });

    await act(async () => {
      const hash = await result.current.sendTransaction(tx);
      expect(hash).toBe('1');
    });

    expect(mockSignEip7702Authorization).toHaveBeenCalledWith({ contractAddress: 'contract' });
    expect(mockConfirmSell).toHaveBeenCalledWith(tx.id, { authorization: 'signed-authorization' });
    expect(mockCreateTransactionMetaMask).not.toHaveBeenCalled();
  });

  it('executes a gasless swap with an EIP-7702 authorization', async () => {
    mockActiveWallet = WalletType.META_MASK;
    const { result } = renderHook(() => useTxHelper());
    const tx = swap({ gaslessAvailable: true, eip7702Authorization: { contractAddress: 'contract' } });

    await act(async () => {
      const hash = await result.current.sendTransaction(tx);
      expect(hash).toBe('2');
    });

    expect(mockConfirmSwap).toHaveBeenCalledWith(tx.id, { authorization: 'signed-authorization' });
    expect(mockCreateTransactionMetaMask).not.toHaveBeenCalled();
  });

  it('rejects a gasless sell without a transaction id', async () => {
    mockActiveWallet = WalletType.META_MASK;
    mockConfirmSell.mockResolvedValue({});
    const { result } = renderHook(() => useTxHelper());

    await act(async () => {
      await expect(
        result.current.sendTransaction(sell({ gaslessAvailable: true, eip7702Authorization: {} })),
      ).rejects.toThrow('Failed to execute gasless sell transaction');
    });
  });

  it('rejects a gasless swap without a transaction id', async () => {
    mockActiveWallet = WalletType.META_MASK;
    mockConfirmSwap.mockResolvedValue(undefined);
    const { result } = renderHook(() => useTxHelper());

    await act(async () => {
      await expect(
        result.current.sendTransaction(swap({ gaslessAvailable: true, eip7702Authorization: {} })),
      ).rejects.toThrow('Failed to execute gasless swap transaction');
    });

    await act(async () => {
      await expect(
        result.current.sendTransaction(swap({ gaslessAvailable: true, eip7702Authorization: {} })),
      ).rejects.toBeInstanceOf(TranslatedError);
    });
  });

  it('falls back to the normal flow when gasless is advertised without authorization data', async () => {
    mockActiveWallet = WalletType.META_MASK;
    const { result } = renderHook(() => useTxHelper());

    await act(async () => {
      const hash = await result.current.sendTransaction(sell({ gaslessAvailable: true }));
      expect(hash).toBe('metamask-hash');
    });

    expect(mockSignEip7702Authorization).not.toHaveBeenCalled();
    expect(mockCreateTransactionMetaMask).toHaveBeenCalledTimes(1);
  });

  it('falls back to the normal flow when gasless is not advertised', async () => {
    mockActiveWallet = WalletType.META_MASK;
    const { result } = renderHook(() => useTxHelper());

    await act(async () => {
      await result.current.sendTransaction(sell({ gaslessAvailable: false, eip7702Authorization: {} }));
    });

    expect(mockSignEip7702Authorization).not.toHaveBeenCalled();
    expect(mockCreateTransactionMetaMask).toHaveBeenCalledTimes(1);
  });

  it('confirms a sell through the EIP-5792 paymaster flow', async () => {
    mockActiveWallet = WalletType.META_MASK;
    const payload = {
      paymasterUrl: 'https://paymaster.invalid',
      calls: [{ to: '0x1', data: '0x2' }],
      chainId: 1,
    };
    const { result } = renderHook(() => useTxHelper());
    const tx = sell({ depositTx: { eip5792: payload } });

    await act(async () => {
      const hash = await result.current.sendTransaction(tx);
      expect(hash).toBe('1');
    });

    expect(mockSendCallsWithPaymaster).toHaveBeenCalledWith(payload.calls, payload.paymasterUrl, payload.chainId);
    expect(mockConfirmSell).toHaveBeenCalledWith(tx.id, { txHash: 'paymaster-hash' });
    expect(mockCreateTransactionMetaMask).not.toHaveBeenCalled();
  });

  it('confirms a swap through the EIP-5792 paymaster flow', async () => {
    mockActiveWallet = WalletType.META_MASK;
    const payload = { paymasterUrl: 'https://paymaster.invalid', calls: [], chainId: 2 };
    const { result } = renderHook(() => useTxHelper());
    const tx = swap({ depositTx: { eip5792: payload } });

    await act(async () => {
      const hash = await result.current.sendTransaction(tx);
      expect(hash).toBe('2');
    });

    expect(mockConfirmSwap).toHaveBeenCalledWith(tx.id, { txHash: 'paymaster-hash' });
  });

  it('rejects a paymaster sell without a transaction id', async () => {
    mockActiveWallet = WalletType.META_MASK;
    mockConfirmSell.mockResolvedValue(undefined);
    const { result } = renderHook(() => useTxHelper());
    const payload = { paymasterUrl: 'url', calls: [], chainId: 1 };

    await act(async () => {
      await expect(result.current.sendTransaction(sell({ depositTx: { eip5792: payload } }))).rejects.toThrow(
        'Failed to confirm sell transaction',
      );
    });
  });

  it('rejects a paymaster swap without a transaction id', async () => {
    mockActiveWallet = WalletType.META_MASK;
    mockConfirmSwap.mockResolvedValue(undefined);
    const { result } = renderHook(() => useTxHelper());
    const payload = { paymasterUrl: 'url', calls: [], chainId: 1 };

    await act(async () => {
      await expect(result.current.sendTransaction(swap({ depositTx: { eip5792: payload } }))).rejects.toThrow(
        'Failed to confirm swap transaction',
      );
    });
  });

  it('sends through WalletConnect', async () => {
    mockActiveWallet = WalletType.WALLET_CONNECT;
    const { result } = renderHook(() => useTxHelper());

    let hash: string | undefined;
    await act(async () => {
      hash = await result.current.sendTransaction(sell());
    });

    expect(hash).toBe('walletconnect-hash');
    expect(mockRequestChangeToBlockchainWalletConnect).toHaveBeenCalledWith(Blockchain.BITCOIN);
    expect(mockCreateTransactionWalletConnect.mock.calls[0][0].toString()).toBe('1.5');
    expect(mockCreateTransactionWalletConnect.mock.calls[0][1]).toBe(asset);
    expect(mockCreateTransactionWalletConnect.mock.calls[0][2]).toBe('session-address');
  });

  it.each([
    [WalletType.PHANTOM_SOL, mockCreateTransactionPhantomSol, 'phantom-hash'],
    [WalletType.TRUST_SOL, mockCreateTransactionTrustSol, 'trust-sol-hash'],
    [WalletType.TRUST_TRX, mockCreateTransactionTrustTrx, 'trust-trx-hash'],
    [WalletType.TRONLINK_TRX, mockCreateTransactionTronLinkTrx, 'tronlink-hash'],
  ])('sends through %s', async (wallet, createTransaction, expected) => {
    mockActiveWallet = wallet;
    const { result } = renderHook(() => useTxHelper());

    let hash: string | undefined;
    await act(async () => {
      hash = await result.current.sendTransaction(swap());
    });

    expect(hash).toBe(expected);
    expect(createTransaction).toHaveBeenCalledTimes(1);
    expect(createTransaction.mock.calls[0][0].toString()).toBe('2.5');
    expect(createTransaction.mock.calls[0][1]).toBe(otherAsset);
  });

  it('rejects an unsupported wallet', async () => {
    mockActiveWallet = WalletType.MAIL;
    const { result } = renderHook(() => useTxHelper());

    await act(async () => {
      await expect(result.current.sendTransaction(sell())).rejects.toThrow('Not supported yet');
    });
  });
});

describe('useTxHelper canSendTransaction', () => {
  it('follows canClose without an active wallet', () => {
    mockCanClose = true;
    const { result, rerender } = renderHook(() => useTxHelper());

    expect(result.current.canSendTransaction()).toBe(true);

    mockCanClose = false;
    rerender();

    expect(result.current.canSendTransaction()).toBe(false);
  });

  it.each([WalletType.META_MASK, WalletType.WALLET_CONNECT, WalletType.PHANTOM_SOL, WalletType.TRUST_SOL])(
    'allows sending for %s',
    (wallet) => {
      mockActiveWallet = wallet;
      const { result } = renderHook(() => useTxHelper());

      expect(result.current.canSendTransaction()).toBe(true);
    },
  );

  it('does not allow sending for an unsupported wallet', () => {
    mockActiveWallet = WalletType.MAIL;
    const { result } = renderHook(() => useTxHelper());

    expect(result.current.canSendTransaction()).toBe(false);
  });
});

describe('useTxHelper memoisation', () => {
  it('returns the same helper object while its dependencies are unchanged', () => {
    const { result, rerender } = renderHook(() => useTxHelper());
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});
