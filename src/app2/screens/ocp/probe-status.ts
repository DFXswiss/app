/**
 * Maps a probe (GET paymentLink/config) failure status to activation semantics.
 * Only 403 means the merchant has not activated OCP; network/5xx/401 are retries.
 */
export function probeFailureKind(status: number | undefined): 'not-activated' | 'error' {
  return status === 403 ? 'not-activated' : 'error';
}
