// Copyright (c) 2026 BitGo, Inc. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import "./ISupplyValidator.sol";

/**
 * @title MockSupplyValidator
 * @dev Mock contract for testing supply validator functionality
 * @notice This contract can be configured to accept or reject mint/burn operations
 */
contract MockSupplyValidator is ISupplyValidator {
    // Configuration flags
    bool public shouldRejectMint;
    bool public shouldRejectBurn;
    
    // Tracking variables for verification
    address public lastMintAccount;
    uint256 public lastMintAmount;
    address public lastMintMinter;
    bool public lastMintIsBridge;
    uint256 public mintCallCount;
    
    address public lastBurnAccount;
    uint256 public lastBurnAmount;
    address public lastBurnBurner;
    bool public lastBurnIsBridge;
    uint256 public burnCallCount;
    
    // Custom error messages
    string public constant MINT_REJECTED = "MockValidator: Mint rejected";
    string public constant BURN_REJECTED = "MockValidator: Burn rejected";
    
    /**
     * @dev Sets whether mint operations should be rejected
     * @param reject True to reject mints, false to accept
     */
    function setRejectMint(bool reject) external {
        shouldRejectMint = reject;
    }
    
    /**
     * @dev Sets whether burn operations should be rejected
     * @param reject True to reject burns, false to accept
     */
    function setRejectBurn(bool reject) external {
        shouldRejectBurn = reject;
    }
    
    /**
     * @dev Validates a mint operation
     * @param account The address that will receive the minted tokens
     * @param amount The amount of tokens to be minted
     * @param minter The address performing the mint operation
     * @param isBridge Whether this is a bridge mint operation
     */
    function validateMint(
        address account,
        uint256 amount,
        address minter,
        bool isBridge
    ) external override {
        // Store the call parameters for verification
        lastMintAccount = account;
        lastMintAmount = amount;
        lastMintMinter = minter;
        lastMintIsBridge = isBridge;
        mintCallCount++;
        
        // Revert if configured to reject
        if (shouldRejectMint) {
            revert(MINT_REJECTED);
        }
    }

    function validateMintBatch(
        address[] memory accounts,
        uint256[] memory amounts,
        address minter,
        bool isBridge
    ) external override {
        // Mock function to validate a batch of mint operations
        for (uint256 i = 0; i < accounts.length; i++) {
            address account = accounts[i];
            uint256 amount = amounts[i];
            lastMintAccount = account;
            lastMintAmount = amount;
            lastMintMinter = minter;
            lastMintIsBridge = isBridge;
            mintCallCount++;   
        }
        // Revert if configured to reject
        if (shouldRejectMint) {
            revert(MINT_REJECTED);
        }
    }
    
    /**
     * @dev Validates a burn operation
     * @param account The address from which tokens will be burned
     * @param amount The amount of tokens to be burned
     * @param burner The address performing the burn operation
     * @param isBridge Whether this is a bridge burn operation
     */
    function validateBurn(
        address account,
        uint256 amount,
        address burner,
        bool isBridge
    ) external override {
        // Store the call parameters for verification
        lastBurnAccount = account;
        lastBurnAmount = amount;
        lastBurnBurner = burner;
        lastBurnIsBridge = isBridge;
        burnCallCount++;
        
        // Revert if configured to reject
        if (shouldRejectBurn) {
            revert(BURN_REJECTED);
        }
    }
    
    /**
     * @dev Resets all tracking variables
     */
    function reset() external {
        lastMintAccount = address(0);
        lastMintAmount = 0;
        lastMintMinter = address(0);
        lastMintIsBridge = false;
        mintCallCount = 0;
        
        lastBurnAccount = address(0);
        lastBurnAmount = 0;
        lastBurnBurner = address(0);
        lastBurnIsBridge = false;
        burnCallCount = 0;
        
        shouldRejectMint = false;
        shouldRejectBurn = false;
    }
}
