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
  let reserve1: SignerWithAddress;
  let reserve2: SignerWithAddress;
  let blacklister: SignerWithAddress;

  before(async function () {
    [defaultAdmin, freezer, supplyController, upgrader, blacklister, reserve1, reserve2] = await ethers.getSigners();
    const ContractFactory = await ethers.getContractFactory("GoUSD");
    const contract = await upgrades.deployProxy(
      ContractFactory,
      [defaultAdmin.address, freezer.address, supplyController.address, upgrader.address, blacklister.address, [reserve1.address, reserve2.address]],
      { kind: 'uups' }
    );
    contractInstance = (await contract.waitForDeployment()) as unknown as GoUSD;
  });

  it("Should have 0 total supply on init and unpaused", async function () {
    const paused = await contractInstance.paused();

    expect(await contractInstance.totalSupply()).to.equal(0);
    expect(paused).to.be.false;
  });

  it("Should correctly identify reserve addresses", async function () {
    const isReserve1 = await contractInstance.isReserveAddress(reserve1.address);
    const isReserve2 = await contractInstance.isReserveAddress(reserve2.address);
  
    expect(isReserve1).to.be.true;
    expect(isReserve2).to.be.true;
  });
  
  it("Should mint tokens successfully to reserve1", async function () {
    const mintAmount = ethers.parseUnits("1000", 18);
    await contractInstance.connect(supplyController).mint(reserve1.address, mintAmount);
    const balance = await contractInstance.balanceOf(reserve1.address);
    expect(balance).to.equal(mintAmount);
    expect(await contractInstance.totalSupply()).to.equal(mintAmount);
  });

  it("Should burn tokens successfully from reserve1", async function () {
    const initialBalance = await contractInstance.balanceOf(reserve1.address);
    const burnAmount = ethers.parseUnits("500", 18);
    await contractInstance.connect(supplyController).burn(reserve1.address, burnAmount);
    const finalBalance = await contractInstance.balanceOf(reserve1.address);
    expect(finalBalance).to.equal(initialBalance - burnAmount);
    expect(await contractInstance.totalSupply()).to.equal(initialBalance - burnAmount);
  });

  it("Should fail to mint tokens to a non-reserve address", async function () {
    const mintAmount = ethers.parseUnits("1000", 18);
    let failed = false;
    try {
      // Attempt to mint tokens to a non-reserve address (e.g., freezer)
      await contractInstance.connect(supplyController).mint(freezer.address, mintAmount);
    } catch (error) {
      failed = true;
      expect(error).to.be.an('error');
    }
    expect(failed).to.be.true;
  });
  
  it("Should fail to burn tokens from a non-reserve address", async function () {
    const burnAmount = ethers.parseUnits("500", 18);
    let failed = false;
    try {
      // Attempt to burn tokens from a non-reserve address (e.g., freezer)
      await contractInstance.connect(supplyController).burn(freezer.address, burnAmount);
    } catch (error) {
      failed = true;
      expect(error).to.be.an('error');
    }
    expect(failed).to.be.true;
  });

  it("Should fail to mint tokens when called by unauthorized address", async function () {
    const mintAmount = ethers.parseUnits("1000", 18);
    let failed = false;
    try {
      // Attempt to mint tokens by an unauthorized signer (e.g., defaultAdmin)
      await contractInstance.connect(defaultAdmin).mint(reserve1.address, mintAmount);
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
      await contractInstance.connect(defaultAdmin).burn(reserve1.address, burnAmount);
    } catch (error) {
      failed = true;
      expect(error).to.be.an('error');
    }
    expect(failed).to.be.true;
  });
});
