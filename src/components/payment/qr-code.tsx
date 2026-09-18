import { CopyButton } from '@dfx.swiss/react-components';
import copy from 'copy-to-clipboard';
import QRCode from 'react-qr-code';

interface QrCopyProps {
  data: string;
  isLoading?: boolean;
}

export function QrCopy({ data }: QrCopyProps): JSX.Element {
  return (
    <div className="relative flex justify-center w-full max-w-[20rem]">
      <div
        className="absolute bg-white border p-1 rounded-sm top-1/2 left-1/2"
        style={{ transform: 'translate(-50%, -50%)' }}
      >
        <CopyButton onCopy={() => copy(data)} />
      </div>
      <QrBasic data={data} />
    </div>
  );
}

function stringIsSVG(value: string): boolean {
  const parser = new DOMParser();
  const doc = parser.parseFromString(value, 'image/svg+xml');
  const svgElement = doc.getElementsByTagName('svg')[0];
  return svgElement !== undefined && svgElement.nodeName === 'svg';
}

export function QrBasic({ data, isLoading }: QrCopyProps): JSX.Element {
  const isSVG = stringIsSVG(data);

  return (
    <div
      className={`p-2 h-auto w-full max-w-[15rem] border border-dfxGray-500 rounded-md flex justify-center items-center ${
        isLoading ? 'animate-pulse border-dfxGray-300' : ''
      }`}
    >
      {isLoading ? (
        // Static skeleton: never encode a scannable URL in the loading placeholder.
        <div className="h-full w-full min-h-[10rem] rounded-sm bg-dfxGray-300/40" aria-hidden="true" />
      ) : isSVG ? (
        <img
          className="h-full w-full rounded-sm"
          src={`data:image/svg+xml;utf8,${encodeURIComponent(data)}`}
          alt="Swiss QR Bill"
        />
      ) : (
        <QRCode className="h-full w-full rounded-sm" value={data} fgColor="#072440" />
      )}
    </div>
  );
}
