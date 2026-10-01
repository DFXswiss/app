import { appOrigin } from '../util/app-origin';

describe('appOrigin', () => {
  const originalEnv = process.env.REACT_APP_PUBLIC_URL;
  const originalLocation = window.location;

  beforeEach(() => {
    delete process.env.REACT_APP_PUBLIC_URL;
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { origin: 'https://embedding.example.org' },
    });
  });

  afterAll(() => {
    if (originalEnv === undefined) {
      delete process.env.REACT_APP_PUBLIC_URL;
    } else {
      process.env.REACT_APP_PUBLIC_URL = originalEnv;
    }
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  it('returns the env var when set', () => {
    process.env.REACT_APP_PUBLIC_URL = 'https://app.example.com';
    expect(appOrigin()).toBe('https://app.example.com');
  });

  it('strips trailing slashes from the env var', () => {
    process.env.REACT_APP_PUBLIC_URL = 'https://app.example.com///';
    expect(appOrigin()).toBe('https://app.example.com');
  });

  it('falls back to window.location.origin when the env var is unset', () => {
    expect(appOrigin()).toBe('https://embedding.example.org');
  });

  it('falls back to window.location.origin when the env var is empty', () => {
    process.env.REACT_APP_PUBLIC_URL = '';
    expect(appOrigin()).toBe('https://embedding.example.org');
  });
});
