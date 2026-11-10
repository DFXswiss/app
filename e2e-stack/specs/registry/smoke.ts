import type { RouteClaim } from './types';

// The smoke spec proves the frontend shell and that GET /v1/asset returns a non-empty list.
// Login stays in auth.spec.ts and cross-cutting.spec.ts. It navigates to `/`, but does not
// claim it: `/` is covered as a screen by auth.spec.ts, and the gate treats a route claimed
// twice as an error so the split between suites stays unambiguous.
const claims: RouteClaim[] = [];

export default claims;
