/**
 * The API can switch sell or swap transactions off. While a product is off, the endpoints that
 * create or confirm it answer HTTP 503 with the error code `TRANSACTIONS_PAUSED` (for example
 * `POST /v1/sell` or `PUT /v1/swap/paymentInfos`). Every other answer keeps its usual meaning.
 *
 * The harness runs against an API in either state, and it reads the state from the answer it got,
 * never from a flag: a test that needs a sell or swap checks the paused answer (and what the screen
 * shows for it) when it gets one, and runs its usual assertions otherwise.
 */

import { expect, type Page } from '@playwright/test';
import { ApiError } from './api-client';

/** Error code the API sends with HTTP 503 while a transaction type is switched off. */
export const TRANSACTIONS_PAUSED = 'TRANSACTIONS_PAUSED';

export type PausableProduct = 'sell' | 'swap';

export interface PausedResponse {
  status: number;
  code: string;
  message: string;
}

/** The paused answer in `status` / `body`, or undefined when the answer is anything else. */
export function pausedResponse(status: number, body: unknown): PausedResponse | undefined {
  if (status !== 503 || typeof body !== 'object' || body === null) return undefined;
  const { code, message } = body as { code?: unknown; message?: unknown };
  if (code !== TRANSACTIONS_PAUSED) return undefined;
  return { status, code, message: typeof message === 'string' ? message : '' };
}

/** Thrown by a factory whose API call got the paused answer. */
export class TransactionsPausedError extends Error {
  constructor(
    readonly product: PausableProduct,
    readonly response: PausedResponse,
    cause: ApiError,
  ) {
    super(`${product} transactions are paused: ${cause.message}`);
  }
}

/** Runs an API call; a paused answer is rethrown as TransactionsPausedError, anything else unchanged. */
export async function pausable<T>(product: PausableProduct, call: Promise<T>): Promise<T> {
  try {
    return await call;
  } catch (e: unknown) {
    const paused = e instanceof ApiError ? pausedResponse(e.status, e.body) : undefined;
    if (paused && e instanceof ApiError) throw new TransactionsPausedError(product, paused, e);
    throw e;
  }
}

/** Resolves to the TransactionsPausedError instead of rejecting with it; other failures still reject. */
export async function orPaused<T>(call: Promise<T>): Promise<T | TransactionsPausedError> {
  try {
    return await call;
  } catch (e: unknown) {
    if (e instanceof TransactionsPausedError) return e;
    throw e;
  }
}

/** Asserts that the API refused `product` with the paused answer. */
export function expectTransactionsPaused(error: TransactionsPausedError, product: PausableProduct): void {
  expect(error.product).toBe(product);
  expect(error.response.status).toBe(503);
  expect(error.response.code).toBe(TRANSACTIONS_PAUSED);
  // The API sends one message for every switched-off product (TRANSACTIONS_PAUSED_MESSAGE in the API's
  // transaction-availability.ts); the product is told by the endpoint, not by the text.
  expect(error.response.message, 'the paused answer carries a message').not.toBe('');
}

export interface CapturedResponse {
  status: number;
  body: string;
}

/**
 * For a screen that asks the API for payment information (`PUT …/paymentInfos`): waits for the first
 * answer `latest` returns. When that answer is the paused one for `product`, asserts that the screen
 * shows the API's message and no payment information, and returns the answer. Otherwise returns
 * undefined, and the caller's usual assertions decide — including when no answer came in time.
 */
export async function expectPausedQuoteOnScreen(
  page: Page,
  latest: () => CapturedResponse | null,
  product: PausableProduct,
  timeoutMs = 25000,
): Promise<PausedResponse | undefined> {
  const started = Date.now();
  while (!latest() && Date.now() - started < timeoutMs) {
    await page.waitForTimeout(250);
  }
  const captured = latest();
  if (!captured) return undefined;

  let body: unknown;
  try {
    body = JSON.parse(captured.body);
  } catch {
    return undefined;
  }
  const paused = pausedResponse(captured.status, body);
  if (!paused) return undefined;

  // The API sends one message for every switched-off product (TRANSACTIONS_PAUSED_MESSAGE in the API's
  // transaction-availability.ts); the product is told by the endpoint, not by the text.
  expect(paused.message, 'the paused answer carries a message').not.toBe('');
  await expect(page.getByText(paused.message, { exact: true }).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('heading', { name: 'Payment Information' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Click here once you have issued the transaction/i })).toHaveCount(0);
  return paused;
}
