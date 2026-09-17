jest.mock('@dfx.swiss/react', () => ({}));

jest.mock('@dfx.swiss/react-components', () => ({
  IconColor: { WHITE: 'WHITE' },
  IconVariant: { CLOSE: 'CLOSE' },
  DfxIcon: ({ icon, color }: { icon: string; color: string }) => (
    <span data-testid="dfx-icon" data-icon={icon} data-color={color} />
  ),
}));

const mockCloseInfoBanner = jest.fn();
let mockLanguage: { symbol: string } | undefined;
let mockInfoBanner: { en?: string; de?: string; fr?: string } | undefined;

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({
    language: mockLanguage,
    infoBanner: mockInfoBanner,
    closeInfoBanner: mockCloseInfoBanner,
  }),
}));

import { fireEvent, render, screen } from '@testing-library/react';
import { InfoBannerComponent } from 'src/components/info-banner';

const BANNER_CLASSES = [
  'relative',
  'flex',
  'flex-row',
  'justify-center',
  'items-center',
  'w-full',
  'p-3.5',
  'rounded-md',
  'bg-dfxBlue-800',
  'text-white',
];

describe('InfoBannerComponent', () => {
  beforeEach(() => {
    mockCloseInfoBanner.mockReset();
    mockLanguage = undefined;
    mockInfoBanner = undefined;
  });

  it('renders nothing when neither infoBanner nor bannerText is set', () => {
    const { container } = render(<InfoBannerComponent />);
    expect(screen.queryByTestId('info-banner')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('falls back to infoBanner.en when the language is missing', () => {
    mockInfoBanner = { en: 'English notice', de: 'German notice' };
    render(<InfoBannerComponent />);

    const banner = screen.getByTestId('info-banner');
    BANNER_CLASSES.forEach((className) => expect(banner.className.split(/\s+/)).toContain(className));
    expect(screen.getByText('English notice')).toBeInTheDocument();
    expect(screen.getByTestId('dfx-icon')).toHaveAttribute('data-icon', 'CLOSE');
    expect(screen.getByTestId('dfx-icon')).toHaveAttribute('data-color', 'WHITE');
  });

  it('selects the CMS text for language.symbol', () => {
    mockLanguage = { symbol: 'DE' };
    mockInfoBanner = { en: 'English notice', de: 'German notice' };
    render(<InfoBannerComponent />);
    expect(screen.getByText('German notice')).toBeInTheDocument();
    expect(screen.queryByText('English notice')).not.toBeInTheDocument();
  });

  it('falls back to en when the language key is missing', () => {
    mockLanguage = { symbol: 'FR' };
    mockInfoBanner = { en: 'English notice', de: 'German notice' };
    render(<InfoBannerComponent />);
    expect(screen.getByText('English notice')).toBeInTheDocument();
  });

  it('uses bannerText instead of the CMS copy', () => {
    mockLanguage = { symbol: 'EN' };
    mockInfoBanner = { en: 'English notice' };
    render(<InfoBannerComponent bannerText="Override notice" />);
    expect(screen.getByText('Override notice')).toBeInTheDocument();
    expect(screen.queryByText('English notice')).not.toBeInTheDocument();
  });

  it('renders bannerText when infoBanner is empty', () => {
    render(<InfoBannerComponent bannerText="Standalone notice" />);
    expect(screen.getByTestId('info-banner')).toHaveTextContent('Standalone notice');
  });

  it('calls closeInfoBanner from the default close control', () => {
    mockInfoBanner = { en: 'English notice' };
    render(<InfoBannerComponent />);
    fireEvent.click(screen.getByTestId('dfx-icon'));
    expect(mockCloseInfoBanner).toHaveBeenCalledTimes(1);
  });

  it('uses a custom button label and onClick instead of closing', () => {
    const onClick = jest.fn();
    mockInfoBanner = { en: 'English notice' };
    render(<InfoBannerComponent buttonLabel="Dismiss" onClick={onClick} />);

    expect(screen.queryByTestId('dfx-icon')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Dismiss'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(mockCloseInfoBanner).not.toHaveBeenCalled();
  });
});
