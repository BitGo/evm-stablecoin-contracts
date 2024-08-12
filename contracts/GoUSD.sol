// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ERC20PausableUpgradeable} from "./openzeppelin/ERC20PausableUpgradeable.sol";
import {ERC20PermitUpgradeable} from "./openzeppelin/ERC20PermitUpgradeable.sol";
import "./Blacklistable.sol";

/// @custom:security-contact support@bitgo.com
contract GoUSD is Initializable, Blacklistable, ERC20PausableUpgradeable, ERC20PermitUpgradeable, UUPSUpgradeable {
    bytes32 public constant FREEZER_ROLE = keccak256("FREEZER_ROLE");
    bytes32 public constant SUPPLY_CONTROLLER_ROLE = keccak256("SUPPLY_CONTROLLER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant BLACKLISTER_ROLE = keccak256("BLACKLISTER_ROLE");
    mapping(address => bool) public reserveAddresses;

    event ReserveAddressAdded(address indexed newAddress);
    event ReserveAddressRemoved(address indexed oldAddress);
    event Mint(address indexed to, uint256 amount);
    event Burn(address indexed from, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address defaultAdmin,
        address freezer,
        address supplyController,
        address upgrader,
        address blacklister,
        address[] memory _reserveAddresses
    ) public initializer {
        __ERC20_init("GoUSD", "GOUSD");
        __ERC20Pausable_init();
        __AccessControl_init();
        __ERC20Permit_init("GoUSD");
        __UUPSUpgradeable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(FREEZER_ROLE, freezer);
        _grantRole(SUPPLY_CONTROLLER_ROLE, supplyController);
        _grantRole(UPGRADER_ROLE, upgrader);
        _grantRole(BLACKLISTER_ROLE, blacklister);
        for (uint256 i = 0; i < _reserveAddresses.length; i++) {
            reserveAddresses[_reserveAddresses[i]] = true;
            emit ReserveAddressAdded(_reserveAddresses[i]);
        }
    }

    function decimals() public view virtual override(InternalERC20Upgradeable) returns (uint8) {
        return 6;
    }

    function pause() public onlyRole(FREEZER_ROLE) {
        _pause();
    }

    function unpause() public onlyRole(FREEZER_ROLE) {
        _unpause();
    }

    function addReserveAddress(address newAddress) public onlyRole(DEFAULT_ADMIN_ROLE) {
        reserveAddresses[newAddress] = true;
        emit ReserveAddressAdded(newAddress);
    }

    function removeReserveAddress(address oldAddress) public onlyRole(DEFAULT_ADMIN_ROLE) {
        reserveAddresses[oldAddress] = false;
        emit ReserveAddressRemoved(oldAddress);
    }

    function isReserveAddress(address account) public view returns (bool) {
        return reserveAddresses[account];
    }

    function mint(address to, uint256 amount) public onlyRole(SUPPLY_CONTROLLER_ROLE) {
        require(reserveAddresses[to], "Address is not a reserve address");
        _mint(to, amount);
        emit Mint(to, amount);
    }

    function burn(address from, uint256 amount) public onlyRole(SUPPLY_CONTROLLER_ROLE) {
        require(reserveAddresses[from], "Address is not a reserve address");
        _burn(from, amount);
        emit Burn(from, amount);
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        onlyRole(UPGRADER_ROLE)
        override
    {}

    // The following functions are overrides required by Solidity.

    function _update(address from, address to, uint256 value)
        internal
        override(Blacklistable, InternalERC20Upgradeable, ERC20PausableUpgradeable) {
        ERC20PausableUpgradeable._update(from, to, value);
    }

    function balanceOf(address account) public view virtual override(Blacklistable, InternalERC20Upgradeable) returns (uint256) {
        return Blacklistable.balanceOf(account);
    }
}
