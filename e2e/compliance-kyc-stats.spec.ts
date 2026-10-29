import { test, expect, APIRequestContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createTestCredentials } from './test-wallet';

dotenv.config({ path: path.join(__dirname, '../.env') });

const API_URL = process.env.REACT_APP_API_URL! + '/v1';

// Expected KYC stats data from PRD (as of 2026-02-04)
const EXPECTED_KYC_STATS = {
  2021: { startCount: 0, reopened: 0, newFiles: 250, addedDuringYear: 250, activeDuringYear: 250, closedDuringYear: 0, endCount: 250, highestFileNr: 250 },
  2022: { startCount: 250, reopened: 0, newFiles: 1947, addedDuringYear: 1947, activeDuringYear: 2197, closedDuringYear: 5, endCount: 2192, highestFileNr: 2197 },
  2023: { startCount: 2192, reopened: 0, newFiles: 509, addedDuringYear: 509, activeDuringYear: 2701, closedDuringYear: 2127, endCount: 574, highestFileNr: 2706 },
  2024: { startCount: 574, reopened: 87, newFiles: 611, addedDuringYear: 698, activeDuringYear: 1272, closedDuringYear: 253, endCount: 1019, highestFileNr: 3317 },
  2025: { startCount: 1019, reopened: 8, newFiles: 2022, addedDuringYear: 2030, activeDuringYear: 3049, closedDuringYear: 2, endCount: 3047, highestFileNr: 5339 },
};

function getAdminSeed(): string {
  const apiEnvPath = path.join(__dirname, '../../api/.env');
  if (!fs.existsSync(apiEnvPath)) {
    throw new Error(`API .env file not found at ${apiEnvPath}. Run 'npm run setup' in the API directory first.`);
  }
  const content = fs.readFileSync(apiEnvPath, 'utf8');
  const match = content.match(/^ADMIN_SEED=(.*)$/m);
  if (!match || !match[1]) {
    throw new Error('ADMIN_SEED not found in API .env file. Run "npm run setup" in the API directory first.');
  }
  return match[1];
}

async function getAdminAuth(request: APIRequestContext): Promise<string> {
  const adminSeed = getAdminSeed();
  const credentials = await createTestCredentials(adminSeed);

  const response = await request.post(`${API_URL}/auth`, {
    data: credentials,
  });

  if (!response.ok()) {
    const body = await response.text().catch(() => 'unknown');
    throw new Error(`Admin auth failed: ${response.status()} - ${body}`);
  }

  const data = await response.json();
  return data.accessToken;
}

test.describe('KYC Stats Page - Smoke Test', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getAdminAuth(request);
  });

  test('page loads and shows table with API data', async ({ page }) => {
    await page.goto(`/compliance/kyc-stats?session=${token}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Verify table is visible
    await expect(page.getByText('As of 31.12.:')).toBeVisible();

    // Verify row labels are present
    await expect(page.getByText('KYC files managed on 01.01.xxxx')).toBeVisible();
    await expect(page.getByText('KYC files managed on 31.12.20xx')).toBeVisible();

    // Take screenshot
    await page.screenshot({
      path: 'e2e/test-results/kyc-stats-smoke-test.png',
      fullPage: true,
    });

    console.log('Screenshot saved to e2e/test-results/kyc-stats-smoke-test.png');
  });

  test('verifies KYC stats data matches expected PRD values', async ({ request }) => {
    const response = await request.get(`${API_URL}/support/kycFileStats`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.ok()).toBeTruthy();
    const stats = await response.json();

    // Verify data for each year
    for (const yearStats of stats) {
      const year = yearStats.year as keyof typeof EXPECTED_KYC_STATS;
      const expected = EXPECTED_KYC_STATS[year];

      if (expected) {
        expect(yearStats.startCount, `${year} startCount`).toBe(expected.startCount);
        expect(yearStats.reopened, `${year} reopened`).toBe(expected.reopened);
        expect(yearStats.newFiles, `${year} newFiles`).toBe(expected.newFiles);
        expect(yearStats.addedDuringYear, `${year} addedDuringYear`).toBe(expected.addedDuringYear);
        expect(yearStats.activeDuringYear, `${year} activeDuringYear`).toBe(expected.activeDuringYear);
        expect(yearStats.closedDuringYear, `${year} closedDuringYear`).toBe(expected.closedDuringYear);
        expect(yearStats.endCount, `${year} endCount`).toBe(expected.endCount);
        expect(yearStats.highestFileNr, `${year} highestFileNr`).toBe(expected.highestFileNr);
      }
    }
  });
});
