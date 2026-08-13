import type { RouteClaim } from './types';

const claims: RouteClaim[] = [
  {
    path: '/app2/',
    spec: 'app2.spec.ts',
    hosted: true,
    note: 'DFX App 2.0 artifact, served next to the main app',
  },
];

export default claims;
