# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-04-13

### Added

- Generic `Stablecoin` contract using UUPS upgradeable proxy pattern
- `Blacklistable` mixin with gas-efficient bit-masking approach
- `ISupplyValidator` interface for extensible mint/burn validation
- `MockSupplyValidator` for testing
- Role-based access control: DEFAULT_ADMIN_ROLE, MASTER_MINTER_ROLE, MINTER, BRIDGE_MINTER, UPGRADER_ROLE, FREEZER_ROLE, BLACKLISTER_ROLE, RESCUER_ROLE
- Rate-limited minting and burning
- Batch mint and burn operations
- Batch blacklist and unblacklist operations
- ERC-20 Permit support (EIP-2612)
- Pausable functionality for emergency stops
- Token rescue for recovering stuck ERC-20 tokens
- Deployment and upgrade scripts for multi-network support
- Comprehensive test suite
- CI pipeline with unit tests and linting
