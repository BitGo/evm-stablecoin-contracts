# Stablecoin EVM

Generic stablecoin smart contract system using the UUPS upgradeable proxy pattern. Deploy multiple stablecoins (GoUSD, GoEUR, GoGBP, etc.) from a single reusable contract.

## Architecture

The codebase uses a **generic Stablecoin contract** that can be deployed multiple times with different initialization parameters to create different tokens. No need for separate contract files for each currency.

**Key Benefits:**
- Single contract for all stablecoins
- Consistent behavior across all tokens
- Easy deployment of new currencies
- Simplified maintenance and upgrades

## Roles

- **owner**: deploys the proxy
- **upgrader**: can upgrade the contracts (UPGRADER_ROLE)
- **supplyController**: can mint and burn tokens (SUPPLY_CONTROLLER_ROLE)
- **freezer**: can pause/unpause contracts (FREEZER_ROLE)
- **blacklister**: can blacklist addresses (BLACKLISTER_ROLE)
- **rescuer**: can rescue stuck tokens from the contract (RESCUER_ROLE)

## Prerequisites

- Node.js >= 20.0.0
- npm

## Installing Dependencies

```bash
npm install
```

## Testing

```bash
npm test
```

## Linting

```bash
npm run lint
```

## Deploying a Stablecoin

### Environment Variables

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Then edit `.env` with your configuration:

```bash
# Deployment Configuration
DEPLOYMENT_KEY=0x<your-private-key>
ETHERSCAN_API_KEY=<your-etherscan-api-key>
INFURA_API_KEY=<your-infura-api-key>

# Token Configuration
TOKEN_NAME=GoUSD                    # e.g., "GoUSD", "GoEUR", "GoGBP"
TOKEN_SYMBOL=GoUSD                  # e.g., "GoUSD", "GoEUR", "GoGBP"
TOKEN_DECIMALS=6                    # typically 6
DEFAULT_MINT_CAP=1000000000000      # e.g., 1M tokens with 6 decimals

# Role Addresses
ADMIN_ADDRESS=<admin-wallet-address>
DEFAULT_ADMIN_DELAY=172800          # 2 days in seconds
FREEZER_ADDRESS=<freezer-wallet-address>
SUPPLY_CONTROLLER_ADDRESS=<supply-controller-wallet-address>
UPGRADER_ADDRESS=<upgrader-wallet-address>
BLACKLISTER_ADDRESS=<blacklister-wallet-address>
RESCUER_ADDRESS=<rescuer-wallet-address>
```

### Deploy Command

Deploy to any network configured in `hardhat.config.ts`:

```bash
npx hardhat run scripts/deploy-token.ts --network <network-name>
```

**Examples:**

```bash
# Deploy to mainnet
TOKEN_NAME=GoUSD TOKEN_SYMBOL=GoUSD TOKEN_DECIMALS=6 DEFAULT_MINT_CAP=1000000000000 \
npx hardhat run scripts/deploy-token.ts --network mainnet

# Deploy to testnet
TOKEN_NAME=GoUSD TOKEN_SYMBOL=GoUSD TOKEN_DECIMALS=6 DEFAULT_MINT_CAP=1000000000000 \
npx hardhat run scripts/deploy-token.ts --network sepolia
```

### Verify Contracts

After deployment, verify the implementation contract on Etherscan:

```bash
npx hardhat verify --network <network-name> <implementation-address>
```

## Documentation

For detailed information about deploying multiple stablecoins and the upgrade process, see [STABLECOINS.md](./STABLECOINS.md).

## Security

For information about reporting security vulnerabilities, see [SECURITY.md](./SECURITY.md).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.

## License

Copyright (c) 2025 BitGo, Inc. All rights reserved.

Licensed under the [Apache License 2.0](./LICENSE).
