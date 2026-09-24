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
import { AbortError } from '../../util/abort-error';
import { TranslatedError } from '../../util/translated-error';
import { delay, timeout } from '../../util/utils';
import { useWeb3 } from '../web3.hook';

const PROVIDER_MISSING_HINT =
  'No wallet found. Please check your wallet extension or set one up, then reload this page.';

let rpcRequestId = 0;

function web3Provider(getProvider: () => any) {
  return {
    request: async ({ method, params }: { method: string; params?: unknown[] }) => {
      const provider = getProvider();
      if (!provider) throw new TranslatedError(PROVIDER_MISSING_HINT);

      if (typeof provider.request === 'function') return provider.request({ method, params });

      const send = provider.sendAsync ?? provider.send;
      if (typeof send !== 'function') throw new Error('Wallet provider does not support RPC requests');

      return new Promise((resolve, reject) => {
        const id = ++rpcRequestId;
        send.call(provider, { jsonrpc: '2.0', id, method, params: params ?? [] }, (error: Error, response: any) => {
          if (error) return reject(error);
          if (!response || response.id !== id) return reject(new Error('Invalid wallet RPC response'));
          if (response.error) {
            const rpcError = Object.assign(new Error(response.error.message), response.error);
            return reject(rpcError);
          }
          resolve(response.result);
        });
      });
    },
  };
}

function readProviderFlag(eth: any, flag: string): boolean {
  try {
    return Boolean(eth[flag]);
  } catch {
    return false;
  }
}

function isInjectedWallet(): boolean {
  const eth = (window as any).ethereum;
  if (!eth) return false;
  return (
    readProviderFlag(eth, 'isMetaMask') ||
    readProviderFlag(eth, 'isRabby') ||
    readProviderFlag(eth, 'isCoinbaseWallet') ||
    readProviderFlag(eth, 'isTrust')
  );
}

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
  isAvailable: () => Promise<boolean>;
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
  sendCallsWithPaymaster: (
    calls: Eip5792Call[],
    paymasterUrl: string,
    chainId: number,
    from: string,
  ) => Promise<string>;
  supportsEip5792Paymaster: (chainId: number) => Promise<boolean>;
  signEip7702Authorization: (authData: Eip7702AuthorizationData, from: string) => Promise<SignedEip7702Authorization>;
}

interface MetaMaskError {
  code: number;
  message: string;
}

export function useMetaMask(): MetaMaskInterface {
  // Web3 only sees this stable EIP-1193 adapter. Reading the injected provider
  // when an RPC is sent also handles wallets injected or replaced after render.
  const web3 = useMemo(() => new Web3(web3Provider(() => (window as any).ethereum) as any), []);
  const { toBlockchain, toChainHex, toChainObject } = useWeb3();

  function ethereum() {
    return (window as any).ethereum;
  }

  function isInstalled(): boolean {
    return isInjectedWallet();
  }

  // the extension may inject the wallet shortly after the page loaded
  async function isAvailable(): Promise<boolean> {
    for (let i = 0; i < 20; i++) {
      if (isInstalled()) return true;

      await delay(0.1);
    }

    return isInstalled();
  }

  function getWalletType(): WalletType | undefined {
    const eth = ethereum();
    if (eth) {
      const hasInAppWalletAgent = /MetaMask|CoinbaseWallet|Trust|Rainbow|Zerion/i.test(window.navigator.userAgent);
      const isInApp = (readProviderFlag(eth, 'isTrust') || readProviderFlag(eth, 'isCoinbaseWallet')) && isMobile;

      if (hasInAppWalletAgent || isInApp) return WalletType.IN_APP_BROWSER;

      if (readProviderFlag(eth, 'isRabby')) return WalletType.RABBY;
      if (readProviderFlag(eth, 'isMetaMask')) return WalletType.META_MASK;
    }
  }

  function listen(event: string, handler: (...args: any[]) => void) {
    try {
      ethereum()?.on(event, handler);
    } catch {
      // With the observed proxy, a mere read of `.on` throws, so neither accountsChanged nor
      // chainChanged is registered and account or network switches are not
      // observed. Catching here lets the rest of register() continue.
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
    try {
      return verifyAccount(await web3.eth.getAccounts());
    } catch (e) {
      handleError(e as MetaMaskError);
    }
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
      handleError(e as MetaMaskError);
    }
  }

  async function requestBlockchain(): Promise<Blockchain | undefined> {
    return toBlockchain(await web3.eth.getChainId());
  }

  async function requestChangeToBlockchain(blockchain?: Blockchain): Promise<void> {
    if (!blockchain) return;

    const chainId = toChainHex(blockchain);
    if (!chainId) return;

    return ethereum()
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

    return ethereum().request({
      method: 'wallet_addEthereumChain',
      params: [chain],
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
    const tokenContract = createContract(asset.chainId);

    const symbol = await tokenContract.methods.symbol().call();
    const decimals = await tokenContract.methods.decimals().call();

    return ethereum().request({
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
        return await web3.eth
          .getBalance(address)
          .then((balance) => ({ asset, amount: toUsableNumber(balance).toNumber() }));
      }

      const tokenContract = createContract(asset.chainId);
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
    // Keep the wallet that accepts a payment for its receipt polling. A later
    // injection may serve the next operation, but must not move this one.
    const provider = ethereum();
    if (!provider) throw new TranslatedError(PROVIDER_MISSING_HINT);
    const transactionWeb3 = new Web3(web3Provider(() => provider) as any);
    await assertWalletSelection(transactionWeb3, from, asset.blockchain);

    if (asset.type === AssetType.COIN) {
      const transactionData: TransactionConfig = {
        from,
        to,
        value: config?.isWeiAmount ? amount.toString() : transactionWeb3.utils.toWei(amount.toString(), 'ether'),
        maxPriorityFeePerGas: null as any,
        maxFeePerGas: null as any,
        gasPrice: config?.gasPrice,
      };

      return transactionWeb3.eth.sendTransaction(transactionData).then((value) => value.transactionHash);
    } else {
      const tokenContract = createContract(asset.chainId, transactionWeb3);

      let adjustedAmount = amount.toString();
      if (!config?.isWeiAmount) {
        const decimals = await tokenContract.methods.decimals().call();
        adjustedAmount = amount.multipliedBy(Math.pow(10, decimals)).toFixed();
      }

      await assertWalletSelection(transactionWeb3, from, asset.blockchain);

      return tokenContract.methods
        .transfer(to, adjustedAmount)
        .send({ from, maxPriorityFeePerGas: null, maxFeePerGas: null, gasPrice: config?.gasPrice })
        .then((value: any) => value.transactionHash);
    }
  }

  function createContract(chainId?: string, client = web3): Contract {
    return new client.eth.Contract(ERC20_ABI as any, chainId);
  }

  async function assertWalletSelection(client: Web3, from: string, blockchain: Blockchain): Promise<void> {
    const [accounts, chainId] = await Promise.all([client.eth.getAccounts(), client.eth.getChainId()]);
    if (verifyAccount(accounts)?.toLowerCase() !== from.toLowerCase())
      throw new TranslatedError('Wallet account changed. Please reload this page and retry.');
    if (toBlockchain(chainId) !== blockchain)
      throw new TranslatedError('Wallet network changed. Please reload this page and retry.');
  }

  /**
   * Check if the wallet supports EIP-5792 paymaster service
   */
  async function supportsEip5792Paymaster(chainId: number): Promise<boolean> {
    try {
      const account = await getAccount();
      if (!account) return false;

      const capabilities = await ethereum().request({
        method: 'wallet_getCapabilities',
        params: [account],
      });

      const chainHex = `0x${chainId.toString(16)}`;
      return capabilities?.[chainHex]?.paymasterService?.supported === true;
    } catch {
      return false;
    }
  }

  /**
   * Wait for wallet_sendCalls transaction to be confirmed
   */
  async function waitForCallsStatus(callsId: string, provider: ReturnType<typeof web3Provider>): Promise<string> {
    const maxAttempts = 120; // 2 minutes
    for (let i = 0; i < maxAttempts; i++) {
      const status = await provider.request({
        method: 'wallet_getCallsStatus',
        params: [callsId],
      });

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
  async function signEip7702Authorization(
    authData: Eip7702AuthorizationData,
    from: string,
  ): Promise<SignedEip7702Authorization> {
    try {
      const injectedProvider = ethereum();
      if (!injectedProvider) throw new TranslatedError(PROVIDER_MISSING_HINT);
      const provider = web3Provider(() => injectedProvider);
      const client = new Web3(provider as any);
      const account = verifyAccount(await client.eth.getAccounts());
      if (!account) throw new Error('No account connected');
      if (account.toLowerCase() !== from.toLowerCase())
        throw new TranslatedError('Wallet account changed. Please reload this page and retry.');
      if ((await client.eth.getChainId()) !== authData.chainId)
        throw new TranslatedError('Wallet network changed. Please reload this page and retry.');

      // Sign the typed data using eth_signTypedData_v4
      const signature = await provider.request({
        method: 'eth_signTypedData_v4',
        params: [account, JSON.stringify(authData.typedData)],
      });

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
      return handleError(e as MetaMaskError);
    }
  }

  /**
   * Send transaction via EIP-5792 wallet_sendCalls with paymaster sponsorship
   */
  async function sendCallsWithPaymaster(
    calls: Eip5792Call[],
    paymasterUrl: string,
    chainId: number,
    from: string,
  ): Promise<string> {
    try {
      const injectedProvider = ethereum();
      if (!injectedProvider) throw new TranslatedError(PROVIDER_MISSING_HINT);
      const provider = web3Provider(() => injectedProvider);
      const client = new Web3(provider as any);
      const account = verifyAccount(await client.eth.getAccounts());
      if (!account) throw new Error('No account connected');
      if (account.toLowerCase() !== from.toLowerCase())
        throw new TranslatedError('Wallet account changed. Please reload this page and retry.');

      const chainHex = `0x${chainId.toString(16)}`;
      if ((await client.eth.getChainId()) !== chainId)
        throw new TranslatedError('Wallet network changed. Please reload this page and retry.');

      // Check if wallet supports paymaster
      const capabilities = await provider.request({ method: 'wallet_getCapabilities', params: [account] });
      if (capabilities?.[chainHex]?.paymasterService?.supported !== true) {
        throw new TranslatedError(
          'Your wallet does not support gasless transactions. Please update MetaMask to v12.20+ and enable Smart Account.',
        );
      }

      if (verifyAccount(await client.eth.getAccounts())?.toLowerCase() !== account.toLowerCase())
        throw new TranslatedError('Wallet account changed. Please reload this page and retry.');
      if ((await client.eth.getChainId()) !== chainId)
        throw new TranslatedError('Wallet network changed. Please reload this page and retry.');

      // Send calls with paymaster capability
      const result = await provider.request({
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
      });

      // Wait for transaction confirmation
      return await waitForCallsStatus(result.id ?? result, provider);
    } catch (e) {
      return handleError(e as MetaMaskError);
    }
  }

  function handleError(e: MetaMaskError): never {
    switch (e.code) {
      case 4001:
        throw new AbortError('User cancelled');

      case -32002:
        throw new TranslatedError('There is already a request pending. Please confirm it in your MetaMask and retry.');
    }

    throw e;
  }

  return useMemo(
    () => ({
      isInstalled,
      isAvailable,
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
