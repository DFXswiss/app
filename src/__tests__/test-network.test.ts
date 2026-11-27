const mockApi = { url: '' };

jest.mock('../config/api', () => ({
  get Api() {
    return mockApi;
  },
}));

import { BITCOIN_REGTEST, isTestApiUrl, isTestEnvironment, testWalletEnv, testWalletEnvOf } from '../util/test-network';

describe('test-network', () => {
  it.each([
    ['https://dev.api.dfx.swiss', 'dev'],
    ['https://stg.api.dfx.swiss', 'stg'],
    ['https://stg.api.dfx.swiss/', 'stg'],
    ['http://localhost:3000', 'loc'],
    ['http://127.0.0.1:3000', 'loc'],
  ])('treats %s as the test API of %s', (url, env) => {
    expect(isTestApiUrl(url)).toBe(true);
    expect(testWalletEnvOf(url)).toBe(env);
  });

  it.each([
    'https://api.dfx.swiss',
    'https://evil.example/stg.api.dfx.swiss',
    'https://stg.api.dfx.swiss.evil.example',
    'https://constructor',
    'https://tostring',
    '',
  ])('treats %j as production', (url) => {
    expect(isTestApiUrl(url)).toBe(false);
    expect(testWalletEnvOf(url)).toBeUndefined();
  });

  it('fails closed on a URL it cannot parse', () => {
    expect(isTestApiUrl('not a url')).toBe(false);
  });

  it('reads the compiled API URL', () => {
    mockApi.url = 'https://stg.api.dfx.swiss';
    expect(isTestEnvironment()).toBe(true);
    expect(testWalletEnv()).toBe('stg');
    mockApi.url = 'https://api.dfx.swiss';
    expect(isTestEnvironment()).toBe(false);
    expect(testWalletEnv()).toBeUndefined();
  });

  it('names the regtest chain of the API', () => {
    expect(BITCOIN_REGTEST).toBe('BitcoinRegtest');
  });
});
