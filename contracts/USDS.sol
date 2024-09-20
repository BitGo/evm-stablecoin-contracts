// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ERC20PausableUpgradeable} from 
    "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import {ERC20PermitUpgradeable} from 
    "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "./Blacklistable.sol";

/// @title Offcial USDS ERC-20 Implementation
/// @custom:security-contact support@bitgo.com
contract USDS is
    Initializable,
    Blacklistable,
    ERC20PausableUpgradeable,
    ERC20PermitUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    bytes32 public constant BLACKLISTER_ROLE = keccak256("BLACKLISTER_ROLE");
    bytes32 public constant FREEZER_ROLE = keccak256("FREEZER_ROLE");
    bytes32 public constant SUPPLY_CONTROLLER_ROLE =
        keccak256("SUPPLY_CONTROLLER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant RESCUER_ROLE = keccak256("RESCUER_ROLE");

    mapping(address => bool) public reserveAddresses;

    event ReserveAddressAdded(address indexed newAddress);
    event ReserveAddressRemoved(address indexed oldAddress);
    event Mint(address indexed to, uint256 amount);
    event Burn(address indexed from, uint256 amount);

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
     * @param resuer The address of the resuer role.
     * @param _reserveAddresses An array of reserve addresses.
     */
    function initialize(
        address defaultAdmin,
        address freezer,
        address supplyController,
        address upgrader,
        address blacklister,
        address resuer,
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
        _grantRole(RESCUER_ROLE, resuer);
        for (uint256 i = 0; i < _reserveAddresses.length; i++) {
            reserveAddresses[_reserveAddresses[i]] = true;
            emit ReserveAddressAdded(_reserveAddresses[i]);
        }
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
     * @dev Adds a reserve address.
     * @param newAddress The address to be added as a reserve address.
     */
    function addReserveAddress(
        address newAddress
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        reserveAddresses[newAddress] = true;
        emit ReserveAddressAdded(newAddress);
    }

    /**
     * @dev Removes a reserve address.
     * @param oldAddress The address to be removed from the reserve addresses.
     */
    function removeReserveAddress(
        address oldAddress
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        reserveAddresses[oldAddress] = false;
        emit ReserveAddressRemoved(oldAddress);
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
        require(
            !isBlacklisted(from),
            "Address to transfer from is blacklisted"
        );
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
        require(
            !isBlacklisted(owner),
            "Address to transfer from is blacklisted"
        );
        _transfer(owner, to, value);
        return true;
    }

    /**
     * @dev Mints new tokens and assigns them to a reserve address.
     * @param to The address to which the new tokens will be minted.
     * @param amount The amount of tokens to be minted.
     */
    function mint(
        address to,
        uint256 amount
    ) public onlyRole(SUPPLY_CONTROLLER_ROLE) {
        require(!isBlacklisted(to), "Address to mint is blacklisted");
        _mint(to, amount);
        emit Mint(to, amount);
    }

    /**
     * @dev Burns tokens from the recserve address.
     * @param from The address from which the tokens will be burned.
     * @param amount The amount of tokens to be burned.
     */
    function burn(
        address from,
        uint256 amount
    ) public onlyRole(SUPPLY_CONTROLLER_ROLE) {
        require(!isBlacklisted(from), "Address to burn is blacklisted");
        require(reserveAddresses[from], "Address is not a reserve address");
        _burn(from, amount);
        emit Burn(from, amount);
    }

    /**
     * @dev Destroys blacklisted funds.
     * @param account The address of the account with blacklisted funds.
     */
    function destroyBlacklistedFunds(
        address account
    ) public onlyRole(BLACKLISTER_ROLE) {
        require(isBlacklisted(account), "Address is not blacklisted");
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
    ) public onlyRole(RESCUER_ROLE) {
        require(!isBlacklisted(recipient), "Recipient is blacklisted");
        token.safeTransfer(recipient, amount);
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
}
