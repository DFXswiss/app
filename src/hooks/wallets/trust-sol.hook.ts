import { Asset, AssetType } from '@dfx.swiss/react';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import { TrustWalletAdapter } from '@solana/wallet-adapter-trust';
import BigNumber from 'bignumber.js';
import { encodeBase58 } from 'ethers';
import { useMemo } from 'react';
import { useSolana } from '../solana.hook';

export interface TrustInterface {
  isInstalled: () => boolean;
  connect: () => Promise<string>;
  signMessage: (address: string, message: string) => Promise<string>;
  createTransaction: (amount: BigNumber, asset: Asset, from: string, to: string) => Promise<string>;
}

export function useTrustSol(): TrustInterface {
  const { createCoinTransaction, createTokenTransaction, broadcastTransaction } = useSolana();

  const wallet = useMemo(() => new TrustWalletAdapter(), []);

  function getProvider() {
    return wallet;
  }

  function isInstalled(): boolean {
    return wallet.readyState === WalletReadyState.Installed;
  }

  async function connect(): Promise<string> {
    const provider = getProvider();

    try {
      await provider.connect();
      if (provider.publicKey) return provider.publicKey.toBase58();
      throw new Error('No public key found');
    } catch (error) {
      handleError(error);
    }
  }

  async function signMessage(_address: string, message: string): Promise<string> {
    const provider = getProvider();

    try {
      const encodedMessage = new TextEncoder().encode(message);
      const signature = await provider.signMessage(encodedMessage);
      return encodeBase58(signature);
    } catch (error) {
      handleError(error);
    }
  }

  async function createTransaction(amount: BigNumber, asset: Asset, from: string, to: string): Promise<string> {
    const provider = getProvider();

    try {
      const unsignedTransaction =
        asset.type === AssetType.COIN
          ? await createCoinTransaction(from, to, amount)
          : await createTokenTransaction(from, to, asset, amount);

      const signedTransaction = await provider.signTransaction(unsignedTransaction);
      return await broadcastTransaction(signedTransaction);
    } catch (error) {
      handleError(error);
    }
  }

  function handleError(error: unknown): never {
    throw new Error((error as Error).message || 'An unexpected error occurred.');
  }

  return useMemo(
    () => ({
      isInstalled,
      connect,
      signMessage,
      createTransaction,
    }),
    [],
  );
}
