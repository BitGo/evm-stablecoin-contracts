// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {AggregatorV3Interface}
    from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

// Implementing the AggregatorV3Interface
// for testing purposes
contract DummyAggregatorV3 is AggregatorV3Interface {

    uint8 private _decimals;
    string private _description;
    uint256 private _version;
    
    uint80 private _roundId;
    int256 private _reserve;
    uint256 private _startedAt;
    uint256 private _updatedAt;
    uint80 private _answeredInRound;

    // Constructor to initialize dummy values
    constructor(uint8 decimals_, string memory description_, uint256 version_) {
        _decimals = decimals_;
        _description = description_;
        _version = version_;
        
        // Set some dummy data for testing
        _roundId = 1;
        _reserve = 0;
        _startedAt = block.timestamp - 100;
        _updatedAt = block.timestamp;
        _answeredInRound = 1;
    }

    // Implementing the AggregatorV3Interface functions
    function decimals() external view override returns (uint8) {
        return _decimals;
    }

    function description() external view override returns (string memory) {
        return _description;
    }

    function version() external view override returns (uint256) {
        return _version;
    }

    // Simulating the latest round data
    function getRoundData(
        uint80 round
    ) external view override returns (
        uint80 roundId, 
        int256 answer, 
        uint256 startedAt, 
        uint256 updatedAt, 
        uint80 answeredInRound
    ) {
        return (round, _reserve, _startedAt, _updatedAt, _answeredInRound);
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId, 
            int256 answer, 
            uint256 startedAt, 
            uint256 updatedAt, 
            uint80 answeredInRound
        ) {
        return (_roundId, _reserve, _startedAt, _updatedAt, _answeredInRound);
    }

    // Function to update the dummy reserve and round data manually
    function updateData(
        int256 newReserve,
        uint80 newRoundId,
        uint256 newUpdatedAt,
        uint80 newAnsweredInRound
    ) public {
        _reserve = newReserve;
        _roundId = newRoundId;
        _updatedAt = newUpdatedAt;
        _answeredInRound = newAnsweredInRound;
    }
}

