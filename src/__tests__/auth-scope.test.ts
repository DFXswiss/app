import { AuthSessionScope, hasSameAuthSessionScope, isUnauthorizedApiError } from 'src/util/auth-scope';

const validScope = { account: 101, user: 201, address: '0xAbC', role: 'Compliance' };

describe('auth scope helpers', () => {
  it.each([
    [undefined, validScope],
    [validScope, undefined],
    [{ ...validScope, account: Number.NaN }, validScope],
    [{ ...validScope, account: 0 }, validScope],
    [{ ...validScope, user: Number.NaN }, validScope],
    [{ ...validScope, user: 0 }, validScope],
    [{ ...validScope, role: '' }, validScope],
    [{ ...validScope, address: '' }, validScope],
    [{ ...validScope, address: 17 }, validScope],
    [validScope, { ...validScope, account: 102 }],
    [validScope, { ...validScope, user: 202 }],
    [validScope, { ...validScope, role: 'Admin' }],
    [validScope, { ...validScope, address: undefined }],
    [validScope, { ...validScope, address: 'cosmos1other' }],
  ])('rejects nonmatching auth scopes', (first, second) => {
    expect(
      hasSameAuthSessionScope(first as AuthSessionScope | undefined, second as AuthSessionScope | undefined),
    ).toBe(false);
  });

  it('accepts equal scopes and case folded EVM addresses', () => {
    expect(hasSameAuthSessionScope(validScope, { ...validScope })).toBe(true);
    expect(hasSameAuthSessionScope(validScope, { ...validScope, address: '0xabc' })).toBe(true);
    expect(
      hasSameAuthSessionScope({ ...validScope, address: undefined }, { ...validScope, address: undefined }),
    ).toBe(true);
  });

  it('identifies only 401 API errors', () => {
    expect(isUnauthorizedApiError(Object.assign(new Error('Unauthorized'), { statusCode: 401 }))).toBe(true);
    expect(isUnauthorizedApiError(Object.assign(new Error('Forbidden'), { statusCode: 403 }))).toBe(false);
    expect(isUnauthorizedApiError(new Error('Unauthorized'))).toBe(false);
    expect(isUnauthorizedApiError(null)).toBe(false);
    expect(isUnauthorizedApiError('Unauthorized')).toBe(false);
  });
});
