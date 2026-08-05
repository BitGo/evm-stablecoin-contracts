# Deployment & Upgrade Scripts

This directory contains scripts for deploying and upgrading stablecoin tokens without code duplication.

## Generic Scripts (Recommended)

### 1. Deploy Any Token - `deploy-token.ts`

Deploy any stablecoin by specifying the token name:

```bash
# Deploy a stablecoin
TOKEN_NAME=MyStablecoin \
TOKEN_SYMBOL=MYUSD \
TOKEN_DECIMALS=6 \
DEFAULT_MINT_CAP=1000000000000 \
ADMIN_ADDRESS=0x... \
DEFAULT_ADMIN_DELAY=172800 \
FREEZER_ADDRESS=0x... \
MASTER_MINTER_ADDRESS=0x... \
UPGRADER_ADDRESS=0x... \
BLACKLISTER_ADDRESS=0x... \
RESCUER_ADDRESS=0x... \
npx hardhat run scripts/deploy-token.ts --network mainnet
```

### 1b. Reproduce an Existing Address on a New Chain - `deploy-deterministic.ts`

Use this instead of `deploy-token.ts` when the token is already deployed on another
chain and the new deployment must land at the **same address**. Address parity relies
on CREATE semantics: same deployer EOA + same nonces (implementation at nonce N,
proxy at nonce N+1). The script refuses to broadcast unless every precondition holds,
and never hardcodes a gas limit (so reverting transactions fail off-chain during gas
estimation instead of burning a nonce on-chain).

Takes all `deploy-token.ts` variables plus:

| Variable | Description |
|----------|-------------|
| `EXPECTED_CHAIN_ID` | Chain id the RPC must report (e.g. `137`, `143`) |
| `EXPECTED_DEPLOYER_ADDRESS` | Deployer EOA used on the reference chain |
| `EXPECTED_PROXY_ADDRESS` | Token (proxy) address to reproduce |
| `EXPECTED_IMPLEMENTATION_ADDRESS` | (Optional) implementation address to reproduce |
| `REFERENCE_RPC_URL` | (Optional) RPC of the chain where the token already exists; preflight verifies name/symbol/decimals AND runtime bytecode against the live token and aborts on mismatch. Unset: mainnet targets default to Ethereum mainnet (needs `INFURA_API_KEY`), testnet targets to Hoodi |
| `ALLOW_BYTECODE_MISMATCH` | (Optional) set `true` to proceed when the compiled bytecode differs from the reference implementation (i.e. intentionally deploying newer contract code) |
| `GAS_BUFFER_PERCENT` | (Optional) balance-check buffer, default `25` |
| `DRY_RUN` | Set `true` to run all preflight checks without broadcasting |

```bash
DRY_RUN=true TOKEN_NAME=... TOKEN_SYMBOL=... TOKEN_DECIMALS=6 DEFAULT_MINT_CAP=... \
ADMIN_ADDRESS=0x... DEFAULT_ADMIN_DELAY=... FREEZER_ADDRESS=0x... \
MASTER_MINTER_ADDRESS=0x... UPGRADER_ADDRESS=0x... BLACKLISTER_ADDRESS=0x... \
RESCUER_ADDRESS=0x... EXPECTED_CHAIN_ID=137 EXPECTED_DEPLOYER_ADDRESS=0x... \
EXPECTED_PROXY_ADDRESS=0x... EXPECTED_IMPLEMENTATION_ADDRESS=0x... \
npx hardhat run scripts/deploy-deterministic.ts --network polygon
```

Run once with `DRY_RUN=true`, review the preflight output, then run without it.

### 2. Upgrade Any Token - `upgrade-token.ts`

Upgrade any stablecoin by specifying the token name and proxy address:

```bash
# Upgrade a stablecoin
TOKEN_NAME=MyStablecoin PROXY_ADDRESS=0x... npx hardhat run scripts/upgrade-token.ts --network mainnet
```

## Environment Variables Reference

### Required for Deployment

| Variable | Description | Example |
|----------|-------------|---------|
| `TOKEN_NAME` | Full name of token | `MyStablecoin` |
| `TOKEN_SYMBOL` | Token symbol | `MYUSD` |
| `TOKEN_DECIMALS` | Number of decimals | `6` |
| `DEFAULT_MINT_CAP` | Mint cap per transaction | `1000000000000` (1M tokens) |
| `ADMIN_ADDRESS` | Default admin address | `0x1234...` |
| `DEFAULT_ADMIN_DELAY` | Admin change delay (seconds) | `172800` (2 days) |
| `FREEZER_ADDRESS` | Freeze/unfreeze role | `0x5678...` |
| `MASTER_MINTER_ADDRESS` | Master minter role (MASTER_MINTER_ROLE) — manages minters and bridge minters | `0x9abc...` |
| `UPGRADER_ADDRESS` | Upgrade role | `0xdef0...` |
| `BLACKLISTER_ADDRESS` | Blacklist role | `0x1357...` |
| `RESCUER_ADDRESS` | Token rescue role | `0x2468...` |

### Required for Upgrade

| Variable | Description | Example |
|----------|-------------|---------|
| `TOKEN_NAME` | Token to upgrade | `MyStablecoin` |
| `PROXY_ADDRESS` | Proxy contract address | `0x1234...` |


## Adding a New Token

When you add a new token (e.g., a euro-denominated `EuroStable`):

1. **Set the required environment variables**
2. **Deploy using generic script:**
   ```bash
   TOKEN_NAME=EuroStable \
   TOKEN_SYMBOL=EURX \
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
2. Rely on `scripts/upgrade-token.ts` to check storage compatibility — it calls `upgrades.validateUpgrade()` and aborts before upgrading if the layout is incompatible
3. For production, consider staged rollouts:
   - Upgrade one token first
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
- Review the upgrade guide in `STABLECOINS.md`
