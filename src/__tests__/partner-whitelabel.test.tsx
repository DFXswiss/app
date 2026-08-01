import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import {
  PartnerBrand,
  PARTNER_BRANDS,
  PARTNER_PROGRAM_NAME,
} from 'src/config/partner-dashboard.config';
import { PartnerHeader } from 'src/partner-dashboard/components/header';

/**
 * Whitelabel: a second partner entry (registered only in this test) must render
 * its own title and logo without any Cake-specific branching in components.
 */
describe('partner whitelabel header', () => {
  const originalCake = PARTNER_BRANDS.cake;

  afterEach(() => {
    // restore registry
    Object.keys(PARTNER_BRANDS).forEach((k) => {
      if (k !== 'cake') delete PARTNER_BRANDS[k];
    });
    if (originalCake) PARTNER_BRANDS.cake = originalCake;
  });

  it('renders an injected partner brand display name and logo without Cake-specific code paths', () => {
    const testBrand: PartnerBrand = {
      key: 'acme',
      displayName: 'Acme',
      title: 'DFX × Acme',
      accent: '#124370',
      logo: createElement('span', { 'data-testid': 'acme-logo' }, 'ACME-MARK'),
    };

    // Register only for this test — production code still has just cake.
    PARTNER_BRANDS.acme = testBrand;

    render(<PartnerHeader brand={testBrand} isFixture={false} />);

    // Visible h1 is displayName only (logos carry the marks); full title is document.title
    expect(screen.getByTestId('partner-title')).toHaveTextContent('Acme');
    expect(screen.getByTestId('partner-title')).not.toHaveTextContent('DFX × Acme');
    expect(document.title).toBe('DFX × Acme');
    expect(screen.getByTestId('acme-logo')).toHaveTextContent('ACME-MARK');
    expect(screen.queryByText('DFX × Cake')).not.toBeInTheDocument();
    expect(screen.queryByTestId('fixture-badge')).not.toBeInTheDocument();
  });

  it('shows the Demodaten badge in fixture mode and sets document title from brand.title', () => {
    const cake = PARTNER_BRANDS.cake;
    if (!cake) throw new Error('cake brand missing');
    render(<PartnerHeader brand={cake} isFixture={true} />);
    expect(screen.getByTestId('fixture-badge')).toHaveTextContent('Demodaten');
    expect(screen.queryByTestId('suppression-notice')).not.toBeInTheDocument();
    expect(screen.getByTestId('partner-title')).toHaveTextContent('Cake');
    expect(document.title).toBe('DFX × Cake');
  });

  it('renders the shared program name as a kicker above the brand row', () => {
    const cake = PARTNER_BRANDS.cake;
    if (!cake) throw new Error('cake brand missing');
    render(<PartnerHeader brand={cake} isFixture={false} />);
    const program = screen.getByTestId('program-name');
    expect(program).toHaveTextContent(PARTNER_PROGRAM_NAME);
    expect(program).toHaveTextContent('Non-Custodial Partner Program');
    // Partner name remains the main h1; program name is not the title
    expect(screen.getByTestId('partner-title')).toHaveTextContent('Cake');
    expect(screen.getByTestId('partner-title')).not.toHaveTextContent(PARTNER_PROGRAM_NAME);
  });
});
