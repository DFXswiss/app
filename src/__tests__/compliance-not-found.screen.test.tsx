// Unit tests for ComplianceNotFoundScreen: the guarded catch-all for unknown /compliance paths.

const mockUseComplianceGuard = jest.fn();

jest.mock('@dfx.swiss/react-components', () => ({
  StyledVerticalStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/compliance/does-not-exist' }),
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));

jest.mock('src/hooks/guard.hook', () => ({
  useComplianceGuard: (...args: unknown[]) => mockUseComplianceGuard(...args),
}));

jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));

import { render, screen } from '@testing-library/react';
import ComplianceNotFoundScreen from 'src/screens/compliance-not-found.screen';

describe('ComplianceNotFoundScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // The whole point of this screen: an unknown compliance path must still run the role guard, so an
  // unauthorised role is sent away instead of parked on a /compliance URL (issue #1306).
  it('calls the compliance guard on render, with the guard left active', () => {
    render(<ComplianceNotFoundScreen />);

    expect(mockUseComplianceGuard).toHaveBeenCalledWith();
  });

  it('names the missing page and shows the path that was requested', () => {
    render(<ComplianceNotFoundScreen />);

    expect(screen.getByText('This compliance page does not exist')).toBeInTheDocument();
    expect(screen.getByText('/compliance/does-not-exist')).toBeInTheDocument();
  });
});
