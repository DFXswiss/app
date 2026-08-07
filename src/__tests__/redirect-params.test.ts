import {
  allowedParamsOnly,
  EXTERNAL_LOGIN_ALLOWED_PARAMS,
  LOGIN_RETURN_ALLOWED_PARAMS,
} from '../util/redirect-params';

describe('allowedParamsOnly', () => {
  it('returns empty params for empty search', () => {
    const params = allowedParamsOnly('', LOGIN_RETURN_ALLOWED_PARAMS);
    expect([...params.keys()]).toEqual([]);
  });

  it('copies only allowed keys when only those are present', () => {
    const params = allowedParamsOnly('?a=call', LOGIN_RETURN_ALLOWED_PARAMS);
    expect(params.get('a')).toBe('call');
    expect([...params.keys()]).toEqual(['a']);
  });

  it('returns empty params when only forbidden keys are present', () => {
    const params = allowedParamsOnly('?code=secret&user=alice@example.com', LOGIN_RETURN_ALLOWED_PARAMS);
    expect([...params.keys()]).toEqual([]);
  });

  it('keeps allowed keys and drops the rest when mixed', () => {
    const params = allowedParamsOnly(
      '?a=call&code=secret&user=alice@example.com',
      LOGIN_RETURN_ALLOWED_PARAMS,
    );
    expect(params.get('a')).toBe('call');
    expect(params.get('code')).toBeNull();
    expect(params.get('user')).toBeNull();
    expect([...params.keys()]).toEqual(['a']);
  });

  it('preserves empty values (key present with no value)', () => {
    const params = allowedParamsOnly('?a=', LOGIN_RETURN_ALLOWED_PARAMS);
    expect(params.has('a')).toBe(true);
    expect(params.get('a')).toBe('');
  });

  it('uses the first value when a key appears more than once', () => {
    const params = allowedParamsOnly('?a=first&a=second', LOGIN_RETURN_ALLOWED_PARAMS);
    expect(params.get('a')).toBe('first');
    expect([...params.keys()]).toEqual(['a']);
  });

  it('emits allowed keys in the order of the allowlist, not of search', () => {
    const allowed = ['personal-iban', 'a'] as const;
    const params = allowedParamsOnly('?a=call&personal-iban=frick', allowed);
    expect([...params.keys()]).toEqual(['personal-iban', 'a']);
  });

  it('omits an allowlisted key that is missing from search', () => {
    const params = allowedParamsOnly('?a=call', EXTERNAL_LOGIN_ALLOWED_PARAMS);
    expect([...params.keys()]).toEqual([]);
  });
});

describe('named allowlist subsets', () => {
  it('LOGIN_RETURN_ALLOWED_PARAMS is only a', () => {
    expect([...LOGIN_RETURN_ALLOWED_PARAMS]).toEqual(['a']);
  });

  it('EXTERNAL_LOGIN_ALLOWED_PARAMS is only personal-iban', () => {
    expect([...EXTERNAL_LOGIN_ALLOWED_PARAMS]).toEqual(['personal-iban']);
  });
});
