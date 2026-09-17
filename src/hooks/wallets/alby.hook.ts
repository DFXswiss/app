import { useMemo, useState } from 'react';
import { GetInfoResponse, SendPaymentResponse, WebLNProvider } from 'webln';
import { AbortError } from '../../util/abort-error';
import { delay } from '../../util/utils';

export interface AlbyInterface {
  isInstalled: () => boolean;
  isAvailable: () => Promise<boolean>;
  isEnabled: boolean;
  enable: () => Promise<GetInfoResponse>;
  signMessage: (msg: string) => Promise<string>;
  sendPayment: (request: string) => Promise<SendPaymentResponse>;
}

export function useAlby(): AlbyInterface {
  const [isEnabled, setIsEnabled] = useState(false);

  function webln(): WebLNProvider {
    return (window as any).webln;
  }

  function isInstalled() {
    return Boolean(webln());
  }

  // the extension may inject window.webln shortly after the page loaded
  async function isAvailable(): Promise<boolean> {
    return waitForWebln().then(
      () => true,
      () => false,
    );
  }

  async function enable(): Promise<GetInfoResponse> {
    try {
      await waitForWebln();

      return await webln()
        .enable()
        .then(() => webln().getInfo())
        .then((i) => {
          setIsEnabled(true);
          return i;
        });
    } catch (e) {
      setIsEnabled(false);
      handleError(e as Error);
    }
  }

  async function signMessage(msg: string): Promise<string> {
    try {
      return await webln()
        .signMessage(msg)
        .then((r) => r.signature);
    } catch (e) {
      handleError(e as Error);
    }
  }

  async function sendPayment(request: string): Promise<SendPaymentResponse> {
    if (!isEnabled) await enable();
    return webln().sendPayment(request);
  }

  async function waitForWebln() {
    for (let i = 0; i < 10; i++) {
      if (isInstalled()) return;

      await delay(0.01);
    }

    if (isInstalled()) return;

    throw new Error('Timeout');
  }

  function handleError(e: Error): never {
    if (e.message === 'User rejected' || e.message.includes('Permission denied')) {
      throw new AbortError('User cancelled');
    }

    throw e;
  }

  return useMemo(
    () => ({
      isInstalled,
      isAvailable,
      isEnabled,
      enable,
      signMessage,
      sendPayment,
    }),
    [isEnabled],
  );
}
