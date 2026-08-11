import { useMemo } from 'react';
import { useGuardedApi } from './guarded-api.hook';

export interface UnassignedBankTx {
  id: number;
  transactionId?: number;
  accountServiceRef: string;
  bookingDate?: string;
  amount: number;
  currency: string;
  creditDebitIndicator?: string; // 'CRDT' | 'DBIT' - optional, mirrors the entity column
  type: string;
  name?: string;
  iban?: string;
  remittanceInfo?: string;
  endToEndId?: string;
  buyCandidateId?: number;
}

export interface AssignBankTxDto {
  type: string;
  buyId?: number;
}

// Mirrors BankTxType in DFXswiss/api (bank-tx.entity.ts), minus the three unassigned markers:
// setting a transaction back to Pending/GSheet/Unknown is not an assignment, and the API maps
// those to a null transaction type.
export const AssignableBankTxTypes = [
  'Internal',
  'BuyCryptoReturn',
  'BankTxReturn',
  'BankTxReturn-Chargeback',
  'BankTxRepeat',
  'BankTxRepeat-Chargeback',
  'BuyCrypto',
  'BuyFiat',
  'FiatFiat',
  'TestFiatFiat',
  'Kraken',
  'Scrypt',
  'SCB',
  'CheckoutLtd',
  'BankAccountFee',
  'ExtraordinaryExpenses',
];

export function useBankTxAssignment(): {
  getUnassignedBankTx: () => Promise<UnassignedBankTx[]>;
  assignBankTx: (id: number, dto: AssignBankTxDto) => Promise<void>;
} {
  const { call } = useGuardedApi();

  async function getUnassignedBankTx(): Promise<UnassignedBankTx[]> {
    return call<UnassignedBankTx[]>({ url: 'bankTx/unassigned', method: 'GET' });
  }

  async function assignBankTx(id: number, dto: AssignBankTxDto): Promise<void> {
    return call<void>({
      url: `bankTx/${id}`,
      method: 'PUT',
      data: dto,
    });
  }

  return useMemo(
    () => ({
      getUnassignedBankTx,
      assignBankTx,
    }),
    [call],
  );
}
