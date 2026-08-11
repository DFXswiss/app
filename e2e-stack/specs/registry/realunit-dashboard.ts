import type { RouteClaim } from './types';

const claims: RouteClaim[] = [
  { path: '/realunit', spec: 'realunit.spec.ts' },
  { path: '/realunit/holders', spec: 'realunit.spec.ts' },
  { path: '/realunit/quotes', spec: 'realunit.spec.ts' },
  { path: '/realunit/quotes/:id', spec: 'realunit.spec.ts' },
  { path: '/realunit/transactions', spec: 'realunit.spec.ts' },
  { path: '/realunit/transactions/:id', spec: 'realunit.spec.ts' },
  { path: '/realunit/user/:address', spec: 'realunit.spec.ts' },
  { path: '/realunit/support', spec: 'realunit.spec.ts' },
  { path: '/realunit/support/issue/:id', spec: 'realunit.spec.ts' },
  { path: '/realunit/compliance', spec: 'realunit.spec.ts' },
  { path: '/realunit/compliance/user/:id', spec: 'realunit.spec.ts' },
  { path: '/dashboard', spec: 'dashboard-financial.spec.ts' },
  { path: '/dashboard/financial', spec: 'dashboard-financial.spec.ts' },
  { path: '/dashboard/financial/overview', spec: 'dashboard-financial.spec.ts' },
  { path: '/dashboard/financial/live', spec: 'dashboard-financial.spec.ts' },
  { path: '/dashboard/financial/history', spec: 'dashboard-financial.spec.ts' },
  { path: '/dashboard/financial/history/expenses', spec: 'dashboard-financial.spec.ts' },
  { path: '/dashboard/financial/liquidity', spec: 'dashboard-financial.spec.ts' },
  { path: '/dashboard/financial/log-validity', spec: 'dashboard-financial.spec.ts' },
];

export default claims;
