import copy from 'copy-to-clipboard';
import { useState } from 'react';

interface ClipboardInterface {
  isCopying: boolean;
  copy: (text?: string) => void;
}

export function useClipboard(): ClipboardInterface {
  const [isCopying, setIsCopying] = useState(false);
  function copyHelper(text?: string): void {
    if (!text) return;
    setIsCopying(true);

    const resetIsCopying = () => setTimeout(() => setIsCopying(false), 500);

    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .catch(() => copy(text))
        .finally(resetIsCopying)
        // settle deliberately: a throwing fallback would otherwise escape as an unhandled rejection
        .catch(() => undefined);
    } else {
      try {
        copy(text);
      } finally {
        resetIsCopying();
      }
    }
  }

  return { copy: copyHelper, isCopying };
}
