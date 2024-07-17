// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @custom:security-contact support@bitgo.com
contract GoUSD is Initializable, ERC20Upgradeable, ERC20PausableUpgradeable, AccessControlUpgradeable, ERC20PermitUpgradeable, UUPSUpgradeable {
    bytes32 public constant FREEZER_ROLE = keccak256("FREEZER_ROLE");
    bytes32 public constant SUPPLY_CONTROLLER_ROLE = keccak256("SUPPLY_CONTROLLER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    address public reserveAddress;

    event ReserveAddressChanged(address indexed oldAddress, address indexed newAddress);
    event Mint(address indexed to, uint256 amount);
    event Burn(address indexed from, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address defaultAdmin, address freezer, address supplyController, address upgrader, address _reserveAddress) public initializer {
        __ERC20_init("GoUSD", "GOUSD");
        __ERC20Pausable_init();
        __AccessControl_init();
        __ERC20Permit_init("GoUSD");
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(FREEZER_ROLE, freezer);
        _grantRole(SUPPLY_CONTROLLER_ROLE, supplyController);
        _grantRole(UPGRADER_ROLE, upgrader);
        reserveAddress = _reserveAddress;
    }

    function decimals() public view virtual override returns (uint8) {
        return 6;
    }

    function pause() public onlyRole(FREEZER_ROLE) {
        _pause();
    }

    function unpause() public onlyRole(FREEZER_ROLE) {
        _unpause();
    }

    function setReserveAddress(address _newAddress) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_newAddress != address(0), "Invalid reserve address");
        emit ReserveAddressChanged(reserveAddress, _newAddress);
        reserveAddress = _newAddress;
    }

    function mint(uint256 amount) public onlyRole(SUPPLY_CONTROLLER_ROLE) {
        _mint(reserveAddress, amount);
        emit Mint(reserveAddress, amount);
    }

    function burn(uint256 amount) public onlyRole(SUPPLY_CONTROLLER_ROLE) {
        _burn(reserveAddress, amount);
        emit Burn(reserveAddress, amount);
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        onlyRole(UPGRADER_ROLE)
        override
    {}

    // The following functions are overrides required by Solidity.

    function _update(address from, address to, uint256 value)
        internal
        override(ERC20Upgradeable, ERC20PausableUpgradeable)
    {
        super._update(from, to, value);
    }
}
