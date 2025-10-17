# Stablecoin Contract

Generic stablecoin contract using UUPS upgradeable proxy pattern. Deploy multiple stablecoins (GoUSD, GoEUR, GoGBP, etc.) using a single reusable contract.

## Architecture

The codebase uses a **generic Stablecoin contract** that can be deployed multiple times with different initialization parameters to create different tokens. No need for separate contract files for each currency.

**Key Benefits:**
- ✅ Single contract for all stablecoins
- ✅ Consistent behavior across all tokens
- ✅ Easy deployment of new currencies
- ✅ Simplified maintenance and upgrades

## Roles

- **owner**: deploys the proxy
- **upgrader**: can upgrade the contracts
- **supplyController**: can mint and burn tokens
- **freezer**: can pause/unpause contracts
- **blacklister**: can freeze addresses
- **rescuer**: can rescue stuck tokens from the contract

## Installing Dependencies

```bash
npm install
```

## Testing the Contract

```bash
npm test
```

## Deploying a Stablecoin

### Environment Variables

Add the following environment variables to your `.env`:

```bash
# Deployment Configuration
DEPLOYMENT_KEY=<your-private-key>
ETHERSCAN_API_KEY=<your-etherscan-api-key>
ALCHEMY_API_KEY=<your-alchemy-api-key>

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

# Proof of Reserve Feed
PROOF_FEED_ADDRESS=<chainlink-por-feed-address>
```

### Deploy Command

Deploy to any network from your Hardhat config:

```bash
npx hardhat run scripts/deploy-token.ts --network <network-name>
```

**Examples:**

```bash
# Deploy GoUSD to mainnet
TOKEN_NAME=GoUSD TOKEN_SYMBOL=GoUSD TOKEN_DECIMALS=6 DEFAULT_MINT_CAP=1000000000000 \
npx hardhat run scripts/deploy-token.ts --network mainnet

# Deploy GoEUR to mainnet
TOKEN_NAME=GoEUR TOKEN_SYMBOL=GoEUR TOKEN_DECIMALS=6 DEFAULT_MINT_CAP=1000000000000 \
npx hardhat run scripts/deploy-token.ts --network mainnet

# Deploy GoGBP to testnet
TOKEN_NAME=GoGBP TOKEN_SYMBOL=GoGBP TOKEN_DECIMALS=6 DEFAULT_MINT_CAP=1000000000000 \
npx hardhat run scripts/deploy-token.ts --network sepolia
```

### Verify Contracts

After deployment, verify the implementation contract on Etherscan:

```bash
npx hardhat verify --network <network-name> <implementation-address>
```

## Documentation

For detailed information about deploying multiple stablecoins, see [STABLECOINS.md](./STABLECOINS.md).

## License

Apache-2.0
