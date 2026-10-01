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

import { fireEvent, render, screen, within } from '@testing-library/react';
import HistoryView from '../screens/ocp/history';
import { LanguageProvider } from '../i18n';

function renderHistory(ocp: { history: unknown; loadHistory: jest.Mock; historyError?: boolean }) {
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
              historyError: false,
              history: { items: [] },
            } as never
          }
        />
      </LanguageProvider>,
    );
    expect(screen.getByText(/no payments|keine|nessun|aucun/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry|erneut|riprova|réessayer/i })).not.toBeInTheDocument();

    rerender(
      <LanguageProvider>
        <HistoryView
          ocp={
            {
              loadHistory,
              history: {
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

  it('shows a load error instead of the empty list when the request failed', () => {
    const loadHistory = jest.fn();
    renderHistory({
      loadHistory,
      historyError: true,
      history: { items: [] },
    });
    expect(
      screen.getByText(/couldn't load|konnte nicht laden|impossibile caricare|chargement impossible/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/no payments yet|noch keine zahlungen|ancora nessun pagamento|aucun paiement/i),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry|erneut|riprova|réessayer/i }));
    expect(loadHistory).toHaveBeenCalled();
  });

  it('shows completed monthly payments as separate currency totals and excludes pending and expired amounts', () => {
    renderHistory({
      loadHistory: jest.fn(),
      history: {
        items: [
          { id: 1, status: 'Completed', currency: 'CHF', amount: 40 },
          { id: 2, status: 'Completed', currency: 'EUR', amount: 50 },
          { id: 3, status: 'Completed', currency: 'CHF', amount: 60 },
          { id: 4, status: 'Pending', currency: 'CHF', amount: 200 },
          { id: 5, status: 'Expired', currency: 'EUR', amount: 300 },
        ],
      },
    });
    const tile = within(screen.getByText('Completed this month').parentElement as HTMLElement);
    expect(tile.getByText('100 CHF')).toBeInTheDocument();
    expect(tile.getByText('50 EUR')).toBeInTheDocument();
    expect(tile.queryByText('150 CHF')).not.toBeInTheDocument();
    expect(tile.queryByText('300 CHF')).not.toBeInTheDocument();
    expect(tile.queryByText('350 EUR')).not.toBeInTheDocument();
    expect(screen.queryByText('Total received')).not.toBeInTheDocument();
  });

  it('formats an EUR-only total without inventing a CHF amount', () => {
    renderHistory({
      loadHistory: jest.fn(),
      history: { items: [{ id: 1, status: 'Completed', currency: 'EUR', amount: 12.345 }] },
    });
    const tile = within(screen.getByText('Completed this month').parentElement as HTMLElement);
    expect(tile.getByText('12.35 EUR')).toBeInTheDocument();
    expect(tile.queryByText(/CHF/)).not.toBeInTheDocument();
  });

  it('shows zero without an invented currency when there are no completed payments', () => {
    renderHistory({
      loadHistory: jest.fn(),
      history: { items: [{ id: 1, status: 'Pending', currency: 'EUR', amount: 5 }] },
    });
    const tile = within(screen.getByText('Completed this month').parentElement as HTMLElement);
    expect(tile.getByText('0')).toBeInTheDocument();
    expect(tile.queryByText(/CHF|EUR/)).not.toBeInTheDocument();
  });
});
