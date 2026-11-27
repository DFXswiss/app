const mockCloseServices = jest.fn();
const mockNavigate = jest.fn();
let mockTestEnvironment = true;

jest.mock('@dfx.swiss/react', () => ({}));

jest.mock('@dfx.swiss/react-components', () => ({
  DfxIcon: () => <div data-testid="completion-icon" />,
  IconColor: { BLUE: 'blue' },
  IconSize: { XXL: 'xxl' },
  IconVariant: { PROCESS_DONE: 'process-done' },
  SpinnerSize: { LG: 'lg' },
  StyledButton: ({ label, onClick }: any) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
  StyledButtonColor: { STURDY_WHITE: 'sturdy-white' },
  StyledButtonWidth: { FULL: 'full' },
  StyledLoadingSpinner: () => <div data-testid="loading-spinner" />,
  StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('../contexts/app-handling.context', () => ({
  CloseType: { BUY: 'buy' },
  useAppHandlingContext: () => ({ closeServices: mockCloseServices }),
}));

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_namespace: string, text: string) => text,
  }),
}));

jest.mock('../hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('../components/edit/mail.edit', () => ({
  MailEdit: ({ onSubmit }: { onSubmit: () => void }) => (
    <button type="button" onClick={onSubmit}>
      Save mail
    </button>
  ),
}));

jest.mock('../components/payment/simulate-payment', () => ({
  SimulatePayment: ({ buy }: { buy: { id: number } }) => <div data-testid="simulate-payment">{buy.id}</div>,
}));

jest.mock('../util/test-network', () => ({ isTestEnvironment: () => mockTestEnvironment }));

import { fireEvent, render, screen } from '@testing-library/react';
import { BuyCompletion } from '../components/payment/buy-completion';

const MAIL_USER = { mail: 'user@example.com' } as any;

describe('BuyCompletion test tool and states', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTestEnvironment = true;
  });

  it('offers the payment simulation for the pending buy on a test build', () => {
    render(<BuyCompletion user={MAIL_USER} paymentInfo={{ id: 42 } as any} navigateOnClose={false} />);

    expect(screen.getByTestId('simulate-payment')).toHaveTextContent('42');
  });

  it('never offers the payment simulation on a production build', () => {
    mockTestEnvironment = false;
    render(<BuyCompletion user={MAIL_USER} paymentInfo={{ id: 42 } as any} navigateOnClose={false} />);

    expect(screen.queryByTestId('simulate-payment')).not.toBeInTheDocument();
  });

  it('offers no simulation without a pending buy', () => {
    render(<BuyCompletion user={MAIL_USER} navigateOnClose={false} />);

    expect(screen.queryByTestId('simulate-payment')).not.toBeInTheDocument();
    expect(screen.getByText('Nice! You are all set! Give us a minute to handle your transaction.')).toBeInTheDocument();
  });

  it('shows a spinner while the user loads', () => {
    render(<BuyCompletion paymentInfo={{ id: 42 } as any} navigateOnClose={false} />);

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.queryByTestId('simulate-payment')).not.toBeInTheDocument();
  });

  it('asks a user without mail for an address and closes after it is saved', () => {
    mockCloseServices.mockReturnValue(true);
    render(<BuyCompletion user={{ mail: null } as any} paymentInfo={{ id: 42 } as any} navigateOnClose />);

    expect(
      screen.getByText(
        'As soon as the transfer arrives in our bank account, we will transfer your asset to your wallet.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('simulate-payment')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save mail' }));

    expect(mockCloseServices).toHaveBeenCalledWith({ type: 'buy', isComplete: true, buy: { id: 42 } }, true);
    expect(screen.queryByTestId('completion-icon')).not.toBeInTheDocument();
  });
});
