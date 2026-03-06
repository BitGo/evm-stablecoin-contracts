# GoUSD - Claude Code Configuration

## Project Overview

GoUSD is a generic stablecoin smart contract system using the UUPS upgradeable proxy pattern. A single reusable Stablecoin contract can be deployed multiple times with different initialization parameters to create different tokens (GoUSD, GoEUR, GoGBP, etc.).

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
scripts/             # Deployment scripts
test/                # Hardhat test files (TypeScript)
```

## Contract Roles

The Stablecoin contract uses role-based access control:
- **owner**: Deploys the proxy
- **upgrader**: Can upgrade contracts (UPGRADER_ROLE)
- **supplyController**: Can mint and burn tokens (SUPPLY_CONTROLLER_ROLE)
- **freezer**: Can pause/unpause contracts (FREEZER_ROLE)
- **blacklister**: Can freeze addresses (BLACKLISTER_ROLE)
- **rescuer**: Can rescue stuck tokens (RESCUER_ROLE)

## Code Conventions

- Solidity contracts use OpenZeppelin upgradeable patterns
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

Pull requests trigger:
1. Unit tests (`npm test`)
2. Linting (`npm run lint`)

## Security

- Security contact: security@bitgo.com
- Contracts implement rate-limited minting/burning
- Blacklist functionality for compliance
- Pausable for emergency stops
