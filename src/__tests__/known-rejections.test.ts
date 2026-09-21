import { BlockedBankRejection, findKnownRejection, KnownRejectionType } from '../util/known-rejections';

describe('findKnownRejection', () => {
  it('matches the character-set rejection inside a comma-joined message', () => {
    expect(
      findKnownRejection(
        'firstName must only contain characters permitted in Swiss payment systems,lastName must only contain characters permitted in Swiss payment systems',
      )?.hint,
    ).toMatch(/^Your name or address contains characters/);
  });

  it.each(['BIC not allowed', 'iban BIC not allowed'])('matches the blocked bank in "%s"', (message) => {
    expect(findKnownRejection(message)).toBe(BlockedBankRejection);
  });

  it('returns undefined for unknown messages', () => {
    expect(findKnownRejection('boom')).toBeUndefined();
    expect(findKnownRejection('')).toBeUndefined();
  });

  it('names the report type', () => {
    expect(KnownRejectionType).toBe('KnownRejection');
  });
});
