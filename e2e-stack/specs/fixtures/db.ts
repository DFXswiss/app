import { Client } from 'pg';

function dbConfig() {
  return {
    host: process.env.E2E_PG_HOST ?? 'sql-dfx-api-loc',
    port: Number(process.env.E2E_PG_PORT ?? '5432'),
    user: process.env.E2E_PG_USER ?? 'sa',
    password: process.env.E2E_PG_PASSWORD ?? 'LocalDev2026',
    database: process.env.E2E_PG_DATABASE ?? 'dfx',
    ssl: false as const,
  };
}

/** Opens a short-lived pg client, runs `fn`, always closes the client in `finally`. */
export async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client(dbConfig());
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function queryRows<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
  return withDb(async (client) => {
    const result = await client.query(sql, params);
    return result.rows as T[];
  });
}

export async function queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined> {
  const rows = await queryRows<T>(sql, params);
  return rows[0];
}

/**
 * Polls until the query returns at least one row, or the timeout elapses.
 * Throws with the last-seen row count and the SQL that was run.
 */
export async function waitForRow<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
  timeoutMs = 15000,
): Promise<T> {
  const started = Date.now();
  const intervalMs = 500;
  let lastCount = 0;

  while (Date.now() - started < timeoutMs) {
    const rows = await queryRows<T>(sql, params);
    lastCount = rows.length;
    if (rows.length > 0) {
      return rows[0];
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`waitForRow timed out after ${timeoutMs}ms (last row count: ${lastCount}). SQL: ${sql}`);
}
