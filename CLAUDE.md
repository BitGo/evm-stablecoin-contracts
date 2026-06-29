# Stablecoin EVM - Claude Code Configuration

## Project Overview

Stablecoin EVM is a generic stablecoin smart contract system using the UUPS upgradeable proxy pattern. A single reusable `Stablecoin` contract can be deployed multiple times with different initialization parameters (name, symbol, decimals, mint cap, role addresses) to create independent tokens — for example, USD-, EUR-, or GBP-pegged stablecoins.

## Tech Stack

- **Smart Contracts**: Solidity 0.8.30
- **Framework**: Hardhat
- **Language**: TypeScript
- **Dependencies**: OpenZeppelin Contracts v5 (upgradeable)
- **Node.js**: >= 20.0.0

## Commands

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run linting (ESLint + Solhint)
npm run lint

# Format Solidity files
npm run format
```

## Project Structure

```
contracts/           # Solidity smart contracts
  Stablecoin.sol     # Main stablecoin contract (ERC20, pausable, blacklistable)
  Blacklistable.sol  # Blacklist functionality mixin
  ISupplyValidator.sol  # Supply validation interface
  MockSupplyValidator.sol  # Mock for testing
scripts/             # Deployment and upgrade scripts
test/                # Hardhat test files (TypeScript)
```

## Contract Roles

The Stablecoin contract uses OpenZeppelin `AccessControlDefaultAdminRules`:
- **DEFAULT_ADMIN_ROLE**: governs admin transfers (set via `AccessControlDefaultAdminRules`)
- **MASTER_MINTER_ROLE**: manages minters and bridge minters (add/remove/replenish)
- **MINTER**: mints and burns tokens for native operations (granted by master minter)
- **BRIDGE_MINTER**: mints and burns tokens for cross-chain bridge operations (granted by master minter)
- **UPGRADER_ROLE**: can upgrade the contract implementation
- **FREEZER_ROLE**: can pause/unpause all token transfers
- **BLACKLISTER_ROLE**: can blacklist addresses from transacting
- **RESCUER_ROLE**: can rescue ERC-20 tokens stuck in the contract

## Code Conventions

- Solidity contracts use OpenZeppelin upgradeable patterns
- Maintain storage layout compatibility for upgradeable contracts (see [STABLECOINS.md](./STABLECOINS.md))
- All source files carry a `Copyright (c) 2026 BitGo, Inc. All rights reserved.` header and `SPDX-License-Identifier: Apache-2.0`
- Tests are written in TypeScript using Hardhat's testing framework
- Use `npx hardhat test` for running specific test files
- Contract verification uses Etherscan API

## Networks

Configured networks in `hardhat.config.ts`:
- `hardhat` (local)
- `mainnet` (Ethereum mainnet)
- `sepolia` (testnet)
- `holesky` (testnet)
- `hoodi` (testnet)

## CI/CD

Pull requests against `master` trigger:
1. Unit tests (`npm test`)
2. Linting (`npm run lint`)

## Security

- Security contact: security@bitgo.com (see [SECURITY.md](./SECURITY.md))
- Contracts implement rate-limited minting/burning
- Blacklist functionality for compliance
- Pausable for emergency stops
