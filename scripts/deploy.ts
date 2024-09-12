import { ethers, upgrades, run } from "hardhat";

async function main() {
  const ContractFactory = await ethers.getContractFactory("USDS");

  const {
    FREEZER_ADDRESS,
    SUPPLY_CONTROLLER_ADDRESS,
    UPGRADER_ADDRESS,
    ADMIN_ADDRESS,
    BLACKLISTER_ADDRESS,
    RESERVE_ADDRESSES,
  } = process.env;

  const reserveAddresses = RESERVE_ADDRESSES ? RESERVE_ADDRESSES.split(',') : [];

  const instance = await upgrades.deployProxy(
    ContractFactory,
    [ADMIN_ADDRESS, FREEZER_ADDRESS, SUPPLY_CONTROLLER_ADDRESS, UPGRADER_ADDRESS, BLACKLISTER_ADDRESS, reserveAddresses],
    { 
      kind: 'uups',
      txOverrides: {
        gasLimit: 5000000
      }
    }
  );
  await instance.waitForDeployment();

  console.log(`Proxy deployed to ${await instance.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
