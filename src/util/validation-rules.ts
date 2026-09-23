import { KycAddress, Validations } from '@dfx.swiss/react';

// Character set the API accepts for names and addresses that end up in bank payments.
const SwissPaymentText = /^[\x20-\x7EÀÁÂÄÇÈÉÊËÌÍÎÏÑÒÓÔÖÙÚÛÜÝàáâäçèéêëìíîïñòóôöùúûüýß\n]*$/u;
const TypographicApostrophes = /[\u2018\u2019]/g;

export function normalizeApostrophes(value: string): string;
export function normalizeApostrophes(value?: string): string | undefined;
export function normalizeApostrophes(value?: string): string | undefined {
  return value?.replace(TypographicApostrophes, "'");
}

export function normalizeAddressApostrophes<T extends KycAddress>(address: T): T;
export function normalizeAddressApostrophes<T extends KycAddress>(address?: T): T | undefined;
export function normalizeAddressApostrophes<T extends KycAddress>(address?: T): T | undefined {
  return (
    address && {
      ...address,
      street: normalizeApostrophes(address.street),
      houseNumber: normalizeApostrophes(address.houseNumber),
      zip: normalizeApostrophes(address.zip),
      city: normalizeApostrophes(address.city),
    }
  );
}

export function isSwissPaymentText(value: string): boolean {
  return SwissPaymentText.test(value);
}

// Typographic apostrophes are accepted here because they are normalized on submit.
function validateSwissPaymentText(value?: string): true | string {
  return !value || isSwissPaymentText(normalizeApostrophes(value)) || 'unsupported_characters';
}

export const SwissPaymentTextValidation = Validations.Custom(validateSwissPaymentText);
export const RequiredSwissPaymentTextValidation = [Validations.Required, SwissPaymentTextValidation];

// Creditor / payout zip. OLKYPAY rejects any recipient zip longer than 8 characters
// (CLIENT_INVALID_ZIPCODE), and the backend mirror of that check was retired
// (DFXswiss/backend#3985 closed) in favour of validating at the source — so this frontend cap is
// the ONLY guard for the bank-refund / payout path. Keep it at 8 for creditor zip fields.
export const ZipValidation = [Validations.Required, Validations.Custom((v) => !v || v.length <= 8 || 'pattern')];

// KYC / address zip. Must accept international formats — US ZIP+4 "90210-1234" (10),
// Brazilian CEP "01310-100" (9) — so it cannot share the OLKYPAY cap above. NOTE: this path
// is still payout-bound: sell (BUY_FIAT) payouts copy userData.address into the fiat-output
// creditor (api: fiat-output.service createInternal), so a 9-10 char zip can reach OLKYPAY.
// That residual case must be normalized api-side (createPayer), not by rejecting valid codes
// here. Cap at 10, which still keeps a combined "<postcode> <city>" value out of the field.
export const AddressZipValidation = [
  Validations.Required,
  Validations.Custom((v) => (v?.length > 10 ? 'pattern' : validateSwissPaymentText(v))),
];
