import { PaginationDirection, quoteIsDeactivated, RealUnitQuote } from 'src/dto/realunit.dto';

describe('realunit.dto', () => {
  it('exposes PaginationDirection values', () => {
    expect(PaginationDirection.NEXT).toBe('next');
    expect(PaginationDirection.PREV).toBe('prev');
  });

  it('quoteIsDeactivated is true only for a non-empty deactivatedAt', () => {
    const base: RealUnitQuote = {
      id: 1,
      uid: 'Q1',
      type: 'Buy',
      status: 'WaitingForPayment',
      amount: 100,
      estimatedAmount: 10,
      created: '2026-01-15T10:00:00.000Z',
    };
    expect(quoteIsDeactivated(base)).toBe(false);
    expect(quoteIsDeactivated({ ...base, deactivatedAt: '' })).toBe(false);
    expect(quoteIsDeactivated({ ...base, deactivatedAt: '2026-02-02T12:00:00.000Z' })).toBe(true);
  });
});
