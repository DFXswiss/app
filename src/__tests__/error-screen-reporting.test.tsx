// Mock @dfx.swiss/react to avoid ES module issues
let mockUser: { accountId: number } | undefined;
jest.mock('@dfx.swiss/react', () => ({ useUserContext: () => ({ user: mockUser }) }));
jest.mock('src/dto/safe.dto', () => ({}));

import { render, screen, waitFor } from '@testing-library/react';
import { Outlet, RouteObject, RouterProvider, createMemoryRouter } from 'react-router-dom';
import ErrorScreen from '../screens/error.screen';

jest.mock('@dfx.swiss/react-components', () => ({
  IconVariant: { HELP: 'help' },
  StyledButtonColor: { GRAY_OUTLINE: 'gray' },
  StyledButton: ({ label }: { label: string }) => <button>{label}</button>,
  StyledVerticalStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_key: string, value: string) => value }),
}));

jest.mock('src/hooks/navigation.hook', () => ({ useNavigation: () => ({ navigate: jest.fn() }) }));
jest.mock('src/hooks/layout-config.hook', () => ({ useLayoutOptions: jest.fn() }));

const mockReportClientError = jest.fn();
const mockReloadOnceForChunkError = jest.fn();

let mockEmbedded = false;

// Only the side effects are mocked — the classification stays real, so the test covers the
// wiring rather than restating it.
jest.mock('src/util/client-error', () => ({
  ...jest.requireActual('src/util/client-error'),
  reportClientError: (...args: unknown[]) => mockReportClientError(...args),
  reloadOnceForChunkError: () => mockReloadOnceForChunkError(),
  isEmbedded: () => mockEmbedded,
}));

function renderAt(path: string, thrown?: unknown): { rerender: () => void } {
  const Boom = (): JSX.Element => {
    if (thrown) throw thrown;
    return <div>ok</div>;
  };

  const routes: RouteObject[] = [
    {
      path: '/',
      element: <Outlet />,
      errorElement: <ErrorScreen />,
      children: [{ path: 'buy', element: <Boom /> }],
    },
  ];

  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(<RouterProvider router={router} />);

  return { rerender: () => view.rerender(<RouterProvider router={router} />) };
}

describe('ErrorScreen reporting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEmbedded = false;
    mockUser = undefined;
    // Deliberately different from every route used below. These tests run on a memory router —
    // the same setup the widget and library builds use — so the browser URL is the host page's and
    // must not be what gets reported.
    Object.defineProperty(window, 'location', {
      value: { ...window.location, pathname: '/host-page' },
      writable: true,
    });
  });

  it('reports the route the customer was on, not the browser URL', async () => {
    renderAt('/buy', new Error('boom'));

    await waitFor(() => expect(mockReportClientError).toHaveBeenCalledTimes(1));
    expect(mockReportClientError.mock.calls[0][1]).toBe('/buy');
    expect(mockReportClientError.mock.calls[0][1]).not.toBe('/host-page');
  });

  // Without this the record says what broke and where, never which account it happened to.
  it('reports the account of the customer who hit the failure', async () => {
    mockUser = { accountId: 123456 };

    renderAt('/buy', new Error('boom'));

    await waitFor(() => expect(mockReportClientError).toHaveBeenCalledTimes(1));
    expect(mockReportClientError.mock.calls[0][2]).toBe(123456);
  });

  it('reports without an account when nobody is signed in', async () => {
    renderAt('/buy', new Error('boom'));

    await waitFor(() => expect(mockReportClientError).toHaveBeenCalledTimes(1));
    expect(mockReportClientError.mock.calls[0][2]).toBeUndefined();
  });

  it('shows the error screen when a route render throws', async () => {
    renderAt('/buy', new Error('boom'));

    expect(await screen.findByText('Oh, sorry, something went wrong')).toBeInTheDocument();
  });

  // The failure used to exist nowhere but the customer's console.
  it('reports a render failure that the router caught', async () => {
    renderAt('/buy', Object.assign(new Error('boom'), { name: 'TypeError' }));

    await waitFor(() => expect(mockReportClientError).toHaveBeenCalledTimes(1));
    expect(mockReportClientError.mock.calls[0][0]).toMatchObject({ message: 'boom', name: 'TypeError' });
    expect(mockReportClientError.mock.calls[0][1]).toBe('/buy');
  });

  // The no-match case is the one where the router's own location is least obviously defined, so
  // the reported route is asserted here too.
  it('reports a route that matched nothing', async () => {
    renderAt('/nonexistent');

    await waitFor(() => expect(mockReportClientError).toHaveBeenCalledTimes(1));
    expect(mockReportClientError.mock.calls[0][0]).toMatchObject({ status: 404 });
    expect(mockReportClientError.mock.calls[0][1]).toBe('/nonexistent');
  });

  it('reports only once per failure', async () => {
    renderAt('/buy', new Error('boom'));

    await waitFor(() => expect(mockReportClientError).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockReportClientError).toHaveBeenCalledTimes(1);
  });

  // The report goes out as soon as the failure is known. A session that finishes loading after that
  // does not reach it — deliberately, since waiting for one would risk losing the report on a page
  // that is already breaking. Pinned so the trade-off is a decision and not an accident.
  it('does not report a second time once the account arrives', async () => {
    const { rerender } = renderAt('/buy', new Error('boom'));
    await waitFor(() => expect(mockReportClientError).toHaveBeenCalledTimes(1));
    expect(mockReportClientError.mock.calls[0][2]).toBeUndefined();

    mockUser = { accountId: 123456 };
    rerender();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockReportClientError).toHaveBeenCalledTimes(1);
  });

  // A window listener never sees this error, which is why the guard has to live here.
  it('reloads once when a chunk failed to load', async () => {
    renderAt('/buy', Object.assign(new Error('Loading chunk 42 failed'), { name: 'ChunkLoadError' }));

    await waitFor(() => expect(mockReloadOnceForChunkError).toHaveBeenCalledTimes(1));
    expect(mockReportClientError).toHaveBeenCalledTimes(1);
  });

  it('does not reload for an ordinary render failure', async () => {
    renderAt('/buy', new Error('Cannot read properties of undefined'));

    await waitFor(() => expect(mockReportClientError).toHaveBeenCalledTimes(1));
    expect(mockReloadOnceForChunkError).not.toHaveBeenCalled();
  });

  // Embedded, the host's page is never reloaded, so nothing recovers the customer. The support
  // screen is lazy-loaded like every other, so it would fail on the same chunk — offering it would
  // send them in circles. Telling them to reload is the only way out.
  describe('when embedded in a host page', () => {
    beforeEach(() => {
      mockEmbedded = true;
    });

    it('asks the customer to reload instead of offering support', async () => {
      renderAt('/buy', Object.assign(new Error('Loading chunk 42 failed'), { name: 'ChunkLoadError' }));

      expect(await screen.findByText(/Please reload this page/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Support' })).not.toBeInTheDocument();
    });

    it('still offers support for a failure a reload would not fix', async () => {
      renderAt('/buy', new Error('Cannot read properties of undefined'));

      expect(await screen.findByText(/Please return to the previous page/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Support' })).toBeInTheDocument();
    });
  });

  // Screens navigate to /error?msg=... deliberately; that path has no route, so the router
  // reports a bare 404 that says nothing about the actual failure.
  it('reports the explicit message instead of the 404 behind it', async () => {
    renderAt('/error?msg=The%20address%20could%20not%20be%20added');

    await waitFor(() => expect(mockReportClientError).toHaveBeenCalledTimes(1));
    expect(mockReportClientError.mock.calls[0][0]).toMatchObject({
      message: 'The address could not be added',
      name: 'HandledError',
    });
    expect(screen.getByText('The address could not be added')).toBeInTheDocument();
    expect(mockReloadOnceForChunkError).not.toHaveBeenCalled();
  });
});
