// Unit tests for QuickLinksSection: both quick-link rows render and the unassigned bank-tx
// entry navigates to the compliance route.

const mockNavigate = jest.fn();

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
