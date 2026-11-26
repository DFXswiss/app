// The re-login of a partner launch: after an account merge the API rejects the session of the launch address with
// 401; the launch signature signs in again and the request is sent once more, so the caller (the SDK) never sees the
// 401 and does not log out. Every other 401 reaches the caller unchanged, which logs out as before.

import { installSessionRenewal, launchCredentials } from '../util/session-renewal';

function jwt(payload: object): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.signature`;
}

const SLAVE_SESSION = jwt({ address: '0xlaunch', account: 1 });
const MASTER_SESSION = jwt({ address: '0xlaunch', account: 2 });
const OTHER_SESSION = jwt({ address: '0xother', account: 3 });
const CREDENTIALS = { address: '0xlaunch', signature: '0xsignature', pubkey: 'pubkey' };
const USER_URL = 'https://api.example/v2/user';
const CREDENTIALS_KEY = 'dfx.srv.launchCredentials';

const originalFetch = window.fetch;
let mockFetch: jest.Mock;
let mockRenew: jest.Mock;
let uninstall: () => void;

function answer(status: number): Response {
  return { status } as Response;
}

function authorized(session: string): RequestInit {
  return { method: 'GET', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session}` } };
}

function renewedHeaders(session: string): [string, string][] {
  return [
    ['Content-Type', 'application/json'],
    ['Authorization', `Bearer ${session}`],
  ];
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  mockFetch = jest.fn();
  window.fetch = mockFetch;
  mockRenew = jest.fn().mockResolvedValue(MASTER_SESSION);
  uninstall = installSessionRenewal(mockRenew);
});

afterEach(() => {
  uninstall();
  window.fetch = originalFetch;
});

describe('launchCredentials', () => {
  it('keeps the launch credentials in sessionStorage only and removes them', () => {
    launchCredentials.set(CREDENTIALS);

    expect(launchCredentials.get()).toEqual(CREDENTIALS);
    expect(JSON.parse(sessionStorage.getItem(CREDENTIALS_KEY) as string)).toEqual(CREDENTIALS);
    expect(localStorage.getItem(CREDENTIALS_KEY)).toBeNull();

    launchCredentials.remove();

    expect(launchCredentials.get()).toBeUndefined();
  });
});

describe('installSessionRenewal', () => {
  beforeEach(() => launchCredentials.set(CREDENTIALS));

  it('signs in again with the launch signature after a 401 and resends the request with the new session', async () => {
    const renewed = answer(200);
    mockFetch.mockResolvedValueOnce(answer(401)).mockResolvedValueOnce(renewed);

    const result = await window.fetch(USER_URL, authorized(SLAVE_SESSION));

    expect(result).toBe(renewed);
    expect(mockRenew).toHaveBeenCalledWith(CREDENTIALS);
    expect(mockFetch).toHaveBeenLastCalledWith(USER_URL, { method: 'GET', headers: renewedHeaders(MASTER_SESSION) });
  });

  it('passes a response that is not a 401 through untouched', async () => {
    const ok = answer(200);
    mockFetch.mockResolvedValueOnce(ok);

    expect(await window.fetch(new URL(USER_URL), authorized(SLAVE_SESSION))).toBe(ok);
    expect(mockRenew).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns the 401 without launch credentials, so the caller logs out as before', async () => {
    launchCredentials.remove();
    const rejected = answer(401);
    mockFetch.mockResolvedValueOnce(rejected);

    expect(await window.fetch(USER_URL, authorized(SLAVE_SESSION))).toBe(rejected);
    expect(mockRenew).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a session of another address', authorized(OTHER_SESSION)],
    ['a session that is no JWT', { headers: { Authorization: 'Bearer not-a-jwt' } }],
    ['no bearer session', { headers: { Authorization: 'Basic credentials' } }],
    ['no headers', {}],
    ['no request options', undefined],
  ])('returns the 401 of a request with %s', async (_name, init) => {
    const rejected = answer(401);
    mockFetch.mockResolvedValueOnce(rejected);

    expect(await window.fetch(USER_URL, init)).toBe(rejected);
    expect(mockRenew).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the sign-in', 'https://api.example/v1/auth'],
    ['the sign message', 'https://api.example/v1/auth/signMessage?address=0xlaunch'],
    ['a request object of the sign-in', { url: 'https://api.example/v1/auth?x=1' }],
  ])('returns the 401 of %s without signing in again', async (_name, input) => {
    const rejected = answer(401);
    mockFetch.mockResolvedValueOnce(rejected);

    expect(await window.fetch(input as RequestInfo, authorized(SLAVE_SESSION))).toBe(rejected);
    expect(mockRenew).not.toHaveBeenCalled();
  });

  it('returns the 401 when the re-login fails, so the caller logs out as before', async () => {
    mockRenew.mockRejectedValueOnce(new Error('sign-in failed'));
    const rejected = answer(401);
    mockFetch.mockResolvedValueOnce(rejected);

    expect(await window.fetch(USER_URL, authorized(SLAVE_SESSION))).toBe(rejected);
    expect(mockRenew).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('signs in once for a burst of 401s with the same session and resends each request', async () => {
    mockFetch.mockImplementation((_url: string, init: RequestInit) =>
      Promise.resolve(answer(JSON.stringify(init.headers).includes(SLAVE_SESSION) ? 401 : 200)),
    );

    const results = await Promise.all([
      window.fetch(USER_URL, authorized(SLAVE_SESSION)),
      window.fetch('https://api.example/v1/sell/quote', authorized(SLAVE_SESSION)),
    ]);
    const late = await window.fetch(USER_URL, authorized(SLAVE_SESSION));

    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(late.status).toBe(200);
    expect(mockRenew).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(6);
  });

  it('does not sign in again when the new session is rejected too', async () => {
    mockFetch.mockResolvedValue(answer(401));

    expect((await window.fetch(USER_URL, authorized(SLAVE_SESSION))).status).toBe(401);
    expect((await window.fetch(USER_URL, authorized(SLAVE_SESSION))).status).toBe(401);

    expect(mockRenew).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('reads the session from header pairs and from a Headers object and replaces it', async () => {
    mockFetch
      .mockResolvedValueOnce(answer(401))
      .mockResolvedValueOnce(answer(200))
      .mockResolvedValueOnce(answer(401))
      .mockResolvedValueOnce(answer(200));
    const headersObject = { entries: () => new Map([['authorization', `Bearer ${SLAVE_SESSION}`]]).entries() };

    await window.fetch(USER_URL, {
      headers: [
        ['Accept', 'application/json'],
        ['Authorization', `Bearer ${SLAVE_SESSION}`],
      ],
    });
    await window.fetch(USER_URL, { headers: headersObject as unknown as Headers });

    expect(mockFetch).toHaveBeenNthCalledWith(2, USER_URL, {
      headers: [
        ['Accept', 'application/json'],
        ['Authorization', `Bearer ${MASTER_SESSION}`],
      ],
    });
    expect(mockFetch).toHaveBeenNthCalledWith(4, USER_URL, { headers: [['Authorization', `Bearer ${MASTER_SESSION}`]] });
    expect(mockRenew).toHaveBeenCalledTimes(1);
  });

  it('restores the original fetch when it is removed', () => {
    uninstall();

    expect(window.fetch).toBe(mockFetch);
  });
});
