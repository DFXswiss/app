import type { RouteClaim } from './types';

/** Partner-area routes. Paths must match App.tsx React-Router paths exactly. */
const claims: RouteClaim[] = [{ path: '/partner/onboarding-fee', spec: 'partner.spec.ts' }];

export default claims;
