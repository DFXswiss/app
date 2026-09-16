/**
 * Sumsub review enums owned by App 2.0.
 * Values must match `src/dto/sumsub.dto.ts` — pinned by `legacy-contract.test.ts`.
 */

export enum SumsubReviewAnswer {
  GREEN = 'GREEN',
  RED = 'RED',
}

export enum SumsubReviewRejectType {
  FINAL = 'FINAL',
  RETRY = 'RETRY',
}

export function sumsubEnumValues(): string[] {
  return [...Object.values(SumsubReviewAnswer), ...Object.values(SumsubReviewRejectType)];
}
