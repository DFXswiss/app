# Changelog

All notable changes to this repository are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This file starts with
the entries below; everything before it is recorded in the commit history and in the pull requests
it references, and is not reconstructed here — a rewritten history would read as fact without
being one.

## [Unreleased]

### Added

- **DFX App 2.0** as a fourth build target, served at `/app2/`. It is built from the same source
  tree on `@dfx.swiss/react` and ships with the main application: buy, sell and swap, account,
  transactions, KYC, limit requests, support and the OpenCryptoPay merchant views, with wallet,
  hardware-wallet and e-mail sign-in.
- A `SECURITY.md` policy pointing at the bug bounty programme and at support, matching
  `security.txt`.

### Changed

- The App 2.0 build and its staging step moved out of the workflow files into the build chain:
  `npm run build` and `npm run build:dev` now produce `build/app2/` alongside `build/`, so one
  deploy ships both.

### Testing

- Playwright covers App 2.0 on both sides of the 460px layout split — as a framed card on the
  desktop and full-bleed on a phone — for every screen it pictures, logged out and behind a wallet.

[unreleased]: https://github.com/DFXswiss/app/compare/main...develop
