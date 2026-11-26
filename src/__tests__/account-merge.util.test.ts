jest.mock('@dfx.swiss/react', () => ({
  UserRole: { USER: 'User', SUPPORT: 'Support', MARKETING: 'Marketing', COMPLIANCE: 'Compliance', ADMIN: 'Admin' },
}));

import { UserRole } from '@dfx.swiss/react';
import { canMergeAccounts, MERGED_STATUS, MergeAccount, planAccountMerge } from 'src/util/account-merge.util';

function account(overrides: Partial<MergeAccount> = {}): MergeAccount {
  return {
    id: 88001,
    status: 'Active',
    mail: 'master@example.com',
    kycLevel: 30,
    verifiedName: 'Master',
    ...overrides,
  };
}

describe('canMergeAccounts', () => {
  it.each([UserRole.COMPLIANCE, UserRole.ADMIN])('allows the %s role', (role) => {
    expect(canMergeAccounts(role)).toBe(true);
  });

  it.each([UserRole.SUPPORT, UserRole.MARKETING, UserRole.USER, undefined])('refuses %s', (role) => {
    expect(canMergeAccounts(role)).toBe(false);
  });
});

describe('planAccountMerge', () => {
  it("keeps the master's mail when both accounts have one", () => {
    expect(planAccountMerge(account(), account({ id: 88002, mail: 'slave@example.com' }), 'current')).toEqual({
      masterId: 88001,
      slaveId: 88002,
      resultingMail: 'master@example.com',
      errors: [],
    });
  });

  it('keeps the other account as master and its own mail when asked', () => {
    expect(planAccountMerge(account(), account({ id: 88002, mail: 'slave@example.com' }), 'other')).toEqual({
      masterId: 88002,
      slaveId: 88001,
      resultingMail: 'slave@example.com',
      errors: [],
    });
  });

  it('keeps the master mail when the other account has none', () => {
    const plan = planAccountMerge(account(), account({ id: 88002, mail: undefined }), 'current');
    expect(plan.resultingMail).toBe('master@example.com');
  });

  it('fills an empty master mail from the other account', () => {
    const plan = planAccountMerge(
      account({ mail: undefined }),
      account({ id: 88002, mail: 'slave@example.com' }),
      'current',
    );
    expect(plan.resultingMail).toBe('slave@example.com');
  });

  it('has no resulting mail when neither account has one', () => {
    const plan = planAccountMerge(account({ mail: undefined }), account({ id: 88002, mail: undefined }), 'current');
    expect(plan.resultingMail).toBeUndefined();
  });

  it('refuses an account merged with itself', () => {
    const plan = planAccountMerge(account(), account(), 'current');
    expect(plan.errors).toEqual(['An account cannot be merged with itself.']);
  });

  it('refuses a master that is already merged', () => {
    const plan = planAccountMerge(account({ status: MERGED_STATUS }), account({ id: 88002 }), 'current');
    expect(plan.errors).toEqual(['Account 88001 is already merged.']);
  });

  it('refuses a slave that is already merged', () => {
    const plan = planAccountMerge(account(), account({ id: 88002, status: MERGED_STATUS }), 'current');
    expect(plan.errors).toEqual(['Account 88002 is already merged.']);
  });

  it('lists both merged accounts with the master first', () => {
    const plan = planAccountMerge(
      account({ status: MERGED_STATUS }),
      account({ id: 88002, status: MERGED_STATUS }),
      'current',
    );
    expect(plan.errors).toEqual(['Account 88001 is already merged.', 'Account 88002 is already merged.']);
  });

  it('lists one entry for a merged duplicate id', () => {
    const plan = planAccountMerge(account({ status: MERGED_STATUS }), account({ status: MERGED_STATUS }), 'other');
    expect(plan.errors).toEqual(['An account cannot be merged with itself.', 'Account 88001 is already merged.']);
  });

  it('refuses keeping the account with the lower KYC level', () => {
    const plan = planAccountMerge(account({ kycLevel: 20 }), account({ id: 88002, kycLevel: 30 }), 'current');
    expect(plan.errors).toEqual([
      'The account that stays (88001) has KYC level 20; the other account has 30. ' +
        'Keep the account with the higher KYC level.',
    ]);
  });

  it('compares a missing KYC level as zero', () => {
    const plan = planAccountMerge(account({ kycLevel: undefined }), account({ id: 88002, kycLevel: 10 }), 'other');
    expect(plan.errors).toEqual([]);
    expect(plan.masterId).toBe(88002);
  });

  it('treats a missing KYC level of the master as zero', () => {
    const plan = planAccountMerge(account({ kycLevel: undefined }), account({ id: 88002, kycLevel: 0 }), 'current');
    expect(plan.errors).toEqual([]);
    expect(plan.masterId).toBe(88001);
  });

  it('treats a missing KYC level of the slave as zero', () => {
    const plan = planAccountMerge(account({ kycLevel: 10 }), account({ id: 88002, kycLevel: undefined }), 'current');
    expect(plan.errors).toEqual([]);
    expect(plan.slaveId).toBe(88002);
  });

  it('accepts the same KYC level', () => {
    expect(planAccountMerge(account({ kycLevel: 30 }), account({ id: 88002, kycLevel: 30 }), 'current').errors).toEqual(
      [],
    );
  });

  it('collects every error in the documented order', () => {
    const plan = planAccountMerge(
      account({ id: 88001, status: MERGED_STATUS, kycLevel: 20 }),
      account({ id: 88001, status: MERGED_STATUS, kycLevel: 30 }),
      'current',
    );
    expect(plan.errors).toEqual([
      'An account cannot be merged with itself.',
      'Account 88001 is already merged.',
      'The account that stays (88001) has KYC level 20; the other account has 30. ' +
        'Keep the account with the higher KYC level.',
    ]);
  });
});
