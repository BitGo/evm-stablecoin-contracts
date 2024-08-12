# GoUSD
GoUSD Token contract. Uses UUPS upgradeable proxy pattern

Roles:
- owner: deploys the proxy
- upgrader: can upgrade the contracts
- supplyController: can mint and burn tokens
- freezer: can pause/unpause contracts
- blacklister: can freeze addresses

## Installing dependencies

```
npm install
```

## Testing the contract

```
npm test
```

## Deploying the contract

add the following environment variables to your .env:
```
DEPLOYMENT_KEY=<...>
ETHERSCAN_API_KEY=<YOUR ETHERSCAN API KEY>
FREEZER_ADDRESS=<...>
SUPPLY_CONTROLLER_ADDRESS=<...>
UPGRADER_ADDRESS=<...>
ADMIN_ADDRESS=<...>
BLACKLISTER_ADDRESS=<...>
RESERVE_ADDRESSES=<...,...,...>
```
You can target any network from your Hardhat config using:

```
npx hardhat run --network <network-name> scripts/deploy.ts
```

To verify contracts

```
npx hardhat verify --network <network-name> <contract-address>
```
