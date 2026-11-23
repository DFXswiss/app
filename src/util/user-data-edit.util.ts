import { Country, UserRole } from '@dfx.swiss/react';
import type { UserDataDetail } from 'src/hooks/compliance.hook';

export const EDITABLE_TEXT_FIELDS = [
  'mail',
  'phone',
  'firstname',
  'surname',
  'street',
  'houseNumber',
  'zip',
  'location',
] as const;
export type EditableTextField = (typeof EDITABLE_TEXT_FIELDS)[number];

// Same order as EDITABLE_TEXT_FIELDS, minus the names, which stay Admin-only.
const COMPLIANCE_TEXT_FIELDS = ['mail', 'phone', 'street', 'houseNumber', 'zip', 'location'] as const;

// KycStatus values the API accepts through PUT userData. 'Check' is NOT among them: the API rejects it
// ("Use the audited KYC status Check transition"); the compliance review screen has the dedicated button.
export const EDITABLE_KYC_STATUSES = ['NA', 'Completed', 'Rejected', 'Terminated'] as const;
export type EditableKycStatus = (typeof EDITABLE_KYC_STATUSES)[number];

export interface UserDataEditValues {
  text: Record<EditableTextField, string>;
  countryId?: number;
  kycStatus: string;
}

export interface UserDataEditPlan {
  payload: Record<string, string | number>;
  errors: string[];
}

/** Text fields a role may edit through this form; undefined for a role without the form. */
export function editableTextFields(role: UserRole | undefined): readonly EditableTextField[] | undefined {
  switch (role) {
    case UserRole.ADMIN:
      return EDITABLE_TEXT_FIELDS;
    case UserRole.COMPLIANCE:
      return COMPLIANCE_TEXT_FIELDS;
    default:
      return undefined;
  }
}

// PUT userData stays limited per role in the API. On the audited operatorMutation route Compliance may
// change mail, phone, the personal address and the country as well; firstname and surname stay
// Admin-only, and every other role gets 403.
export function canEditUserData(role: UserRole | undefined): boolean {
  return editableTextFields(role) !== undefined;
}

/** Values the form starts with: text fields from the detail (missing → ''), country by symbol, kycStatus. */
export function initialEditValues(detail: UserDataDetail, countries: Country[]): UserDataEditValues {
  const text = {} as Record<EditableTextField, string>;
  for (const field of EDITABLE_TEXT_FIELDS) {
    text[field] = detail[field] ?? '';
  }

  const countrySymbol = detail.country?.symbol;
  return {
    text,
    countryId: countrySymbol ? countries.find((country) => country.symbol === countrySymbol)?.id : undefined,
    kycStatus: detail.kycStatus ?? '',
  };
}

function isValidMail(value: string): boolean {
  const parts = value.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  return local.length > 0 && domain.length > 0 && domain.includes('.');
}

function isValidPhone(value: string): boolean {
  return /^\+[0-9 ]+$/.test(value);
}

function isEditableKycStatus(value: string): boolean {
  return (EDITABLE_KYC_STATUSES as readonly string[]).includes(value);
}

/**
 * Compares the edited values in `fields` against the initial ones and builds the PUT body and any
 * validation errors. A field outside `fields` never enters the payload and never produces an error.
 * A non-empty `errors` means the caller must not save.
 */
export function planUserDataEdit(
  initial: UserDataEditValues,
  edited: UserDataEditValues,
  fields: readonly EditableTextField[],
): UserDataEditPlan {
  const payload: Record<string, string | number> = {};
  const errors: string[] = [];

  for (const field of fields) {
    const before = initial.text[field].trim();
    const after = edited.text[field].trim();
    if (before === after) continue;

    if (before && !after) {
      errors.push(`${field} cannot be cleared`);
      continue;
    }
    if (field === 'mail' && !isValidMail(after)) {
      errors.push('mail is not a valid e-mail address');
      continue;
    }
    if (field === 'phone' && !isValidPhone(after)) {
      errors.push('phone must start with + and the country code');
      continue;
    }

    payload[field] = after;
  }

  if (edited.countryId !== initial.countryId) {
    if (edited.countryId === undefined) {
      errors.push('country cannot be cleared');
    } else {
      payload.countryId = edited.countryId;
    }
  }

  const beforeKycStatus = initial.kycStatus.trim();
  const afterKycStatus = edited.kycStatus.trim();
  if (beforeKycStatus !== afterKycStatus && isEditableKycStatus(afterKycStatus)) {
    payload.kycStatus = afterKycStatus;
  }

  return { payload, errors };
}
