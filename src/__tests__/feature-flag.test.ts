import { parseFeatures } from '../hooks/feature-flag.hook';

describe('parseFeatures (?feature= URL flag)', () => {
  it('reads a single case-insensitive feature', () => {
    expect(parseFeatures('?feature=Passkey')).toEqual(['passkey']);
    expect(parseFeatures('?feature=passkey')).toEqual(['passkey']);
  });

  it('reads a comma-separated list and trims blanks', () => {
    expect(parseFeatures('?feature=Passkey, Other ,third')).toEqual(['passkey', 'other', 'third']);
  });

  it('is empty without the parameter, on garbage and on empty values', () => {
    expect(parseFeatures(undefined)).toEqual([]);
    expect(parseFeatures('')).toEqual([]);
    expect(parseFeatures('?other=1')).toEqual([]);
    expect(parseFeatures('?feature=,,')).toEqual([]);
  });
});
