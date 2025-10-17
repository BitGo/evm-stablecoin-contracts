# Deployment & Upgrade Scripts

This directory contains scripts for deploying and upgrading stablecoin tokens without code duplication.

## Generic Scripts (Recommended)

### 1. Deploy Any Token - `deploy-token.ts`

Deploy any stablecoin by specifying the token name:

```bash
# Deploy GoUSD
TOKEN_NAME=GoUSD \
ADMIN_ADDRESS=0x... \
DEFAULT_ADMIN_DELAY=172800 \
FREEZER_ADDRESS=0x... \
SUPPLY_CONTROLLER_ADDRESS=0x... \
UPGRADER_ADDRESS=0x... \
BLACKLISTER_ADDRESS=0x... \
RESCUER_ADDRESS=0x... \
npx hardhat run scripts/deploy-token.ts --network mainnet
```

### 2. Upgrade Any Token - `upgrade-token.ts`

Upgrade any stablecoin by specifying the token name and proxy address:

```bash
# Upgrade GoUSD
TOKEN_NAME=GoUSD PROXY_ADDRESS=0x... npx hardhat run scripts/upgrade-token.ts --network mainnet
```

## Environment Variables Reference

### Required for Deployment

| Variable | Description | Example |
|----------|-------------|---------|
| `TOKEN_NAME` | Token to deploy | `GoUSD`, `GoEUR`, `GoGBP` |
| `ADMIN_ADDRESS` | Default admin address | `0x1234...` |
| `DEFAULT_ADMIN_DELAY` | Admin change delay (seconds) | `172800` (2 days) |
| `FREEZER_ADDRESS` | Freeze/unfreeze role | `0x5678...` |
| `SUPPLY_CONTROLLER_ADDRESS` | Mint/burn role | `0x9abc...` |
| `UPGRADER_ADDRESS` | Upgrade role | `0xdef0...` |
| `BLACKLISTER_ADDRESS` | Blacklist role | `0x1357...` |
| `RESCUER_ADDRESS` | Token rescue role | `0x2468...` |

### Required for Upgrade

| Variable | Description | Example |
|----------|-------------|---------|
| `TOKEN_NAME` | Token to upgrade | `GoUSD`, `GoEUR`, `GoGBP` |
| `PROXY_ADDRESS` | Proxy contract address | `0x1234...` |


## Adding a New Token

When you add a new token (e.g., `GoJPY`):

1. **Set the required environment variables**
2. **Deploy using generic script:**
   ```bash
   TOKEN_NAME=GoJPY \
   TOKEN_SYMBOL=GoJPY \
   TOKEN_DECIMALS=6 \
   DEFAULT_MINT_CAP=1000000000000 \
   ADMIN_ADDRESS=0x... \
   ... \
   npx hardhat run scripts/deploy-token.ts --network mainnet
   ```

**No need to create new deployment scripts!** The generic scripts handle all tokens.

## Best Practices

### Deployment
1. Always test on testnet first
2. Verify all environment variables before deploying
3. Keep track of deployed proxy addresses
4. Verify contracts on block explorers

### Upgrades
1. Test upgrades on testnet first
2. Use `npx hardhat validate-upgrade` to check storage compatibility
3. For production, consider staged rollouts:
   - Upgrade one token first (e.g., GoUSD)
   - Monitor for 24-48 hours
   - If successful, upgrade remaining tokens
4. Always keep backup of proxy addresses

## Troubleshooting

### "Missing required environment variables"
- Ensure all required environment variables are set
- Check that TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS, and DEFAULT_MINT_CAP are all defined

### "Stack too deep" compilation error
- This is already fixed in `hardhat.config.ts` with `viaIR: true`
- If you still encounter it, increase optimizer runs

### Upgrade validation fails
- Check storage layout compatibility
- Ensure you're not reordering or removing storage variables
- Review the upgrade guide in `STABLECOINS.md
