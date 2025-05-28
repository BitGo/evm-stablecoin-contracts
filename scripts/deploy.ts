import { ethers, upgrades } from "hardhat";

async function main() {
  const ContractFactory = await ethers.getContractFactory("GoUSD");

  const {
    FREEZER_ADDRESS,
    SUPPLY_CONTROLLER_ADDRESS,
    UPGRADER_ADDRESS,
    ADMIN_ADDRESS,
    BLACKLISTER_ADDRESS,
    RESCUER_ADDRESS,
    DEFAULT_ADMIN_DELAY
  } = process.env;

  const instance = await upgrades.deployProxy(
    ContractFactory,
    [ADMIN_ADDRESS, DEFAULT_ADMIN_DELAY, FREEZER_ADDRESS, SUPPLY_CONTROLLER_ADDRESS, UPGRADER_ADDRESS, BLACKLISTER_ADDRESS, RESCUER_ADDRESS],
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
