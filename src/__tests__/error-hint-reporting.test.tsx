let mockUser: { accountId: number } | undefined;
jest.mock('@dfx.swiss/react', () => ({ useUserContext: () => ({ user: mockUser }) }));
jest.mock('src/dto/safe.dto', () => ({}));

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ErrorHint } from '../components/error-hint';

jest.mock('@dfx.swiss/react-components', () => ({
  StyledButtonColor: { GRAY_OUTLINE: 'gray' },
  StyledButton: ({ label, onClick }: { label: string; onClick?: () => void }) => (
    <button onClick={onClick}>{label}</button>
  ),
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_key: string, value: string) => value }),
}));

const mockReportClientError = jest.fn();
jest.mock('src/util/client-error', () => ({
  ...jest.requireActual('src/util/client-error'),
  reportClientError: (...args: unknown[]) => mockReportClientError(...args),
}));

function renderHint(ui: JSX.Element) {
  return render(<MemoryRouter initialEntries={['/buy']}>{ui}</MemoryRouter>);
}

describe('ErrorHint reporting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = undefined;
  });

  it('shows the generic sentence and the raw message', () => {
    renderHint(<ErrorHint message="boom" />);

    expect(
      screen.getByText(
        'Something went wrong. Please try again. If the issue persists please reach out to our support.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('omits the Back button when onBack is absent', () => {
    renderHint(<ErrorHint message="boom" />);

    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('renders the Back button and calls onBack when clicked', async () => {
    const onBack = jest.fn();
    renderHint(<ErrorHint message="boom" onBack={onBack} />);

    const back = screen.getByRole('button', { name: 'Back' });
    expect(back).toBeInTheDocument();

    await userEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('reports the message as HandledError on the router route', async () => {
    renderHint(<ErrorHint message="boom" />);

    await waitFor(() => expect(mockReportClientError).toHaveBeenCalledTimes(1));
    expect(mockReportClientError.mock.calls[0][0]).toMatchObject({ message: 'boom', name: 'HandledError' });
    expect(mockReportClientError.mock.calls[0][1]).toBe('/buy');
  });

  it('reports without an account when nobody is signed in', async () => {
    renderHint(<ErrorHint message="boom" />);

    await waitFor(() => expect(mockReportClientError).toHaveBeenCalledTimes(1));
    expect(mockReportClientError.mock.calls[0][2]).toBeUndefined();
  });

  it('reports the account when the customer is signed in', async () => {
    mockUser = { accountId: 123456 };
    renderHint(<ErrorHint message="boom" />);

    await waitFor(() => expect(mockReportClientError).toHaveBeenCalledTimes(1));
    expect(mockReportClientError.mock.calls[0][2]).toBe(123456);
  });

  describe('known API rejections', () => {
    const genericSentence =
      'Something went wrong. Please try again. If the issue persists please reach out to our support.';
    const charsetHint =
      'Your name or address contains characters that our bank payments do not support. Please replace them with simple letters (e.g. l instead of ł) and try again.';
    const bankHint = 'This bank is not supported by DFX. Please use an account at a different bank.';

    it.each([
      ['a single field', 'address.street must only contain characters permitted in Swiss payment systems', charsetHint],
      [
        'several comma-joined fields',
        'address.street must only contain characters permitted in Swiss payment systems,address.city must only contain characters permitted in Swiss payment systems',
        charsetHint,
      ],
      ['the IBAN variant of a blocked bank', 'iban BIC not allowed', bankHint],
      ['a blocked bank', 'BIC not allowed', bankHint],
    ])('shows only the hint for %s and reports it as KnownRejection', async (_case, message, hint) => {
      renderHint(<ErrorHint message={message} />);

      expect(screen.getByText(hint)).toBeInTheDocument();
      expect(screen.queryByText(genericSentence)).not.toBeInTheDocument();
      expect(screen.queryByText(message)).not.toBeInTheDocument();

      await waitFor(() => expect(mockReportClientError).toHaveBeenCalledTimes(1));
      expect(mockReportClientError.mock.calls[0][0]).toMatchObject({ message, name: 'KnownRejection' });
      expect(mockReportClientError.mock.calls[0][1]).toBe('/buy');
    });

    it('keeps the Back button for a known rejection', async () => {
      const onBack = jest.fn();
      renderHint(<ErrorHint message="BIC not allowed" onBack={onBack} />);

      await userEvent.click(screen.getByRole('button', { name: 'Back' }));
      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });
});
