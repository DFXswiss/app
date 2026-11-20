jest.mock('@dfx.swiss/react', () => ({
  UserRole: {
    USER: 'User',
    VIP: 'VIP',
    SUPPORT: 'Support',
    MARKETING: 'Marketing',
    COMPLIANCE: 'Compliance',
    ADMIN: 'Admin',
  },
}));

import type { Country, UserRole } from '@dfx.swiss/react';
import type { UserDataDetail } from 'src/hooks/compliance.hook';
import {
  canEditUserData,
  EDITABLE_KYC_STATUSES,
  EDITABLE_TEXT_FIELDS,
  initialEditValues,
  planUserDataEdit,
  USER_DATA_EDIT_LOG_DESCRIPTION,
  UserDataEditValues,
} from 'src/util/user-data-edit.util';

const countries = [
  { id: 1, symbol: 'CH', name: 'Switzerland' },
  { id: 2, symbol: 'DE', name: 'Germany' },
] as unknown as Country[];

const baseText: Record<(typeof EDITABLE_TEXT_FIELDS)[number], string> = {
  mail: 'e2e-edit@example.com',
  phone: '+41 79 123 45 67',
  firstname: 'Ada',
  surname: 'Example',
  street: 'Teststrasse',
  houseNumber: '7',
  zip: '6300',
  location: 'Zug',
};

function makeValues(
  text: Partial<Record<(typeof EDITABLE_TEXT_FIELDS)[number], string>> = {},
  countryId: number | undefined = 1,
  kycStatus = 'Completed',
): UserDataEditValues {
  return { text: { ...baseText, ...text }, countryId, kycStatus };
}

function makeDetail(overrides: Partial<UserDataDetail> = {}): UserDataDetail {
  return {
    id: 88001,
    mail: 'e2e-edit@example.com',
    phone: '+41 79 123 45 67',
    firstname: 'Ada',
    surname: 'Example',
    street: 'Teststrasse',
    houseNumber: '7',
    zip: '6300',
    location: 'Zug',
    country: { name: 'Switzerland', symbol: 'CH' },
    kycStatus: 'Completed',
    ...overrides,
  } as UserDataDetail;
}

describe('canEditUserData', () => {
  it('allows Admin', () => {
    expect(canEditUserData('Admin' as UserRole)).toBe(true);
  });

  it.each(['Support', 'Compliance', 'User', 'VIP', 'Marketing', undefined])('refuses %s', (role) => {
    expect(canEditUserData(role as UserRole | undefined)).toBe(false);
  });
});

describe('initialEditValues', () => {
  it('copies the detail into the editable values and preselects the country by symbol', () => {
    expect(initialEditValues(makeDetail(), countries)).toEqual({
      text: baseText,
      countryId: 1,
      kycStatus: 'Completed',
    });
  });

  it('uses empty strings for missing values and leaves the country unselected', () => {
    expect(
      initialEditValues(
        makeDetail({
          mail: undefined,
          phone: undefined,
          firstname: undefined,
          surname: undefined,
          street: undefined,
          houseNumber: undefined,
          zip: undefined,
          location: undefined,
          country: undefined,
          kycStatus: undefined,
        }),
        countries,
      ),
    ).toEqual({
      text: {
        mail: '',
        phone: '',
        firstname: '',
        surname: '',
        street: '',
        houseNumber: '',
        zip: '',
        location: '',
      },
      countryId: undefined,
      kycStatus: '',
    });
  });

  it('leaves the country unselected when its symbol is unknown', () => {
    expect(initialEditValues(makeDetail({ country: { symbol: 'XX' } }), countries).countryId).toBeUndefined();
  });
});

describe('planUserDataEdit', () => {
  it('reports no change at all for identical values', () => {
    expect(planUserDataEdit(makeValues(), makeValues(), countries)).toEqual({
      payload: {},
      results: [],
      errors: [],
    });
  });

  it('treats surrounding whitespace as unchanged', () => {
    expect(planUserDataEdit(makeValues(), makeValues({ mail: '  e2e-edit@example.com  ' }), countries)).toEqual({
      payload: {},
      results: [],
      errors: [],
    });
  });

  it('sends only the changed text fields as trimmed values', () => {
    expect(
      planUserDataEdit(makeValues(), makeValues({ firstname: '  Grace  ', street: 'Newstrasse' }), countries),
    ).toEqual({
      payload: { firstname: 'Grace', street: 'Newstrasse' },
      results: [
        { table: 'userData', column: 'firstname', value: 'Grace' },
        { table: 'userData', column: 'street', value: 'Newstrasse' },
      ],
      errors: [],
    });
  });

  it.each(['mail', 'phone', 'firstname', 'surname', 'street', 'houseNumber', 'zip', 'location'] as const)(
    'refuses to clear %s',
    (field) => {
      const result = planUserDataEdit(makeValues(), makeValues({ [field]: '   ' }), countries);
      expect(result.payload).toEqual({});
      expect(result.results).toEqual([]);
      expect(result.errors).toEqual([`${field} cannot be cleared`]);
    },
  );

  it('allows filling a field that was empty', () => {
    expect(planUserDataEdit(makeValues({ location: '' }), makeValues({ location: 'Bern' }), countries)).toEqual({
      payload: { location: 'Bern' },
      results: [{ table: 'userData', column: 'location', value: 'Bern' }],
      errors: [],
    });
  });

  it.each(['not-an-email', 'a@b@c.ch', '@example.com', 'a@', 'a@example'])('rejects the invalid mail %s', (mail) => {
    expect(planUserDataEdit(makeValues(), makeValues({ mail }), countries)).toEqual({
      payload: {},
      results: [],
      errors: ['mail is not a valid e-mail address'],
    });
  });

  it('accepts a valid changed mail', () => {
    expect(planUserDataEdit(makeValues(), makeValues({ mail: 'new@example.com' }), countries)).toEqual({
      payload: { mail: 'new@example.com' },
      results: [{ table: 'userData', column: 'mail', value: 'new@example.com' }],
      errors: [],
    });
  });

  it.each(['0041 79 123 45 67', '+41 79 1a3 45 67', '79 123 45 67'])('rejects the invalid phone %s', (phone) => {
    expect(planUserDataEdit(makeValues(), makeValues({ phone }), countries)).toEqual({
      payload: {},
      results: [],
      errors: ['phone must start with + and the country code'],
    });
  });

  it('accepts a valid changed phone', () => {
    expect(planUserDataEdit(makeValues(), makeValues({ phone: '+49 30 123456' }), countries)).toEqual({
      payload: { phone: '+49 30 123456' },
      results: [{ table: 'userData', column: 'phone', value: '+49 30 123456' }],
      errors: [],
    });
  });

  it('sends a changed country as its id and logs name and symbol', () => {
    expect(planUserDataEdit(makeValues(), makeValues({}, 2), countries)).toEqual({
      payload: { countryId: 2 },
      results: [{ table: 'userData', column: 'countryId', value: 'Germany (DE)' }],
      errors: [],
    });
  });

  it('logs the bare id when the changed country is not in the country list', () => {
    expect(planUserDataEdit(makeValues(), makeValues({}, 99), countries)).toEqual({
      payload: { countryId: 99 },
      results: [{ table: 'userData', column: 'countryId', value: '99' }],
      errors: [],
    });
  });

  it('refuses to clear the country', () => {
    expect(planUserDataEdit(makeValues(), { ...makeValues(), countryId: undefined }, countries)).toEqual({
      payload: {},
      results: [],
      errors: ['country cannot be cleared'],
    });
  });

  it('does nothing when the country is unchanged', () => {
    const withoutCountry = { ...makeValues(), countryId: undefined };
    expect(planUserDataEdit(withoutCountry, withoutCountry, countries)).toEqual({
      payload: {},
      results: [],
      errors: [],
    });
  });

  it('sends a changed editable kycStatus and logs it', () => {
    expect(planUserDataEdit(makeValues(), makeValues({}, 1, 'Rejected'), countries)).toEqual({
      payload: { kycStatus: 'Rejected' },
      results: [{ table: 'userData', column: 'kycStatus', value: 'Rejected' }],
      errors: [],
    });
  });

  it('sends nothing when the current Check status is left unchanged', () => {
    expect(planUserDataEdit(makeValues({}, 1, 'Check'), makeValues({}, 1, 'Check'), countries)).toEqual({
      payload: {},
      results: [],
      errors: [],
    });
  });

  it('sends nothing when the changed kycStatus is not editable through this form', () => {
    expect(planUserDataEdit(makeValues(), makeValues({}, 1, 'Check'), countries)).toEqual({
      payload: {},
      results: [],
      errors: [],
    });
  });

  it('combines text, country and kycStatus changes in field order', () => {
    expect(
      planUserDataEdit(
        makeValues(),
        makeValues({ mail: 'new@example.com', street: 'Newstrasse' }, 2, 'Terminated'),
        countries,
      ),
    ).toEqual({
      payload: { mail: 'new@example.com', street: 'Newstrasse', countryId: 2, kycStatus: 'Terminated' },
      results: [
        { table: 'userData', column: 'mail', value: 'new@example.com' },
        { table: 'userData', column: 'street', value: 'Newstrasse' },
        { table: 'userData', column: 'countryId', value: 'Germany (DE)' },
        { table: 'userData', column: 'kycStatus', value: 'Terminated' },
      ],
      errors: [],
    });
  });

  it('exposes the sheet-compatible log description and KYC status options', () => {
    expect(USER_DATA_EDIT_LOG_DESCRIPTION).toBe('UserDataEdit');
    expect(EDITABLE_KYC_STATUSES).toEqual(['NA', 'Completed', 'Rejected', 'Terminated']);
  });
});
