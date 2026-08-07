import { RouteClaim } from './types';

const claims: RouteClaim[] = [
  { path: '/', spec: 'specs/auth.spec.ts' },
  { path: '/login', spec: 'specs/auth.spec.ts' },
  { path: '/login/mail', spec: 'specs/auth.spec.ts' },
  { path: '/login/wallet', spec: 'specs/auth.spec.ts' },
  { path: '/connect', spec: 'specs/auth.spec.ts' },
  { path: '/mail-login', spec: 'specs/auth.spec.ts' },
  { path: '/2fa', spec: 'specs/auth.spec.ts' },
  { path: '/account-merge', spec: 'specs/auth.spec.ts' },
  { path: '/account', spec: 'specs/account.spec.ts' },
  { path: '/account/mail', spec: 'specs/account.spec.ts' },
  { path: '/settings', spec: 'specs/account.spec.ts' },
  { path: '/safe', spec: 'specs/account.spec.ts' },
  { path: '/recommendation', spec: 'specs/account.spec.ts' },
];

export default claims;
