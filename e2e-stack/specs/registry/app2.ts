import type { RouteClaim } from './types';

const claims: RouteClaim[] = [
  {
    path: '/app2/',
    spec: 'app2.spec.ts',
    hosted: true,
    note:
      'DFX App 2.0 artifact, served next to the main app. Partner widget-param with/without cases live in app2-widget-params.spec.ts',
  },
];

export default claims;
