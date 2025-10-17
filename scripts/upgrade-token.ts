import { ethers, upgrades } from "hardhat";

/**
 * Generic upgrade script for any stablecoin token
 * 
 * Usage:
 *   TOKEN_NAME=GoUSD PROXY_ADDRESS=0x... npx hardhat run scripts/upgrade-token.ts --network mainnet
 *   TOKEN_NAME=GoEUR PROXY_ADDRESS=0x... npx hardhat run scripts/upgrade-token.ts --network mainnet
 *   TOKEN_NAME=GoGBP PROXY_ADDRESS=0x... npx hardhat run scripts/upgrade-token.ts --network mainnet
 * 
 * Environment variables required:
 * - TOKEN_NAME: Name of the token to upgrade (e.g., GoUSD, GoEUR, GoGBP)
 * - PROXY_ADDRESS: Address of the deployed proxy contract
 */
async function main() {
  const tokenName = process.env.TOKEN_NAME;
  const proxyAddress = process.env.PROXY_ADDRESS;

  if (!tokenName) {
    throw new Error("TOKEN_NAME environment variable is required (e.g., GoUSD, GoEUR, GoGBP)");
  }

  if (!proxyAddress) {
    throw new Error("PROXY_ADDRESS environment variable is required");
  }

  console.log(`Upgrading ${tokenName} proxy at: ${proxyAddress}`);

  // Get the new implementation
  const TokenFactory = await ethers.getContractFactory(tokenName);

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
