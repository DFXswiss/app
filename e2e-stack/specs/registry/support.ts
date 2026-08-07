import type { RouteClaim } from './types';

const claims: RouteClaim[] = [
  { path: '/support', spec: 'support.spec.ts' },
  { path: '/support/tickets', spec: 'support.spec.ts' },
  { path: '/support/issue', spec: 'support.spec.ts' },
  { path: '/support/chat', spec: 'support.spec.ts' },
  { path: '/support/chat/:id', spec: 'support.spec.ts' },
  { path: '/support/dashboard', spec: 'support-dashboard.spec.ts' },
  { path: '/support/dashboard/all', spec: 'support-dashboard.spec.ts' },
  { path: '/support/dashboard/create', spec: 'support-dashboard.spec.ts' },
  { path: '/support/dashboard/issue/:id', spec: 'support-dashboard.spec.ts' },
  { path: '/support/user/:id', spec: 'support-dashboard.spec.ts' },
  { path: '/notes', spec: 'support-dashboard.spec.ts' },
  { path: '/templates', spec: 'support-dashboard.spec.ts' },
];

export default claims;
