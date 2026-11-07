import { useEffect, useState } from 'react';
import { useSettingsContext } from '../../../contexts/settings.context';
import PasskeySheet from './passkey-sheet';

export default function PasskeyPaySheet({
  onClose,
  onPasteLink,
}: {
  onClose: () => void;
  onPasteLink: () => void;
}): JSX.Element {
  const { translate } = useSettingsContext();
  const [failed, setFailed] = useState(false);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (!video) return;
    let cancelled = false;
    let stream: MediaStream | undefined;
    if (!navigator.mediaDevices?.getUserMedia) {
      setFailed(true);
      return;
    }
    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((result) => {
        if (cancelled) {
          result.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = result;
        video.srcObject = result;
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [video]);
  return (
    <PasskeySheet title={translate('screens/home', 'Scan QR code')} onClose={onClose}>
      <div className="relative aspect-square overflow-hidden rounded-[16px] bg-dfxBlue-800">
        <video ref={setVideo} autoPlay muted playsInline className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-[18%] rounded-[16px] border-4 border-white" />
      </div>
      <p className="my-4 text-dfxGray-700">
        {translate('screens/home', 'Point the camera at the payment QR code at the till.')}
      </p>
      {failed && (
        <p role="alert" className="my-4 text-dfxRed-150">
          {translate('screens/home', 'No camera access. Allow it in your browser settings or paste the payment link.')}
        </p>
      )}
      <button
        className="min-h-[44px] w-full rounded-lg border border-dfxGray-500 px-4 font-semibold focus-visible:outline focus-visible:outline-2"
        onClick={onPasteLink}
      >
        {translate('screens/home', 'Paste payment link')}
      </button>
    </PasskeySheet>
  );
}
