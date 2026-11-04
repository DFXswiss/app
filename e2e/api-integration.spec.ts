import { test, expect } from '@playwright/test';

test.describe('API Integration', () => {
  test('should fetch assets from API', async ({ page }) => {
    const apiCalls: string[] = [];
    
    page.on('response', (response) => {
      if (response.url().includes('api.dfx.swiss')) {
        apiCalls.push(response.url());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Should have made API calls
    const assetCall = apiCalls.find(url => url.includes('/asset'));
    expect(assetCall).toBeTruthy();
  });

  test('should fetch country data from API', async ({ page }) => {
    const apiCalls: string[] = [];
    
    page.on('response', (response) => {
      if (response.url().includes('/country')) {
        apiCalls.push(response.url());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    expect(apiCalls.length).toBeGreaterThan(0);
  });

  test('should fetch language data from API', async ({ page }) => {
    const apiCalls: string[] = [];
    
    page.on('response', (response) => {
      if (response.url().includes('/language')) {
        apiCalls.push(response.url());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    expect(apiCalls.length).toBeGreaterThan(0);
  });

  test('should fetch fiat data from API', async ({ page }) => {
    const apiCalls: string[] = [];
    
    page.on('response', (response) => {
      if (response.url().includes('/fiat')) {
        apiCalls.push(response.url());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    expect(apiCalls.length).toBeGreaterThan(0);
  });

  test('should handle API errors gracefully', async ({ page }) => {
    // Intercept and fail an API call
    await page.route('**/api.dfx.swiss/**/statistic', route => {
      route.abort('failed');
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Page should still be functional
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Static Assets', () => {
  test('should load favicon', async ({ page }) => {
    const response = await page.goto('/favicon.ico');
    expect(response?.status()).toBeLessThan(400);
  });

  test('should load manifest.json', async ({ page }) => {
    const response = await page.goto('/manifest.json');
    expect(response?.status()).toBe(200);
    
    const manifest = await response?.json();
    expect(manifest).toHaveProperty('name');
  });

  test('should load version.json', async ({ page }) => {
    const response = await page.goto('/version.json');
    expect(response?.status()).toBe(200);
    
    const version = await response?.json();
    expect(version).toHaveProperty('version');
    expect(version).toHaveProperty('commit');
  });

  test('should load robots.txt', async ({ page }) => {
    const response = await page.goto('/robots.txt');
    expect(response?.status()).toBe(200);
  });

});

test.describe('External Resources', () => {
  test('should load the self-hosted Inter font and nothing from Google Fonts', async ({ page, baseURL }) => {
    const fontRequests: string[] = [];
    const googleRequests: string[] = [];

    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
        googleRequests.push(url);
      } else if (request.resourceType() === 'font') {
        fontRequests.push(url);
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(googleRequests).toEqual([]);
    expect(fontRequests.some((url) => url.startsWith(`${baseURL}/`) && /inter-.*\.woff2/.test(url))).toBe(true);
  });

  test('should load DFX images', async ({ page }) => {
    const imageRequests: string[] = [];
    
    page.on('request', (request) => {
      if (request.url().includes('dfx.swiss/images')) {
        imageRequests.push(request.url());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    expect(imageRequests.length).toBeGreaterThan(0);
  });
});
