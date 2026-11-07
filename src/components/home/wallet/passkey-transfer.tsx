import { useEffect, useRef, useState } from 'react';
import { useSettingsContext } from '../../../contexts/settings.context';
import { useClipboard } from '../../../hooks/clipboard.hook';
import { QrBasic } from '../../payment/qr-code';
import { passkeyMessage } from './passkey-host';

export type ReceiveFamily = 'evm' | 'bitcoin' | 'spark';

export interface PasskeyTransferProps {
  unlocked: boolean;
  readReceive: (family: ReceiveFamily) => string;
  onReceiveError: (message: string) => void;
}

type DeskAction = 'receive' | 'send';

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
}

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

const PASTE_UNAVAILABLE = 'Paste is not available in this browser.';
const SCAN_UNAVAILABLE = 'QR scanning is not available in this browser.';

function ArrowDown(): JSX.Element {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M12 5v14" strokeWidth={2} strokeLinecap="round" />
      <path d="M5 12l7 7 7-7" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowUp(): JSX.Element {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M12 19V5" strokeWidth={2} strokeLinecap="round" />
      <path d="M5 12l7-7 7 7" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ActionButton({
  label,
  pressed,
  icon,
  onClick,
}: {
  label: string;
  pressed: boolean;
  icon: JSX.Element;
  onClick: () => void;
}): JSX.Element {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className="flex flex-col items-center gap-2">
      <span
        className={`flex h-16 w-16 items-center justify-center rounded-full ${
          pressed ? 'bg-white text-dfxBlue-800' : 'bg-dfxBlue-700 text-white'
        }`}
      >
        {icon}
      </span>
      <span className="text-sm text-white">{label}</span>
    </button>
  );
}

export default function PasskeyTransfer({
  unlocked,
  readReceive,
  onReceiveError,
}: PasskeyTransferProps): JSX.Element {
  const { translate } = useSettingsContext();
  const { copy, isCopying } = useClipboard();
  const [action, setAction] = useState<DeskAction>();
  const [family, setFamily] = useState<ReceiveFamily>();
  const [address, setAddress] = useState<string>();
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [panelMessage, setPanelMessage] = useState<string>();
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream>();
  const frameIdRef = useRef<number>();
  const cancelledRef = useRef(true);
  const scanGenRef = useRef(0);
  const readReceiveRef = useRef(readReceive);
  const onReceiveErrorRef = useRef(onReceiveError);
  readReceiveRef.current = readReceive;
  onReceiveErrorRef.current = onReceiveError;

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

  function toggleAction(next: DeskAction): void {
    const following = action === next ? undefined : next;
    setAction(following);
    if (following !== 'receive') setFamily(undefined);
    if (following !== 'send') {
      stopScan();
      setPanelMessage(undefined);
    }
  }

  useEffect(() => {
    if (family === undefined || !unlocked) {
      setAddress(undefined);
      return;
    }
    try {
      setAddress(readReceiveRef.current(family));
    } catch (caught) {
      setAddress(undefined);
      onReceiveErrorRef.current(passkeyMessage(caught));
    }
  }, [family, unlocked]);

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
  }, [action]);

  useEffect(() => {
    if (!cameraOpen) return;
    const streamVideo = videoRef.current;
    const media = streamRef.current;
    const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (!streamVideo || media === undefined || Detector === undefined) return;
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

  const families: ReceiveFamily[] = ['evm', 'bitcoin', 'spark'];
  const familyLabel: Record<ReceiveFamily, string> = {
    evm: 'EVM',
    bitcoin: 'Bitcoin',
    spark: 'Spark',
  };

  return (
    <div className="w-full">
      <div className="w-full rounded-2xl bg-dfxBlue-800 px-6 py-5">
        <div className="flex items-start justify-center gap-10">
          <ActionButton
            label={translate('screens/home', 'Receive')}
            pressed={action === 'receive'}
            icon={<ArrowDown />}
            onClick={() => toggleAction('receive')}
          />
          <ActionButton
            label={translate('screens/home', 'Send')}
            pressed={action === 'send'}
            icon={<ArrowUp />}
            onClick={() => toggleAction('send')}
          />
        </div>
      </div>

      {action === 'receive' ? (
        <div className="w-full pt-4">
          <div className="flex items-center justify-center gap-4">
            {families.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={family === item}
                onClick={() => {
                  if (item === family) return;
                  setFamily(item);
                  setAddress(undefined);
                }}
                className={
                  family === item
                    ? 'rounded-full bg-dfxBlue-800 px-4 py-2 text-sm text-white'
                    : 'rounded-full border border-dfxGray-500 bg-white px-4 py-2 text-sm text-dfxBlue-800'
                }
              >
                {translate('screens/home', familyLabel[item])}
              </button>
            ))}
          </div>
          {family !== undefined && !unlocked ? (
            <p className="pt-4 text-dfxBlue-800">
              {translate('screens/home', 'Unlock the wallet to show this address.')}
            </p>
          ) : null}
          {family !== undefined && unlocked && address !== undefined ? (
            <div
              className={
                'mt-4 flex w-full flex-col items-center gap-4 rounded-2xl ' +
                'border border-dfxGray-400 bg-white px-5 py-5'
              }
            >
              <p data-testid="passkey-receive-address" className="select-all break-all text-dfxBlue-800">
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
      ) : null}

      {action === 'send' ? (
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
          <p className="text-center text-sm text-dfxGray-700">
            {translate('screens/home', 'Sending is not active yet.')}
          </p>
          {cameraOpen ? (
            <video
              ref={videoRef}
              data-testid="passkey-send-scan"
              autoPlay
              muted
              playsInline
              className="w-full rounded-2xl"
            />
          ) : null}
          {panelMessage ? <p className="text-dfxBlue-800">{translate('screens/home', panelMessage)}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
