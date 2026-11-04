import { useEffect, useState } from 'react';
import { isMobile } from 'react-device-detect';

function readCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(pointer: coarse)').matches;
}

/**
 * Whether the payer is holding a phone or tablet — the device they would scan a QR with.
 * UA alone is not enough: "Request Desktop Site" flips isMobile while the input stays touch.
 */
export function useIsHandheld(): boolean {
  const [hasCoarsePointer, setHasCoarsePointer] = useState(readCoarsePointer);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(pointer: coarse)');
    const update = () => setHasCoarsePointer(mediaQuery.matches);
    update();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', update);
      return () => mediaQuery.removeEventListener('change', update);
    }

    // Older Safari only exposes addListener/removeListener
    if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(update);
      return () => mediaQuery.removeListener(update);
    }
  }, []);

  return isMobile || hasCoarsePointer;
}
