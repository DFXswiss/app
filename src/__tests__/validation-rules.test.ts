// Mock @dfx.swiss/react to avoid ES module issues
jest.mock('@dfx.swiss/react', () => ({
  Validations: {
    Required: { required: { value: true, message: 'required' } },
    Custom: (validator: (value: any) => true | string) => ({ validate: validator }),
  },
}));

import {
  AddressZipValidation,
  isSwissPaymentText,
  normalizeAddressApostrophes,
  normalizeApostrophes,
  RequiredSwissPaymentTextValidation,
  SwissPaymentTextValidation,
  ZipValidation,
} from '../util/validation-rules';

const validatorOf = (rules: any[]): ((value: any) => true | string) =>
  rules.find((rule) => 'validate' in rule).validate;

describe('ZipValidation (creditor / payout zip)', () => {
  const validate = validatorOf(ZipValidation);

  it('is required', () => {
    expect(ZipValidation.some((rule) => 'required' in rule)).toBe(true);
  });

  it('accepts zips up to 8 chars (longest OLKYPAY-safe formats)', () => {
    expect(validate('8001')).toBe(true);
    expect(validate('EC1A 1BB')).toBe(true);
  });

  // OLKYPAY rejects recipient zips > 8 chars (CLIENT_INVALID_ZIPCODE) and there is no backend
  // guard (api#3985 closed) — this cap must NOT be raised, or payouts get stuck in retry loops.
  it('rejects zips longer than 8 chars', () => {
    expect(validate('01310-100')).toBe('pattern');
    expect(validate('90210-1234')).toBe('pattern');
  });

  it('rejects a combined "<postcode> <city>" value', () => {
    expect(validate('97283 Riedenheim')).toBe('pattern');
  });

  it('passes empty values through to the required rule', () => {
    expect(validate('')).toBe(true);
    expect(validate(undefined)).toBe(true);
  });
});

describe('AddressZipValidation (KYC address zip)', () => {
  const validate = validatorOf(AddressZipValidation);

  it('is required', () => {
    expect(AddressZipValidation.some((rule) => 'required' in rule)).toBe(true);
  });

  it('accepts international formats up to 10 chars', () => {
    expect(validate('EC1A 1BB')).toBe(true);
    expect(validate('01310-100')).toBe(true);
    expect(validate('90210-1234')).toBe(true);
  });

  it('rejects zips longer than 10 chars', () => {
    expect(validate('12345678901')).toBe('pattern');
  });

  it('rejects characters outside the payment character set', () => {
    expect(validate('Ø-1234')).toBe('unsupported_characters');
  });

  it('passes empty values through to the required rule', () => {
    expect(validate('')).toBe(true);
    expect(validate(undefined)).toBe(true);
  });

  it('rejects a combined "<postcode> <city>" value', () => {
    expect(validate('97283 Riedenheim')).toBe('pattern');
  });
});

describe('isSwissPaymentText (same character set as the API)', () => {
  it.each(['Müller', "Rue de l'Eglise 3", "O'Brien-Smith", 'Ça Ñandú ß', 'Line 1\nLine 2'])('accepts %s', (value) => {
    expect(isSwissPaymentText(value)).toBe(true);
  });

  it.each(['Łukasz', 'Søren', 'João', 'Rue de l’Église', 'Tab\tseparated'])('rejects %s', (value) => {
    expect(isSwissPaymentText(value)).toBe(false);
  });
});

describe('SwissPaymentTextValidation', () => {
  const validate = SwissPaymentTextValidation.validate;

  it('accepts supported text', () => {
    expect(validate('Müller')).toBe(true);
  });

  it('rejects unsupported characters', () => {
    expect(validate('Łukasz')).toBe('unsupported_characters');
  });

  it('accepts typographic apostrophes, which are normalized on submit', () => {
    expect(validate('Rue de l’Église')).toBe(true);
    expect(validate('‘O’Brien')).toBe(true);
  });

  it('passes empty values through', () => {
    expect(validate('')).toBe(true);
    expect(validate(undefined)).toBe(true);
  });

  it('is combined with the required rule for mandatory fields', () => {
    expect(RequiredSwissPaymentTextValidation.some((rule) => 'required' in rule)).toBe(true);
    expect(validatorOf(RequiredSwissPaymentTextValidation)('Łukasz')).toBe('unsupported_characters');
  });
});

describe('normalizeApostrophes', () => {
  it('replaces typographic apostrophes with a plain one', () => {
    expect(normalizeApostrophes('‘O’Brien’s')).toBe("'O'Brien's");
  });

  it('leaves other characters unchanged', () => {
    expect(normalizeApostrophes('Łukasz "Müller"')).toBe('Łukasz "Müller"');
  });

  it('keeps undefined', () => {
    expect(normalizeApostrophes(undefined)).toBeUndefined();
  });
});

describe('normalizeAddressApostrophes', () => {
  const country = { id: 1, symbol: 'CH' } as any;

  it('normalizes the text fields and keeps the rest', () => {
    expect(
      normalizeAddressApostrophes({
        street: 'Rue de l’Eglise',
        houseNumber: '3’a',
        zip: '1’000',
        city: 'L’Abbaye',
        country,
        firstName: 'O’Brien',
      }),
    ).toEqual({
      street: "Rue de l'Eglise",
      houseNumber: "3'a",
      zip: "1'000",
      city: "L'Abbaye",
      country,
      firstName: 'O’Brien',
    });
  });

  it('keeps an absent address undefined', () => {
    expect(normalizeAddressApostrophes(undefined)).toBeUndefined();
  });
});
