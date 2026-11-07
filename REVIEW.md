# Review

Read [CONTRIBUTING.md](CONTRIBUTING.md) first. The check below rejects the pull
request. The other guidelines in that file stay in force.

## Where the logic lives

Wallet logic belongs in DFXswiss/wallet-api, as defined under
[Where the logic lives](CONTRIBUTING.md#where-the-logic-lives). Reject a pull request that prepares Bitcoin or EVM
balances, prices, fees, input selection, destination checks, history, or an unsigned payment in this repository, or
that submits that payment from here. Reject a pull request that moves the seed or the private key off the device.
Spark steps that need the seed or `WALLET_BREEZ_API_KEY` stay on the device. Buy, sell, swap, KYC, and banking stay
on the DFX API. This rule does not move that work.
