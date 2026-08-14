import { readFileAsBase64 } from '../screens/kyc-file-upload';

describe('readFileAsBase64', () => {
  it('rejects when FileReader fails', async () => {
    const fail = new Error('disk');
    const Original = FileReader;
    class MockReader {
      result: string | null = null;
      error: Error | null = fail;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() {
        this.onerror?.();
      }
    }
    (global as unknown as { FileReader: unknown }).FileReader = MockReader;
    await expect(readFileAsBase64(new File(['x'], 'id.png'))).rejects.toBe(fail);
    (global as unknown as { FileReader: unknown }).FileReader = Original;
  });

  it('rejects with a fallback error when FileReader.error is empty', async () => {
    const Original = FileReader;
    class MockReader {
      result: string | null = null;
      error: null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() {
        this.onerror?.();
      }
    }
    (global as unknown as { FileReader: unknown }).FileReader = MockReader;
    await expect(readFileAsBase64(new File(['x'], 'id.png'))).rejects.toMatchObject({ message: 'read failed' });
    (global as unknown as { FileReader: unknown }).FileReader = Original;
  });
});
