/**
 * Thin typed fetch wrapper for the e2e-stack API.
 * Base URL: E2E_API_URL (default http://api:3000). Paths are relative to /v1 or /v2.
 *
 * Deliberately not the `@dfx.swiss/react` SDK that CONTRIBUTING.md requires everywhere else
 * ("API access goes through the SDK"): that package is a React hooks package built around the
 * component lifecycle (context providers, hooks) and cannot run outside a mounted React tree.
 * These fixtures run as plain Node.js code in the Playwright test process, with no component
 * tree to mount them in, so the SDK is not an option here — this file is the harness's one
 * deliberate, documented exception to that rule.
 */

export interface ApiOptions {
  jwt?: string;
  version?: 'v1' | 'v2';
  /** When true (default), non-2xx responses throw with method, path, status, and body. */
  expectOk?: boolean;
}

const DEFAULT_BASE = 'http://api:3000';

function baseUrl(): string {
  return (process.env.E2E_API_URL ?? DEFAULT_BASE).replace(/\/$/, '');
}

function fullPath(path: string, version: 'v1' | 'v2' = 'v1'): string {
  const cleaned = path.startsWith('/') ? path : `/${path}`;
  return `/${version}${cleaned}`;
}

async function request<T>(method: string, path: string, body: unknown | undefined, options: ApiOptions = {}): Promise<T> {
  const version = options.version ?? 'v1';
  const relative = fullPath(path, version);
  const url = `${baseUrl()}${relative}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.jwt) {
    headers.Authorization = `Bearer ${options.jwt}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let parsed: unknown = text;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // keep raw text
    }
  } else {
    parsed = undefined;
  }

  const expectOk = options.expectOk !== false;
  if (expectOk && (res.status < 200 || res.status >= 300)) {
    const bodyPreview =
      typeof parsed === 'string' ? parsed : parsed !== undefined ? JSON.stringify(parsed) : '(empty body)';
    throw new Error(`${method} ${relative} failed: HTTP ${res.status} — ${bodyPreview}`);
  }

  return parsed as T;
}

export async function apiGet<T>(path: string, options?: ApiOptions): Promise<T> {
  return request<T>('GET', path, undefined, options);
}

export async function apiPost<T>(path: string, body: unknown, options?: ApiOptions): Promise<T> {
  return request<T>('POST', path, body, options);
}

export async function apiPut<T>(path: string, body: unknown, options?: ApiOptions): Promise<T> {
  return request<T>('PUT', path, body, options);
}

export async function apiDelete<T>(path: string, options?: ApiOptions): Promise<T> {
  return request<T>('DELETE', path, undefined, options);
}
