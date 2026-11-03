import { Wallet, HDNodeWallet } from 'ethers';
import * as bip39 from '@scure/bip39';
import { HDKey } from '@scure/bip32';
import * as bitcoin from 'bitcoinjs-lib';
import * as bitcoinMessage from 'bitcoinjs-message';
import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { TronWeb } from 'tronweb';
import { Buffer } from 'buffer';

// Base58 encoding/decoding utilities (to avoid bs58 ESM issues)
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function encodeBase58(buffer: Uint8Array): string {
  const digits = [0];
  for (let i = 0; i < buffer.length; i++) {
    let carry = buffer[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let str = '';
  for (let i = 0; buffer[i] === 0 && i < buffer.length - 1; i++) {
    str += '1';
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    str += BASE58_ALPHABET[digits[i]];
  }
  return str;
}

/**
 * Lightning.space sign message format
 * Different from DFX - used for lightning.space custodial service
 */
const LIGHTNING_SIGN_MESSAGE =
  'By_signing_this_message,_you_confirm_to_lightning.space_that_you_are_the_sole_owner_of_the_provided_Blockchain_address._Your_ID:_';

/**
 * Supported blockchain types for login testing
 */
export type BlockchainType =
  | 'Ethereum'
  | 'Bitcoin'
  | 'Solana'
  | 'Tron'
  | 'Polygon'
  | 'Arbitrum'
  | 'Optimism'
  | 'Base'
  | 'BinanceSmartChain'
  | 'Gnosis'
  | 'Sepolia';

/**
 * Test wallet credentials derived from a seed phrase
 */
export interface TestCredentials {
  address: string;
  signature: string;
}

/**
 * Extended credentials with blockchain info
 */
export interface BlockchainCredentials extends TestCredentials {
  blockchain: BlockchainType;
}

/**
 * Environment configuration for tests
 */
export interface TestConfig {
  seed: string;
  iban: string;
}

/**
 * Get test configuration from environment variables
 */
export function getTestConfig(): TestConfig {
  const seed = process.env.TEST_SEED;
  if (!seed) {
    throw new Error('TEST_SEED environment variable is required. Set it in .env or as environment variable.');
  }

  const iban = process.env.TEST_IBAN;
  if (!iban) {
    throw new Error('TEST_IBAN environment variable is required. Set it in .env or as environment variable.');
  }

  return {
    seed,
    iban,
  };
}

/**
 * Fetches the environment-specific sign message from the API for any DFX blockchain.
 * The API prefixes it outside production (e.g. `[loc]_...`), so it must not be hardcoded.
 */
async function fetchSignMessage(address: string): Promise<string> {
  const apiUrl = process.env.REACT_APP_API_URL;
  if (!apiUrl) {
    throw new Error('REACT_APP_API_URL environment variable is required to fetch the sign message.');
  }

  const response = await fetch(`${apiUrl}/v1/auth/signMessage?address=${address}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch sign message: ${response.status}`);
  }

  const data = await response.json();
  if (!data.message) {
    throw new Error('Sign message response contains no message.');
  }
  return data.message;
}

/**
 * Creates EVM test credentials from a mnemonic seed phrase.
 * Derives an EVM address and signs the DFX authentication message.
 */
export async function createTestCredentials(
  mnemonic: string,
  derivationPath = '',
): Promise<TestCredentials> {
  const hdNode = HDNodeWallet.fromPhrase(mnemonic);
  const wallet = derivationPath ? hdNode.derivePath(derivationPath.replace('m/', '')) : hdNode;

  const address = wallet.address;
  const message = await fetchSignMessage(address);
  const signature = await wallet.signMessage(message);

  return { address, signature };
}

/**
 * Creates Bitcoin test credentials from a mnemonic seed phrase.
 * Uses BIP84 (Native SegWit) derivation path: m/84'/0'/0'/0/0
 */
export async function createBitcoinCredentials(mnemonic: string): Promise<TestCredentials> {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const hdKey = HDKey.fromMasterSeed(seed);

  // BIP84 for Native SegWit (bc1...)
  const derivedKey = hdKey.derive("m/84'/0'/0'/0/0");
  const privateKey = derivedKey.privateKey!;
  const publicKey = derivedKey.publicKey!;

  // Create P2WPKH address (bc1...)
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(publicKey),
    network: bitcoin.networks.bitcoin,
  });

  if (!address) throw new Error('Failed to generate Bitcoin address');

  const message = await fetchSignMessage(address);

  // Sign message using bitcoinjs-message
  const signature = bitcoinMessage.sign(message, Buffer.from(privateKey), true, { segwitType: 'p2wpkh' });

  return {
    address,
    signature: signature.toString('base64'),
  };
}

/**
 * Creates Lightning test credentials from a mnemonic seed phrase.
 * Uses same Bitcoin address but signs with lightning.space message format.
 * Uses BIP84 (Native SegWit) derivation path: m/84'/0'/0'/0/0
 */
export async function createLightningCredentials(mnemonic: string): Promise<TestCredentials> {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const hdKey = HDKey.fromMasterSeed(seed);

  // BIP84 for Native SegWit (bc1...)
  const derivedKey = hdKey.derive("m/84'/0'/0'/0/0");
  const privateKey = derivedKey.privateKey!;
  const publicKey = derivedKey.publicKey!;

  // Create P2WPKH address (bc1...)
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(publicKey),
    network: bitcoin.networks.bitcoin,
  });

  if (!address) throw new Error('Failed to generate Bitcoin address');

  // Sign with lightning.space message format
  const message = LIGHTNING_SIGN_MESSAGE + address;

  // Sign message using bitcoinjs-message
  const signature = bitcoinMessage.sign(message, Buffer.from(privateKey), true, { segwitType: 'p2wpkh' });

  return {
    address,
    signature: signature.toString('base64'),
  };
}

/**
 * Creates Solana test credentials from a mnemonic seed phrase.
 * Uses derivation path: m/44'/501'/0'/0'
 */
export async function createSolanaCredentials(mnemonic: string): Promise<TestCredentials> {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const hdKey = HDKey.fromMasterSeed(seed);

  // Solana derivation path
  const derivedKey = hdKey.derive("m/44'/501'/0'/0'");
  const keypair = Keypair.fromSeed(derivedKey.privateKey!);

  const address = keypair.publicKey.toBase58();
  const message = await fetchSignMessage(address);

  // Sign using tweetnacl
  const messageBytes = new TextEncoder().encode(message);
  const signatureBytes = nacl.sign.detached(messageBytes, keypair.secretKey);
  const signature = encodeBase58(signatureBytes);

  return { address, signature };
}

/**
 * Creates Tron test credentials from a mnemonic seed phrase.
 * Uses derivation path: m/44'/195'/0'/0/0
 */
export async function createTronCredentials(mnemonic: string): Promise<TestCredentials> {
  // TronWeb.fromMnemonic returns account with address and privateKey
  const account = TronWeb.fromMnemonic(mnemonic);
  const address = account.address;
  const privateKey = account.privateKey.replace(/^0x/, '');

  const message = await fetchSignMessage(address);

  // Create TronWeb instance and sign message
  const tronWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io',
    privateKey: privateKey,
  });

  const signature = await tronWeb.trx.signMessageV2(message);

  return { address, signature };
}

/**
 * Creates credentials for all supported blockchains from a single mnemonic.
 * Returns an array of credentials for each blockchain.
 */
export async function createAllBlockchainCredentials(mnemonic: string): Promise<BlockchainCredentials[]> {
  const results: BlockchainCredentials[] = [];

  // EVM credentials (same address for all EVM chains)
  const evmCredentials = await createTestCredentials(mnemonic);
  const evmChains: BlockchainType[] = [
    'Ethereum',
    'Polygon',
    'Arbitrum',
    'Optimism',
    'Base',
    'BinanceSmartChain',
    'Gnosis',
    'Sepolia',
  ];

  for (const blockchain of evmChains) {
    results.push({ ...evmCredentials, blockchain });
  }

  // Bitcoin credentials
  try {
    const btcCredentials = await createBitcoinCredentials(mnemonic);
    results.push({ ...btcCredentials, blockchain: 'Bitcoin' as BlockchainType });
  } catch (e) {
    console.warn('Failed to create Bitcoin credentials:', e);
  }

  // Solana credentials
  try {
    const solCredentials = await createSolanaCredentials(mnemonic);
    results.push({ ...solCredentials, blockchain: 'Solana' as BlockchainType });
  } catch (e) {
    console.warn('Failed to create Solana credentials:', e);
  }

  // Tron credentials
  try {
    const tronCredentials = await createTronCredentials(mnemonic);
    results.push({ ...tronCredentials, blockchain: 'Tron' as BlockchainType });
  } catch (e) {
    console.warn('Failed to create Tron credentials:', e);
  }

  return results;
}

/**
 * Creates test credentials from environment configuration.
 */
export async function createTestCredentialsFromEnv(): Promise<TestCredentials> {
  const config = getTestConfig();
  return createTestCredentials(config.seed);
}

/**
 * Creates a Wallet instance from mnemonic for additional operations
 */
export function getWalletFromMnemonic(mnemonic: string, derivationPath = ''): HDNodeWallet {
  const hdNode = HDNodeWallet.fromPhrase(mnemonic);
  return derivationPath ? hdNode.derivePath(derivationPath.replace('m/', '')) : hdNode;
}

/**
 * Generates a random mnemonic for testing purposes
 * WARNING: Only use for testing, never for production!
 */
export function generateTestMnemonic(): string {
  return Wallet.createRandom().mnemonic!.phrase;
}

// =============================================================================
// DUAL WALLET SUPPORT
// =============================================================================

/**
 * Standard BIP-44 derivation path for EVM
 * Used for Wallet 2 (index 0)
 */
export const EVM_DERIVATION_PATH_WALLET2 = "m/44'/60'/0'/0/0";

/**
 * BIP-44 derivation path for EVM Wallet 3 (index 1)
 * Used for linked address tests
 */
export const EVM_DERIVATION_PATH_WALLET3 = "m/44'/60'/0'/0/1";

/**
 * Get test wallet addresses dynamically from seed
 * Returns addresses for Wallet 1 (default) and Wallet 2 (BIP-44 derived)
 */
export function getTestWalletAddresses(mnemonic: string): { WALLET_1: string; WALLET_2: string } {
  const hdNode = HDNodeWallet.fromPhrase(mnemonic);
  const wallet2 = hdNode.derivePath(EVM_DERIVATION_PATH_WALLET2.replace('m/', ''));
  return {
    WALLET_1: hdNode.address,
    WALLET_2: wallet2.address,
  };
}

/**
 * Get test wallet addresses from environment
 */
export function getTestWalletAddressesFromEnv(): { WALLET_1: string; WALLET_2: string } {
  const config = getTestConfig();
  return getTestWalletAddresses(config.seed);
}


/**
 * Creates EVM credentials for Wallet 2 (with BIP-44 derivation path)
 * Use this for gasless tests where wallet has tokens but no ETH
 */
export async function createTestCredentialsWallet2(mnemonic: string): Promise<TestCredentials> {
  return createTestCredentials(mnemonic, EVM_DERIVATION_PATH_WALLET2);
}

/**
 * Creates test credentials for Wallet 2 from environment configuration.
 * Wallet 2 uses derivation path m/44'/60'/0'/0/0
 */
export async function createTestCredentialsWallet2FromEnv(): Promise<TestCredentials> {
  const config = getTestConfig();
  return createTestCredentialsWallet2(config.seed);
}

/**
 * Gets Wallet 2 instance from mnemonic (with BIP-44 derivation)
 */
export function getWallet2FromMnemonic(mnemonic: string): HDNodeWallet {
  return getWalletFromMnemonic(mnemonic, EVM_DERIVATION_PATH_WALLET2);
}

/**
 * Creates EVM credentials for Wallet 3 (with BIP-44 derivation path index 1)
 * Use this for linked address tests
 */
export async function createTestCredentialsWallet3(mnemonic: string): Promise<TestCredentials> {
  return createTestCredentials(mnemonic, EVM_DERIVATION_PATH_WALLET3);
}

// =============================================================================
// BITCOIN WALLET 2 SUPPORT (for linked Lightning tests)
// =============================================================================

/**
 * BIP84 derivation path for Bitcoin Wallet 2 (index 1)
 * Used for linked Lightning address tests
 */
export const BTC_DERIVATION_PATH_WALLET2 = "m/84'/0'/0'/0/1";

/**
 * Creates Bitcoin credentials for Wallet 2 (index 1)
 * Use this for linked Lightning address tests
 */
export async function createBitcoinCredentialsWallet2(mnemonic: string): Promise<TestCredentials> {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const hdKey = HDKey.fromMasterSeed(seed);

  // BIP84 for Native SegWit (bc1...) - index 1
  const derivedKey = hdKey.derive(BTC_DERIVATION_PATH_WALLET2);
  const privateKey = derivedKey.privateKey!;
  const publicKey = derivedKey.publicKey!;

  // Create P2WPKH address (bc1...)
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(publicKey),
    network: bitcoin.networks.bitcoin,
  });

  if (!address) throw new Error('Failed to generate Bitcoin address');

  const message = await fetchSignMessage(address);

  // Sign message using bitcoinjs-message
  const signature = bitcoinMessage.sign(message, Buffer.from(privateKey), true, { segwitType: 'p2wpkh' });

  return {
    address,
    signature: signature.toString('base64'),
  };
}

/**
 * Creates Lightning credentials for Wallet 2 (Bitcoin index 1)
 * Signs with lightning.space message format
 */
export async function createLightningCredentialsWallet2(mnemonic: string): Promise<TestCredentials> {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const hdKey = HDKey.fromMasterSeed(seed);

  // BIP84 for Native SegWit (bc1...) - index 1
  const derivedKey = hdKey.derive(BTC_DERIVATION_PATH_WALLET2);
  const privateKey = derivedKey.privateKey!;
  const publicKey = derivedKey.publicKey!;

  // Create P2WPKH address (bc1...)
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(publicKey),
    network: bitcoin.networks.bitcoin,
  });

  if (!address) throw new Error('Failed to generate Bitcoin address');

  // Sign with lightning.space message format
  const message = LIGHTNING_SIGN_MESSAGE + address;

  // Sign message using bitcoinjs-message
  const signature = bitcoinMessage.sign(message, Buffer.from(privateKey), true, { segwitType: 'p2wpkh' });

  return {
    address,
    signature: signature.toString('base64'),
  };
}
