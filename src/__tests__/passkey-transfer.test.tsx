const mockCopy = jest.fn();

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_namespace: string, text: string, values?: Record<string, string | number>) =>
      text.replace(/{{(\w+)}}/g, (match, key: string) => (values?.[key] === undefined ? match : String(values[key]))),
  }),
}));
jest.mock('../hooks/clipboard.hook', () => ({ useClipboard: () => ({ copy: mockCopy, isCopying: false }) }));
jest.mock('../components/payment/qr-code', () => ({
  QrBasic: ({ data }: { data: string }) => <div data-testid="qr">{data}</div>,
}));

import { act, fireEvent, render, screen } from '@testing-library/react';
import type { KeyRing } from '@dfx.swiss/wallet';
import {
  PasskeyReceivePanel,
  PasskeySendPanel,
  receiveAddress,
  type SendFees,
  type SendPayment,
  type SendReview,
} from '../components/home/wallet/passkey-transfer';

const FEES: SendFees = { rates: { fast: 9, normal: 4, slow: 1 } };
const REVIEW: SendReview = { destination: 'bcrt1qdest', amount: 15000, fee: 141, feeRate: 4, change: 84859 };

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function renderSend(send: SendPayment, loadFees: () => Promise<SendFees> = async () => FEES) {
  const view = render(<PasskeySendPanel loadFees={loadFees} send={send} />);
  await act(async () => undefined);
  return view;
}

function fill(destination: string, amount: string): void {
  fireEvent.change(screen.getByLabelText('Destination'), { target: { value: destination } });
  fireEvent.change(screen.getByLabelText('Amount (sats)'), { target: { value: amount } });
}

describe('receiveAddress', () => {
  it('derives each family from the ring and Bitcoin at the receive index', () => {
    const keys = {
      evm: () => ({ address: '0xevm' }),
      sparkIdentity: () => ({ address: 'spark1x' }),
      bitcoinAddress: (_account: number, index: number) => ({ address: `bcrt1q${index}` }),
    } as unknown as KeyRing;
    expect(receiveAddress(keys, 'evm')).toBe('0xevm');
    expect(receiveAddress(keys, 'spark')).toBe('spark1x');
    expect(receiveAddress(keys, 'bitcoin')).toBe('bcrt1q0');
    expect(receiveAddress(keys, 'bitcoin', 4)).toBe('bcrt1q4');
  });
});

describe('PasskeyReceivePanel', () => {
  it('shows only the enabled family and opens it right away when it is the only one', () => {
    const readReceive = jest.fn(() => 'bcrt1qreceive');
    render(
      <PasskeyReceivePanel
        families={['bitcoin']}
        bitcoinLabel="Bitcoin Regtest"
        readReceive={readReceive}
        onReceiveError={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Bitcoin Regtest' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'EVM' })).not.toBeInTheDocument();
    expect(screen.getByTestId('passkey-receive-address')).toHaveTextContent('bcrt1qreceive');
    expect(screen.getByTestId('qr')).toHaveTextContent('bcrt1qreceive');
    fireEvent.click(screen.getByRole('button', { name: 'Copy address' }));
    expect(mockCopy).toHaveBeenCalledWith('bcrt1qreceive');
  });

  it('lets the user choose among several families and reports a failed derivation', () => {
    const onReceiveError = jest.fn();
    const readReceive = jest.fn((family: string) => {
      if (family === 'spark') throw new Error('No spark');
      return `${family}-address`;
    });
    render(
      <PasskeyReceivePanel
        families={['evm', 'spark']}
        bitcoinLabel="Bitcoin"
        readReceive={readReceive}
        onReceiveError={onReceiveError}
      />,
    );
    expect(screen.queryByTestId('passkey-receive-address')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'EVM' }));
    expect(screen.getByTestId('passkey-receive-address')).toHaveTextContent('evm-address');
    expect(onReceiveError).toHaveBeenLastCalledWith(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'EVM' }));
    expect(readReceive).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Spark' }));
    expect(onReceiveError).toHaveBeenLastCalledWith('No spark');
    expect(screen.queryByTestId('passkey-receive-address')).not.toBeInTheDocument();
  });
});

describe('PasskeySendPanel', () => {
  it('shows the fee choice from wallet-api and only enables review for a destination and whole sats', async () => {
    await renderSend(jest.fn());
    expect(screen.getByRole('button', { name: /Normal/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Fast/ })).toHaveTextContent('9 sat/vB');
    expect(screen.getByRole('button', { name: /Slow/ })).toHaveTextContent('1 sat/vB');
    const review = screen.getByRole('button', { name: 'Review payment' });
    expect(review).toBeDisabled();
    fill('bcrt1qdest', '1.5');
    expect(review).toBeDisabled();
    fill('bcrt1qdest', '15000');
    expect(review).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /Fast/ }));
    expect(screen.getByRole('button', { name: /Fast/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Sending is not active yet.')).not.toBeInTheDocument();
  });

  it('says when fee estimates are not available and still lets wallet-api choose', async () => {
    await renderSend(jest.fn(), () => Promise.reject(new Error('503')));
    expect(screen.getByText('Fee estimates are not available.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Normal/ })).not.toHaveTextContent('sat/vB');
  });

  it('reviews the verified summary, signs only after confirmation and shows the txid', async () => {
    const decided = deferred<boolean>();
    const finished = deferred<{ txid: string; alreadySubmitted?: boolean }>();
    const send: SendPayment = jest.fn(async (_input, confirm) => {
      decided.resolve(await confirm(REVIEW));
      return finished.promise;
    });
    await renderSend(send);
    fill('  bcrt1qdest  ', '15000');
    fireEvent.click(screen.getByRole('button', { name: /Slow/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Review payment' }));
    });

    expect(send).toHaveBeenCalledWith({ destination: 'bcrt1qdest', amount: '15000', feeRate: 'slow' }, expect.any(Function));
    const summary = screen.getByTestId('passkey-send-review');
    expect(summary).toHaveTextContent('0.00015 BTC');
    expect(summary).toHaveTextContent('0.00000141 BTC (4 sat/vB)');
    expect(summary).toHaveTextContent('0.00084859 BTC');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm and send' }));
    });
    await expect(decided.promise).resolves.toBe(true);
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();

    await act(async () => finished.resolve({ txid: 'abc123' }));
    expect(screen.getByRole('status')).toHaveTextContent('Payment submitted.');
    expect(screen.getByTestId('passkey-send-txid')).toHaveTextContent('abc123');
  });

  it('reports an already submitted payment', async () => {
    await renderSend(async (_input, confirm) => {
      await confirm(REVIEW);
      return { txid: 'abc', alreadySubmitted: true };
    });
    fireEvent.click(screen.getByLabelText('Send everything'));
    expect(screen.getByLabelText('Amount (sats)')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'bcrt1qdest' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Review payment' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm and send' }));
    });
    expect(screen.getByRole('status')).toHaveTextContent('This payment was already submitted.');
  });

  it('sends "max" and returns to the form when the user goes back', async () => {
    const decided = deferred<boolean>();
    const send = jest.fn<ReturnType<SendPayment>, Parameters<SendPayment>>(async (_input, confirm) => {
      const accepted = await confirm(REVIEW);
      decided.resolve(accepted);
      throw new Error('declined');
    });
    await renderSend(send);
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'bcrt1qdest' } });
    fireEvent.click(screen.getByLabelText('Send everything'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Review payment' }));
    });
    expect(send.mock.calls[0][0].amount).toBe('max');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    });
    await expect(decided.promise).resolves.toBe(false);
    expect(screen.getByRole('button', { name: 'Review payment' })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores a late result after going back', async () => {
    let release: (value: { txid: string }) => void = () => undefined;
    await renderSend(async (_input, confirm) => {
      void confirm(REVIEW);
      return new Promise((resolve) => (release = resolve));
    });
    fill('bcrt1qdest', '100');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Review payment' }));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await act(async () => release({ txid: 'late' }));
    expect(screen.queryByTestId('passkey-send-done')).not.toBeInTheDocument();
  });

  it('shows the wallet-api error on the form', async () => {
    await renderSend(async () => {
      throw new Error('Insufficient funds');
    });
    fill('bcrt1qdest', '100');
    expect(screen.getByRole('button', { name: 'Review payment' })).toBeEnabled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Review payment' }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Insufficient funds');
  });

  it('shows the preparing state and declines an open review on unmount', async () => {
    const prepared = deferred<void>();
    let accepted: boolean | undefined;
    const send: SendPayment = async (_input, confirm) => {
      await prepared.promise;
      accepted = await confirm(REVIEW);
      return { txid: 'never' };
    };
    const view = await renderSend(send);
    fill('bcrt1qdest', '100');
    fireEvent.click(screen.getByRole('button', { name: 'Review payment' }));
    expect(screen.getByRole('button', { name: 'Preparing the payment…' })).toBeDisabled();
    await act(async () => prepared.resolve());
    expect(screen.getByTestId('passkey-send-review')).toBeInTheDocument();
    view.unmount();
    await act(async () => undefined);
    expect(accepted).toBe(false);
  });

  it('drops fees that arrive after unmount', async () => {
    const fees = deferred<SendFees>();
    const failing = deferred<SendFees>();
    const first = render(<PasskeySendPanel loadFees={() => fees.promise} send={jest.fn()} />);
    first.unmount();
    await act(async () => fees.resolve(FEES));
    const second = render(<PasskeySendPanel loadFees={() => failing.promise} send={jest.fn()} />);
    second.unmount();
    await act(async () => failing.reject(new Error('late')));
    expect(screen.queryByText('Fee estimates are not available.')).not.toBeInTheDocument();
  });
});
