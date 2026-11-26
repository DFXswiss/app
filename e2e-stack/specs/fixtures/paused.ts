/**
 * Sell is on in the harness (`!Sell` in `env/api.env`). `expectUnavailableQuoteOnScreen` serves the swap screen and
 * the sell case that pauses sell at runtime; a sell case otherwise treats any refusal as a failure.
 *
 * Swap is off: the API runs with `ENVIRONMENT=loc`, whose feature flag `swap: false` forces the swap process off
 * and leaves the swap routes unmounted, so every swap request answers HTTP 404 with the framework's
 * `Cannot <METHOD> <path>` message. With the flag on and the process off, the API would answer HTTP 503
 * `TRANSACTIONS_PAUSED` instead. A swap case reads which of the two it got from the answer and asserts that one.
 */

import { expect, type Page } from '@playwright/test';
import { ApiError } from './api-client';

/** Error code the API sends with HTTP 503 while a transaction type is switched off. */
export const TRANSACTIONS_PAUSED = 'TRANSACTIONS_PAUSED';

export interface SwapUnavailableResponse {
  kind: 'not-mounted' | 'paused';
  status: number;
  message: string;
}

/** The unmounted-route or paused answer in `status` / `body`, or undefined when the answer is anything else. */
export function swapUnavailableResponse(status: number, body: unknown): SwapUnavailableResponse | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { code, message } = body as { code?: unknown; message?: unknown };
  const text = typeof message === 'string' ? message : '';
  if (status === 404 && /^Cannot [A-Z]+ \//.test(text)) return { kind: 'not-mounted', status, message: text };
  if (status === 503 && code === TRANSACTIONS_PAUSED) return { kind: 'paused', status, message: text };
  return undefined;
}

/** Thrown by the swap factory whose API call got the unmounted-route or paused answer. */
export class SwapUnavailableError extends Error {
  constructor(
    readonly response: SwapUnavailableResponse,
    cause: ApiError,
  ) {
    super(`swap is unavailable (${response.kind}): ${cause.message}`);
  }
}

/** Runs a swap API call; an unmounted-route or paused answer is rethrown as SwapUnavailableError. */
export async function swapCall<T>(call: Promise<T>): Promise<T> {
  try {
    return await call;
  } catch (e: unknown) {
    const unavailable = e instanceof ApiError ? swapUnavailableResponse(e.status, e.body) : undefined;
    if (unavailable && e instanceof ApiError) throw new SwapUnavailableError(unavailable, e);
    throw e;
  }
}

/** Resolves to the SwapUnavailableError instead of rejecting with it; other failures still reject. */
export async function orSwapUnavailable<T>(call: Promise<T>): Promise<T | SwapUnavailableError> {
  try {
    return await call;
  } catch (e: unknown) {
    if (e instanceof SwapUnavailableError) return e;
    throw e;
  }
}

/** Asserts the answer the swap factory got: 404 for an unmounted route, 503 for a paused one, each with a message. */
export function expectSwapUnavailable(error: SwapUnavailableError): void {
  expect(error.response.status).toBe(error.response.kind === 'not-mounted' ? 404 : 503);
  expect(error.response.message, `the ${error.response.kind} answer carries a message`).not.toBe('');
}

export interface CapturedResponse {
  status: number;
  body: string;
}

/**
 * For the swap screen and the sell case that pauses sell at runtime: waits for the first answer `latest` returns to
 * the screen's `PUT /v1/swap/paymentInfos` or `PUT /v1/sell/paymentInfos`. When that answer is the unmounted-route
 * or the paused one, asserts that the screen shows the API's message and no payment information, and returns the
 * answer. Otherwise returns undefined, and the caller's usual assertions decide — including when no answer came in
 * time. Any other sell case treats a refusal as a failure and does not use this helper.
 */
export async function expectUnavailableQuoteOnScreen(
  page: Page,
  latest: () => CapturedResponse | null,
  timeoutMs = 25000,
): Promise<SwapUnavailableResponse | undefined> {
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
  const unavailable = swapUnavailableResponse(captured.status, body);
  if (!unavailable) return undefined;

  expect(unavailable.message, `the ${unavailable.kind} answer carries a message`).not.toBe('');
  await expect(page.getByText(unavailable.message, { exact: true }).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('heading', { name: 'Payment Information' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Click here once you have issued the transaction/i })).toHaveCount(0);
  return unavailable;
}
