/**
 * Recommendation API for App 2.0, via `@dfx.swiss/react` only.
 * Shape must match `src/dto/recommendation.dto.ts` — pinned by `legacy-contract.test.ts`.
 */

import { useApi } from '@dfx.swiss/react';
import { useMemo } from 'react';

export enum RecommendationStatus {
  CREATED = 'Created',
  PENDING = 'Pending',
  EXPIRED = 'Expired',
  REJECTED = 'Rejected',
  COMPLETED = 'Completed',
}

export enum RecommendationType {
  INVITATION = 'Invitation',
  REQUEST = 'Request',
}

export enum RecommendationMethod {
  REF_CODE = 'RefCode',
  MAIL = 'Mail',
  RECOMMENDATION_CODE = 'RecommendationCode',
}

export interface Recommendation {
  id: number;
  code?: string;
  status: RecommendationStatus;
  type: RecommendationType;
  method: RecommendationMethod;
  name?: string;
  mail?: string;
  confirmationDate?: Date;
  expirationDate: Date;
}

export interface CreateRecommendation {
  recommendedMail?: string;
  recommendedAlias: string;
}

export function useRecommendation(): {
  getRecommendations: () => Promise<Recommendation[]>;
  createRecommendation: (data: CreateRecommendation) => Promise<Recommendation>;
  confirmRecommendation: (recommendation: Recommendation) => Promise<void>;
  rejectRecommendation: (recommendation: Recommendation) => Promise<void>;
} {
  const { call } = useApi();

  return useMemo(() => {
    function getRecommendations(): Promise<Recommendation[]> {
      return call<Recommendation[]>({ url: 'recommendation', method: 'GET' });
    }
    function createRecommendation(data: CreateRecommendation): Promise<Recommendation> {
      return call<Recommendation>({ url: 'recommendation', method: 'POST', data });
    }
    function confirmRecommendation(recommendation: Recommendation): Promise<void> {
      return call<void>({ url: `recommendation/${recommendation.id}/confirm`, method: 'PUT' });
    }
    function rejectRecommendation(recommendation: Recommendation): Promise<void> {
      return call<void>({ url: `recommendation/${recommendation.id}/reject`, method: 'PUT' });
    }
    return { getRecommendations, createRecommendation, confirmRecommendation, rejectRecommendation };
  }, [call]);
}
