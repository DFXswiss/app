import type { RouteClaim } from './types';

const claims: RouteClaim[] = [
  { path: '/kyc', spec: 'kyc.spec.ts' },
  { path: '/kyc/log', spec: 'kyc.spec.ts' },
  { path: '/kyc/redirect', spec: 'kyc.spec.ts' },
  { path: '/profile', spec: 'kyc.spec.ts' },
  { path: '/contact', spec: 'kyc.spec.ts' },
  { path: '/link', spec: 'kyc.spec.ts' },
  { path: '/staff-kyc-required', spec: 'kyc.spec.ts' },
  { path: '/file/:id', spec: 'kyc.spec.ts' },
  { path: '/file/download', spec: 'kyc.spec.ts' },
];

export default claims;
