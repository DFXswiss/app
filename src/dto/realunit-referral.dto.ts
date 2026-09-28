// Frontend mirror of the api dto/realunit-referral.dto.ts (RealUnitReferralRelationDto) plus the
// entities/realunit-code-binding.entity.ts enums. Date fields arrive as ISO strings over the wire.
export enum RealUnitCodeKind {
  INVITE = 'Invite',
  PROMO = 'Promo',
}

export enum RealUnitManualReviewStatus {
  PENDING = 'Pending',
  APPROVED = 'Approved',
  REJECTED = 'Rejected',
}

export enum RealUnitPrizePayoutStatus {
  PENDING = 'Pending',
  PROCESSING = 'Processing',
  COMPLETE = 'Complete',
  FAILED = 'Failed',
}

export enum RealUnitLegalBasis {
  REFERRAL_PREMIUM = 'ReferralPremium',
  PROMO_GRANT = 'PromoGrant',
}

export interface RealUnitQualifyingBuy {
  id: number;
  created: string;
  amount: number;
}

export interface RealUnitAdminPayout {
  id: number;
  created: string;
  kind: RealUnitCodeKind;
  legalBasis: RealUnitLegalBasis;
  status: RealUnitPrizePayoutStatus;
  amount: number;
  chfValue: number;
  txHash?: string;
  customerId: number;
  customerWallet: string;
  guestAccountId?: number;
  guestWallet?: string;
  referrerAccountId?: number;
  referrerWallet?: string;
  code?: string;
  qualifyingBuy?: RealUnitQualifyingBuy;
}

export interface RealUnitReferralRelation {
  id: number;
  kind: RealUnitCodeKind;
  userId: number;
  guestAccountId?: number;
  referrerAccountId?: number;
  code: string;
  consumedAt?: string;
  credited: boolean;
  created: string;
  reviewStatus?: RealUnitManualReviewStatus;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewReason?: string;
  manualRewardedAt?: string;
  manualRewardedBy?: string;
  manualRewardReason?: string;
}

export interface RealUnitPrizeWallet {
  address: string;
  eth: number;
  realu: number;
}

export enum RealUnitPrizeWalletAlertAsset {
  ETH = 'ETH',
  REALU = 'REALU',
}

export interface RealUnitPrizeWalletAlert {
  id: number;
  asset: RealUnitPrizeWalletAlertAsset;
  threshold: number;
  mail: string;
  created: string; // ISO
}

export interface CreateRealUnitPrizeWalletAlert {
  asset: RealUnitPrizeWalletAlertAsset;
  threshold: number;
  mail: string;
}

export interface RealUnitPromoCode {
  id: number;
  code: string;
  minBuyRealu: number;
  redemptionCap: number;
  validFrom: string;
  validUntil: string;
  deactivatedAt?: string;
  redemptionCount?: number;
}

export interface CreateRealUnitPromoCode {
  code: string;
  redemptionCap: number;
  minBuyRealu?: number;
  validFrom: string;
  validUntil: string;
}

export interface CreateRealUnitPromoBatch {
  count: number;
  prefix?: string;
  redemptionCap: number;
  minBuyRealu?: number;
  validFrom: string;
  validUntil: string;
}

export interface UpdateRealUnitPromoCode {
  code?: string;
  redemptionCap?: number;
  minBuyRealu?: number;
  validFrom?: string;
  validUntil?: string;
}
