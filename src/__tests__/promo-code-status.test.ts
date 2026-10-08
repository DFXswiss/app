import { RealUnitPromoCode } from 'src/dto/realunit-referral.dto';
import { formatPromoDate, promoCodeList, promoCodeStatus, PromoCodeStatus } from 'src/util/promo-code-status';

const NOW = new Date('2026-10-02T08:00:00.000Z');

function code(id: number, name: string, overrides: Partial<RealUnitPromoCode> = {}): RealUnitPromoCode {
  return {
    id,
    code: name,
    minBuyRealu: 200,
    redemptionCap: 10,
    redemptionCount: 0,
    validFrom: '2026-10-01T00:00:00.000Z',
    validUntil: '2026-10-18T23:59:59.999Z',
    ...overrides,
  };
}

describe('promoCodeStatus', () => {
  it('is Active inside the validity window with redemptions left', () => {
    expect(promoCodeStatus(code(1, 'A'), NOW)).toBe(PromoCodeStatus.ACTIVE);
  });

  it('is Planned before the validity starts', () => {
    expect(promoCodeStatus(code(1, 'A', { validFrom: '2026-10-12T00:00:00.000Z' }), NOW)).toBe(PromoCodeStatus.PLANNED);
  });

  it('is Exhausted once the redemption cap is reached', () => {
    expect(promoCodeStatus(code(1, 'A', { redemptionCount: 10 }), NOW)).toBe(PromoCodeStatus.EXHAUSTED);
  });

  it('treats a missing redemption count as zero', () => {
    expect(promoCodeStatus(code(1, 'A', { redemptionCount: undefined }), NOW)).toBe(PromoCodeStatus.ACTIVE);
  });

  it('is Expired after the validity ends, even when the cap was reached', () => {
    const row = code(1, 'A', { validUntil: '2026-10-01T23:59:59.999Z', redemptionCount: 10 });
    expect(promoCodeStatus(row, NOW)).toBe(PromoCodeStatus.EXPIRED);
  });

  it('is Deactivated whenever a deactivation date is set, even when also expired', () => {
    const row = code(1, 'A', { validUntil: '2026-09-01T23:59:59.999Z', deactivatedAt: '2026-08-01T00:00:00.000Z' });
    expect(promoCodeStatus(row, NOW)).toBe(PromoCodeStatus.DEACTIVATED);
  });
});

describe('formatPromoDate', () => {
  it('takes the calendar day from the stored value instead of the browser time zone', () => {
    expect(formatPromoDate('2026-10-18T23:59:59.999Z')).toBe('18.10.2026');
    expect(formatPromoDate('2026-10-01T00:00:00.000Z')).toBe('01.10.2026');
  });
});

describe('promoCodeList', () => {
  const active = code(1, 'BETA', { validUntil: '2026-10-18T23:59:59.999Z' });
  const sameEnd = code(2, 'ALPHA', { validUntil: '2026-10-18T23:59:59.999Z' });
  const later = code(3, 'LATER', { validUntil: '2026-11-30T23:59:59.999Z' });
  const expired = code(4, 'OLD', { validUntil: '2026-09-25T23:59:59.999Z' });
  const deactivated = code(5, 'OFF', { deactivatedAt: '2026-09-15T00:00:00.000Z' });
  const all = [active, sameEnd, later, expired, deactivated];
  const none = new Set<number>();

  const codes = (list: RealUnitPromoCode[]) => list.map((r) => r.code);

  it('sorts by valid until, latest first, and by code on equal end dates', () => {
    const list = promoCodeList(all, NOW, {
      hideDeactivated: false,
      hideExpired: false,
      newestFirst: true,
      keepVisibleIds: none,
    });
    expect(codes(list)).toEqual(['LATER', 'ALPHA', 'BETA', 'OFF', 'OLD']);
  });

  it('sorts earliest first when reversed, keeping the code order on equal end dates', () => {
    const list = promoCodeList(all, NOW, {
      hideDeactivated: false,
      hideExpired: false,
      newestFirst: false,
      keepVisibleIds: none,
    });
    expect(codes(list)).toEqual(['OLD', 'ALPHA', 'BETA', 'OFF', 'LATER']);
  });

  it('hides deactivated and expired codes independently', () => {
    const base = { newestFirst: true, keepVisibleIds: none };
    expect(codes(promoCodeList(all, NOW, { ...base, hideDeactivated: true, hideExpired: false }))).not.toContain('OFF');
    expect(codes(promoCodeList(all, NOW, { ...base, hideDeactivated: true, hideExpired: false }))).toContain('OLD');
    expect(codes(promoCodeList(all, NOW, { ...base, hideDeactivated: false, hideExpired: true }))).not.toContain('OLD');
    expect(codes(promoCodeList(all, NOW, { ...base, hideDeactivated: false, hideExpired: true }))).toContain('OFF');
  });

  it('keeps a row visible that is listed as kept, even when its status is hidden', () => {
    const list = promoCodeList(all, NOW, {
      hideDeactivated: true,
      hideExpired: true,
      newestFirst: true,
      keepVisibleIds: new Set([5]),
    });
    expect(codes(list)).toEqual(['LATER', 'ALPHA', 'BETA', 'OFF']);
  });
});
