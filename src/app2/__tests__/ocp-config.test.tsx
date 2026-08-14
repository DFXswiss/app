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
    fireEvent.change(screen.getByDisplayValue('60'), { target: { value: 'not-a-number' } });
    fireEvent.change(selects[1], { target: { value: '0' } });
    fireEvent.change(selects[2], { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /save|speichern|salva|enregistrer/i }));
    await waitFor(() => expect(document.querySelector('.paybox-note.ok')).toBeTruthy());
    expect(mockSaveConfig).toHaveBeenCalled();
    expect(mockSaveConfig.mock.calls[0][0]).toMatchObject({
      paymentTimeout: 60,
      displayQr: false,
      cancellable: false,
    });
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
});
