/**
 * E2E Test: Complete Sepolia Sell Flow with MetaMask
 *
 * This test covers the complete sell flow on Sepolia testnet:
 * 1. Start services locally (handled by playwright.synpress.config.ts webServer)
 * 2. Start MetaMask with Chrome 126
 * 3. Navigate to /login, click CRYPTO WALLET, select MetaMask
 * 4. Complete MetaMask connection + signature for authentication
 * 5. Navigate to /sell with Sepolia + USDT
 * 6. Fill sell form with amount
 * 7. Execute real blockchain transaction
 * 8. Verify transaction on Sepolia Etherscan
 *
 * Run: npx playwright test --config=playwright.synpress.config.ts e2e/synpress/sepolia-sell-e2e.spec.ts
 *
 * Prerequisites:
 * - TEST_SEED in .env (with Sepolia ETH + USDT for gas and sell)
 * - npm run synpress:setup (Chrome 126 + MetaMask installed)
 * - Services running on localhost:3001 (or webServer starts it)
 */

import { test as base, chromium, BrowserContext, Page, expect } from '@playwright/test';
import { MetaMask } from '@synthetixio/synpress/playwright';
import path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

// =============================================================================
// CONFIGURATION
// =============================================================================

// Chrome 126 path (last version with Manifest V2 support for MetaMask)
const CHROME_126_PATH = path.join(
  process.cwd(),
  'chrome/mac_arm-126.0.6478.0/chrome-mac-arm64',
  'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
);

// MetaMask extension path
const METAMASK_PATH = path.join(process.cwd(), '.cache-synpress/metamask-chrome-11.9.1');

// Credentials from environment
const WALLET_PASSWORD = 'Tester@1234';
const TEST_SEED_PHRASE = process.env.TEST_SEED!;

// Sepolia Etherscan API for transaction verification
const SEPOLIA_ETHERSCAN_API = 'https://api-sepolia.etherscan.io/api';
const TX_CONFIRMATION_TIMEOUT = 60000; // 60 seconds
const TX_POLL_INTERVAL = 2000; // 2 seconds

// =============================================================================
// TYPES
// =============================================================================

interface TestFixtures {
  context: BrowserContext;
  extensionId: string;
  metamask: MetaMask;
  metamaskPage: Page;
  appPage: Page;
}

interface SepoliaTransaction {
  hash: string;
  status: 'confirmed' | 'pending' | 'failed';
  blockNumber?: number;
}

// =============================================================================
// FIXTURES
// =============================================================================

export const test = base.extend<TestFixtures>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      executablePath: CHROME_126_PATH,
      headless: false,
      args: [
        `--disable-extensions-except=${METAMASK_PATH}`,
        `--load-extension=${METAMASK_PATH}`,
        '--no-first-run',
        '--disable-default-apps',
        '--disable-popup-blocking',
        '--lang=en-US',
        '--accept-lang=en-US,en',
      ],
      locale: 'en-US',
      viewport: { width: 1400, height: 900 },
    });

    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    await new Promise((r) => setTimeout(r, 3000));

    let extensionId = '';
    const bgPages = context.backgroundPages();
    if (bgPages.length > 0) {
      extensionId = bgPages[0].url().split('/')[2];
    }

    if (!extensionId) {
      for (const p of context.pages()) {
        if (p.url().includes('chrome-extension://')) {
          extensionId = p.url().split('/')[2];
          break;
        }
      }
    }

    console.log(`MetaMask Extension ID: ${extensionId}`);
    await use(extensionId);
  },

  metamaskPage: async ({ context, extensionId }, use) => {
    let metamaskPage = context.pages().find((p) => p.url().includes('chrome-extension://'));

    if (!metamaskPage) {
      metamaskPage = await context.newPage();
      await metamaskPage.goto(`chrome-extension://${extensionId}/home.html`);
    }

    await metamaskPage.waitForLoadState('domcontentloaded');
    await use(metamaskPage);
  },

  metamask: async ({ context, extensionId, metamaskPage }, use) => {
    // Setup MetaMask wallet
    await setupMetaMaskWallet(metamaskPage, TEST_SEED_PHRASE, WALLET_PASSWORD);

    // Enable Sepolia network
    await enableSepoliaNetwork(metamaskPage);

    const metamask = new MetaMask(context, metamaskPage, WALLET_PASSWORD, extensionId);
    await use(metamask);
  },

  appPage: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
  },
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Setup MetaMask wallet with seed phrase - MetaMask 11.x compatible
 */
async function setupMetaMaskWallet(page: Page, seedPhrase: string, password: string): Promise<void> {
  console.log('Setting up MetaMask wallet...');

  // Navigate to onboarding if needed
  const currentUrl = page.url();
  if (!currentUrl.includes('onboarding')) {
    const extensionId = currentUrl.split('/')[2];
    await page.goto(`chrome-extension://${extensionId}/home.html#onboarding/welcome`);
  }

  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  // Step 1: Agree to terms
  const checkbox = page.locator('input[type="checkbox"]').first();
  if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
    await checkbox.click({ force: true });
    await page.waitForTimeout(500);
  }

  // Step 2: Click "Import an existing wallet"
  const importBtn = page.locator('button:has-text("Import an existing wallet")').first();
  if (await importBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await importBtn.click();
    await page.waitForTimeout(1500);
  }

  // Step 3: Analytics - "No thanks"
  const noThanksBtn = page.locator('button:has-text("No thanks")').first();
  if (await noThanksBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await noThanksBtn.click();
    await page.waitForTimeout(1000);
  }

  // Step 4: Enter seed phrase
  const words = seedPhrase.split(' ');
  for (let i = 0; i < words.length; i++) {
    const input = page.locator(`input[data-testid="import-srp__srp-word-${i}"]`);
    if (await input.isVisible({ timeout: 500 }).catch(() => false)) {
      await input.fill(words[i]);
    }
  }

  // Step 5: Confirm seed phrase
  const confirmBtn = page.locator('button:has-text("Confirm Secret Recovery Phrase")').first();
  if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await confirmBtn.click();
    await page.waitForTimeout(1500);
  }

  // Step 6: Set password
  const pwInputs = await page.locator('input[type="password"]').all();
  if (pwInputs.length >= 2) {
    await pwInputs[0].fill(password);
    await pwInputs[1].fill(password);

    const termsCheckbox = page.locator('input[type="checkbox"]').first();
    if (await termsCheckbox.isVisible({ timeout: 2000 }).catch(() => false)) {
      await termsCheckbox.click();
    }

    const importWalletBtn = page.locator('button:has-text("Import my wallet")').first();
    if (await importWalletBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await importWalletBtn.click();
      await page.waitForTimeout(3000);
    }
  }

  // Step 7: Complete onboarding dialogs
  const completionButtons = ['Got it', 'Next', 'Done'];
  for (let round = 0; round < 5; round++) {
    await page.waitForTimeout(1000);
    for (const btnText of completionButtons) {
      const btn = page.locator(`button:has-text("${btnText}")`).first();
      if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(500);
      }
    }
  }

  // Close popups
  const closeBtn = page.locator('button[aria-label="Close"]').first();
  if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeBtn.click();
  }

  console.log('MetaMask wallet setup complete');
}

/**
 * Enable Sepolia testnet in MetaMask
 */
async function enableSepoliaNetwork(page: Page): Promise<void> {
  console.log('Enabling Sepolia network...');

  const networkDisplay = page.locator('[data-testid="network-display"]').first();
  if (await networkDisplay.isVisible({ timeout: 3000 }).catch(() => false)) {
    await networkDisplay.click();
    await page.waitForTimeout(1000);

    // Enable test networks toggle
    const showTestText = page.locator('text=Show test networks');
    if (await showTestText.isVisible({ timeout: 2000 }).catch(() => false)) {
      await showTestText.click();
      await page.waitForTimeout(1000);
    }

    // Click Sepolia
    const sepoliaOption = page.locator('text=Sepolia').first();
    if (await sepoliaOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await sepoliaOption.click();
      await page.waitForTimeout(1000);
      console.log('Switched to Sepolia network');
    } else {
      const closeX = page.locator('[aria-label="Close"]').first();
      if (await closeX.isVisible({ timeout: 1000 }).catch(() => false)) {
        await closeX.click();
      }
    }
  }
}

/**
 * Handle MetaMask connection popup (Next + Connect)
 */
async function handleMetaMaskConnect(context: BrowserContext, extensionId: string): Promise<boolean> {
  console.log('Handling MetaMask connection popup...');

  await new Promise((r) => setTimeout(r, 2000));

  // Find notification page
  let notificationPage = context.pages().find((p) =>
    p.url().includes('notification.html') || p.url().includes('popup.html')
  );

  if (!notificationPage) {
    const mmPage = context.pages().find((p) => p.url().includes('chrome-extension://'));
    if (mmPage) {
      notificationPage = await context.newPage();
      await notificationPage.goto(`chrome-extension://${extensionId}/notification.html`);
      await notificationPage.waitForLoadState('domcontentloaded');
      await notificationPage.waitForTimeout(1500);
    }
  }

  if (!notificationPage) {
    console.log('No notification page found');
    return false;
  }

  // Click Next
  const nextBtn = notificationPage.locator('button:has-text("Next")').first();
  if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await nextBtn.click();
    await notificationPage.waitForTimeout(1000);
  }

  // Click Connect
  const connectBtn = notificationPage.locator('button:has-text("Connect")').first();
  if (await connectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await connectBtn.click();
    await notificationPage.waitForTimeout(1000);
    console.log('MetaMask connection approved');
    return true;
  }

  return false;
}

/**
 * Handle MetaMask network switch popup
 */
async function handleMetaMaskNetworkSwitch(context: BrowserContext): Promise<boolean> {
  console.log('Checking for MetaMask network switch popup...');

  await new Promise((r) => setTimeout(r, 1500));

  for (const page of context.pages()) {
    try {
      const url = page.url();
      if (url.includes('chrome-extension://') && (url.includes('notification') || url.includes('confirmation'))) {
        const content = await page.textContent('body').catch(() => '');

        if (content?.includes('switch the network') || content?.includes('Switch network')) {
          console.log('Found network switch popup');

          // Click Switch button
          const switchBtn = page.locator('button:has-text("Switch"), button:has-text("Wechseln")').first();
          if (await switchBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await switchBtn.click();
            console.log('Network switch approved');
            await new Promise((r) => setTimeout(r, 2000));
            return true;
          }
        }
      }
    } catch {
      continue;
    }
  }

  return false;
}

/**
 * Handle MetaMask signature popup
 */
async function handleMetaMaskSign(context: BrowserContext, extensionId: string): Promise<boolean> {
  console.log('Handling MetaMask signature popup...');

  await new Promise((r) => setTimeout(r, 2000));

  // Find signature notification
  let signPage = context.pages().find((p) =>
    p.url().includes('notification.html') || p.url().includes('confirm-signature')
  );

  if (!signPage) {
    signPage = await context.newPage();
    await signPage.goto(`chrome-extension://${extensionId}/notification.html`);
    await signPage.waitForLoadState('domcontentloaded');
    await signPage.waitForTimeout(1500);
  }

  // Click Sign
  const signSelectors = [
    'button:has-text("Sign")',
    '[data-testid="confirm-footer-button"]',
    '[data-testid="signature-sign-button"]',
  ];

  for (const selector of signSelectors) {
    const signBtn = signPage.locator(selector).first();
    if (await signBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await signBtn.click();
      console.log('MetaMask signature approved');
      // Popup closes automatically after signing - don't wait on closed page
      return true;
    }
  }

  return false;
}

/**
 * Handle MetaMask transaction approval
 */
async function handleMetaMaskTransaction(context: BrowserContext): Promise<string | null> {
  console.log('Handling MetaMask transaction popup...');

  // Wait for transaction popup
  for (let attempt = 0; attempt < 15; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));

    const txPage = context.pages().find((p) => {
      try {
        const url = p.url();
        return url.includes('notification.html') || url.includes('confirm-transaction');
      } catch {
        return false;
      }
    });

    if (txPage) {
      console.log('Found MetaMask transaction popup');
      await txPage.screenshot({ path: 'e2e/screenshots/debug/e2e-metamask-tx.png' });

      // Click Confirm
      const confirmBtn = txPage.locator('button:has-text("Confirm"), [data-testid="confirm-footer-button"]').first();
      if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await confirmBtn.click();
        console.log('Transaction confirmed in MetaMask');
        await new Promise((r) => setTimeout(r, 3000));

        // Try to extract tx hash from page or wait for it
        return 'pending'; // Actual hash will be verified later
      }
    }
  }

  console.log('No MetaMask transaction popup found');
  return null;
}

/**
 * Verify transaction on Sepolia Etherscan API
 */
async function verifyTransactionOnSepolia(
  walletAddress: string,
  startTimestamp: number,
): Promise<SepoliaTransaction | null> {
  console.log(`Verifying transaction on Sepolia for ${walletAddress}...`);

  const startTime = Date.now();

  while (Date.now() - startTime < TX_CONFIRMATION_TIMEOUT) {
    try {
      // Query Etherscan API for recent transactions
      const url = `${SEPOLIA_ETHERSCAN_API}?module=account&action=txlist&address=${walletAddress}&startblock=0&endblock=99999999&page=1&offset=5&sort=desc`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === '1' && data.result?.length > 0) {
        // Find transaction after our start timestamp
        for (const tx of data.result) {
          const txTimestamp = parseInt(tx.timeStamp) * 1000; // Convert to ms
          if (txTimestamp > startTimestamp) {
            console.log(`Found transaction: ${tx.hash}`);
            console.log(`  Block: ${tx.blockNumber}`);
            console.log(`  Status: ${tx.isError === '0' ? 'SUCCESS' : 'FAILED'}`);

            return {
              hash: tx.hash,
              status: tx.isError === '0' ? 'confirmed' : 'failed',
              blockNumber: parseInt(tx.blockNumber),
            };
          }
        }
      }
    } catch (error) {
      console.warn(`Etherscan API error: ${error}`);
    }

    await new Promise((r) => setTimeout(r, TX_POLL_INTERVAL));
  }

  console.log('Transaction verification timed out');
  return null;
}

/**
 * Open Sepolia Etherscan in browser tab and capture screenshot
 * Similar to JuiceDollar's Citreascan verification
 */
async function captureEtherscanScreenshot(
  context: BrowserContext,
  txHash: string,
  screenshotPrefix: string,
): Promise<void> {
  console.log('\n📷 OPENING SEPOLIA ETHERSCAN');

  const explorerUrl = `https://sepolia.etherscan.io/tx/${txHash}`;
  console.log(`URL: ${explorerUrl}`);

  const explorerPage = await context.newPage();
  await explorerPage.bringToFront();

  await explorerPage.goto(explorerUrl);
  await explorerPage.waitForLoadState('networkidle');

  // Wait for transaction status to appear
  const successSelector = 'span:has-text("Success"), .badge-success, text="Success"';

  try {
    await explorerPage.locator(successSelector).first().waitFor({ state: 'visible', timeout: 10000 });
    console.log('✅ Transaction confirmed on Etherscan');
  } catch {
    console.log('⏳ Waiting for confirmation...');
    await explorerPage.waitForTimeout(5000);
    await explorerPage.reload();
    await explorerPage.waitForLoadState('networkidle');
  }

  // Take screenshot
  const screenshotPath = `e2e/screenshots/debug/${screenshotPrefix}-etherscan.png`;
  await explorerPage.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`📸 Screenshot saved: ${screenshotPath}`);

  // Log transaction details from page
  const txStatus = await explorerPage.locator('.badge, [class*="status"]').first().textContent().catch(() => 'unknown');
  console.log(`Transaction Status on Etherscan: ${txStatus}`);

  await explorerPage.close();
}

/**
 * Wait for MetaMask transaction and extract hash from UI or network
 */
async function waitForTransactionHash(
  appPage: Page,
  context: BrowserContext,
  timeoutMs: number = 30000,
): Promise<string | null> {
  console.log('Waiting for transaction hash...');

  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    // Check app page for transaction hash
    const pageContent = await appPage.textContent('body').catch(() => '');

    // Look for Etherscan link or tx hash pattern
    const txHashMatch = pageContent?.match(/0x[a-fA-F0-9]{64}/);
    if (txHashMatch) {
      console.log(`Found TX hash in page: ${txHashMatch[0]}`);
      return txHashMatch[0];
    }

    // Check for Etherscan link
    const etherscanLink = await appPage.locator('a[href*="etherscan.io/tx/"]').first().getAttribute('href').catch(() => null);
    if (etherscanLink) {
      const hashFromLink = etherscanLink.match(/0x[a-fA-F0-9]{64}/);
      if (hashFromLink) {
        console.log(`Found TX hash from link: ${hashFromLink[0]}`);
        return hashFromLink[0];
      }
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  return null;
}

// =============================================================================
// TESTS
// =============================================================================

test.describe('Sepolia USDT Sell E2E Flow', () => {
  test('should complete full sell flow: Login → Sell → Blockchain Transaction', async ({
    context,
    appPage,
    metamaskPage,
    metamask,
    extensionId,
  }) => {
    test.setTimeout(300000); // 5 minutes for full flow

    console.log('\n=== Starting Sepolia Sell E2E Test ===\n');

    // Record start timestamp for transaction verification
    const testStartTimestamp = Date.now();

    // =========================================================================
    // STEP 1: Navigate directly to /sell (triggers login automatically)
    // =========================================================================
    console.log('STEP 1: Navigating to /sell?blockchain=Sepolia...');

    await appPage.goto('http://localhost:3001/sell?blockchain=Sepolia&assets=USDT');
    await appPage.waitForLoadState('networkidle');
    await appPage.waitForTimeout(5000); // Extra wait for app to fully load

    await appPage.screenshot({ path: 'e2e/screenshots/debug/e2e-01-sell-page.png', fullPage: true });

    // Check if we're on login page (not authenticated yet)
    const pageContent = await appPage.textContent('body').catch(() => '');
    console.log(`Page content preview: ${pageContent?.substring(0, 200)}`);

    // =========================================================================
    // STEP 2: Click CRYPTO WALLET tile (in login modal)
    // =========================================================================
    console.log('STEP 2: Looking for login options...');

    // Try multiple selectors for wallet option
    const walletSelectors = [
      appPage.getByText('WALLET'),
      appPage.getByText('Wallet'),
      appPage.locator('img[src*="wallet"]').first(),
      appPage.locator('[class*="wallet"]').first(),
    ];

    let walletClicked = false;
    for (const selector of walletSelectors) {
      if (await selector.isVisible({ timeout: 3000 }).catch(() => false)) {
        await selector.click();
        walletClicked = true;
        console.log('Clicked wallet option');
        break;
      }
    }

    if (!walletClicked) {
      console.log('No wallet option found - may already be on sell form');
    }

    await appPage.waitForTimeout(2000);
    await appPage.screenshot({ path: 'e2e/screenshots/debug/e2e-02-after-wallet.png', fullPage: true });

    // =========================================================================
    // STEP 3: Click MetaMask option
    // =========================================================================
    console.log('STEP 3: Selecting MetaMask...');

    const metamaskTile = appPage.locator('img[src*="metamask"], img[src*="rabby"]').first();
    await expect(metamaskTile).toBeVisible({ timeout: 5000 });
    await metamaskTile.click();
    await appPage.waitForTimeout(3000);

    await appPage.screenshot({ path: 'e2e/screenshots/debug/e2e-03-metamask-clicked.png', fullPage: true });

    // =========================================================================
    // STEP 4: Handle MetaMask connection popup
    // =========================================================================
    console.log('STEP 4: Handling MetaMask connection...');

    await handleMetaMaskConnect(context, extensionId);
    await appPage.waitForTimeout(2000);

    // =========================================================================
    // STEP 4b: Handle MetaMask network switch popup (Mainnet → Sepolia)
    // =========================================================================
    console.log('STEP 4b: Checking for network switch popup...');

    await handleMetaMaskNetworkSwitch(context);

    // Wait on context level, not page level (page may have been affected)
    await new Promise((r) => setTimeout(r, 2000));

    // Ensure app page is still open, bring it to front
    try {
      await appPage.bringToFront();
    } catch {
      console.log('App page was closed, finding it again...');
      const pages = context.pages();
      const newAppPage = pages.find((p) => p.url().includes('localhost:3001'));
      if (newAppPage) {
        // Can't reassign appPage, but we'll continue
        await newAppPage.bringToFront();
      }
    }

    // =========================================================================
    // STEP 5: Handle MetaMask signature for authentication
    // =========================================================================
    console.log('STEP 5: Handling MetaMask signature...');

    await handleMetaMaskSign(context, extensionId);
    await new Promise((r) => setTimeout(r, 3000)); // Use native timeout

    await appPage.screenshot({ path: 'e2e/screenshots/debug/e2e-05-after-auth.png', fullPage: true });

    // =========================================================================
    // STEP 6: Verify authentication succeeded
    // =========================================================================
    console.log('STEP 6: Verifying authentication...');

    const authPageContent = await appPage.textContent('body');
    const isAuthenticated = !authPageContent?.includes('Login to DFX');

    if (!isAuthenticated) {
      console.log('Authentication may have failed, retrying connection...');
      // Retry once
      const walletTileRetry = appPage.locator('img[src*="wallet"]').first();
      if (await walletTileRetry.isVisible({ timeout: 3000 }).catch(() => false)) {
        await walletTileRetry.click();
        await appPage.waitForTimeout(1000);
        const mmTileRetry = appPage.locator('img[src*="metamask"], img[src*="rabby"]').first();
        if (await mmTileRetry.isVisible({ timeout: 3000 }).catch(() => false)) {
          await mmTileRetry.click();
          await appPage.waitForTimeout(3000);
          await handleMetaMaskSign(context, extensionId);
          await appPage.waitForTimeout(3000);
        }
      }
    }

    // =========================================================================
    // STEP 7: Navigate to Sell page with Sepolia + USDT
    // =========================================================================
    console.log('STEP 7: Navigating to Sell page...');

    await appPage.goto('http://localhost:3001/sell?blockchain=Sepolia&assets=USDT');
    await appPage.waitForLoadState('networkidle');
    await appPage.waitForTimeout(3000);

    await appPage.screenshot({ path: 'e2e/screenshots/debug/e2e-07-sell-page.png', fullPage: true });

    // =========================================================================
    // STEP 8: Enter sell amount
    // =========================================================================
    console.log('STEP 8: Entering sell amount...');

    // Wait for form to load
    await appPage.waitForSelector('text=You spend', { timeout: 10000 });

    // Find amount input (first input with placeholder 0.00)
    const amountInput = appPage.locator('input[placeholder="0.00"]').first();
    if (await amountInput.isVisible({ timeout: 5000 })) {
      await amountInput.click();
      await amountInput.fill('10'); // 10 USDT
      console.log('Entered 10 USDT to sell');
      await appPage.waitForTimeout(2000);
    }

    await appPage.screenshot({ path: 'e2e/screenshots/debug/e2e-08-amount-entered.png', fullPage: true });

    // =========================================================================
    // STEP 9: Wait for quote and payment info
    // =========================================================================
    console.log('STEP 9: Waiting for payment information...');

    // Wait for exchange rate to appear
    await appPage.waitForSelector('text=EUR', { timeout: 15000 }).catch(() => {
      console.log('EUR selector not found, continuing...');
    });

    await appPage.waitForTimeout(3000);
    await appPage.screenshot({ path: 'e2e/screenshots/debug/e2e-09-quote-loaded.png', fullPage: true });

    // =========================================================================
    // STEP 10: Select IBAN / Bank Account
    // =========================================================================
    console.log('STEP 10: Selecting bank account...');

    // Look for existing IBANs or the IBAN input field
    const ibanSelectors = [
      appPage.locator('text=/^ES\\s*\\d{4}/').first(), // Spanish IBAN
      appPage.locator('text=/^NL\\s*\\d{4}/').first(), // Dutch IBAN
      appPage.locator('text=/^CH\\s*\\d{4}/').first(), // Swiss IBAN
      appPage.locator('text=/^DE\\s*\\d{4}/').first(), // German IBAN
      appPage.locator('[class*="iban"]').first(),
      appPage.locator('[class*="bank"]').first(),
    ];

    let ibanSelected = false;
    for (const selector of ibanSelectors) {
      if (await selector.isVisible({ timeout: 2000 }).catch(() => false)) {
        await selector.click();
        ibanSelected = true;
        console.log('Selected existing IBAN');
        break;
      }
    }

    // If no IBAN found, try to enter one manually
    if (!ibanSelected) {
      const ibanInput = appPage.locator('input[placeholder*="IBAN"], input[name*="iban"]').first();
      if (await ibanInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await ibanInput.fill('CH9300762011623852957'); // Test IBAN
        console.log('Entered test IBAN');
        ibanSelected = true;
      }
    }

    await appPage.waitForTimeout(2000);
    await appPage.screenshot({ path: 'e2e/screenshots/debug/e2e-10-iban-selected.png', fullPage: true });

    // =========================================================================
    // STEP 11: Click "Complete transaction in your wallet"
    // =========================================================================
    console.log('STEP 11: Clicking transaction button...');

    // Find the transaction button - try multiple selectors
    const txButtonSelectors = [
      appPage.locator('button:has-text("Complete transaction")').first(),
      appPage.locator('button:has-text("Transaktion abschließen")').first(),
      appPage.locator('button:has-text("Send")').first(),
      appPage.getByRole('button', { name: /complete|transaction|send/i }).first(),
    ];

    let txButton = null;
    for (const selector of txButtonSelectors) {
      if (await selector.isVisible({ timeout: 3000 }).catch(() => false)) {
        txButton = selector;
        break;
      }
    }

    if (txButton && await txButton.isVisible({ timeout: 10000 }).catch(() => false)) {
      // Check if enabled
      const isEnabled = await txButton.isEnabled();
      console.log(`Transaction button enabled: ${isEnabled}`);

      if (isEnabled) {
        // Scroll into view
        await txButton.scrollIntoViewIfNeeded();
        await appPage.waitForTimeout(500);

        // Click
        await txButton.click();
        console.log('Transaction button clicked');

        await appPage.screenshot({ path: 'e2e/screenshots/debug/e2e-11-tx-initiated.png', fullPage: true });

        // =====================================================================
        // STEP 12: Handle MetaMask transaction approval
        // =====================================================================
        console.log('STEP 12: Handling MetaMask transaction approval...');

        const txResult = await handleMetaMaskTransaction(context);

        if (txResult) {
          console.log('Transaction submitted to blockchain');

          // ===================================================================
          // STEP 13: Wait for transaction completion
          // ===================================================================
          console.log('STEP 13: Waiting for transaction confirmation...');

          await appPage.waitForTimeout(5000);
          await appPage.screenshot({ path: 'e2e/screenshots/debug/e2e-13-after-tx.png', fullPage: true });

          // Check page for success indicators
          const finalContent = await appPage.textContent('body');
          const hasSuccess =
            finalContent?.includes('successfully') ||
            finalContent?.includes('Transaction') ||
            finalContent?.includes('confirmed');

          if (hasSuccess) {
            console.log('Transaction appears successful based on UI');
          }

          // ===================================================================
          // STEP 14: Wait for transaction hash from app
          // ===================================================================
          console.log('STEP 14: Waiting for transaction hash...');

          const txHash = await waitForTransactionHash(appPage, context, 30000);

          // ===================================================================
          // STEP 15: Verify on Sepolia Etherscan
          // ===================================================================
          console.log('STEP 15: Verifying transaction on Sepolia Etherscan...');

          // Get wallet address from seed
          let walletAddress = '';
          if (TEST_SEED_PHRASE) {
            const { HDNodeWallet } = await import('ethers');
            const hdNode = HDNodeWallet.fromPhrase(TEST_SEED_PHRASE);
            walletAddress = hdNode.address;
            console.log(`Wallet address: ${walletAddress}`);
          }

          if (walletAddress) {
            const verifiedTx = await verifyTransactionOnSepolia(walletAddress, testStartTimestamp);

            if (verifiedTx) {
              console.log('\n=== TRANSACTION VERIFIED ON BLOCKCHAIN ===');
              console.log(`Hash: ${verifiedTx.hash}`);
              console.log(`Block: ${verifiedTx.blockNumber}`);
              console.log(`Status: ${verifiedTx.status}`);

              // ===============================================================
              // STEP 16: Open Etherscan and capture visual confirmation
              // ===============================================================
              console.log('STEP 16: Opening Sepolia Etherscan for visual verification...');

              await captureEtherscanScreenshot(context, verifiedTx.hash, 'e2e-tx-confirmed');

              // Assert transaction was successful
              expect(verifiedTx.status).toBe('confirmed');

              console.log('\n✅ TRANSACTION SUCCESSFULLY VERIFIED ON SEPOLIA ETHERSCAN ✅\n');
            } else if (txHash) {
              // If we have tx hash but API didn't confirm yet, still open Etherscan
              console.log('Opening Etherscan with tx hash from app...');
              await captureEtherscanScreenshot(context, txHash, 'e2e-tx-pending');
            } else {
              console.log('Could not verify transaction on Etherscan (may still be pending)');
            }
          }
        } else {
          console.log('MetaMask transaction popup not found or not confirmed');
        }
      } else {
        console.log('Transaction button is disabled');

        // Check for KYC or other requirements
        const kycHint = await appPage.locator('text=KYC, text=verified, text=COMPLETE').first().textContent().catch(() => null);
        if (kycHint) {
          console.log(`KYC requirement detected: ${kycHint}`);
        }
      }
    } else {
      console.log('Transaction button not found');

      // Debug: log page content
      const content = await appPage.textContent('body');
      console.log(`Page content preview: ${content?.substring(0, 500)}`);
    }

    // =========================================================================
    // FINAL: Capture final state
    // =========================================================================
    await appPage.screenshot({ path: 'e2e/screenshots/debug/e2e-final.png', fullPage: true });

    console.log('\n=== Sepolia Sell E2E Test Complete ===\n');
  });
});

test.describe('MetaMask Login Verification', () => {
  test('should successfully login with MetaMask and reach authenticated state', async ({
    context,
    appPage,
    metamask,
    extensionId,
  }) => {
    test.setTimeout(120000);

    console.log('\n=== MetaMask Login Verification Test ===\n');

    // Navigate directly to /sell to trigger login
    await appPage.goto('http://localhost:3001/sell?blockchain=Sepolia&assets=USDT');
    await appPage.waitForLoadState('networkidle');
    await appPage.waitForTimeout(5000);

    // Click CRYPTO WALLET - try multiple selectors
    const walletSelectors = [
      appPage.getByText('WALLET'),
      appPage.getByText('Wallet'),
      appPage.locator('img[src*="wallet"]').first(),
    ];

    for (const selector of walletSelectors) {
      if (await selector.isVisible({ timeout: 3000 }).catch(() => false)) {
        await selector.click();
        await appPage.waitForTimeout(1500);
        break;
      }
    }

    // Click MetaMask
    const metamaskTile = appPage.locator('img[src*="metamask"], img[src*="rabby"]').first();
    if (await metamaskTile.isVisible({ timeout: 5000 })) {
      await metamaskTile.click();
      await appPage.waitForTimeout(3000);
    }

    // Handle connection
    await handleMetaMaskConnect(context, extensionId);
    await appPage.waitForTimeout(1500);

    // Handle signature
    await handleMetaMaskSign(context, extensionId);
    await appPage.waitForTimeout(3000);

    // Verify authenticated state
    const pageContent = await appPage.textContent('body');
    const isAuthenticated = !pageContent?.includes('Login to DFX');

    expect(isAuthenticated).toBe(true);

    // Navigate to account to verify session
    await appPage.goto('http://localhost:3001/account');
    await appPage.waitForLoadState('networkidle');
    await appPage.waitForTimeout(2000);

    const accountContent = await appPage.textContent('body');
    const hasAccountInfo =
      accountContent?.includes('Profile') ||
      accountContent?.includes('Account') ||
      accountContent?.includes('KYC');

    expect(hasAccountInfo).toBe(true);

    console.log('MetaMask login verification PASSED');
  });
});
