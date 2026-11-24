/**
 * Wallet AML rules on the sell and swap quote: PUT /v1/sell/paymentInfos and PUT /v1/swap/paymentInfos.
 *
 * The API applies the wallet rules (`wallet.amlRules` / `wallet.exceptAmlRules`) to every buy, sell and swap
 * in its AML check. The quote applies them as well, so a customer below the KYC level a wallet rule
 * requires is refused before sending crypto: `isValid` false, `error` KycRequired and no deposit address.
 *
 * Real API and real Postgres. The seeded default wallet carries the column default `3;7`, so RULE_3
 * (KYC level 50 on every route) applies to every factory user. The RULE_11 and exception cases run on a
 * wallet created for this file; the user is moved onto it and its IP country is set in the database.
 */

import {
  apiPut,
  expect,
  expectTransactionsPaused,
  orPaused,
  pausable,
  type PausableProduct,
  queryOne,
  queryRows,
  required,
  test,
  TransactionsPausedError,
} from './fixtures';
import {
  cleanupCreatedData,
  createBankAccount,
  createUser,
  type CreateUserResult,
  type KycLevelValue,
  TEST_IBAN,
  trackRow,
} from './fixtures/factories';

// Own wallet-index range, so this file never signs into an account of another spec file.
let walletSeq = 0;
function nextWalletIndex(): number {
  walletSeq += 1;
  return 8100000 + walletSeq;
}

const KYC_REQUIRED = 'KycRequired';

interface PaymentInfo {
  isValid: boolean;
  error?: string;
  depositAddress?: string;
}

async function idOf(table: 'asset' | 'fiat', column: 'uniqueName' | 'name', value: string): Promise<number> {
  const row = await queryOne<{ id: number }>(`SELECT id FROM ${table} WHERE "${column}" = $1`, [value]);
  return required(row, `${table} ${value}`).id;
}

async function walletUser(tag: string, kycLevel: KycLevelValue): Promise<CreateUserResult> {
  return createUser({ walletIndex: nextWalletIndex(), tag, kycLevel, completePersonalData: true });
}

/** Creates a wallet with the given rules and moves the user onto it, with the given IP country. */
async function moveToWallet(
  user: CreateUserResult,
  rules: { amlRules: string; exceptAmlRules?: string },
  ipCountry: string,
): Promise<void> {
  const wallet = required(
    await queryOne<{ id: number }>(
      `INSERT INTO wallet (name, "amlRules", "exceptAmlRules", "autoTradeApproval") VALUES ($1, $2, $3, TRUE) RETURNING id`,
      [`e2e-wallet-aml-${walletSeq}`, rules.amlRules, rules.exceptAmlRules ?? null],
    ),
    'inserted wallet',
  );
  trackRow('wallet', wallet.id);
  await queryRows(`UPDATE "user" SET "walletId" = $1, "ipCountry" = $2 WHERE id = $3`, [
    wallet.id,
    ipCountry,
    user.userId,
  ]);
}

async function sellPaymentInfo(user: CreateUserResult): Promise<PaymentInfo | TransactionsPausedError> {
  await createBankAccount(user.jwt, { iban: TEST_IBAN, label: 'Wallet AML BA' });
  const body = {
    iban: TEST_IBAN,
    asset: { id: await idOf('asset', 'uniqueName', 'Ethereum/ETH') },
    currency: { id: await idOf('fiat', 'name', 'CHF') },
    amount: 0.1,
  };
  return orPaused(pausable('sell', apiPut<PaymentInfo>('sell/paymentInfos', body, { jwt: user.jwt })));
}

async function swapPaymentInfo(user: CreateUserResult): Promise<PaymentInfo | TransactionsPausedError> {
  const body = {
    sourceAsset: { id: await idOf('asset', 'uniqueName', 'Ethereum/ETH') },
    targetAsset: { id: await idOf('asset', 'uniqueName', 'Ethereum/USDT') },
    amount: 0.1,
  };
  return orPaused(pausable('swap', apiPut<PaymentInfo>('swap/paymentInfos', body, { jwt: user.jwt })));
}

const quotes: Record<PausableProduct, (user: CreateUserResult) => Promise<PaymentInfo | TransactionsPausedError>> = {
  sell: sellPaymentInfo,
  swap: swapPaymentInfo,
};

/** Returns the payment info, or undefined after asserting the paused answer while the product is switched off. */
async function quote(product: PausableProduct, user: CreateUserResult): Promise<PaymentInfo | undefined> {
  const info = await quotes[product](user);
  if (info instanceof TransactionsPausedError) {
    expectTransactionsPaused(info, product);
    return undefined;
  }
  return info;
}

function expectRefused(info: PaymentInfo | undefined): void {
  if (!info) return;
  expect(info.isValid).toBe(false);
  expect(info.error).toBe(KYC_REQUIRED);
  expect(info.depositAddress).toBeUndefined();
}

function expectAccepted(info: PaymentInfo | undefined): void {
  if (!info) return;
  expect(info.error, `unexpected quote error ${info.error}`).toBeUndefined();
  expect(info.isValid).toBe(true);
  expect(info.depositAddress).toBeTruthy();
}

test.describe.configure({ mode: 'serial' });

test.describe('Wallet AML rules on the sell and swap quote', () => {
  test.afterAll(async () => {
    await cleanupCreatedData();
  });

  for (const product of ['sell', 'swap'] as const) {
    test(`${product}: KYC level 30 on a RULE_3 wallet is refused with KycRequired and no deposit address`, async () => {
      expectRefused(await quote(product, await walletUser(`${product}-aml-30`, 30)));
    });

    test(`${product}: KYC level 50 on a RULE_3 wallet gets a valid quote with a deposit address`, async () => {
      expectAccepted(await quote(product, await walletUser(`${product}-aml-50`, 50)));
    });
  }

  test('sell: RULE_11 waives RULE_3 for a Swiss IP', async () => {
    const user = await walletUser('sell-aml-r11-ch', 30);
    await moveToWallet(user, { amlRules: '3;7;11' }, 'CH');
    expectAccepted(await quote('sell', user));
  });

  test('sell: RULE_11 does not waive RULE_3 for a non-Swiss IP', async () => {
    const user = await walletUser('sell-aml-r11-de', 30);
    await moveToWallet(user, { amlRules: '3;7;11' }, 'DE');
    expectRefused(await quote('sell', user));
  });

  test('sell: a wallet exception for RULE_3 lets KYC level 30 through', async () => {
    const user = await walletUser('sell-aml-except', 30);
    await moveToWallet(user, { amlRules: '3;7', exceptAmlRules: '3' }, 'DE');
    expectAccepted(await quote('sell', user));
  });
});
