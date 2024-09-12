// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
// Inspired by USDC v2.2
pragma solidity ^0.8.20;

import "./openzeppelin/InternalERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlDefaultAdminRulesUpgradeable.sol";

contract Blacklistable is
    AccessControlDefaultAdminRulesUpgradeable,
    InternalERC20Upgradeable
{
    event Blacklisted(address indexed account);
    event Unblacklisted(address indexed account);

    function isBlacklisted(address account) public view returns (bool) {
        ERC20Storage storage $ = _getERC20Storage();
        return ($._balances[account] >> 255) == 1;
    }

    // sets the last bit of _balances to 1 if state is true, 0 otherwise
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

    function blacklist(
        address account
    ) public onlyRole(keccak256("BLACKLISTER_ROLE")) {
        _setBlacklistState(account, true);
    }

    function unblacklist(
        address account
    ) public onlyRole(keccak256("BLACKLISTER_ROLE")) {
        _setBlacklistState(account, false);
    }

    // fetches balance of an account from the last 255 bits of _balances
    function balanceOf(
        address account
    ) public view virtual override returns (uint256) {
        ERC20Storage storage $ = _getERC20Storage();
        return $._balances[account] & ((1 << 255) - 1);
    }

    function _update(
        address from,
        address to,
        uint256 value
    ) internal virtual override {
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
