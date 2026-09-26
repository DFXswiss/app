/**
 * Hardware-wallet derivation paths owned by App 2.0.
 * Values must match `src/config/key-path.ts` — pinned by `legacy-contract.test.ts`.
 */

export enum BitcoinAddressType {
  TAPROOT = 'Taproot',
  NATIVE_SEGWIT = 'Native SegWit',
  SEGWIT = 'SegWit',
  LEGACY = 'Legacy',
}

const BitcoinAddressStandard = {
  [BitcoinAddressType.TAPROOT]: 'tr(@0/**)',
  [BitcoinAddressType.NATIVE_SEGWIT]: 'wpkh(@0/**)',
  [BitcoinAddressType.SEGWIT]: 'sh(wpkh(@0/**))',
  [BitcoinAddressType.LEGACY]: 'pkh(@0/**)',
};

const BitcoinSimpleType = {
  [BitcoinAddressType.TAPROOT]: 'p2tr',
  [BitcoinAddressType.NATIVE_SEGWIT]: 'p2wpkh',
  [BitcoinAddressType.SEGWIT]: 'p2wpkhP2sh',
  [BitcoinAddressType.LEGACY]: 'p2pkh',
};

export const BitcoinAddressPrefix = {
  [BitcoinAddressType.TAPROOT]: 86,
  [BitcoinAddressType.NATIVE_SEGWIT]: 84,
  [BitcoinAddressType.SEGWIT]: 49,
  [BitcoinAddressType.LEGACY]: 44,
};

const btcRootPath = "'/0'";
const ethRootPath = "44'/60'";

const KeyPath = {
  BTC: (account: number, type: BitcoinAddressType) => ({
    root: `${BitcoinAddressPrefix[type]}${btcRootPath}/${account}'`,
    xPub: `m/${BitcoinAddressPrefix[type]}${btcRootPath}/${account}'`,
    address: (index: number) => `m/${BitcoinAddressPrefix[type]}${btcRootPath}/${account}'/0/${index}`,
    addressStandard: BitcoinAddressStandard[type],
    simpleType: BitcoinSimpleType[type],
  }),
  ETH: (account: number) => ({
    root: `${ethRootPath}/${account}'`,
    xPub: `m/${ethRootPath}/${account}'`,
    address: (index: number) => `m/${ethRootPath}/${account}'/0/${index}`,
  }),
};

export default KeyPath;
