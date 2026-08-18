jest.mock('@dfx.swiss/react', () => ({
  Blockchain: {
    BITCOIN: 'Bitcoin',
    ETHEREUM: 'Ethereum',
    ARBITRUM: 'Arbitrum',
    OPTIMISM: 'Optimism',
    POLYGON: 'Polygon',
    BASE: 'Base',
    BINANCE_SMART_CHAIN: 'BinanceSmartChain',
    GNOSIS: 'Gnosis',
    HAQQ: 'Haqq',
    SOLANA: 'Solana',
    TRON: 'Tron',
    CARDANO: 'Cardano',
    INTERNET_COMPUTER: 'InternetComputer',
    CITREA: 'Citrea',
    FIRO: 'Firo',
    LIGHTNING: 'Lightning',
    MONERO: 'Monero',
    SEPOLIA: 'Sepolia',
  },
}));

import { fireEvent, render, screen } from '@testing-library/react';
import { Blockchain } from '@dfx.swiss/react';
import { AssetPicker } from '../components/pickers/AssetPicker';
import { LanguageProvider } from '../i18n';
import type { TradeAsset } from '../screens/trade/types';

const usdt: TradeAsset = {
  code: 'USDT',
  description: 'Tether',
  chains: [
    { blockchain: Blockchain.ETHEREUM, asset: { buyable: true, sellable: true } as never },
    { blockchain: Blockchain.ARBITRUM, asset: { buyable: true, sellable: true } as never },
  ],
};
const btc: TradeAsset = {
  code: 'BTC',
  description: 'Bitcoin',
  chains: [{ blockchain: Blockchain.BITCOIN, asset: { buyable: true, sellable: true } as never }],
};

function renderPicker(onSelect = jest.fn()) {
  return render(
    <LanguageProvider>
      <AssetPicker
        open
        onClose={jest.fn()}
        titleId="asset-title"
        titleKey="chooseAsset"
        pool={[usdt, btc]}
        cap="buy"
        sessionBlockchains={[Blockchain.ETHEREUM, Blockchain.ARBITRUM, Blockchain.BITCOIN]}
        onSelect={onSelect}
      />
    </LanguageProvider>,
  );
}

describe('AssetPicker', () => {
  it('selects a single-chain asset immediately and opens a chain step for multi-chain', () => {
    const onSelect = jest.fn();
    renderPicker(onSelect);
    fireEvent.click(screen.getByText('BTC'));
    expect(onSelect).toHaveBeenCalled();
  });

  it('opens a chain step for a multi-chain asset', () => {
    const onSelect = jest.fn();
    renderPicker(onSelect);
    fireEvent.click(screen.getByText('USDT'));
    expect(screen.getByText(/ethereum/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /arbitrum/i }));
    expect(onSelect).toHaveBeenCalled();
  });

  it('sorts equal-rank assets by ticker', () => {
    const aaa: TradeAsset = {
      code: 'AAA',
      description: 'Alpha',
      chains: [{ blockchain: Blockchain.ETHEREUM, asset: { buyable: true, sellable: true } as never }],
    };
    const zzz: TradeAsset = {
      code: 'ZZZ',
      description: 'Zulu',
      chains: [{ blockchain: Blockchain.ETHEREUM, asset: { buyable: true, sellable: true } as never }],
    };
    render(
      <LanguageProvider>
        <AssetPicker
          open
          onClose={jest.fn()}
          titleId="asset-title"
          titleKey="chooseAsset"
          pool={[zzz, aaa]}
          cap="buy"
          sessionBlockchains={[Blockchain.ETHEREUM]}
          onSelect={jest.fn()}
        />
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /ethereum/i }));
    const labels = screen.getAllByText(/AAA|ZZZ/).map((node) => node.textContent);
    expect(labels.indexOf('AAA')).toBeLessThan(labels.indexOf('ZZZ'));
  });

  it('filters by search', () => {
    renderPicker();
    fireEvent.change(screen.getByLabelText(/search|suchen|cerca|rechercher/i), { target: { value: 'btc' } });
    expect(screen.getByText('BTC')).toBeInTheDocument();
  });

  it('filters by chip, excludes a ticker and goes back from the chain step', () => {
    const onClose = jest.fn();
    render(
      <LanguageProvider>
        <AssetPicker
          open
          onClose={onClose}
          titleId="asset-title"
          titleKey="chooseAsset"
          pool={[usdt, btc]}
          cap="buy"
          excludeCode="BTC"
          selectedCode="USDT"
          selectedBlockchain={Blockchain.ETHEREUM}
          sessionBlockchains={[Blockchain.ETHEREUM, Blockchain.ARBITRUM, Blockchain.BITCOIN]}
          onSelect={jest.fn()}
        />
      </LanguageProvider>,
    );
    expect(screen.queryByText('BTC')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /stable|stablecoins/i }));
    expect(screen.getByText('USDT')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /bitcoin/i }));
    expect(screen.queryByText('USDT')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ethereum/i }));
    fireEvent.click(screen.getByText('USDT'));
    fireEvent.click(screen.getByText(/all assets|alle assets|tutti|tous/i));
    expect(screen.getByLabelText(/search|suchen|cerca|rechercher/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('filters favorites, monero, swiss and shows empty states', () => {
    const zchf: TradeAsset = {
      code: 'ZCHF',
      description: 'Franken',
      chains: [{ blockchain: Blockchain.ETHEREUM, asset: { buyable: true, sellable: true } as never }],
    };
    const xmr: TradeAsset = {
      code: 'XMR',
      description: 'Monero',
      chains: [{ blockchain: Blockchain.MONERO, asset: { buyable: true, sellable: true } as never }],
    };
    render(
      <LanguageProvider>
        <AssetPicker
          open
          onClose={jest.fn()}
          titleId="asset-title"
          titleKey="chooseAsset"
          pool={[usdt, btc, zchf, xmr]}
          cap="buy"
          sessionBlockchains={[Blockchain.ETHEREUM, Blockchain.BITCOIN, Blockchain.MONERO]}
          onSelect={jest.fn()}
        />
      </LanguageProvider>,
    );
    expect(screen.getByText('BTC')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Monero' }));
    expect(screen.getByText('XMR')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Swiss' }));
    expect(screen.getAllByText('ZCHF').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/swiss/i).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText(/search|suchen|cerca|rechercher/i), { target: { value: 'nope-asset' } });
    expect(screen.getByText(/no assets found|keine assets|nessun asset|aucun actif/i)).toBeInTheDocument();
  });

  it('shows the no-wallet-assets empty state', () => {
    render(
      <LanguageProvider>
        <AssetPicker
          open
          onClose={jest.fn()}
          titleId="asset-title"
          titleKey="chooseAsset"
          pool={[usdt, btc]}
          cap="buy"
          sessionBlockchains={['NotAChain']}
          onSelect={jest.fn()}
        />
      </LanguageProvider>,
    );
    expect(screen.getByText(/no assets available|keine assets|nessun asset|aucun actif/i)).toBeInTheDocument();
  });

  it('picks with the keyboard and scrolls the filter row', () => {
    renderPicker();
    const row = screen.getByText('BTC').closest('[role="button"]') as HTMLElement;
    fireEvent.keyDown(row, { key: 'Enter' });
    const frow = document.querySelector('.frow') as HTMLDivElement;
    Object.defineProperty(frow, 'scrollWidth', { configurable: true, value: 800 });
    Object.defineProperty(frow, 'clientWidth', { configurable: true, value: 200 });
    Object.defineProperty(frow, 'scrollLeft', { configurable: true, writable: true, value: 40 });
    frow.scrollBy = jest.fn();
    fireEvent.scroll(frow);
    fireEvent.click(screen.getByRole('button', { name: /scroll categories right/i }));
    fireEvent.click(screen.getByRole('button', { name: /scroll categories left/i }));
    expect(frow.scrollBy).toHaveBeenCalled();
  });

  it('uses the chain name alone when it matches the description', () => {
    const eth: TradeAsset = {
      code: 'ETH',
      description: 'Ethereum',
      chains: [{ blockchain: Blockchain.ETHEREUM, asset: { buyable: true, sellable: true } as never }],
    };
    render(
      <LanguageProvider>
        <AssetPicker
          open
          onClose={jest.fn()}
          titleId="asset-title"
          titleKey="chooseAsset"
          pool={[eth]}
          cap="buy"
          sessionBlockchains={[Blockchain.ETHEREUM]}
          onSelect={jest.fn()}
        />
      </LanguageProvider>,
    );
    expect(screen.getByText('ETH')).toBeInTheDocument();
  });

  it('returns to favorites and picks a chain with the keyboard', () => {
    const onSelect = jest.fn();
    renderPicker(onSelect);
    fireEvent.click(screen.getByRole('button', { name: /stable|stablecoins/i }));
    fireEvent.click(screen.getByRole('button', { name: /favorites|favoriten|preferiti|favoris/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Ethereum' }));
    fireEvent.click(screen.getByText('USDT'));
    const back = screen.getByText(/all assets|alle assets|tutti|tous/i).closest('[role="button"]') as HTMLElement;
    fireEvent.keyDown(back, { key: 'Enter' });
    fireEvent.click(screen.getByText('USDT'));
    const card = screen.getByRole('button', { name: /arbitrum/i });
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalled();
  });

  it('sorts equal-rank assets, skips a token with no reachable chain and ranks unknowns last', () => {
    const onSelect = jest.fn();
    const aaa: TradeAsset = {
      code: 'AAA',
      description: 'Alpha',
      chains: [{ blockchain: Blockchain.ETHEREUM, asset: { buyable: true, sellable: true } as never }],
    };
    const zzz: TradeAsset = {
      code: 'ZZZ',
      description: 'Zed',
      chains: [
        { blockchain: Blockchain.ETHEREUM, asset: { buyable: true, sellable: true } as never },
        { blockchain: Blockchain.ARBITRUM, asset: { buyable: true, sellable: true } as never },
      ],
    };
    const sol: TradeAsset = {
      code: 'SOLONLY',
      description: 'Sol',
      chains: [{ blockchain: Blockchain.SOLANA, asset: { buyable: true, sellable: true } as never }],
    };
    render(
      <LanguageProvider>
        <AssetPicker
          open
          onClose={jest.fn()}
          titleId="asset-title"
          titleKey="chooseAsset"
          pool={[aaa, zzz, sol, btc]}
          cap="buy"
          sessionBlockchains={[Blockchain.ETHEREUM, Blockchain.ARBITRUM, Blockchain.BITCOIN]}
          onSelect={onSelect}
        />
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /ethereum/i }));
    fireEvent.click(screen.getByRole('button', { name: /AAA/ }));
    expect(onSelect).toHaveBeenCalled();
  });
});
