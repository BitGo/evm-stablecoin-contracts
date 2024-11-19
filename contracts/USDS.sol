// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "hardhat/console.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import { ERC20PausableUpgradeable } 
        from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import { ERC20PermitUpgradeable } 
        from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "./Blacklistable.sol";


/// @title Official USDS ERC-20 Implementation
/// @custom:security-contact support@bitgo.com
contract USDS is
    Initializable,
    Blacklistable,
    ERC20PausableUpgradeable,
    ERC20PermitUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    AggregatorV3Interface private proofOfReserveFeed;

    bytes32 public constant BLACKLISTER_ROLE = keccak256("BLACKLISTER_ROLE");
    bytes32 public constant FREEZER_ROLE = keccak256("FREEZER_ROLE");
    bytes32 public constant SUPPLY_CONTROLLER_ROLE =
        keccak256("SUPPLY_CONTROLLER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant RESCUER_ROLE = keccak256("RESCUER_ROLE");

    mapping(address => bool) public reserveAddresses;
    mapping(address => bool) public trustedTokens;

    uint256 public acceptableProofOfReserveTimeDelay;

    event Burn(address indexed from, uint256 amount);
    event Mint(address indexed to, uint256 amount);
    event ReserveAddressAdded(address indexed newAddress);
    event ReserveAddressRemoved(address indexed oldAddress);
    event TrustedTokenAdded(address indexed newTokenAddress);
    event TrustedTokenRemoved(address indexed oldTokenAddress);
    event ProofOfReserveFeedSet(address newFeed);
    event AcceptableProofOfReserveDelaySet(uint256 newTimeDelay);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initializes the USDS contract.
     * @param defaultAdmin The address of the default admin.
     * @param freezer The address of the freezer role.
     * @param supplyController The address of the supply controller role.
     * @param upgrader The address of the upgrader role.
     * @param blacklister The address of the blacklister role.
     * @param rescuer The address of the rescuer role.
     * @param proofOfReserveAddress The address of the PoR feed.
     * @param _reserveAddresses An array of reserve addresses.
     */
    function initialize(
        address defaultAdmin,
        address freezer,
        address supplyController,
        address upgrader,
        address blacklister,
        address rescuer,
        address proofOfReserveAddress,
        address[] memory _reserveAddresses
    ) public initializer {
        __ERC20_init("USDS", "USDS");
        __ERC20Pausable_init();
        __AccessControl_init();
        __ERC20Permit_init("USDS");
        __UUPSUpgradeable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(BLACKLISTER_ROLE, blacklister);
        _grantRole(FREEZER_ROLE, freezer);
        _grantRole(SUPPLY_CONTROLLER_ROLE, supplyController);
        _grantRole(UPGRADER_ROLE, upgrader);
        _grantRole(RESCUER_ROLE, rescuer);
        for (uint256 i = 0; i < _reserveAddresses.length; i++) {
            require(_reserveAddresses[i] != address(0), "Cannot add zero address as a reserve address");
            reserveAddresses[_reserveAddresses[i]] = true;
            emit ReserveAddressAdded(_reserveAddresses[i]);
        }
        require(proofOfReserveAddress != address(0), "Cannot add zero address as a proof of reserve feed");
        proofOfReserveFeed = AggregatorV3Interface(proofOfReserveAddress);
        emit ProofOfReserveFeedSet(proofOfReserveAddress);
        acceptableProofOfReserveTimeDelay = 3 hours;
        emit AcceptableProofOfReserveDelaySet(acceptableProofOfReserveTimeDelay);
    }

    /**
     * @dev Sets the proof of reserve feed address.
     * Requirements:
     * - Caller must have the `DEFAULT_ADMIN_ROLE` role.
     * - The new feed address must implement the AggregatorV3Interface.
     * @param newFeedAddress The address of the new proof of reserve feed.
     */
    function setProofOfReserveFeed(
        address newFeedAddress
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newFeedAddress != address(0), "Cannot add zero address as a proof of reserve feed");

        // ERC165 check to ensure the new feed implements AggregatorV3Interface
        // require(IERC165(newFeedAddress).supportsInterface(type(AggregatorV3Interface).interfaceId), "New feed must implement AggregatorV3Interface");

        AggregatorV3Interface newFeed = AggregatorV3Interface(newFeedAddress);

        // Check if the feed is stale by calling a method to fetch the latest data
        (
            /* uint80 roundID */,
            int256 reserveFunds,
            /* uint startedAt */,
            uint256 roundTimeStamp,
            /* uint80 answeredInRound */
        ) = newFeed.latestRoundData();
        
        require(reserveFunds > 0, "Stale feed data or invalid feed");
        require(roundTimeStamp > block.timestamp - acceptableProofOfReserveTimeDelay, "Feed data is stale");

        proofOfReserveFeed = newFeed;
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
        require(newTimeDelay > 0, "Time delay must be greater than zero");
        acceptableProofOfReserveTimeDelay = newTimeDelay;
        emit AcceptableProofOfReserveDelaySet(newTimeDelay);
    }

    /**
     * @dev Adds a reserve address.
     * @param newAddress The address to be added as a reserve address.
     */
    function addReserveAddress(
        address newAddress
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newAddress != address(0), "Cannot add zero address as a reserve address");

        // Check if the address is already a reserve address
        if (!reserveAddresses[newAddress]) {
            reserveAddresses[newAddress] = true;
            emit ReserveAddressAdded(newAddress);
        }
    }

    /**
     * @dev Removes a reserve address.
     * @param oldAddress The address to be removed from the reserve addresses.
     */
    function removeReserveAddress(
        address oldAddress
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        reserveAddresses[oldAddress] = false;
        emit ReserveAddressRemoved(oldAddress);
    }

    /**
     * @dev Destroys blacklisted funds.
     * @param account The address of the account with blacklisted funds.
     */
    function destroyBlacklistedFunds(
        address account
    ) external onlyRole(SUPPLY_CONTROLLER_ROLE) {
        require(isBlacklisted(account), "Address is not blacklisted");
        uint256 balance = balanceOf(account);
        _burn(account, balance);
        emit Burn(account, balance);
    }

    /**
     * @dev Add tokens to the trusted list.
     * Requirements:
     * - Caller must have the `DEFAULT_ADMIN_ROLE` role.
     * @param token The address of the token to be added to the trusted list.
     */
    function addTrustedToken(address token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(token != address(0), "Cannot add zero address token as a trusted token address");
        trustedTokens[token] = true;
        emit TrustedTokenAdded(token);
    }

    /**
     * @dev Checks if a token is a trusted token address.
     * @param token The token to be checked.
     * @return A boolean indicating whether the token is a trusted token or not.
     */
    function isTrustedToken(address token) public view returns (bool) {
        return trustedTokens[token];
    }

    /**
     * @dev Remove tokens to the trusted list.
     * Requirements:
     * - Caller must have the `DEFAULT_ADMIN_ROLE` role.
     * @param token The address of the token to be removed from the trusted list.
     */
    function removeTrustedToken(address token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(token != address(0), "Cannot remove zero address token as a trusted token address");
        trustedTokens[token] = false;
        emit TrustedTokenRemoved(token);
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
        require(trustedTokens[address(token)], "Token is not trusted");
        require(!isBlacklisted(recipient), "Recipient is blacklisted");
        token.safeTransfer(recipient, amount);
    }

    /**
     * @dev Pauses all token transfers.
     */
    function pause() public onlyRole(FREEZER_ROLE) {
        _pause();
    }

    /**
     * @dev Unpauses all token transfers.
     */
    function unpause() public onlyRole(FREEZER_ROLE) {
        _unpause();
    }


    /**
     * @dev Transfers `amount` tokens from `sender` to `recipient` using the allowance mechanism.
     * `amount` is then deducted from the caller's allowance.
     * @param from The address to transfer tokens from.
     * @param to The address to transfer tokens to.
     * @param value The amount of tokens to transfer.
     * Emits a {Transfer} event.
     */

    function transferFrom(
        address from,
        address to,
        uint256 value
    ) public virtual override whenNotPaused returns (bool) {
        address spender = _msgSender();
        require(
            !isBlacklisted(spender),
            "Spender address is blacklisted"
        );
        require(
            !isBlacklisted(from),
            "Sender address is blacklisted"
        );
        // require(
        //     !isBlacklisted(to), 
        //     "Recipient address is blacklisted"
        // );
        require(
            value != 0,
            "Transfer amount must be greater than zero"
        );
        _spendAllowance(from, spender, value);
        _transfer(from, to, value);
        return true;
    }

    /**
     * @dev Transfers tokens from the caller's account to another account.
     * Zero-value transfers are permitted to align with the ERC-20 standard
     * and to trigger certain event logs or off-chain workflows without transferring tokens.
     * @param to The address to transfer tokens to.
     * @param value The amount of tokens to transfer.
     * @return A boolean value indicating whether the transfer was successful or not.
     */
    function transfer(
        address to,
        uint256 value
    ) public virtual override whenNotPaused returns (bool) {
        address owner = _msgSender();
        require(
            !isBlacklisted(owner),
            "Sender address is blacklisted"
        );
        // require(
        //     !isBlacklisted(to), 
        //     "Recipient address is blacklisted"
        // );
        _transfer(owner, to, value);
        return true;
    }

    /**
     * @dev Mints new tokens and assigns them to an address.
     * Zero-value minting is permitted to ensure compatibility with off-chain workflows or systems 
     * where the action of minting might need to be logged or executed without an actual token amount.
     * This flexibility avoids unnecessary reverts in cases where the minting operation is 
     * initiated programmatically or for testing purposes.
     * @param to The address to which the new tokens will be minted.
     * @param amount The amount of tokens to be minted.
     */
    function mint(
        address to,
        uint256 amount
    ) public onlyRole(SUPPLY_CONTROLLER_ROLE) whenNotPaused {
        require(!isBlacklisted(to), "Minting failed: recipient address is blacklisted");
        validateProofOfReserve(amount, false);
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
    ) public onlyRole(SUPPLY_CONTROLLER_ROLE) whenNotPaused {
        require(toAddresses.length == amounts.length, "Address array and amount array length must match");
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < toAddresses.length; i++) {
            address to = toAddresses[i];
            uint256 amount = amounts[i];
            totalAmount += amount;

            require(!isBlacklisted(to), "Minting failed: recipient address is blacklisted");

            _mint(to, amount);
            emit Mint(to, amount);
        }
        validateProofOfReserve(totalAmount, true);
    }

    /**
     * @dev Burns tokens from the reserve address.
     * @param from The address from which the tokens will be burned.
     * @param amount The amount of tokens to be burned.
     */
    function burn(
        address from,
        uint256 amount
    ) public onlyRole(SUPPLY_CONTROLLER_ROLE) whenNotPaused {
        require(!isBlacklisted(from), "Burn not allowed from blacklisted address");
        require(reserveAddresses[from], "Burn only allowed from a reserve address");
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
     * @dev Checks if an address is a reserve address.
     * @param account The address to be checked.
     * @return A boolean indicating whether the address is a reserve address or not.
     */
    function isReserveAddress(address account) public view returns (bool) {
        return reserveAddresses[account];
    }

    /**
     * @dev Retrieves the address of the ProofOfReserveFeed contract.
     * @return The address of the ProofOfReserveFeed contract.
     */
    function getProofOfReserveFeed() public view returns (address) {
        return address(proofOfReserveFeed);
    }

    /**
     * @dev Retrieves the latest reserve value from the proofOfReserveFeed.
     * @return reserve The latest reserve value as a uint256.
     * @return updatedAt The timestamp of the latest reserve value.
     */
    function getLatestReserve()
        public
        view
        returns (uint256 reserve, uint256 updatedAt)
    {
        (
            /* uint80 roundID */,
            int reserveFunds,
            /* uint startedAt */,
            uint roundTimeStamp,
            /* uint80 answeredInRound */
        ) = proofOfReserveFeed.latestRoundData();

        reserve = uint256(reserveFunds);
        updatedAt = roundTimeStamp;
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
     * @param mintAmount The amount of tokens to be minted.
     * @param isBatch A boolean indicating whether the mint is a batch mint or not.
     */
    function validateProofOfReserve(uint256 mintAmount, bool isBatch) internal view {
        (uint256 reserves, uint256 reserveUpdateAt) = getLatestReserve();

        require(reserves > 0, "Invalid data from PoR feed");
        require(
            block.timestamp <= reserveUpdateAt + acceptableProofOfReserveTimeDelay,
            "Proof of reserve is out of date"
        );
        // For batching, we did the mints before validations
        // So we only need to check if the total supply is less than or equal to reserves
        require(
            isBatch ? totalSupply() <= reserves : totalSupply() + mintAmount <= reserves,
            "Total supply + requested mint amount exceeds available reserves"
        );
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
}
