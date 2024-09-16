import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { USDS } from "../typechain-types";

describe("USDS blacklist", function () {
  let contractInstance: USDS;
  let defaultAdmin: SignerWithAddress;
  let freezer: SignerWithAddress
  let supplyController: SignerWithAddress;
  let upgrader: SignerWithAddress;
  let reserve: SignerWithAddress;
  let blacklister: SignerWithAddress;
  let targetAccount: SignerWithAddress;
  let withdrawer: SignerWithAddress;

  before(async function () {
    [defaultAdmin, freezer, supplyController, upgrader, blacklister, reserve, withdrawer, targetAccount] = await ethers.getSigners();
    const ContractFactory = await ethers.getContractFactory("USDS");
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
    contractInstance = (await contract.waitForDeployment()) as unknown as USDS;

    // Mint tokens to reserve
    await contractInstance.connect(supplyController).mint(reserve.address, 1000);
  });

  beforeEach(async function () {
    // Reset blacklists
    await contractInstance.connect(blacklister).unblacklist(targetAccount.address);
    await contractInstance.connect(blacklister).unblacklist(reserve.address);
  });
  
  it("Should blacklist an account", async function () {
    await contractInstance.connect(blacklister).blacklist(targetAccount.address);
    const isBlacklisted = await contractInstance.isBlacklisted(targetAccount.address);
    expect(isBlacklisted).to.be.true;
  });

  it("Should unblacklist an account", async function () {
    await contractInstance.connect(blacklister).blacklist(targetAccount.address);
    await contractInstance.connect(blacklister).unblacklist(targetAccount.address);
    const isBlacklisted = await contractInstance.isBlacklisted(targetAccount.address);
    expect(isBlacklisted).to.be.false;
  });

  it("Should not allow non-blacklister to blacklist", async function () {
    try {
      await contractInstance.connect(defaultAdmin).blacklist(targetAccount.address);
    } catch (error) {
      expect(error).to.be.an('error');
    }
    const isBlacklisted = await contractInstance.isBlacklisted(targetAccount.address);
    expect(isBlacklisted).to.be.false;
  });

  it("Should not allow non-blacklister to unblacklist", async function () {
    await contractInstance.connect(blacklister).blacklist(targetAccount.address);
    try {
      await contractInstance.connect(defaultAdmin).unblacklist(targetAccount.address);
    } catch (error) {
      expect(error).to.be.an('error');
    }
    const isBlacklisted = await contractInstance.isBlacklisted(targetAccount.address);
    expect(isBlacklisted).to.be.true;
  });

  it("Should transfer tokens correctly for non-blacklisted addresses", async function () {
    // Transfer tokens from reserve to receiver
    await contractInstance.connect(reserve).transfer(targetAccount.address, 500);
  
    // Check balances
    const senderBalance = await contractInstance.balanceOf(reserve.address);
    const receiverBalance = await contractInstance.balanceOf(targetAccount.address);
  
    expect(senderBalance).to.equal(500);
    expect(receiverBalance).to.equal(500);
  });
  
  it("Should not allow transfers from blacklisted addresses", async function () {
    // Blacklist reserve
    await contractInstance.connect(blacklister).blacklist(reserve.address);
  
    // Attempt to transfer tokens from blacklisted sender
    try {
      await contractInstance.connect(reserve).transfer(targetAccount.address, 250);
    } catch (error) {
      expect(error).to.be.an('error');
    }
  
    // Check balances
    const senderBalance = await contractInstance.balanceOf(reserve.address);
    const receiverBalance = await contractInstance.balanceOf(targetAccount.address);
  
    expect(senderBalance).to.equal(500);
    expect(receiverBalance).to.equal(500);
  });
  
  it("Should allow transfers to blacklisted addresses", async function () {
    // Blacklist receiver
    await contractInstance.connect(blacklister).blacklist(targetAccount.address);
  
    // Attempt to transfer tokens to blacklisted receiver
    await contractInstance.connect(reserve).transfer(targetAccount.address, 250);
  
    // Check balances
    const senderBalance = await contractInstance.balanceOf(reserve.address);
    const receiverBalance = await contractInstance.balanceOf(targetAccount.address);
  
    expect(senderBalance).to.equal(250);
    expect(receiverBalance).to.equal(750);
  });
});
