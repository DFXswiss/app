// DFX App 2.0 — real token & network icon maps (restored from the static preview's
// assets/tokens + assets/networks set). Keyed by uppercased ticker / Blockchain enum
// value; glyphs.tsx falls back to the initials circle for anything not covered here.
// Generated from the bundled SVG files — keep in sync when adding assets.

import t_AAVE from '../../assets/tokens/AAVE.svg';
import t_ADA from '../../assets/tokens/ADA.svg';
import t_ARB from '../../assets/tokens/ARB.svg';
import t_BNB from '../../assets/tokens/BNB.svg';
import t_BTC from '../../assets/tokens/BTC.svg';
import t_CRV from '../../assets/tokens/CRV.svg';
import t_DAI from '../../assets/tokens/DAI.svg';
import t_DEPS from '../../assets/tokens/DEPS.svg';
import t_DEURO from '../../assets/tokens/DEURO.svg';
import t_DFI from '../../assets/tokens/DFI.svg';
import t_DFX from '../../assets/tokens/DFX.svg';
import t_ETH from '../../assets/tokens/ETH.svg';
import t_EURC from '../../assets/tokens/EURC.svg';
import t_FIRO from '../../assets/tokens/FIRO.svg';
import t_GMX from '../../assets/tokens/GMX.svg';
import t_ICP from '../../assets/tokens/ICP.svg';
import t_LINK from '../../assets/tokens/LINK.svg';
import t_MATIC from '../../assets/tokens/MATIC.svg';
import t_MKR from '../../assets/tokens/MKR.svg';
import t_NDEPS from '../../assets/tokens/NDEPS.svg';
import t_OP from '../../assets/tokens/OP.svg';
import t_POL from '../../assets/tokens/POL.svg';
import t_SAND from '../../assets/tokens/SAND.svg';
import t_SOL from '../../assets/tokens/SOL.svg';
import t_TRX from '../../assets/tokens/TRX.svg';
import t_UNI from '../../assets/tokens/UNI.svg';
import t_USDC from '../../assets/tokens/USDC.svg';
import t_USDT from '../../assets/tokens/USDT.svg';
import t_WBTC from '../../assets/tokens/WBTC.svg';
import t_XMR from '../../assets/tokens/XMR.svg';

export const TOKEN_ICONS: Record<string, string> = {
  AAVE: t_AAVE,
  ADA: t_ADA,
  ARB: t_ARB,
  BNB: t_BNB,
  BTC: t_BTC,
  CRV: t_CRV,
  DAI: t_DAI,
  DEPS: t_DEPS,
  DEURO: t_DEURO,
  DFI: t_DFI,
  DFX: t_DFX,
  ETH: t_ETH,
  EURC: t_EURC,
  FIRO: t_FIRO,
  GMX: t_GMX,
  ICP: t_ICP,
  LINK: t_LINK,
  MATIC: t_MATIC,
  MKR: t_MKR,
  NDEPS: t_NDEPS,
  OP: t_OP,
  POL: t_POL,
  SAND: t_SAND,
  SOL: t_SOL,
  TRX: t_TRX,
  UNI: t_UNI,
  USDC: t_USDC,
  USDT: t_USDT,
  WBTC: t_WBTC,
  XMR: t_XMR,
};

import n_arbitrumone from '../../assets/networks/arbitrum-one.svg';
import n_base from '../../assets/networks/base.svg';
import n_binancesmartchain from '../../assets/networks/binance-smart-chain.svg';
import n_bitcoin from '../../assets/networks/bitcoin.svg';
import n_cardano from '../../assets/networks/cardano.svg';
import n_citrea from '../../assets/networks/citrea.svg';
import n_ethereum from '../../assets/networks/ethereum.svg';
import n_gnosis from '../../assets/networks/gnosis.svg';
import n_lightning from '../../assets/networks/lightning.svg';
import n_litecoin from '../../assets/networks/litecoin.svg';
import n_optimism from '../../assets/networks/optimism.svg';
import n_polygon from '../../assets/networks/polygon.svg';
import n_solana from '../../assets/networks/solana.svg';
import n_tron from '../../assets/networks/tron.svg';

export const NETWORK_ICONS: Record<string, string> = {
  'arbitrum-one': n_arbitrumone,
  base: n_base,
  'binance-smart-chain': n_binancesmartchain,
  bitcoin: n_bitcoin,
  cardano: n_cardano,
  citrea: n_citrea,
  ethereum: n_ethereum,
  gnosis: n_gnosis,
  lightning: n_lightning,
  litecoin: n_litecoin,
  optimism: n_optimism,
  polygon: n_polygon,
  solana: n_solana,
  tron: n_tron,
};
