# Third-party notices — DFX App 2.0 (`/app2`)

This React build uses the repository's npm dependency graph. Each dependency remains
under its own license; DFX application code is covered by the repository `LICENSE`.

## Fonts

- **Inter** — © 2016 The Inter Project Authors. SIL Open Font License 1.1.
  Full license text: [`licenses/Inter-OFL.txt`](licenses/Inter-OFL.txt).

## Runtime libraries

- **React / React DOM / React Router** — MIT License.
- **@dfx.swiss/react** — DFX shared hooks and definitions.
- **@walletconnect/ethereum-provider** — WalletConnect, Inc. Apache License 2.0.
- **ethers** — MIT License.
- **react-qr-code** — MIT License.
- **bitbox-api 0.2.1** — Apache License 2.0; includes a WebAssembly core.
- **@ledgerhq/hw-transport-webhid 6.30.0** — Apache License 2.0.
- **@ledgerhq/hw-app-eth 6.47.1** — Apache License 2.0.
- **ledger-bitcoin 0.2.3** — Apache License 2.0.
- **@trezor/connect-web 9.6.4** — Trezor Reference Source License (T-RSL).

App 2.0 dynamically imports these hardware-wallet libraries from the npm dependency
graph, including the WebAssembly core supplied by bitbox-api. Trezor Connect also
uses its hosted popup/iframe at `connect.trezor.io`.

The repository also includes **@ledgerhq/hw-app-btc 6.27.1** (Apache License 2.0);
App 2.0's hardware provider uses ledger-bitcoin for Bitcoin.

## Icons

- **Wallet & brand logos** (`assets/wallets/`) — trademarks of their respective owners,
  included solely to identify supported wallets/networks.
- **DFX mark** (`assets/brand/dfx-mark.svg`) — DFX Services AG, taken from the app's own
  `assets/brand/logo-dark.svg` artwork.
- **Open CryptoPay mark** (`components/brand.tsx` › `OcpMark`) — Open CryptoPay Association
  logo, used per its brand guidelines to identify the OpenCryptoPay merchant suite.
- **Country flags** (`assets/flags/`) — [circle-flags](https://github.com/HatScripts/circle-flags)
  by HatScripts, MIT License. Full license text:
  [`licenses/circle-flags-MIT.txt`](licenses/circle-flags-MIT.txt).
- **Token/network/wallet glyphs** (`assets/networks/`, `assets/tokens/`, `assets/wallets/` —
  every SVG carrying `class="web3icons"`) — [web3icons](https://github.com/0xa3k5/web3icons) by
  0xa3k5, MIT License. Full license text:
  [`licenses/web3icons-MIT.txt`](licenses/web3icons-MIT.txt).
