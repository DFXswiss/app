import { RealUnitCustomerListDto } from 'src/dto/realunit-compliance.dto';

export type BalanceFilter = 'all' | 'with' | 'without';
export type InsiderFilter = 'all' | 'insider' | 'normal';

export function isBalanceFilter(value: string): value is BalanceFilter {
  return value === 'all' || value === 'with' || value === 'without';
}

export function isInsiderFilter(value: string): value is InsiderFilter {
  return value === 'all' || value === 'insider' || value === 'normal';
}

// Presentation-only filtering after an explicit load. The API still returns the complete tenant
// scope when asked; these helpers only decide which loaded rows are shown.
export function matchesBalanceFilter(customer: RealUnitCustomerListDto, filter: BalanceFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'with') return customer.balance != null && customer.balance > 0;
  return customer.balance === 0;
}

export function matchesInsiderFilter(customer: RealUnitCustomerListDto, filter: InsiderFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'insider') return customer.realUnitInsider === true;
  return customer.realUnitInsider !== true;
}

export function filterCustomers(
  customers: RealUnitCustomerListDto[],
  balance: BalanceFilter,
  insider: InsiderFilter,
): RealUnitCustomerListDto[] {
  return customers.filter((c) => matchesBalanceFilter(c, balance) && matchesInsiderFilter(c, insider));
}
