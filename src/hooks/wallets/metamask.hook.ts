import { Asset, AssetType, Blockchain, Eip5792Call } from '@dfx.swiss/react';
import BigNumber from 'bignumber.js';
import { Buffer } from 'buffer';
import { useMemo } from 'react';
import { isMobile } from 'react-device-detect';
import Web3 from 'web3';
import { TransactionConfig } from 'web3-core';
import { Contract } from 'web3-eth-contract';
import { AssetBalance } from '../../contexts/balance.context';
import ERC20_ABI from '../../static/erc20.abi.json';
import { TranslatedError } from '../../util/translated-error';
import { USER_REJECTED_CODE, UserRejectedError } from '../../util/user-rejection';
import { timeout } from '../../util/utils';
import { useWeb3 } from '../web3.hook';

const PROVIDER_MISSING_HINT =
  'No wallet found. Please check your wallet extension or set one up, then reload this page.';

export enum WalletType {
  RABBY = 'Rabby',
  META_MASK = 'MetaMask',
  IN_APP_BROWSER = 'InAppBrowser',
}

export interface Eip7702AuthorizationData {
  contractAddress: string;
  chainId: number;
  nonce: number;
  typedData: {
    domain: Record<string, unknown>;
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    message: Record<string, unknown>;
  };
}

export interface SignedEip7702Authorization {
  chainId: number;
  address: string;
  nonce: number;
  r: string;
  s: string;
  yParity: number;
}

export interface MetaMaskInterface {
  isInstalled: () => boolean;
  getWalletType: () => WalletType | undefined;
  register: (
    onAccountChanged: (account?: string) => void,
    onBlockchainChanged: (blockchain?: Blockchain) => void,
  ) => void;
  getAccount: () => Promise<string | undefined>;
  requestAccount: () => Promise<string | undefined>;
  requestBlockchain: () => Promise<Blockchain | undefined>;
  requestChangeToBlockchain: (blockchain?: Blockchain) => Promise<void>;
  requestBalance: (account: string) => Promise<string | undefined>;
  sign: (address: string, message: string) => Promise<string>;
  addContract: (asset: Asset, svgData: string, currentBlockchain?: Blockchain) => Promise<boolean>;
  readBalance: (asset: Asset, address?: string, passOnException?: boolean) => Promise<AssetBalance>;
  createTransaction: (
    amount: BigNumber,
    asset: Asset,
    from: string,
    to: string,
    config?: { isWeiAmount?: boolean; gasPrice?: number },
  ) => Promise<string>;
  sendCallsWithPaymaster: (calls: Eip5792Call[], paymasterUrl: string, chainId: number) => Promise<string>;
  supportsEip5792Paymaster: (chainId: number) => Promise<boolean>;
  signEip7702Authorization: (authData: Eip7702AuthorizationData) => Promise<SignedEip7702Authorization>;
}

interface MetaMaskError {
  code: number;
  message: string;
}

// Wallet JSON-RPC results are untyped. Callers that need a field narrow the value themselves.
interface WalletRpc {
  request?: (args: { method: string; params?: unknown; id?: number }) => Promise<any>;
  on?: (...args: unknown[]) => void;
  isMetaMask?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
  isTrust?: boolean;
}

type UsableProvider = WalletRpc & {
  request: (args: { method: string; params?: unknown; id?: number }) => Promise<any>;
};

interface PaymasterCapabilities {
  [chain: string]: { paymasterService?: { supported?: boolean } } | undefined;
}

function ethereum(): WalletRpc | undefined {
  return (window as unknown as { ethereum?: WalletRpc }).ethereum;
}

// A throwing getter is the same as no wallet: the provider cannot be used for this request.
function usableProvider(getProvider: () => WalletRpc | undefined): UsableProvider | undefined {
  try {
    const provider = getProvider();
    if (!provider || typeof provider.request !== 'function') return undefined;
    return provider as UsableProvider;
  } catch {
    return undefined;
  }
}

function requireProvider(): UsableProvider {
  const provider = usableProvider(ethereum);
  if (!provider) throw new TranslatedError(PROVIDER_MISSING_HINT);
  return provider;
}

// Direct wallet RPCs (switch chain, watch asset, typed data) keep the previous crash when nothing is injected.
function injected(): UsableProvider {
  return ethereum() as UsableProvider;
}

// web3 drops the code when it rewrites a rejection that is not an Error, so a plain EIP-1193 cancel would no
// longer be recognised. An Error, and anything that is not code 4001, is returned unchanged.
function rejectionKeepingUserCode(error: unknown): unknown {
  const isPlainUserRejection =
    !(error instanceof Error) && error != null && (error as { code?: unknown }).code === USER_REJECTED_CODE;
  if (!isPlainUserRejection) return error;
  return Object.assign(new Error((error as { message: string }).message), error);
}

// One stable EIP-1193 object. Web3 only sees this; each call reads the injected wallet at that moment.
function eip1193Adapter(getProvider: () => WalletRpc | undefined): {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (...args: unknown[]) => void;
} {
  return {
    async request(args: { method: string; params?: unknown[] }): Promise<unknown> {
      const provider = usableProvider(getProvider);
      if (!provider) throw new TranslatedError(PROVIDER_MISSING_HINT);
      try {
        return await provider.request(args);
      } catch (error: unknown) {
        throw rejectionKeepingUserCode(error);
      }
    },
    on(...args: unknown[]): void {
      try {
        const provider = getProvider();
        if (typeof provider?.on === 'function') provider.on(...args);
      } catch {
        // Web3 subscribes at construction. A throwing `.on` must not reject that.
      }
    },
  };
}

function listen<T>(event: string, handler: (value: T) => void): void {
  try {
    const provider = ethereum();
    if (typeof provider?.on === 'function') provider.on(event, handler);
  } catch {
    // Some wallet proxies throw when `.on` is read. register() still finishes.
  }
}

function paymasterSupported(capabilities: unknown, chainId: number): boolean {
  const known = capabilities as PaymasterCapabilities | null | undefined;
  const chainHex = `0x${chainId.toString(16)}`;
  return known?.[chainHex]?.paymasterService?.supported === true;
}

// Rejection means the wallet has no paymaster capability (for example method -32601).
async function paymasterSupportedBy(provider: UsableProvider, account: string, chainId: number): Promise<boolean> {
  try {
    return paymasterSupported(
      await provider.request({
        method: 'wallet_getCapabilities',
        params: [account],
      }),
      chainId,
    );
  } catch {
    return false;
  }
}

export function useMetaMask(): MetaMaskInterface {
  const web3 = useMemo(
    () => new Web3(eip1193Adapter(ethereum) as unknown as ConstructorParameters<typeof Web3>[0]),
    [],
  );
  const { toBlockchain, toChainHex, toChainObject } = useWeb3();

  function isInstalled(): boolean {
    const eth = ethereum();
    return Boolean(eth && (eth.isMetaMask || eth.isRabby || eth.isCoinbaseWallet || eth.isTrust));
  }

  function getWalletType(): WalletType | undefined {
    const eth = ethereum();
    if (eth) {
      const hasInAppWalletAgent = /MetaMask|CoinbaseWallet|Trust|Rainbow|Zerion/i.test(window.navigator.userAgent);
      const isInApp = (eth.isTrust || eth.isCoinbaseWallet) && isMobile;

      if (hasInAppWalletAgent || isInApp) return WalletType.IN_APP_BROWSER;

      if (eth.isRabby) return WalletType.RABBY;
      if (eth.isMetaMask) return WalletType.META_MASK;
    }
  }

  function register(
    onAccountChanged: (account?: string) => void,
    onBlockchainChanged: (blockchain?: Blockchain) => void,
  ) {
    web3.eth.getAccounts((_err, accounts) => {
      onAccountChanged(verifyAccount(accounts));
    });
    web3.eth.getChainId((_err, chainId) => {
      onBlockchainChanged(toBlockchain(chainId));
    });
    listen('accountsChanged', (accounts: string[]) => {
      onAccountChanged(verifyAccount(accounts));
    });
    listen('chainChanged', (chainId: string) => {
      onBlockchainChanged(toBlockchain(chainId));
    });
  }

  async function getAccount(): Promise<string | undefined> {
    return verifyAccount(await web3.eth.getAccounts());
  }

  async function checkConnection(): Promise<void> {
    return timeout(getAccount(), 1000).catch((e) => e.message.includes('Timeout') && window.location.reload());
  }

  async function requestAccount(): Promise<string | undefined> {
    await checkConnection();

    try {
      const accounts = await web3.eth.requestAccounts();
      return verifyAccount(accounts);
    } catch (e) {
      handleError(e);
    }
  }

  async function requestBlockchain(): Promise<Blockchain | undefined> {
    return toBlockchain(await web3.eth.getChainId());
  }

  async function requestChangeToBlockchain(blockchain?: Blockchain): Promise<void> {
    if (!blockchain) return;

    const chainId = toChainHex(blockchain);
    if (!chainId) return;

    return injected()
      .request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] })
      .catch((e: MetaMaskError) => {
        // 4902 chain is not yet added to MetaMask, therefore add chainId to MetaMask
        if (e && e.code === 4902) {
          return requestAddChainId(blockchain);
        }

        handleError(e);
      });
  }

  async function requestAddChainId(blockchain: Blockchain): Promise<void> {
    const chain = toChainObject(blockchain);

    return injected()
      .request({
        method: 'wallet_addEthereumChain',
        params: [chain],
      })
      .catch((e: MetaMaskError | undefined) => {
        // a cancel ends without an error, a rejection without any value gets a generic one
        if (!e || e.code === USER_REJECTED_CODE) handleError(e);

        throw e;
      });
  }

  async function requestBalance(account: string): Promise<string | undefined> {
    return web3.eth.getBalance(account);
  }

  async function sign(address: string, message: string): Promise<string> {
    return web3.eth.personal.sign(message, address, '').catch(handleError);
  }

  async function addContract(asset: Asset, svgData: string, currentBlockchain?: Blockchain): Promise<boolean> {
    if (asset.blockchain !== currentBlockchain) {
      await requestChangeToBlockchain(asset.blockchain);
      return false;
    }
    const tokenContract = createContract(asset.chainId, web3);

    const symbol = await tokenContract.methods.symbol().call();
    const decimals = await tokenContract.methods.decimals().call();

    return injected().request({
      method: 'wallet_watchAsset',
      params: {
        type: 'ERC20',
        options: {
          address: asset.chainId,
          symbol,
          decimals,
          image: `data:image/svg+xml;base64,${Buffer.from(svgData).toString('base64')}`,
        },
      },
      id: Math.round(Math.random() * 10000),
    });
  }

  function verifyAccount(accounts: string[]): string | undefined {
    if ((accounts?.length ?? 0) <= 0) return undefined;
    // check if address is valid
    return Web3.utils.toChecksumAddress(accounts[0]);
  }

  function toUsableNumber(balance: any, decimals = 18): BigNumber {
    return new BigNumber(balance).dividedBy(Math.pow(10, decimals));
  }

  async function readBalance(asset: Asset, address?: string, throwExceptions?: boolean): Promise<AssetBalance> {
    if (!address || !asset) {
      if (throwExceptions) throw new Error('No address or asset provided');

      return { asset, amount: 0 };
    }

    try {
      if (asset.type === AssetType.COIN) {
        return web3.eth.getBalance(address).then((balance) => ({ asset, amount: toUsableNumber(balance).toNumber() }));
      }

      const tokenContract = createContract(asset.chainId, web3);
      const decimals = await tokenContract.methods.decimals().call();
      return await tokenContract.methods
        .balanceOf(address)
        .call()
        .then((balance: any) => ({ asset, amount: toUsableNumber(balance, decimals).toNumber() }));
    } catch (e) {
      if (throwExceptions) throw e;

      return { asset, amount: 0 };
    }
  }

  async function createTransaction(
    amount: BigNumber,
    asset: Asset,
    from: string,
    to: string,
    config?: { isWeiAmount?: boolean; gasPrice?: number },
  ): Promise<string> {
    const provider = requireProvider();
    // Receipt polls stay on the wallet that accepted the transaction.
    const client = new Web3(eip1193Adapter(() => provider) as unknown as ConstructorParameters<typeof Web3>[0]);

    if (asset.type === AssetType.COIN) {
      const transactionData: TransactionConfig = {
        from,
        to,
        value: config?.isWeiAmount ? amount.toString() : client.utils.toWei(amount.toString(), 'ether'),
        maxPriorityFeePerGas: null as any,
        maxFeePerGas: null as any,
        gasPrice: config?.gasPrice,
      };

      return client.eth.sendTransaction(transactionData).then((value) => value.transactionHash);
    } else {
      const tokenContract = createContract(asset.chainId, client);

      let adjustedAmount = amount.toString();
      if (!config?.isWeiAmount) {
        const decimals = await tokenContract.methods.decimals().call();
        adjustedAmount = amount.multipliedBy(Math.pow(10, decimals)).toFixed();
      }

      return tokenContract.methods
        .transfer(to, adjustedAmount)
        .send({ from, maxPriorityFeePerGas: null, maxFeePerGas: null, gasPrice: config?.gasPrice })
        .then((value: any) => value.transactionHash);
    }
  }

  function createContract(chainId: string | undefined, client: Web3): Contract {
    return new client.eth.Contract(ERC20_ABI as unknown as ConstructorParameters<typeof Contract>[0], chainId);
  }

  /**
   * Check if the wallet supports EIP-5792 paymaster service
   */
  async function supportsEip5792Paymaster(chainId: number): Promise<boolean> {
    try {
      const account = await getAccount();
      if (!account) return false;

      const provider = usableProvider(ethereum);
      if (!provider) return false;

      return paymasterSupportedBy(provider, account, chainId);
    } catch {
      return false;
    }
  }

  /**
   * Wait for wallet_sendCalls transaction to be confirmed
   */
  async function waitForCallsStatus(callsId: string, provider: UsableProvider): Promise<string> {
    const maxAttempts = 120; // 2 minutes
    for (let i = 0; i < maxAttempts; i++) {
      const status = (await provider.request({
        method: 'wallet_getCallsStatus',
        params: [callsId],
      })) as { status: string; receipts: { transactionHash: string }[] };

      if (status.status === 'CONFIRMED') {
        return status.receipts[0].transactionHash;
      }
      if (status.status === 'FAILED') {
        throw new TranslatedError('Transaction failed');
      }

      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new TranslatedError('Transaction timeout - please check your wallet');
  }

  /**
   * Sign EIP-7702 authorization for gasless transactions
   * This allows the user's EOA to temporarily delegate to a smart contract
   */
  async function signEip7702Authorization(authData: Eip7702AuthorizationData): Promise<SignedEip7702Authorization> {
    try {
      const account = await getAccount();
      if (!account) throw new Error('No account connected');

      // Sign the typed data using eth_signTypedData_v4
      const signature = (await injected().request({
        method: 'eth_signTypedData_v4',
        params: [account, JSON.stringify(authData.typedData)],
      })) as string;

      // Parse signature into r, s, v components
      const r = signature.slice(0, 66);
      const s = '0x' + signature.slice(66, 130);
      const v = parseInt(signature.slice(130, 132), 16);

      // Convert v to yParity (EIP-155: v = 27 or 28, yParity = 0 or 1)
      const yParity = v - 27;

      return {
        chainId: authData.chainId,
        address: authData.contractAddress,
        nonce: authData.nonce,
        r,
        s,
        yParity,
      };
    } catch (e) {
      return handleError(e);
    }
  }

  /**
   * Send transaction via EIP-5792 wallet_sendCalls with paymaster sponsorship
   */
  async function sendCallsWithPaymaster(calls: Eip5792Call[], paymasterUrl: string, chainId: number): Promise<string> {
    try {
      const provider = requireProvider();
      const account = await getAccount();
      if (!account) throw new Error('No account connected');

      const chainHex = `0x${chainId.toString(16)}`;
      const supported = await paymasterSupportedBy(provider, account, chainId);
      if (!supported) {
        throw new TranslatedError(
          'Your wallet does not support gasless transactions. Please update MetaMask to v12.20+ and enable Smart Account.',
        );
      }

      // Send calls with paymaster capability
      const result = (await provider.request({
        method: 'wallet_sendCalls',
        params: [
          {
            version: '1.0',
            chainId: chainHex,
            from: account,
            calls: calls.map((c) => ({
              to: c.to,
              data: c.data,
              value: c.value,
            })),
            capabilities: {
              paymasterService: { url: paymasterUrl },
            },
          },
        ],
      })) as { id?: string };

      // A wallet may return the calls id as a string.
      return await waitForCallsStatus((result.id ?? result) as string, provider);
    } catch (e) {
      return handleError(e);
    }
  }

  function handleError(e: unknown): never {
    if (e instanceof TranslatedError) throw e;

    const error = e as MetaMaskError | undefined;
    switch (error?.code) {
      // carries the code, which the transaction screens check to keep the user on the form
      case USER_REJECTED_CODE:
        throw new UserRejectedError();

      case -32002:
        throw new TranslatedError('There is already a request pending. Please confirm it in your MetaMask and retry.');
    }

    // a wallet may reject without any value
    throw error ?? new Error('An unexpected error occurred.');
  }

  return useMemo(
    () => ({
      isInstalled,
      getWalletType,
      register,
      getAccount,
      requestAccount,
      requestBlockchain,
      requestChangeToBlockchain,
      requestBalance,
      sign,
      addContract,
      readBalance,
      createTransaction,
      sendCallsWithPaymaster,
      supportsEip5792Paymaster,
      signEip7702Authorization,
    }),
    [web3, toBlockchain, toChainHex, toChainObject],
  );
}
