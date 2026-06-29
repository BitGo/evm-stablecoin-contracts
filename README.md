# Stablecoin EVM Contracts

A generic, EVM-compatible stablecoin smart contract system using the UUPS upgradeable proxy pattern. A single reusable contract can be deployed multiple times with different initialization parameters to create independent stablecoins.

## Architecture

The codebase uses a **generic Stablecoin contract** that can be deployed multiple times with different initialization parameters to create different tokens. No need for separate contract files for each currency.

**Key Benefits:**
- Single contract for all stablecoins
- Consistent behavior across all tokens
- Easy deployment of new currencies
- Simplified maintenance and upgrades

## Roles

The contract uses OpenZeppelin `AccessControlDefaultAdminRules` with the following roles:

- **DEFAULT_ADMIN_ROLE**: set via `AccessControlDefaultAdminRules`; governs admin transfers
- **MASTER_MINTER_ROLE**: manages minters and bridge minters — adds, removes, and replenishes their limits
- **MINTER**: mints and burns tokens for native operations (granted by master minter)
- **BRIDGE_MINTER**: mints and burns tokens for cross-chain bridge operations (granted by master minter)
- **UPGRADER_ROLE**: can upgrade the contract implementation
- **FREEZER_ROLE**: can pause/unpause all token transfers
- **BLACKLISTER_ROLE**: can blacklist addresses from transacting
- **RESCUER_ROLE**: can rescue ERC-20 tokens accidentally sent to the contract

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
TOKEN_NAME=MyStablecoin             # full token name
TOKEN_SYMBOL=MYUSD                  # token ticker symbol
TOKEN_DECIMALS=6                    # typically 6
DEFAULT_MINT_CAP=1000000000000      # e.g., 1M tokens with 6 decimals

# Role Addresses
ADMIN_ADDRESS=<admin-wallet-address>
DEFAULT_ADMIN_DELAY=172800          # 2 days in seconds
FREEZER_ADDRESS=<freezer-wallet-address>
MASTER_MINTER_ADDRESS=<master-minter-wallet-address>
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
TOKEN_NAME=MyStablecoin TOKEN_SYMBOL=MYUSD TOKEN_DECIMALS=6 DEFAULT_MINT_CAP=1000000000000 \
npx hardhat run scripts/deploy-token.ts --network mainnet

# Deploy to testnet
TOKEN_NAME=MyStablecoin TOKEN_SYMBOL=MYUSD TOKEN_DECIMALS=6 DEFAULT_MINT_CAP=1000000000000 \
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

Copyright (c) 2026 BitGo, Inc. All rights reserved.

Licensed under the [Apache License 2.0](./LICENSE.md).
