# Test reality

What the tests in this repository replace with a stand-in, and what a green run therefore does not
prove. The five fields are those required by `DFXswiss/api` `docs/test-architecture.md` under
_Reality declaration_. This file is not a repository-wide inventory: it collects the fakes declared
by the pull requests that have been through that rule.

## Payment-link quote on the full-stack device split

The loc API cannot build a Lightning/BTC transfer amount (`404 No BTC transfer amount found`), so
the payer never reaches the quoted state in which the desktop QR / handheld wallet-copy split
renders. The two device-split tests in `e2e-stack/specs/payment-links.spec.ts` therefore replace
that one response.

| Field          | Content                                                                                                                                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Component      | `GET /v1/paymentLink/payment` (and the wait poll it starts) as seen by the `/pl` payer screen                                                                                                                                    |
| Status         | fake                                                                                                                                                                                                                             |
| Mechanism      | `e2e-stack/specs/payment-links.spec.ts` — `installQuotedPayRequest` fulfills `paymentLink/payment` with a quoted OpenCryptoPay payload (`displayQr: false`) and holds `lnurlp/wait` / `paymentLink/payment/wait` open            |
| Instead of     | `PaymentLinkService.createPayRequest` building a quote from live transfer amounts                                                                                                                                                |
| Does NOT prove | that the loc API can produce a quote, or that a real quote's transfer amounts, expiry or callback match what the payer screen then renders — only that the screen splits desktop QR vs handheld wallet copy for a quoted payload |
