/**
 * An injected EIP-1193 wallet (window.ethereum) for the full-stack specs. It stands in for the wallet extension, which
 * is an external provider; the frontend, the API and the database stay real.
 */
import type { Page } from '@playwright/test';
import { ethers } from 'ethers';

export type WalletAnswer = { result: unknown } | { error: { code: number; message: string; data?: unknown } };

/**
 * Installs an injected EIP-1193 wallet in the page, which stands in for the wallet extension (an external provider).
 * The test process gives each answer. A rejection is thrown as a plain object, the way injected wallets reject, not
 * as an Error. Returns the methods the page called, in order.
 */
export async function injectWallet(
  page: Page,
  answer: (method: string, params: unknown[]) => WalletAnswer | Promise<WalletAnswer>,
  options?: { injectAfterLoadMs?: number; requestThrows?: boolean },
): Promise<string[]> {
  const calls: string[] = [];
  await page.exposeFunction('e2eWalletAnswer', async (method: string, params: unknown[]) => {
    calls.push(method);
    return answer(method, params ?? []);
  });
  const install: { injectAfterLoadMs?: number; requestThrows?: boolean } = {};
  if (options && typeof options.injectAfterLoadMs === 'number') install.injectAfterLoadMs = options.injectAfterLoadMs;
  if (options && options.requestThrows === true) install.requestThrows = true;
  await page.addInitScript((config: { injectAfterLoadMs?: number; requestThrows?: boolean }) => {
    const place = () => {
      const answerFor = (window as unknown as { e2eWalletAnswer: (m: string, p: unknown[]) => Promise<WalletAnswer> })
        .e2eWalletAnswer;
      const provider: {
        isMetaMask: boolean;
        on: () => undefined;
        removeListener: () => undefined;
        request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      } = {
        isMetaMask: true,
        on: () => undefined,
        removeListener: () => undefined,
      };
      if (config.requestThrows === true) {
        Object.defineProperty(provider, 'request', {
          configurable: true,
          get() {
            throw new Error('request unavailable');
          },
        });
      } else {
        provider.request = async ({ method, params }: { method: string; params?: unknown[] }) => {
          const reply = await answerFor(method, params ?? []);
          if ('error' in reply) throw reply.error;
          return reply.result;
        };
      }
      (window as unknown as { ethereum: unknown }).ethereum = provider;
    };
    const delayMs = config.injectAfterLoadMs;
    if (typeof delayMs === 'number') {
      window.addEventListener('load', () => {
        window.setTimeout(place, delayMs);
      });
    } else {
      place();
    }
  }, install);
  return calls;
}

/**
 * The answers of a wallet on Ethereum that holds `wallet`; `requestAccounts`, `sign`, `switchChain`, `addChain`
 * and `sendTransaction` decide the user's choice.
 */
export function walletAnswers(
  wallet: { address: string; privateKey: string },
  choice: {
    connected: () => boolean;
    requestAccounts: () => WalletAnswer;
    sign?: () => WalletAnswer | undefined;
    switchChain?: () => WalletAnswer;
    addChain?: () => WalletAnswer;
    sendTransaction?: () => WalletAnswer;
  },
): (method: string, params: unknown[]) => Promise<WalletAnswer> {
  return async (method, params) => {
    switch (method) {
      case 'eth_accounts':
        return { result: choice.connected() ? [wallet.address] : [] };
      case 'eth_chainId':
        return { result: '0x1' };
      case 'net_version':
        return { result: '1' };
      case 'eth_requestAccounts':
        return choice.requestAccounts();
      case 'wallet_switchEthereumChain':
        return choice.switchChain?.() ?? { result: null };
      case 'wallet_addEthereumChain':
        return choice.addChain?.() ?? { result: null };
      // web3 asks the wallet for the fee data before it hands over a transaction; there is no chain behind it
      case 'eth_gasPrice':
      case 'eth_maxPriorityFeePerGas':
        return { result: '0x3b9aca00' };
      case 'eth_estimateGas':
        return { result: '0x5208' };
      case 'eth_getTransactionCount':
        return { result: '0x0' };
      case 'eth_getBlockByNumber':
        return { result: { number: '0x1', baseFeePerGas: '0x3b9aca00', gasLimit: '0x1c9c380', timestamp: '0x0' } };
      case 'eth_sendTransaction':
        return (
          choice.sendTransaction?.() ?? { error: { code: 4200, message: 'Unsupported method eth_sendTransaction' } }
        );
      case 'personal_sign': {
        const refusal = choice.sign?.();
        if (refusal) return refusal;
        const data = String(params[0]);
        const message = ethers.utils.isHexString(data) ? ethers.utils.arrayify(data) : data;
        return { result: await new ethers.Wallet(wallet.privateKey).signMessage(message) };
      }
      default:
        return { error: { code: 4200, message: `Unsupported method ${method}` } };
    }
  };
}

/** Records the sign-in and client-error POSTs the page sends. */
export function recordAuthAndErrorReports(page: Page): string[] {
  const sent: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (request.method() === 'POST' && /\/v1\/(auth|log\/clientError)$/.test(pathname)) sent.push(pathname);
  });
  return sent;
}

// The rejection MetaMask sends when the user closes the connection request: a plain object with code and data.
export const USER_REJECTION = {
  code: 4001,
  message: 'User rejected the request.',
  data: { cause: 'rejectAllApprovals' },
};
