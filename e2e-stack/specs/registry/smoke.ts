import type { RouteClaim } from './types';

// The smoke spec proves the frontend shell, the document head, the static files the harness
// frontend serves (/manifest.json, /version.json, /robots.txt, /favicon.ico), and that
// GET /v1/asset returns a non-empty list. Those static fetches are not App.tsx routes.
// Login stays in auth.spec.ts and cross-cutting.spec.ts. The spec navigates to `/`, but does
// not claim it: `/` is covered as a screen by auth.spec.ts, and the gate treats a route claimed
// twice as an error so the split between suites stays unambiguous.
const claims: RouteClaim[] = [];

export default claims;
