# CLAUDE.md

This file provides guidance for Claude Code when working with this repository.

## Project Overview

GoUSD is a generic, upgradeable ERC-20 stablecoin smart contract built by BitGo. A single Solidity contract (`Stablecoin.sol`) is deployed multiple times to support different currencies (GoUSD, GoEUR, GoGBP, etc.). The contract uses the UUPS upgradeable proxy pattern with OpenZeppelin v5.

## Common Commands

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run a specific test file
npx hardhat test test/supply.ts

# Compile contracts
npx hardhat compile

# Lint (ESLint + Solhint via hardhat check)
npm run lint

# Format Solidity files
npm run format
```

## Architecture

### Contracts

- **`contracts/Stablecoin.sol`** — Main ERC-20 stablecoin with UUPS upgrade pattern, role-based access control, pausability, blacklisting, rate-limited minting/burning, and supply validator integration.
- **`contracts/Blacklistable.sol`** — Blacklist logic using bit-packing (bit 255 of balance) so blacklist state is transparent to balance reads.
- **`contracts/ISupplyValidator.sol`** — Interface for an optional external supply validator that can approve/reject mint and burn operations.
- **`contracts/MockSupplyValidator.sol`** — Test-only mock for `ISupplyValidator`.

### Roles

The contract uses six access control roles:
- `DEFAULT_ADMIN` — Manages role assignments (with configurable delay)
- `FREEZER` — Pause/unpause the contract
- `SUPPLY_CONTROLLER` — Mint and burn tokens
- `UPGRADER` — Upgrade the proxy implementation
- `BLACKLISTER` — Blacklist/unblacklist accounts
- `RESCUER` — Rescue mistakenly sent tokens

### Scripts

- **`scripts/deploy-token.ts`** — Deploys a new token via UUPS proxy; reads config from environment variables.
- **`scripts/upgrade-token.ts`** — Upgrades an existing proxy to a new implementation.

## Tests

Tests are in TypeScript using Hardhat + Chai + Mocha. There are 44 tests across 6 files:

| File | Coverage |
|------|----------|
| `test/initialize.ts` | Contract initialization and zero-address validation |
| `test/blacklist.ts` | Blacklist/unblacklist operations |
| `test/pause.ts` | Pause/unpause functionality |
| `test/supply.ts` | Minting, burning, and token rescue |
| `test/rate-limiting.ts` | Rate limiting for mint/burn |
| `test/supply-validator.ts` | Supply validator integration |

## Deployment Environment Variables

Required when running deploy/upgrade scripts:

```bash
# Token identity
TOKEN_NAME=GoUSD
TOKEN_SYMBOL=GoUSD
TOKEN_DECIMALS=6
DEFAULT_MINT_CAP=1000000000000   # in smallest unit

# Role addresses
ADMIN_ADDRESS=0x...
DEFAULT_ADMIN_DELAY=172800        # seconds (e.g., 2 days)
FREEZER_ADDRESS=0x...
SUPPLY_CONTROLLER_ADDRESS=0x...
UPGRADER_ADDRESS=0x...
BLACKLISTER_ADDRESS=0x...
RESCUER_ADDRESS=0x...

# Network / credentials
DEPLOYMENT_KEY=0x...              # private key for deployer wallet
INFURA_API_KEY=...
ETHERSCAN_API_KEY=...

# For upgrades only
PROXY_ADDRESS=0x...
```

## Supported Networks

`mainnet`, `sepolia`, `holesky`, `hoodi`

Run a script against a network with:
```bash
npx hardhat run scripts/deploy-token.ts --network sepolia
```

## Key Technical Details

- **Solidity**: `^0.8.30` with optimizer (200 runs) and `viaIR: true`
- **Node.js**: requires `>=20.0.0`
- **Proxy pattern**: UUPS (ERC-1967) — upgrade logic lives in the implementation
- **Bit-packing**: Blacklist state occupies bit 255 of the internal balance, keeping token balances readable without masking in normal flows
- **Rate limiting**: Mint/burn caps replenish on a 1-day cycle per supply controller

## CI

| Workflow | Trigger | Action |
|----------|---------|--------|
| `ci.yml` | Push/PR to master | `npm test` + `npm run lint` |
| `codeql.yaml` | Push/PR to master + weekly | CodeQL security scan |
| `prevent-lockfile-modifications.yaml` | PR | Blocks `package-lock.json` changes |

## Documentation

- **`README.md`** — Quick-start guide, deployment walkthrough
- **`STABLECOINS.md`** — Full architecture reference, upgrade process, storage compatibility rules, troubleshooting
- **`scripts/README.md`** — Deployment/upgrade script reference
