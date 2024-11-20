// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

contract InvalidContract is ERC165 {
    function someOtherFunction() external pure returns (string memory) {
        return "I am invalid!";
    }
}
