import type { RouteClaim } from './types';

/**
 * Compliance-area routes claimed by this lane.
 * Paths must match App.tsx React-Router paths exactly (23 total).
 */
const claims: RouteClaim[] = [
  // Display / overview routes → compliance.spec.ts
  { path: '/compliance', spec: 'compliance.spec.ts' },
  { path: '/compliance/user/:id', spec: 'compliance.spec.ts' },
  { path: '/compliance/user/:id/kyc-step/:stepId', spec: 'compliance.spec.ts' },
  { path: '/compliance/user/:id/support-issue/:issueId', spec: 'compliance.spec.ts' },
  { path: '/compliance/recommendations/:id', spec: 'compliance.spec.ts' },
  { path: '/compliance/scorechain/user/:id', spec: 'compliance.spec.ts' },
  { path: '/compliance/kyc-files', spec: 'compliance.spec.ts' },
  { path: '/compliance/kyc-files/details', spec: 'compliance.spec.ts' },
  { path: '/compliance/kyc-stats', spec: 'compliance.spec.ts' },
  { path: '/compliance/transactions', spec: 'compliance.spec.ts' },
  { path: '/compliance/custody-orders', spec: 'compliance.spec.ts' },
  { path: '/compliance/mros', spec: 'compliance.spec.ts' },
  { path: '/compliance/mros/:id', spec: 'compliance.spec.ts' },
  { path: '/compliance/recalls', spec: 'compliance.spec.ts' },
  { path: '/compliance/call-queues', spec: 'compliance.spec.ts' },
  { path: '/sitemap', spec: 'compliance.spec.ts' },

  // Write / decision routes → compliance-cases.spec.ts
  { path: '/compliance/user/:id/kyc', spec: 'compliance-cases.spec.ts' },
  { path: '/compliance/bank-tx/:id', spec: 'compliance-cases.spec.ts' },
  { path: '/compliance/bank-tx/:id/recall', spec: 'compliance-cases.spec.ts' },
  { path: '/compliance/bank-tx/:id/return', spec: 'compliance-cases.spec.ts' },
  { path: '/compliance/mros/create', spec: 'compliance-cases.spec.ts' },
  { path: '/compliance/call-queues/:queue', spec: 'compliance-cases.spec.ts' },
  { path: '/compliance/call-queues/:queue/:userDataId', spec: 'compliance-cases.spec.ts' },
];

export default claims;
