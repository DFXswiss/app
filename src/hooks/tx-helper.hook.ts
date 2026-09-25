import { Asset, Blockchain, Sell, Swap, useAuthContext, useSell, useSwap } from '@dfx.swiss/react';
import BigNumber from 'bignumber.js';
import { useMemo } from 'react';
import { useAppHandlingContext } from '../contexts/app-handling.context';
import { AssetBalance, useBalanceContext } from '../contexts/balance.context';
import { WalletType, useWalletContext } from '../contexts/wallet.context';
import { TranslatedError } from '../util/translated-error';
import { useBlockchainBalance } from './blockchain-balance.hook';
import { useAlby } from './wallets/alby.hook';
import { Eip7702AuthorizationData, useMetaMask } from './wallets/metamask.hook';
import { usePhantom } from './wallets/phantom.hook';
import { useTronLinkTrx } from './wallets/tronlink-trx.hook';
import { useTrustSol } from './wallets/trust-sol.hook';
import { useTrustTrx } from './wallets/trust-trx.hook';
import { useWalletConnect } from './wallets/wallet-connect.hook';

// Extended Sell/Swap interface with gasless fields (from backend)
interface GaslessPaymentInfo {
  gaslessAvailable?: boolean;
  eip7702Authorization?: Eip7702AuthorizationData;
}

type SellWithGasless = Sell & GaslessPaymentInfo;
type SwapWithGasless = Swap & GaslessPaymentInfo;
export interface TxHelperInterface {
  getBalances: (assets: Asset[], address: string, blockchain?: Blockchain) => Promise<AssetBalance[] | undefined>;
  sendTransaction: (tx: Sell | Swap) => Promise<string>;
  canSendTransaction: () => boolean;
}

// CAUTION: This is a helper hook for all blockchain transaction functionalities. Think about lazy loading, as soon as it gets bigger.
export function useTxHelper(): TxHelperInterface {
  const {
    createTransaction: createTransactionMetaMask,
    requestChangeToBlockchain: requestChangeToBlockchainMetaMask,
    sendCallsWithPaymaster,
    signEip7702Authorization,
  } = useMetaMask();
  const {
    createTransaction: createTransactionWalletConnect,
    requestChangeToBlockchain: requestChangeToBlockchainWalletConnect,
  } = useWalletConnect();
  const { sendPayment } = useAlby();
  const { createTransaction: createTransactionPhantomSol } = usePhantom();
  const { createTransaction: createTransactionTrustSol } = useTrustSol();
  const { createTransaction: createTransactionTrustTrx } = useTrustTrx();
  const { createTransaction: createTransactionTronLinkTrx } = useTronLinkTrx();
  const { getBalances: getParamBalances } = useBalanceContext();
  const { activeWallet } = useWalletContext();
  const { session } = useAuthContext();
  const { canClose } = useAppHandlingContext();
  const { getAddressBalances } = useBlockchainBalance();
  const { confirmSell } = useSell();
  const { confirmSwap } = useSwap();

  async function getBalances(
    assets: Asset[],
    address: string | undefined,
    blockchain?: Blockchain,
  ): Promise<AssetBalance[] | undefined> {
    if (!activeWallet || !address || !blockchain) return getParamBalances(assets);

    const supportedWallets = [
      WalletType.META_MASK,
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
    ];

    if (supportedWallets.includes(activeWallet)) {
      try {
        return await getAddressBalances(assets, address, blockchain);
      } catch {
        return undefined;
      }
    }

    // no balance available for unsupported wallets
    return undefined;
  }

  async function sendTransaction(tx: Sell | Swap): Promise<string> {
    if (!activeWallet) throw new Error('No wallet connected');

    const asset = 'asset' in tx ? tx.asset : tx.sourceAsset;

    switch (activeWallet) {
      case WalletType.META_MASK:
        if (!session?.address) throw new Error('Address is not defined');

        await requestChangeToBlockchainMetaMask(asset.blockchain);

        // Cast to extended type to access gasless fields
        const txWithGasless = tx as SellWithGasless | SwapWithGasless;

        // EIP-7702 gasless transaction flow (NEW - preferred method)
        // Used when user has 0 ETH for gas - backend provides EIP-7702 authorization data
        if (txWithGasless.gaslessAvailable && txWithGasless.eip7702Authorization) {
          // Sign the EIP-7702 authorization
          const signedAuth = await signEip7702Authorization(txWithGasless.eip7702Authorization);

          // Send to backend's gasless endpoint
          if ('asset' in tx) {
            const result = await confirmSell(tx.id, { authorization: signedAuth } as any);
            if (!result?.id) throw new TranslatedError('Failed to execute gasless sell transaction');
            return result.id.toString();
          } else {
            const result = await confirmSwap(tx.id, { authorization: signedAuth } as any);
            if (!result?.id) throw new TranslatedError('Failed to execute gasless swap transaction');
            return result.id.toString();
          }
        }

        // EIP-5792 gasless transaction flow via wallet_sendCalls with paymaster (fallback)
        // Used when user has no ETH for gas - backend provides EIP-5792 paymaster data
        if (tx.depositTx?.eip5792) {
          const { paymasterUrl, calls, chainId } = tx.depositTx.eip5792;

          // Send transaction via wallet_sendCalls with paymaster sponsorship
          const txHash = await sendCallsWithPaymaster(calls, paymasterUrl, chainId);

          // Confirm the transaction with the backend using the txHash
          if ('asset' in tx) {
            const result = await confirmSell(tx.id, { txHash });
            if (!result?.id) throw new TranslatedError('Failed to confirm sell transaction');
            return result.id.toString();
          } else {
            const result = await confirmSwap(tx.id, { txHash });
            if (!result?.id) throw new TranslatedError('Failed to confirm swap transaction');
            return result.id.toString();
          }
        }

        return createTransactionMetaMask(new BigNumber(tx.amount), asset, session.address, tx.depositAddress);

      case WalletType.ALBY:
        if (!tx.paymentRequest) throw new Error('Payment request not defined');

        return sendPayment(tx.paymentRequest).then((p) => p.preimage);

      case WalletType.WALLET_CONNECT:
        if (!session?.address) throw new Error('Address is not defined');
        await requestChangeToBlockchainWalletConnect(asset.blockchain);
        return createTransactionWalletConnect(new BigNumber(tx.amount), asset, session.address, tx.depositAddress);

      case WalletType.PHANTOM_SOL:
        if (!session?.address) throw new Error('Address is not defined');
        return createTransactionPhantomSol(new BigNumber(tx.amount), asset, session.address, tx.depositAddress);

      case WalletType.TRUST_SOL:
        if (!session?.address) throw new Error('Address is not defined');
        return createTransactionTrustSol(new BigNumber(tx.amount), asset, session.address, tx.depositAddress);

      case WalletType.TRUST_TRX:
        if (!session?.address) throw new Error('Address is not defined');
        return createTransactionTrustTrx(new BigNumber(tx.amount), asset, session.address, tx.depositAddress);

      case WalletType.TRONLINK_TRX:
        if (!session?.address) throw new Error('Address is not defined');
        return createTransactionTronLinkTrx(new BigNumber(tx.amount), asset, session.address, tx.depositAddress);

      default:
        throw new Error('Not supported yet');
    }
  }

  function canSendTransaction(): boolean {
    if (!activeWallet) return canClose;

    switch (activeWallet) {
      case WalletType.META_MASK:
      case WalletType.ALBY:
      case WalletType.WALLET_CONNECT:
      case WalletType.PHANTOM_SOL:
      case WalletType.TRUST_SOL:
        return true;

      default:
        return false;
    }
  }
  return useMemo(
    () => ({ getBalances, sendTransaction, canSendTransaction }),
    [
      createTransactionMetaMask,
      createTransactionWalletConnect,
      sendPayment,
      activeWallet,
      session,
      getParamBalances,
      getAddressBalances,
      requestChangeToBlockchainMetaMask,
      requestChangeToBlockchainWalletConnect,
      canClose,
      sendCallsWithPaymaster,
      signEip7702Authorization,
      confirmSell,
      confirmSwap,
    ],
  );
}
