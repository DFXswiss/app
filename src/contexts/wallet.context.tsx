import {
  Blockchain,
  Utils,
  useApiSession,
  useAuth,
  useAuthContext,
  useSessionContext,
  useUserContext,
} from '@dfx.swiss/react';
import { AuthWalletType } from '@dfx.swiss/react/dist/definitions/auth';
import { Router } from '@remix-run/router';
import browserLang from 'browser-lang';
import { jwtDecode } from 'jwt-decode';
import { PropsWithChildren, createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../hooks/store.hook';
import { WalletType as MetaMaskWalletType, useMetaMask } from '../hooks/wallets/metamask.hook';
import { useAppHandlingContext } from './app-handling.context';
import { useBalanceContext } from './balance.context';

export enum WalletType {
  META_MASK = 'MetaMask',
  ALBY = 'Alby',
  LEDGER_BTC = 'LedgerBtc',
  LEDGER_ETH = 'LedgerEth',
  BITBOX_BTC = 'BitBoxBtc',
  BITBOX_ETH = 'BitBoxEth',
  TREZOR_BTC = 'TrezorBtc',
  TREZOR_ETH = 'TrezorEth',
  CLI_BTC = 'CliBtc',
  CLI_SPARK = 'CliSpark',
  CLI_ARK = 'CliArk',
  CLI_FIRO = 'CliFiro',
  CLI_XMR = 'CliXmr',
  CLI_ZANO = 'CliZano',
  CLI_ICP = 'CliIcp',
  CLI_ETH = 'CliEth',
  CLI_ADA = 'CliAda',
  CLI_AR = 'CliAr',
  CLI_LN = 'CliLn',
  CLI_SOL = 'CliSol',
  CLI_TRX = 'CliTrx',
  DFX_TARO = 'DfxTaro',
  WALLET_CONNECT = 'WalletConnect',
  CAKE = 'Cake',
  MONERO = 'Monero',
  PHANTOM_SOL = 'PhantomSol',
  TRUST_SOL = 'TrustSol',
  TRUST_TRX = 'TrustTrx',
  TRONLINK_TRX = 'TronLinkTrx',
  MAIL = 'Mail',
  ADDRESS = 'Address',
}

export const WalletBlockchains: { [w in WalletType]?: Blockchain[] } = {
  [WalletType.META_MASK]: [
    Blockchain.ETHEREUM,
    Blockchain.ARBITRUM,
    Blockchain.OPTIMISM,
    Blockchain.POLYGON,
    Blockchain.BASE,
    Blockchain.GNOSIS,
    Blockchain.HAQQ,
    Blockchain.BINANCE_SMART_CHAIN,
    Blockchain.CITREA,
    Blockchain.CITREA_TESTNET,
    Blockchain.SEPOLIA,
  ],
  [WalletType.ALBY]: [Blockchain.LIGHTNING],
  [WalletType.LEDGER_BTC]: [Blockchain.BITCOIN],
  [WalletType.LEDGER_ETH]: [Blockchain.ETHEREUM, Blockchain.ARBITRUM, Blockchain.OPTIMISM, Blockchain.POLYGON],
  [WalletType.BITBOX_BTC]: [Blockchain.BITCOIN],
  [WalletType.BITBOX_ETH]: [Blockchain.ETHEREUM, Blockchain.ARBITRUM, Blockchain.OPTIMISM, Blockchain.POLYGON],
  [WalletType.TREZOR_BTC]: [Blockchain.BITCOIN],
  [WalletType.TREZOR_ETH]: [Blockchain.ETHEREUM, Blockchain.ARBITRUM, Blockchain.OPTIMISM, Blockchain.POLYGON],
  [WalletType.CLI_BTC]: [Blockchain.BITCOIN],
  [WalletType.CLI_SPARK]: [Blockchain.SPARK],
  [WalletType.CLI_ARK]: [Blockchain.ARKADE],
  [WalletType.CLI_FIRO]: [Blockchain.FIRO],
  [WalletType.CLI_LN]: [Blockchain.LIGHTNING],
  [WalletType.CLI_XMR]: [Blockchain.MONERO],
  [WalletType.CLI_ZANO]: [Blockchain.ZANO],
  [WalletType.CLI_ICP]: [Blockchain.INTERNET_COMPUTER],
  [WalletType.CLI_ETH]: [
    Blockchain.ETHEREUM,
    Blockchain.ARBITRUM,
    Blockchain.OPTIMISM,
    Blockchain.POLYGON,
    Blockchain.BASE,
    Blockchain.GNOSIS,
    Blockchain.HAQQ,
    Blockchain.BINANCE_SMART_CHAIN,
    Blockchain.CITREA,
    Blockchain.CITREA_TESTNET,
    Blockchain.SEPOLIA,
  ],
  [WalletType.CLI_ADA]: [Blockchain.CARDANO],
  [WalletType.CLI_AR]: [Blockchain.ARWEAVE],
  [WalletType.CLI_SOL]: [Blockchain.SOLANA],
  [WalletType.CLI_TRX]: [Blockchain.TRON],
  [WalletType.DFX_TARO]: [Blockchain.LIGHTNING],
  [WalletType.WALLET_CONNECT]: [
    Blockchain.ETHEREUM,
    Blockchain.ARBITRUM,
    Blockchain.OPTIMISM,
    Blockchain.POLYGON,
    Blockchain.BASE,
    Blockchain.GNOSIS,
    Blockchain.HAQQ,
    Blockchain.BINANCE_SMART_CHAIN,
    Blockchain.CITREA,
    Blockchain.CITREA_TESTNET,
    Blockchain.SEPOLIA,
  ],
  [WalletType.CAKE]: [Blockchain.MONERO, Blockchain.ZANO],
  [WalletType.MONERO]: [Blockchain.MONERO],
  [WalletType.PHANTOM_SOL]: [Blockchain.SOLANA],
  [WalletType.TRUST_SOL]: [Blockchain.SOLANA],
  [WalletType.TRUST_TRX]: [Blockchain.TRON],
  [WalletType.TRONLINK_TRX]: [Blockchain.TRON],
};

export function supportsBlockchain(wallet: WalletType, blockchain: Blockchain): boolean {
  const supportedChains = WalletBlockchains[wallet];
  return !supportedChains || supportedChains.includes(blockchain);
}

const WalletTypeMap: { [k in WalletType]: AuthWalletType | undefined } = {
  [WalletType.META_MASK]: AuthWalletType.METAMASK,
  [WalletType.ALBY]: AuthWalletType.ALBY,
  [WalletType.LEDGER_BTC]: AuthWalletType.LEDGER,
  [WalletType.LEDGER_ETH]: AuthWalletType.LEDGER,
  [WalletType.BITBOX_BTC]: AuthWalletType.BIT_BOX,
  [WalletType.BITBOX_ETH]: AuthWalletType.BIT_BOX,
  [WalletType.TREZOR_BTC]: AuthWalletType.TREZOR,
  [WalletType.TREZOR_ETH]: AuthWalletType.TREZOR,
  [WalletType.CLI_BTC]: AuthWalletType.CLI,
  [WalletType.CLI_SPARK]: AuthWalletType.CLI,
  [WalletType.CLI_ARK]: AuthWalletType.CLI,
  [WalletType.CLI_FIRO]: AuthWalletType.CLI,
  [WalletType.CLI_LN]: AuthWalletType.CLI,
  [WalletType.CLI_XMR]: AuthWalletType.CLI,
  [WalletType.CLI_ZANO]: AuthWalletType.CLI,
  [WalletType.CLI_ICP]: AuthWalletType.CLI,
  [WalletType.CLI_ETH]: AuthWalletType.CLI,
  [WalletType.CLI_ADA]: AuthWalletType.CLI,
  [WalletType.CLI_AR]: AuthWalletType.CLI,
  [WalletType.CLI_SOL]: AuthWalletType.CLI,
  [WalletType.CLI_TRX]: AuthWalletType.CLI,
  [WalletType.DFX_TARO]: AuthWalletType.DFX_TARO,
  [WalletType.WALLET_CONNECT]: AuthWalletType.WALLET_CONNECT,
  [WalletType.PHANTOM_SOL]: AuthWalletType.PHANTOM,
  [WalletType.TRUST_SOL]: AuthWalletType.TRUST,
  [WalletType.TRUST_TRX]: AuthWalletType.TRUST,
  [WalletType.TRONLINK_TRX]: AuthWalletType.TRON_LINK,
  [WalletType.CAKE]: undefined,
  [WalletType.MONERO]: undefined,
  [WalletType.MAIL]: undefined,
  [WalletType.ADDRESS]: undefined,
};

interface WalletInterface {
  isInitialized: boolean;
  blockchain?: Blockchain;
  switchBlockchain: (to: Blockchain) => void;
  login: (
    wallet: WalletType,
    address: string,
    blockchain: Blockchain,
    onSignMessage: (address: string, message: string) => Promise<string>,
    key?: string,
  ) => Promise<void>;
  setSession: (session: string, wallet?: WalletType, blockchain?: Blockchain) => Promise<void>;
  setWallet: (wallet?: WalletType) => void;
  activeWallet: WalletType | undefined;
}

interface WalletContextProps extends PropsWithChildren {
  router: Router;
}

const WalletContext = createContext<WalletInterface>(undefined as any);

export function useWalletContext(): WalletInterface {
  return useContext(WalletContext);
}

export function WalletContextProvider(props: WalletContextProps): JSX.Element {
  const { isInitialized: isSessionInitialized, isLoggedIn, logout } = useSessionContext();
  const { session } = useAuthContext();
  const { updateSession } = useApiSession();
  const api = useSessionContext();
  const {
    isInitialized: isParamsInitialized,
    params: appParams,
  } = useAppHandlingContext();
  const { getSignMessage } = useAuth();
  const { readBalances } = useBalanceContext();
  const { activeWallet: activeWalletStore } = useStore();
  const { addSpecialCode, reloadUser } = useUserContext();
  const { getWalletType } = useMetaMask();

  const [isInitialized, setIsInitialized] = useState(false);
  const [activeWallet, setActiveWallet] = useState<WalletType | undefined>(activeWalletStore.get());
  const [activeBlockchain, setActiveBlockchain] = useState<Blockchain>();
  const lastAppliedCredentials = useRef<{ address?: string; signature?: string; session?: string }>({});

  // initialize
  useEffect(() => {
    if (isSessionInitialized && !isLoggedIn) {
      setWallet();
      lastAppliedCredentials.current = {}; // Reset on logout to allow re-login with same credentials
      if (isInitialized) readBalances(undefined);
    }

    if (isSessionInitialized && isInitialized && isLoggedIn && appParams.specialCode) {
      addSpecialCode(appParams.specialCode).catch(() => undefined);
    }
  }, [isSessionInitialized, isLoggedIn, isInitialized]);

  useEffect(() => {
    if (isParamsInitialized) {
      setIsInitialized(false);
      handleParamSession().then((hasSession) => {
        if (hasSession) {
          setWallet(appParams.type as WalletType);
          appParams.redirect && props.router.navigate(appParams.redirect);
        }
        setIsInitialized(true);
      });
    }
  }, [isParamsInitialized, appParams]);

  async function handleParamSession(): Promise<boolean> {
    const lastCreds = lastAppliedCredentials.current;

    try {
      if (appParams.address && appParams.signature) {
        // Skip if same credentials were already applied (prevent duplicate login)
        if (lastCreds.address === appParams.address && lastCreds.signature === appParams.signature) {
          return false;
        }

        // Set credentials BEFORE async call to prevent race conditions (React StrictMode double-render)
        const credentials = { address: appParams.address, signature: appParams.signature };
        lastAppliedCredentials.current = credentials;
        await createSession(appParams.address, appParams.signature, appParams.pubkey);
        return true;
      } else if (appParams.session) {
        // Skip if same session was already applied
        if (lastCreds.session === appParams.session) {
          return false;
        }

        // Set session BEFORE call to prevent race conditions
        const credentials = { session: appParams.session };
        lastAppliedCredentials.current = credentials;
        if (!Utils.isJwt(appParams.session)) {
          throw new Error('Invalid session');
        }
        authenticatedCustomerIdentity(appParams.session);
        updateSession(appParams.session);
        return true;
      }
    } catch (e) {
      // Reset on error to allow retry
      lastAppliedCredentials.current = {};
      logout();
    }

    return false;
  }

  function authenticatedCustomerIdentity(token: string): number {
    const account = jwtDecode<{ account?: number }>(token).account;
    if (typeof account !== 'number') throw new Error('Authenticated session has no customer identity');
    return account;
  }

  function setWallet(walletType?: WalletType) {
    setActiveWallet(walletType);
    walletType ? activeWalletStore.set(walletType) : activeWalletStore.remove();
  }

  // public API
  async function login(
    wallet: WalletType,
    address: string,
    blockchain: Blockchain,
    onSignMessage: (address: string, message: string) => Promise<string>,
    key?: string,
  ): Promise<void> {
    try {
      const message = await getSignMessage(address);
      const signature = await onSignMessage(address, message);
      await createSession(address, signature, key, wallet);
    } catch (e) {
      if (!isLoggedIn || !session || session.address) api.logout();
      setWallet();

      throw e;
    }

    setWallet(wallet);
    setActiveBlockchain(blockchain);

    reloadUser();
  }

  async function setSession(session: string, wallet?: WalletType, blockchain?: Blockchain): Promise<void> {
    updateSession(session);

    setWallet(wallet);
    setActiveBlockchain(blockchain);
  }

  async function createSession(address: string, signature: string, key?: string, wallet?: WalletType): Promise<string> {
    let authWallet = wallet && WalletTypeMap[wallet];

    if (wallet === WalletType.META_MASK) {
      const detectedWallet = getWalletType();
      switch (detectedWallet) {
        case MetaMaskWalletType.META_MASK:
          authWallet = AuthWalletType.METAMASK;
          break;

        case MetaMaskWalletType.RABBY:
          authWallet = AuthWalletType.RABBY;
          break;

        case MetaMaskWalletType.IN_APP_BROWSER:
          authWallet = AuthWalletType.WALLET_BROWSER;
          break;
      }
    }

    // Detect browser language (consistent with settings.context)
    const browserLanguage = browserLang({ languages: ['de', 'en', 'fr', 'it'], fallback: 'en' })?.toUpperCase();

    return api.authenticate(
      address,
      signature,
      key,
      appParams.specialCode,
      appParams.wallet,
      appParams.refcode,
      authWallet,
      appParams.recommendationCode,
      browserLanguage,
    );
  }

  const context: WalletInterface = useMemo(
    () => ({
      isInitialized: isInitialized && isSessionInitialized && isParamsInitialized,
      blockchain: activeBlockchain,
      switchBlockchain: setActiveBlockchain,
      login,
      setSession,
      setWallet,
      activeWallet,
    }),
    [
      isInitialized,
      isSessionInitialized,
      isParamsInitialized,
      activeWallet,
      activeBlockchain,
      isLoggedIn,
      api,
      appParams,
      session,
    ],
  );

  return <WalletContext.Provider value={context}>{props.children}</WalletContext.Provider>;
}
