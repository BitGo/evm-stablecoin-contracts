import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { DummyAggregatorV3, USDS } from "../typechain-types";

describe("USDS blacklist", function () {
  let contractInstance: USDS;
  let dummyAggregatorInstance: DummyAggregatorV3;
  let defaultAdmin: SignerWithAddress;
  let freezer: SignerWithAddress;
  let supplyController: SignerWithAddress;
  let upgrader: SignerWithAddress;
  let reserve: SignerWithAddress;
  let blacklister: SignerWithAddress;
  let targetAccount: SignerWithAddress;
  let withdrawer: SignerWithAddress;
  const addressZero = "0x0000000000000000000000000000000000000000";

  before(async function () {
    [
      defaultAdmin,
      freezer,
      supplyController,
      upgrader,
      blacklister,
      reserve,
      withdrawer,
      targetAccount,
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

    // Mint tokens to reserve
    await contractInstance
      .connect(supplyController)
      .mint(reserve.address, 1000);
  });

  beforeEach(async function () {
    // Reset blacklists
    await contractInstance
      .connect(blacklister)
      .unblacklist(targetAccount.address);
    await contractInstance.connect(blacklister).unblacklist(reserve.address);
  });

  it("Should blacklist an account", async function () {
    await expect(
      contractInstance.connect(blacklister).blacklist(targetAccount.address)
    )
      .to.emit(contractInstance, "Blacklisted")
      .withArgs(targetAccount.address);
    const isBlacklisted = await contractInstance.isBlacklisted(
      targetAccount.address
    );
    expect(isBlacklisted).to.be.true;
  });

  it("Should unblacklist an account", async function () {
    await contractInstance
      .connect(blacklister)
      .blacklist(targetAccount.address);

    let isBlacklisted = await contractInstance
      .connect(blacklister)
      .isBlacklisted(targetAccount.address);
    expect(isBlacklisted).to.be.true;

    await expect(
      contractInstance.connect(blacklister).unblacklist(targetAccount.address)
    )
      .to.emit(contractInstance, "Unblacklisted")
      .withArgs(targetAccount.address);
    isBlacklisted = await contractInstance.isBlacklisted(targetAccount.address);
    expect(isBlacklisted).to.be.false;
  });

  it("Should not allow non-blacklister to blacklist", async function () {
    try {
      await contractInstance
        .connect(defaultAdmin)
        .blacklist(targetAccount.address);
    } catch (error) {
      expect(error).to.be.an("error");
    }
    const isBlacklisted = await contractInstance.isBlacklisted(
      targetAccount.address
    );
    expect(isBlacklisted).to.be.false;
  });

  it("Should not allow non-blacklister to unblacklist", async function () {
    await contractInstance
      .connect(blacklister)
      .blacklist(targetAccount.address);
    try {
      await contractInstance
        .connect(defaultAdmin)
        .unblacklist(targetAccount.address);
    } catch (error) {
      expect(error).to.be.an("error");
    }
    const isBlacklisted = await contractInstance.isBlacklisted(
      targetAccount.address
    );
    expect(isBlacklisted).to.be.true;
  });

  it("Should transfer tokens correctly for non-blacklisted addresses", async function () {
    // Transfer tokens from reserve to receiver
    await expect(
      contractInstance.connect(reserve).transfer(targetAccount.address, 500)
    )
      .to.emit(contractInstance, "Transfer")
      .withArgs(reserve.address, targetAccount.address, 500);

    const isBlacklisted = await contractInstance.isBlacklisted(
      targetAccount.address
    );
    expect(isBlacklisted).to.be.false;

    // Check balances
    const senderBalance = await contractInstance.balanceOf(reserve.address);
    const receiverBalance = await contractInstance.balanceOf(
      targetAccount.address
    );

    expect(senderBalance).to.equal(500);
    expect(receiverBalance).to.equal(500);
  });

  it("Should not allow transfers from blacklisted addresses", async function () {
    // Blacklist reserve
    await contractInstance.connect(blacklister).blacklist(reserve.address);

    // Attempt to transfer tokens from blacklisted sender
    try {
      await contractInstance
        .connect(reserve)
        .transfer(targetAccount.address, 250);
    } catch (error) {
      expect(error).to.be.an("error");
    }

    // Check balances
    const senderBalance = await contractInstance.balanceOf(reserve.address);
    const receiverBalance = await contractInstance.balanceOf(
      targetAccount.address
    );

    expect(senderBalance).to.equal(500);
    expect(receiverBalance).to.equal(500);
  });

  it("Should allow transfers to blacklisted addresses", async function () {
    // Blacklist receiver
    await contractInstance
      .connect(blacklister)
      .blacklist(targetAccount.address);

    // Attempt to transfer tokens to blacklisted receiver
    await contractInstance
      .connect(reserve)
      .transfer(targetAccount.address, 250);

    let isBlacklisted = await contractInstance.isBlacklisted(
      targetAccount.address
    );
    expect(isBlacklisted).to.be.true;

    // Check balances
    const senderBalance = await contractInstance.balanceOf(reserve.address);
    const receiverBalance = await contractInstance.balanceOf(
      targetAccount.address
    );

    expect(senderBalance).to.equal(250);
    expect(receiverBalance).to.equal(750);

    // Should still be blacklisted after transfer
    isBlacklisted = await contractInstance.isBlacklisted(targetAccount.address);
    expect(isBlacklisted).to.be.true;
  });

  it("Should prevent blacklisted address from performing transferFrom", async function () {
    // Blacklist the target account
    await contractInstance
      .connect(blacklister)
      .blacklist(targetAccount.address);

    // Approve transferFrom from reserve to targetAccount
    await contractInstance.connect(reserve).approve(targetAccount.address, 500);

    // Check balances before transferFrom
    const senderBalanceBefore = await contractInstance.balanceOf(
      reserve.address
    );
    const receiverBalanceBefore = await contractInstance.balanceOf(
      targetAccount.address
    );

    // Attempt to perform transferFrom from blacklisted address
    try {
      await contractInstance
        .connect(targetAccount)
        .transferFrom(reserve.address, targetAccount.address, 250);
    } catch (error) {
      expect(error).to.be.an("error");
      expect((error as Error).message).equal(
        "VM Exception while processing transaction: reverted with reason string 'Spender is blacklisted'"
      );
    }

    // Check balances after transferFrom
    const senderBalanceAfter = await contractInstance.balanceOf(
      reserve.address
    );
    const receiverBalanceAfter = await contractInstance.balanceOf(
      targetAccount.address
    );

    expect(senderBalanceBefore).to.equal(senderBalanceAfter);
    expect(receiverBalanceBefore).to.equal(receiverBalanceAfter);
  });

  it("Should allow supply controller role to destroy blacklisted funds", async function () {
    // Blacklist receiver
    await contractInstance
      .connect(blacklister)
      .blacklist(targetAccount.address);
    const targetBalance = await contractInstance.balanceOf(
      targetAccount.address
    );
    expect(targetBalance).to.equal(750);

    // Destroy blacklisted funds
    await expect(
      contractInstance
        .connect(supplyController)
        .destroyBlacklistedFunds(targetAccount.address)
    )
      .to.emit(contractInstance, "Transfer")
      .withArgs(targetAccount.address, addressZero, 750)
      .to.emit(contractInstance, "Burn")
      .withArgs(targetAccount.address, 750);
    const targetBalanceAfter = await contractInstance.balanceOf(
      targetAccount.address
    );
    expect(targetBalanceAfter).to.equal(0);
    // Check if the address is still blacklisted
    const isBlacklisted = await contractInstance.isBlacklisted(
      targetAccount.address
    );
    expect(isBlacklisted).to.be.true;
  });

  it("Should prevent non-blacklister from destroying blacklisted funds", async function () {
    // Blacklist receiver
    await contractInstance
      .connect(supplyController)
      .mint(targetAccount.address, 1000);
    await contractInstance
      .connect(blacklister)
      .blacklist(targetAccount.address);
    const targetBalance = await contractInstance.balanceOf(
      targetAccount.address
    );
    expect(targetBalance).to.equal(1000);

    // Attempt to destroy blacklisted funds by a non-blacklister
    try {
      await contractInstance
        .connect(defaultAdmin)
        .destroyBlacklistedFunds(targetAccount.address);
    } catch (error) {
      expect(error).to.be.an("error");
    }

    // Check the balance of the blacklisted address
    const targetBalanceAfter = await contractInstance.balanceOf(
      targetAccount.address
    );
    expect(targetBalanceAfter).to.equal(1000);
  });

  it("Should prevent mints to a blacklisted address", async function () {
    // Blacklist the target account
    await contractInstance
      .connect(blacklister)
      .blacklist(targetAccount.address);
    const balance = await contractInstance.balanceOf(targetAccount.address);

    // Attempt to mint tokens to the blacklisted address
    try {
      await contractInstance
        .connect(supplyController)
        .mint(targetAccount.address, 100);
    } catch (error) {
      expect(error).to.be.an("error");
    }

    // Check the balance of the blacklisted address
    const newBalance = await contractInstance.balanceOf(targetAccount.address);
    expect(balance).to.equal(newBalance);
  });
});
