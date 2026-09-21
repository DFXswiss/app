import { UserRole } from '@dfx.swiss/react';
import type { KycStepInfo } from 'src/hooks/compliance.hook';

// A Recommendation step waits in this status from the moment the customer enters a code until the
// recommender confirms the request or it expires.
export const PENDING_RECOMMENDATION_STATUS = 'InternalReview';

// A reset closes the step as Canceled, like the backend's own KYC reset does. Failed is avoided on
// purpose: the API mails a "KYC step failed" notice with the comment to the customer for that status.
export const RESET_RECOMMENDATION_STATUS = 'Canceled';

/**
 * Resetting a pending recommendation request is a Compliance action, like changing the Ref-Code. The API
 * (PUT kyc/admin/step/:id, Support role and above) is the source of truth; the UI only hides the action
 * for roles that should not use it. SuperAdmin is not a separate session role in this app — Admin covers it.
 */
export function canResetRecommendation(role: UserRole | undefined): boolean {
  return role === UserRole.COMPLIANCE || role === UserRole.ADMIN;
}

export function isPendingRecommendation(step: KycStepInfo): boolean {
  return step.name === 'Recommendation' && step.status === PENDING_RECOMMENDATION_STATUS;
}

/**
 * The backend reads a step comment as a ';'-separated list of codes (Blocked and Released gate whether
 * the customer gets another Recommendation try), so the free-text reason must not contain the separator
 * and is prefixed so that no segment can equal one of those codes.
 */
export function recommendationResetComment(reason: string): string {
  return `Reset: ${reason.replace(/;/g, ',').trim()}`;
}

/** The recipient of the request in the "Name #id" form the network view uses; undefined without one. */
export function recommenderLabel(step: KycStepInfo): string | undefined {
  const recommender = step.recommender;
  if (!recommender) return undefined;
  const name = [recommender.firstname, recommender.surname].filter(Boolean).join(' ');
  return name ? `${name} #${recommender.id}` : `#${recommender.id}`;
}
