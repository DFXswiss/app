import {
  DEFAULT_BRAND_REGISTRY,
  findBrandEntry,
  PartnerBrandRegistry,
  resolveBrandFromToken,
  resolveFixtureBrand,
  resolvePartnerBrand,
} from 'src/partner-dashboard/util/brands';
import { shortAddress } from 'src/partner-dashboard/util/auth';

describe('partner brand registry (runtime whitelabel)', () => {
  const registry: PartnerBrandRegistry = {
    defaultAccent: '#5B6B7C',
    partners: [
      {
        walletIds: [42],
        names: ['cake'],
        addresses: ['0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE'],
        displayName: 'Cake',
        title: 'DFX × Cake',
        accent: '#E91E8C',
        logo: 'logos/cake.svg',
      },
      {
        walletIds: [7],
        names: ['acme'],
        displayName: 'Acme',
        title: 'DFX × Acme',
        accent: '#124370',
        logo: 'logos/acme.svg',
      },
    ],
  };

  it('matches by wallet id from the company JWT', () => {
    const brand = resolveBrandFromToken(registry, {
      user: 42,
      address: '0xother',
      exp: 9_999_999_999,
    });
    expect(brand.isFallback).toBe(false);
    expect(brand.displayName).toBe('Cake');
    expect(brand.logoUrl).toContain('partner-brands/logos/cake.svg');
    expect(brand.accent).toBe('#E91E8C');
  });

  it('matches by address case-insensitively', () => {
    const entry = findBrandEntry(registry, {
      address: '0xcafecafecafecafecafecafecafecafecafecafe',
    });
    expect(entry?.displayName).toBe('Cake');
  });

  it('matches by name (fixture / ops key)', () => {
    const brand = resolvePartnerBrand(registry, { name: 'acme' });
    expect(brand.displayName).toBe('Acme');
    expect(brand.isFallback).toBe(false);
  });

  it('unknown partner gets DFX fallback: no logo, name from token, neutral accent', () => {
    const address = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
    const brand = resolveBrandFromToken(registry, {
      user: 999_001,
      address,
      exp: 9_999_999_999,
    });
    expect(brand.isFallback).toBe(true);
    expect(brand.logoUrl).toBeNull();
    expect(brand.displayName).toBe(shortAddress(address));
    expect(brand.title).toBe(`DFX × ${shortAddress(address)}`);
    expect(brand.accent).toBe('#5B6B7C');
    // Fallback must still be a complete brand object (dashboard usable immediately)
    expect(brand.displayName.length).toBeGreaterThan(0);
    expect(brand.title.length).toBeGreaterThan(0);
  });

  it('fixture resolves Cake from the default registry', () => {
    const brand = resolveFixtureBrand(DEFAULT_BRAND_REGISTRY);
    expect(brand.displayName).toBe('Cake');
    expect(brand.isFallback).toBe(false);
    expect(brand.logoUrl).toContain('cake.svg');
  });

  it('DEFAULT_BRAND_REGISTRY lists Cake as first entry (runtime file, not build key)', () => {
    expect(DEFAULT_BRAND_REGISTRY.partners[0]?.names).toContain('cake');
    expect(DEFAULT_BRAND_REGISTRY.partners[0]?.displayName).toBe('Cake');
  });
});
