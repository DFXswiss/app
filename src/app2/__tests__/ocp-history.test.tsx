jest.mock('@dfx.swiss/react', () => ({
  Blockchain: {
    BITCOIN: 'Bitcoin',
    ETHEREUM: 'Ethereum',
    LIGHTNING: 'Lightning',
    MONERO: 'Monero',
  },
}));

jest.mock('../screens/ocp/links', () => ({
  paymentStatusLabel: (_t: (key: string) => string, status: string) => status,
}));

import { render, screen } from '@testing-library/react';
import HistoryView from '../screens/ocp/history';
import { LanguageProvider } from '../i18n';

function renderHistory(ocp: { history: unknown; loadHistory: jest.Mock }) {
  return render(
    <LanguageProvider>
      <HistoryView ocp={ocp as never} />
    </LanguageProvider>,
  );
}

describe('OCP history view', () => {
  it('loads when history is null and renders empty, pending, completed and cancelled rows', () => {
    const loadHistory = jest.fn();
    const { rerender } = renderHistory({ history: null, loadHistory });
    expect(loadHistory).toHaveBeenCalled();
    expect(document.querySelector('.spin')).toBeTruthy();

    rerender(
      <LanguageProvider>
        <HistoryView
          ocp={
            {
              loadHistory,
              history: { total: 12.345, items: [] },
            } as never
          }
        />
      </LanguageProvider>,
    );
    expect(screen.getByText(/no payments|keine|nessun|aucun/i)).toBeInTheDocument();

    rerender(
      <LanguageProvider>
        <HistoryView
          ocp={
            {
              loadHistory,
              history: {
                total: 10,
                items: [
                  { id: '1', status: 'Completed', note: 'Tip', when: 'today', currency: 'CHF', amount: 5 },
                  { id: '2', status: 'Pending', when: '', currency: '', amount: 3 },
                  { id: '3', status: 'Expired', note: '', when: 'y', currency: 'EUR', amount: 2 },
                ],
              },
            } as never
          }
        />
      </LanguageProvider>,
    );
    expect(screen.getByText('Tip')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Expired')).toBeInTheDocument();
  });
});
