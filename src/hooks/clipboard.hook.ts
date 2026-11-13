import copy from 'copy-to-clipboard';
import { useState } from 'react';

interface ClipboardInterface {
  isCopying: boolean;
  copy: (text?: string) => void;
}

export function useClipboard(): ClipboardInterface {
  const [isCopying, setIsCopying] = useState(false);
  function markCopied(): void {
    setIsCopying(true);
    setTimeout(() => setIsCopying(false), 500);
  }

  function fallbackCopy(text: string): boolean {
    try {
      return copy(text) === true;
    } catch {
      return false;
    }
  }

  function copyHelper(text?: string): void {
    if (!text) return;
    const clipboard = navigator.clipboard;
    if (clipboard?.writeText) {
      clipboard
        .writeText(text)
        .then(() => markCopied())
        .catch(() => {
          if (fallbackCopy(text)) markCopied();
        });
      return;
    }
    if (fallbackCopy(text)) markCopied();
  }

  return { copy: copyHelper, isCopying };
}
