import { Asset, AssetType, Blockchain } from '@dfx.swiss/react';
import {
  BaseError,
  Connector,
  getAccount,
  getConnectors,
  readContract,
  sendTransaction,
  simulateContract,
  switchChain,
  connect as wagmiConnect,
  disconnect as wagmiDiconnect,
  reconnect as wagmiReconnect,
  signMessage as wagmiSignMessage,
  writeContract,
} from '@wagmi/core';
import BigNumber from 'bignumber.js';
import { useEffect, useMemo, useState } from 'react';
import { isMobile } from 'react-device-detect';
import { parseEther, parseUnits, UserRejectedRequestError } from 'viem';
import ERC20_ABI from '../../static/erc20.abi.json';
import { hasUserRejectedCode, USER_REJECTED_CODE, UserRejectedError } from '../../util/user-rejection';
import { config, WALLET_CONNECT_PROJECT_ID } from '../../wagmi.config';
import { useWeb3 } from '../web3.hook';

// WalletConnect answers a request the user rejected with code 5000 (CAIP-25), which viem also counts as a rejection
const WALLET_CONNECT_REJECTED_CODE = 5000;

export interface WalletConnectInterface {
  connect: (blockchain: Blockchain, onConnectUri: (uri: string) => void) => Promise<string>;
  signMessage: (msg: string, address: string, blockchain: Blockchain) => Promise<string>;
  requestChangeToBlockchain: (blockchain?: Blockchain) => Promise<void>;
  createTransaction: (amount: BigNumber, asset: Asset, from: string, to: string) => Promise<string>;
  wallets: DeepWallet[];
}

export interface WalletListings {
  listings: Record<string, WalletListing>;
}

export interface WalletListing {
  id: string;
  name: string;
  desktop: { native: string };
  mobile: { native: string };
  image_url: { md: string };
}

export interface DeepWallet {
  id: string;
  name: string;
  deepLink: string;
  imageUrl: string;
}

export function useWalletConnect(): WalletConnectInterface {
  const { toChainId } = useWeb3();
  const [wallets, setWallets] = useState<DeepWallet[]>([]);

  useEffect(() => {
    getWallets().then(setWallets);
    reconnect();
  }, []);

  function getWalletConnectConnector(): Connector {
    const walletConnectConnector = getConnectors(config).find((connector) => connector.id === 'walletConnect');
    if (!walletConnectConnector) throw new Error('WalletConnect connector not found');
    return walletConnectConnector;
  }

  async function getWallets(): Promise<DeepWallet[]> {
    return fetch(`https://explorer-api.walletconnect.com/v3/wallets?projectId=${WALLET_CONNECT_PROJECT_ID}`).then(
      async (response) => {
        if (!response.ok) {
          throw new Error(response.statusText);
        }

        const { listings }: WalletListings = await response.json();

        return Object.values(listings)
          .map((w) => ({
            id: w.id,
            name: w.name,
            deepLink: isMobile ? w.mobile.native : w.desktop.native,
            imageUrl: w.image_url.md,
          }))
          .filter((w) => w.deepLink);
      },
    )
      .catch((error) => {
        console.warn('Failed to fetch WalletConnect wallets:', error.message);
        return []; // Return empty array on error for local development
      });
  }

  async function connect(blockchain: Blockchain, onConnectUri: (uri: string) => void): Promise<string> {
    try {
      await disconnect();
      const connector = getWalletConnectConnector();
      const provider = (await connector.getProvider()) as any;
      provider.events.on('display_uri', onConnectUri);

      const { accounts } = await wagmiConnect(config, {
        chainId: toChainId(blockchain) as any,
        connector,
      });

      return accounts[0];
    } catch (error) {
      handleError(error);
    }
  }

  async function disconnect(): Promise<void> {
    try {
      await wagmiDiconnect(config, { connector: getWalletConnectConnector() });
    } catch (error) {
      handleError(error);
    }
  }

  async function reconnect(): Promise<void> {
    try {
      const { isDisconnected } = getAccount(config);
      if (isDisconnected) {
        await wagmiReconnect(config, { connectors: [getWalletConnectConnector()] });
      }
    } catch (error) {
      handleError(error);
    }
  }

  async function signMessage(msg: string, address: string, _blockchain: Blockchain): Promise<string> {
    try {
      return await wagmiSignMessage(config, {
        message: msg,
        account: address as any,
        connector: getWalletConnectConnector(),
      });
    } catch (error) {
      handleError(error);
    }
  }

  async function requestChangeToBlockchain(blockchain?: Blockchain): Promise<void> {
    if (!blockchain) return;
    const chainId = Number(toChainId(blockchain));

    try {
      if (getAccount(config).chainId !== chainId) {
        await switchChain(config, { chainId: chainId as any, connector: getWalletConnectConnector() });
        await new Promise((resolve) => setTimeout(resolve, 5000)); // delay to allow chain switch in wallet
      }
    } catch (error) {
      if (!(error instanceof UserRejectedRequestError)) handleError(error);

      // wagmi reports any failure to add the chain as a rejection, so only the wallet's own answer tells a cancel
      // apart: its code, or without one the message wagmi itself checks for a rejected switch
      const { code, message } = (error.cause ?? {}) as { code?: unknown; message?: unknown };
      const isRejection =
        typeof code === 'number'
          ? code === USER_REJECTED_CODE || code === WALLET_CONNECT_REJECTED_CODE
          : /user rejected/i.test(String(message));
      if (isRejection) throw new UserRejectedError();

      throw new Error(typeof message === 'string' && message ? message : 'An unexpected error occurred.');
    }
  }

  async function createTransaction(amount: BigNumber, asset: Asset, from: string, to: string): Promise<string> {
    try {
      if (asset.type === AssetType.COIN) {
        return await sendTransaction(config, {
          connector: getWalletConnectConnector(),
          account: from as any,
          chainId: Number(toChainId(asset.blockchain)) as any,
          to: to as any,
          value: parseEther(amount.toString()),
          data: '0x', // needed for Trust Wallet
        });
      } else {
        const decimals = (await readContract(config, {
          abi: ERC20_ABI,
          address: asset.chainId as any,
          functionName: 'decimals',
          chainId: Number(toChainId(asset.blockchain)) as any,
        })) as number;

        const { request } = await simulateContract(config, {
          abi: ERC20_ABI,
          chainId: Number(toChainId(asset.blockchain)) as any,
          address: asset.chainId as any,
          functionName: 'transfer',
          args: [to as any, parseUnits(amount.toString(), decimals)],
          connector: getWalletConnectConnector(),
        });

        return await writeContract(config, request);
      }
    } catch (error) {
      handleError(error);
    }
  }

  function handleError(error: unknown): never {
    // viem raises UserRejectedRequestError for a request the user rejected in the wallet, wagmi for a rejected session
    if (hasUserRejectedCode(error)) throw new UserRejectedError();

    throw new Error((error as BaseError).shortMessage || (error as Error).message || 'An unexpected error occurred.');
  }

  return useMemo(
    () => ({
      connect,
      signMessage,
      requestChangeToBlockchain,
      createTransaction,
      wallets,
    }),
    [wallets],
  );
}
