import { extractChargeLnurl } from '../screens/ocp/charge-lnurl';

describe('extractChargeLnurl', () => {
  it('uses only payment.lnurl and never the reusable link lnurl', () => {
    expect(extractChargeLnurl({ payment: { lnurl: 'LNURL1CHARGE' }, lnurl: 'LNURL1LINK' })).toBe('LNURL1CHARGE');
    expect(extractChargeLnurl({ lnurl: 'LNURL1LINK' })).toBeUndefined();
    expect(extractChargeLnurl({ payment: { lnurl: '  ' }, lnurl: 'LNURL1LINK' })).toBeUndefined();
  });

  it('returns undefined when payment.lnurl is absent (no link/demo fallback)', () => {
    expect(extractChargeLnurl({})).toBeUndefined();
    expect(extractChargeLnurl(null)).toBeUndefined();
    expect(extractChargeLnurl(undefined)).toBeUndefined();
    expect(extractChargeLnurl({ payment: {} })).toBeUndefined();
  });
});
