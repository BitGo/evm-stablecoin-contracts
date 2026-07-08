# Contributing to stablecoin-evm

Thank you for your interest in contributing to this project! This document provides guidelines for contributing.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/<your-username>/stablecoin-evm.git`
3. Install dependencies: `npm install`
4. Create a branch: `git checkout -b feature/your-feature-name`

## Development Setup

### Prerequisites

- Node.js >= 20.0.0
- npm

### Commands

```bash
# Install dependencies
npm install

# Compile contracts
npx hardhat compile

# Run tests
npm test

# Run linters
npm run lint

# Format Solidity files
npm run format
```

## Making Changes

### Code Standards

- **Solidity**: Follow the [Solidity Style Guide](https://docs.soliditylang.org/en/latest/style-guide.html). All contracts must compile with Solidity 0.8.30.
- **TypeScript**: Follow the ESLint configuration in the project. Run `npm run lint` before submitting.
- **Tests**: All new features and bug fixes must include tests. Run `npm test` to ensure all tests pass.

### Smart Contract Guidelines

- Use OpenZeppelin upgradeable contracts where applicable
- Maintain storage layout compatibility for upgradeable contracts (see [STABLECOINS.md](./STABLECOINS.md) for details)
- Include NatSpec documentation for all public and external functions
- Use custom errors instead of require strings for gas efficiency
- All SPDX license identifiers must be `Apache-2.0`

### Commit Messages

- Use clear, descriptive commit messages
- Reference issue numbers where applicable (e.g., `fix: resolve blacklist check on zero address (#42)`)

### Developer Certificate of Origin (DCO)

All contributions must be made under the [Developer Certificate of Origin](./DCO.md).
Every commit must include a `Signed-off-by` line matching the commit author,
which you can add automatically with `git commit -s`:

```
Signed-off-by: Your Name <your.email@example.com>
```

Pull requests containing commits without a valid sign-off cannot be merged. See
[DCO.md](./DCO.md) for details.

## Submitting Changes

1. Ensure all tests pass: `npm test`
2. Ensure linting passes: `npm run lint`
3. Push to your fork: `git push origin feature/your-feature-name`
4. Open a Pull Request against the `master` branch
5. Fill out the PR template with a description of your changes

### Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Include tests for new functionality
- Update documentation if behavior changes
- Ensure CI passes before requesting review

## Reporting Issues

- Use GitHub Issues to report bugs or request features
- For security vulnerabilities, see [SECURITY.md](./SECURITY.md)

## Governance

This project is maintained by BitGo's Stablecoins team. The maintainers are responsible for reviewing and merging contributions, managing releases, and setting the project roadmap. See [GOVERNANCE.md](./GOVERNANCE.md) for the full governance model, roles, and decision-making process.

## License

By contributing to this project, you agree that your contributions will be licensed under the [Apache License 2.0](./LICENSE.md).
