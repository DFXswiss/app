import { RealUnitCodeKind, RealUnitManualReviewStatus } from 'src/dto/realunit-referral.dto';

// Translation keys (namespace screens/referral) for the raw API values, shared by the relation
// list and the relation detail so both show the same wording.
export const REVIEW_STATUS_LABEL: Record<RealUnitManualReviewStatus, string> = {
  [RealUnitManualReviewStatus.PENDING]: 'Open',
  [RealUnitManualReviewStatus.APPROVED]: 'Approved',
  [RealUnitManualReviewStatus.REJECTED]: 'Rejected',
};

export const CODE_KIND_LABEL: Record<RealUnitCodeKind, string> = {
  [RealUnitCodeKind.INVITE]: 'Invite',
  [RealUnitCodeKind.PROMO]: 'Promo',
};
