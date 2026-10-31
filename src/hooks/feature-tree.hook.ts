import { Blockchain, Language } from '@dfx.swiss/react';
import { useMemo } from 'react';
import { FeatureTree } from '../config/feature-tree';
import { AppParams, useAppHandlingContext } from '../contexts/app-handling.context';
import { useFeatureFlags } from './feature-flag.hook';
import { useSettingsContext } from '../contexts/settings.context';
import { WalletType } from '../contexts/wallet.context';
import { useAppParams } from './app-params.hook';

// --- INTERFACES --- //
export interface Page {
  id: string;
  dfxStyle?: boolean;
  header?: string;
  description?: string;
  bottomImage?: string;
  tiles: Tile[];
}

export type Tile = DefaultTile | DisabledTile | WalletTile;

export interface BaseTile {
  id: string;
  img: string;
  disabled?: boolean;
  /** URL feature flag that unlocks this tile (e.g. 'passkey' for ?feature=Passkey) */
  feature?: string;
  next?: Next;
  wallet?: Wallet | WalletSelector;
}

export interface DefaultTile extends BaseTile {
  next: Next;
}

export interface DisabledTile extends BaseTile {
  disabled: true;
}

export interface WalletTile extends BaseTile {
  wallet: Wallet | WalletSelector;
}

export interface Next {
  page: string;
  tiles?: string[];
  options?: Options;
}

export interface Wallet {
  type: WalletType;
  blockchain?: Blockchain;
}

export type WalletSelector = (params: AppParams) => Wallet;

export interface Options {
  service?: string;
  query?: Query;
}

type Query = { [k in keyof AppParams]: string };

export function isWallet(tile: Tile): tile is WalletTile {
  return tile?.wallet != null;
}

// --- HOOK --- //

interface FeatureTreeInterface {
  getPage: (pageId?: string, allowedTiles?: string[]) => Page | undefined;
  getWallet: (tile: WalletTile, params: AppParams) => Wallet;
  setOptions: (options: Options) => void;
}

export function useFeatureTree(): FeatureTreeInterface {
  const { language } = useSettingsContext();
  const { isEnabled } = useFeatureFlags();
  const { setParams } = useAppParams();
  const { setRedirectPath } = useAppHandlingContext();

  const supportedLanguages = ['EN', 'DE', 'IT', 'FR'];

  function getPage(pageId?: string, allowedTiles?: string[]): Page | undefined {
    if (!language) return;

    const nextPage = FeatureTree.find((p) => p.id === pageId) ?? FeatureTree[0];
    const tiles = nextPage.tiles
      .map((t) => ({ ...t, img: getImgUrl(t, language) }))
      .filter((t) => !t.feature || isEnabled(t.feature))
      .filter((t) => !allowedTiles || allowedTiles.includes(t.id));
    return { ...nextPage, tiles };
  }

  function getWallet(tile: WalletTile, params: AppParams): Wallet {
    return typeof tile.wallet === 'function' ? tile.wallet(params) : tile.wallet;
  }

  function getImgUrl(tile: BaseTile, lang: Language): string {
    const language = supportedLanguages.find((l) => l === lang.symbol) ?? supportedLanguages[0];
    return `https://dfx.swiss/images/app/${tile.img}_${language.toLowerCase()}.jpg`;
  }

  function setOptions(options: Options) {
    // service
    if (options.service) setRedirectPath(`/${options.service}`);

    // query
    if (options.query) {
      setParams(options.query);
    }
  }

  return useMemo(() => ({ getPage, getWallet, setOptions }), [language, setParams]);
}
