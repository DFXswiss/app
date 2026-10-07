jest.mock('../util/safe-storage', () => ({
  installStorageFallback: jest.fn(),
}));

jest.mock('../util/client-error', () => ({
  markEmbedded: jest.fn(),
}));

jest.mock('../App', () => ({
  __esModule: true,
  default: function AppStub() {
    return <div data-testid="app-stub" />;
  },
}));

jest.mock('../components/boot-error-boundary', () => ({
  BootErrorBoundary: function BootErrorBoundaryPassThrough({
    children,
  }: {
    children?: JSX.Element | JSX.Element[] | string | number | boolean | null;
  }) {
    return <div data-testid="boot-boundary">{children}</div>;
  },
  StorageBlockedBanner: function StorageBlockedBannerStub() {
    return <div data-testid="storage-banner" />;
  },
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  createMemoryRouter: jest.fn(),
}));

import { render, screen, within } from '@testing-library/react';
import MainWidget from '../Main.widget';
import { isWebComponent } from '../util/web-component-mode';

describe('MainWidget', () => {
  it('renders banner and App inside the boundary and keeps stylesheet links', () => {
    const { container } = render(<MainWidget />);

    expect(isWebComponent()).toBe(true);

    const boundary = screen.getByTestId('boot-boundary');
    expect(within(boundary).getByTestId('storage-banner')).toBeInTheDocument();
    expect(within(boundary).getByTestId('app-stub')).toBeInTheDocument();

    const links = container.querySelectorAll('link');
    expect(Array.from(links).some((link) => link.getAttribute('href') === 'main-widget.css')).toBe(true);
    expect(Array.from(links).some((link) => (link.getAttribute('href') ?? '').includes('fonts.googleapis.com'))).toBe(
      true,
    );
  });
});
