jest.mock('@dfx.swiss/react', () => ({
  Blockchain: { BITCOIN: 'Bitcoin', ETHEREUM: 'Ethereum' },
  FiatPaymentMethod: { BANK: 'Bank', INSTANT: 'Instant', CARD: 'Card' },
  PersonalIbanProvider: { FRICK: 'Frick', YAPEAL: 'Yapeal' },
}));

import { Blockchain, FiatPaymentMethod, PersonalIbanProvider } from '@dfx.swiss/react';
import {
  appendCompletionPath,
  completionRedirectUrl,
  isPersonalIbanApplicable,
  isTrueFlag,
  matchBankAccount,
  parseEnumValue,
  personalIbanParamState,
  restrictBlockchains,
} from '../screens/trade/widget-params';

describe('widget param parsers', () => {
  it('treats only the string true as an on-flag', () => {
    expect(isTrueFlag('true')).toBe(true);
    expect(isTrueFlag('TRUE')).toBe(false);
    expect(isTrueFlag(undefined)).toBe(false);
  });

  it('matches enum members case-insensitively and skips unknown or empty values', () => {
    expect(parseEnumValue('instant', FiatPaymentMethod)).toBe(FiatPaymentMethod.INSTANT);
    expect(parseEnumValue('Ethereum', Blockchain)).toBe(Blockchain.ETHEREUM);
    expect(parseEnumValue('paypal', FiatPaymentMethod)).toBeUndefined();
    expect(parseEnumValue(undefined, FiatPaymentMethod)).toBeUndefined();
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
