const mockSaveConfig = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  ApiException: class ApiException extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  PaymentStandardType: {
    OPEN_CRYPTO_PAY: 'OpenCryptoPay',
    LIGHTNING_BOLT11: 'LightningBolt11',
    PAY_TO_ADDRESS: 'PayToAddress',
  },
  MinCompletionStatus: {
    TX_MEMPOOL: 'TxMempool',
    TX_BLOCKCHAIN: 'TxBlockchain',
    TX_COMPLETED: 'TxCompleted',
  },
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiException } from '@dfx.swiss/react';
import ConfigView from '../screens/ocp/config';
import { LanguageProvider } from '../i18n';
import { ToastProvider } from '../components/ui';

function renderConfig(config?: Record<string, unknown>) {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <ConfigView ocp={{ config, saveConfig: mockSaveConfig } as never} />
      </ToastProvider>
    </LanguageProvider>,
  );
}

describe('OCP config view', () => {
  beforeEach(() => {
    mockSaveConfig.mockReset();
    mockSaveConfig.mockResolvedValue(undefined);
  });

  it('saves defaults and toggles standards, completion, timeout and flags', async () => {
    renderConfig();
    fireEvent.click(screen.getByRole('checkbox', { name: /lightning/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /lightning/i }));
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'TxCompleted' } });
    fireEvent.change(screen.getByDisplayValue('60'), { target: { value: '120' } });
    fireEvent.change(selects[1], { target: { value: '0' } });
    fireEvent.change(selects[2], { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /save|speichern|salva|enregistrer/i }));
    await waitFor(() => expect(document.querySelector('.paybox-note.ok')).toBeTruthy());
    expect(mockSaveConfig).toHaveBeenCalled();
    expect(mockSaveConfig.mock.calls[0][0]).toMatchObject({
      paymentTimeout: 120,
      displayQr: false,
      cancellable: false,
    });
  });

  it.each(['', '0', '-5', '1.5', 'abc', '   ', 'Infinity'])(
    'rejects timeout %j inline without saving or reporting success',
    async (timeout) => {
      renderConfig();
      fireEvent.change(screen.getByDisplayValue('60'), { target: { value: timeout } });
      fireEvent.click(screen.getByRole('button', { name: /save|speichern|salva|enregistrer/i }));
      expect(await screen.findByText('Enter a positive whole number of seconds.')).toBeInTheDocument();
      expect(mockSaveConfig).not.toHaveBeenCalled();
      expect(document.querySelector('.paybox-note.ok')).toBeNull();
      expect(screen.queryByText(/^Saved$/)).not.toBeInTheDocument();
    },
  );

  it('saves the minimum positive integer after correcting an invalid timeout', async () => {
    renderConfig();
    fireEvent.change(screen.getByDisplayValue('60'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText('Enter a positive whole number of seconds.')).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue('0'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(document.querySelector('.paybox-note.ok')).toBeTruthy());
    expect(mockSaveConfig).toHaveBeenCalledTimes(1);
    expect(mockSaveConfig).toHaveBeenCalledWith(expect.objectContaining({ paymentTimeout: 1 }));
    expect(screen.queryByText('Enter a positive whole number of seconds.')).not.toBeInTheDocument();
  });

  it('does not claim saved when a pending default timeout is cleared', async () => {
    let release!: () => void;
    mockSaveConfig.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    renderConfig();
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText(/sending/i)).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue('60'), { target: { value: '' } });
    release();
    await waitFor(() => expect(document.querySelector('.paybox-note.warn')).toHaveTextContent(/form changed/i));
    expect(document.querySelector('.paybox-note.ok')).toBeNull();
  });

  it('shows the sending state while save is in flight', async () => {
    let release: () => void = () => undefined;
    mockSaveConfig.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = () => resolve();
        }),
    );
    renderConfig();
    fireEvent.click(screen.getByRole('button', { name: /save|speichern|salva|enregistrer/i }));
    expect(await screen.findByText(/sending|senden|invio|envoi/i)).toBeInTheDocument();
    release();
    await waitFor(() => expect(mockSaveConfig).toHaveBeenCalled());
  });

  it('shows an API error message and a generic failure', async () => {
    mockSaveConfig.mockRejectedValueOnce(new ApiException(400, 'nope'));
    renderConfig({
      standards: [],
      minCompletionStatus: 'TxBlockchain',
      paymentTimeout: 30,
      displayQr: false,
      cancellable: false,
    });
    fireEvent.click(screen.getByRole('button', { name: /save|speichern|salva|enregistrer/i }));
    await waitFor(() => expect(screen.getByText(/nope/)).toBeInTheDocument());

    mockSaveConfig.mockRejectedValueOnce(new Error('x'));
    fireEvent.click(screen.getByRole('button', { name: /save|speichern|salva|enregistrer/i }));
    await waitFor(() => expect(mockSaveConfig).toHaveBeenCalledTimes(2));
  });

  it('does not claim saved when the form changes while the PUT is in flight', async () => {
    let release: () => void = () => undefined;
    mockSaveConfig.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = () => resolve();
        }),
    );
    renderConfig();
    fireEvent.click(screen.getByRole('button', { name: /save|speichern|salva|enregistrer/i }));
    expect(await screen.findByText(/sending|senden|invio|envoi/i)).toBeInTheDocument();
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[2], { target: { value: '0' } });
    release();
    await waitFor(() => expect(document.querySelector('.paybox-note.warn')).toBeTruthy());
    expect(document.querySelector('.paybox-note.warn')?.textContent).toMatch(
      /form changed while saving|formular hat sich|modulo è cambiato|formulaire a changé/i,
    );
    expect(document.querySelector('.paybox-note.ok')).toBeNull();
    expect(screen.queryByText(/^Saved$|^Gespeichert$|^Salvato$|^Enregistré$/)).not.toBeInTheDocument();
  });

  it('still reports a failed save when the form changes while the PUT is in flight', async () => {
    let fail: (error: Error) => void = () => undefined;
    mockSaveConfig.mockImplementation(
      () =>
        new Promise<void>((_, reject) => {
          fail = reject;
        }),
    );
    renderConfig();
    fireEvent.click(screen.getByRole('button', { name: /save|speichern|salva|enregistrer/i }));
    expect(await screen.findByText(/sending|senden|invio|envoi/i)).toBeInTheDocument();
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[2], { target: { value: '0' } });
    fail(new ApiException(400, 'nope'));
    await waitFor(() => expect(screen.getByText(/nope/)).toBeInTheDocument());
    expect(
      screen.queryByText(/form changed while saving|formular hat sich|modulo è cambiato|formulaire a changé/i),
    ).not.toBeInTheDocument();
    expect(document.querySelector('.paybox-note.ok')).toBeNull();
  });
});
