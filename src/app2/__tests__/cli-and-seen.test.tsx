import { isPlausibleCliAddress } from '../wallets/cli';
import { forgetWallet, rememberWallet, seenWallets } from '../wallets/seen';
import { OcpMark } from '../components/brand';
import { render } from '@testing-library/react';

describe('cli and seen wallets', () => {
  it('accepts a plausible pasted address', () => {
    expect(isPlausibleCliAddress('too-short')).toBe(false);
    expect(isPlausibleCliAddress('addr1234567')).toBe(true);
  });

  it('remembers and forgets wallets by address', () => {
    window.localStorage.removeItem('dfx_app2_wallets');
    rememberWallet({ address: '' });
    expect(seenWallets()).toEqual([]);
    rememberWallet({ address: '0xAAA', walletId: 'MetaMask' });
    rememberWallet({ address: '0xaaa', walletId: 'Rabby' });
    expect(seenWallets()).toHaveLength(1);
    forgetWallet('0xAAA');
    expect(seenWallets()).toEqual([]);
  });

  it('treats a broken or non-array store as empty and swallows a write failure', () => {
    window.localStorage.setItem('dfx_app2_wallets', '{');
    expect(seenWallets()).toEqual([]);
    window.localStorage.setItem('dfx_app2_wallets', '{"address":"0x1"}');
    expect(seenWallets()).toEqual([]);
    window.localStorage.setItem('dfx_app2_wallets', '[{"walletId":"x"}]');
    expect(seenWallets()).toEqual([]);

    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => rememberWallet({ address: '0xBBB' })).not.toThrow();
    setItem.mockRestore();
  });

  it('renders the OpenCryptoPay mark', () => {
    const { container } = render(<OcpMark className="mark" />);
    expect(container.querySelector('svg')).toHaveAttribute('class', 'mark');
  });
});
