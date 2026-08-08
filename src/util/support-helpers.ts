import { Department, SupportIssueType, UserRole } from '@dfx.swiss/react';
import { IssueReasonLabels, IssueTypeLabels } from 'src/config/labels';

// Pure aging/escalation/statistics logic lives in a dependency-free module; re-exported
// here so existing imports from 'support-helpers' keep working.
export * from './support-stats';

export function typeLabel(type: string): string {
  return IssueTypeLabels[type as SupportIssueType] ?? type;
}

export function reasonLabel(reason: string): string {
  return IssueReasonLabels[reason as keyof typeof IssueReasonLabels] ?? reason;
}

// Departments a staff role may view and handle in the support dashboard. Mirrors the
// server-side visibility added in api PR #3983 (getVisibleDepartments): admin sees every
// department, compliance is a superset of support (it additionally sees support tickets),
// and a single-department role only sees its own.
const ROLE_DEPARTMENTS: Partial<Record<UserRole, Department[]>> = {
  [UserRole.ADMIN]: Object.values(Department),
  [UserRole.SUPPORT]: [Department.SUPPORT],
  [UserRole.COMPLIANCE]: [Department.SUPPORT, Department.COMPLIANCE],
  [UserRole.MARKETING]: [Department.MARKETING],
};

// Scopes the department filter and column to what the role may actually handle. An unmapped or
// department-less role returns [] (fail closed: no filter/column) rather than defaulting to every
// department — a new role must be granted visibility explicitly, never by omission.
export function visibleDepartmentsForRole(role?: UserRole): Department[] {
  if (!role) return [];
  const departments = ROLE_DEPARTMENTS[role];
  if (!departments) return [];
  return departments;
}

// --- Customer chat date separators ---

/** True when both timestamps fall on the same local calendar day (year, month, day). */
export function isSameCalendarDay(a: Date | string | number, b: Date | string | number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

/**
 * Whether a date separator should appear above `current`. Always true for the first message
 * (`previous` undefined); otherwise true when the calendar day changes.
 */
export function shouldShowDateSeparator(
  current: Date | string | number,
  previous: Date | string | number | undefined,
): boolean {
  if (previous === undefined) return true;
  return !isSameCalendarDay(current, previous);
}

/** English i18n keys for relative day labels; null falls back to a locale date format. */
export function relativeDayKey(date: Date | string | number, now: Date = new Date()): 'Today' | 'Yesterday' | null {
  if (isSameCalendarDay(date, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameCalendarDay(date, yesterday)) return 'Yesterday';
  return null;
}
