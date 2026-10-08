// Copyright (c) 2026 BitGo, Inc. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.30;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title MockStorageLayoutUpgrades
 * @dev Test-only UUPS contracts used to prove that OpenZeppelin's `validateUpgrade` enforces
 * layout compatibility for ERC-7201 namespaced storage. They cannot inherit `Stablecoin`
 * (the plugin forbids redefining a namespace within one inheritance chain), so they model
 * the same `uint256, uint8, mapping, address` shape under a shared mock namespace.
 * Must never be deployed to a live network.
 */
abstract contract MockUpgradeableBase is UUPSUpgradeable {
    function _authorizeUpgrade(address) internal pure override {}
}

/// @dev Baseline: annotated namespaced storage.
contract MockLayoutV1 is MockUpgradeableBase {
    /// @custom:storage-location erc7201:contract.storage.MockLayout
    struct MockLayoutStorage {
        uint256 mintCapPerTransaction;
        uint8 tokenDecimals;
        mapping(address => uint256) minters;
        address supplyValidator;
    }
}

/// @dev Unsafe: annotated, swaps `mintCapPerTransaction` and `tokenDecimals`.
contract MockLayoutV2Reordered is MockUpgradeableBase {
    /// @custom:storage-location erc7201:contract.storage.MockLayout
    struct MockLayoutStorage {
        uint8 tokenDecimals;
        uint256 mintCapPerTransaction;
        mapping(address => uint256) minters;
        address supplyValidator;
    }
}

/// @dev Unsafe: annotated, changes the type of `supplyValidator`.
contract MockLayoutV2RetypedField is MockUpgradeableBase {
    /// @custom:storage-location erc7201:contract.storage.MockLayout
    struct MockLayoutStorage {
        uint256 mintCapPerTransaction;
        uint8 tokenDecimals;
        mapping(address => uint256) minters;
        uint256 supplyValidator;
    }
}

/// @dev Safe: annotated, appends a field.
contract MockLayoutV2Appended is MockUpgradeableBase {
    /// @custom:storage-location erc7201:contract.storage.MockLayout
    struct MockLayoutStorage {
        uint256 mintCapPerTransaction;
        uint8 tokenDecimals;
        mapping(address => uint256) minters;
        address supplyValidator;
        uint256 newField;
    }
}

/// @dev Control: unannotated baseline. Without `@custom:storage-location` the plugin cannot
/// see the namespace, so layout changes inside the struct go undetected.
contract MockLayoutUnannotatedV1 is MockUpgradeableBase {
    struct MockLayoutStorage {
        uint256 mintCapPerTransaction;
        uint8 tokenDecimals;
        mapping(address => uint256) minters;
        address supplyValidator;
    }
}

/// @dev Control: same reorder as `MockLayoutV2Reordered`, but unannotated.
contract MockLayoutUnannotatedV2Reordered is MockUpgradeableBase {
    struct MockLayoutStorage {
        uint8 tokenDecimals;
        uint256 mintCapPerTransaction;
        mapping(address => uint256) minters;
        address supplyValidator;
    }
}

// ---------------------------------------------------------------------------------------------
// Nested shape: mirrors the real `StablecoinStorage`, where both mappings hold a `MinterConfig`
// that itself contains two `MinterParams`. A reorder inside either nested struct moves the
// stored limits of every configured minter, so it must be rejected just like a top-level reorder.
// ---------------------------------------------------------------------------------------------

/// @dev Baseline: annotated namespace with nested `MinterConfig` / `MinterParams`.
contract MockNestedV1 is MockUpgradeableBase {
    struct MinterParams {
        uint256 maxLimit;
        uint256 currentLimit;
        uint256 timestamp;
        uint256 ratePerSecond;
    }

    struct MinterConfig {
        MinterParams minterParams;
        MinterParams burnerParams;
        bool isConfigured;
    }

    /// @custom:storage-location erc7201:contract.storage.MockNested
    struct MockNestedStorage {
        uint256 mintCapPerTransaction;
        uint8 tokenDecimals;
        mapping(address => MinterConfig) minters;
        mapping(address => MinterConfig) bridgeMinters;
        address supplyValidator;
    }
}

/// @dev Unsafe: swaps `maxLimit` and `currentLimit` inside `MinterParams`.
contract MockNestedV2ReorderedParams is MockUpgradeableBase {
    struct MinterParams {
        uint256 currentLimit;
        uint256 maxLimit;
        uint256 timestamp;
        uint256 ratePerSecond;
    }

    struct MinterConfig {
        MinterParams minterParams;
        MinterParams burnerParams;
        bool isConfigured;
    }

    /// @custom:storage-location erc7201:contract.storage.MockNested
    struct MockNestedStorage {
        uint256 mintCapPerTransaction;
        uint8 tokenDecimals;
        mapping(address => MinterConfig) minters;
        mapping(address => MinterConfig) bridgeMinters;
        address supplyValidator;
    }
}

/// @dev Unsafe: swaps `minterParams` and `burnerParams` inside `MinterConfig`.
contract MockNestedV2ReorderedConfig is MockUpgradeableBase {
    struct MinterParams {
        uint256 maxLimit;
        uint256 currentLimit;
        uint256 timestamp;
        uint256 ratePerSecond;
    }

    struct MinterConfig {
        MinterParams burnerParams;
        MinterParams minterParams;
        bool isConfigured;
    }

    /// @custom:storage-location erc7201:contract.storage.MockNested
    struct MockNestedStorage {
        uint256 mintCapPerTransaction;
        uint8 tokenDecimals;
        mapping(address => MinterConfig) minters;
        mapping(address => MinterConfig) bridgeMinters;
        address supplyValidator;
    }
}

/// @dev Unsafe: swaps the `minters` and `bridgeMinters` mappings that hold `MinterConfig`.
contract MockNestedV2SwappedMappings is MockUpgradeableBase {
    struct MinterParams {
        uint256 maxLimit;
        uint256 currentLimit;
        uint256 timestamp;
        uint256 ratePerSecond;
    }

    struct MinterConfig {
        MinterParams minterParams;
        MinterParams burnerParams;
        bool isConfigured;
    }

    /// @custom:storage-location erc7201:contract.storage.MockNested
    struct MockNestedStorage {
        uint256 mintCapPerTransaction;
        uint8 tokenDecimals;
        mapping(address => MinterConfig) bridgeMinters;
        mapping(address => MinterConfig) minters;
        address supplyValidator;
    }
}
