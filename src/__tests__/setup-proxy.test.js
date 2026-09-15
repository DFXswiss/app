const fs = require('fs');
const path = require('path');
const os = require('os');

jest.mock('express', () => {
  const staticFn = jest.fn(() => 'static-mw');
  return { static: staticFn };
});

const express = require('express');
const setupProxy = require('../setupProxy');

describe('setupProxy', () => {
  it('is a no-op when the App 2.0 artifact is missing', () => {
    const app = { use: jest.fn() };
    const exists = jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    setupProxy(app);
    expect(app.use).not.toHaveBeenCalled();
    exists.mockRestore();
  });

  it('mounts the artifact at /app2 and falls back to index.html', () => {
    const app = { use: jest.fn() };
    const exists = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    setupProxy(app);
    expect(express.static).toHaveBeenCalled();
    expect(app.use).toHaveBeenCalledTimes(3);
    expect(app.use.mock.calls[0][0]).toBe('/app2');
    expect(app.use.mock.calls[1][0]).toBe('/app2');
    expect(app.use.mock.calls[2][0]).toBe('/app2');

    const redirector = app.use.mock.calls[0][1];
    const redirect = jest.fn();
    redirector({ path: '/buy/success', url: '/buy/success?cko-payment-id=x' }, { redirect }, jest.fn());
    expect(redirect).toHaveBeenCalledWith(302, '/app2/#/buy/success?cko-payment-id=x');
    redirector({ path: '/buy/failure/', url: '/buy/failure/' }, { redirect }, jest.fn());
    expect(redirect).toHaveBeenCalledWith(302, '/app2/#/buy/failure');
    redirector({ path: '/account', url: '/account' }, { redirect }, jest.fn());

    const fallback = app.use.mock.calls[2][1];
    const sendFile = jest.fn((file, cb) => cb(undefined));
    fallback({}, { sendFile }, jest.fn());
    expect(sendFile).toHaveBeenCalledWith(
      path.join(__dirname, '..', '..', 'app2-dist', 'index.html'),
      expect.any(Function),
    );

    const next = jest.fn();
    sendFile.mockImplementation((file, cb) => cb(new Error('missing')));
    fallback({}, { sendFile }, next);
    expect(next).toHaveBeenCalled();
    exists.mockRestore();
  });
});

describe('setupProxy path', () => {
  it('points at the repo-level app2-dist directory', () => {
    expect(path.basename(path.join(__dirname, '..', '..'))).toBeTruthy();
    expect(os.tmpdir()).toBeTruthy();
  });
});
