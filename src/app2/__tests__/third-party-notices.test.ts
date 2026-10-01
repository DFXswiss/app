import { readFileSync } from 'fs';
import { join } from 'path';

const app2Root = join(__dirname, '..');
const notices = readFileSync(join(app2Root, 'THIRD-PARTY-NOTICES.md'), 'utf8');
const hardwareProviders = readFileSync(join(app2Root, 'wallets/hardware-providers.ts'), 'utf8');
const lock = JSON.parse(readFileSync(join(app2Root, '../../package-lock.json'), 'utf8')) as {
  packages: Record<string, { version: string }>;
};

describe('App2 hardware-wallet notices', () => {
  it('documents every dynamic hardware import with its locked version', () => {
    const imports = Array.from(hardwareProviders.matchAll(/import\('([^']+)'\)/g), (match) => match[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const name of imports) {
      expect(notices).toContain(`**${name} ${lock.packages[`node_modules/${name}`].version}**`);
    }
  });

  it.each([
    ['bitbox-api', 'Apache License 2.0'],
    ['@ledgerhq/hw-transport-webhid', 'Apache License 2.0'],
    ['@ledgerhq/hw-app-eth', 'Apache License 2.0'],
    ['ledger-bitcoin', 'Apache License 2.0'],
    ['@trezor/connect-web', 'Trezor Reference Source License (T-RSL)'],
  ])('names the license for %s', (name, license) => {
    expect(notices).toContain(`**${name} ${lock.packages[`node_modules/${name}`].version}** — ${license}`);
  });

  it('discloses the dynamically imported WebAssembly core', () => {
    expect(notices.replace(/\s+/g, ' ')).toContain('including the WebAssembly core supplied by bitbox-api');
    expect(notices).not.toContain('There are no separately vendored browser bundles or WebAssembly files');
  });
});
