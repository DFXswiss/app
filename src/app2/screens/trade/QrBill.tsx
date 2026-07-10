// DFX App 2.0 — payment QR rendering (Swiss QR-bill / GiroCode / deposit address).
//
// The API returns `paymentRequest` as either a ready-made Swiss QR-bill SVG (buy, EUR/CHF
// bank transfers) or a plain text payload to encode ourselves (GiroCode/BCD text, or a crypto
// payment URI for sell/swap deposits). Ported from the static app's `qrSvg()` + the buy
// confirm sheet's `d.paymentRequest` branch (public/app2/index.html) — same two cases, but:
//  - the SVG case renders through an `<img src="data:image/svg+xml,...">`, never
//    `dangerouslySetInnerHTML` — an `<img>` never executes markup inside the image data, so an
//    API-controlled SVG payload can't run script in our DOM even in principle;
//  - the text case uses the installed `react-qr-code` (error correction level "M", matching
//    the static app's `qrcode(0,"M")`) instead of hand-rolling a QR renderer.

import QRCode from 'react-qr-code';

const SVG_PAYLOAD = /^\s*<svg[\s>]/i;

interface QrBillProps {
  /** The API's `paymentRequest` (or a raw address/payment URI as a fallback). */
  payload: string;
  caption?: string;
}

export function QrBill({ payload, caption }: QrBillProps) {
  const isSvg = SVG_PAYLOAD.test(payload);

  return (
    <div className="qrcard">
      {isSvg ? (
        <img alt="Swiss QR-bill" src={`data:image/svg+xml;utf8,${encodeURIComponent(payload)}`} />
      ) : (
        <QRCode value={payload} size={212} level="M" bgColor="#ffffff" fgColor="#000000" />
      )}
      {caption && <div className="qcap">{caption}</div>}
    </div>
  );
}
