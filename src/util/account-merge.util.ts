import { UserRole } from '@dfx.swiss/react';

export const MERGED_STATUS = 'Merged';

// Merging accounts is a Compliance and Admin action. The API enforces it fail-closed
// (RoleGuard(UserRole.COMPLIANCE) on PUT userData/:id/operatorMerge); the UI only hides the button.
// SuperAdmin is not a separate session role in this app (same note as risk-status.util.ts).
export function canMergeAccounts(role: UserRole | undefined): boolean {
  return role === UserRole.COMPLIANCE || role === UserRole.ADMIN;
}

export interface MergeAccount {
  id: number;
  status?: string;
  mail?: string;
  kycLevel?: number;
  verifiedName?: string;
}

export interface AccountMergePlan {
  masterId: number;
  slaveId: number;
  resultingMail?: string;
  errors: string[];
}

export function planAccountMerge(
  current: MergeAccount,
  other: MergeAccount,
  keep: 'current' | 'other',
): AccountMergePlan {
  const master = keep === 'current' ? current : other;
  const slave = keep === 'current' ? other : current;

  const errors: string[] = [];
  if (master.id === slave.id) errors.push('An account cannot be merged with itself.');
  if (master.status === MERGED_STATUS) errors.push(`Account ${master.id} is already merged.`);
  if (slave.status === MERGED_STATUS && slave.id !== master.id) {
    errors.push(`Account ${slave.id} is already merged.`);
  }

  const masterLevel = master.kycLevel ?? 0;
  const slaveLevel = slave.kycLevel ?? 0;
  if (slaveLevel > masterLevel) {
    errors.push(
      `The account that stays (${master.id}) has KYC level ${masterLevel}; the other account has ${slaveLevel}. ` +
        'Keep the account with the higher KYC level.',
    );
  }

  return {
    masterId: master.id,
    slaveId: slave.id,
    resultingMail: slave.mail ?? master.mail,
    errors,
  };
}
