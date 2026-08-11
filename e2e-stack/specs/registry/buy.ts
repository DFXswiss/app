import type { RouteClaim } from './types';

const claims: RouteClaim[] = [
  { path: '/buy', spec: 'buy.spec.ts' },
  { path: '/buy/info', spec: 'buy.spec.ts' },
  { path: '/buy/success', spec: 'buy.spec.ts' },
  { path: '/buy/failure', spec: 'buy.spec.ts' },
  { path: '/buy/personal-iban', spec: 'buy.spec.ts' },
  { path: '/buyCrypto/update', spec: 'buy.spec.ts' },
];

export default claims;
