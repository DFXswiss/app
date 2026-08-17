import { render, screen } from '@testing-library/react';
import { STAFF_NAME_MISSING, StaffIdentityBlock, staffNameLoadError } from 'src/components/compliance/staff-identity';

const mockStaff: { name?: string; isLoading: boolean; error?: string } = {
  name: 'Ada Lovelace',
  isLoading: false,
  error: undefined,
};

jest.mock('src/hooks/staff-verified-name.hook', () => ({
  useStaffVerifiedName: () => mockStaff,
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

describe('StaffIdentityBlock', () => {
  beforeEach(() => {
    mockStaff.name = 'Ada Lovelace';
    mockStaff.isLoading = false;
    mockStaff.error = undefined;
  });

  it('shows the loaded name', () => {
    render(<StaffIdentityBlock label="Editor:" />);

    expect(screen.getByText('Editor:')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
  });

  it('shows a placeholder while loading', () => {
    mockStaff.name = undefined;
    mockStaff.isLoading = true;

    render(<StaffIdentityBlock label="Editor:" />);

    expect(screen.getByText('…')).toBeInTheDocument();
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
  });

  it('shows the missing-name hint when the account has no verified name', () => {
    mockStaff.name = undefined;

    render(<StaffIdentityBlock label="Editor:" />);

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByTestId('error-hint')).toHaveTextContent(STAFF_NAME_MISSING);
  });

  it('shows the load error when fetching the name failed', () => {
    mockStaff.name = undefined;
    mockStaff.error = 'Network down';

    render(<StaffIdentityBlock label="Signature" />);

    expect(screen.getByTestId('error-hint')).toHaveTextContent(staffNameLoadError('Network down'));
  });
});
