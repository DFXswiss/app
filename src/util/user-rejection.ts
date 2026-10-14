import { AbortError } from './abort-error';

// EIP-1193: the user rejected the request in the wallet
export const USER_REJECTED_CODE = 4001;

// The message the Tron wallet adapters put on a connect the wallet answered with code 4001. On the older protocol the
// adapter keeps only this message and drops the answer, so there is no code left to recognise the rejection by.
const TRON_CONNECTION_REJECTED = 'The user rejected connection.';

// A request the user cancelled in the wallet. It ends the flow like any abort and carries the EIP-1193 code, which the
// transaction screens check to keep the user on the form.
export class UserRejectedError extends AbortError {
  readonly code = USER_REJECTED_CODE;

  constructor() {
    super('User cancelled');
  }
}

// SDKs wrap the wallet's error in their own: viem keeps it as `cause`, the Solana and Tron wallet adapters as `error`.
export function hasUserRejectedCode(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current = error;

  while (current && typeof current === 'object' && !seen.has(current)) {
    const { code, cause, error: inner } = current as { code?: unknown; cause?: unknown; error?: unknown };
    if (code === USER_REJECTED_CODE) return true;

    seen.add(current);
    current = cause ?? inner;
  }

  return false;
}

export function isTronUserRejection(error: unknown): boolean {
  return hasUserRejectedCode(error) || (error instanceof Error && error.message === TRON_CONNECTION_REJECTED);
}
