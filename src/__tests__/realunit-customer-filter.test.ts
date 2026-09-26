import { RealUnitCustomerListDto } from 'src/dto/realunit-compliance.dto';
import { filterCustomers, isBalanceFilter, isInsiderFilter } from 'src/util/realunit-customer-filter';

const customer = (overrides: Partial<RealUnitCustomerListDto>): RealUnitCustomerListDto => ({
  id: 1,
  kycStatus: 'NA',
  canScreen: false,
  realUnitInsider: false,
  ...overrides,
});

describe('filterCustomers', () => {
  const withBalance = customer({ id: 1, balance: 3, realUnitInsider: false });
  const withoutBalance = customer({ id: 2, balance: 0, realUnitInsider: true });
  const unresolved = customer({ id: 3, realUnitInsider: false });
  const rows = [withBalance, withoutBalance, unresolved];

  it('keeps every row when both filters are all', () => {
    expect(filterCustomers(rows, 'all', 'all')).toEqual(rows);
  });

  it('keeps only resolved positive balances', () => {
    expect(filterCustomers(rows, 'with', 'all')).toEqual([withBalance]);
  });

  it('keeps only a resolved zero balance', () => {
    expect(filterCustomers(rows, 'without', 'all')).toEqual([withoutBalance]);
  });

  it('keeps only insiders', () => {
    expect(filterCustomers(rows, 'all', 'insider')).toEqual([withoutBalance]);
  });

  it('keeps only non-insiders', () => {
    expect(filterCustomers(rows, 'all', 'normal')).toEqual([withBalance, unresolved]);
  });
});

describe('isBalanceFilter', () => {
  it('accepts all, with, and without', () => {
    expect(isBalanceFilter('all')).toBe(true);
    expect(isBalanceFilter('with')).toBe(true);
    expect(isBalanceFilter('without')).toBe(true);
  });

  it('rejects unknown values', () => {
    expect(isBalanceFilter('')).toBe(false);
    expect(isBalanceFilter('WITH')).toBe(false);
    expect(isBalanceFilter('foo')).toBe(false);
    expect(isBalanceFilter('yes')).toBe(false);
  });
});

describe('isInsiderFilter', () => {
  it('accepts all, insider, and normal', () => {
    expect(isInsiderFilter('all')).toBe(true);
    expect(isInsiderFilter('insider')).toBe(true);
    expect(isInsiderFilter('normal')).toBe(true);
  });

  it('rejects unknown values', () => {
    expect(isInsiderFilter('')).toBe(false);
    expect(isInsiderFilter('WITH')).toBe(false);
    expect(isInsiderFilter('foo')).toBe(false);
    expect(isInsiderFilter('yes')).toBe(false);
  });
});
