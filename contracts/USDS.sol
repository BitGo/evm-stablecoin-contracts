// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

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

    uint256 public acceptableProofOfReserveTimeDelay;

    event Burn(address indexed from, uint256 amount);
    event Mint(address indexed to, uint256 amount);
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
     */
    function initialize(
        address defaultAdmin,
        address freezer,
        address supplyController,
        address upgrader,
        address blacklister,
        address rescuer,
        address proofOfReserveAddress
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
        require(
            proofOfReserveAddress != address(0),
            "Cannot add zero address as a proof of reserve feed"
        );
        proofOfReserveFeed = AggregatorV3Interface(proofOfReserveAddress);
        emit ProofOfReserveFeedSet(proofOfReserveAddress);
        acceptableProofOfReserveTimeDelay = 3 hours;
        emit AcceptableProofOfReserveDelaySet(
            acceptableProofOfReserveTimeDelay
        );
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
        require(
            newFeedAddress != address(0),
            "Cannot add zero address as a proof of reserve feed"
        );
        proofOfReserveFeed = AggregatorV3Interface(newFeedAddress);
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
     * @dev Destroys blacklisted funds.
     * @param account The address of the account with blacklisted funds.
     */
    function destroyBlacklistedFunds(
        address account
    ) external onlyRole(SUPPLY_CONTROLLER_ROLE) {
        // This will ensure that the function cannot be called again while the flag is active.
        require(!_skipBlacklistCheck, "Reentrant call detected");

        _skipBlacklistCheck = true; // Temporarily skip blacklist validation

        uint256 balance = balanceOf(account);
        burn(account, balance);

        _skipBlacklistCheck = false; // Reset flag
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
    ) public virtual override returns (bool) {
        address spender = _msgSender();
        require(value != 0, "Transfer amount must be greater than zero");
        _spendAllowance(from, spender, value);
        _transfer(from, to, value);
        return true;
    }

    /**
     * @dev Transfers tokens from the caller's account to another account.
     * @param to The address to transfer tokens to.
     * @param value The amount of tokens to transfer.
     * @return A boolean value indicating whether the transfer was successful or not.
     */
    function transfer(
        address to,
        uint256 value
    ) public virtual override returns (bool) {
        address owner = _msgSender();
        _transfer(owner, to, value);
        return true;
    }

    /**
     * @dev Mints new tokens and assigns them to an address.
     * @param to The address to which the new tokens will be minted.
     * @param amount The amount of tokens to be minted.
     */
    function mint(
        address to,
        uint256 amount
    ) public onlyRole(SUPPLY_CONTROLLER_ROLE) {
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
    ) public onlyRole(SUPPLY_CONTROLLER_ROLE) {
        require(
            toAddresses.length == amounts.length,
            "Address array and amount array length must match"
        );
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < toAddresses.length; i++) {
            address to = toAddresses[i];
            uint256 amount = amounts[i];
            totalAmount += amount;

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
    ) public onlyRole(SUPPLY_CONTROLLER_ROLE) {
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
            ,
            /* uint80 roundID */ int reserveFunds,
            ,
            /* uint startedAt */ uint roundTimeStamp /* uint80 answeredInRound */,

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
    function validateProofOfReserve(
        uint256 mintAmount,
        bool isBatch
    ) internal view {
        (uint256 reserves, uint256 reserveUpdateAt) = getLatestReserve();

        require(reserves > 0, "Invalid data from PoR feed");
        require(
            block.timestamp <=
                reserveUpdateAt + acceptableProofOfReserveTimeDelay,
            "Proof of reserve is out of date"
        );
        // For batching, we did the mints before validations
        // So we only need to check if the total supply is less than or equal to reserves
        require(
            isBatch
                ? totalSupply() <= reserves
                : totalSupply() + mintAmount <= reserves,
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
