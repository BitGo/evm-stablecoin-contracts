# Stablecoin Architecture Guide

This guide explains how to deploy and manage multiple stablecoins from a single generic Stablecoin contract.

## Architecture Overview

The platform uses a **Generic Stablecoin Contract** that provides:
- ✅ Single contract for all stablecoins
- ✅ Token configuration via initialization parameters
- ✅ Easy deployment of new stablecoins (1 command)
- ✅ Independent upgrade paths for each token
- ✅ Zero code duplication
- ✅ Consistent behavior across all tokens

## Quick Start: Deploy a New Stablecoin

Simply run the deployment script with the appropriate parameters:

```bash
# Set deployment parameters
export TOKEN_NAME="MyStablecoin"
export TOKEN_SYMBOL="MYUSD"
export TOKEN_DECIMALS=6
export DEFAULT_MINT_CAP=1000000000000
export ADMIN_ADDRESS=0x1234567890123456789012345678901234567890
export DEFAULT_ADMIN_DELAY=172800  # 2 days in seconds
export FREEZER_ADDRESS=0x2345678901234567890123456789012345678901
export MASTER_MINTER_ADDRESS=0x3456789012345678901234567890123456789012
export UPGRADER_ADDRESS=0x4567890123456789012345678901234567890123
export BLACKLISTER_ADDRESS=0x5678901234567890123456789012345678901234
export RESCUER_ADDRESS=0x6789012345678901234567890123456789012345

# Deploy to testnet first
npx hardhat run scripts/deploy-token.ts --network hoodi

# After testing, deploy to mainnet
npx hardhat run scripts/deploy-token.ts --network mainnet
```

**That's it!** No need to create separate contract files for each token.

## Directory Structure

```
contracts/
├── Stablecoin.sol                  # Generic stablecoin contract
├── Blacklistable.sol               # Shared blacklisting functionality
└── test/                           # Test contracts

scripts/
├── deploy-token.ts                 # Generic: Deploy ANY token
├── upgrade-token.ts                # Generic: Upgrade ANY token
└── README.md                       # Scripts documentation
```

## Key Components

### 1. Stablecoin.sol (Generic Contract)

Contains all functionality with parameterized initialization:
- ✅ ERC-20 token operations (transfer, approve, etc.)
- ✅ Minting and burning capabilities
- ✅ Pausable functionality (freeze/unfreeze transfers)
- ✅ Blacklisting mechanism
- ✅ Role-based access control (DEFAULT_ADMIN_ROLE, MASTER_MINTER_ROLE, MINTER, BRIDGE_MINTER, UPGRADER_ROLE, FREEZER_ROLE, BLACKLISTER_ROLE, RESCUER_ROLE)
- ✅ UUPS upgradeability
- ✅ **Parameterized initialization** (name, symbol, decimals, mint cap)

### 2. Deployment Script

The `deploy-token.ts` script deploys the same Stablecoin contract with different initialization parameters:

```typescript
// Simplified example
const Stablecoin = await ethers.getContractFactory("Stablecoin");
const instance = await upgrades.deployProxy(
    Stablecoin,
    [
        tokenName,        // e.g., "MyStablecoin"
        tokenSymbol,      // e.g., "MYUSD"
        tokenDecimals,    // e.g., 6
        adminAddress,
        defaultAdminDelay,
        freezerAddress,
        masterMinterAddress,
        upgraderAddress,
        blacklisterAddress,
        rescuerAddress,
        defaultMintCap
    ],
    { kind: 'uups' }
);
```

## Deployment Guide

### Environment Variables

Each deployment requires these environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `TOKEN_NAME` | Full name of token | `"MyStablecoin"` |
| `TOKEN_SYMBOL` | Token symbol | `"MYUSD"` |
| `TOKEN_DECIMALS` | Number of decimals | `6` |
| `DEFAULT_MINT_CAP` | Mint cap per transaction | `1000000000000` (1M tokens) |
| `ADMIN_ADDRESS` | Default admin address | `0x1234...` |
| `DEFAULT_ADMIN_DELAY` | Admin change delay (seconds) | `172800` (2 days) |
| `FREEZER_ADDRESS` | Freeze/unfreeze role | `0x5678...` |
| `MASTER_MINTER_ADDRESS` | Master minter role (manages minters and bridge minters) | `0x9abc...` |
| `UPGRADER_ADDRESS` | Upgrade role | `0xdef0...` |
| `BLACKLISTER_ADDRESS` | Blacklist role | `0x1357...` |
| `RESCUER_ADDRESS` | Token rescue role | `0x2468...` |

### Deployment Checklist

Before deploying to mainnet:

1. ✅ Set all environment variables
2. ✅ Compile: `npx hardhat compile`
3. ✅ Run tests: `npx hardhat test`
4. ✅ Deploy to testnet
5. ✅ Verify contract on block explorer
6. ✅ Test all functions on testnet
7. ✅ Security audit (if needed)
8. ✅ Deploy to mainnet
9. ✅ Verify contract on block explorer
10. ✅ Transfer roles to proper addresses
11. ✅ Document proxy addresses

### Example: Deploy MyStablecoin to Mainnet

```bash
# 1. Set all required environment variables
export TOKEN_NAME="MyStablecoin"
export TOKEN_SYMBOL="MYUSD"
export TOKEN_DECIMALS=6
export DEFAULT_MINT_CAP=1000000000000
export ADMIN_ADDRESS=0x...
export DEFAULT_ADMIN_DELAY=172800
export FREEZER_ADDRESS=0x...
export MASTER_MINTER_ADDRESS=0x...
export UPGRADER_ADDRESS=0x...
export BLACKLISTER_ADDRESS=0x...
export RESCUER_ADDRESS=0x...

# 2. Deploy
npx hardhat run scripts/deploy-token.ts --network mainnet

# Output:
# Deploying MyStablecoin (MYUSD) token with 6 decimals...
# Token Name: MyStablecoin
# Token Symbol: MYUSD
# Token Decimals: 6
# Default Mint Cap: 1000000000000
# Admin: 0x...
# MyStablecoin Proxy deployed to: 0x...
# MyStablecoin Implementation deployed to: 0x...

# 3. Save the proxy address!
echo "MYSTABLECOIN_PROXY=0x..." >> .env
```

## Upgrading Stablecoins

### When to Upgrade

Upgrade when you need to:
- Add new features to all stablecoins
- Fix bugs in core logic
- Improve security
- Optimize gas usage

### Upgrade Process

```bash
# Upgrade a specific token
TOKEN_NAME=MyStablecoin \
PROXY_ADDRESS=0x... \
npx hardhat run scripts/upgrade-token.ts --network mainnet
```

### Upgrade Best Practices

1. **Test First**
   ```bash
   # Test on local fork
   npx hardhat test
   
   # Test on testnet
   npx hardhat run scripts/upgrade-token.ts --network sepolia
   ```

2. **Validate Storage Compatibility**

   The `scripts/upgrade-token.ts` script validates the storage layout
   automatically via `upgrades.validateUpgrade()` and aborts before
   upgrading if the new implementation is incompatible.

3. **Staged Rollout** (for production)
   - Upgrade one token
   - Monitor for 24-48 hours
   - If successful, upgrade remaining tokens

4. **Keep Backup**
   - Save all proxy addresses
   - Save implementation addresses
   - Document upgrade timeline

## Storage Compatibility

When upgrading contracts, you **must** maintain storage compatibility:

### ✅ Safe Operations

- Add new functions
- Add new storage in new namespaced slots
- Modify function logic
- Add events

### ❌ Unsafe Operations

- Reorder existing storage variables
- Remove storage variables
- Change storage variable types
- Change inheritance order

### Adding New Storage (Safe Method)

Use namespaced storage (EIP-7201):

```solidity
// In Stablecoin.sol

// New storage location for V2
bytes32 private constant StablecoinV2StorageLocation = 
    0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef;

struct StablecoinV2Storage {
    uint256 transferFeePercentage;  // New feature
    bool feesEnabled;                // New feature
}

function _getV2Storage() private pure returns (StablecoinV2Storage storage $) {
    assembly {
        $.slot := StablecoinV2StorageLocation
    }
}

// New functions using V2 storage
function setTransferFee(uint256 fee) external onlyRole(DEFAULT_ADMIN_ROLE) {
    _getV2Storage().transferFeePercentage = fee;
}
```

## Testing

Run tests to verify everything works:

```bash
# Compile contracts
npx hardhat compile

# Run all tests
npx hardhat test

# Run specific test
npx hardhat test test/supply.ts

# Test with coverage
npx hardhat coverage
```

All tests should pass:
```
✅ 44 tests passing
- Stablecoin blacklist (13 tests)
- Stablecoin pause (6 tests)
- Stablecoin Minting, Burning & Token Rescue (25 tests)
```

## Troubleshooting

### "Missing required environment variables"
**Problem:** Deployment script can't find required env vars

**Solution:**
```bash
# Ensure all variables are set
export TOKEN_NAME="MyStablecoin"
export TOKEN_SYMBOL="MYUSD"
export TOKEN_DECIMALS=6
# ... (set all required variables)

# Or use a .env file
echo 'TOKEN_NAME="MyStablecoin"' >> .env
echo 'TOKEN_SYMBOL="MYUSD"' >> .env
# ... (add all variables)
```

### Upgrade validation fails
**Problem:** Storage layout incompatibility

**Solution:**
1. Check you're not reordering storage variables
2. Use namespaced storage for new variables
3. Review the upgrade safety checklist
4. Re-run `scripts/upgrade-token.ts` — it runs `upgrades.validateUpgrade()` and reports the incompatibility before upgrading

## Real-World Example: Complete MyStablecoin Deployment

```bash
# 1. Set environment variables
export TOKEN_NAME="MyStablecoin"
export TOKEN_SYMBOL="MYUSD"
export TOKEN_DECIMALS=6
export DEFAULT_MINT_CAP=1000000000000
export ADMIN_ADDRESS=0x123...
export DEFAULT_ADMIN_DELAY=172800
export FREEZER_ADDRESS=0x456...
export MASTER_MINTER_ADDRESS=0x789...
export UPGRADER_ADDRESS=0xabc...
export BLACKLISTER_ADDRESS=0xdef...
export RESCUER_ADDRESS=0x012...

# 2. Compile
npx hardhat compile
# ✅ Compiled successfully

# 3. Test
npx hardhat test
# ✅ 44 passing

# 4. Deploy to Sepolia testnet
npx hardhat run scripts/deploy-token.ts --network sepolia
# MyStablecoin Proxy deployed to: 0x678...
# MyStablecoin Implementation deployed to: 0x901...

# 5. Verify on Sepolia
npx hardhat verify --network sepolia 0x901...

# 6. Test on Sepolia (mint, burn, transfer, etc.)

# 7. Deploy to mainnet
npx hardhat run scripts/deploy-token.ts --network mainnet
# MyStablecoin Proxy deployed to: 0xABC...
# MyStablecoin Implementation deployed to: 0xDEF...

# 8. Verify on mainnet
npx hardhat verify --network mainnet 0xDEF...

# 9. Save addresses
echo "MYSTABLECOIN_PROXY_MAINNET=0xABC..." >> .env.production

# Done! 🎉
```

## Benefits of This Architecture

### 1. Simplicity 🎯
- No need to create separate contract files
- Single source of truth
- Reduced maintenance burden
- Easier audits

### 2. Consistency ✅
- All stablecoins behave identically
- Same security features across tokens
- Uniform upgrade patterns
- Predictable behavior

### 3. Zero Code Duplication 🔄
- One contract, deployed multiple times
- Generic deployment script
- No copy/paste errors
- Easy to maintain

### 4. Flexibility 🛠️
- Easy to deploy new stablecoins (1 command)
- Independent upgrade paths for each token
- Can customize via initialization parameters
- Staged rollouts possible

### 5. Developer Experience 👨‍💻
- Clear, simple process
- Well-documented
- Fewer files to manage
- Helpful error messages

## FAQ

**Q: How long does it take to add a new stablecoin?**
A: ~5 minutes (just set env vars and run the deployment script)

**Q: Do I need to create a new contract file?**
A: No! The same Stablecoin contract is used for all tokens.

**Q: Can I upgrade tokens independently?**
A: Yes! Each deployment creates a separate proxy with its own upgrade path.

**Q: How do I customize decimals or mint cap?**
A: Set `TOKEN_DECIMALS` and `DEFAULT_MINT_CAP` environment variables before deployment.

**Q: Is the architecture secure?**
A: Yes - same security model, with added benefits of simplicity and consistency.

**Q: What happened to the contracts/tokens/ directory?**
A: It's no longer needed. All tokens use the generic Stablecoin contract.

---
