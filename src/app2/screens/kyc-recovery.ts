import { KycStepReason } from '@dfx.swiss/react';

interface StructuredApiError {
  statusCode?: unknown;
  code?: unknown;
  switchToCode?: unknown;
}

export type KycHandoff = { kind: 'switch'; code: string } | { kind: 'merge' | 'account-exists' | 'conflict' };

function fields(error: unknown): StructuredApiError {
  return typeof error === 'object' && error !== null ? (error as StructuredApiError) : {};
}

export function apiStatusCode(error: unknown): number | undefined {
  const value = fields(error).statusCode;
  return typeof value === 'number' ? value : undefined;
}

export function isTfaAlreadyEnrolledError(error: unknown): boolean {
  return apiStatusCode(error) === 409;
}

export function isTfaRequiredError(error: unknown): boolean {
  return fields(error).code === 'TFA_REQUIRED';
}

export function kycHandoffFromError(error: unknown): KycHandoff | undefined {
  const { code, switchToCode } = fields(error);
  const statusCode = apiStatusCode(error);

  if (statusCode === 401 && typeof switchToCode === 'string' && switchToCode.trim()) {
    return { kind: 'switch', code: switchToCode.trim() };
  }
  if (code === KycStepReason.ACCOUNT_MERGE_REQUESTED || code === 'ACCOUNT_MERGE_REQUESTED') {
    return { kind: 'merge' };
  }
  if (code === KycStepReason.ACCOUNT_EXISTS || code === 'ACCOUNT_EXISTS') return { kind: 'account-exists' };
  if (statusCode === 409) return { kind: 'conflict' };
  return undefined;
}
