import { DetailTransaction, TransactionState, TransactionType } from '@dfx.swiss/react';
import { openPdfFromString } from './utils';

export function canOpenInvoice(
  tx: Pick<DetailTransaction, 'type' | 'state' | 'inputAsset'>,
): boolean {
  return (
    tx.type === TransactionType.BUY &&
    tx.state === TransactionState.COMPLETED &&
    (tx.inputAsset === 'CHF' || tx.inputAsset === 'EUR')
  );
}

export function revealInvoicePdf(pdf: string, preview: Window | null): void {
  if (preview && !preview.closed) {
    const byteArray = Uint8Array.from(atob(pdf), (c) => c.charCodeAt(0));
    const file = new Blob([byteArray], { type: 'application/pdf' });
    preview.location.href = URL.createObjectURL(file);
    return;
  }
  openPdfFromString(pdf, false);
}
