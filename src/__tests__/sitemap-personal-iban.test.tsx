jest.mock('@dfx.swiss/react', () => ({
  FiatPaymentMethod: { BANK: 'Bank' },
  PersonalIbanProvider: { FRICK: 'Frick' },
}));

jest.mock('@dfx.swiss/react-components', () => ({
  StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('../hooks/guard.hook', () => ({
  useAdminGuard: () => undefined,
}));

jest.mock('../hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SitemapScreen from '../screens/sitemap.screen';

describe('Sitemap personal-iban navigation', () => {
  it('lists the partner onboarding-fee screen', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SitemapScreen />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Partner Onboarding Fee (/partner/onboarding-fee)' })).toHaveAttribute(
      'href',
      '/partner/onboarding-fee',
    );
  });

  it('carries only personal-iban into the Buy link', () => {
    render(
      <MemoryRouter
        initialEntries={['/sitemap?personal-iban=frick&mail=customer@example.com']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <SitemapScreen />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Buy (/buy)' })).toHaveAttribute('href', '/buy?personal-iban=frick');
  });
});
