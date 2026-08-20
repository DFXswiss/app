import { Validations } from '@dfx.swiss/react';

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
export const AddressZipValidation = [Validations.Required, Validations.Custom((v) => !v || v.length <= 10 || 'pattern')];
