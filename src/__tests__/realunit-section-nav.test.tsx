const mockAuth = { role: 'Admin' };

jest.mock('@dfx.swiss/react', () => ({
  useAuthContext: () => ({ session: { role: mockAuth.role } }),
  UserRole: {
    ADMIN: 'Admin',
    REALUNIT: 'RealUnit',
    COMPLIANCE: 'Compliance',
    SUPPORT: 'Support',
  },
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));

import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RealunitWorkspace } from 'src/components/realunit/workspace';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/realunit" element={<RealunitWorkspace />}>
          <Route index element={<div>index</div>} />
          <Route path="quotes/:id" element={<div>quote</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('RealunitSectionNav', () => {
  beforeEach(() => {
    mockAuth.role = 'Admin';
  });

  it('renders nine section links and marks Overview current on /realunit', () => {
    renderAt('/realunit');
    expect(screen.getByRole('link', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Treasury' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Insights' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Holders' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pending Transactions' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Received Transactions' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'RealUnit Support' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'RealUnit Compliance' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'RealUnit Referral' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Treasury' })).toHaveAttribute('href', '/realunit/treasury');
  });

  it('shows a support user only the quotes link', () => {
    mockAuth.role = 'Support';
    renderAt('/realunit/quotes/42');
    expect(screen.getByRole('link', { name: 'Pending Transactions' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Overview' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Treasury' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'RealUnit Support' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'RealUnit Referral' })).not.toBeInTheDocument();
  });

  it('marks Pending Transactions current on a nested quotes route', () => {
    renderAt('/realunit/quotes/42');
    expect(screen.getByRole('link', { name: 'Pending Transactions' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current', 'page');
  });
});
