import { renderHook } from '@testing-library/react';
import { useTxHelper } from '../tx-helper.hook';

const mockMetaMaskSend = jest.fn();
const mockMetaMaskChangeChain = jest.fn();
const mockSendCalls = jest.fn();
const mockSignAuthorization = jest.fn();
const mockWalletConnectSend = jest.fn();
const mockWalletConnectChangeChain = jest.fn();
const mockAlbySend = jest.fn();
const mockPhantomSend = jest.fn();
const mockTrustSolSend = jest.fn();
const mockTrustTrxSend = jest.fn();
const mockTronLinkSend = jest.fn();
const mockParamBalances = jest.fn();
const mockGetAddressBalances = jest.fn();
const mockConfirmSell = jest.fn();
const mockConfirmSwap = jest.fn();
let mockActiveWallet: string | undefined;
let mockSession: { address?: string } | undefined;
let mockCanClose = false;

jest.mock('@dfx.swiss/react', () => ({
  useAuthContext: () => ({ session: mockSession }),
  useSell: () => ({ confirmSell: mockConfirmSell }),
  useSwap: () => ({ confirmSwap: mockConfirmSwap }),
}));
jest.mock('../../contexts/app-handling.context', () => ({
  useAppHandlingContext: () => ({ canClose: mockCanClose }),
}));
jest.mock('../../contexts/balance.context', () => ({
  useBalanceContext: () => ({ getBalances: mockParamBalances }),
}));
jest.mock('../../contexts/wallet.context', () => ({
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
    ALBY: 'Alby',
  },
  useWalletContext: () => ({ activeWallet: mockActiveWallet }),
}));
jest.mock('../blockchain-balance.hook', () => ({
  useBlockchainBalance: () => ({ getAddressBalances: mockGetAddressBalances }),
}));
jest.mock('../wallets/metamask.hook', () => ({
  useMetaMask: () => ({
    createTransaction: mockMetaMaskSend,
    requestChangeToBlockchain: mockMetaMaskChangeChain,
    sendCallsWithPaymaster: mockSendCalls,
    signEip7702Authorization: mockSignAuthorization,
  }),
}));
jest.mock('../wallets/wallet-connect.hook', () => ({
  useWalletConnect: () => ({
    createTransaction: mockWalletConnectSend,
    requestChangeToBlockchain: mockWalletConnectChangeChain,
  }),
}));
jest.mock('../wallets/alby.hook', () => ({ useAlby: () => ({ sendPayment: mockAlbySend }) }));
jest.mock('../wallets/phantom.hook', () => ({ usePhantom: () => ({ createTransaction: mockPhantomSend }) }));
jest.mock('../wallets/trust-sol.hook', () => ({ useTrustSol: () => ({ createTransaction: mockTrustSolSend }) }));
jest.mock('../wallets/trust-trx.hook', () => ({ useTrustTrx: () => ({ createTransaction: mockTrustTrxSend }) }));
jest.mock('../wallets/tronlink-trx.hook', () => ({ useTronLinkTrx: () => ({ createTransaction: mockTronLinkSend }) }));

const asset = { blockchain: 'Ethereum' };
const sell = { id: 41, asset, amount: 2, depositAddress: '0xdeposit' };
const swap = { id: 42, sourceAsset: asset, amount: 3, depositAddress: '0xdeposit' };
const gasless = {
  paymasterUrl: 'https://paymaster',
  calls: [{ to: '0xdeposit', data: '0x', value: '0x0' }],
  chainId: 1,
};
const authorization = { chainId: 1, contractAddress: '0xcontract', nonce: 1, typedData: {} };

describe('useTxHelper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActiveWallet = 'MetaMask';
    mockSession = { address: '0xsession' };
    mockCanClose = false;
    mockMetaMaskSend.mockResolvedValue('0xmetamask');
    mockWalletConnectSend.mockResolvedValue('0xwalletconnect');
    mockPhantomSend.mockResolvedValue('0xphantom');
    mockTrustSolSend.mockResolvedValue('0xtrustsol');
    mockTrustTrxSend.mockResolvedValue('0xtrusttrx');
    mockTronLinkSend.mockResolvedValue('0xtronlink');
    mockAlbySend.mockResolvedValue({ preimage: 'preimage' });
    mockSendCalls.mockResolvedValue('0xgasless');
    mockSignAuthorization.mockResolvedValue({ signature: 'signed' });
    mockConfirmSell.mockResolvedValue({ id: 101 });
    mockConfirmSwap.mockResolvedValue({ id: 102 });
  });

  it.each([
    { wallet: undefined, address: '0xuser', chain: 'Ethereum' },
    { wallet: 'MetaMask', address: undefined, chain: 'Ethereum' },
    { wallet: 'MetaMask', address: '0xuser', chain: undefined },
  ])(
    'gets configured balances when wallet, address or chain is unavailable: $wallet/$address/$chain',
    async (entry) => {
      mockActiveWallet = entry.wallet;
      mockParamBalances.mockResolvedValue([{ amount: 1 }]);
      const { result } = renderHook(() => useTxHelper());

      await expect(result.current.getBalances([asset] as any, entry.address, entry.chain as any)).resolves.toEqual([
        { amount: 1 },
      ]);
      expect(mockGetAddressBalances).not.toHaveBeenCalled();
    },
  );

  it('loads balances from a supported connected wallet', async () => {
    mockActiveWallet = 'LedgerEth';
    mockGetAddressBalances.mockResolvedValue([{ amount: 2 }]);
    const { result } = renderHook(() => useTxHelper());

    await expect(result.current.getBalances([asset] as any, '0xuser', 'Ethereum' as any)).resolves.toEqual([
      { amount: 2 },
    ]);
    expect(mockGetAddressBalances).toHaveBeenCalledWith([asset], '0xuser', 'Ethereum');
  });

  it('does not claim a balance when the wallet balance request fails', async () => {
    mockGetAddressBalances.mockRejectedValue(new Error('RPC unavailable'));
    const { result } = renderHook(() => useTxHelper());

    await expect(result.current.getBalances([asset] as any, '0xuser', 'Ethereum' as any)).resolves.toBeUndefined();
  });

  it('does not request balances from an unsupported wallet', async () => {
    mockActiveWallet = 'Alby';
    const { result } = renderHook(() => useTxHelper());

    await expect(result.current.getBalances([asset] as any, '0xuser', 'Ethereum' as any)).resolves.toBeUndefined();
    expect(mockGetAddressBalances).not.toHaveBeenCalled();
  });

  it('requires a connected wallet to send', async () => {
    mockActiveWallet = undefined;
    const { result } = renderHook(() => useTxHelper());
    await expect(result.current.sendTransaction(sell as any)).rejects.toThrow('No wallet connected');
  });

  it.each([undefined, {}])('requires a session address for MetaMask: %s', async (session) => {
    mockSession = session;
    const { result } = renderHook(() => useTxHelper());
    await expect(result.current.sendTransaction(sell as any)).rejects.toThrow('Address is not defined');
  });

  it('sends an ordinary MetaMask transaction from the session address', async () => {
    const { result } = renderHook(() => useTxHelper());

    await expect(result.current.sendTransaction(sell as any)).resolves.toBe('0xmetamask');
    expect(mockMetaMaskChangeChain).toHaveBeenCalledWith('Ethereum');
    expect(mockMetaMaskSend).toHaveBeenCalledWith(
      expect.objectContaining({ toString: expect.any(Function) }),
      asset,
      '0xsession',
      '0xdeposit',
    );
  });

  it.each([
    { tx: sell, confirm: mockConfirmSell, id: '101' },
    { tx: swap, confirm: mockConfirmSwap, id: '102' },
  ])('signs EIP-7702 for the selected session and confirms $id', async ({ tx, confirm, id }) => {
    const { result } = renderHook(() => useTxHelper());

    await expect(
      result.current.sendTransaction({ ...tx, gaslessAvailable: true, eip7702Authorization: authorization } as any),
    ).resolves.toBe(id);
    expect(mockSignAuthorization).toHaveBeenCalledWith(authorization, '0xsession');
    expect(confirm).toHaveBeenCalledWith(tx.id, { authorization: { signature: 'signed' } });
    expect(mockSendCalls).not.toHaveBeenCalled();
  });

  it.each([
    { tx: sell, confirm: mockConfirmSell, error: 'Failed to execute gasless sell transaction' },
    { tx: swap, confirm: mockConfirmSwap, error: 'Failed to execute gasless swap transaction' },
  ])('reports a missing EIP-7702 confirmation: $error', async ({ tx, confirm, error }) => {
    confirm.mockResolvedValue(undefined);
    const { result } = renderHook(() => useTxHelper());

    await expect(
      result.current.sendTransaction({ ...tx, gaslessAvailable: true, eip7702Authorization: authorization } as any),
    ).rejects.toThrow(error);
  });

  it.each([
    { tx: sell, confirm: mockConfirmSell, id: '101' },
    { tx: swap, confirm: mockConfirmSwap, id: '102' },
  ])('sends EIP-5792 calls for the selected session and confirms $id', async ({ tx, confirm, id }) => {
    const { result } = renderHook(() => useTxHelper());

    await expect(result.current.sendTransaction({ ...tx, depositTx: { eip5792: gasless } } as any)).resolves.toBe(id);
    expect(mockSendCalls).toHaveBeenCalledWith(gasless.calls, gasless.paymasterUrl, gasless.chainId, '0xsession');
    expect(confirm).toHaveBeenCalledWith(tx.id, { txHash: '0xgasless' });
    expect(mockMetaMaskSend).not.toHaveBeenCalled();
  });

  it.each([
    { tx: sell, confirm: mockConfirmSell, error: 'Failed to confirm sell transaction' },
    { tx: swap, confirm: mockConfirmSwap, error: 'Failed to confirm swap transaction' },
  ])('reports a missing EIP-5792 confirmation: $error', async ({ tx, confirm, error }) => {
    confirm.mockResolvedValue(undefined);
    const { result } = renderHook(() => useTxHelper());

    await expect(result.current.sendTransaction({ ...tx, depositTx: { eip5792: gasless } } as any)).rejects.toThrow(
      error,
    );
  });

  it('requires a payment request for Alby', async () => {
    mockActiveWallet = 'Alby';
    const { result } = renderHook(() => useTxHelper());
    await expect(result.current.sendTransaction(sell as any)).rejects.toThrow('Payment request not defined');
  });

  it('returns the Alby preimage', async () => {
    mockActiveWallet = 'Alby';
    const { result } = renderHook(() => useTxHelper());
    await expect(result.current.sendTransaction({ ...sell, paymentRequest: 'invoice' } as any)).resolves.toBe(
      'preimage',
    );
    expect(mockAlbySend).toHaveBeenCalledWith('invoice');
  });

  it.each([
    { wallet: 'WalletConnect', send: mockWalletConnectSend, result: '0xwalletconnect' },
    { wallet: 'PhantomSol', send: mockPhantomSend, result: '0xphantom' },
    { wallet: 'TrustSol', send: mockTrustSolSend, result: '0xtrustsol' },
    { wallet: 'TrustTrx', send: mockTrustTrxSend, result: '0xtrusttrx' },
    { wallet: 'TronLinkTrx', send: mockTronLinkSend, result: '0xtronlink' },
  ])('sends via $wallet with the session account', async ({ wallet, send, result: hash }) => {
    mockActiveWallet = wallet;
    const { result } = renderHook(() => useTxHelper());

    await expect(result.current.sendTransaction(sell as any)).resolves.toBe(hash);
    expect(send).toHaveBeenCalledWith(expect.anything(), asset, '0xsession', '0xdeposit');
    if (wallet === 'WalletConnect') expect(mockWalletConnectChangeChain).toHaveBeenCalledWith('Ethereum');
  });

  it.each(['WalletConnect', 'PhantomSol', 'TrustSol', 'TrustTrx', 'TronLinkTrx'])(
    'requires a session account before sending via %s',
    async (wallet) => {
      mockActiveWallet = wallet;
      mockSession = undefined;
      const { result } = renderHook(() => useTxHelper());
      await expect(result.current.sendTransaction(sell as any)).rejects.toThrow('Address is not defined');
    },
  );

  it('rejects an unsupported wallet send', async () => {
    mockActiveWallet = 'CliTrx';
    const { result } = renderHook(() => useTxHelper());
    await expect(result.current.sendTransaction(sell as any)).rejects.toThrow('Not supported yet');
  });

  it.each(['MetaMask', 'Alby', 'WalletConnect', 'PhantomSol', 'TrustSol'])('allows a payment with %s', (wallet) => {
    mockActiveWallet = wallet;
    const { result } = renderHook(() => useTxHelper());
    expect(result.current.canSendTransaction()).toBe(true);
  });

  it('uses the non-wallet close permission and refuses unsupported wallets', () => {
    mockActiveWallet = undefined;
    mockCanClose = true;
    const { result, rerender } = renderHook(() => useTxHelper());
    expect(result.current.canSendTransaction()).toBe(true);

    mockActiveWallet = 'CliTrx';
    rerender();
    expect(result.current.canSendTransaction()).toBe(false);
  });
});
