import { extractChargeLnurl } from '../screens/ocp/charge-lnurl';

describe('extractChargeLnurl', () => {
  it('prefers payment.lnurl over top-level lnurl', () => {
    expect(extractChargeLnurl({ payment: { lnurl: 'LNURL1CHARGE' }, lnurl: 'LNURL1LINK' })).toBe('LNURL1CHARGE');
  });

  it('accepts top-level lnurl when payment is missing', () => {
    expect(extractChargeLnurl({ lnurl: 'LNURL1TOP' })).toBe('LNURL1TOP');
  });

  it('returns undefined when neither field is present (no link/demo fallback)', () => {
    expect(extractChargeLnurl({})).toBeUndefined();
    expect(extractChargeLnurl(null)).toBeUndefined();
    expect(extractChargeLnurl(undefined)).toBeUndefined();
    expect(extractChargeLnurl({ payment: {}, lnurl: '  ' })).toBeUndefined();
  });
});
