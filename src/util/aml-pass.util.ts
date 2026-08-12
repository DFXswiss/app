import { UserRole } from '@dfx.swiss/react';

/**
 * Manual amlCheck=Pass is Admin-only. API enforces the same rule fail-closed
 * (`assertCanManuallySetAmlPass`); UI only hides the option for non-admins.
 * SuperAdmin is not a separate session role in this app — Admin covers it.
 */
export function canManuallySetAmlPass(role: UserRole | undefined): boolean {
  return role === UserRole.ADMIN;
}
