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
  editableTextFields,
  initialEditValues,
  planUserDataEdit,
  UserDataEditValues,
} from 'src/util/user-data-edit.util';

const COMPLIANCE_FIELDS = ['mail', 'phone', 'street', 'houseNumber', 'zip', 'location'] as const;

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

function plan(
  initial: UserDataEditValues,
  edited: UserDataEditValues,
  fields: readonly (typeof EDITABLE_TEXT_FIELDS)[number][] = EDITABLE_TEXT_FIELDS,
) {
  return planUserDataEdit(initial, edited, fields);
}

describe('editableTextFields', () => {
  it('gives Admin all eight text fields in order', () => {
    expect(editableTextFields('Admin' as UserRole)).toEqual(EDITABLE_TEXT_FIELDS);
  });

  it('gives Compliance mail, phone and the personal address without the names', () => {
    expect(editableTextFields('Compliance' as UserRole)).toEqual(COMPLIANCE_FIELDS);
  });

  it.each(['Support', 'User', undefined])('gives %s no fields', (role) => {
    expect(editableTextFields(role as UserRole | undefined)).toBeUndefined();
  });
});

describe('canEditUserData', () => {
  it.each(['Admin', 'Compliance'])('allows %s', (role) => {
    expect(canEditUserData(role as UserRole)).toBe(true);
  });

  it.each(['Support', 'User', 'VIP', 'Marketing', undefined])('refuses %s', (role) => {
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
    expect(plan(makeValues(), makeValues())).toEqual({
      payload: {},
      errors: [],
    });
  });

  it('treats surrounding whitespace as unchanged', () => {
    expect(plan(makeValues(), makeValues({ mail: '  e2e-edit@example.com  ' }))).toEqual({
      payload: {},
      errors: [],
    });
  });

  it('sends only the changed text fields as trimmed values', () => {
    expect(plan(makeValues(), makeValues({ firstname: '  Grace  ', street: 'Newstrasse' }))).toEqual({
      payload: { firstname: 'Grace', street: 'Newstrasse' },
      errors: [],
    });
  });

  it.each(['mail', 'phone', 'firstname', 'surname', 'street', 'houseNumber', 'zip', 'location'] as const)(
    'refuses to clear %s',
    (field) => {
      const result = plan(makeValues(), makeValues({ [field]: '   ' }));
      expect(result.payload).toEqual({});
      expect(result.errors).toEqual([`${field} cannot be cleared`]);
    },
  );

  it('allows filling a field that was empty', () => {
    expect(plan(makeValues({ location: '' }), makeValues({ location: 'Bern' }))).toEqual({
      payload: { location: 'Bern' },
      errors: [],
    });
  });

  it.each(['not-an-email', 'a@b@c.ch', '@example.com', 'a@', 'a@example'])('rejects the invalid mail %s', (mail) => {
    expect(plan(makeValues(), makeValues({ mail }))).toEqual({
      payload: {},
      errors: ['mail is not a valid e-mail address'],
    });
  });

  it('accepts a valid changed mail', () => {
    expect(plan(makeValues(), makeValues({ mail: 'new@example.com' }))).toEqual({
      payload: { mail: 'new@example.com' },
      errors: [],
    });
  });

  it.each(['0041 79 123 45 67', '+41 79 1a3 45 67', '79 123 45 67'])('rejects the invalid phone %s', (phone) => {
    expect(plan(makeValues(), makeValues({ phone }))).toEqual({
      payload: {},
      errors: ['phone must start with + and the country code'],
    });
  });

  it('accepts a valid changed phone', () => {
    expect(plan(makeValues(), makeValues({ phone: '+49 30 123456' }))).toEqual({
      payload: { phone: '+49 30 123456' },
      errors: [],
    });
  });

  it('sends a changed country as its id', () => {
    expect(plan(makeValues(), makeValues({}, 2))).toEqual({
      payload: { countryId: 2 },
      errors: [],
    });
  });

  it('sends a changed country that is not in the country list as its bare id', () => {
    expect(plan(makeValues(), makeValues({}, 99))).toEqual({
      payload: { countryId: 99 },
      errors: [],
    });
  });

  it('refuses to clear the country', () => {
    expect(plan(makeValues(), { ...makeValues(), countryId: undefined })).toEqual({
      payload: {},
      errors: ['country cannot be cleared'],
    });
  });

  it('does nothing when the country is unchanged', () => {
    const withoutCountry = { ...makeValues(), countryId: undefined };
    expect(plan(withoutCountry, withoutCountry)).toEqual({
      payload: {},
      errors: [],
    });
  });

  it('sends a changed editable kycStatus', () => {
    expect(plan(makeValues(), makeValues({}, 1, 'Rejected'))).toEqual({
      payload: { kycStatus: 'Rejected' },
      errors: [],
    });
  });

  it('sends nothing when the current Check status is left unchanged', () => {
    expect(plan(makeValues({}, 1, 'Check'), makeValues({}, 1, 'Check'))).toEqual({
      payload: {},
      errors: [],
    });
  });

  it('sends nothing when the changed kycStatus is not editable through this form', () => {
    expect(plan(makeValues(), makeValues({}, 1, 'Check'))).toEqual({
      payload: {},
      errors: [],
    });
  });

  it('combines text, country and kycStatus changes in field order', () => {
    expect(
      plan(makeValues(), makeValues({ mail: 'new@example.com', street: 'Newstrasse' }, 2, 'Terminated')),
    ).toEqual({
      payload: { mail: 'new@example.com', street: 'Newstrasse', countryId: 2, kycStatus: 'Terminated' },
      errors: [],
    });
  });

  it('ignores a changed firstname or surname outside the given fields', () => {
    expect(plan(makeValues(), makeValues({ firstname: 'Grace', surname: 'Hopper' }), COMPLIANCE_FIELDS)).toEqual({
      payload: {},
      errors: [],
    });
  });

  it('ignores a cleared name outside the given fields and still validates the allowed mail', () => {
    expect(
      plan(
        makeValues(),
        makeValues({ firstname: '   ', surname: '   ', mail: 'new@example.com', street: 'Newstrasse' }),
        COMPLIANCE_FIELDS,
      ),
    ).toEqual({
      payload: { mail: 'new@example.com', street: 'Newstrasse' },
      errors: [],
    });
  });

  it('still reports an invalid mail within the Compliance fields', () => {
    expect(plan(makeValues(), makeValues({ mail: 'not-an-email' }), COMPLIANCE_FIELDS)).toEqual({
      payload: {},
      errors: ['mail is not a valid e-mail address'],
    });
  });

  it('still reports an invalid phone within the Compliance fields', () => {
    expect(plan(makeValues(), makeValues({ phone: '0041 79 123 45 67' }), COMPLIANCE_FIELDS)).toEqual({
      payload: {},
      errors: ['phone must start with + and the country code'],
    });
  });

  it('still refuses to clear an allowed field within the Compliance fields', () => {
    expect(plan(makeValues(), makeValues({ street: '   ' }), COMPLIANCE_FIELDS)).toEqual({
      payload: {},
      errors: ['street cannot be cleared'],
    });
  });

  it('exposes the KYC status options', () => {
    expect(EDITABLE_KYC_STATUSES).toEqual(['NA', 'Completed', 'Rejected', 'Terminated']);
  });
});
