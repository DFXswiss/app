import type { KeyRing } from '@dfx.swiss/wallet';
import { useEffect, useRef, useState } from 'react';
import { useSettingsContext } from '../../../contexts/settings.context';
import { useClipboard } from '../../../hooks/clipboard.hook';
import { QrBasic } from '../../payment/qr-code';
import { passkeyMessage } from './passkey-host';

// The passkey wallet starts with Bitcoin on-chain only: BIP-84 receive index 1 on the session's network.
export function receiveAddress(keys: KeyRing): string {
  return keys.bitcoinAddress(0, 1).address;
}

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
}

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

const PASTE_UNAVAILABLE = 'Paste is not available in this browser.';
const SCAN_UNAVAILABLE = 'QR scanning is not available in this browser.';

export function PasskeyReceivePanel({
  keys,
  failed,
  onReceiveError,
}: {
  keys: KeyRing;
  // Non-production handbook hook: treat the derivation as failed.
  failed?: boolean;
  onReceiveError: (message?: string) => void;
}): JSX.Element {
  const { translate } = useSettingsContext();
  const { copy, isCopying } = useClipboard();
  const [address, setAddress] = useState<string>();
  const onReceiveErrorRef = useRef(onReceiveError);
  onReceiveErrorRef.current = onReceiveError;

  useEffect(() => {
    try {
      if (failed) throw new Error();
      setAddress(receiveAddress(keys));
      onReceiveErrorRef.current(undefined);
    } catch (caught) {
      setAddress(undefined);
      onReceiveErrorRef.current(passkeyMessage(caught));
    }
  }, [keys, failed]);

  return (
    <div className="w-full pt-4">
      {address !== undefined ? (
        <div className="flex w-full flex-col items-center gap-4 rounded-[16px] border border-dfxGray-400 bg-white px-5 py-5">
          <p className="text-sm font-semibold text-dfxBlue-800">{translate('screens/home', 'Bitcoin')}</p>
          <p
            data-testid="passkey-receive-address"
            className="select-all break-all text-dfxBlue-800 [font-feature-settings:'calt'_0]"
          >
            {address}
          </p>
          <button
            type="button"
            onClick={() => copy(address)}
            className="rounded-full bg-dfxBlue-800 px-5 py-3 text-sm text-white"
          >
            {translate('screens/home', isCopying ? 'Copied' : 'Copy address')}
          </button>
          <div data-testid="passkey-receive-qr">
            <QrBasic data={address} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PasskeySendPanel(): JSX.Element {
  const { translate } = useSettingsContext();
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [panelMessage, setPanelMessage] = useState<string>();
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream>();
  const frameIdRef = useRef<number>();
  const cancelledRef = useRef(true);
  const scanGenRef = useRef(0);

  function stopScan(): void {
    scanGenRef.current += 1;
    cancelledRef.current = true;
    if (frameIdRef.current !== undefined) {
      cancelAnimationFrame(frameIdRef.current);
      frameIdRef.current = undefined;
    }
    const media = streamRef.current;
    streamRef.current = undefined;
    if (media !== undefined) {
      media.getTracks().forEach((track) => track.stop());
    }
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setCameraOpen(false);
  }

  useEffect(() => {
    return () => {
      scanGenRef.current += 1;
      cancelledRef.current = true;
      if (frameIdRef.current !== undefined) {
        cancelAnimationFrame(frameIdRef.current);
        frameIdRef.current = undefined;
      }
      const media = streamRef.current;
      streamRef.current = undefined;
      if (media !== undefined) {
        media.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (!cameraOpen) return;
    const streamVideo = videoRef.current;
    const media = streamRef.current;
    const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (!streamVideo || media === undefined || Detector === undefined) {
      stopScan();
      return;
    }
    const source = streamVideo;

    try {
      source.srcObject = media;
    } catch {
      // detect still runs if the element rejects the stream
    }
    let alive = true;
    const detector = new Detector({ formats: ['qr_code'] });

    async function frame(): Promise<void> {
      if (!alive || cancelledRef.current) return;
      let found: string | undefined;
      try {
        const codes = await detector.detect(source);
        const hit = codes.find((code) => code.rawValue !== '');
        if (hit !== undefined) found = hit.rawValue;
      } catch {
        // keep the camera on a failed detect frame
      }
      if (!alive || cancelledRef.current) return;
      if (found !== undefined) {
        setDestination(found);
        stopScan();
        return;
      }
      frameIdRef.current = requestAnimationFrame(() => {
        void frame();
      });
    }

    try {
      const played = source.play?.();
      if (played !== undefined) void Promise.resolve(played).catch(() => undefined);
    } catch {
      // ignore a play rejection
    }
    void frame();

    return () => {
      alive = false;
    };
  }, [cameraOpen]);

  async function onPaste(): Promise<void> {
    const clipboard = navigator.clipboard;
    if (clipboard === undefined || clipboard.readText === undefined) {
      setPanelMessage(PASTE_UNAVAILABLE);
      return;
    }
    try {
      const text = await clipboard.readText();
      setDestination(text);
      setPanelMessage(undefined);
    } catch {
      setPanelMessage(PASTE_UNAVAILABLE);
    }
  }

  async function onScan(): Promise<void> {
    stopScan();
    const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    const devices = navigator.mediaDevices;
    if (Detector === undefined || devices === undefined || devices.getUserMedia === undefined) {
      setPanelMessage(SCAN_UNAVAILABLE);
      return;
    }
    const generation = scanGenRef.current;
    let media: MediaStream;
    try {
      media = await devices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch {
      if (generation !== scanGenRef.current) return;
      setPanelMessage(SCAN_UNAVAILABLE);
      return;
    }
    if (generation !== scanGenRef.current) {
      media.getTracks().forEach((track) => track.stop());
      return;
    }
    cancelledRef.current = false;
    streamRef.current = media;
    setPanelMessage(undefined);
    setCameraOpen(true);
  }

  return (
    <div className="flex w-full flex-col items-stretch gap-3 pt-4">
      <label htmlFor="passkey-send-destination" className="text-sm text-dfxGray-800">
        {translate('screens/home', 'Destination')}
      </label>
      <input
        id="passkey-send-destination"
        type="text"
        aria-label={translate('screens/home', 'Destination')}
        value={destination}
        onChange={(event) => setDestination(event.target.value)}
        className="w-full rounded-md border border-dfxGray-500 p-4 text-base font-normal"
      />
      <div className="flex w-full gap-2">
        <button
          type="button"
          onClick={() => void onPaste()}
          className="flex-1 rounded-full border border-dfxBlue-800 py-3 text-sm text-dfxBlue-800"
        >
          {translate('screens/home', 'Paste')}
        </button>
        <button
          type="button"
          onClick={() => void onScan()}
          className="flex-1 rounded-full border border-dfxBlue-800 py-3 text-sm text-dfxBlue-800"
        >
          {translate('screens/home', 'Scan')}
        </button>
      </div>
      <label htmlFor="passkey-send-amount" className="text-sm text-dfxGray-800">
        {translate('screens/home', 'Amount')}
      </label>
      <input
        id="passkey-send-amount"
        type="text"
        inputMode="decimal"
        aria-label={translate('screens/home', 'Amount')}
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        className="w-full rounded-md border border-dfxGray-500 p-4 text-center text-2xl font-normal"
      />
      <p className="text-center text-sm text-dfxGray-700">{translate('screens/home', 'Sending is not active yet.')}</p>
      {cameraOpen ? (
        <video
          ref={videoRef}
          data-testid="passkey-send-scan"
          autoPlay
          muted
          playsInline
          className="w-full rounded-[16px]"
        />
      ) : null}
      {panelMessage ? <p className="text-dfxBlue-800">{translate('screens/home', panelMessage)}</p> : null}
    </div>
  );
}
