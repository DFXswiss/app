// Unit tests for QuickLinksSection: both quick-link rows render and the unassigned bank-tx
// entry navigates to the compliance route.

const mockNavigate = jest.fn();

// The component only needs `todayAsString` from the helpers. Loading the real module pulls in
// src/util/utils.ts and from there `@dfx.swiss/react`, whose dist is ESM and is not transformed
// for node_modules - the suite would fail on `Unexpected token 'export'` before any test runs.
jest.mock('src/util/compliance-helpers', () => ({
  todayAsString: () => '2026-08-11',
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

import { fireEvent, render, screen } from '@testing-library/react';
import { QuickLinksSection } from 'src/components/compliance/quick-links-section';

describe('QuickLinksSection', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders both quick-link entries', () => {
    render(<QuickLinksSection />);

    expect(screen.getByText('Aktennotiz erstellen')).toBeInTheDocument();
    expect(screen.getByText('Unzugeordnete Bankeingänge')).toBeInTheDocument();
    expect(screen.getByText('Quick links')).toBeInTheDocument();
  });

  it('navigates to compliance/bank-tx/unassigned when Unzugeordnete Bankeingänge is clicked', () => {
    render(<QuickLinksSection />);

    fireEvent.click(screen.getByText('Unzugeordnete Bankeingänge'));

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('compliance/bank-tx/unassigned');
  });
});
