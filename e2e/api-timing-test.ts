/**
 * Direct API Timing Test
 * Tests if the API call with includeTx=true hangs
 *
 * Run: npx ts-node e2e/api-timing-test.ts
 */

import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const API_URL = process.env.REACT_APP_API_URL!;
const TEST_SEED = process.env.TEST_SEED!;

async function main() {
  console.log('=== API Timing Test ===\n');
  console.log(`API URL: ${API_URL}`);

  if (!TEST_SEED) {
    console.error('ERROR: TEST_SEED not in .env');
    process.exit(1);
  }

  // Create wallet from seed
  const wallet = ethers.Wallet.fromPhrase(TEST_SEED);
  console.log(`Wallet: ${wallet.address}\n`);

  // Step 1: Get auth token
  console.log('1. Authenticating...');
  const startAuth = Date.now();

  const signMsgRes = await fetch(`${API_URL}/v1/auth/signMessage?address=${wallet.address}`);
  const signMsgData = await signMsgRes.json();
  const signature = await wallet.signMessage(signMsgData.message);

  const authRes = await fetch(`${API_URL}/v1/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: wallet.address, signature }),
  });
  const authData = await authRes.json();
  const token = authData.accessToken;

  console.log(`   Done in ${Date.now() - startAuth}ms\n`);

  // Step 2: Test WITHOUT includeTx (normal price calculation)
  console.log('2. Testing sell/paymentInfos WITHOUT includeTx...');
  const startWithout = Date.now();

  const request = {
    iban: 'CH93 0076 2011 6238 5295 7',
    asset: { id: 407 }, // Sepolia USDT
    amount: 0.01,
    currency: { id: 2 }, // EUR
  };

  const resWithout = await fetch(`${API_URL}/v1/sell/paymentInfos`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(request),
  });

  const dataWithout = await resWithout.json();
  const timeWithout = Date.now() - startWithout;
  console.log(`   Status: ${resWithout.status}`);
  console.log(`   Time: ${timeWithout}ms`);
  console.log(`   Has depositAddress: ${!!dataWithout.depositAddress}`);
  console.log(`   gaslessAvailable: ${dataWithout.gaslessAvailable}\n`);

  // Step 3: Test WITH includeTx=true
  console.log('3. Testing sell/paymentInfos WITH includeTx=true...');
  const startWith = Date.now();

  const resWith = await fetch(`${API_URL}/v1/sell/paymentInfos?includeTx=true`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(request),
  });

  const dataWith = await resWith.json();
  const timeWith = Date.now() - startWith;
  console.log(`   Status: ${resWith.status}`);
  console.log(`   Time: ${timeWith}ms`);
  console.log(`   Has depositAddress: ${!!dataWith.depositAddress}`);
  console.log(`   Has depositTx: ${!!dataWith.depositTx}`);
  console.log(`   gaslessAvailable: ${dataWith.gaslessAvailable}`);
  console.log(`   eip7702Authorization: ${dataWith.eip7702Authorization ? 'YES' : 'no'}`);
  console.log(`   depositTx.eip5792: ${dataWith.depositTx?.eip5792 ? 'YES' : 'no'}\n`);

  // Summary
  console.log('=== SUMMARY ===');
  console.log(`WITHOUT includeTx: ${timeWithout}ms`);
  console.log(`WITH includeTx:    ${timeWith}ms`);
  console.log(`Difference:        ${timeWith - timeWithout}ms`);

  if (timeWith > 10000) {
    console.log('\n⚠️  WARNING: includeTx=true call took >10 seconds!');
    console.log('This could cause frontend timeout/hang issues.');
  } else if (timeWith > 5000) {
    console.log('\n⚠️  NOTICE: includeTx=true call is slow (>5s)');
  } else {
    console.log('\n✓ API response times look normal');
  }

  // Check for gasless data that could cause issues
  if (dataWith.depositTx?.eip5792) {
    console.log('\n⚠️  Backend returns eip5792 data!');
    console.log('This could cause MetaMask issues if wallet doesn\'t support EIP-5792.');
  }

  if (dataWith.eip7702Authorization) {
    console.log('\n⚠️  Backend returns eip7702Authorization!');
    console.log('This requires MetaMask signature before transaction.');
  }

  console.log('\n=== RAW RESPONSE ===');
  console.log(JSON.stringify(dataWith, null, 2));
}

main().catch((e) => {
  console.error('Error:', e.message || e);
  process.exit(1);
});
