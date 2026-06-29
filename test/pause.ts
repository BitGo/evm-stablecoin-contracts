// Copyright (c) 2026 BitGo, Inc. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Stablecoin } from "../typechain-types";

describe("pause", function () {
  let contractInstance: Stablecoin;
  let defaultAdmin: SignerWithAddress;
  let freezer: SignerWithAddress;
  let masterMinter: SignerWithAddress;
  let minter: SignerWithAddress;
  let upgrader: SignerWithAddress;
  let reserve1: SignerWithAddress;
  let reserve2: SignerWithAddress;
  let blacklister: SignerWithAddress;
  let rescuer: SignerWithAddress;
  let randomAddress: SignerWithAddress;
  const DAILY_LIMIT = ethers.parseUnits("10000000", 6); // 10M tokens daily limit

  before(async function () {
    [
      defaultAdmin,
      freezer,
      masterMinter,
      minter,
      upgrader,
      blacklister,
      rescuer,
      reserve1,
      reserve2,
      randomAddress,
    ] = await ethers.getSigners();
    const ContractFactory = await ethers.getContractFactory("Stablecoin");
    const defaultAdminDelay = 7 * 24 * 60 * 60; // 7 days in seconds (or any appropriate value)

    const contract = await upgrades.deployProxy(
      ContractFactory,
      [
        "GoUSD",
        "GoUSD",
        6,
        defaultAdmin.address,
        defaultAdminDelay,
        freezer.address,
        masterMinter.address,
        upgrader.address,
        blacklister.address,
        rescuer.address,
        1000000 * (10 ** 6)
      ],
      { kind: "uups" }
    );
    contractInstance =
      (await contract.waitForDeployment()) as unknown as Stablecoin;
    
    // Configure minter with high limits for testing
    await contractInstance.connect(masterMinter).configureMinter(minter.address, DAILY_LIMIT, DAILY_LIMIT);
  });

  it("Should not be able to pause as unauthorized address", async function () {
    let failed = false;
    try {
      await contractInstance.connect(randomAddress).pause();
    } catch (error) {
      failed = true;
      expect(error).to.be.an("error");
    }
    expect(failed).to.be.true;
  });

  it("Should pause the token successfully by freezer", async function () {
    await expect(contractInstance.connect(freezer).pause())
      .to.emit(contractInstance, "Paused")
      .withArgs(freezer.address);
  });

  it("Should fail to mint tokens when the token is paused", async function () {
    const mintAmount = ethers.parseUnits("1000", 6);

    let failed = false;
    try {
      await contractInstance.connect(minter).mint(reserve1.address, mintAmount);
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
    const burnAmount = ethers.parseUnits("500", 6);

    // First unpause to mint tokens to minter
    await contractInstance.connect(freezer).unpause();
    await contractInstance.connect(minter).mint(minter.address, burnAmount);
    
    // Now pause again
    await contractInstance.connect(freezer).pause();

    let failed = false;
    try {
      // Minter tries to burn their own tokens while paused
      await contractInstance.connect(minter).burn(minter.address, burnAmount);
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
    const transferAmount = ethers.parseUnits("500", 6);
    let failed = false;
    try {
      await contractInstance
        .connect(reserve1)
        .transfer(reserve2.address, transferAmount);
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
    await expect(contractInstance.connect(freezer).unpause())
      .to.emit(contractInstance, "Unpaused")
      .withArgs(freezer.address);
  });
});
