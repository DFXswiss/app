export interface AuthSessionScope {
  account?: unknown;
  user?: unknown;
  address?: unknown;
  role?: unknown;
}

export function hasSameAuthSessionScope(
  first: AuthSessionScope | undefined,
  second: AuthSessionScope | undefined,
): boolean {
  if (
    !first ||
    !second ||
    typeof first.account !== 'number' ||
    !Number.isSafeInteger(first.account) ||
    first.account <= 0 ||
    typeof first.user !== 'number' ||
    !Number.isSafeInteger(first.user) ||
    first.user <= 0 ||
    typeof first.role !== 'string' ||
    first.role.length === 0 ||
    (first.address !== undefined && (typeof first.address !== 'string' || first.address.length === 0)) ||
    first.account !== second.account ||
    first.user !== second.user ||
    first.role !== second.role
  ) {
    return false;
  }

  if (first.address === second.address) return true;
  if (typeof first.address !== 'string' || typeof second.address !== 'string') return false;
  const isEvmAddress = (address: string) => /^0x[0-9a-f]+$/i.test(address);
  return (
    isEvmAddress(first.address) &&
    isEvmAddress(second.address) &&
    first.address.toLowerCase() === second.address.toLowerCase()
  );
}

export function isUnauthorizedApiError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 401;
}
