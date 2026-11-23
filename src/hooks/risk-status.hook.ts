import { useMemo } from 'react';
import { useGuardedApi } from './guarded-api.hook';

// The five values of the retired risk-status sheet, in its order.
export const OPERATOR_RISK_STATUSES = [
  'Suspicious',
  'Blocked',
  'Released',
  'BlockedBuyCrypto',
  'BlockedBuyFiat',
] as const;

export type OperatorRiskStatus = (typeof OPERATOR_RISK_STATUSES)[number];

export interface SetRiskStatusDto {
  riskStatus: OperatorRiskStatus;
  reason: string;
}

// Sets the risk status of an account (Support and up). The PUT writes the status and records the
// verified clerk and the reason; the API answers with an empty body. The endpoint answers 404 while
// the API's userDataRiskStatus switch (its environment file) or the UserDataRiskStatus process is off.
export function useRiskStatus(): {
  setRiskStatus: (userDataId: number, dto: SetRiskStatusDto) => Promise<void>;
} {
  const { call } = useGuardedApi();

  async function setRiskStatus(userDataId: number, dto: SetRiskStatusDto): Promise<void> {
    return call<void>({
      url: `userData/${userDataId}/riskStatus`,
      method: 'PUT',
      data: dto,
    });
  }

  return useMemo(() => ({ setRiskStatus }), [call]);
}
