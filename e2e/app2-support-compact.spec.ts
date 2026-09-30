import { test, expect, Page } from '@playwright/test';
import { getCachedAuth } from './helpers/auth-cache';

/**
 * App2 support layout captures against the local authenticated stack.
 * No profile or support API response is intercepted or synthesized. Do not point this visual
 * test at production: the authenticated account's support data is real API state.
 */
const APP2_URL = process.env.E2E_APP2_URL ?? 'http://localhost:3001/app2/';

let token: string;

test.beforeAll(async ({ request }) => {
  const auth = await getCachedAuth(request, 'evm');
  token = auth.token;
});

async function openSupport(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => localStorage.setItem('dfx_lang', 'en'));
  const url = `${APP2_URL}?session=${encodeURIComponent(token)}&lang=en#/support`;
  const route = `${new URL(APP2_URL).pathname}#/support`;
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {
    throw new Error(`${route} navigation failed`);
  });
  expect(response, `${route} must be served`).toBeTruthy();
  expect(response?.ok(), `${route} status ${response?.status()}`).toBe(true);
  await expect(page.getByTestId('support-contact-list')).toBeVisible();
}

for (const viewport of [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`support contact actions and ticket sheet fit at ${viewport.name} width`, async ({ page }) => {
    await openSupport(page, viewport);

    const contacts = page.getByTestId('support-contact-list');
    const contactLinks = [
      page.locator('a[href="mailto:support@dfx.swiss"]'),
      page.locator('a[href="https://docs.dfx.swiss/"]'),
      page.locator('a[href="https://x.com/DFX_Swiss"]'),
    ];
    await expect(contacts.locator('a')).toHaveCount(3);
    for (const link of contactLinks) await expect(link).toBeVisible();

    const ticketAction = page.getByRole('button', { name: /create a support ticket/i });
    const primaryBox = await ticketAction.boundingBox();
    expect(primaryBox).not.toBeNull();
    if (!primaryBox) throw new Error('Primary support ticket action has no layout box');
    expect(primaryBox.height).toBeGreaterThan(56);

    const contactBoxes = await Promise.all(contactLinks.map((link) => link.boundingBox()));
    for (const [index, box] of contactBoxes.entries()) {
      expect(box, `contact row ${index + 1} must have a layout box`).not.toBeNull();
      if (!box) throw new Error(`Contact row ${index + 1} has no layout box`);
      expect(box.height, `contact row ${index + 1} height`).toBeGreaterThanOrEqual(44);
      expect(box.height, `contact row ${index + 1} height`).toBeLessThanOrEqual(56);
      expect(box.x, `contact row ${index + 1} left edge`).toBeGreaterThanOrEqual(0);
      expect(viewport.width - box.x - box.width, `contact row ${index + 1} right inset`).toBeGreaterThanOrEqual(0);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
      'support page must not overflow horizontally',
    ).toBe(0);

    await expect(contacts).toHaveScreenshot(`app2-support-contact-${viewport.name}.png`);

    await ticketAction.click();
    const sheet = page.getByRole('dialog', { name: 'New support ticket' });
    await expect(sheet).toBeVisible();
    const sheetBox = await sheet.boundingBox();
    expect(sheetBox).not.toBeNull();
    if (!sheetBox) throw new Error('Support ticket sheet has no layout box');

    const insetBoxes = await sheet
      .locator(
        '[data-testid="support-ticket-lead"], form label, form select, form input, form textarea, form button[type="submit"]',
      )
      .evaluateAll((elements) =>
        elements.map((element) => {
          const { left, right } = element.getBoundingClientRect();
          return { left, right };
        }),
      );
    expect(insetBoxes.length).toBeGreaterThanOrEqual(8);
    for (const [index, box] of insetBoxes.entries()) {
      expect(box.left - sheetBox.x, `ticket content ${index + 1} left inset`).toBeGreaterThanOrEqual(16);
      expect(sheetBox.x + sheetBox.width - box.right, `ticket content ${index + 1} right inset`).toBeGreaterThanOrEqual(16);
    }
    await expect(sheet).toHaveScreenshot(`app2-support-sheet-${viewport.name}.png`);
  });
}
