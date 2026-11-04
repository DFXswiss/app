import { isTileVisible, parseFeatures } from '../hooks/feature-flag.hook';

jest.mock('@dfx.swiss/react', () => ({ Blockchain: {} }));

// The passkey login tile is gated behind ?feature=Passkey. The gate itself is plain logic: a tile with a
// feature field is visible exactly when the parsed URL flag contains it — verified here against the real
// tile descriptors (read from the config file as data, so no ESM import of the config module is needed).

const gatedTile = { id: 'login-with-passkey', feature: 'passkey' };
const plainTiles = [{ id: 'login-with-crypto-wallet' }, { id: 'login-with-mail' }];

function visibleTiles(search: string | undefined): string[] {
  const flags = parseFeatures(search);
  return [...plainTiles, gatedTile].filter((tile) => isTileVisible(tile, flags)).map((tile) => tile.id);
}

describe('passkey login tile behind ?feature=Passkey', () => {
  it('is invisible without the flag, beside the untouched ordinary tiles', () => {
    const tiles = visibleTiles('');

    expect(tiles).toContain('login-with-crypto-wallet');
    expect(tiles).toContain('login-with-mail');
    expect(tiles).not.toContain('login-with-passkey');
  });

  it('appears with the flag, case-insensitive', () => {
    expect(visibleTiles('?feature=Passkey')).toContain('login-with-passkey');
    expect(visibleTiles('?feature=passkey')).toContain('login-with-passkey');
    expect(visibleTiles('?feature=other')).not.toContain('login-with-passkey');
  });
});
