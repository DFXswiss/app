// DFX App 2.0 — KYC document upload payload encoding.
//
// Kept in its own module (no @dfx.swiss/react/@sumsub dependency) so it stays trivially testable
// independent of kyc-steps.tsx's much heavier import graph.

export interface KycFileUpload {
  file: string;
  fileName?: string;
}

/** Reads a browser `File` into the payload shape the KYC document-upload endpoints expect.
 *
 * Must resolve with the *full* data URL ("data:<mime>;base64,<payload>"), not just the base64
 * payload — the API's `Util.fromBase64` (api/src/shared/utils/util.ts) splits the string on
 * `";base64,"` to recover both the content type and the payload, and throws
 * `Buffer.from(undefined, 'base64')` (a 500) when that marker isn't present. The production app's
 * own upload path (src/util/utils.ts `toBase64()`) sends `reader.result` unchanged for the same
 * reason. */
export function readFileAsBase64(file: File): Promise<KycFileUpload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ file: String(reader.result), fileName: file.name });
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}
