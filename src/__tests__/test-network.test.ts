import { isTestNetwork, isTestNetworkHost } from '../util/test-network';

describe('test network gate', () => {
  const originalLocation = window.location;

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it.each(['localhost', '127.0.0.1', 'dev.app.dfx.swiss', 'stg.app.dfx.swiss'])('allows %s', (host) => {
    expect(isTestNetworkHost(host)).toBe(true);
  });

  it.each(['app.dfx.swiss', 'services.dfx.swiss', 'stg.app.dfx.swiss.example.com', ''])('rejects %s', (host) => {
    expect(isTestNetworkHost(host)).toBe(false);
  });

  it('reads the page host', () => {
    Object.defineProperty(window, 'location', { configurable: true, value: { hostname: 'stg.app.dfx.swiss' } });
    expect(isTestNetwork()).toBe(true);
    Object.defineProperty(window, 'location', { configurable: true, value: { hostname: 'app.dfx.swiss' } });
    expect(isTestNetwork()).toBe(false);
  });
});
