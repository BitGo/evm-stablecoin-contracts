# Governance

This document describes the governance model for the `evm-stablecoin-contracts` project: the
roles participants can hold, how decisions are made, and how the community
participates.

## Overview

`evm-stablecoin-contracts` is an open source project maintained by BitGo. BitGo retains
final decision-making authority over the project's direction, releases, and
acceptance of contributions. The project follows a **maintainer (BDFL-style)
governance model** with a designated set of maintainers from BitGo's Stablecoins
team.

## Roles

### Users
Anyone who uses the software. Users are encouraged to participate by reporting
bugs, requesting features, and joining discussions via GitHub Issues.

### Contributors
Anyone who contributes code, documentation, tests, or reviews. Contributions are
made via pull requests and are subject to the process in
[CONTRIBUTING.md](./CONTRIBUTING.md), including the Developer Certificate of
Origin sign-off described in [DCO.md](./DCO.md). Contributors do not need any
special permissions beyond a GitHub account and a signed-off commit.

### Maintainers
Maintainers are BitGo employees on the Stablecoins team (see
[CODEOWNERS](./CODEOWNERS)). Maintainers are responsible for:

- Reviewing, approving, and merging pull requests
- Triaging issues and setting the project roadmap
- Cutting and publishing releases
- Enforcing the contribution process and community guidelines
- Coordinating security disclosures (see [SECURITY.md](./SECURITY.md))

The current maintainer group is `@BitGo/stablecoins`.

### Project Owner
BitGo, Inc. is the project owner and copyright holder. BitGo holds final
authority over licensing, trademark, the maintainer roster, and any decision to
archive, transfer, or wind down the project.

## Decision Making

- **Routine changes** (bug fixes, tests, documentation, dependency bumps) are
  decided by maintainer review — at least one maintainer approval and passing CI
  are required to merge.
- **Significant changes** (public API/interface changes, new roles, storage
  layout changes affecting upgradeability, changes to security-sensitive logic)
  require review and approval by at least two maintainers.
- **Disagreements** are resolved by discussion among maintainers. If consensus
  cannot be reached, the BitGo Stablecoins team lead makes the final decision.

## Contribution Acceptance

All external contributions require:

1. A signed-off commit per the Developer Certificate of Origin (see
   [DCO.md](./DCO.md)).
2. Passing CI (unit tests and linting).
3. Approval from at least one maintainer (two for significant changes).

Maintainers may decline contributions that fall outside the project's scope,
introduce unacceptable risk, or conflict with BitGo's roadmap.

## Security

Security vulnerabilities must be reported privately per [SECURITY.md](./SECURITY.md).
Security fixes are coordinated by maintainers under a responsible disclosure
process and may be developed privately before public release.

## Releases

Maintainers cut releases following [Semantic Versioning](https://semver.org/) and
document every published version in [CHANGELOG.md](./CHANGELOG.md).

## Changes to Governance

This governance model is maintained by BitGo. Changes are proposed via pull
request and require approval from the BitGo Stablecoins team lead.

## Contact

For questions about governance or the project, open a GitHub Issue. For security
matters, email security@bitgo.com.
