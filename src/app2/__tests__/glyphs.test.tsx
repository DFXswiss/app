jest.mock('@dfx.swiss/react', () => ({
  Blockchain: {
    BITCOIN: 'Bitcoin',
    LIGHTNING: 'Lightning',
    SPARK: 'Spark',
    ARKADE: 'Arkade',
    FIRO: 'Firo',
    MONERO: 'Monero',
    ZANO: 'Zano',
    INTERNET_COMPUTER: 'InternetComputer',
    ETHEREUM: 'Ethereum',
    SEPOLIA: 'Sepolia',
    BINANCE_SMART_CHAIN: 'BinanceSmartChain',
    OPTIMISM: 'Optimism',
    ARBITRUM: 'Arbitrum',
    POLYGON: 'Polygon',
    BASE: 'Base',
    GNOSIS: 'Gnosis',
    HAQQ: 'Haqq',
    LIQUID: 'Liquid',
    ARWEAVE: 'Arweave',
    CARDANO: 'Cardano',
    RAILGUN: 'Railgun',
    SOLANA: 'Solana',
    TRON: 'Tron',
    CITREA: 'Citrea',
    CITREA_TESTNET: 'CitreaTestnet',
    DEFICHAIN: 'DeFiChain',
  },
}));

import { act, render, waitFor } from '@testing-library/react';
import { Blockchain } from '@dfx.swiss/react';
import {
  AssetChainGlyph,
  AssetGlyph,
  ChainGlyphBadge,
  FiatGlyph,
  NetworkCardGlyph,
  chainIcon,
} from '../screens/trade/glyphs';

const CG_LOGO_CACHE_KEY = 'dfx_app2_cglogo';

describe('chainIcon', () => {
  it('resolves bundled network and token-as-network icons', () => {
    expect(chainIcon(Blockchain.BITCOIN)).toBeTruthy();
    expect(chainIcon(Blockchain.HAQQ)).toBe(chainIcon(Blockchain.ETHEREUM));
    expect(chainIcon(Blockchain.MONERO)).toBeTruthy();
    expect(chainIcon(Blockchain.INTERNET_COMPUTER)).toBeTruthy();
    expect(chainIcon(Blockchain.FIRO)).toBeTruthy();
    expect(chainIcon(Blockchain.SPARK)).toBeUndefined();
    expect(chainIcon('')).toBeUndefined();
  });
});

describe('AssetGlyph', () => {
  afterEach(() => {
    window.localStorage.removeItem(CG_LOGO_CACHE_KEY);
    jest.restoreAllMocks();
  });

  it('renders a bundled token icon', () => {
    const { container } = render(<AssetGlyph code="btc" />);
    expect(container.querySelector('img.coin')).toBeTruthy();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders a bundled network icon when passed a chain name', () => {
    const { container } = render(<AssetGlyph code="Ethereum" />);
    expect(container.querySelector('img.coin')).toBeTruthy();
  });

  it('falls back to initials for an unknown ticker (2 / 3 / 4 letters and empty)', () => {
    const two = render(<AssetGlyph code="ZZ" />);
    expect(two.container.querySelector('text')?.textContent).toBe('ZZ');
    two.unmount();

    const three = render(<AssetGlyph code="ZZZ" />);
    expect(three.container.querySelector('text')?.textContent).toBe('ZZZ');
    three.unmount();

    const four = render(<AssetGlyph code="ZZZZ" />);
    expect(four.container.querySelector('text')?.textContent).toBe('ZZZZ');
    four.unmount();

    const empty = render(<AssetGlyph code="" />);
    expect(empty.container.querySelector('text')?.textContent).toBe('?');
  });

  it('uses a cached CoinGecko logo without fetching', () => {
    window.localStorage.setItem(
      CG_LOGO_CACHE_KEY,
      JSON.stringify({ PEPE: { url: 'https://img.example/pepe.png', ts: Date.now() } }),
    );
    const fetchSpy = jest.spyOn(window, 'fetch');
    const { container } = render(<AssetGlyph code="PEPE" />);
    expect(container.querySelector('img.coin')).toHaveAttribute('src', 'https://img.example/pepe.png');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('ignores a stale cache entry and a broken cache blob', async () => {
    window.localStorage.setItem(
      CG_LOGO_CACHE_KEY,
      JSON.stringify({ PEPE: { url: 'https://old.example/pepe.png', ts: Date.now() - 900e6 } }),
    );
    jest.spyOn(window, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ image: { small: 'https://img.example/fresh.png' } }),
    } as Response);

    const { container, rerender } = render(<AssetGlyph code="PEPE" />);
    await waitFor(() => {
      expect(container.querySelector('img.coin')).toHaveAttribute('src', 'https://img.example/fresh.png');
    });

    window.localStorage.setItem(CG_LOGO_CACHE_KEY, 'not-json');
    rerender(<AssetGlyph code="SHIB" />);
    await waitFor(() => expect(window.fetch).toHaveBeenCalled());
  });

  it('resolves a CoinGecko id, then a symbol, and keeps initials when both miss', async () => {
    const fetchSpy = jest
      .spyOn(window, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ image: { large: 'https://img.example/doge-large.png' } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ image: 'https://img.example/xyz.png' }],
      } as Response)
      .mockResolvedValue({ ok: false } as Response);

    const doge = render(<AssetGlyph code="DOGE" />);
    await waitFor(() => {
      expect(doge.container.querySelector('img.coin')).toHaveAttribute('src', 'https://img.example/doge-large.png');
    });
    doge.unmount();

    const xyz = render(<AssetGlyph code="XYZ1" />);
    await waitFor(() => {
      expect(xyz.container.querySelector('img.coin')).toHaveAttribute('src', 'https://img.example/xyz.png');
    });
    xyz.unmount();

    const miss = render(<AssetGlyph code="NOPE99" />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(miss.container.querySelector('text')?.textContent).toBe('NOPE');
  });

  it('swallows a thrown fetch and a full localStorage on a successful logo', async () => {
    jest.spyOn(window, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ image: { thumb: 'https://img.example/atom.png' } }),
    } as Response);
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const { container } = render(<AssetGlyph code="ATOM" />);
    await waitFor(() => {
      expect(container.querySelector('img.coin')).toHaveAttribute('src', 'https://img.example/atom.png');
    });
  });

  it('falls through to the symbol search when the id response has no image url', async () => {
    jest
      .spyOn(window, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ image: { small: '', large: undefined, thumb: undefined } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ image: 123 }, { image: 'https://img.example/ltc.png' }],
      } as Response);

    const { container } = render(<AssetGlyph code="LTC" />);
    await waitFor(() => {
      expect(container.querySelector('img.coin')).toHaveAttribute('src', 'https://img.example/ltc.png');
    });
  });

  it('does not apply a logo after unmount', async () => {
    let resolveJson: (value: unknown) => void = () => undefined;
    jest.spyOn(window, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        new Promise((resolve) => {
          resolveJson = resolve;
        }),
    } as Response);

    const view = render(<AssetGlyph code="AVAX" />);
    view.unmount();
    await act(async () => {
      resolveJson({ image: { thumb: 'https://img.example/late.png' } });
      await Promise.resolve();
    });
    expect(document.querySelector('img.coin')).toBeNull();
  });

  it('treats a non-object cache value as empty', () => {
    window.localStorage.setItem(CG_LOGO_CACHE_KEY, 'null');
    const { container } = render(<AssetGlyph code="ZZ" />);
    expect(container.querySelector('text')?.textContent).toBe('ZZ');
  });
});

describe('NetworkCardGlyph / ChainGlyphBadge / FiatGlyph / AssetChainGlyph', () => {
  it('renders a network card image or a rounded-square initial', () => {
    const withIcon = render(<NetworkCardGlyph blockchain="Ethereum" />);
    expect(withIcon.container.querySelector('img')).toBeTruthy();
    withIcon.unmount();

    const fallback = render(<NetworkCardGlyph blockchain="Spark" size={20} />);
    expect(fallback.container.querySelector('text')?.textContent).toBe('S');
  });

  it('renders a chain badge as an image or a small circle', () => {
    const withIcon = render(<ChainGlyphBadge blockchain="Bitcoin" />);
    expect(withIcon.container.querySelector('img.coin')).toBeTruthy();
    withIcon.unmount();

    const fallback = render(<ChainGlyphBadge blockchain="Zano" size={12} />);
    expect(fallback.container.querySelector('text')?.textContent).toBe('ZANO');
  });

  it('renders fiat flags, a multi-letter symbol, a single letter, and the empty fallback', () => {
    expect(render(<FiatGlyph code="EUR" />).container.querySelector('img.coin')).toBeTruthy();
    expect(render(<FiatGlyph code="CHF" />).container.querySelector('img.coin')).toBeTruthy();
    expect(render(<FiatGlyph code="USD" />).container.querySelector('img.coin')).toBeTruthy();
    expect(render(<FiatGlyph code="GBP" />).container.querySelector('img.coin')).toBeTruthy();

    const jpy = render(<FiatGlyph code="JPY" />);
    expect(jpy.container.querySelector('text')?.textContent).toBe('J');

    const empty = render(<FiatGlyph code="" />);
    expect(empty.container.querySelector('text')?.textContent).toBe('¤');
  });

  it('composes the asset glyph with an optional chain badge', () => {
    const withChain = render(<AssetChainGlyph code="USDT" blockchain="Ethereum" />);
    expect(withChain.container.querySelector('.glyph')).toBeTruthy();
    expect(withChain.container.querySelectorAll('img.coin').length).toBeGreaterThan(1);
    withChain.unmount();

    const noChain = render(<AssetChainGlyph code="USDT" />);
    expect(noChain.container.querySelectorAll('img.coin')).toHaveLength(1);
  });
});
