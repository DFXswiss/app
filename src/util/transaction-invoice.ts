import { DetailTransaction, TransactionState, TransactionType } from '@dfx.swiss/react';
import { openPdfFromString } from './utils';

export function canOpenInvoice(
  tx: Pick<DetailTransaction, 'type' | 'state' | 'inputAsset'>,
): boolean {
  // WaitingForPayment is the unpaid bank buy: the invoice is how the customer pays,
  // and PUT /v1/transaction/:uid/invoice builds it from the TransactionRequest.
  return (
    tx.type === TransactionType.BUY &&
    [TransactionState.COMPLETED, TransactionState.WAITING_FOR_PAYMENT].includes(tx.state) &&
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
