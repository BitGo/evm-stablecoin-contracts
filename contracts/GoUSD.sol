// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlDefaultAdminRulesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "./Blacklistable.sol";

/**
 * @title Official GoUSD ERC-20 Implementation
 * @dev This contract implements the ERC-20 standard for the GoUSD token, providing functionalities
 * such as minting, pausing, blacklisting, and permit-based approvals. It is also upgradeable through
 * UUPS (Universal Upgradeable Proxy Standard).
 * 
 * /// @custom:security-contact security@bitgo.com
 */
contract GoUSD is
    Initializable,
    Blacklistable,
    ERC20PausableUpgradeable,
    ERC20PermitUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    // keccak256(abi.encode(uint256(keccak256("contract.storage.GoUSD")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant GoUSDStorageLocation = 0x9ca604c58ab95c30482ed3a32180df5a32334be7c88a6ba06098b0ad31c6c500;

    // --- Roles ---
    /**
     * @dev This role grants the ability to freeze or unfreeze all token transfers within the contract.
     */
    bytes32 public constant FREEZER_ROLE = keccak256("FREEZER_ROLE");

    /**
     * @dev This role is responsible for managing the token supply, 
     * including minting, burning or destroying blacklisted funds.
     */
    bytes32 public constant SUPPLY_CONTROLLER_ROLE = keccak256("SUPPLY_CONTROLLER_ROLE");

    /**
     * @dev This role allows to upgrade the contract, typically for implementing new features or bug fixes.
     */
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    /**
     * @dev This role allows to rescue tokens that are locked or stuck in the token contract.
     */
    bytes32 public constant RESCUER_ROLE = keccak256("RESCUER_ROLE");

    // --- Events ---
    /**
     * @dev Emitted when tokens are burned from the `from` address.
     */
    event Burn(address indexed from, uint256 amount);

    /**
     * @dev Emitted when tokens are minted to the `to` address.
     */
    event Mint(address indexed to, uint256 amount);

    /**
     * @dev Emitted when the proof of reserve feed is set to a new address.
     */
    event ProofOfReserveFeedSet(address newFeed);

    /**
     * @dev Emitted when the acceptable proof of reserve delay is updated.
     */
    event AcceptableProofOfReserveDelaySet(uint256 newTimeDelay);

    /**
     * @dev Emitted when the mint cap per transaction is set to a new value.
     */
    event MintCapPerTransactionSet(uint256 newLimit);

    /**
     * @dev Emitted when tokens are rescued from the token address and sent to a `recipient` address.
     */
    event TokensRescued(address indexed token, address indexed recipient, uint256 amount);

    // --- Custom Errors ---
    /**
     * @dev The operation failed due to an invalid address.
     */
    error InvalidAddress();

    /**
     * @dev The operation failed because the provided time delay is invalid.
     */
    error InvalidTimeDelay();

    /**
     * @dev The operation failed due to an invalid amount provided.
     */
    error InvalidAmount();

    /**
     * @dev The operation failed because the number of decimals is invalid.
     */
    error InvalidDecimals();

    /**
     * @dev The operation failed due to invalid proof of reserve data.
     */
    error InvalidPoRData();

    /**
     * @dev The operation failed because the proof of reserve data is outdated.
     */
    error PoROutdated();

    /**
     * @dev The operation failed because the transaction exceeds the mint cap per transaction.
     */
    error ExceedsMintTransactionCap();

    /**
     * @dev The operation failed because the supply exceeds the reserves.
     */
    error SupplyExceedsReserves();

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

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // --- Namespaced Storage ---
    /**
     * @dev A struct for storing the namespaced storage related to the GoUSD token.
     * It includes the following properties:
     * - `proofOfReserveFeed`: The address of the aggregator contract used for proof of reserve data.
     * - `acceptableProofOfReserveTimeDelay`: The time delay that is considered acceptable for proof of reserve updates.
     * - `mintCapPerTransaction`: The maximum allowable mint amount per transaction.
     */
    struct GoUSDStorage {
        AggregatorV3Interface proofOfReserveFeed;
        uint256 acceptableProofOfReserveTimeDelay;
        uint256 mintCapPerTransaction;
    }

    /**
     * @dev Initializes the GoUSD contract.
     * @param defaultAdmin The address of the default admin.
     * @param defaultAdminDelay The delay (in seconds) before the default admin can be changed.
     * @param freezer The address of the freezer role.
     * @param supplyController The address of the supply controller role.
     * @param upgrader The address of the upgrader role.
     * @param blacklister The address of the blacklister role.
     * @param rescuer The address of the rescuer role.
     * @param proofOfReserveAddress The address of the PoR feed.
     */
    function initialize(
        address defaultAdmin,
        uint48 defaultAdminDelay,
        address freezer,
        address supplyController,
        address upgrader,
        address blacklister,
        address rescuer,
        address proofOfReserveAddress
    ) external initializer {
        __ERC20_init("GoUSD", "GoUSD");
        __ERC20Pausable_init();
        __ERC20Permit_init("GoUSD");
        __UUPSUpgradeable_init();
        __AccessControlDefaultAdminRules_init(defaultAdminDelay, defaultAdmin);
        _grantRole(BLACKLISTER_ROLE, blacklister);
        _grantRole(FREEZER_ROLE, freezer);
        _grantRole(SUPPLY_CONTROLLER_ROLE, supplyController);
        _grantRole(UPGRADER_ROLE, upgrader);
        _grantRole(RESCUER_ROLE, rescuer);
        if (proofOfReserveAddress == address(0)) revert InvalidAddress();
        _getGoUSDStorage().proofOfReserveFeed = AggregatorV3Interface(proofOfReserveAddress);
        emit ProofOfReserveFeedSet(proofOfReserveAddress);
        _getGoUSDStorage().acceptableProofOfReserveTimeDelay = 24 hours;
        emit AcceptableProofOfReserveDelaySet(
            _getGoUSDStorage().acceptableProofOfReserveTimeDelay
        );
        _getGoUSDStorage().mintCapPerTransaction = 1000000 * (10 ** 6); // Default limit set to 1 million tokens
        emit MintCapPerTransactionSet(_getGoUSDStorage().mintCapPerTransaction);
    }

    /**
     * @dev Sets the proof of reserve feed address.
     * Requirements:
     * - Caller must have the `DEFAULT_ADMIN_ROLE` role.
     * @param newFeedAddress The address of the new proof of reserve feed.
     */
    function setProofOfReserveFeed(
        address newFeedAddress
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newFeedAddress == address(0)) revert InvalidAddress();

        // verify feed is not stale before updating the feed address
        AggregatorV3Interface newFeed = AggregatorV3Interface(newFeedAddress);
        validateProofOfReserve(newFeed, 0, false);

        _getGoUSDStorage().proofOfReserveFeed = newFeed;
        emit ProofOfReserveFeedSet(newFeedAddress);
    }

    /**
     * @dev Sets the time delay for the proof of reserve.
     * Requirements:
     * - Caller must have the `DEFAULT_ADMIN_ROLE` role.
     * @param newTimeDelay The new time delay for the proof of reserve.
     */
    function setAcceptableProofOfReserveTimeDelay(
        uint256 newTimeDelay
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newTimeDelay <= 0) revert InvalidTimeDelay();
        _getGoUSDStorage().acceptableProofOfReserveTimeDelay = newTimeDelay;
        emit AcceptableProofOfReserveDelaySet(newTimeDelay);
    }

    /**
     * @dev Sets the mint cap per transaction.
     * Requirements:
     * - Caller must have the `DEFAULT_ADMIN_ROLE` role.
     * @param newLimit The new maximum limit per transaction for mint.
     */
    function setMintCapPerTransaction(
        uint256 newLimit
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newLimit <= 0) revert InvalidAmount();
        _getGoUSDStorage().mintCapPerTransaction = newLimit;
        emit MintCapPerTransactionSet(newLimit);
    }

    /**
     * @dev Destroys blacklisted funds.
     * @param account The address of the account with blacklisted funds.
     */
    function destroyBlacklistedFunds(
        address account
    ) external onlyRole(SUPPLY_CONTROLLER_ROLE) {
        if (!isBlacklisted(account)) revert SenderNotBlacklisted();
        uint256 balance = balanceOf(account);
        _burn(account, balance);
        emit Burn(account, balance);
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
        if (amount <= 0) revert InvalidAmount();
        if (isBlacklisted(recipient)) revert RecipientBlacklisted();
        token.safeTransfer(recipient, amount);
        emit TokensRescued(address(token), recipient, amount);
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
        if (isBlacklisted(_msgSender())) revert SpenderBlacklisted();
        if (isBlacklisted(from)) revert SenderBlacklisted();
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
        if (isBlacklisted(_msgSender())) revert SenderBlacklisted();
        return super.transfer(to, value);
    }

    /**
     * @dev Mints new tokens and assigns them to an address.
     * @param to The address to which the new tokens will be minted.
     * @param amount The amount of tokens to be minted.
     */
    function mint(
        address to,
        uint256 amount
    ) external onlyRole(SUPPLY_CONTROLLER_ROLE) {
        if (isBlacklisted(to)) revert RecipientBlacklisted();
        if (amount > _getGoUSDStorage().mintCapPerTransaction) revert ExceedsMintTransactionCap();
        validateProofOfReserve(_getGoUSDStorage().proofOfReserveFeed, amount, false);
        _mint(to, amount);
        emit Mint(to, amount);
    }

    /**
     * @dev Mints new tokens and assigns them to a set of addresses.
     * @param toAddresses The addresses to which the new tokens will be minted.
     * @param amounts The amounts of tokens to be minted for each address.
     */
    function mintBatch(
        address[] memory toAddresses,
        uint256[] memory amounts
    ) external onlyRole(SUPPLY_CONTROLLER_ROLE) {
        if (toAddresses.length != amounts.length) revert ArrayLengthsMismatch();
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < toAddresses.length; i++) {
            if (amounts[i] > _getGoUSDStorage().mintCapPerTransaction) revert ExceedsMintTransactionCap();
            if (isBlacklisted(toAddresses[i])) revert RecipientBlacklisted();
            totalAmount += amounts[i];
            _mint(toAddresses[i], amounts[i]);
            emit Mint(toAddresses[i], amounts[i]);
        }
        validateProofOfReserve(_getGoUSDStorage().proofOfReserveFeed, totalAmount, true);
    }

    /**
     * @dev Burns tokens from `from` address. Action is restricted 
     * to the supply controller role.
     * @param from The address from which the tokens will be burned.
     * @param amount The amount of tokens to be burned.
     */
    function burn(
        address from,
        uint256 amount
    ) external onlyRole(SUPPLY_CONTROLLER_ROLE) {
        if (isBlacklisted(from)) revert SenderBlacklisted();
        _burn(from, amount);
        emit Burn(from, amount);
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
        return 6;
    }

    /**
     * @dev Retrieves the mint cap per transaction.
     * @return The mint cap per transaction.
     */
    function getMintCapPerTransaction() external view returns (uint256) {
        return _getGoUSDStorage().mintCapPerTransaction;
    }

    /**
     * @dev Retrieves the acceptable proofOfReserve time delay.
     * @return The acceptable proofOfReserve time delay.
     */
    function getAcceptableProofOfReserveTimeDelay() external view returns (uint256) {
        return _getGoUSDStorage().acceptableProofOfReserveTimeDelay;
    }

    /**
     * @dev Retrieves the address of the ProofOfReserveFeed contract.
     * @return The address of the ProofOfReserveFeed contract.
     */
    function getProofOfReserveFeed() external view returns (address) {
        return address(_getGoUSDStorage().proofOfReserveFeed);
    }

    /**
     * @dev Retrieves the latest reserve value from the proofOfReserveFeed.
     * @return reserve The latest reserve value as a uint256.
     * @return updatedAt The timestamp of the latest reserve value.
     * @return decimalPrecision The number of decimals used by the feed.
     */
    function getLatestReserve()
        public
        view
        returns (uint256 reserve, uint256 updatedAt, uint8 decimalPrecision)
    {
        (reserve, updatedAt, decimalPrecision) = getLatestReserveFromFeed(_getGoUSDStorage().proofOfReserveFeed);
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

    /**
     * @dev Validates the proof of reserve.
     * @param feed The address of the proofOfReserveFeed contract.
     * @param mintAmount The amount of tokens to be minted.
     * @param isBatch A boolean indicating whether the mint is a batch mint or not.
     */
    function validateProofOfReserve(
        AggregatorV3Interface feed,
        uint256 mintAmount,
        bool isBatch
    ) internal view {
        (uint256 reserves, uint256 reserveUpdateAt, uint8 reserveDecimals) = getLatestReserveFromFeed(
            feed
        );

        if (reserves <= 0) revert InvalidPoRData();
        if (
            block.timestamp >
            (reserveUpdateAt +
                _getGoUSDStorage().acceptableProofOfReserveTimeDelay)
        ) revert PoROutdated();
    
        // Normalize reserves in case the number 
        // of decimals reported by the feed is
        // different than the token's decimals
        uint256 currentSupply = totalSupply();
        uint8 trueDecimals = decimals();
        if (reserveDecimals < trueDecimals || reserveDecimals > 18) revert InvalidDecimals();
        if (trueDecimals < reserveDecimals) {
            reserves /= 10**uint256(reserveDecimals - trueDecimals);
        }
        // For batched minting, the mint operation is performed before validation.
        // As a result, the minted amount is already included in `totalSupply` at this point.
        // Therefore, in batch mode (`isBatch`), we only need to verify that `totalSupply`
        // does not exceed the available `reserves`.
        // In non-batch mode, the `mintAmount` is not yet included in `totalSupply`,
        // so we need to ensure that `totalSupply + mintAmount` stays within `reserves`.
        if (isBatch ? currentSupply > reserves : (currentSupply + mintAmount) > reserves) {
            revert SupplyExceedsReserves();
        }
    }

    /**
     * @dev Retrieves the latest reserve value from the specified proofOfReserveFeed.
     * @param feed The address of the proofOfReserveFeed contract.
     * @return reserve The latest reserve value as a uint256.
     * @return updatedAt The timestamp of the latest reserve value.
     * @return feedDecimals The number of decimals used by the feed.
     */
    function getLatestReserveFromFeed(
        AggregatorV3Interface feed
    ) internal view returns (uint256 reserve, uint256 updatedAt, uint8 feedDecimals) {
        int256 reserveFunds;
        (
            /* uint80 roundID */,
            reserveFunds,
            /* uint256 startedAt */,
            updatedAt,
            /* uint80 answeredInRound */
        ) = feed.latestRoundData();

        // check to prevent unsafe casting
        if (reserveFunds < 0) {
            revert AmountOverflowed();
        }

        reserve = uint256(reserveFunds);
        feedDecimals = feed.decimals();
        return (reserve, updatedAt, feedDecimals);
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
        // This will trigger the ERC20PausableUpgradeable._update
        // enforcing the pausable feature and then
        // will trigger the Blacklistable._update
        // since ERC20PausableUpgradeable is inherited after Blacklistable
        // This won't trigger the ERC20Upgradeable._update
        // since we are not calling super._update in Blacklistable._update
        ERC20PausableUpgradeable._update(from, to, value);
    }

    /**
     * @dev Fetches the namespaced storage structure for the GoUSD contract.
     * This function uses EIP-7201-style namespaced storage to ensure compatibility
     * and extensibility for upgradeable contracts.
     * @return $ The `GoUSDStorage` struct containing storage variables specific to the GoUSD contract.
     */
    function _getGoUSDStorage() private pure returns (GoUSDStorage storage $) {
        assembly {
            $.slot := GoUSDStorageLocation
        }
    }
}
