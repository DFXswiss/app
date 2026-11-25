import type { Locator, Page } from '@playwright/test';

// A redirect target outside the stack. The harness answers every non-stack host with an empty 200
// (see isolateFromExternalHosts), so a redirect to it loads without any interception here. It must
// be https: isSafeRedirectUri only accepts plain http for localhost/127.0.0.1, and the frontend is
// served over http on a stack host.
export const PARTNER_RETURN_URI = 'https://partner-wallet.e2e.test/return/';

/**
 * The header back button. It has no accessible name; it is the only `absolute left-4` button in
 * the navigation bar (see BackButton in src/components/navigation.tsx).
 */
export function headerBackButton(page: Page): Locator {
  return page.locator('div.h-14 > button.absolute.left-4');
}
