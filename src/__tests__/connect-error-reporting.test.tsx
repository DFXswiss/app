let mockUser: { accountId: number } | undefined;
jest.mock('@dfx.swiss/react', () => ({ useUserContext: () => ({ user: mockUser }) }));
jest.mock('src/dto/safe.dto', () => ({}));

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConnectError, ConnectInstructions } from '../components/home/connect-shared';

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_key: string, value: string, _params?: Record<string, string>) => value,
  }),
}));

const mockReportClientError = jest.fn();
jest.mock('src/util/client-error', () => ({
  ...jest.requireActual('src/util/client-error'),
  reportClientError: (...args: unknown[]) => mockReportClientError(...args),
}));

function renderAt(ui: JSX.Element) {
  return render(<MemoryRouter initialEntries={['/buy']}>{ui}</MemoryRouter>);
}

describe('ConnectError reporting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = undefined;
  });

  it('shows Connection failed! and the translated error string', () => {
    renderAt(<ConnectError error="Please install MetaMask or use a desktop computer" />);

    expect(screen.getByText('Connection failed!')).toBeInTheDocument();
    expect(screen.getByText('Please install MetaMask or use a desktop computer')).toBeInTheDocument();
  });

  it('reports the error as HandledError on the router route', async () => {
    renderAt(<ConnectError error="Please install MetaMask or use a desktop computer" />);

    await waitFor(() => expect(mockReportClientError).toHaveBeenCalledTimes(1));
    expect(mockReportClientError.mock.calls[0][0]).toMatchObject({
      message: 'Please install MetaMask or use a desktop computer',
      name: 'HandledError',
    });
    expect(mockReportClientError.mock.calls[0][1]).toBe('/buy');
  });

  it('does not report when error is undefined at runtime and still shows the heading', async () => {
    renderAt(<ConnectError error={undefined as unknown as string} />);

    expect(screen.getByText('Connection failed!')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockReportClientError).not.toHaveBeenCalled();
  });

  it('does not report when error is empty', async () => {
    renderAt(<ConnectError error="" />);

    expect(screen.getByText('Connection failed!')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockReportClientError).not.toHaveBeenCalled();
  });
});

describe('ConnectInstructions', () => {
  it('renders steps and an image when img is provided', () => {
    render(
      <ConnectInstructions
        steps={['Open your wallet', 'Confirm the connection']}
        params={{}}
        img="https://example.com/wallet.png"
      />,
    );

    expect(screen.getByText('Open your wallet')).toBeInTheDocument();
    expect(screen.getByText('Confirm the connection')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/wallet.png');
  });

  it('renders steps without an image when img is omitted', () => {
    render(<ConnectInstructions steps={['Open your wallet', 'Confirm the connection']} params={{}} />);

    expect(screen.getByText('Open your wallet')).toBeInTheDocument();
    expect(screen.getByText('Confirm the connection')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
