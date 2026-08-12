import { isPendingChargebackNavState, mapRefundApiError } from '../refund-error';

describe('mapRefundApiError', () => {
  it('maps already-charged-back to a clear non-generic message', () => {
    expect(mapRefundApiError('Transaction already charged back')).toBe(
      'This refund has already been approved or paid out and cannot be submitted again.',
    );
  });

  it('maps expired refund session messages', () => {
    expect(mapRefundApiError('Request refund data first')).toBe(
      'Refund details expired. Reload the page and try again.',
    );
    expect(mapRefundApiError('Refund data expired')).toBe('Refund details expired. Reload the page and try again.');
  });

  it('passes through unknown messages unchanged', () => {
    expect(mapRefundApiError('Something custom from the API')).toBe('Something custom from the API');
  });

  it('trims whitespace before matching', () => {
    expect(mapRefundApiError('  Transaction already charged back  ')).toContain('already been approved');
  });
});

describe('isPendingChargebackNavState', () => {
  it('accepts a payload with blockReasons array', () => {
    expect(isPendingChargebackNavState({ blockReasons: ['NameMismatch'] })).toBe(true);
  });

  it('rejects null and incomplete objects', () => {
    expect(isPendingChargebackNavState(null)).toBe(false);
    expect(isPendingChargebackNavState({})).toBe(false);
    expect(isPendingChargebackNavState({ blockReasons: 'NameMismatch' })).toBe(false);
  });
});
