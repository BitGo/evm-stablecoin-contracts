// Copyright (c) 2026 BitGo, Inc. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

/**
 * @dev Interface for the Supply Validator contract
 * @notice This interface is used to validate mint and burn operations on the stablecoin
 */
interface ISupplyValidator {
    /**
     * @dev Validates a mint operation before it is executed
     * @param account The address that will receive the minted tokens
     * @param amount The amount of tokens to be minted
     * @param minter The address performing the mint operation
     * @param isBridge Whether this is a bridge mint operation
     */
    function validateMint(address account, uint256 amount, address minter, bool isBridge) external;
    
    /**
     * @dev Validates a burn operation before it is executed
     * @param account The address from which tokens will be burned
     * @param amount The amount of tokens to be burned
     * @param burner The address performing the burn operation
     * @param isBridge Whether this is a bridge burn operation
     */
    function validateBurn(address account, uint256 amount, address burner, bool isBridge) external;
    
    /**
     * @dev Validates a batch mint operation before it is executed
     * @param accounts The addresses that will receive the minted tokens
     * @param amounts The amounts of tokens to be minted for each address
     * @param minter The address performing the mint operation
     * @param isBridge Whether this is a bridge mint operation
     */
    function validateMintBatch(
      address[] memory accounts, uint256[] memory amounts, address minter, bool isBridge) 
      external;
    
  }
