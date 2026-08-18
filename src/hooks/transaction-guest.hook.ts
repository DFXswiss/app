import { TransactionRefundData, TransactionRefundTarget, TransactionTarget, useApi } from '@dfx.swiss/react';

export function useTransactionGuest() {
  const { call } = useApi();

  return {
    getTargets: (uid: string, secret: string) =>
      call<TransactionTarget[]>({ url: `transaction/uid/${uid}/${secret}/targets`, method: 'GET', token: false }),
    setTarget: (uid: string, secret: string, buyId: number) =>
      call({ url: `transaction/uid/${uid}/${secret}/target?buyId=${buyId}`, method: 'PUT', token: false }),
    getRefund: (uid: string, secret: string) =>
      call<TransactionRefundData>({ url: `transaction/uid/${uid}/${secret}/refund`, method: 'GET', token: false }),
    setRefund: (uid: string, secret: string, target: TransactionRefundTarget) =>
      call({ url: `transaction/uid/${uid}/${secret}/refund`, method: 'PUT', data: target, token: false }),
  };
}
