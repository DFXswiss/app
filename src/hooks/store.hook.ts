import type { InfoBanner } from '@dfx.swiss/react';
import type { AppParams } from '../contexts/app-handling.context';
import type { WalletType } from '../contexts/wallet.context';

export interface StoreItem<T> {
  get: () => T | undefined;
  set: (item: T) => void;
  remove: () => void;
}

export interface StoreInterface {
  redirectUri: StoreItem<string>;
  balances: StoreItem<string>;
  language: StoreItem<string>;
  activeWallet: StoreItem<WalletType>;
  infoBanner: StoreItem<InfoBanner>;
  queryParams: StoreItem<AppParams>;
}

export enum StoreKey {
  AUTH_TOKEN = 'dfx.authenticationToken',
  REDIRECT_URI = 'dfx.srv.redirectUri',
  BALANCES = 'dfx.srv.balances',
  LANGUAGE = 'dfx.srv.language',
  ACTIVE_WALLET = 'dfx.srv.activeWallet',
  INFO_BANNER = 'dfx.srv.infoBanner',
  QUERY_PARAMS = 'dfx.srv.queryParams',
}

export function useStore(): StoreInterface {
  const { localStorage } = window;

  function set(key: StoreKey, value: string) {
    localStorage.setItem(key, value);
  }

  function get(key: StoreKey): string | undefined {
    return localStorage.getItem(key) ?? undefined;
  }

  function remove(key: StoreKey) {
    localStorage.removeItem(key);
  }

  function getJson<T>(key: StoreKey): T | undefined {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : undefined;
  }

  function setJson<T>(key: StoreKey, value: T) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  return {
    redirectUri: {
      get: () => get(StoreKey.REDIRECT_URI),
      set: (value: string) => set(StoreKey.REDIRECT_URI, value),
      remove: () => remove(StoreKey.REDIRECT_URI),
    },
    balances: {
      get: () => get(StoreKey.BALANCES),
      set: (value: string) => set(StoreKey.BALANCES, value),
      remove: () => remove(StoreKey.BALANCES),
    },
    language: {
      get: () => get(StoreKey.LANGUAGE),
      set: (value: string) => set(StoreKey.LANGUAGE, value),
      remove: () => remove(StoreKey.LANGUAGE),
    },
    activeWallet: {
      get: () => get(StoreKey.ACTIVE_WALLET) as WalletType,
      set: (value: WalletType) => set(StoreKey.ACTIVE_WALLET, value),
      remove: () => remove(StoreKey.ACTIVE_WALLET),
    },
    infoBanner: {
      get: () => getJson(StoreKey.INFO_BANNER),
      set: (value: InfoBanner) => setJson(StoreKey.INFO_BANNER, value),
      remove: () => remove(StoreKey.INFO_BANNER),
    },
    queryParams: {
      get: () => getJson<AppParams>(StoreKey.QUERY_PARAMS),
      set: (value: AppParams) => setJson(StoreKey.QUERY_PARAMS, value),
      remove: () => remove(StoreKey.QUERY_PARAMS),
    },
  };
}
