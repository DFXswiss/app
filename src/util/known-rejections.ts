export const KnownRejectionType = 'KnownRejection';

export interface KnownRejection {
  apiMessage: string;
  hint: string;
}

export const BlockedBankRejection: KnownRejection = {
  apiMessage: 'BIC not allowed',
  hint: 'This bank is not supported by DFX. Please use an account at a different bank.',
};

const KnownRejections: KnownRejection[] = [
  {
    apiMessage: 'must only contain characters permitted in Swiss payment systems',
    hint: 'Your name or address contains characters that our bank payments do not support. Please replace them with simple letters (e.g. l instead of ł) and try again.',
  },
  BlockedBankRejection,
];

export function findKnownRejection(message: string): KnownRejection | undefined {
  return KnownRejections.find((r) => message.includes(r.apiMessage));
}
