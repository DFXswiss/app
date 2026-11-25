import { createDecipheriv } from 'node:crypto';

const ENCRYPTED_PREFIX = 'enc:v1:';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Key ring from E2E_PII_ENCRYPTION_KEYS: `<keyId>:<base64 of 32 bytes>`, comma-separated like the API's. */
function piiKey(keyId: string): Buffer {
  const ring = process.env.E2E_PII_ENCRYPTION_KEYS;
  if (!ring) {
    throw new Error(
      'decryptPii: E2E_PII_ENCRYPTION_KEYS is not set, but the database returned an encrypted value (expected to be set via compose.tests.yml in the stack, matching PII_ENCRYPTION_KEYS in env/api.env, or to the PII_ENCRYPTION_KEYS of the local API when a spec runs against a local API)',
    );
  }

  for (const entry of ring.split(',').map((e) => e.trim())) {
    const separator = entry.indexOf(':');
    if (separator < 0 || entry.slice(0, separator) !== keyId) continue;

    const key = Buffer.from(entry.slice(separator + 1), 'base64');
    if (key.length !== KEY_BYTES) {
      throw new Error(`decryptPii: key "${keyId}" must be ${KEY_BYTES} bytes, got ${key.length}`);
    }
    return key;
  }

  throw new Error(`decryptPii: key "${keyId}" is not in E2E_PII_ENCRYPTION_KEYS`);
}

/**
 * Plaintext of a column the API encrypts at rest (backend src/shared/pii/pii-encrypted-columns.ts).
 *
 * Encrypted values read `enc:v1:<keyId>:<base64(iv | ciphertext | tag)>` (AES-256-GCM). A value without
 * the prefix is legacy plaintext, or was written by a fixture, and is returned unchanged. An unknown
 * key or a damaged value throws.
 */
export function decryptPii(value: string): string;
export function decryptPii(value: string | null): string | null;
export function decryptPii(value: string | null): string | null {
  if (value === null || !value.startsWith(ENCRYPTED_PREFIX)) return value;

  const body = value.slice(ENCRYPTED_PREFIX.length);
  const separator = body.indexOf(':');
  if (separator < 1) throw new Error('decryptPii: encrypted value has no key id');

  const keyId = body.slice(0, separator);
  const key = piiKey(keyId);
  const payload = Buffer.from(body.slice(separator + 1), 'base64');
  if (payload.length < IV_BYTES + TAG_BYTES) {
    throw new Error(`decryptPii: encrypted value is too short (${payload.length} bytes, key "${keyId}")`);
  }

  const decipher = createDecipheriv('aes-256-gcm', key, payload.subarray(0, IV_BYTES), { authTagLength: TAG_BYTES });
  decipher.setAuthTag(payload.subarray(payload.length - TAG_BYTES));
  try {
    const ciphertext = payload.subarray(IV_BYTES, payload.length - TAG_BYTES);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (e) {
    throw new Error(`decryptPii: value does not decrypt with key "${keyId}": ${e}`);
  }
}
