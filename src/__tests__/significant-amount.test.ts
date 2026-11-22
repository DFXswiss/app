import { formatFiatRate, formatSignificantAmount } from '../util/significant-amount';

describe('formatSignificantAmount', () => {
  it.each([
    [1 / 0.020801, '48.075'],
    [1 / 2.7663, '0.36149'],
    [1 / 6173.4, '0.00016199'],
    [1 / 0.0000109, '91743'],
    [1 / 0.00000081, '1234600'],
    [1 / 6000000000, '0.00000000016667'],
  ])('formats %s with five significant digits as %s', (amount, expected) => {
    expect(formatSignificantAmount(amount)).toBe(expected);
  });

  it('matches five-decimal crypto formatting at and above 0.001', () => {
    expect(formatSignificantAmount(1.5)).toBe('1.5');
    expect(formatSignificantAmount(0.001)).toBe('0.001');
    expect(formatSignificantAmount(0.00123456)).toBe('0.00123');
    expect(formatSignificantAmount(0)).toBe('0');
  });

  it('strips trailing zeros from five significant digits below 0.001', () => {
    expect(formatSignificantAmount(0.00016)).toBe('0.00016');
    expect(formatSignificantAmount(0.000173)).toBe('0.000173');
  });

  it('keeps the sign and returns non-finite values unchanged', () => {
    expect(formatSignificantAmount(-1 / 6173.4)).toBe('-0.00016199');
    expect(formatSignificantAmount(-1.5)).toBe('-1.5');
    expect(formatSignificantAmount(Number.POSITIVE_INFINITY)).toBe('Infinity');
    expect(formatSignificantAmount(Number.NaN)).toBe('NaN');
  });
});

describe('formatFiatRate', () => {
  it.each([
    [1, '1.00'],
    [-1, '-1.00'],
    [0, '0.00'],
    [1 / 0.020801, '48.07'],
    [2475.25, '2 475.25'],
    [-2475.25, '-2 475.25'],
    [0.99999, '0.99999'],
    [1 / 2.7663, '0.36149'],
    [1 / 6173.4, '0.00016199'],
    [-1 / 6173.4, '-0.00016199'],
    [1 / 6000000000, '0.00000000016667'],
    [1 / Number.MAX_VALUE, '0.00'],
    [Number.POSITIVE_INFINITY, 'Infinity'],
    [Number.NEGATIVE_INFINITY, '-Infinity'],
    [Number.NaN, 'NaN'],
  ])('formats %s as %s', (amount, expected) => {
    expect(formatFiatRate(amount)).toBe(expected);
  });
});
