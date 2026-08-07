import { RouteClaim } from './types';

const claims: RouteClaim[] = [
  { path: '/kyc', spec: 'specs/kyc.spec.ts' },
  { path: '/kyc/log', spec: 'specs/kyc.spec.ts' },
  { path: '/kyc/redirect', spec: 'specs/kyc.spec.ts' },
  { path: '/profile', spec: 'specs/kyc.spec.ts' },
  { path: '/contact', spec: 'specs/kyc.spec.ts' },
  { path: '/link', spec: 'specs/kyc.spec.ts' },
  { path: '/staff-kyc-required', spec: 'specs/kyc.spec.ts' },
  { path: '/file/:id', spec: 'specs/kyc.spec.ts' },
  { path: '/file/download', spec: 'specs/kyc.spec.ts' },
];

export default claims;
