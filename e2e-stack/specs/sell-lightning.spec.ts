/**
 * Synchronous Lightning sell path after self-custodial Lightning login.
 *
 * This proves the real API and database path only as far as returning the deposit address. It does
 * not prove that a payment arrives, is credited, or is paid out: DISABLED_PROCESSES=* disables every
 * process-driven job. The invoice is served by this harness's static LNURL endpoint, not a Lightning
 * node, and is an unpayable BOLT-11 specification test vector.
 *
 * The endpoint deliberately runs on localhost in the API container's network namespace: in loc,
 * HttpService mocks every outbound request except localhost, so this is the only way to exercise the
 * real LNURL code path without adding a backend mock response.
 */

import {
  apiPut,
  cleanupCreatedData,
  createBankAccount,
  createLightningDeposit,
  decodeBolt11Prefix,
  decodeLnurl,
  e2eMail,
  ensurePersonalDataComplete,
  expect,
  queryOne,
  selfCustodialLightningLogin,
  test,
  testLightningWallet,
  TEST_IBAN,
  trackRow,
  withDb,
} from './fixtures';

const LNURL_PAY_URL = 'http://localhost:80/lnurlp/e2e';
const SELL_AMOUNT_BTC = 0.0025;

interface LightningAssetRow {
  id: number;
  name: string;
  blockchain: string;
  sellable: boolean;
}

interface FiatRow {
  id: number;
  name: string;
}

interface LightningSellPaymentInfo {
  amount: number;
  blockchain: string;
  depositAddress?: string;
  isValid: boolean;
  paymentRequest?: string;
}

interface RequiredKycDataRow {
  accountType: string | null;
  mail: string | null;
  phone: string | null;
  firstname: string | null;
  surname: string | null;
  street: string | null;
  location: string | null;
  zip: string | null;
  countryId: number | null;
}

test.describe.configure({ mode: 'serial' });

test.describe('Lightning sell after self-custodial login', () => {
  test.afterAll(async () => {
    await cleanupCreatedData();
  });

  test('returns the configured LNURL and a BOLT-11 payment request', async () => {
    const wallet = testLightningWallet();
    const jwt = await selfCustodialLightningLogin(wallet);

    const user = await queryOne<{ id: number; userDataId: number }>(
      `SELECT id, "userDataId" AS "userDataId" FROM "user" WHERE address = $1 LIMIT 1`,
      [wallet.address],
    );
    if (!user) throw new Error(`Lightning login created no user row for address ${wallet.address}`);

    const deposit = await createLightningDeposit(LNURL_PAY_URL);
    const lnurl = deposit.address;
    expect(lnurl).toMatch(/^LNURL1/);
    expect(decodeLnurl(lnurl)).toBe(LNURL_PAY_URL);

    // Register parents in dependency-safe order: cleanup runs in reverse, so the user (and the
    // API-written sell route beneath it) is deleted before the deposit that route references.
    trackRow('user_data', user.userDataId);
    trackRow('user', user.id);

    await apiPut<unknown>(
      'user/mail',
      { mail: e2eMail(`sell-lightning-${wallet.address.slice(-12)}`) },
      { jwt, version: 'v2', expectOk: true },
    );
    await ensurePersonalDataComplete(user.userDataId, { country: 'CH' });
    const personalData = await queryOne<RequiredKycDataRow>(
      `SELECT "accountType" AS "accountType", mail, phone, firstname, surname, street, location, zip,
              "countryId" AS "countryId"
       FROM user_data
       WHERE id = $1`,
      [user.userDataId],
    );
    if (!personalData) throw new Error(`Lightning sell user_data row ${user.userDataId} disappeared`);

    const requiredKycFields: [string, string | number | null][] = [
      ['accountType', personalData.accountType],
      ['mail', personalData.mail],
      ['phone', personalData.phone],
      ['firstname', personalData.firstname],
      ['surname', personalData.surname],
      ['street', personalData.street],
      ['location', personalData.location],
      ['zip', personalData.zip],
      ['country', personalData.countryId],
    ];
    const missingRequiredKycFields = requiredKycFields
      .filter(([, value]) => value == null || value === '')
      .map(([field]) => field);
    if (missingRequiredKycFields.length > 0) {
      throw new Error(`Lightning sell KYC precondition missing fields: ${missingRequiredKycFields.join(', ')}`);
    }

    await withDb(async (client) => {
      await client.query(`UPDATE user_data SET "kycLevel" = 30 WHERE id = $1`, [user.userDataId]);
    });
    await createBankAccount(jwt, { iban: TEST_IBAN, label: 'Lightning sell E2E' });

    const asset = await queryOne<LightningAssetRow>(
      `SELECT id, name, blockchain, sellable
       FROM asset
       WHERE name = 'BTC' AND blockchain = 'Lightning' AND sellable = true AND "comingSoon" = false
       LIMIT 1`,
    );
    if (!asset) throw new Error('Seed has no sellable, available Lightning/BTC asset');

    const fiat = await queryOne<FiatRow>(
      `SELECT id, name FROM fiat WHERE name = 'CHF' AND buyable = true LIMIT 1`,
    );
    if (!fiat) throw new Error('Seed has no buyable CHF fiat currency');

    const paymentInfo = await apiPut<LightningSellPaymentInfo>(
      'sell/paymentInfos',
      {
        iban: TEST_IBAN,
        asset: { id: asset.id },
        currency: { id: fiat.id },
        amount: SELL_AMOUNT_BTC,
        exactPrice: false,
      },
      { jwt },
    );

    expect(paymentInfo.isValid, JSON.stringify(paymentInfo)).toBe(true);
    expect(paymentInfo.blockchain).toBe('Lightning');
    expect(paymentInfo.depositAddress).toBe(lnurl);
    if (!paymentInfo.paymentRequest) throw new Error('Valid Lightning sell returned no payment request');
    expect(decodeBolt11Prefix(paymentInfo.paymentRequest)).toBe('lnbc2500u');
    expect(paymentInfo.amount).toBeGreaterThan(0);
  });
});
