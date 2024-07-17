import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { GoUSD } from "../typechain-types";

describe("GoUSD Minting and Burning", function () {
  let contractInstance: GoUSD;
  let defaultAdmin: SignerWithAddress;
  let freezer: SignerWithAddress
  let supplyController: SignerWithAddress;
  let upgrader: SignerWithAddress;
  let reserve: SignerWithAddress;

  before(async function () {
    const signers = await ethers.getSigners();
    [defaultAdmin, freezer, supplyController, upgrader, reserve] = await ethers.getSigners();
    const ContractFactory = await ethers.getContractFactory("GoUSD");
    const contract = await upgrades.deployProxy(ContractFactory, [defaultAdmin.address, freezer.address, supplyController.address, upgrader.address, reserve.address], { kind: 'uups' });
    contractInstance = (await contract.waitForDeployment()) as unknown as GoUSD;
  });

  it("Should have 0 total supply on init and unpaused", async function () {
    const paused = await contractInstance.paused();

    expect(await contractInstance.totalSupply()).to.equal(0);
    expect(paused).to.be.false;
  });

  it("Should mint tokens successfully", async function () {
    const mintAmount = ethers.parseUnits("1000", 18);
    await contractInstance.connect(supplyController).mint(mintAmount);
    const balance = await contractInstance.balanceOf(reserve.address);
    expect(balance).to.equal(mintAmount);
    expect(await contractInstance.totalSupply()).to.equal(mintAmount);
  });

  it("Should burn tokens successfully", async function () {
    const initialBalance = await contractInstance.balanceOf(reserve.address);
    const burnAmount = ethers.parseUnits("500", 18);
    await contractInstance.connect(supplyController).burn(burnAmount);
    const finalBalance = await contractInstance.balanceOf(reserve.address);
    expect(finalBalance).to.equal(initialBalance - burnAmount);
    expect(await contractInstance.totalSupply()).to.equal(initialBalance - burnAmount);
  });

  it("Should fail to mint tokens when called by unauthorized address", async function () {
    const mintAmount = ethers.parseUnits("1000", 18);
    let failed = false;
    try {
      // Attempt to mint tokens by an unauthorized signer (e.g., defaultAdmin)
      await contractInstance.connect(defaultAdmin).mint(mintAmount);
    } catch (error) {
      failed = true;
      expect(error).to.be.an('error');
    }
    expect(failed).to.be.true;
  });
  
  it("Should fail to burn tokens when called by unauthorized address", async function () {
    const burnAmount = ethers.parseUnits("500", 18);
    let failed = false;
    try {
      // Attempt to burn tokens by an unauthorized signer (e.g., defaultAdmin)
      await contractInstance.connect(defaultAdmin).burn(burnAmount);
    } catch (error) {
      failed = true;
      expect(error).to.be.an('error');
    }
    expect(failed).to.be.true;
  });
});
