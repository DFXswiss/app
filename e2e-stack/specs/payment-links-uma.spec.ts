/**
 * UMA on-chain settlement at the OpenCryptoPay LNURL-pay callback.
 *
 * Pure API cases (fetch, no browser). Proves the chain through a real API and Postgres that
 * unit tests cannot: GET /v1/lnurlp/cb/:id honours settlementLayer/settlementAsset only when
 * the cashier lists PayToAddress and neither method nor asset is sent; otherwise the existing
 * BOLT11 path stays in place. The payRequest (GET /v1/lnurlp/:id) announces settlementOptions
 * only for a PayToAddress cashier.
 *
 * createPaymentLink cannot set payment_link.config (JSON text, merged over DefaultPaymentLinkConfig)
 * and produces a uniqueId without the `pl_` prefix LnUrlForwardService.PAYMENT_LINK_PREFIX requires,
 * so both are applied with the same SQL UPDATE pattern the other specs use. A labelled `route` row
 * is attached because createPayRequest reads paymentLink.route.route.label with no null guard.
 */

import { expect, test } from '@playwright/test';
import {
  cleanupCreatedData,
  createPaymentLink,
  createUser,
  queryOne,
  queryRows,
  required,
  trackRow,
} from './fixtures';

test.describe.configure({ mode: 'serial' });

test.describe('UMA on-chain settlement at OpenCryptoPay callback', () => {
  test.afterAll(async () => {
    await cleanupCreatedData();
  });

  // LUD-06 amount is millisatoshi even when UMA names a non-BTC settlement asset.
  // 1e9 msat = 0.01 BTC — far from a tens-of-CHF invoice in USDT, so swapping the two
  // magnitudes cannot hide behind "is defined".
  const UMA_MSAT = 1_000_000_000;
  const MSAT_AS_BTC = UMA_MSAT / 1e3 / 1e8;

  test('cashier without PayToAddress still returns a BOLT11 invoice when UMA params are sent', async () => {
    const cashier = await prepareCashier({ tag: 'uma-def', amount: 21, payToAddress: false });
    const payRequest = await getOk<PayRequestDto>(`/v1/lnurlp/${cashier.uniqueId}`);

    const body = await getOk<Bolt11Dto>(`/v1/lnurlp/cb/${cashier.uniqueId}`, {
      amount: String(payRequest.minSendable),
      settlementLayer: 'ethereum',
      settlementAsset: 'usdt',
    });
    await trackPaymentDerivatives(cashier.paymentId);

    expect(body.pr, 'default cashier must keep the Lightning invoice').toMatch(/^lnbc/i);
    expect(body, 'default cashier must not return an on-chain payment URI').not.toHaveProperty('uri');
  });

  test('cashier with PayToAddress returns an Ethereum URI whose amount is the quote transfer amount, not msat', async () => {
    await requirePaymentAsset('Ethereum/USDT');
    const cashier = await prepareCashier({ tag: 'uma-pta', amount: 34, payToAddress: true });

    const body = await getOk<OnChainDto>(`/v1/lnurlp/cb/${cashier.uniqueId}`, {
      amount: String(UMA_MSAT),
      settlementLayer: 'ethereum',
      settlementAsset: 'usdt',
    });
    await trackPaymentDerivatives(cashier.paymentId);

    expect(body.blockchain).toBe('Ethereum');
    expect(body.uri, 'PayToAddress callback must return an EIP-681 URI').toMatch(/^ethereum:/i);
    expect(body.hint).toBeTruthy();
    expect(body.expiryDate).toBeTruthy();

    const activation = required(
      await queryOne<{
        amount: number;
        paymentRequest: string;
        transferAmounts: string;
        decimals: number;
      }>(
        `SELECT pa.amount, pa."paymentRequest" AS "paymentRequest", pq."transferAmounts" AS "transferAmounts",
                a.decimals
         FROM payment_activation pa
         JOIN payment_quote pq ON pq.id = pa."quoteId"
         JOIN asset a ON a.id = pa."assetId"
         WHERE pa."paymentId" = $1
         ORDER BY pa.id DESC
         LIMIT 1`,
        [cashier.paymentId],
      ),
      'PayToAddress callback must persist a payment_activation with a quote',
    );

    expect(body.uri).toBe(activation.paymentRequest);

    const quoteAmount = usdtAmountFromTransferAmounts(activation.transferAmounts);
    const activationAmount = Number(activation.amount);
    expect(activationAmount).toBe(quoteAmount);
    expect(activationAmount).not.toBe(UMA_MSAT);
    expect(activationAmount).not.toBe(MSAT_AS_BTC);
    expect(activationAmount).toBeGreaterThan(cashier.amount * 0.1);
    expect(activationAmount).toBeLessThan(cashier.amount * 10);

    const uriAmount = amountFromEthereumUri(required(body.uri, 'on-chain response uri'), Number(activation.decimals));
    expect(uriAmount).toBeCloseTo(quoteAmount, 6);
    expect(uriAmount).not.toBe(UMA_MSAT);
    expect(uriAmount).not.toBeCloseTo(MSAT_AS_BTC, 8);
  });

  test('payRequest announces settlementOptions only when the cashier offers PayToAddress', async () => {
    const without = await prepareCashier({ tag: 'uma-so-off', amount: 22, payToAddress: false });
    const withPta = await prepareCashier({ tag: 'uma-so-on', amount: 23, payToAddress: true });

    const defaultPayRequest = await getOk<PayRequestDto>(`/v1/lnurlp/${without.uniqueId}`);
    const ptaPayRequest = await getOk<PayRequestDto>(`/v1/lnurlp/${withPta.uniqueId}`);
    await trackPaymentDerivatives(without.paymentId);
    await trackPaymentDerivatives(withPta.paymentId);

    expect(defaultPayRequest.tag).toBe('payRequest');
    expect(defaultPayRequest, 'default cashier must omit settlementOptions').not.toHaveProperty('settlementOptions');

    expect(ptaPayRequest.tag).toBe('payRequest');
    expect(ptaPayRequest.settlementOptions, 'PayToAddress cashier must announce settlementOptions').toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          settlementLayer: 'ethereum',
          assets: expect.arrayContaining([expect.objectContaining({ identifier: expect.stringMatching(/^usdt$/i) })]),
        }),
      ]),
    );
  });

  test('method and asset take precedence over UMA settlement params on a PayToAddress cashier', async () => {
    await requirePaymentAsset('Ethereum/USDT');
    const cashier = await prepareCashier({ tag: 'uma-prec', amount: 47, payToAddress: true });

    const payRequest = await getOk<PayRequestDto>(`/v1/lnurlp/${cashier.uniqueId}`);
    const quoteAmount = usdtAmountFromTransferAmounts(payRequest.transferAmounts);

    const body = await getOk<OnChainDto>(`/v1/lnurlp/cb/${cashier.uniqueId}`, {
      quote: payRequest.quote.id,
      method: 'Ethereum',
      asset: 'USDT',
      amount: String(quoteAmount),
      settlementLayer: 'bitcoin',
      settlementAsset: 'btc',
    });
    await trackPaymentDerivatives(cashier.paymentId);

    expect(body.blockchain).toBe('Ethereum');
    expect(body.uri).toMatch(/^ethereum:/i);
    expect(body.blockchain).not.toBe('Bitcoin');
    expect(body.uri).not.toMatch(/^bitcoin:/i);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAYMENT_LINK_PREFIX = 'pl_';

interface Cashier {
  uniqueId: string;
  paymentLinkId: number;
  paymentId: number;
  amount: number;
}

interface Bolt11Dto {
  pr?: string;
}

interface OnChainDto {
  uri?: string;
  blockchain?: string;
  hint?: string;
  expiryDate?: string;
}

interface TransferAmountDto {
  method: string;
  available?: boolean;
  assets?: Array<{ asset: string; amount?: number | string }>;
}

interface PayRequestDto {
  tag: string;
  minSendable: number;
  quote: { id: string };
  settlementOptions?: Array<{ settlementLayer: string; assets: Array<{ identifier: string }> }>;
  transferAmounts: TransferAmountDto[];
}

function apiBase(): string {
  return process.env.E2E_API_URL ?? 'http://api:3000';
}

async function getOk<T>(path: string, query: Record<string, string> = {}): Promise<T> {
  const url = new URL(path, `${apiBase()}/`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url);
  const text = await res.text();
  let body: unknown = text;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      // keep raw text
    }
  } else {
    body = undefined;
  }
  if (res.status < 200 || res.status >= 300) {
    const preview = text.slice(0, 800);
    throw new Error(`GET ${url.pathname}${url.search} failed: HTTP ${res.status} — ${preview}`);
  }
  return body as T;
}

/**
 * Factory uniqueId is `pl${tag}` without underscore; the lnurlp forwarder only treats ids
 * starting with `pl_` (Config.prefixes.paymentLinkUidPrefix + '_') as payment links.
 */
async function prepareCashier(options: { tag: string; amount: number; payToAddress?: boolean }): Promise<Cashier> {
  const user = await createUser({
    tag: options.tag,
    language: 'EN',
    kycLevel: 30,
    completePersonalData: true,
  });
  const pl = await createPaymentLink(user.jwt, {
    tag: options.tag,
    amount: options.amount,
    label: `e2e-uma-${options.tag}`,
  });
  if (pl.paymentId == null || pl.routeId == null) {
    throw new Error('createPaymentLink must return paymentId and routeId');
  }

  const uniqueId = `${PAYMENT_LINK_PREFIX}${pl.uniqueId.replace(/^pl/, '')}`.slice(0, 32);
  await queryRows(`UPDATE payment_link SET "uniqueId" = $1 WHERE id = $2`, [uniqueId, pl.paymentLinkId]);

  const routeLabel = `e2e-uma-route-${options.tag}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  const baseRoute = await queryOne<{ id: number }>(`INSERT INTO route (label) VALUES ($1) RETURNING id`, [routeLabel]);
  if (!baseRoute) throw new Error('failed to insert route label for createPayRequest');
  trackRow('route', baseRoute.id);
  await queryRows(`UPDATE deposit_route SET "routeId" = $1 WHERE id = $2`, [baseRoute.id, pl.routeId]);

  if (options.payToAddress) {
    await queryRows(`UPDATE payment_link SET config = $1 WHERE id = $2`, [
      JSON.stringify({ standards: ['PayToAddress'] }),
      pl.paymentLinkId,
    ]);
  }

  return { uniqueId, paymentLinkId: pl.paymentLinkId, paymentId: pl.paymentId, amount: options.amount };
}

async function requirePaymentAsset(uniqueName: string): Promise<void> {
  required(
    await queryOne<{ id: number }>(
      `SELECT id FROM asset WHERE "uniqueName" = $1 AND "paymentEnabled" = true LIMIT 1`,
      [uniqueName],
    ),
    `payment-enabled asset ${uniqueName} must be seeded`,
  );
}

async function trackPaymentDerivatives(paymentId: number): Promise<void> {
  const quotes = await queryRows<{ id: number }>(`SELECT id FROM payment_quote WHERE "paymentId" = $1`, [paymentId]);
  for (const quote of quotes) trackRow('payment_quote', quote.id);
  const activations = await queryRows<{ id: number }>(`SELECT id FROM payment_activation WHERE "paymentId" = $1`, [
    paymentId,
  ]);
  for (const activation of activations) trackRow('payment_activation', activation.id);
}

function usdtAmountFromTransferAmounts(transferAmounts: string | TransferAmountDto[]): number {
  const parsed: TransferAmountDto[] =
    typeof transferAmounts === 'string' ? (JSON.parse(transferAmounts) as TransferAmountDto[]) : transferAmounts;
  const ethereum = parsed.find((entry) => entry.method.toLowerCase() === 'ethereum');
  const usdt = ethereum?.assets?.find((asset) => asset.asset.toLowerCase() === 'usdt');
  const amount = usdt?.amount != null ? Number(usdt.amount) : NaN;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Ethereum/USDT transfer amount missing or not positive: ${JSON.stringify(usdt)}`);
  }
  return amount;
}

function amountFromEthereumUri(uri: string, decimals: number): number {
  const match = uri.match(/[?&](?:uint256|value)=(\d+)/);
  if (!match) throw new Error(`ethereum URI has no uint256/value amount: ${uri}`);
  return Number(match[1]) / 10 ** decimals;
}
