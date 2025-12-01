// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlDefaultAdminRulesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "./Blacklistable.sol";
import "./ISupplyValidator.sol";

/**
 * @title Stablecoin - Generic stablecoin contract
 * @dev This contract implements the core ERC-20 stablecoin functionality including:
 * rate-limited minting/burning, pausing, blacklisting, and permit-based approvals. 
 * It differentiates between native mints (backed by collateral) and bridge mints (cross-chain).
 * It is upgradeable through UUPS (Universal Upgradeable Proxy Standard).
 * 
 * /// @custom:security-contact security@bitgo.com
 */
contract Stablecoin is
    Initializable,
    Blacklistable,
    ERC20PausableUpgradeable,
    ERC20PermitUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    // keccak256(abi.encode(uint256(keccak256("contract.storage.Stablecoin")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant StablecoinStorageLocation = 
                    0x9b2d10d13c5ae4f59a8184d905810047d3ab7f6fe6302078b828a0112a6ab900;

    /**
     * @notice The duration it takes for the limits to fully replenish
     */
    uint256 private constant _DURATION = 1 days;

    /**
     * @notice Minimum limit to prevent precision loss in rate calculations
     * @dev This ensures ratePerSecond is always >= 1 (1 token per second minimum)
     */
    uint256 private constant _MIN_LIMIT = 86400; // 1 day in seconds

    // --- Roles ---
    /**
     * @dev This role grants the ability to freeze or unfreeze all token transfers within the contract.
     */
    bytes32 public constant FREEZER_ROLE = keccak256("FREEZER_ROLE");

    /**
     * @dev This role is responsible for administering minters and bridge minters,
     * including setting limits and destroying blacklisted funds.
     */
    bytes32 public constant MASTER_MINTER_ROLE = keccak256("MASTER_MINTER_ROLE");

    /**
     * @dev This role allows minting and burning tokens for native operations (backed by collateral, treasury).
     */
    bytes32 public constant MINTER = keccak256("MINTER");

    /**
     * @dev This role allows minting and burning tokens for cross-chain bridge operations.
     */
    bytes32 public constant BRIDGE_MINTER = keccak256("BRIDGE_MINTER");

    /**
     * @dev This role allows to upgrade the contract, typically for implementing new features or bug fixes.
     */
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    /**
     * @dev This role allows to rescue tokens that are locked or stuck in the token contract.
     */
    bytes32 public constant RESCUER_ROLE = keccak256("RESCUER_ROLE");

    // --- Structs ---
    /**
     * @dev Parameters for minting or burning limits
     */
    struct MinterParams {
        uint256 maxLimit;           // Maximum tokens per day
        uint256 currentLimit;       // Currently available capacity
        uint256 timestamp;          // Last update timestamp
        uint256 ratePerSecond;      // Replenishment rate
    }

    /**
     * @dev Minter configuration with separate mint and burn limits
     */
    struct MinterConfig {
        MinterParams minterParams;
        MinterParams burnerParams;
        bool isConfigured;
    }

    // --- Events ---
    /**
     * @dev Emitted when tokens are minted natively (backed by collateral, treasury operations).
     */
    event MintNative(address indexed minter, address indexed to, uint256 amount);

    /**
     * @dev Emitted when tokens are burned natively.
     */
    event BurnNative(address indexed minter, address indexed from, uint256 amount);

    /**
     * @dev Emitted when tokens are minted via a bridge.
     */
    event MintBridge(address indexed bridge, address indexed to, uint256 amount);

    /**
     * @dev Emitted when tokens are burned via a bridge.
     */
    event BurnBridge(address indexed bridge, address indexed from, uint256 amount);

    /**
     * @dev Emitted when a native minter is configured.
     */
    event MinterConfigured(address indexed minter, uint256 mintLimit, uint256 burnLimit);

    /**
     * @dev Emitted when a bridge minter is configured.
     */
    event BridgeMinterConfigured(address indexed bridge, uint256 mintLimit, uint256 burnLimit);

    /**
     * @dev Emitted when a native minter is removed.
     */
    event MinterRemoved(address indexed minter);

    /**
     * @dev Emitted when a bridge minter is removed.
     */
    event BridgeMinterRemoved(address indexed bridge);

    /**
     * @dev Emitted when the mint cap per transaction is set to a new value.
     */
    event MintCapPerTransactionSet(uint256 newLimit);
    
    /**
     * @dev Emitted when an existing minter's limits are updated.
     */
    event MinterLimitsUpdated(
        address indexed minter, uint256 newMintLimit, uint256 newBurnLimit, bool indexed isBridge
        );

    /**
     * @dev Emitted when tokens are rescued from the token address and sent to a `recipient` address.
     */
    event TokensRescued(address indexed token, address indexed recipient, uint256 amount);

    /**
     * @dev Emitted when the supply validator address is updated.
     */
    event SupplyValidatorUpdated(address indexed oldValidator, address indexed newValidator);

    /**
     * @dev Emitted when a minter's limits are replenished to their maximum values in an emergency.
     */
    event MinterLimitsReplenished(address indexed minter, bool indexed isBridge);

    // --- Custom Errors ---
    /**
     * @dev The operation failed due to an invalid address.
     */
    error InvalidAddress();

    /**
     * @dev The operation failed due to an invalid amount provided.
     */
    error InvalidAmount();

    /**
     * @dev The operation failed because the transaction exceeds the mint cap per transaction.
     */
    error ExceedsMintTransactionCap();

    /**
     * @dev The operation failed because the sender is blacklisted.
     */
    error SenderBlacklisted();

    /**
     * @dev The operation failed because the sender is not blacklisted when expected.
     */
    error SenderNotBlacklisted();

    /**
     * @dev The operation failed because the spender is blacklisted.
     */
    error SpenderBlacklisted();

    /**
     * @dev The operation failed because the recipient is blacklisted.
     */
    error RecipientBlacklisted();

    /**
     * @dev The operation failed because the array lengths do not match.
     */
    error ArrayLengthsMismatch();

    /**
     * @dev The operation failed because the array lengths are empty.
     */
    error EmptyArrayLengths();

    /**
     * @dev The operation failed because the minter is not configured.
     */
    error MinterNotConfigured();

    /**
     * @dev The operation failed because the bridge minter is not configured.
     */
    error BridgeMinterNotConfigured();

    /**
     * @dev The operation failed because the minter has insufficient allowance.
     */
    error InsufficientMinterAllowance();

    /**
     * @dev The operation failed because the burner has insufficient allowance.
     */
    error InsufficientBurnerAllowance();

    /**
     * @dev The operation failed because the limits are set too high (overflow protection).
     */
    error LimitsTooHigh();

    /**
     * @dev The operation failed because the limit is below the minimum required.
     */
    error LimitTooLow();

    /**
     * @dev The operation failed because the account is already a minter.
     */
    error AccountAlreadyMinter();

    /**
     * @dev The operation failed because the account is already a bridge minter.
     */
    error AccountAlreadyBridgeMinter();


    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // --- Namespaced Storage ---
    /**
     * @dev A struct for storing the namespaced storage related to the stablecoin.
     * It includes the following properties:
     * - `mintCapPerTransaction`: The maximum allowable mint amount per transaction.
     * - `tokenDecimals`: The number of decimals for the token.
     * - `minters`: Maps native minter addresses to their configurations.
     * - `bridgeMinters`: Maps bridge minter addresses to their configurations.
     * - `supplyValidator`: Address of the supply validator contract.
     */
    struct StablecoinStorage {
        uint256 mintCapPerTransaction;
        uint8 tokenDecimals;
        mapping(address => MinterConfig) minters;
        mapping(address => MinterConfig) bridgeMinters;
        address supplyValidator;
    }

    /**
     * @dev Initializes the Stablecoin contract with the specified parameters.
     * @param tokenName The name of the token
     * @param tokenSymbol The symbol of the token
     * @param tokenDecimals The number of decimals for the token (e.g., 6).
     * @param defaultAdmin The address of the default admin.
     * @param defaultAdminDelay The delay (in seconds) before the default admin can be changed.
     * @param freezer The address of the freezer role.
     * @param masterMinter The address of the master minter role.
     * @param upgrader The address of the upgrader role.
     * @param blacklister The address of the blacklister role.
     * @param rescuer The address of the rescuer role.
     * @param defaultMintCap The default mint cap per transaction (in token's smallest unit).
     */
    function initialize(
        string memory tokenName,
        string memory tokenSymbol,
        uint8 tokenDecimals,
        address defaultAdmin,
        uint48 defaultAdminDelay,
        address freezer,
        address masterMinter,
        address upgrader,
        address blacklister,
        address rescuer,
        uint256 defaultMintCap
    ) external initializer {
        __ERC20_init(tokenName, tokenSymbol);
        __ERC20Pausable_init();
        __ERC20Permit_init(tokenName);
        __UUPSUpgradeable_init();
        __AccessControlDefaultAdminRules_init(defaultAdminDelay, defaultAdmin);
        _grantRole(BLACKLISTER_ROLE, blacklister);
        _grantRole(FREEZER_ROLE, freezer);
        _grantRole(MASTER_MINTER_ROLE, masterMinter);
        _grantRole(UPGRADER_ROLE, upgrader);
        _grantRole(RESCUER_ROLE, rescuer);
        _getStablecoinStorage().mintCapPerTransaction = defaultMintCap;
        emit MintCapPerTransactionSet(_getStablecoinStorage().mintCapPerTransaction);
        _getStablecoinStorage().tokenDecimals = tokenDecimals;
    }

    // --- Master Minter Functions ---

    /**
     * @dev Internal function to configure a minter with mint and burn limits.
     * @param account The address of the minter/bridge to configure.
     * @param mintLimit The daily minting limit.
     * @param burnLimit The daily burning limit.
     * @param isBridge Whether this is a bridge minter or a native minter.
     */
    function _configureMinterInternal(
        address account,
        uint256 mintLimit,
        uint256 burnLimit,
        bool isBridge
    ) internal {
        if (account == address(0)) revert InvalidAddress();
        if (mintLimit > (type(uint256).max / 2) || burnLimit > (type(uint256).max / 2)) {
            revert LimitsTooHigh();
        }
        
        // Validate minimum limits to prevent precision loss
        if (mintLimit < _MIN_LIMIT) revert LimitTooLow();
        if (burnLimit < _MIN_LIMIT) revert LimitTooLow();

        // Check that an account can't have both roles simultaneously
        if (isBridge && hasRole(MINTER, account)) {
            revert AccountAlreadyMinter();
        }
        
        if (!isBridge && hasRole(BRIDGE_MINTER, account)) {
            revert AccountAlreadyBridgeMinter();
        }

        StablecoinStorage storage $ = _getStablecoinStorage();
        bool isUpdate = false;
        
        if (isBridge) {
            if ($.bridgeMinters[account].isConfigured) {
                isUpdate = true;
            } else {
                $.bridgeMinters[account].isConfigured = true;
                _grantRole(BRIDGE_MINTER, account);
            }
        } else {
            if ($.minters[account].isConfigured) {
                isUpdate = true;
            } else {
                $.minters[account].isConfigured = true;
                _grantRole(MINTER, account);
            }
        }
        
        _changeMinterLimit(account, mintLimit, isBridge);
        _changeBurnerLimit(account, burnLimit, isBridge);
        
        if (isUpdate) {
            emit MinterLimitsUpdated(account, mintLimit, burnLimit, isBridge);
        } else {
            if (isBridge) {
                emit BridgeMinterConfigured(account, mintLimit, burnLimit);
            } else {
                emit MinterConfigured(account, mintLimit, burnLimit);
            }
        }
    }

    /**
     * @dev Configures a native minter with mint and burn limits.
     * @param minter The address of the minter to configure.
     * @param mintLimit The daily minting limit.
     * @param burnLimit The daily burning limit.
     */
    function configureMinter(
        address minter,
        uint256 mintLimit,
        uint256 burnLimit
    ) external onlyRole(MASTER_MINTER_ROLE) {
        _configureMinterInternal(minter, mintLimit, burnLimit, false);
    }

    /**
     * @dev Configures a bridge minter with mint and burn limits.
     * @param bridge The address of the bridge to configure.
     * @param mintLimit The daily minting limit.
     * @param burnLimit The daily burning limit.
     */
    function configureBridgeMinter(
        address bridge,
        uint256 mintLimit,
        uint256 burnLimit
    ) external onlyRole(MASTER_MINTER_ROLE) {
        _configureMinterInternal(bridge, mintLimit, burnLimit, true);
    }

    /**
     * @dev Internal function to remove a minter or bridge minter.
     * @param account The address of the minter/bridge to remove.
     * @param isBridge Whether this is a bridge minter or a native minter.
     */
    function _removeMinterInternal(address account, bool isBridge) internal {
        MinterConfig storage config = _getMinterConfig(account, isBridge);

        // Check if the account is configured and has the role
        _validateMinterConfigured(config, isBridge);

        if (!hasRole(isBridge ? BRIDGE_MINTER : MINTER, account)) {
            if (isBridge) {
                revert BridgeMinterNotConfigured();
            } else {
                revert MinterNotConfigured();
            }
        }

        config.isConfigured = false;
        config.minterParams.maxLimit = 0;
        config.minterParams.currentLimit = 0;
        config.burnerParams.maxLimit = 0;
        config.burnerParams.currentLimit = 0;

        _revokeRole(isBridge ? BRIDGE_MINTER : MINTER, account);

        if (isBridge) {
            emit BridgeMinterRemoved(account);
        } else {
            emit MinterRemoved(account);
        }
    }

    /**
     * @dev Removes a native minter.
     * @param minter The address of the minter to remove.
     */
    function removeMinter(address minter) external onlyRole(MASTER_MINTER_ROLE) {
        _removeMinterInternal(minter, false);
    }

    /**
     * @dev Removes a bridge minter.
     * @param bridge The address of the bridge to remove.
     */
    function removeBridgeMinter(address bridge) external onlyRole(MASTER_MINTER_ROLE) {
        _removeMinterInternal(bridge, true);
    }

    /**
     * @dev Replenishes a minter's limits to their maximum values in case of emergencies.
     * This function immediately resets both the mint and burn current limits to their
     * respective maximum limits, bypassing the normal time-based replenishment mechanism.
     * @param minter The address of the minter whose limits should be replenished.
     * @param isBridge Whether this is a bridge minter or a native minter.
     */
    function replenishMinterLimits(address minter, bool isBridge) external onlyRole(MASTER_MINTER_ROLE) {
        MinterConfig storage config = _getMinterConfig(minter, isBridge);

        // Validate that the minter is configured
        _validateMinterConfigured(config, isBridge);

        // Reset mint limits to maximum
        config.minterParams.currentLimit = config.minterParams.maxLimit;
        config.minterParams.timestamp = block.timestamp;

        // Reset burn limits to maximum
        config.burnerParams.currentLimit = config.burnerParams.maxLimit;
        config.burnerParams.timestamp = block.timestamp;

        emit MinterLimitsReplenished(minter, isBridge);
    }

    /**
     * @dev Destroys blacklisted funds.
     * @param account The address of the account with blacklisted funds.
     */
    function destroyBlacklistedFunds(
        address account
    ) external onlyRole(MASTER_MINTER_ROLE) {
        if (!isBlacklisted(account)) revert SenderNotBlacklisted();
        uint256 balance = balanceOf(account);
        _burn(account, balance);
        emit BurnNative(msg.sender, account, balance);
    }

    // --- Minter Functions (Native) ---

    // --- Internal Mint/Burn Implementation ---
    
    /**
     * @dev Internal function for minting tokens with proper checks and limits.
     * @param to The address to which the new tokens will be minted.
     * @param amount The amount of tokens to be minted.
     * @param isBridge Whether this is a bridge mint operation.
     */
    function _mintTokens(address to, uint256 amount, bool isBridge) internal {
        StablecoinStorage storage $ = _getStablecoinStorage();
        
        if (isBlacklisted(to)) revert RecipientBlacklisted();
        if (amount > $.mintCapPerTransaction) revert ExceedsMintTransactionCap();
        
        MinterConfig storage config = _getMinterConfig(msg.sender, isBridge);
        _validateMinterConfigured(config, isBridge);
        
        uint256 currentLimit = _getMintingCurrentLimit(msg.sender, isBridge);
        if (currentLimit < amount) revert InsufficientMinterAllowance();
        
        _useMinterLimits(msg.sender, amount, isBridge);
        _mint(to, amount);
        _emitMintEvent(msg.sender, to, amount, isBridge);

        address validator = $.supplyValidator;
        if (validator != address(0)) {
            ISupplyValidator(validator).validateMint(to, amount, msg.sender, isBridge);
        }
    }
    
    /**
     * @dev Internal function for burning tokens with proper checks and limits.
     * @param from The address from which the tokens will be burned.
     * @param amount The amount of tokens to be burned.
     * @param isBridge Whether this is a bridge burn operation.
     */
    function _burnTokens(address from, uint256 amount, bool isBridge) internal {
        if (isBlacklisted(from)) revert SenderBlacklisted();
        
        // Check allowance if burning from another address
        if (from != msg.sender) {
            _spendAllowance(from, msg.sender, amount);
        }
        
        MinterConfig storage config = _getMinterConfig(msg.sender, isBridge);
        _validateMinterConfigured(config, isBridge);
        
        uint256 currentLimit = _getBurningCurrentLimit(msg.sender, isBridge);
        if (currentLimit < amount) revert InsufficientBurnerAllowance();

        _useBurnerLimits(msg.sender, amount, isBridge);
        _burn(from, amount);
        _emitBurnEvent(msg.sender, from, amount, isBridge);
    
        address validator = _getStablecoinStorage().supplyValidator;
        if (validator != address(0)) {
            ISupplyValidator(validator).validateBurn(from, amount, msg.sender, isBridge);
        }
    }
    
    /**
     * @dev Internal function for batch minting tokens with proper checks and limits.
     * Gas optimized: calculates limit once, validates all inputs, then mints all tokens.
     * @param toAddresses The addresses to which the new tokens will be minted.
     * @param amounts The amounts of tokens to be minted for each address.
     * @param isBridge Whether this is a bridge mint operation.
     */
    function _mintTokensBatch(address[] memory toAddresses, uint256[] memory amounts, bool isBridge) internal {
        if (toAddresses.length == 0 || amounts.length == 0) revert EmptyArrayLengths();
        if (toAddresses.length != amounts.length) revert ArrayLengthsMismatch();
        
        StablecoinStorage storage $ = _getStablecoinStorage();
        MinterConfig storage config = _getMinterConfig(msg.sender, isBridge);
        _validateMinterConfigured(config, isBridge);
        
        uint256 currentLimit = _getMintingCurrentLimit(msg.sender, isBridge);
        uint256 totalAmount = 0;
        uint256 perTxCap = $.mintCapPerTransaction;
        for (uint256 i = 0; i < toAddresses.length; i++) {
            if (amounts[i] > perTxCap) revert ExceedsMintTransactionCap();
            if (isBlacklisted(toAddresses[i])) revert RecipientBlacklisted();
            totalAmount += amounts[i];
        }

        if (currentLimit < totalAmount) revert InsufficientMinterAllowance();
        
        _useMinterLimits(msg.sender, totalAmount, isBridge);

        for (uint256 i = 0; i < toAddresses.length; i++) {
            _mint(toAddresses[i], amounts[i]);
            _emitMintEvent(msg.sender, toAddresses[i], amounts[i], isBridge);
        }
        
        address validator = $.supplyValidator;
        if (validator != address(0)) {
            ISupplyValidator(validator).validateMintBatch(toAddresses, amounts, msg.sender, isBridge);
        }
    }
    
    // --- Minter Functions (Native) ---
    
    /**
     * @dev Mints new tokens natively (backed by collateral, treasury operations).
     * @param to The address to which the new tokens will be minted.
     * @param amount The amount of tokens to be minted.
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER) {
        _mintTokens(to, amount, false);
    }
    
    /**
     * @dev Burns tokens natively.
     * @param from The address from which the tokens will be burned.
     * @param amount The amount of tokens to be burned.
     */
    function burn(address from, uint256 amount) external onlyRole(MINTER) {
        _burnTokens(from, amount, false);
    }
    
    /**
     * @dev Mints new tokens natively to a set of addresses.
     * @param toAddresses The addresses to which the new tokens will be minted.
     * @param amounts The amounts of tokens to be minted for each address.
     */
    function mintBatch(address[] memory toAddresses, uint256[] memory amounts) external onlyRole(MINTER) {
        _mintTokensBatch(toAddresses, amounts, false);
    }
    
    // --- Bridge Minter Functions ---
    
    /**
     * @dev Mints tokens via a bridge for cross-chain operations.
     * @param to The address to which the new tokens will be minted.
     * @param amount The amount of tokens to be minted.
     */
    function bridgeMint(address to, uint256 amount) external onlyRole(BRIDGE_MINTER) {
        _mintTokens(to, amount, true);
    }
    
    /**
     * @dev Burns tokens via a bridge for cross-chain operations.
     * @param from The address from which the tokens will be burned.
     * @param amount The amount of tokens to be burned.
     */
    function bridgeBurn(address from, uint256 amount) external onlyRole(BRIDGE_MINTER) {
        _burnTokens(from, amount, true);
    }
    
    /**
     * @dev Mints tokens via a bridge to a set of addresses.
     * @param toAddresses The addresses to which the new tokens will be minted.
     * @param amounts The amounts of tokens to be minted for each address.
     */
    function bridgeMintBatch(address[] memory toAddresses, uint256[] memory amounts) external onlyRole(BRIDGE_MINTER) {
        _mintTokensBatch(toAddresses, amounts, true);
    }

    // --- View Functions ---

    /**
     * @dev Returns the maximum minting limit for a minter.
     * @param minter The address of the minter.
     * @param isBridge Whether this is a bridge minter.
     * @return The maximum minting limit.
     */
    function mintingMaxLimitOf(address minter, bool isBridge) public view returns (uint256) {
        StablecoinStorage storage $ = _getStablecoinStorage();
        if (isBridge) {
            return $.bridgeMinters[minter].minterParams.maxLimit;
        } else {
            return $.minters[minter].minterParams.maxLimit;
        }
    }

    /**
     * @dev Returns the maximum burning limit for a minter.
     * @param minter The address of the minter.
     * @param isBridge Whether this is a bridge minter.
     * @return The maximum burning limit.
     */
    function burningMaxLimitOf(address minter, bool isBridge) public view returns (uint256) {
        StablecoinStorage storage $ = _getStablecoinStorage();
        if (isBridge) {
            return $.bridgeMinters[minter].burnerParams.maxLimit;
        } else {
            return $.minters[minter].burnerParams.maxLimit;
        }
    }

    /**
     * @dev Returns the current available minting limit for a minter.
     * @param minter The address of the minter.
     * @param isBridge Whether this is a bridge minter.
     * @return The current minting limit.
     */
    function mintingCurrentLimitOf(address minter, bool isBridge) public view returns (uint256) {
        return _getMintingCurrentLimit(minter, isBridge);
    }

    /**
     * @dev Returns the current available burning limit for a minter.
     * @param minter The address of the minter.
     * @param isBridge Whether this is a bridge minter.
     * @return The current burning limit.
     */
    function burningCurrentLimitOf(address minter, bool isBridge) public view returns (uint256) {
        return _getBurningCurrentLimit(minter, isBridge);
    }

    /**
     * @dev Checks if an address is a configured native minter.
     * @param account The address to check.
     * @return True if the address is a configured minter.
     */
    function isMinter(address account) external view returns (bool) {
        return _getStablecoinStorage().minters[account].isConfigured;
    }

    /**
     * @dev Checks if an address is a configured bridge minter.
     * @param account The address to check.
     * @return True if the address is a configured bridge minter.
     */
    function isBridgeMinter(address account) external view returns (bool) {
        return _getStablecoinStorage().bridgeMinters[account].isConfigured;
    }

    /**
     * @dev Returns the current minting allowance (alias for mintingCurrentLimitOf).
     * @param minter The address of the minter.
     * @return The current minting allowance.
     */
    function minterAllowance(address minter) external view returns (uint256) {
        return _getMintingCurrentLimit(minter, false);
    }

    /**
     * @dev Returns the current minting allowance for a bridge (alias for mintingCurrentLimitOf).
     * @param bridge The address of the bridge.
     * @return The current minting allowance.
     */
    function bridgeMinterAllowance(address bridge) external view returns (uint256) {
        return _getMintingCurrentLimit(bridge, true);
    }

    /**
     * @dev Returns the minter configuration for a native minter.
     * @param minter The address of the minter.
     * @return The minter configuration.
     */
    function minters(address minter) external view returns (MinterConfig memory) {
        return _getStablecoinStorage().minters[minter];
    }

    /**
     * @dev Returns the minter configuration for a bridge minter.
     * @param bridge The address of the bridge.
     * @return The bridge minter configuration.
     */
    function bridgeMinters(address bridge) external view returns (MinterConfig memory) {
        return _getStablecoinStorage().bridgeMinters[bridge];
    }

    // --- Admin Functions ---

    /**
     * @dev Sets the mint cap per transaction.
     * Requirements:
     * - Caller must have the `DEFAULT_ADMIN_ROLE` role.
     * @param newLimit The new maximum limit per transaction for mint.
     */
    function setMintCapPerTransaction(
        uint256 newLimit
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newLimit == 0) revert InvalidAmount();
        _getStablecoinStorage().mintCapPerTransaction = newLimit;
        emit MintCapPerTransactionSet(newLimit);
    }

    /**
     * @dev Withdraws tokens from the contract and transfers them to the recipient.
     * @param token The address of the token to be withdrawn.
     * @param recipient The address to which the tokens will be transferred.
     * @param amount The amount of tokens to be withdrawn.
     */
    function rescueTokens(
        IERC20 token,
        address recipient,
        uint256 amount
    ) external onlyRole(RESCUER_ROLE) {
        if (recipient == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (isBlacklisted(recipient)) revert RecipientBlacklisted();
        token.safeTransfer(recipient, amount);
        emit TokensRescued(address(token), recipient, amount);
    }

    /**
     * @dev Sets the supply validator contract address.
     * Requirements:
     * - Caller must have the `DEFAULT_ADMIN_ROLE` role.
     * @param newValidator The address of the new supply validator contract.
     */
    function setSupplyValidator(address newValidator) external onlyRole(DEFAULT_ADMIN_ROLE) {
        StablecoinStorage storage $ = _getStablecoinStorage();
        address oldValidator = $.supplyValidator;
        $.supplyValidator = newValidator;
        emit SupplyValidatorUpdated(oldValidator, newValidator);
    }

    /**
     * @dev Gets the supply validator contract address.
     * @return The address of the supply validator contract.
     */
    function getSupplyValidator() external view returns (address) {
        return _getStablecoinStorage().supplyValidator;
    }

    /**
     * @dev Pauses all token transfers.
     */
    function pause() external onlyRole(FREEZER_ROLE) {
        _pause();
    }

    /**
     * @dev Unpauses all token transfers.
     */
    function unpause() external onlyRole(FREEZER_ROLE) {
        _unpause();
    }

    // --- ERC20 Overrides ---

    /**
     * @dev Transfers `value` tokens from `from` to `to` address 
     * using the allowance mechanism. `value` is then deducted 
     * from the caller's allowance.
     * @param from The address to transfer tokens from.
     * @param to The address to transfer tokens to.
     * @param value The amount of tokens to transfer.
     * Emits a {Transfer} event.
     */
    function transferFrom(
        address from,
        address to,
        uint256 value
    ) public virtual override returns (bool) {
        _validateBlacklistForTransfer(_msgSender(), from, to);
        return super.transferFrom(from, to, value);
    }

    /**
     * @dev Transfers tokens from the caller's account to another account
     * @param to The address to transfer tokens to.
     * @param value The amount of tokens to transfer.
     * @return A boolean value indicating whether the transfer was successful or not.
     */
    function transfer(
        address to,
        uint256 value
    ) public virtual override returns (bool) {
        _validateBlacklistForTransfer(_msgSender(), _msgSender(), to);
        return super.transfer(to, value);
    }

    /**
     * @dev Returns the number of decimals used by the token.
     */
    function decimals()
        public
        view
        virtual
        override(ERC20Upgradeable)
        returns (uint8)
    {
        return _getStablecoinStorage().tokenDecimals;
    }

    /**
     * @dev Retrieves the mint cap per transaction.
     * @return The mint cap per transaction.
     */
    function getMintCapPerTransaction() external view returns (uint256) {
        return _getStablecoinStorage().mintCapPerTransaction;
    }

    /**
     * @dev Returns the balance of the specified account.
     * @param account The address to check the balance of.
     * @return The balance of the specified account.
     */
    function balanceOf(
        address account
    )
        public
        view
        virtual
        override(Blacklistable, ERC20Upgradeable)
        returns (uint256)
    {
        return Blacklistable.balanceOf(account);
    }

    // --- Internal Functions ---

    /**
     * @dev Retrieves the minter configuration based on whether it's a bridge or native minter.
     * @param account The address of the minter.
     * @param isBridge Whether this is a bridge minter or native minter.
     * @return The minter configuration storage reference.
     */
    function _getMinterConfig(address account, bool isBridge) internal view returns (MinterConfig storage) {
        StablecoinStorage storage $ = _getStablecoinStorage();
        return isBridge ? $.bridgeMinters[account] : $.minters[account];
    }

    /**
     * @dev Validates that a minter is configured, reverting with appropriate error if not.
     * @param config The minter configuration to validate.
     * @param isBridge Whether this is a bridge minter or native minter.
     */
    function _validateMinterConfigured(MinterConfig storage config, bool isBridge) internal view {
        if (!config.isConfigured) {
                if (isBridge) {
                    revert BridgeMinterNotConfigured();
                } else {
                    revert MinterNotConfigured();
                }

        }
    }

    /**
     * @dev Emits the appropriate mint event based on whether it's a bridge or native operation.
     * @param minter The address of the minter.
     * @param to The address receiving the minted tokens.
     * @param amount The amount of tokens minted.
     * @param isBridge Whether this is a bridge mint or native mint.
     */
    function _emitMintEvent(address minter, address to, uint256 amount, bool isBridge) internal {
        if (isBridge) {
            emit MintBridge(minter, to, amount);
        } else {
            emit MintNative(minter, to, amount);
        }
    }

    /**
     * @dev Emits the appropriate burn event based on whether it's a bridge or native operation.
     * @param burner The address of the burner.
     * @param from The address from which tokens are burned.
     * @param amount The amount of tokens burned.
     * @param isBridge Whether this is a bridge burn or native burn.
     */
    function _emitBurnEvent(address burner, address from, uint256 amount, bool isBridge) internal {
        if (isBridge) {
            emit BurnBridge(burner, from, amount);
        } else {
            emit BurnNative(burner, from, amount);
        }
    }

    /**
     * @dev Validates that none of the addresses involved in a transfer are blacklisted.
     * @param spender The address spending the tokens (relevant for transferFrom).
     * @param from The address sending the tokens.
     * @param to The address receiving the tokens.
     */
    function _validateBlacklistForTransfer(address spender, address from, address to) internal view {
        if (isBlacklisted(spender)) revert SpenderBlacklisted();
        if (isBlacklisted(from)) revert SenderBlacklisted();
        if (isBlacklisted(to)) revert RecipientBlacklisted();
    }

    /**
     * @dev Uses the minter/burner limit by reducing the current limit.
     * @param params The minter parameters to update.
     * @param amount The amount to reduce from the limit.
     */
    function _useLimits(MinterParams storage params, uint256 amount) internal {
        uint256 currentLimit = _getCurrentLimit(
            params.currentLimit,
            params.maxLimit,
            params.timestamp,
            params.ratePerSecond
        );
        params.timestamp = block.timestamp;
        params.currentLimit = currentLimit - amount;
    }

    /**
     * @dev Updates the limit for minter/burner parameters.
     * @param params The minter parameters to update.
     * @param newLimit The new limit value.
     */
    function _changeLimit(MinterParams storage params, uint256 newLimit) internal {
        uint256 oldLimit = params.maxLimit;
        uint256 currentLimit = _getCurrentLimit(
            params.currentLimit,
            params.maxLimit,
            params.timestamp,
            params.ratePerSecond
        );
        params.maxLimit = newLimit;
        params.currentLimit = _calculateNewCurrentLimit(newLimit, oldLimit, currentLimit);
        params.ratePerSecond = newLimit / _DURATION;
        params.timestamp = block.timestamp;
    }

    /**
     * @dev Authorizes the upgrade to a new implementation contract.
     * @param newImplementation The address of the new implementation contract.
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyRole(UPGRADER_ROLE) {}

    /**
     * @dev Updates the balance of the specified addresses and emits the corresponding events.
     * @param from The address from which tokens are transferred.
     * @param to The address to which tokens are transferred.
     * @param value The amount of tokens transferred.
     */
    function _update(
        address from,
        address to,
        uint256 value
    )
        internal
        override(Blacklistable, ERC20Upgradeable, ERC20PausableUpgradeable)
    {
        ERC20PausableUpgradeable._update(from, to, value);
    }

    /**
     * @dev Gets the current minting limit for a minter, accounting for time-based replenishment.
     * @param minter The address of the minter.
     * @param isBridge Whether this is a bridge minter.
     * @return The current minting limit.
     */
    function _getMintingCurrentLimit(address minter, bool isBridge) internal view returns (uint256) {
        MinterConfig storage config = _getMinterConfig(minter, isBridge);
        return _getCurrentLimit(
            config.minterParams.currentLimit,
            config.minterParams.maxLimit,
            config.minterParams.timestamp,
            config.minterParams.ratePerSecond
        );
    }

    /**
     * @dev Gets the current burning limit for a minter, accounting for time-based replenishment.
     * @param minter The address of the minter.
     * @param isBridge Whether this is a bridge minter.
     * @return The current burning limit.
     */
    function _getBurningCurrentLimit(address minter, bool isBridge) internal view returns (uint256) {
        MinterConfig storage config = _getMinterConfig(minter, isBridge);
        return _getCurrentLimit(
            config.burnerParams.currentLimit,
            config.burnerParams.maxLimit,
            config.burnerParams.timestamp,
            config.burnerParams.ratePerSecond
        );
    }

    /**
     * @dev Calculates the current limit with time-based replenishment.
     * @param currentLimit The current limit value.
     * @param maxLimit The maximum limit value.
     * @param timestamp The last update timestamp.
     * @param ratePerSecond The replenishment rate per second.
     * @return limit The calculated current limit.
     */
    function _getCurrentLimit(
        uint256 currentLimit,
        uint256 maxLimit,
        uint256 timestamp,
        uint256 ratePerSecond
    ) internal view returns (uint256 limit) {
        limit = currentLimit;
        if (limit == maxLimit) {
            return limit;
        } else if (timestamp + _DURATION <= block.timestamp) {
            limit = maxLimit;
        } else {
            uint256 timePassed = block.timestamp - timestamp;
            uint256 calculatedLimit = limit + (timePassed * ratePerSecond);
            limit = calculatedLimit > maxLimit ? maxLimit : calculatedLimit;
        }
    }

    /**
     * @dev Uses the minter's limit by reducing the current limit.
     * @param minter The address of the minter.
     * @param amount The amount to reduce from the limit.
     * @param isBridge Whether this is a bridge minter.
     */
    function _useMinterLimits(address minter, uint256 amount, bool isBridge) internal {
        MinterConfig storage config = _getMinterConfig(minter, isBridge);
        _useLimits(config.minterParams, amount);
    }

    /**
     * @dev Uses the burner's limit by reducing the current limit.
     * @param minter The address of the minter.
     * @param amount The amount to reduce from the limit.
     * @param isBridge Whether this is a bridge minter.
     */
    function _useBurnerLimits(address minter, uint256 amount, bool isBridge) internal {
        MinterConfig storage config = _getMinterConfig(minter, isBridge);
        _useLimits(config.burnerParams, amount);
    }

    /**
     * @dev Updates the minting limit for a minter.
     * @param minter The address of the minter.
     * @param limit The new limit value.
     * @param isBridge Whether this is a bridge minter.
     */
    function _changeMinterLimit(address minter, uint256 limit, bool isBridge) internal {
        MinterConfig storage config = _getMinterConfig(minter, isBridge);
        _changeLimit(config.minterParams, limit);
    }

    /**
     * @dev Updates the burning limit for a minter.
     * @param minter The address of the minter.
     * @param limit The new limit value.
     * @param isBridge Whether this is a bridge minter.
     */
    function _changeBurnerLimit(address minter, uint256 limit, bool isBridge) internal {
        MinterConfig storage config = _getMinterConfig(minter, isBridge);
        _changeLimit(config.burnerParams, limit);
    }

    /**
     * @dev Calculates the new current limit when the max limit changes.
     * @param newLimit The new maximum limit.
     * @param oldLimit The old maximum limit.
     * @param currentLimit The current limit value.
     * @return newCurrentLimit The adjusted current limit.
     */
    function _calculateNewCurrentLimit(
        uint256 newLimit,
        uint256 oldLimit,
        uint256 currentLimit
    ) internal pure returns (uint256 newCurrentLimit) {
        uint256 difference;
        if (oldLimit > newLimit) {
            difference = oldLimit - newLimit;
            newCurrentLimit = currentLimit > difference ? currentLimit - difference : 0;
        } else {
            difference = newLimit - oldLimit;
            newCurrentLimit = currentLimit + difference;
        }
    }

    /**
     * @dev Fetches the namespaced storage structure for the Stablecoin contract.
     * This function uses EIP-7201-style namespaced storage to ensure compatibility
     * and extensibility for upgradeable contracts.
     * @return $ The `StablecoinStorage` struct containing storage variables specific to the stablecoin contract.
     */
    function _getStablecoinStorage() private pure returns (StablecoinStorage storage $) {
        assembly {
            $.slot := StablecoinStorageLocation
        }
    }
}
