import { toScorReference } from '../util/scor-reference';

describe('toScorReference', () => {
  it('builds the creditor reference of a dashed bank usage', () => {
    expect(toScorReference('AB12-CD34-EF56')).toBe('RF67AB12CD34EF56');
  });

  it('treats spaces and lower case the same as dashes', () => {
    expect(toScorReference('ab12 cd34 ef56')).toBe('RF67AB12CD34EF56');
  });

  it('pads a single check digit', () => {
    expect(toScorReference('Invoice 12')).toBe('RF09INVOICE12');
  });

  it('returns undefined when the usage cannot be a creditor reference', () => {
    expect(toScorReference(undefined)).toBeUndefined();
    expect(toScorReference('')).toBeUndefined();
    expect(toScorReference('---')).toBeUndefined();
    expect(toScorReference('hello!')).toBeUndefined();
    expect(toScorReference('A'.repeat(22))).toBeUndefined();
  });
});
