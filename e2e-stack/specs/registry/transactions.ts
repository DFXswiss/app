import type { RouteClaim } from './types';

const claims: RouteClaim[] = [
  { path: '/tx', spec: 'transactions.spec.ts' },
  { path: '/tx/:id', spec: 'transactions.spec.ts' },
  { path: '/tx/:id/assign', spec: 'transactions.spec.ts' },
  { path: '/tx/:id/refund', spec: 'transactions.spec.ts' },
];

export default claims;
