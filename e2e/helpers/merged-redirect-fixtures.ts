import { Route } from '@playwright/test';

// Matches the @dfx.swiss/core KycInfo shape (kycLevel, tradingLimit, language, kycSteps,
// kycClients all required) so the /kyc screen the redirect lands on can render without an
// undefined-field crash — a prior version of this fixture omitted these and passed the test
// while silently crashing the destination screen.
export const kycInfoFixture = {
  kycLevel: 0,
  tradingLimit: { limit: 500000, period: 'Day' },
  language: { id: 1, name: 'English', symbol: 'EN', foreignName: 'English', enable: true },
  kycSteps: [],
  kycClients: [],
};

export async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}
