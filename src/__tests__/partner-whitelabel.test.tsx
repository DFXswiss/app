import { render, screen } from '@testing-library/react';
import { PARTNER_PROGRAM_NAME, PartnerBrand } from 'src/config/partner-dashboard.config';
import { PartnerHeader } from 'src/partner-dashboard/components/header';
import {
  DEFAULT_BRAND_REGISTRY,
  resolvePartnerBrand,
} from 'src/partner-dashboard/util/brands';

/**
 * Whitelabel: brand comes from the runtime registry (or fallback), not REACT_APP_PARTNER_KEY.
 */
describe('partner whitelabel header', () => {
  const themeProps = {
    theme: 'light' as const,
    onThemeChange: () => undefined,
    language: 'en' as const,
    onLanguageChange: () => undefined,
  };

  it('renders an injected partner brand display name and logo URL without Cake-specific code paths', () => {
    const testBrand: PartnerBrand = {
      key: 'acme',
      displayName: 'Acme',
      title: 'DFX × Acme',
      accent: '#124370',
      logoUrl: '/partner-brands/logos/acme.svg',
    };

    render(<PartnerHeader brand={testBrand} isFixture={false} {...themeProps} />);

    expect(screen.getByTestId('partner-title')).toHaveTextContent('Acme');
    expect(screen.getByTestId('partner-title')).not.toHaveTextContent('DFX × Acme');
    expect(document.title).toBe('DFX × Acme');
    expect(screen.getByTestId('partner-logo-img')).toHaveAttribute(
      'src',
      '/partner-brands/logos/acme.svg',
    );
    expect(screen.queryByText('DFX × Cake')).not.toBeInTheDocument();
    expect(screen.queryByTestId('fixture-badge')).not.toBeInTheDocument();
  });

  it('fallback brand: DFX only, plain name, no empty logo box', () => {
    const resolved = resolvePartnerBrand(DEFAULT_BRAND_REGISTRY, {
      walletId: 12345,
      address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    });
    expect(resolved.isFallback).toBe(true);
    expect(resolved.logoUrl).toBeNull();

    const brand: PartnerBrand = {
      key: resolved.key,
      displayName: resolved.displayName,
      title: resolved.title,
      accent: resolved.accent,
      logoUrl: resolved.logoUrl,
      isFallback: true,
    };

    render(<PartnerHeader brand={brand} isFixture={false} {...themeProps} />);

    expect(screen.getByTestId('partner-title')).toHaveTextContent(resolved.displayName);
    expect(screen.queryByTestId('partner-logo')).not.toBeInTheDocument();
    expect(screen.queryByTestId('partner-logo-img')).not.toBeInTheDocument();
    expect(screen.getByTestId('partner-logo-fallback')).toBeInTheDocument();
    // DFX logo still present
    expect(screen.getByTestId('brand-marks').querySelector('svg')).toBeTruthy();
  });

  it('shows the Demodaten badge in fixture mode and sets document title from brand.title', () => {
    const cake = resolvePartnerBrand(DEFAULT_BRAND_REGISTRY, { name: 'cake' });
    const brand: PartnerBrand = {
      key: cake.key,
      displayName: cake.displayName,
      title: cake.title,
      accent: cake.accent,
      logoUrl: cake.logoUrl,
    };
    render(<PartnerHeader brand={brand} isFixture={true} {...themeProps} />);
    expect(screen.getByTestId('fixture-badge')).toHaveTextContent('Demo data');
    expect(screen.getByTestId('partner-title')).toHaveTextContent('Cake');
    expect(document.title).toBe('DFX × Cake');
  });

  it('renders the shared program name as a kicker above the brand row', () => {
    const cake = resolvePartnerBrand(DEFAULT_BRAND_REGISTRY, { name: 'cake' });
    const brand: PartnerBrand = {
      key: cake.key,
      displayName: cake.displayName,
      title: cake.title,
      accent: cake.accent,
      logoUrl: cake.logoUrl,
    };
    render(<PartnerHeader brand={brand} isFixture={false} {...themeProps} />);
    const program = screen.getByTestId('program-name');
    expect(program).toHaveTextContent(PARTNER_PROGRAM_NAME);
    expect(program).toHaveTextContent('Non-Custodial Partner Program');
    expect(screen.getByTestId('partner-title')).toHaveTextContent('Cake');
    expect(screen.getByTestId('partner-title')).not.toHaveTextContent(PARTNER_PROGRAM_NAME);
  });
});
