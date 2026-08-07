import type { RouteClaim } from './types';

const claims: RouteClaim[] = [
  { path: '/routes', spec: 'payment-links.spec.ts' },
  { path: '/pl', spec: 'payment-links.spec.ts' },
  { path: '/pl/assign', spec: 'payment-links.spec.ts' },
  { path: '/pl/pos', spec: 'payment-links.spec.ts' },
  { path: '/pl/result', spec: 'payment-links.spec.ts' },
  { path: '/payment-link', spec: 'payment-links.spec.ts' },
  { path: '/invoice', spec: 'payment-links.spec.ts' },
];

export default claims;
