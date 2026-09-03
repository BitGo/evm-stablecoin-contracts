// Copyright (c) 2026 BitGo, Inc. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import hre from "hardhat";
import { upgrades as upgradesFactory } from "@openzeppelin/hardhat-upgrades";
const connection = await hre.network.getOrCreate();
const { ethers } = connection;
const upgrades = await upgradesFactory(hre, connection);

/**
 * Generic upgrade script for any stablecoin token
 *
 * Usage:
 *   TOKEN_NAME=MyStablecoin PROXY_ADDRESS=0x... npx hardhat run scripts/upgrade-token.ts --network mainnet
 *
 * Environment variables required:
 * - TOKEN_NAME: Human-readable name of the token being upgraded (used for logging only)
 * - PROXY_ADDRESS: Address of the deployed proxy contract
 */
async function main() {
  const tokenName = process.env.TOKEN_NAME;
  const proxyAddress = process.env.PROXY_ADDRESS;

  if (!tokenName) {
    throw new Error("TOKEN_NAME environment variable is required (e.g., MyStablecoin)");
  }

  if (!proxyAddress) {
    throw new Error("PROXY_ADDRESS environment variable is required");
  }

  console.log(`Upgrading ${tokenName} proxy at: ${proxyAddress}`);

  // Always use the "Stablecoin" contract name — TOKEN_NAME is the token's display
  // name passed to initialize(), not the Hardhat artifact name.
  const TokenFactory = await ethers.getContractFactory("Stablecoin");

  // Validate the upgrade
  console.log("Validating upgrade...");
  await upgrades.validateUpgrade(proxyAddress, TokenFactory);

  // Upgrade the proxy
  console.log("Upgrading proxy...");
  const upgraded = await upgrades.upgradeProxy(proxyAddress, TokenFactory, {
    kind: 'uups'
  });

  await upgraded.waitForDeployment();

  console.log(`${tokenName} upgraded successfully`);
  console.log("Proxy address:", proxyAddress);
  
  const newImplementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log("New implementation address:", newImplementationAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
