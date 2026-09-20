jest.mock('@dfx.swiss/react', () => ({
  Blockchain: { BITCOIN: 'Bitcoin', ETHEREUM: 'Ethereum' },
  FiatPaymentMethod: { BANK: 'Bank', INSTANT: 'Instant', CARD: 'Card' },
  PersonalIbanProvider: { FRICK: 'Frick', YAPEAL: 'Yapeal' },
  AuthWalletType: { METAMASK: 'MetaMask', LEDGER: 'Ledger', CLI: 'CLI', WALLET_CONNECT: 'WalletConnect' },
}));

import { Blockchain, FiatPaymentMethod, PersonalIbanProvider } from '@dfx.swiss/react';
import {
  appendCompletionPath,
  assetMatchesFilterToken,
  chainAllowedByParam,
  completionRedirectUrl,
  filterAssetsByParam,
  isPersonalIbanApplicable,
  authWalletTypeFromParam,
  flagsInclude,
  hardwareChainsForWalletsFilter,
  isPresentFlag,
  isTrueFlag,
  matchBankAccount,
  parseEnumValue,
  personalIbanParamState,
  privateTradeBlocked,
  restrictBlockchains,
  splitCsvParam,
  walletAllowedByParam,
} from '../screens/trade/widget-params';

describe('widget param parsers', () => {
  it('treats only the string true as an on-flag', () => {
    expect(isTrueFlag('true')).toBe(true);
    expect(isTrueFlag('TRUE')).toBe(false);
    expect(isTrueFlag('1')).toBe(false);
    expect(isTrueFlag('')).toBe(false);
    expect(isTrueFlag(undefined)).toBe(false);
  });

  it('treats any non-empty value as a present-flag', () => {
    expect(isPresentFlag('1')).toBe(true);
    expect(isPresentFlag('true')).toBe(true);
    expect(isPresentFlag('')).toBe(false);
    expect(isPresentFlag(undefined)).toBe(false);
    expect(flagsInclude('', 'private')).toBe(false);
    expect(splitCsvParam('')).toBeUndefined();
    expect(parseEnumValue('', { Bank: 'Bank' as const })).toBeUndefined();
    expect(filterAssetsByParam([{ name: 'ETH' }], '')).toEqual([{ name: 'ETH' }]);
    expect(chainAllowedByParam('Ethereum', '')).toBe(true);
    expect(walletAllowedByParam({ id: 'MetaMask', walletType: 'MetaMask' }, '')).toBe(true);
  });

  it('matches a flags token as a substring of the raw csv, like the main app', () => {
    expect(flagsInclude(undefined, 'private')).toBe(false);
    expect(flagsInclude('', 'private')).toBe(false);
    expect(flagsInclude('private', 'private')).toBe(true);
    expect(flagsInclude('foo,private', 'private')).toBe(true);
    expect(flagsInclude('foo', 'private')).toBe(false);
  });

  it('blocks a private-asset checkout unless flags names private', () => {
    expect(privateTradeBlocked(undefined, ['Private'])).toBe(true);
    expect(privateTradeBlocked('foo', ['Private'])).toBe(true);
    expect(privateTradeBlocked('private', ['Private'])).toBe(false);
    expect(privateTradeBlocked(undefined, ['Public'])).toBe(false);
    expect(privateTradeBlocked(undefined, [undefined])).toBe(false);
    expect(privateTradeBlocked('private', ['Public', 'Private'])).toBe(false);
  });

  it('matches enum members case-insensitively and skips unknown or empty values', () => {
    expect(parseEnumValue('instant', FiatPaymentMethod)).toBe(FiatPaymentMethod.INSTANT);
    expect(parseEnumValue('Ethereum', Blockchain)).toBe(Blockchain.ETHEREUM);
    expect(parseEnumValue('paypal', FiatPaymentMethod)).toBeUndefined();
    expect(parseEnumValue(undefined, FiatPaymentMethod)).toBeUndefined();
  });

  it('splits a csv param only when it is non-empty, without trimming tokens', () => {
    expect(splitCsvParam(undefined)).toBeUndefined();
    expect(splitCsvParam('')).toBeUndefined();
    expect(splitCsvParam('BTC, ETH')).toEqual(['BTC', ' ETH']);
  });

  it('matches an assets token by id, uniqueName, name or chainId', () => {
    const usdt = { id: 111, name: 'USDT', uniqueName: 'Ethereum/USDT', chainId: '0xdac17f958d2ee523a2206206994597c13d831ec7' };
    expect(assetMatchesFilterToken(usdt, '111')).toBe(true);
    expect(assetMatchesFilterToken(usdt, 'ethereum/usdt')).toBe(true);
    expect(assetMatchesFilterToken(usdt, 'usdt')).toBe(true);
    expect(assetMatchesFilterToken(usdt, '0xdAC17F958D2ee523a2206206994597C13D831ec7')).toBe(true);
    expect(assetMatchesFilterToken(usdt, 'BTC')).toBe(false);
  });

  it('filters assets like the main app: absent keeps all, unknown tokens empty the list', () => {
    const list = [
      { id: 1, name: 'BTC', uniqueName: 'Bitcoin/BTC' },
      { id: 2, name: 'ETH', uniqueName: 'Ethereum/ETH' },
    ];
    expect(filterAssetsByParam(list, undefined).map((a) => a.name)).toEqual(['BTC', 'ETH']);
    expect(filterAssetsByParam(list, 'ETH,BTC').map((a) => a.name)).toEqual(['BTC', 'ETH']);
    expect(filterAssetsByParam(list, 'eth').map((a) => a.name)).toEqual(['ETH']);
    expect(filterAssetsByParam(list, 'NOPE').map((a) => a.name)).toEqual([]);
  });

  it('allows a chain when the blockchains param is absent, and drops unknown names', () => {
    expect(chainAllowedByParam('Ethereum', undefined)).toBe(true);
    expect(chainAllowedByParam('Ethereum', 'ethereum,bitcoin')).toBe(true);
    expect(chainAllowedByParam('Ethereum', 'Bitcoin')).toBe(false);
    expect(chainAllowedByParam('Ethereum', 'Mars')).toBe(false);
  });

  it('allows a wallet when the wallets param is absent, and matches type or id case-sensitively', () => {
    const meta = { id: 'MetaMask', walletType: 'MetaMask' };
    expect(walletAllowedByParam(meta, undefined)).toBe(true);
    expect(walletAllowedByParam(meta, 'MetaMask')).toBe(true);
    expect(walletAllowedByParam({ id: 'Ledger', walletType: 'Ledger' }, 'Ledger')).toBe(true);
    expect(walletAllowedByParam(meta, 'metamask')).toBe(false);
    expect(walletAllowedByParam(meta, 'NoSuchWallet')).toBe(false);
    expect(walletAllowedByParam({ id: 'DFX Taro' }, 'DFX Taro')).toBe(true);
    expect(walletAllowedByParam({ id: 'Coinbase Wallet', walletType: 'WalletBrowser' }, 'WalletBrowser')).toBe(true);
  });

  it('maps chain-specific WalletType tokens onto the catalog row for that vendor', () => {
    const ledger = { id: 'Ledger', walletType: 'Ledger' };
    const bitbox = { id: 'BitBox', walletType: 'BitBox' };
    const trezor = { id: 'Trezor', walletType: 'Trezor' };
    const phantom = { id: 'Phantom', walletType: 'Phantom' };
    const trust = { id: 'Trust Wallet', walletType: 'Trust' };
    const tronlink = { id: 'TronLink', walletType: 'TronLink' };
    const meta = { id: 'MetaMask', walletType: 'MetaMask' };
    expect(walletAllowedByParam(ledger, 'LedgerEth')).toBe(true);
    expect(walletAllowedByParam(bitbox, 'BitBoxBtc')).toBe(true);
    expect(walletAllowedByParam(trezor, 'TrezorEth')).toBe(true);
    expect(walletAllowedByParam(phantom, 'PhantomSol')).toBe(true);
    expect(walletAllowedByParam(trust, 'TrustTrx')).toBe(true);
    expect(walletAllowedByParam(trust, 'TrustSol')).toBe(true);
    expect(walletAllowedByParam(tronlink, 'TronLinkTrx')).toBe(true);
    expect(walletAllowedByParam(meta, 'LedgerEth')).toBe(false);
  });

  it('maps CliAda to Cardano and other Cli* tokens to the CLI row', () => {
    const cardano = { id: 'Cardano', walletType: 'CLI' };
    const cli = { id: 'CLI', walletType: 'CLI' };
    expect(walletAllowedByParam(cardano, 'CliAda')).toBe(true);
    expect(walletAllowedByParam(cli, 'CliAda')).toBe(false);
    expect(walletAllowedByParam(cli, 'CliEth')).toBe(true);
    expect(walletAllowedByParam(cardano, 'CliEth')).toBe(false);
    expect(walletAllowedByParam(cli, 'CliIcp')).toBe(true);
    expect(walletAllowedByParam({ id: 'Internet Computer' }, 'CliIcp')).toBe(false);
  });

  it('keeps named wallets when the list also has a token App 2.0 does not offer', () => {
    const meta = { id: 'MetaMask', walletType: 'MetaMask' };
    const ledger = { id: 'Ledger', walletType: 'Ledger' };
    expect(walletAllowedByParam(meta, 'MetaMask,Cake')).toBe(true);
    expect(walletAllowedByParam(ledger, 'MetaMask,Cake')).toBe(false);
  });

  it('matches no catalog row for a WalletType App 2.0 does not offer', () => {
    const meta = { id: 'MetaMask', walletType: 'MetaMask' };
    expect(walletAllowedByParam(meta, 'Mail')).toBe(false);
    expect(walletAllowedByParam(meta, 'DfxTaro')).toBe(false);
  });

  it('maps a type param to the auth wallet type, including LedgerEth', () => {
    expect(authWalletTypeFromParam(undefined)).toBeUndefined();
    expect(authWalletTypeFromParam('')).toBeUndefined();
    expect(authWalletTypeFromParam('MetaMask')).toBe('MetaMask');
    expect(authWalletTypeFromParam('LedgerEth')).toBe('Ledger');
    expect(authWalletTypeFromParam('NoSuchWallet')).toBeUndefined();
  });

  it('limits hardware chains to the WalletType the wallets param names', () => {
    expect(hardwareChainsForWalletsFilter(undefined)).toBeUndefined();
    expect(hardwareChainsForWalletsFilter('Ledger')).toBeUndefined();
    expect(hardwareChainsForWalletsFilter('LedgerEth')).toEqual(['eth']);
    expect(hardwareChainsForWalletsFilter('LedgerBtc')).toEqual(['btc']);
    expect(hardwareChainsForWalletsFilter('LedgerEth,LedgerBtc')).toEqual(['eth', 'btc']);
  });

  it('restricts the session chain list to a wanted chain, and ignores an unreachable one', () => {
    expect(restrictBlockchains(['Ethereum', 'Bitcoin'], undefined)).toEqual(['Ethereum', 'Bitcoin']);
    expect(restrictBlockchains(undefined, 'Ethereum')).toEqual(['Ethereum']);
    expect(restrictBlockchains([], 'Ethereum')).toEqual(['Ethereum']);
    expect(restrictBlockchains(['Ethereum', 'Bitcoin'], 'Ethereum')).toEqual(['Ethereum']);
    expect(restrictBlockchains(['Bitcoin'], 'Ethereum')).toEqual(['Bitcoin']);
  });

  it('matches a bank account by id, iban or label, and misses otherwise', () => {
    const accounts = [
      { id: 1, iban: 'DE89370400440532013000', label: 'Default' },
      { id: 2, iban: 'CH9300762011623852957', label: 'Savings' },
    ];
    expect(matchBankAccount(accounts, '2')?.iban).toBe('CH9300762011623852957');
    expect(matchBankAccount(accounts, 'ch9300762011623852957')?.id).toBe(2);
    expect(matchBankAccount(accounts, 'savings')?.id).toBe(2);
    expect(matchBankAccount(accounts, 'unknown')).toBeUndefined();
  });

  it('applies a personal-iban selector only for EUR/CHF bank transfer', () => {
    expect(isPersonalIbanApplicable('EUR', FiatPaymentMethod.BANK, FiatPaymentMethod.BANK)).toBe(true);
    expect(isPersonalIbanApplicable('USD', FiatPaymentMethod.BANK, FiatPaymentMethod.BANK)).toBe(false);
    expect(isPersonalIbanApplicable('EUR', FiatPaymentMethod.INSTANT, FiatPaymentMethod.BANK)).toBe(false);
    expect(isPersonalIbanApplicable(undefined, FiatPaymentMethod.BANK, FiatPaymentMethod.BANK)).toBe(false);
  });

  it('classifies personal-iban as absent, unrecognized, inapplicable or ready', () => {
    expect(personalIbanParamState(undefined, PersonalIbanProvider, 'EUR', 'Bank', 'Bank')).toEqual({ kind: 'absent' });
    expect(personalIbanParamState('', PersonalIbanProvider, 'EUR', 'Bank', 'Bank')).toEqual({
      kind: 'unrecognized',
    });
    expect(personalIbanParamState('nope', PersonalIbanProvider, 'EUR', 'Bank', 'Bank')).toEqual({
      kind: 'unrecognized',
    });
    expect(personalIbanParamState('frick', PersonalIbanProvider, 'EUR', 'Instant', 'Bank')).toEqual({
      kind: 'inapplicable',
      reason: 'method',
    });
    expect(personalIbanParamState('frick', PersonalIbanProvider, 'USD', 'Bank', 'Bank')).toEqual({
      kind: 'inapplicable',
      reason: 'currency',
    });
    expect(personalIbanParamState('frick', PersonalIbanProvider, undefined, 'Bank', 'Bank')).toEqual({
      kind: 'inapplicable',
      reason: 'currency',
    });
    expect(personalIbanParamState('Frick', PersonalIbanProvider, 'EUR', 'Bank', 'Bank')).toEqual({
      kind: 'ready',
      provider: 'Frick',
    });
  });

  it('appends the close path on https and on a custom-scheme URI', () => {
    expect(appendCompletionPath(new URL('https://partner.example/done'), 'buy').toString()).toBe(
      'https://partner.example/done/buy',
    );
    expect(appendCompletionPath(new URL('https://partner.example/done/'), 'sell', { isComplete: 'false' }).href).toBe(
      'https://partner.example/done/sell?isComplete=false',
    );
    const deep = appendCompletionPath(new URL('mywallet://callback'), 'swap', { amount: '1' });
    expect(deep.toString()).toMatch(/^mywallet:/);
    expect(deep.searchParams.get('amount')).toBe('1');

    const custom = new URL('https://example.com');
    Object.defineProperty(custom, 'origin', { value: 'null' });
    custom.pathname = '';
    const fromEmpty = appendCompletionPath(custom, 'buy');
    expect(fromEmpty.toString()).toMatch(/buy/);
  });

  it('returns a completion URL only for a safe redirect-uri', () => {
    expect(completionRedirectUrl(undefined, 'buy')).toBeUndefined();
    expect(completionRedirectUrl('javascript:alert(1)', 'buy')).toBeUndefined();
    expect(completionRedirectUrl('https://partner.example/done', 'buy')).toBe('https://partner.example/done/buy');
    expect(completionRedirectUrl('http://localhost:3001/x', 'sell')).toBe('http://localhost:3001/x/sell');
    expect(completionRedirectUrl('not a uri', 'buy')).toBeUndefined();
  });
});
