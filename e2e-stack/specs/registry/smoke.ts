import { RouteClaim } from './types';

// The smoke spec proves the harness itself works end to end — frontend, API, database, both login
// paths. It navigates to `/`, but does not claim it: `/` is covered as a screen by auth.spec.ts, and
// the gate treats a route claimed twice as an error so the split between suites stays unambiguous.
const claims: RouteClaim[] = [];

export default claims;
