import { StoreKey } from '../hooks/store.hook';

const mockInstallChunkErrorHandling = jest.fn();
const mockReportWebVitals = jest.fn();

jest.mock('react-dom/client', () => ({
  createRoot: () => ({ render: jest.fn() }),
}));

jest.mock('../Main', () => ({
  __esModule: true,
  default: function Main() {
    return <div data-testid="main" />;
  },
}));

jest.mock('../reportWebVitals', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockReportWebVitals(...args),
}));

jest.mock('../util/client-error', () => ({
  installChunkErrorHandling: () => mockInstallChunkErrorHandling(),
}));

describe('index entry credentialed-load storage clear', () => {
  const originalLocation = window.location;

  function seedStorage(): void {
    window.localStorage.setItem(StoreKey.AUTH_TOKEN, 'stale');
    window.localStorage.setItem(StoreKey.ACTIVE_WALLET, 'MetaMask');
    window.localStorage.setItem(StoreKey.QUERY_PARAMS, '{"mail":"prev@example.com"}');
    window.localStorage.setItem(StoreKey.LANGUAGE, 'de');
    window.sessionStorage.setItem('keep-session', 'yes');
  }

  function loadIndex(search: string): void {
    document.getElementById('root')?.remove();
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, search },
    });
    jest.isolateModules(() => {
      require('../index');
    });
  }

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    window.localStorage.clear();
    window.sessionStorage.clear();
    mockInstallChunkErrorHandling.mockClear();
    mockReportWebVitals.mockClear();
    document.getElementById('root')?.remove();
  });

  it('clears the StoreKey credential-load keys when the URL has a session', () => {
    seedStorage();
    loadIndex('?session=token');
    expect(window.localStorage.getItem(StoreKey.AUTH_TOKEN)).toBeNull();
    expect(window.localStorage.getItem(StoreKey.ACTIVE_WALLET)).toBeNull();
    expect(window.localStorage.getItem(StoreKey.QUERY_PARAMS)).toBeNull();
    expect(window.localStorage.getItem(StoreKey.LANGUAGE)).toBe('de');
    expect(window.sessionStorage.getItem('keep-session')).toBeNull();
    expect(mockInstallChunkErrorHandling).toHaveBeenCalled();
    expect(mockReportWebVitals).toHaveBeenCalled();
  });

  it('clears the StoreKey credential-load keys when the URL has address and signature', () => {
    seedStorage();
    loadIndex('?address=0xabc&signature=0xsig');
    expect(window.localStorage.getItem(StoreKey.AUTH_TOKEN)).toBeNull();
    expect(window.localStorage.getItem(StoreKey.ACTIVE_WALLET)).toBeNull();
    expect(window.localStorage.getItem(StoreKey.QUERY_PARAMS)).toBeNull();
    expect(window.localStorage.getItem(StoreKey.LANGUAGE)).toBe('de');
  });

  it('leaves storage alone when the URL has no credentials', () => {
    seedStorage();
    loadIndex('');
    expect(window.localStorage.getItem(StoreKey.AUTH_TOKEN)).toBe('stale');
    expect(window.localStorage.getItem(StoreKey.ACTIVE_WALLET)).toBe('MetaMask');
    expect(window.localStorage.getItem(StoreKey.QUERY_PARAMS)).toBe('{"mail":"prev@example.com"}');
    expect(window.sessionStorage.getItem('keep-session')).toBe('yes');
  });

  it('leaves storage alone when the URL has only an address', () => {
    seedStorage();
    loadIndex('?address=0xabc');
    expect(window.localStorage.getItem(StoreKey.AUTH_TOKEN)).toBe('stale');
  });

  it('leaves storage alone when the URL has only a signature', () => {
    seedStorage();
    loadIndex('?signature=0xsig');
    expect(window.localStorage.getItem(StoreKey.AUTH_TOKEN)).toBe('stale');
  });
});
