import type { RouteClaim } from './types';

const claims: RouteClaim[] = [
  { path: '/sell', spec: 'sell-swap.spec.ts' },
  { path: '/sell/info', spec: 'sell-swap.spec.ts' },
  { path: '/swap', spec: 'sell-swap.spec.ts' },
  { path: '/sepa', spec: 'sepa-misc.spec.ts' },
  { path: '/sepa/manual', spec: 'sepa-misc.spec.ts' },
  { path: '/stickers', spec: 'sepa-misc.spec.ts' },
  { path: '/blockchain/tx', spec: 'sepa-misc.spec.ts' },
];

export default claims;
