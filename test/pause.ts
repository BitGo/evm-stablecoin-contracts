import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { GoUSD } from "../typechain-types";

describe("GoUSD pause", function () {
  let contractInstance: GoUSD;
  let defaultAdmin: SignerWithAddress;
  let freezer: SignerWithAddress
  let supplyController: SignerWithAddress;
  let upgrader: SignerWithAddress;
  let reserve: SignerWithAddress;
  let blacklister: SignerWithAddress;
  let withdrawer: SignerWithAddress;

  before(async function () {
    [defaultAdmin, freezer, supplyController, upgrader, blacklister, reserve, withdrawer] = await ethers.getSigners();
    const ContractFactory = await ethers.getContractFactory("GoUSD");
    const contract = await upgrades.deployProxy(
      ContractFactory,
      [
        defaultAdmin.address,
        freezer.address,
        supplyController.address,
        upgrader.address,
        blacklister.address,
        withdrawer.address,
        [reserve.address],
      ],
      { kind: "uups" }
    );
    contractInstance = (await contract.waitForDeployment()) as unknown as GoUSD;
  });

  it("Should not be able to pause as unauthorized address", async function () {
    const failed = false;
    try {
      await contractInstance.connect(defaultAdmin).pause();
    } catch (error) {
      expect(error).to.be.an('error')
    }

    const paused = await contractInstance.paused();
    expect(paused).to.be.false;
  }),

  it("Should pause the token successfully by freezer", async function () {
    // Freezer pauses the token
    await contractInstance.connect(freezer).pause();
    const paused = await contractInstance.paused();
    expect(paused).to.be.true;
  });
  
  it("Should fail to mint tokens when the token is paused", async function () {
    const mintAmount = ethers.parseUnits("1000", 18);
    let failed = false;
    try {
      // Attempt to mint tokens while the token is paused
      await contractInstance.connect(supplyController).mint(mintAmount);
    } catch (error) {
      failed = true;
      expect(error).to.be.an('error');
    }
    expect(failed).to.be.true;
  });
  
  it("Should fail to burn tokens when the token is paused", async function () {
    const burnAmount = ethers.parseUnits("500", 18);
    let failed = false;
    try {
      // Attempt to burn tokens while the token is paused
      await contractInstance.connect(supplyController).burn(burnAmount);
    } catch (error) {
      failed = true;
      expect(error).to.be.an('error');
    }
    expect(failed).to.be.true;
  });
  
  it("Should fail to transfer tokens when the token is paused", async function () {
    const transferAmount = ethers.parseUnits("100", 18);
    // Assume accounts[0] has tokens and is trying to transfer to recipient
    let failed = false;
    try {
      // Attempt to transfer tokens while the token is paused
      await contractInstance.connect(defaultAdmin).transfer(reserve.address, transferAmount);
    } catch (error) {
      failed = true;
      expect(error).to.be.an('error');
    }
    expect(failed).to.be.true;
  });

  it("Should unpause the token successfully by freezer", async function () {
    // Freezer unpauses the token
    await contractInstance.connect(freezer).unpause();
    const paused = await contractInstance.paused();
    expect(paused).to.be.false;
  });
});
