// DFX App 2.0 — shared brand marks rendered inline (so they take `currentColor` and match the
// stroke icons around them). Path data is the official artwork, not a redraw:
// Open CryptoPay brand assets, 01_Logo › Open_CryptoPay_Logo › Open_CryptoPay_Logo.svg
// (see src/app2/THIRD-PARTY-NOTICES.md).

import type { JSX } from 'react';

/** The Open CryptoPay chevron mark, single-color via `currentColor`. Used for the drawer's
 * OpenCryptoPay entry (inherits the menu icon color) and the OCP screen's hero badge (white on
 * the badge gradient) — the two places the merchant suite identifies itself. */
export function OcpMark(props: { className?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 170 129" fill="none" aria-hidden="true" className={props.className}>
      <path
        d="M119.754 114.608L168.013 66.3482C169.26 65.102 169.26 63.0791 168.013 61.8149L110.326 4.14533L88.7788 25.6924L124.919 61.8329C126.166 63.0791 126.166 65.102 124.919 66.3663L98.2249 93.0608L119.772 114.608H119.754Z"
        fill="currentColor"
      />
      <path
        d="M106.28 128.1L44.5468 66.3663C43.3006 65.1201 43.3006 63.0972 44.5468 61.8329L106.28 0.0996094H64.5045C63.6556 0.0996094 62.8429 0.442773 62.2469 1.03879L1.43467 61.8329C0.188444 63.0791 0.188444 65.102 1.43467 66.3663L62.2288 127.16C62.8248 127.756 63.6376 128.1 64.4865 128.1H106.28Z"
        fill="currentColor"
      />
    </svg>
  );
}
