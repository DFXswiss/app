jest.mock('@dfx.swiss/react', () => ({
  UserRole: { USER: 'User', SUPPORT: 'Support', MARKETING: 'Marketing', COMPLIANCE: 'Compliance', ADMIN: 'Admin' },
}));

import { UserRole } from '@dfx.swiss/react';
import type { KycStepInfo } from 'src/hooks/compliance.hook';
import {
  canResetRecommendation,
  isPendingRecommendation,
  PENDING_RECOMMENDATION_STATUS,
  recommendationResetComment,
  recommenderLabel,
  RESET_RECOMMENDATION_STATUS,
} from 'src/util/recommendation-step.util';

function step(overrides: Partial<KycStepInfo> = {}): KycStepInfo {
  return {
    id: 1,
    name: 'Recommendation',
    status: 'InternalReview',
    sequenceNumber: 0,
    created: '2026-09-17',
    ...overrides,
  };
}

describe('canResetRecommendation', () => {
  it.each([UserRole.COMPLIANCE, UserRole.ADMIN])('allows %s', (role) => {
    expect(canResetRecommendation(role)).toBe(true);
  });

  it.each([UserRole.SUPPORT, UserRole.MARKETING, UserRole.USER, undefined])('refuses %s', (role) => {
    expect(canResetRecommendation(role)).toBe(false);
  });
});

describe('isPendingRecommendation', () => {
  it('is true only for a Recommendation step waiting for the recommender', () => {
    expect(PENDING_RECOMMENDATION_STATUS).toBe('InternalReview');
    expect(isPendingRecommendation(step())).toBe(true);
    expect(isPendingRecommendation(step({ status: 'Completed' }))).toBe(false);
    expect(isPendingRecommendation(step({ status: 'InProgress' }))).toBe(false);
    expect(isPendingRecommendation(step({ name: 'Ident' }))).toBe(false);
  });
});

describe('recommendationResetComment', () => {
  it('prefixes the reason and keeps the backend separator out of it', () => {
    expect(RESET_RECOMMENDATION_STATUS).toBe('Canceled');
    expect(recommendationResetComment('  wrong code; typo  ')).toBe('Reset: wrong code, typo');
    expect(recommendationResetComment('Blocked')).toBe('Reset: Blocked');
  });
});

describe('recommenderLabel', () => {
  it('is undefined without a recommender', () => {
    expect(recommenderLabel(step())).toBeUndefined();
  });

  it('uses the name with the id, or the id alone without a name', () => {
    expect(recommenderLabel(step({ recommender: { id: 302951, firstname: 'Manfred', surname: 'Patzwahl' } }))).toBe(
      'Manfred Patzwahl #302951',
    );
    expect(recommenderLabel(step({ recommender: { id: 302951, firstname: 'Manfred' } }))).toBe('Manfred #302951');
    expect(recommenderLabel(step({ recommender: { id: 302951 } }))).toBe('#302951');
  });
});
