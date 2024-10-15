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
    event Blacklisted(address indexed account);
    event Unblacklisted(address indexed account);
    mapping(address => bool) public blacklisted;

    /**
     * @dev Checks if an account is blacklisted.
     * @param account The address to check.
     * @return A boolean indicating whether the account is blacklisted or not.
     */
    function isBlacklisted(address account) public view returns (bool) {
        return blacklisted[account];
    }

    /**
     * @dev Blacklists an account.
     * @param account The address to blacklist.
     */
    function blacklist(
        address account
    ) public onlyRole(keccak256("BLACKLISTER_ROLE")) {
        _setBlacklistState(account, true);
    }

    /**
     * @dev Unblacklists an account.
     * @param account The address to unblacklist.
     */
    function unblacklist(
        address account
    ) public onlyRole(keccak256("BLACKLISTER_ROLE")) {
        _setBlacklistState(account, false);
    }

    /**
     * @dev Sets the blacklist state of an account.
     * @param account The address to set the blacklist state for.
     * @param state The blacklist state to set.
     */
    function _setBlacklistState(address account, bool state) internal {
        if (blacklisted[account] != state) {
            blacklisted[account] = state;
            if (state) {
                emit Blacklisted(account);
            } else {
                emit Unblacklisted(account);
            }
        }
    }
}
