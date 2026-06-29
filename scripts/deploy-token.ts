// Copyright (c) 2026 BitGo, Inc. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { ethers, upgrades } from "hardhat";

/**
 * Generic deployment script for stablecoin tokens using the Stablecoin contract
 * 
 * Usage:
 *   TOKEN_NAME=MyStablecoin TOKEN_SYMBOL=MYUSD TOKEN_DECIMALS=6 npx hardhat run scripts/deploy-token.ts --network mainnet
 *
 * Environment variables required:
 * - TOKEN_NAME: Full name of the token (e.g., "MyStablecoin")
 * - TOKEN_SYMBOL: Symbol of the token (e.g., "MYUSD")
 * - TOKEN_DECIMALS: Number of decimals (e.g., 6)
 * - DEFAULT_MINT_CAP: Default mint cap per transaction in token's smallest unit (e.g., 1000000000000 for 1M tokens with 6 decimals)
 * - ADMIN_ADDRESS: Default admin address
 * - DEFAULT_ADMIN_DELAY: Delay in seconds before admin can be changed
 * - FREEZER_ADDRESS: Address for freezer role
 * - MASTER_MINTER_ADDRESS: Address for master minter role (MASTER_MINTER_ROLE)
 * - UPGRADER_ADDRESS: Address for upgrader role
 * - BLACKLISTER_ADDRESS: Address for blacklister role
 * - RESCUER_ADDRESS: Address for rescuer role
 */
async function main() {
  const tokenName = process.env.TOKEN_NAME;
  const tokenSymbol = process.env.TOKEN_SYMBOL;
  const tokenDecimals = process.env.TOKEN_DECIMALS;
  const defaultMintCap = process.env.DEFAULT_MINT_CAP;

  if (!tokenName) {
    throw new Error("TOKEN_NAME environment variable is required (e.g., 'MyStablecoin')");
  }

  if (!tokenSymbol) {
    throw new Error("TOKEN_SYMBOL environment variable is required (e.g., 'MYUSD')");
  }

  if (!tokenDecimals) {
    throw new Error("TOKEN_DECIMALS environment variable is required (e.g., 6)");
  }

  if (!defaultMintCap) {
    throw new Error("DEFAULT_MINT_CAP environment variable is required (e.g., 1000000000000 for 1M tokens with 6 decimals)");
  }

  console.log(`Deploying ${tokenName} (${tokenSymbol}) token with ${tokenDecimals} decimals...`);

  const ContractFactory = await ethers.getContractFactory("Stablecoin");

  const {
    FREEZER_ADDRESS,
    MASTER_MINTER_ADDRESS,
    UPGRADER_ADDRESS,
    ADMIN_ADDRESS,
    BLACKLISTER_ADDRESS,
    RESCUER_ADDRESS,
    DEFAULT_ADMIN_DELAY,
  } = process.env;

  // Validate required environment variables
  const missingVars: string[] = [];
  if (!ADMIN_ADDRESS) missingVars.push('ADMIN_ADDRESS');
  if (!DEFAULT_ADMIN_DELAY) missingVars.push('DEFAULT_ADMIN_DELAY');
  if (!FREEZER_ADDRESS) missingVars.push('FREEZER_ADDRESS');
  if (!MASTER_MINTER_ADDRESS) missingVars.push('MASTER_MINTER_ADDRESS');
  if (!UPGRADER_ADDRESS) missingVars.push('UPGRADER_ADDRESS');
  if (!BLACKLISTER_ADDRESS) missingVars.push('BLACKLISTER_ADDRESS');
  if (!RESCUER_ADDRESS) missingVars.push('RESCUER_ADDRESS');

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  console.log(`Token Name: ${tokenName}`);
  console.log(`Token Symbol: ${tokenSymbol}`);
  console.log(`Token Decimals: ${tokenDecimals}`);
  console.log(`Default Mint Cap: ${defaultMintCap}`);
  console.log(`Admin: ${ADMIN_ADDRESS}`);

  const instance = await upgrades.deployProxy(
    ContractFactory,
    [
      tokenName,
      tokenSymbol,
      tokenDecimals,
      ADMIN_ADDRESS,
      DEFAULT_ADMIN_DELAY,
      FREEZER_ADDRESS,
      MASTER_MINTER_ADDRESS,
      UPGRADER_ADDRESS,
      BLACKLISTER_ADDRESS,
      RESCUER_ADDRESS,
      defaultMintCap
    ],
    { 
      kind: 'uups',
      txOverrides: {
        gasLimit: 5000000
      }
    }
  );
  await instance.waitForDeployment();

  const proxyAddress = await instance.getAddress();
  console.log(`${tokenSymbol} Proxy deployed to: ${proxyAddress}`);
  
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log(`${tokenSymbol} Implementation deployed to: ${implementationAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
