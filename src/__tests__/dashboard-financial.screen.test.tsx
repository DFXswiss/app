const mockUseAdminGuard = jest.fn();
jest.mock('src/hooks/guard.hook', () => ({
  useAdminGuard: () => mockUseAdminGuard(),
}));

const mockUseLayoutOptions = jest.fn();
jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: (options: unknown) => mockUseLayoutOptions(options),
}));

const mockNavigate = jest.fn();
jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

import { fireEvent, render, screen } from '@testing-library/react';
import DashboardFinancialScreen from 'src/screens/dashboard-financial.screen';

describe('DashboardFinancialScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders Kundengelder and navigates to the kundengelder extract', () => {
    render(<DashboardFinancialScreen />);

    expect(screen.getByText('Kundengelder')).toBeInTheDocument();
    expect(mockUseAdminGuard).toHaveBeenCalled();
    expect(mockUseLayoutOptions).toHaveBeenCalledWith({ title: 'Financial Dashboard' });

    fireEvent.click(screen.getByText('Kundengelder'));
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard/financial/kundengelder');
  });
});
