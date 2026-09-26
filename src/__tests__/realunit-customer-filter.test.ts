import { RealUnitCustomerListDto } from 'src/dto/realunit-compliance.dto';
import { filterCustomers } from 'src/util/realunit-customer-filter';

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
