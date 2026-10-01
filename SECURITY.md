# Security Policy

## Reporting a vulnerability

Please do not report security problems through a public GitHub issue or pull request.

**Vulnerability reports** go to the DFX bug bounty programme, run by Compass Security:

<https://bugbounty.compass-security.com/bug-bounties/dfx-bug-bounty>

That page carries the scope, the rules of engagement and the reward range, and it is where the
report is triaged.

**Security incidents affecting your own account** — a suspected compromise, an unexpected
transaction, a phishing attempt — go to DFX support instead. They need the account context to act,
which a bug bounty report deliberately does not carry:

<https://services.dfx.swiss/support>

Preferred languages: English, German.

The authoritative contact list is published as
[security.txt](https://dfx.swiss/.well-known/security.txt). If this file and that one ever
disagree, `security.txt` is the one to follow.

## Scope

This repository holds the DFX web front end: the main application, the embeddable widget and the
App 2.0 target under `/app2/`. API-side issues belong to the backend repository, but you do not
need to know the boundary — report it through the bug bounty programme and it gets routed.

## Accepted by design

Two properties of this front end look like findings and are not. Both are deliberate decisions,
and reporting them costs your time and ours:

- **DFX can be embedded into external pages.** This is allowed on purpose to support
  decentralisation and cross-domain integration, in full awareness of the risks that come with it,
  clickjacking among them. Users are responsible for verifying transaction data, particularly on
  integrations that are not open source. The same note is in `security.txt`.
- **The visual regression tests do not run in CI.** They are a local review aid, not a gate; see
  `CONTRIBUTING.md`.

What is in scope, unchanged: anything that lets a third party read or move funds, alter payment
details shown to a user, bypass authentication, or escalate privileges.
