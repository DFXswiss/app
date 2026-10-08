import { RealUnitPromoCode } from 'src/dto/realunit-referral.dto';

export enum PromoCodeStatus {
  ACTIVE = 'Active',
  PLANNED = 'Planned',
  EXHAUSTED = 'Exhausted',
  EXPIRED = 'Expired',
  DEACTIVATED = 'Deactivated',
}

export interface PromoCodeListOptions {
  hideDeactivated: boolean;
  hideExpired: boolean;
  newestFirst: boolean;
  // Rows deactivated in this visit stay visible so the operator sees the result and can undo it.
  keepVisibleIds: ReadonlySet<number>;
}

// Status derived from the promo code itself. Order matters: a deactivated code is shown as
// deactivated even when it is also expired, and an expired code as expired even when its cap
// was reached, because that is what the operator acts on.
export function promoCodeStatus(row: RealUnitPromoCode, now: Date): PromoCodeStatus {
  if (row.deactivatedAt) return PromoCodeStatus.DEACTIVATED;
  if (new Date(row.validUntil).getTime() < now.getTime()) return PromoCodeStatus.EXPIRED;
  if ((row.redemptionCount ?? 0) >= row.redemptionCap) return PromoCodeStatus.EXHAUSTED;
  if (new Date(row.validFrom).getTime() > now.getTime()) return PromoCodeStatus.PLANNED;
  return PromoCodeStatus.ACTIVE;
}

// The API stores the end of the validity day as 23:59:59.999Z. Formatting that instant in the
// browser time zone would show the following day in Switzerland, so the calendar date is taken
// from the stored value itself (same reason as the campaign text on the API side).
export function formatPromoDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}.${month}.${year}`;
}

export function promoCodeList(
  codes: RealUnitPromoCode[],
  now: Date,
  { hideDeactivated, hideExpired, newestFirst, keepVisibleIds }: PromoCodeListOptions,
): RealUnitPromoCode[] {
  return codes
    .filter((row) => {
      if (keepVisibleIds.has(row.id)) return true;
      const status = promoCodeStatus(row, now);
      if (hideDeactivated && status === PromoCodeStatus.DEACTIVATED) return false;
      if (hideExpired && status === PromoCodeStatus.EXPIRED) return false;
      return true;
    })
    .sort((a, b) => {
      const byDate = a.validUntil.localeCompare(b.validUntil);
      if (byDate !== 0) return newestFirst ? -byDate : byDate;
      return a.code.localeCompare(b.code);
    });
}
