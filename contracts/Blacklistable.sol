// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
// Inspired by USDC v2.2
pragma solidity ^0.8.20;

import "./openzeppelin/InternalERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlDefaultAdminRulesUpgradeable.sol";

/**
 * @title Blacklistable
 * @dev Contract that allows blacklisting of accounts.
 */
contract Blacklistable is
    AccessControlDefaultAdminRulesUpgradeable,
    InternalERC20Upgradeable
{
    event Blacklisted(address indexed account);
    event Unblacklisted(address indexed account);

    /**
     * @dev Checks if an account is blacklisted.
     * @param account The address to check.
     * @return A boolean indicating whether the account is blacklisted or not.
     */
    function isBlacklisted(address account) public view returns (bool) {
        ERC20Storage storage $ = _getERC20Storage();
        return ($._balances[account] >> 255) == 1;
    }

    /**
     * @dev Sets the blacklist state of an account.
     * @param account The address to set the blacklist state for.
     * @param state The blacklist state to set.
     */
    function _setBlacklistState(address account, bool state) internal {
        ERC20Storage storage $ = _getERC20Storage();
        if (state) {
            $._balances[account] = $._balances[account] | (1 << 255);
            emit Blacklisted(account);
        } else {
            $._balances[account] = $._balances[account] & ((1 << 255) - 1);
            emit Unblacklisted(account);
        }
    }

    /**
     * @dev Blacklists an account.
     * @param account The address to blacklist.
     */
    function blacklist(address account) public onlyRole(keccak256("BLACKLISTER_ROLE")) {
        _setBlacklistState(account, true);
    }

    /**
     * @dev Unblacklists an account.
     * @param account The address to unblacklist.
     */
    function unblacklist(address account) public onlyRole(keccak256("BLACKLISTER_ROLE")) {
        _setBlacklistState(account, false);
    }

    /**
     * @dev Fetches the balance of an account.
     * @param account The address to fetch the balance for.
     * @return The balance of the account.
     */
    function balanceOf(address account) public view virtual override returns (uint256) {
        ERC20Storage storage $ = _getERC20Storage();
        return $._balances[account] & ((1 << 255) - 1);
    }

    /**
     * @dev Updates the balances and total supply when a transfer occurs.
     * @param from The address to transfer from.
     * @param to The address to transfer to.
     * @param value The amount to transfer.
     */
    function _update(address from, address to, uint256 value) internal virtual override {
        // Check if the sender is blacklisted, unless it's a minting operation (from == address(0))
        require(
            from == address(0) || !isBlacklisted(from),
            "ERC20: sender is blacklisted"
        );

        ERC20Storage storage $ = _getERC20Storage();
        if (from == address(0)) {
            // Overflow check required: The rest of the code assumes that totalSupply never overflows
            $._totalSupply += value;
        } else {
            uint256 fromBalance = $._balances[from] & ((1 << 255) - 1);
            if (fromBalance < value) {
                revert ERC20InsufficientBalance(from, fromBalance, value);
            }
            unchecked {
                // Overflow not possible: value <= fromBalance <= totalSupply.
                $._balances[from] =
                    (fromBalance - value) |
                    ($._balances[from] & (1 << 255));
            }
        }

        if (to == address(0)) {
            unchecked {
                // Overflow not possible: value <= totalSupply or value <= fromBalance <= totalSupply.
                $._totalSupply -= value;
            }
        } else {
            unchecked {
                // Overflow not possible: balance + value is at most totalSupply, which we know fits into a uint256.
                $._balances[to] += value;
            }
        }

        emit Transfer(from, to, value);
    }
}
