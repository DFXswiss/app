/**
 * Test Gasless API Response and Pimlico Paymaster
 * Run: API_URL=http://localhost:3000/v1 npx tsx e2e/api/test-gasless-api.ts
 */

import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.test') });

const API_URL = process.env.API_URL!;
const TEST_SEED = process.env.TEST_SEED_2!;

async function test() {

  const wallet = ethers.Wallet.fromPhrase(TEST_SEED);
  console.log('=== Test Gasless API Response ===');
  console.log('Wallet 2:', wallet.address);
  console.log('API:', API_URL);

  // 1. Get auth token
  const signMsgRes = await fetch(`${API_URL}/auth/signMessage?address=${wallet.address}`);
  const signMsgData = await signMsgRes.json();
  const signature = await wallet.signMessage(signMsgData.message);

  const authRes = await fetch(`${API_URL}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: wallet.address, signature }),
  });
  const authData = await authRes.json();
  console.log('\n✓ Auth token obtained');

  // 2. Get sell payment info with includeTx=true
  const sellRes = await fetch(`${API_URL}/sell/paymentInfos?includeTx=true`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authData.accessToken}`,
    },
    body: JSON.stringify({
      iban: 'CH93 0076 2011 6238 5295 7',
      asset: { id: 407 }, // Sepolia USDT
      amount: 0.01,
      currency: { id: 2 }, // EUR
    }),
  });
  const sellData = await sellRes.json();

  console.log('\n=== API Response ===');
  console.log('Status:', sellRes.status);
  console.log('gaslessAvailable:', sellData.gaslessAvailable);
  console.log('has depositTx:', !!sellData.depositTx);
  console.log('has depositTx.eip5792:', !!sellData.depositTx?.eip5792);

  if (sellData.depositTx?.eip5792) {
    console.log('\n=== EIP-5792 Data ===');
    console.log('paymasterUrl:', sellData.depositTx.eip5792.paymasterUrl);
    console.log('chainId:', sellData.depositTx.eip5792.chainId);
    console.log('calls:', JSON.stringify(sellData.depositTx.eip5792.calls, null, 2));

    // 3. Test paymaster URL directly
    console.log('\n=== Testing Pimlico Paymaster ===');
    const paymasterUrl = sellData.depositTx.eip5792.paymasterUrl;

    const testRes = await fetch(paymasterUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'pm_getPaymasterStubData',
        params: [
          {
            sender: wallet.address,
            nonce: '0x0',
            callData: '0x',
            callGasLimit: '0x0',
            verificationGasLimit: '0x0',
            preVerificationGas: '0x0',
            maxFeePerGas: '0x0',
            maxPriorityFeePerGas: '0x0',
          },
          '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
          '0xaa36a7',
        ],
      }),
    });
    const paymasterData = await testRes.json();
    console.log('Paymaster response:', JSON.stringify(paymasterData, null, 2));
  }

  if (sellData.error || sellData.message) {
    console.log('\n❌ API Error:', sellData.message || sellData.error);
  }

  // Show full response for debugging
  console.log('\n=== Full Response ===');
  console.log(JSON.stringify(sellData, null, 2));
}

test().catch((e) => console.error('Error:', e.message));
