import { APIRequestContext } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';
import {
  createTestCredentials,
  createTestCredentialsWallet2,
  createTestCredentialsWallet3,
  createTestCredentialsWallet4,
  createTestCredentialsWallet5,
  createBitcoinCredentials,
  createLightningCredentials,
  createLightningCredentialsWallet2,
  createSolanaCredentials,
  createTronCredentials,
  TestCredentials,
  getTestConfig,
} from '../test-wallet';

// Load test environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Use same API URL as the React app (add /v1 path for API calls)
const API_URL = process.env.REACT_APP_API_URL! + '/v1';

// Lightning.space API URL for Lightning authentication (prod works, dev has internal SSL issues)
const LIGHTNING_API_URL = process.env.LIGHTNING_API_URL!;

// Global cache for auth tokens to avoid rate limiting
const tokenCache: Map<string, { token: string; expiry: number; lightningAddress?: string }> = new Map();

// Cache for credentials
const credentialsCache: Map<string, TestCredentials> = new Map();

// Mutex for serializing auth requests
let authMutex: Promise<void> = Promise.resolve();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type BlockchainType =
  | 'evm'
  | 'evm-wallet2'
  | 'evm-wallet4'
  | 'evm-wallet5'
  | 'bitcoin'
  | 'lightning'
  | 'solana'
  | 'tron';

// Linked address types - these are authenticated using an existing token from another blockchain
export type LinkedBlockchainType = 'evm-linked' | 'solana-linked' | 'tron-linked' | 'lightning-linked';

async function generateCredentials(type: BlockchainType): Promise<TestCredentials> {
  const cacheKey = type;
  if (credentialsCache.has(cacheKey)) {
    return credentialsCache.get(cacheKey)!;
  }

  const config = getTestConfig();
  let credentials: TestCredentials;

  switch (type) {
    case 'evm':
      credentials = await createTestCredentials(config.seed);
      break;
    case 'evm-wallet2':
      credentials = await createTestCredentialsWallet2(config.seed);
      break;
    case 'evm-wallet4':
      credentials = await createTestCredentialsWallet4(config.seed);
      break;
    case 'evm-wallet5':
      credentials = await createTestCredentialsWallet5(config.seed);
      break;
    case 'bitcoin':
      credentials = await createBitcoinCredentials(config.seed);
      break;
    case 'lightning':
      credentials = await createLightningCredentials(config.seed);
      break;
    case 'solana':
      credentials = await createSolanaCredentials(config.seed);
      break;
    case 'tron':
      credentials = await createTronCredentials(config.seed);
      break;
  }

  credentialsCache.set(cacheKey, credentials);
  return credentials;
}

async function authenticateWithRetry(
  request: APIRequestContext,
  credentials: TestCredentials,
  apiUrl: string = API_URL,
  maxRetries = 5,
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Exponential backoff: 0, 2s, 4s, 8s, 16s
    if (attempt > 0) {
      const backoffMs = Math.pow(2, attempt) * 1000;
      console.log(`Auth retry ${attempt}/${maxRetries}, waiting ${backoffMs}ms...`);
      await delay(backoffMs);
    }

    try {
      const response = await request.post(`${apiUrl}/auth`, {
        data: credentials,
        ignoreHTTPSErrors: true, // Allow self-signed certificates for dev environments
      });

      if (response.ok()) {
        const data = await response.json();
        return data.accessToken;
      }

      const status = response.status();
      if (status === 429) {
        console.log(`Rate limited (429), will retry...`);
        lastError = new Error(`Rate limited: ${status}`);
        continue;
      }

      // For other errors, fail immediately
      const body = await response.text().catch(() => 'unknown');
      throw new Error(`Auth failed with status ${status}: ${body}`);
    } catch (e) {
      if (e instanceof Error && e.message.includes('Rate limited')) {
        lastError = e;
        continue;
      }
      throw e;
    }
  }

  throw lastError || new Error('Authentication failed after retries');
}

export async function getCachedAuth(
  request: APIRequestContext,
  type: BlockchainType,
): Promise<{ token: string; credentials: TestCredentials; lightningAddress?: string }> {
  const credentials = await generateCredentials(type);
  const cacheKey = `${type}:${credentials.address}`;

  // Check cache first
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    console.log(`Using cached token for ${type}`);
    return { token: cached.token, credentials, lightningAddress: cached.lightningAddress };
  }

  // Serialize auth requests using mutex
  const currentMutex = authMutex;
  let resolve: () => void;
  authMutex = new Promise((r) => (resolve = r));

  try {
    await currentMutex;

    // Double-check cache after waiting for mutex
    const cachedAgain = tokenCache.get(cacheKey);
    if (cachedAgain && cachedAgain.expiry > Date.now()) {
      console.log(`Using cached token for ${type} (after mutex)`);
      return { token: cachedAgain.token, credentials, lightningAddress: cachedAgain.lightningAddress };
    }

    // Add delay between different blockchain auth requests
    await delay(1000);

    let token: string;
    let lightningAddress: string | undefined;

    if (type === 'lightning') {
      // Lightning flow: First authenticate with lightning.space to get LNURL and ownership proof
      console.log(`Authenticating ${type} address: ${credentials.address} via ${LIGHTNING_API_URL}`);
      const ldsResult = await authenticateLightning(request, credentials);
      lightningAddress = ldsResult.lightningAddress;

      // Then authenticate with DFX API using LNURL and ownership proof
      console.log(`Got Lightning address: ${lightningAddress}, LNURL: ${ldsResult.lnurl.substring(0, 30)}...`);
      console.log(`Authenticating with DFX API using LNURL...`);
      const dfxCredentials: TestCredentials = {
        address: ldsResult.lnurl,
        signature: ldsResult.ownershipProof,
      };
      token = await authenticateWithRetry(request, dfxCredentials, API_URL);
    } else {
      const apiUrl = API_URL;
      console.log(`Authenticating ${type} address: ${credentials.address} via ${apiUrl}`);
      token = await authenticateWithRetry(request, credentials, apiUrl);
    }

    // Cache for 2 hours
    tokenCache.set(cacheKey, {
      token,
      expiry: Date.now() + 2 * 60 * 60 * 1000,
      lightningAddress,
    });

    return { token, credentials, lightningAddress };
  } finally {
    resolve!();
  }
}

async function authenticateLightning(
  request: APIRequestContext,
  credentials: TestCredentials,
): Promise<{ accessToken: string; lightningAddress: string; lnurl: string; ownershipProof: string }> {
  // Step 1: Authenticate with lightning.space using Bitcoin credentials
  const authResponse = await request.post(`${LIGHTNING_API_URL}/auth`, {
    data: credentials,
    ignoreHTTPSErrors: true,
  });

  if (!authResponse.ok()) {
    const body = await authResponse.text().catch(() => 'unknown');
    throw new Error(`Lightning auth failed with status ${authResponse.status()}: ${body}`);
  }

  const authData = await authResponse.json();
  const ldsToken = authData.accessToken;
  const lightningAddress = authData.lightningAddress;

  // Step 2: Get user info with LNURL and ownership proof for DFX login
  const userResponse = await request.get(`${LIGHTNING_API_URL}/user`, {
    headers: {
      Authorization: `Bearer ${ldsToken}`,
    },
    ignoreHTTPSErrors: true,
  });

  if (!userResponse.ok()) {
    const body = await userResponse.text().catch(() => 'unknown');
    throw new Error(`Lightning user info failed with status ${userResponse.status()}: ${body}`);
  }

  const userData = await userResponse.json();

  return {
    accessToken: ldsToken,
    lightningAddress,
    lnurl: userData.lightning.addressLnurl,
    ownershipProof: userData.lightning.addressOwnershipProof,
  };
}

export function getTestIban(): string {
  return getTestConfig().iban;
}

/**
 * Authenticate a new blockchain address using an existing token.
 * This links the new address to the same account (no new KYC required).
 *
 * Flow:
 * 1. First authenticate with Bitcoin/Lightning to get a token
 * 2. Use that token to authenticate a new address (e.g., Ethereum)
 * 3. The new address is automatically linked to the same account
 *
 * @param request - Playwright API request context
 * @param existingToken - Token from an existing authenticated address
 * @param newType - The new blockchain type to link ('evm-linked', 'solana-linked', 'tron-linked')
 * @returns Token for the newly linked address
 */
export async function authenticateLinkedAddress(
  request: APIRequestContext,
  existingToken: string,
  newType: LinkedBlockchainType,
): Promise<{ token: string; credentials: TestCredentials }> {
  const cacheKey = `linked:${newType}`;

  // Check cache first
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    console.log(`Using cached linked token for ${newType}`);
    const credentials = credentialsCache.get(newType.replace('-linked', ''))!;
    return { token: cached.token, credentials };
  }

  // Generate credentials for the new blockchain type
  const config = getTestConfig();
  let credentials: TestCredentials;

  switch (newType) {
    case 'evm-linked':
      // Use wallet3 (derivation index 1) for linked addresses
      // wallet1 and wallet2 are already registered on other accounts
      credentials = await createTestCredentialsWallet3(config.seed);
      break;
    case 'solana-linked':
      credentials = await createSolanaCredentials(config.seed);
      break;
    case 'tron-linked':
      credentials = await createTronCredentials(config.seed);
      break;
  }

  console.log(`Linking ${newType} address ${credentials.address} to existing account...`);

  // Authenticate with the new address, passing the existing token
  // This tells the API to link this address to the same account
  const response = await request.post(`${API_URL}/auth`, {
    data: credentials,
    headers: {
      Authorization: `Bearer ${existingToken}`,
    },
    ignoreHTTPSErrors: true,
  });

  if (!response.ok()) {
    const body = await response.text().catch(() => 'unknown');
    throw new Error(`Failed to link address: ${response.status()} - ${body}`);
  }

  const data = await response.json();
  const token = data.accessToken;

  // Cache for 2 hours
  tokenCache.set(cacheKey, {
    token,
    expiry: Date.now() + 2 * 60 * 60 * 1000,
  });

  credentialsCache.set(newType.replace('-linked', ''), credentials);

  console.log(`Successfully linked ${newType} address to account`);

  return { token, credentials };
}

/**
 * Get a linked EVM address token using Bitcoin as the primary wallet.
 * This is useful for testing EVM chains with a Bitcoin-authenticated account.
 *
 * Uses Wallet 3 (derivation index 1) which is a fresh address not yet registered.
 */
export async function getLinkedEvmAuth(
  request: APIRequestContext,
): Promise<{ token: string; credentials: TestCredentials; primaryToken: string }> {
  // First authenticate with Bitcoin to get the primary token
  const bitcoinAuth = await getCachedAuth(request, 'bitcoin');

  // Link EVM wallet3 address to the Bitcoin account
  const linkedAuth = await authenticateLinkedAddress(request, bitcoinAuth.token, 'evm-linked');

  return {
    token: linkedAuth.token,
    credentials: linkedAuth.credentials,
    primaryToken: bitcoinAuth.token,
  };
}

/**
 * Authenticate Lightning Wallet 2 at lightning.space and get LNURL + ownershipProof.
 * Uses Bitcoin derivation path m/84'/0'/0'/0/1 (index 1).
 */
async function authenticateLightningWallet2(
  request: APIRequestContext,
): Promise<{ lightningAddress: string; lnurl: string; ownershipProof: string; btcAddress: string }> {
  const config = getTestConfig();
  const credentials = await createLightningCredentialsWallet2(config.seed);

  console.log(`Authenticating Lightning Wallet 2 (${credentials.address}) at lightning.space...`);

  // Step 1: Authenticate with lightning.space using Bitcoin Wallet 2 credentials
  const authResponse = await request.post(`${LIGHTNING_API_URL}/auth`, {
    data: credentials,
    ignoreHTTPSErrors: true,
  });

  if (!authResponse.ok()) {
    const body = await authResponse.text().catch(() => 'unknown');
    throw new Error(`Lightning Wallet 2 auth failed with status ${authResponse.status()}: ${body}`);
  }

  const authData = await authResponse.json();
  const ldsToken = authData.accessToken;
  const lightningAddress = authData.lightningAddress;

  // Step 2: Get user info with LNURL and ownership proof
  const userResponse = await request.get(`${LIGHTNING_API_URL}/user`, {
    headers: {
      Authorization: `Bearer ${ldsToken}`,
    },
    ignoreHTTPSErrors: true,
  });

  if (!userResponse.ok()) {
    const body = await userResponse.text().catch(() => 'unknown');
    throw new Error(`Lightning Wallet 2 user info failed with status ${userResponse.status()}: ${body}`);
  }

  const userData = await userResponse.json();

  console.log(`Lightning Wallet 2 address: ${lightningAddress}`);
  console.log(`Lightning Wallet 2 LNURL: ${userData.lightning.addressLnurl.substring(0, 40)}...`);

  return {
    lightningAddress,
    lnurl: userData.lightning.addressLnurl,
    ownershipProof: userData.lightning.addressOwnershipProof,
    btcAddress: credentials.address,
  };
}

/**
 * Get a linked Lightning address token using Bitcoin as the primary wallet.
 *
 * Flow:
 * 1. Authenticate with Bitcoin Wallet 1 (bc1qq70e...) at DFX → primaryToken
 * 2. Authenticate Bitcoin Wallet 2 at lightning.space → LNURL + ownershipProof
 * 3. Link LNURL at DFX using primaryToken → new token for Lightning Wallet 2
 *
 * This allows using a second Lightning address under the same account (no second KYC).
 */
export async function getLinkedLightningAuth(
  request: APIRequestContext,
): Promise<{
  token: string;
  lnurl: string;
  lightningAddress: string;
  btcAddress: string;
  primaryToken: string;
}> {
  const cacheKey = 'linked:lightning-wallet2';

  // Check cache first
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    console.log('Using cached linked Lightning token');
    // Get Bitcoin primary token
    const bitcoinAuth = await getCachedAuth(request, 'bitcoin');
    return {
      token: cached.token,
      lnurl: cached.lightningAddress!, // We store lnurl in lightningAddress field
      lightningAddress: cached.lightningAddress!,
      btcAddress: '', // Not cached, but not critical
      primaryToken: bitcoinAuth.token,
    };
  }

  // Step 1: Authenticate with Bitcoin Wallet 1 to get primary token
  const bitcoinAuth = await getCachedAuth(request, 'bitcoin');
  console.log(`Primary Bitcoin token obtained for ${bitcoinAuth.credentials.address}`);

  // Step 2: Authenticate Lightning Wallet 2 at lightning.space
  const lightningWallet2 = await authenticateLightningWallet2(request);

  // Step 3: Link the new LNURL to the Bitcoin account at DFX
  console.log(`Linking Lightning Wallet 2 LNURL to Bitcoin account...`);

  const dfxCredentials: TestCredentials = {
    address: lightningWallet2.lnurl,
    signature: lightningWallet2.ownershipProof,
  };

  const response = await request.post(`${API_URL}/auth`, {
    data: dfxCredentials,
    headers: {
      Authorization: `Bearer ${bitcoinAuth.token}`,
    },
    ignoreHTTPSErrors: true,
  });

  if (!response.ok()) {
    const body = await response.text().catch(() => 'unknown');
    throw new Error(`Failed to link Lightning Wallet 2: ${response.status()} - ${body}`);
  }

  const data = await response.json();
  const token = data.accessToken;

  console.log('Successfully linked Lightning Wallet 2 to Bitcoin account');

  // Cache for 2 hours
  tokenCache.set(cacheKey, {
    token,
    expiry: Date.now() + 2 * 60 * 60 * 1000,
    lightningAddress: lightningWallet2.lnurl,
  });

  return {
    token,
    lnurl: lightningWallet2.lnurl,
    lightningAddress: lightningWallet2.lightningAddress,
    btcAddress: lightningWallet2.btcAddress,
    primaryToken: bitcoinAuth.token,
  };
}
