// Mock the label config so support-helpers does not pull in the real @dfx.swiss/react label tables.
// Non-empty maps so typeLabel/reasonLabel hit both the mapped and the fallback branch.
jest.mock('src/config/labels', () => ({
  IssueTypeLabels: {
    GenericIssue: 'Generic issue',
  },
  IssueReasonLabels: {
    Other: 'Other reason',
  },
}));

// Mock @dfx.swiss/react to avoid ES module issues in jest.
jest.mock('@dfx.swiss/react', () => ({
  Department: {
    SUPPORT: 'Support',
    COMPLIANCE: 'Compliance',
    MARKETING: 'Marketing',
    COOPERATION: 'Cooperation',
  },
  UserRole: {
    ADMIN: 'Admin',
    SUPPORT: 'Support',
    COMPLIANCE: 'Compliance',
    MARKETING: 'Marketing',
    CUSTODY: 'Custody',
  },
}));

import { Department, UserRole } from '@dfx.swiss/react';
import {
  isSameCalendarDay,
  reasonLabel,
  relativeDayKey,
  shouldShowDateSeparator,
  typeLabel,
  visibleDepartmentsForRole,
} from 'src/util/support-helpers';

describe('typeLabel', () => {
  it('returns the mapped label for a known issue type', () => {
    expect(typeLabel('GenericIssue')).toBe('Generic issue');
  });

  it('falls back to the raw type string when no label is configured', () => {
    expect(typeLabel('UnknownType')).toBe('UnknownType');
  });
});

describe('reasonLabel', () => {
  it('returns the mapped label for a known issue reason', () => {
    expect(reasonLabel('Other')).toBe('Other reason');
  });

  it('falls back to the raw reason string when no label is configured', () => {
    expect(reasonLabel('UnknownReason')).toBe('UnknownReason');
  });
});

describe('visibleDepartmentsForRole', () => {
  it('limits support to the support department', () => {
    expect(visibleDepartmentsForRole(UserRole.SUPPORT)).toEqual([Department.SUPPORT]);
  });

  it('lets compliance see support and compliance tickets (superset of support)', () => {
    expect(visibleDepartmentsForRole(UserRole.COMPLIANCE)).toEqual([Department.SUPPORT, Department.COMPLIANCE]);
  });

  it('limits marketing to the marketing department', () => {
    expect(visibleDepartmentsForRole(UserRole.MARKETING)).toEqual([Department.MARKETING]);
  });

  it('gives admin every department (unrestricted)', () => {
    expect(visibleDepartmentsForRole(UserRole.ADMIN)).toEqual(Object.values(Department));
  });

  it('returns no departments when the role is undefined', () => {
    expect(visibleDepartmentsForRole(undefined)).toEqual([]);
  });

  it('fails closed for an unmapped role (no department access by default)', () => {
    expect(visibleDepartmentsForRole(UserRole.CUSTODY)).toEqual([]);
  });
});

describe('isSameCalendarDay', () => {
  it('treats two times on the same local day as equal', () => {
    expect(isSameCalendarDay(new Date(2024, 6, 6, 8, 0), new Date(2024, 6, 6, 23, 59))).toBe(true);
  });

  it('does not treat the same day-of-month in different months as equal', () => {
    // B3 regression: getDate()-only comparison would wrongly return true here.
    expect(isSameCalendarDay(new Date(2024, 6, 6, 12, 0), new Date(2024, 7, 6, 12, 0))).toBe(false);
  });

  it('does not treat the same month/day in different years as equal', () => {
    expect(isSameCalendarDay(new Date(2023, 6, 6), new Date(2024, 6, 6))).toBe(false);
  });

  it('accepts ISO string inputs', () => {
    const a = new Date(2024, 0, 15, 10, 0);
    const b = new Date(2024, 0, 15, 18, 0);
    expect(isSameCalendarDay(a.toISOString(), b.toISOString())).toBe(true);
  });
});

describe('shouldShowDateSeparator', () => {
  it('always shows a separator above the first message', () => {
    expect(shouldShowDateSeparator(new Date(2024, 6, 6), undefined)).toBe(true);
  });

  it('hides the separator when the previous message is the same calendar day', () => {
    expect(shouldShowDateSeparator(new Date(2024, 6, 6, 18, 0), new Date(2024, 6, 6, 9, 0))).toBe(false);
  });

  it('shows the separator when the calendar day changes (including same day-of-month across months)', () => {
    expect(shouldShowDateSeparator(new Date(2024, 7, 6, 9, 0), new Date(2024, 6, 6, 18, 0))).toBe(true);
  });
});

describe('relativeDayKey', () => {
  const now = new Date(2024, 6, 10, 15, 0, 0); // 10 Jul 2024

  it('returns Today for the current calendar day', () => {
    expect(relativeDayKey(new Date(2024, 6, 10, 1, 0), now)).toBe('Today');
  });

  it('returns Yesterday for the previous calendar day', () => {
    expect(relativeDayKey(new Date(2024, 6, 9, 23, 0), now)).toBe('Yesterday');
  });

  it('returns null for older days', () => {
    expect(relativeDayKey(new Date(2024, 6, 8, 12, 0), now)).toBeNull();
  });
});
