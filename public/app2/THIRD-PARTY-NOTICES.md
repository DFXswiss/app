# Third-party notices — DFX App 2.0 (`/app2`)

This self-contained app bundles the following third-party components. Each remains
under its own license; the DFX application code is covered by the repository `LICENSE`.

## Fonts
- **Inter** — © 2016 The Inter Project Authors. SIL Open Font License 1.1.
  Full license text: [`brand/fonts/OFL.txt`](brand/fonts/OFL.txt).

## Vendored libraries (`assets/vendor/`)
- **qrcode-generator** (`qrcode.js`) — © Kazuhiko Arase. MIT License.
- **@walletconnect/ethereum-provider** (`wc-provider.js`) — WalletConnect, Inc. Apache License 2.0.
- **@ledgerhq/hw-app-\*, hw-transport-webhid** (`ledger.js`) — Ledger SAS. Apache License 2.0.
- **bitbox-api** (`bitbox.js`, `bitbox_api_bg.wasm`) — Shift Crypto AG. Apache License 2.0.

These are the same libraries the DFX Services app already depends on via npm; the
files here are their prebuilt browser bundles, used under the identical licenses.

## Icons
- **Cryptocurrency & network icons** (`assets/tokens/`, `assets/networks/`) — web3icons (MIT),
  plus the dEURO / DEPS / nDEPS family taken from `@dfx.swiss/react-components` (DFX).
- **Wallet & brand logos** (`assets/wallets/`) — trademarks of their respective owners,
  included solely to identify supported wallets/networks.
- **Country flags** (`assets/flags/`) — flag-icons, MIT License.
