import type { RouteClaim } from './types';

const claims: RouteClaim[] = [
  { path: '/', spec: 'auth.spec.ts' },
  { path: '/login', spec: 'auth.spec.ts' },
  { path: '/login/mail', spec: 'auth.spec.ts' },
  { path: '/login/wallet', spec: 'auth.spec.ts' },
  { path: '/connect', spec: 'auth.spec.ts' },
  { path: '/mail-login', spec: 'auth.spec.ts' },
  { path: '/2fa', spec: 'auth.spec.ts' },
  { path: '/account-merge', spec: 'auth.spec.ts' },
  { path: '/account', spec: 'account.spec.ts' },
  { path: '/account/mail', spec: 'account.spec.ts' },
  { path: '/settings', spec: 'account.spec.ts' },
  { path: '/safe', spec: 'account.spec.ts' },
  { path: '/recommendation', spec: 'account.spec.ts' },
];

export default claims;
