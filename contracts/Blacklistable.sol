// SPDX-License-Identifier: Apache-2.0
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlDefaultAdminRulesUpgradeable.sol";

/**
 * @title Blacklistable
 * @dev Contract that allows blacklisting of accounts.
 *  We are using the last bit of the balance to store the blacklist state.
 */
contract Blacklistable is
    AccessControlDefaultAdminRulesUpgradeable,
    ERC20Upgradeable
{
    mapping(address => bool) private _blacklist;
    mapping(address => uint256) private _balances;

    event Blacklisted(address indexed account);
    event Unblacklisted(address indexed account);

    // keccak256(abi.encode(uint256(keccak256("openzeppelin.storage.ERC20")) - 1)) & ~bytes32(uint256(0xff))
    // From OpenZeppelin Contracts
    bytes32 private constant ERC20StorageLocation =
        0x52c63247e1f47db19d5ce0460030c497f067ca4cebf71ba98eeadabe20bace00;

    /**
     * @dev Checks if an account is blacklisted.
     * @param account The address to check.
     * @return A boolean indicating whether the account is blacklisted or not.
     */
    function isBlacklisted(address account) public view returns (bool) {
        return _blacklist[account];
    }

    /**
     * @dev Blacklists an account.
     * @param account The address to blacklist.
     */
    function blacklist(
        address account
    ) public onlyRole(keccak256("BLACKLISTER_ROLE")) {
        require(!_blacklist[account], "Account is already blacklisted");
        _blacklist[account] = true;
        emit Blacklisted(account);
    }

    /**
     * @dev Unblacklists an account.
     * @param account The address to unblacklist.
     */
    function unblacklist(
        address account
    ) public onlyRole(keccak256("BLACKLISTER_ROLE")) {
        require(_blacklist[account], "Account is not blacklisted");
        _blacklist[account] = false;
        emit Unblacklisted(account);
    }

    /**
     * @dev Fetches the balance of an account.
     * @param account The address to fetch the balance for.
     * @return The balance of the account.
     */
    function balanceOf(
        address account
    ) public view virtual override returns (uint256) {
        return _balances[account];
    }

    /**
     * @dev Updates the balances and total supply when a transfer occurs.
     * @param from The address to transfer from.
     * @param to The address to transfer to.
     * @param value The amount to transfer.
     */
    function _update(
        address from,
        address to,
        uint256 value
    ) internal virtual override {
        if (from != address(0)) {
            // require(!_blacklist[from], "Transfer from blacklisted address");
            uint256 fromBalance = balanceOf(from);
            require(fromBalance >= value, "Insufficient balance");
            _balances[from] -= value;
        } else {
            ERC20Storage storage $ = getERC20Storage();
            $._totalSupply += value; // Minting tokens
        }

        if (to != address(0)) {
            // require(!_blacklist[to], "Transfer to blacklisted address");
            _balances[to] += value;
        } else {
            ERC20Storage storage $ = getERC20Storage();
            $._totalSupply -= value; // Burning tokens
        }

        emit Transfer(from, to, value);
    }

    /**
     * @dev Retrieves the storage location of the ERC20 contract.
     * @return $ The storage location of the ERC20 contract.
     */
    function getERC20Storage() private pure returns (ERC20Storage storage $) {
        assembly {
            $.slot := ERC20StorageLocation
        }
    }
}
