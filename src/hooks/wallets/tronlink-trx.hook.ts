import { Asset, AssetType } from '@dfx.swiss/react';
import { isInMobileBrowser } from '@tronweb3/tronwallet-abstract-adapter';
import { TronLinkAdapter, isInTronLinkApp, supportTronLink } from '@tronweb3/tronwallet-adapter-tronlink';
import BigNumber from 'bignumber.js';
import { useMemo } from 'react';
import { AbortError } from '../../util/abort-error';
import { delay } from '../../util/utils';
import { useTron } from '../tron.hook';

export interface TronLinkInterface {
  isInstalled: () => boolean;
  isAvailable: () => Promise<boolean>;
  connect: () => Promise<string>;
  signMessage: (address: string, message: string) => Promise<string>;
  createTransaction: (amount: BigNumber, asset: Asset, from: string, to: string) => Promise<string>;
}

export function useTronLinkTrx(): TronLinkInterface {
  const { createCoinTransaction, createTokenTransaction, broadcastTransaction } = useTron();

  const wallet = useMemo(() => new TronLinkAdapter(), []);

  function getProvider() {
    return wallet;
  }

  function opensTronLinkApp(): boolean {
    return !supportTronLink() && Boolean(isInMobileBrowser()) && !isInTronLinkApp();
  }

  function isInstalled(): boolean {
    // inside the TronLink app the adapter waits for a late injected wallet, outside it on mobile it opens the app
    return supportTronLink() || isInTronLinkApp() || opensTronLinkApp();
  }

  // the extension may inject the wallet shortly after the page loaded; the adapter waits for it too
  async function isAvailable(): Promise<boolean> {
    for (let i = 0; i < 20; i++) {
      if (isInstalled()) return true;

      await delay(0.1);
    }

    return isInstalled();
  }

  async function connect(): Promise<string> {
    const provider = getProvider();
    const opensApp = opensTronLinkApp();

    try {
      await provider.connect();
    } catch (error) {
      // the adapter opened the page in the TronLink app instead of connecting
      if (opensApp) {
        await delay(5);
        throw new AbortError('Forwarded to TronLink app');
      }

      handleError(error);
    }

    if (provider.address) return provider.address;
    throw new Error('No address found');
  }

  async function signMessage(address: string, message: string): Promise<string> {
    const provider = getProvider();

    try {
      const signedMessage = await provider.signMessage(message);
      return signedMessage;
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
      isAvailable,
      connect,
      signMessage,
      createTransaction,
    }),
    [],
  );
}
