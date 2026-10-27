import type { Page } from '@playwright/test';

export interface InjectedMetaMaskOptions {
  address: string;
  chainIdHex: string;
  tokenDecimals: number;
  tokenBalance: string;
  txHash: string;
  rejectMethods?: string[];
  nativeBalance?: string;
}

export interface WalletRequest {
  method: string;
  params?: unknown[];
}

interface InjectedWalletWindow {
  __injectedWalletRequests?: WalletRequest[];
  ethereum: {
    isMetaMask: boolean;
    on: (event: string, listener: (...args: unknown[]) => void) => undefined;
    removeListener: (event: string, listener: (...args: unknown[]) => void) => undefined;
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  };
}

export async function installInjectedMetaMask(page: Page, options: InjectedMetaMaskOptions): Promise<void> {
  await page.addInitScript((wallet) => {
    let chainId = wallet.chainIdHex;
    let sentTransaction: { from?: string; to?: string; data?: string; value?: string } | undefined;
    const requests: WalletRequest[] = [];
    const word = (value: bigint | number): string => BigInt(value).toString(16).padStart(64, '0');
    const hash = wallet.txHash;
    const blockNumber = '0x10';
    const blockHash = `0x${'1'.repeat(64)}`;
    const logsBloom = `0x${'0'.repeat(512)}`;
    const injectedWindow = window as unknown as InjectedWalletWindow;
    injectedWindow.__injectedWalletRequests = requests;
    injectedWindow.ethereum = {
      isMetaMask: true,
      on: () => undefined,
      removeListener: () => undefined,
      request: async ({ method, params }: { method: string; params?: unknown[] }) => {
        requests.push({ method, params });
        if (wallet.rejectMethods?.includes(method)) {
          throw { code: 4001, message: 'User rejected the request.' };
        }
        switch (method) {
          case 'eth_chainId':
            return chainId;
          case 'net_version':
            return BigInt(chainId).toString(10);
          case 'eth_accounts':
          case 'eth_requestAccounts':
            return [wallet.address];
          case 'wallet_switchEthereumChain':
            chainId = (params?.[0] as { chainId: string }).chainId;
            return null;
          case 'eth_getBalance':
            return wallet.nativeBalance ?? '0x0';
          case 'eth_call': {
            const data = (params?.[0] as { data?: string } | undefined)?.data ?? '';
            if (data.startsWith('0x313ce567')) return `0x${word(wallet.tokenDecimals)}`;
            if (data.startsWith('0x70a08231')) return `0x${word(BigInt(wallet.tokenBalance))}`;
            throw { code: -32601, message: `Unsupported eth_call selector ${data.slice(0, 10)}` };
          }
          case 'eth_blockNumber':
            return blockNumber;
          case 'eth_getBlockByNumber':
            return {
              number: blockNumber,
              baseFeePerGas: '0x3b9aca00',
              timestamp: '0x67100000',
              hash: blockHash,
            };
          case 'eth_gasPrice':
          case 'eth_maxPriorityFeePerGas':
            return '0x3b9aca00';
          case 'eth_estimateGas':
            return '0x15f90';
          case 'eth_sendTransaction':
            sentTransaction = params?.[0] as typeof sentTransaction;
            return hash;
          case 'eth_getTransactionReceipt':
            return {
              status: '0x1',
              blockNumber,
              blockHash,
              transactionHash: hash,
              from: sentTransaction?.from ?? wallet.address,
              to: sentTransaction?.to ?? null,
              gasUsed: '0x15f90',
              cumulativeGasUsed: '0x15f90',
              logs: [],
              logsBloom,
              effectiveGasPrice: '0x3b9aca00',
            };
          case 'eth_getTransactionByHash':
            return {
              hash,
              transactionHash: hash,
              status: '0x1',
              blockNumber,
              blockHash,
              from: wallet.address,
              to: sentTransaction?.to ?? null,
              input: sentTransaction?.data ?? '0x',
              value: sentTransaction?.value ?? '0x0',
              gas: '0x15f90',
              gasUsed: '0x15f90',
              cumulativeGasUsed: '0x15f90',
              logs: [],
              logsBloom,
              effectiveGasPrice: '0x3b9aca00',
              gasPrice: '0x3b9aca00',
              nonce: '0x1',
              transactionIndex: '0x0',
            };
          default:
            throw { code: 4200, message: 'Unsupported method' };
        }
      },
    };
  }, options);
}

export async function readWalletRequests(page: Page): Promise<WalletRequest[]> {
  return page.evaluate(() => {
    const injectedWindow = window as unknown as { __injectedWalletRequests?: WalletRequest[] };
    return injectedWindow.__injectedWalletRequests ?? [];
  });
}
