import { UserRole } from '@dfx.swiss/react';

// The status the API stores for an account the customer deleted (UserDataStatus.DEACTIVATED).
export const DEACTIVATED_STATUS = 'Deactivated';

/**
 * Reactivating an account is a Compliance action. The API enforces the same rule fail-closed
 * (`RoleGuard(UserRole.COMPLIANCE)` on PUT support/:id/reactivate); the UI only hides the button for
 * roles that would be refused. SuperAdmin is not a separate session role in this app — Admin covers it.
 */
export function canReactivateAccount(role: UserRole | undefined): boolean {
  return role === UserRole.COMPLIANCE || role === UserRole.ADMIN;
}
