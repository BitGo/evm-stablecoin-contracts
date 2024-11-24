import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { DummyAggregatorV3, USDS } from "../typechain-types";

describe("USDS pause", function () {
  let contractInstance: USDS;
  let dummyAggregatorInstance: DummyAggregatorV3;
  let defaultAdmin: SignerWithAddress;
  let freezer: SignerWithAddress;
  let supplyController: SignerWithAddress;
  let upgrader: SignerWithAddress;
  let reserve: SignerWithAddress;
  let blacklister: SignerWithAddress;
  let withdrawer: SignerWithAddress;

  before(async function () {
    [
      defaultAdmin,
      freezer,
      supplyController,
      upgrader,
      blacklister,
      reserve,
      withdrawer
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
    const contract = await upgrades.deployProxy(
      ContractFactory,
      [
        defaultAdmin.address,
        freezer.address,
        supplyController.address,
        upgrader.address,
        blacklister.address,
        withdrawer.address,
        dummyAggregatorAddress,
      ],
      { kind: "uups" }
    );
    contractInstance = (await contract.waitForDeployment()) as unknown as USDS;

    const timeStampInSeconds = Math.floor(new Date().getTime() / 1000);
    await dummyAggregatorInstance
      .connect(supplyController)
      .updateData(1000000, 1, timeStampInSeconds, 1);
  });

  it("Should not be able to pause as unauthorized address", async function () {
    try {
      await contractInstance.connect(defaultAdmin).pause();
    } catch (error) {
      expect(error).to.be.an("error");
    }

    const paused = await contractInstance.paused();
    expect(paused).to.be.false;
  });

  it("Should pause the token successfully by freezer", async function () {
    // Freezer pauses the token
    await expect(contractInstance.connect(freezer).pause()).to.emit(
      contractInstance,
      "Paused"
    );
    const paused = await contractInstance.paused();
    expect(paused).to.be.true;
  });

  it("Should fail to mint tokens when the token is paused", async function () {
    const mintAmount = ethers.parseUnits("1000", 1);
    let failed = false;
    try {
      // Attempt to mint tokens while the token is paused
      await contractInstance.connect(supplyController).mint(reserve.address, mintAmount);
    } catch (error) {
      failed = true;
      expect((error as Error).message).equal(
        "VM Exception while processing transaction: reverted with custom error 'EnforcedPause()'"
      );
      expect(error).to.be.an("error");
    }
    expect(failed).to.be.true;
  });

  it("Should fail to burn tokens when the token is paused", async function () {
    const burnAmount = ethers.parseUnits("500", 18);
    let failed = false;
    try {
      // Attempt to burn tokens while the token is paused
      await contractInstance.connect(supplyController).burn(reserve.address, burnAmount);
    } catch (error) {
      failed = true;
      expect((error as Error).message).equal(
        "VM Exception while processing transaction: reverted with custom error 'EnforcedPause()'"
      );
      expect(error).to.be.an("error");
    }
    expect(failed).to.be.true;
  });

  it("Should fail to transfer tokens when the token is paused", async function () {
    const transferAmount = ethers.parseUnits("100", 18);
    // Assume accounts[0] has tokens and is trying to transfer to recipient
    let failed = false;
    try {
      // Attempt to transfer tokens while the token is paused
      await contractInstance
        .connect(defaultAdmin)
        .transfer(reserve.address, transferAmount);
    } catch (error) {
      failed = true;
      expect((error as Error).message).equal(
        "VM Exception while processing transaction: reverted with custom error 'EnforcedPause()'"
      );
      expect(error).to.be.an("error");
    }
    expect(failed).to.be.true;
  });

  it("Should unpause the token successfully by freezer", async function () {
    // Freezer unpauses the token
    await expect(contractInstance.connect(freezer).unpause()).to.emit(
      contractInstance,
      "Unpaused"
    );
    const paused = await contractInstance.paused();
    expect(paused).to.be.false;
  });
});
