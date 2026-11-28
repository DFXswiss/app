import type { KeyRing } from '@dfx.swiss/wallet';
import { useEffect, useRef, useState } from 'react';
import { useSettingsContext } from '../../../contexts/settings.context';
import { useClipboard } from '../../../hooks/clipboard.hook';
import { QrBasic } from '../../payment/qr-code';
import { formatBtc, parseSats, receiveAddress as bitcoinReceiveAddress } from './passkey-bitcoin';
import { passkeyMessage } from './passkey-host';

export type ReceiveFamily = 'evm' | 'bitcoin' | 'spark';
export const RECEIVE_FAMILIES: ReceiveFamily[] = ['evm', 'bitcoin', 'spark'];

// Bitcoin uses the device's BIP-84 receive index from discovery; EVM and Spark have one address each.
export function receiveAddress(keys: KeyRing, family: ReceiveFamily, bitcoinIndex = 0): string {
  if (family === 'evm') return keys.evm(0).address;
  if (family === 'spark') return keys.sparkIdentity().address;
  return bitcoinReceiveAddress(keys, bitcoinIndex);
}

export type FeeChoice = 'fast' | 'normal' | 'slow';
export const FEE_CHOICES: FeeChoice[] = ['fast', 'normal', 'slow'];
const FEE_LABELS: Record<FeeChoice, string> = { fast: 'Fast', normal: 'Normal', slow: 'Slow' };

export interface SendFees {
  rates: Record<FeeChoice, number>;
}

export interface SendInput {
  destination: string;
  amount: string;
  feeRate: FeeChoice;
}

// The prepared payment as wallet-api returned it and the SDK verified it. Amounts are whole sats.
export interface SendReview {
  destination: string;
  amount: number | string;
  fee: number | string;
  feeRate: number | string;
  change: number | string;
}

export interface SendResult {
  txid: string;
  alreadySubmitted?: boolean;
}

export type SendPayment = (input: SendInput, confirm: (review: SendReview) => Promise<boolean>) => Promise<SendResult>;

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
  families,
  bitcoinLabel,
  readReceive,
  onReceiveError,
}: {
  // Only the families GET /v1/wallet/config enables.
  families: ReceiveFamily[];
  bitcoinLabel: string;
  readReceive: (family: ReceiveFamily) => string;
  onReceiveError: (message?: string) => void;
}): JSX.Element {
  const { translate } = useSettingsContext();
  const { copy, isCopying } = useClipboard();
  const [family, setFamily] = useState<ReceiveFamily>();
  const [address, setAddress] = useState<string>();
  const readReceiveRef = useRef(readReceive);
  const onReceiveErrorRef = useRef(onReceiveError);
  readReceiveRef.current = readReceive;
  onReceiveErrorRef.current = onReceiveError;

  useEffect(() => {
    if (family === undefined) {
      setAddress(undefined);
      return;
    }
    try {
      setAddress(readReceiveRef.current(family));
      onReceiveErrorRef.current(undefined);
    } catch (caught) {
      setAddress(undefined);
      onReceiveErrorRef.current(passkeyMessage(caught));
    }
  }, [family]);

  const familyLabel: Record<ReceiveFamily, string> = {
    evm: 'EVM',
    bitcoin: bitcoinLabel,
    spark: 'Spark',
  };
  // With one family there is nothing to choose; its address shows right away.
  const only = families.length === 1 ? families[0] : undefined;
  useEffect(() => {
    if (only !== undefined) setFamily(only);
  }, [only]);

  return (
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
                ? 'min-h-[44px] rounded-full bg-dfxBlue-800 px-4 py-2 text-sm text-white'
                : 'min-h-[44px] rounded-full border border-dfxGray-500 bg-white px-4 py-2 text-sm text-dfxBlue-800'
            }
          >
            {translate('screens/home', familyLabel[item])}
          </button>
        ))}
      </div>
      {family !== undefined && address !== undefined ? (
        <div
          className={
            'mt-4 flex w-full flex-col items-center gap-4 rounded-[16px] ' +
            'border border-dfxGray-400 bg-white px-5 py-5'
          }
        >
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

type SendStage = 'form' | 'preparing' | 'review' | 'submitting' | 'done';

export function PasskeySendPanel({
  loadFees,
  send,
}: {
  loadFees: () => Promise<SendFees>;
  send: SendPayment;
}): JSX.Element {
  const { translate } = useSettingsContext();
  const t = (key: string, values?: Record<string, string | number>) => translate('screens/home', key, values);
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [sendMax, setSendMax] = useState(false);
  const [feeRate, setFeeRate] = useState<FeeChoice>('normal');
  const [fees, setFees] = useState<SendFees>();
  const [feesFailed, setFeesFailed] = useState(false);
  const [stage, setStage] = useState<SendStage>('form');
  const [review, setReview] = useState<SendReview>();
  const [result, setResult] = useState<SendResult>();
  const [sendError, setSendError] = useState<string>();
  const [panelMessage, setPanelMessage] = useState<string>();
  const [cameraOpen, setCameraOpen] = useState(false);
  const decideRef = useRef<(accepted: boolean) => void>();
  const backedOutRef = useRef(false);
  const loadFeesRef = useRef(loadFees);
  loadFeesRef.current = loadFees;

  useEffect(() => {
    let alive = true;
    loadFeesRef.current().then(
      (next) => {
        if (alive) setFees(next);
      },
      () => {
        if (alive) setFeesFailed(true);
      },
    );
    return () => {
      alive = false;
      // A review left open on unmount is declined, so the SDK never signs it.
      decideRef.current?.(false);
      decideRef.current = undefined;
    };
  }, []);

  const satsAmount = sendMax ? 'max' : parseSats(amount);
  const canReview = destination.trim() !== '' && satsAmount !== undefined && stage === 'form';

  async function startSend(): Promise<void> {
    if (!canReview || satsAmount === undefined) return;
    backedOutRef.current = false;
    setSendError(undefined);
    setStage('preparing');
    try {
      const sent = await send({ destination: destination.trim(), amount: satsAmount, feeRate }, (prepared) => {
        setReview(prepared);
        setStage('review');
        return new Promise<boolean>((resolve) => {
          decideRef.current = resolve;
        });
      });
      if (backedOutRef.current) return;
      setResult(sent);
      setStage('done');
    } catch (caught) {
      if (backedOutRef.current) return;
      setSendError(passkeyMessage(caught));
      setStage('form');
    }
  }

  function decide(accepted: boolean): void {
    const resolve = decideRef.current;
    decideRef.current = undefined;
    if (!accepted) {
      backedOutRef.current = true;
      setReview(undefined);
      setStage('form');
    } else {
      setStage('submitting');
    }
    resolve?.(accepted);
  }
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

  const primary = 'min-h-[48px] w-full rounded-full bg-dfxBlue-800 px-5 py-3 text-sm text-white disabled:bg-dfxGray-400';
  const secondary = 'min-h-[48px] w-full rounded-full border border-dfxBlue-800 px-5 py-3 text-sm text-dfxBlue-800';

  if (stage === 'done' && result) {
    return (
      <div className="flex w-full flex-col items-stretch gap-3 pt-4" data-testid="passkey-send-done">
        <p role="status" className="text-center font-semibold text-dfxBlue-800">
          {t(result.alreadySubmitted ? 'This payment was already submitted.' : 'Payment submitted.')}
        </p>
        <p className="text-sm text-dfxGray-800">{t('Transaction ID')}</p>
        <p data-testid="passkey-send-txid" className="select-all break-all font-mono text-sm text-dfxBlue-800">
          {result.txid}
        </p>
        <p className="text-sm text-dfxGray-700">{t('It appears in the history once the network has seen it.')}</p>
      </div>
    );
  }

  if ((stage === 'review' || stage === 'submitting') && review) {
    const rows: [string, string][] = [
      [t('Destination'), review.destination],
      [t('Amount'), formatBtc(review.amount)],
      [t('Network fee'), `${formatBtc(review.fee)} (${t('{{rate}} sat/vB', { rate: review.feeRate })})`],
      [t('Change back to your wallet'), formatBtc(review.change)],
    ];
    return (
      <div className="flex w-full flex-col items-stretch gap-3 pt-4" data-testid="passkey-send-review">
        <p className="font-semibold text-dfxBlue-800">{t('Check the payment')}</p>
        <dl className="overflow-hidden rounded-[16px] bg-dfxGray-300">
          {rows.map(([label, value]) => (
            <div key={label} className="border-b border-white px-4 py-3 last:border-b-0">
              <dt className="text-sm text-dfxGray-800">{label}</dt>
              <dd className="break-all text-dfxBlue-800">{value}</dd>
            </div>
          ))}
        </dl>
        <button type="button" className={primary} disabled={stage === 'submitting'} onClick={() => decide(true)}>
          {t(stage === 'submitting' ? 'Sending…' : 'Confirm and send')}
        </button>
        <button type="button" className={secondary} disabled={stage === 'submitting'} onClick={() => decide(false)}>
          {t('Back')}
        </button>
      </div>
    );
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
        {t('Amount (sats)')}
      </label>
      <input
        id="passkey-send-amount"
        type="text"
        inputMode="numeric"
        aria-label={t('Amount (sats)')}
        value={sendMax ? '' : amount}
        disabled={sendMax}
        placeholder={sendMax ? t('Everything spendable') : undefined}
        onChange={(event) => setAmount(event.target.value)}
        className="w-full rounded-md border border-dfxGray-500 p-4 text-center text-2xl font-normal"
      />
      <label className="flex min-h-[44px] items-center gap-3 text-sm text-dfxBlue-800">
        <input
          type="checkbox"
          checked={sendMax}
          onChange={(event) => setSendMax(event.target.checked)}
          className="h-5 w-5 accent-dfxBlue-800"
        />
        {t('Send everything')}
      </label>
      <fieldset>
        <legend className="text-sm text-dfxGray-800">{t('Network fee')}</legend>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {FEE_CHOICES.map((choice) => (
            <button
              key={choice}
              type="button"
              aria-pressed={feeRate === choice}
              onClick={() => setFeeRate(choice)}
              className={
                feeRate === choice
                  ? 'min-h-[56px] rounded-md bg-dfxBlue-800 px-2 text-sm text-white'
                  : 'min-h-[56px] rounded-md border border-dfxGray-500 bg-white px-2 text-sm text-dfxBlue-800'
              }
            >
              <span className="block font-semibold">{t(FEE_LABELS[choice])}</span>
              {fees && <span className="block">{t('{{rate}} sat/vB', { rate: fees.rates[choice] })}</span>}
            </button>
          ))}
        </div>
        {feesFailed && <p className="mt-2 text-sm text-dfxGray-700">{t('Fee estimates are not available.')}</p>}
      </fieldset>
      {sendError && (
        <p role="alert" className="break-words text-dfxRed-150">
          {t(sendError)}
        </p>
      )}
      <button type="button" className={primary} disabled={!canReview} onClick={() => void startSend()}>
        {t(stage === 'preparing' ? 'Preparing the payment…' : 'Review payment')}
      </button>
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
