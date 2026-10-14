import { AbortError } from '../abort-error';
import { hasUserRejectedCode, isTronUserRejection, USER_REJECTED_CODE, UserRejectedError } from '../user-rejection';

describe('UserRejectedError', () => {
  it('is an abort that carries the EIP-1193 rejection code', () => {
    const error = new UserRejectedError();

    expect(error).toBeInstanceOf(AbortError);
    expect(error.code).toBe(USER_REJECTED_CODE);
    expect(error.message).toBe('User cancelled');
  });
});

describe('hasUserRejectedCode', () => {
  it('recognises the code on the error itself', () => {
    expect(hasUserRejectedCode({ code: 4001, message: 'User rejected the request.' })).toBe(true);
  });

  it('recognises the code on a wrapped cause, as viem keeps it', () => {
    const rejection = Object.assign(new Error('User rejected the request.'), { cause: { code: 4001 } });
    expect(hasUserRejectedCode(Object.assign(new Error('Transaction failed'), { cause: rejection }))).toBe(true);
  });

  it('recognises the code on a wrapped error, as the wallet adapters keep it', () => {
    expect(hasUserRejectedCode(Object.assign(new Error('Rejected'), { error: { code: 4001 } }))).toBe(true);
  });

  it.each([
    ['another code', { code: -32002, message: 'Request already pending' }],
    ['the rejection message without a code', new Error('User rejected the request.')],
    ['the code as a string', { code: '4001' }],
    ['no error', undefined],
    ['a string', 'User rejected the request.'],
  ])('does not recognise %s', (_case, error) => {
    expect(hasUserRejectedCode(error)).toBe(false);
  });

  it('ends on a chain that refers back to itself', () => {
    const error: { message: string; cause?: unknown } = { message: 'Loop' };
    error.cause = { error: error };

    expect(hasUserRejectedCode(error)).toBe(false);
  });
});

describe('isTronUserRejection', () => {
  it('recognises the code the adapter keeps', () => {
    expect(isTronUserRejection(Object.assign(new Error('Rejected'), { error: { code: 4001 } }))).toBe(true);
  });

  it('recognises the message the adapter puts on a rejected connection', () => {
    expect(isTronUserRejection(new Error('The user rejected connection.'))).toBe(true);
  });

  it.each([
    ['another message', new Error('Cannot connect wallet.')],
    ['the message on a plain object', { message: 'The user rejected connection.' }],
  ])('does not recognise %s', (_case, error) => {
    expect(isTronUserRejection(error)).toBe(false);
  });
});
