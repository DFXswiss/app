import type { KeyRing } from '@dfx.swiss/wallet';
import {
  ADDRESS_GAP,
  MAX_ADDRESSES,
  bitcoinBlockchain,
  bitcoinLabel,
  discoverAccount,
  discoveryCount,
  formatBtc,
  formatSignedBtc,
  historyItems,
  needsMoreAddresses,
  nextReceiveIndex,
  parseSats,
  receiveAddress,
  receiveAddresses,
  satsFromBtc,
  sendAddresses,
} from '../components/home/wallet/passkey-bitcoin';

function ring(): KeyRing & { bitcoinAddress: jest.Mock } {
  return {
    bitcoinAddress: jest.fn((_account: number, index: number) => ({ address: `bcrt1qaddr${index}` })),
  } as unknown as KeyRing & { bitcoinAddress: jest.Mock };
}

describe('passkey bitcoin helpers', () => {
  it('maps each network to its wallet-api blockchain and label', () => {
    expect(bitcoinBlockchain('mainnet')).toBe('Bitcoin');
    expect(bitcoinBlockchain('testnet4')).toBe('BitcoinTestnet4');
    expect(bitcoinBlockchain('regtest')).toBe('BitcoinRegtest');
    expect(bitcoinLabel('mainnet')).toBe('Bitcoin');
    expect(bitcoinLabel('testnet4')).toBe('Bitcoin Testnet4');
    expect(bitcoinLabel('regtest')).toBe('Bitcoin Regtest');
  });

  it('derives receive addresses on account 0 and clamps the count to 1..50', () => {
    const keys = ring();
    expect(receiveAddress(keys, 3)).toBe('bcrt1qaddr3');
    expect(keys.bitcoinAddress).toHaveBeenLastCalledWith(0, 3);
    expect(receiveAddresses(keys, 0)).toEqual(['bcrt1qaddr0']);
    expect(receiveAddresses(keys, 2)).toEqual(['bcrt1qaddr0', 'bcrt1qaddr1']);
    expect(receiveAddresses(keys, 80)).toHaveLength(MAX_ADDRESSES);
  });

  it('finds the receive index after the highest used address', () => {
    const addresses = ['a0', 'a1', 'a2', 'a3'];
    expect(nextReceiveIndex(addresses, [])).toBe(0);
    expect(
      nextReceiveIndex(addresses, [
        { address: 'a0', used: true },
        { address: 'a1', used: false },
        { address: 'a2', used: true },
        { address: 'other', used: true },
      ]),
    ).toBe(3);
  });

  it('asks for more addresses only while the unused tail is shorter than the gap', () => {
    expect(needsMoreAddresses(ADDRESS_GAP, 0)).toBe(false);
    expect(needsMoreAddresses(ADDRESS_GAP, 1)).toBe(true);
    expect(needsMoreAddresses(MAX_ADDRESSES, MAX_ADDRESSES)).toBe(false);
    expect(discoveryCount(0)).toBe(ADDRESS_GAP);
    expect(discoveryCount(MAX_ADDRESSES)).toBe(MAX_ADDRESSES);
  });

  it('grows the request until the gap is reached and keeps a known receive index', async () => {
    const keys = ring();
    const load = jest.fn(async (addresses: string[]) => ({
      addresses: addresses.map((address, index) => ({ address, used: index < 3 })),
      id: addresses.length,
    }));
    const found = await discoverAccount(keys, 0, load);
    expect(load.mock.calls.map(([addresses]) => addresses.length)).toEqual([5, 8]);
    expect(found.receiveIndex).toBe(3);
    expect(found.addresses).toHaveLength(8);
    expect(found.account.id).toBe(8);

    const none = jest.fn(async (addresses: string[]) => ({ addresses: addresses.map((a) => ({ address: a, used: false })) }));
    const kept = await discoverAccount(keys, 2, none);
    expect(none).toHaveBeenCalledTimes(1);
    expect(kept.receiveIndex).toBe(2);
  });

  it('stops at the 50-address limit when every address is used', async () => {
    const keys = ring();
    const load = jest.fn(async (addresses: string[]) => ({ addresses: addresses.map((a) => ({ address: a, used: true })) }));
    const found = await discoverAccount(keys, 0, load);
    expect(found.receiveIndex).toBe(MAX_ADDRESSES);
    expect(found.addresses).toHaveLength(MAX_ADDRESSES);
  });

  it('offers the discovered addresses and the unused receive address as change', () => {
    const keys = ring();
    expect(sendAddresses(keys, 2)).toEqual({
      addresses: receiveAddresses(keys, 7),
      changeAddress: 'bcrt1qaddr2',
    });
    expect(sendAddresses(keys, MAX_ADDRESSES).changeAddress).toBe(`bcrt1qaddr${MAX_ADDRESSES - 1}`);
  });

  it('parses whole positive sats only', () => {
    expect(parseSats(' 1500 ')).toBe('1500');
    expect(parseSats('0')).toBeUndefined();
    expect(parseSats('1.5')).toBeUndefined();
    expect(parseSats('-1')).toBeUndefined();
    expect(parseSats('')).toBeUndefined();
  });

  it('converts and formats amounts', () => {
    expect(satsFromBtc(0.00012345)).toBe('12345');
    expect(satsFromBtc('0.123456789')).toBe('12345678');
    expect(formatBtc(12345)).toBe('0.00012345 BTC');
    expect(formatBtc('100000000')).toBe('1 BTC');
    expect(formatSignedBtc(5000)).toBe('+0.00005 BTC');
    expect(formatSignedBtc(-5000)).toBe('-0.00005 BTC');
    expect(formatSignedBtc(0)).toBe('0 BTC');
  });

  it('maps wallet-api history rows to the list layout', () => {
    const translate = (key: string) => `t:${key}`;
    const items = historyItems(
      [
        { txid: 'a', confirmed: true, time: 1764288000, netAmount: 1000, direction: 'incoming' },
        { txid: 'b', confirmed: false, time: null, netAmount: -2000, direction: 'outgoing' },
        { txid: 'c', confirmed: true, netAmount: -100, direction: 'self' },
      ],
      translate,
      'en-US',
    );
    expect(items[0]).toEqual({
      type: 'receive',
      title: 't:Received Bitcoin',
      date: new Date(1764288000 * 1000).toLocaleDateString('en-US'),
      amount: '+0.00001 BTC',
      direction: 'in',
      fiatValue: '',
      pending: false,
      pendingLabel: 'Unconfirmed',
    });
    expect(items[1]).toMatchObject({
      type: 'send',
      title: 't:Sent Bitcoin',
      date: 't:Unconfirmed',
      direction: 'out',
      pending: true,
    });
    expect(items[2]).toMatchObject({ type: 'send', title: 't:Sent to yourself', date: 't:Unconfirmed' });
  });
});
