import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { DummyAggregatorV3, USDS } from "../typechain-types";

describe("Transfer Tests", function () {
  let contractInstance: USDS;
  let dummyAggregatorInstance: DummyAggregatorV3;
  let defaultAdmin: SignerWithAddress;
  let freezer: SignerWithAddress;
  let supplyController: SignerWithAddress;
  let upgrader: SignerWithAddress;
  let blacklister: SignerWithAddress;
  let rescuer: SignerWithAddress;
  let randomAddress: SignerWithAddress;

  before(async function () {
    [
      defaultAdmin,
      freezer,
      supplyController,
      upgrader,
      blacklister,
      rescuer,
      randomAddress,
    ] = await ethers.getSigners();
    const ContractFactory = await ethers.getContractFactory("USDS");
    const dummyAggregator =
      await ethers.getContractFactory("DummyAggregatorV3");
    const dummyAggregatorContract = await dummyAggregator.deploy(
      6, // Decimals
      "Dummy contract description",
      1 // version
    );
    dummyAggregatorInstance =
      (await dummyAggregatorContract.waitForDeployment()) as DummyAggregatorV3;
    const dummyAggregatorAddress = await dummyAggregatorInstance.getAddress();
    const defaultAdminDelay = 7 * 24 * 60 * 60; // 7 days in seconds (or any appropriate value)
    const contract = await upgrades.deployProxy(
      ContractFactory,
      [
        defaultAdmin.address,
        defaultAdminDelay,
        freezer.address,
        supplyController.address,
        upgrader.address,
        blacklister.address,
        rescuer.address,
        dummyAggregatorAddress,
      ],
      { kind: "uups" }
    );
    contractInstance = (await contract.waitForDeployment()) as unknown as USDS;
  });

  describe("transferFrom", function () {
    it("should prevent 0 value transfers", async function () {
      // Set up test scenario
      const sender = defaultAdmin;
      const recipient = randomAddress;
      const amount = ethers.parseUnits("0", 18);

      // Call the transferFrom function
      await expect(
        contractInstance.connect(sender).transferFrom(
          sender.address,
          recipient.address,
          amount
        )
      ).to.be.revertedWithCustomError(contractInstance, "InvalidAmount()");
    });
  });

});
