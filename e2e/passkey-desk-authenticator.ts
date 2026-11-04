import type { Page } from '@playwright/test';

/** Fixed credential id bytes. The mocked wallet row must use the same base64url id. */
export const DESK_CREDENTIAL_BYTES = Array.from({ length: 32 }, (_, index) => index + 3);

/** Fixed 32-byte PRF output. Registration, unlock and the recovery words all derive from it. */
export const DESK_PRF_BYTES = Array.from({ length: 32 }, (_, index) => (index * 7 + 3) & 255);

export function deskBase64Url(bytes: number[]): string {
  return Buffer.from(bytes).toString('base64url');
}

/**
 * In-page authenticator for the handbook shots. It is not a virtual authenticator and it does not
 * produce a signature the API would accept. The full-stack spec covers that path.
 */
export async function installDeskAuthenticator(page: Page, getReturnsPrf: boolean): Promise<void> {
  await page.addInitScript(
    ({ credentialBytes, prfBytes, withPrf }) => {
      const flag = '__passkeyPlatformReady';

      function bufferFrom(bytes: number[]): ArrayBuffer {
        const buffer = new ArrayBuffer(bytes.length);
        new Uint8Array(buffer).set(bytes);
        return buffer;
      }

      function base64Url(buffer: ArrayBuffer): string {
        const view = new Uint8Array(buffer);
        let binary = '';
        for (const byte of view) binary += String.fromCharCode(byte);
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
      }

      const rawId = bufferFrom(credentialBytes);
      const prf = new Uint8Array(bufferFrom(prfBytes));
      const id = base64Url(rawId);

      function credential(kind: 'create' | 'get', includePrf: boolean): PublicKeyCredential {
        const response =
          kind === 'create'
            ? {
                clientDataJSON: bufferFrom([1, 2, 3, 4]),
                attestationObject: bufferFrom([5, 6, 7, 8]),
                getTransports: () => ['internal'],
              }
            : {
                clientDataJSON: bufferFrom([1, 2, 3, 4]),
                authenticatorData: bufferFrom(Array.from({ length: 37 }, () => 0)),
                signature: bufferFrom([9, 10, 11, 12]),
                userHandle: bufferFrom([13, 14, 15, 16]),
              };
        return {
          id,
          rawId,
          type: 'public-key',
          authenticatorAttachment: 'platform',
          response,
          getClientExtensionResults: () =>
            includePrf ? { prf: { results: { first: new Uint8Array(prf) } } } : {},
        } as unknown as PublicKeyCredential;
      }

      class DeskPublicKeyCredential {
        static getClientCapabilities(): Promise<Record<string, boolean>> {
          Object.defineProperty(window, flag, { configurable: true, value: true });
          return Promise.resolve({ 'extension:prf': true });
        }
      }

      try {
        Object.defineProperty(window, 'PublicKeyCredential', { configurable: true, value: DeskPublicKeyCredential });
      } catch {
        const existing = window.PublicKeyCredential as {
          getClientCapabilities?: () => Promise<Record<string, boolean>>;
        };
        if (existing) existing.getClientCapabilities = DeskPublicKeyCredential.getClientCapabilities;
      }

      try {
        Object.defineProperty(navigator, 'userActivation', {
          configurable: true,
          get: () => ({ isActive: true, hasBeenActive: true }),
        });
      } catch {
        // A browser that refuses the override still has the click's own activation.
      }

      const create = () => Promise.resolve(credential('create', true));
      const get = () => Promise.resolve(credential('get', withPrf));
      const credentials = navigator.credentials;
      if (credentials) {
        credentials.create = create as unknown as CredentialContainer['create'];
        credentials.get = get as unknown as CredentialContainer['get'];
      } else {
        Object.defineProperty(navigator, 'credentials', { configurable: true, value: { create, get } });
      }
    },
    { credentialBytes: DESK_CREDENTIAL_BYTES, prfBytes: DESK_PRF_BYTES, withPrf: getReturnsPrf },
  );
}
