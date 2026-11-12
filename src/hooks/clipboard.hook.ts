import copy from 'copy-to-clipboard';
import { useEffect, useRef, useState } from 'react';

interface ClipboardInterface {
  isCopying: boolean;
  copy: (text?: string) => void;
}

export function useClipboard(): ClipboardInterface {
  const [isCopying, setIsCopying] = useState(false);
  const mounted = useRef(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (copiedTimer.current !== undefined) {
        clearTimeout(copiedTimer.current);
        copiedTimer.current = undefined;
      }
    };
  }, []);

  function markCopied(): void {
    if (!mounted.current) return;
    if (copiedTimer.current !== undefined) clearTimeout(copiedTimer.current);
    setIsCopying(true);
    copiedTimer.current = setTimeout(() => {
      copiedTimer.current = undefined;
      setIsCopying(false);
    }, 500);
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
