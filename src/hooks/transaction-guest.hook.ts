import { TransactionRefundData, TransactionRefundTarget, TransactionTarget, useApi } from '@dfx.swiss/react';

export function useTransactionGuest() {
  const { call } = useApi();

  return {
    getTargets: (uid: string) =>
      call<TransactionTarget[]>({ url: `transaction/uid/${uid}/targets`, method: 'GET', token: false }),
    setTarget: (uid: string, buyId: number) =>
      call({ url: `transaction/uid/${uid}/target?buyId=${buyId}`, method: 'PUT', token: false }),
    getRefund: (uid: string) =>
      call<TransactionRefundData>({ url: `transaction/uid/${uid}/refund`, method: 'GET', token: false }),
    setRefund: (uid: string, target: TransactionRefundTarget) =>
      call({ url: `transaction/uid/${uid}/refund`, method: 'PUT', data: target, token: false }),
  };
}
