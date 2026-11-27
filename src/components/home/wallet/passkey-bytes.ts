// WebAuthn ids are base64url. The wallet package does not export its byte helpers.

export function credentialBytes(id: string): Uint8Array {
  const padded = id.replace(/-/g, '+').replace(/_/g, '/');
  const text = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function credentialIdText(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

// Time does not depend on the position of the first different byte.
export function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left[index] ^ right[index];
  return diff === 0;
}
