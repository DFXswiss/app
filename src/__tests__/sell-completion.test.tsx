const mockCloseServices = jest.fn();
const mockCopy = jest.fn();

jest.mock('@dfx.swiss/react', () => ({}));

jest.mock('@dfx.swiss/react-components', () => ({
  CopyButton: ({ onCopy }: { onCopy: () => void }) => (
    <button type="button" onClick={onCopy}>
      copy
    </button>
  ),
  DfxIcon: () => <div data-testid="completion-icon" />,
  IconColor: { BLUE: 'blue' },
  IconSize: { XXL: 'xxl' },
  IconVariant: { PROCESS_DONE: 'process-done' },
  StyledButton: ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
  StyledButtonColor: { STURDY_WHITE: 'sturdy-white' },
  StyledButtonWidth: { FULL: 'full' },
  StyledHorizontalStack: ({ children }: any) => <div>{children}</div>,
  StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('src/contexts/window.context', () => ({ useWindowContext: () => ({ width: 1000 }) }));
jest.mock('../contexts/app-handling.context', () => ({
  CloseType: { SELL: 'sell' },
  useAppHandlingContext: () => ({ closeServices: mockCloseServices }),
}));
jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_namespace: string, text: string) => text }),
}));
jest.mock('../hooks/clipboard.hook', () => ({ useClipboard: () => ({ copy: mockCopy }) }));
jest.mock('../util/utils', () => ({ blankedAddress: (value: string) => value }));
jest.mock('../components/payment/test-simulation', () => ({
  SimulatePayout: ({ sell }: { sell: { routeId: number } }) => <div data-testid="simulate-payout">{sell.routeId}</div>,
}));

import { fireEvent, render, screen } from '@testing-library/react';
import { SellCompletion } from '../components/payment/sell-completion';

describe('SellCompletion', () => {
  beforeEach(() => jest.clearAllMocks());

  it('offers the payout simulation for the sell route and shows the transaction hash', () => {
    const paymentInfo = { id: 1, routeId: 88 } as never;
    render(<SellCompletion paymentInfo={paymentInfo} navigateOnClose={false} txId="txid-1" />);

    expect(screen.getByTestId('simulate-payout')).toHaveTextContent('88');
    expect(screen.getByText('txid-1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'copy' }));
    expect(mockCopy).toHaveBeenCalledWith('txid-1');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(mockCloseServices).toHaveBeenCalledWith({ type: 'sell', isComplete: true, sell: paymentInfo }, false);
    expect(screen.queryByTestId('simulate-payout')).not.toBeInTheDocument();
  });

  it('explains the payout while no transaction hash exists', () => {
    render(<SellCompletion paymentInfo={{ id: 1, routeId: 5 } as never} navigateOnClose />);
    expect(
      screen.getByText(/As soon as the transaction arrives in our wallet, we will transfer your money/),
    ).toBeInTheDocument();
  });
});
