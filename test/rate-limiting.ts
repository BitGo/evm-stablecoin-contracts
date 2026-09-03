// Copyright (c) 2026 BitGo, Inc. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import hre from "hardhat";
import { upgrades as upgradesFactory } from "@openzeppelin/hardhat-upgrades";
import { Stablecoin } from "../typechain-types";
const connection = await hre.network.getOrCreate();
const { ethers, networkHelpers } = connection;
const { time } = networkHelpers;
const upgrades = await upgradesFactory(hre, connection);

describe("Rate Limiting - Master Minter, Minter, and Bridge Minter", function () {
  let contractInstance: Stablecoin;
  let defaultAdmin: SignerWithAddress;
  let freezer: SignerWithAddress;
  let masterMinter: SignerWithAddress;
  let minter1: SignerWithAddress;
  let minter2: SignerWithAddress;
  let bridgeMinter1: SignerWithAddress;
  let bridgeMinter2: SignerWithAddress;
  let upgrader: SignerWithAddress;
  let blacklister: SignerWithAddress;
  let rescuer: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let randomAddress: SignerWithAddress;

  const MASTER_MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MASTER_MINTER_ROLE"));
  const MINTER = ethers.keccak256(ethers.toUtf8Bytes("MINTER"));
  const BRIDGE_MINTER = ethers.keccak256(ethers.toUtf8Bytes("BRIDGE_MINTER"));
  const addressZero = "0x0000000000000000000000000000000000000000";

  // 1M tokens with 6 decimals
  const DAILY_MINT_LIMIT = ethers.parseUnits("1000000", 6);
  const DAILY_BURN_LIMIT = ethers.parseUnits("1000000", 6);
  const PER_TX_CAP = ethers.parseUnits("500000", 6);

  before(async function () {
    [
      defaultAdmin,
      freezer,
      masterMinter,
      upgrader,
      blacklister,
      rescuer,
      minter1,
      minter2,
      bridgeMinter1,
      bridgeMinter2,
      user1,
      user2,
      randomAddress,
    ] = await ethers.getSigners();

    const ContractFactory = await ethers.getContractFactory("Stablecoin");
    const defaultAdminDelay = 7 * 24 * 60 * 60; // 7 days
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
        PER_TX_CAP
      ],
      { kind: "uups" }
    );
    contractInstance = (await contract.waitForDeployment()) as unknown as Stablecoin;
  });

  describe("Master Minter Role", function () {
    it("Should have master minter role assigned correctly", async function () {
      expect(await contractInstance.hasRole(MASTER_MINTER_ROLE, masterMinter.address)).to.be.true;
    });

    it("Should configure a native minter successfully", async function () {
      await expect(
        contractInstance
          .connect(masterMinter)
          .configureMinter(minter1.address, DAILY_MINT_LIMIT, DAILY_BURN_LIMIT)
      )
        .to.emit(contractInstance, "MinterConfigured")
        .withArgs(minter1.address, DAILY_MINT_LIMIT, DAILY_BURN_LIMIT, masterMinter.address);

      expect(await contractInstance.hasRole(MINTER, minter1.address)).to.be.true;
      expect(await contractInstance.isMinter(minter1.address)).to.be.true;
      expect(await contractInstance.mintingMaxLimitOf(minter1.address, false)).to.equal(DAILY_MINT_LIMIT);
      expect(await contractInstance.burningMaxLimitOf(minter1.address, false)).to.equal(DAILY_BURN_LIMIT);
    });

    it("Should configure a bridge minter successfully", async function () {
      await expect(
        contractInstance
          .connect(masterMinter)
          .configureBridgeMinter(bridgeMinter1.address, DAILY_MINT_LIMIT, DAILY_BURN_LIMIT)
      )
        .to.emit(contractInstance, "BridgeMinterConfigured")
        .withArgs(bridgeMinter1.address, DAILY_MINT_LIMIT, DAILY_BURN_LIMIT, masterMinter.address);

      expect(await contractInstance.hasRole(BRIDGE_MINTER, bridgeMinter1.address)).to.be.true;
      expect(await contractInstance.isBridgeMinter(bridgeMinter1.address)).to.be.true;
      expect(await contractInstance.mintingMaxLimitOf(bridgeMinter1.address, true)).to.equal(DAILY_MINT_LIMIT);
      expect(await contractInstance.burningMaxLimitOf(bridgeMinter1.address, true)).to.equal(DAILY_BURN_LIMIT);
    });

    it("Should fail to configure minter with address zero", async function () {
      await expect(
        contractInstance
          .connect(masterMinter)
          .configureMinter(addressZero, DAILY_MINT_LIMIT, DAILY_BURN_LIMIT)
      ).to.be.revertedWithCustomError(contractInstance, "InvalidAddress");
    });

    it("Should fail to configure minter with too high limits", async function () {
      const tooHighLimit = ethers.MaxUint256 / 2n + 1n;
      await expect(
        contractInstance
          .connect(masterMinter)
          .configureMinter(minter2.address, tooHighLimit, DAILY_BURN_LIMIT)
      ).to.be.revertedWithCustomError(contractInstance, "LimitsTooHigh");
    });

    it("Should fail to configure minter when called by non-master-minter", async function () {
      await expect(
        contractInstance
          .connect(randomAddress)
          .configureMinter(randomAddress.address, DAILY_MINT_LIMIT, DAILY_BURN_LIMIT)
      ).to.be.revert(ethers);
    });

    it("Should update minter limits successfully", async function () {
      const newMintLimit = ethers.parseUnits("2000000", 6);
      const newBurnLimit = ethers.parseUnits("2000000", 6);

      // When updating an existing minter, it emits MinterLimitsUpdated, not MinterConfigured
      await expect(
        contractInstance
          .connect(masterMinter)
          .configureMinter(minter1.address, newMintLimit, newBurnLimit)
      )
        .to.emit(contractInstance, "MinterLimitsUpdated")
        .withArgs(minter1.address, newMintLimit, newBurnLimit, false, masterMinter.address);

      expect(await contractInstance.mintingMaxLimitOf(minter1.address, false)).to.equal(newMintLimit);
      expect(await contractInstance.burningMaxLimitOf(minter1.address, false)).to.equal(newBurnLimit);
    });

    it("Should remove a native minter successfully", async function () {
      const currentMintLimit = ethers.parseUnits("2000000", 6); // From previous test update
      const currentBurnLimit = ethers.parseUnits("2000000", 6); // From previous test update
      
      await expect(
        contractInstance.connect(masterMinter).removeMinter(minter1.address)
      )
        .to.emit(contractInstance, "MinterRemoved")
        .withArgs(minter1.address, currentMintLimit, currentBurnLimit, masterMinter.address);

      expect(await contractInstance.hasRole(MINTER, minter1.address)).to.be.false;
      expect(await contractInstance.isMinter(minter1.address)).to.be.false;
      expect(await contractInstance.mintingMaxLimitOf(minter1.address, false)).to.equal(0);
    });

    it("Should remove a bridge minter successfully", async function () {
      await expect(
        contractInstance.connect(masterMinter).removeBridgeMinter(bridgeMinter1.address)
      )
        .to.emit(contractInstance, "BridgeMinterRemoved")
        .withArgs(bridgeMinter1.address, DAILY_MINT_LIMIT, DAILY_BURN_LIMIT, masterMinter.address);

      expect(await contractInstance.hasRole(BRIDGE_MINTER, bridgeMinter1.address)).to.be.false;
      expect(await contractInstance.isBridgeMinter(bridgeMinter1.address)).to.be.false;
      expect(await contractInstance.mintingMaxLimitOf(bridgeMinter1.address, true)).to.equal(0);
    });
  });

  describe("Native Minter Operations", function () {
    before(async function () {
      // Re-configure minter1 for tests
      await contractInstance
        .connect(masterMinter)
        .configureMinter(minter1.address, DAILY_MINT_LIMIT, DAILY_BURN_LIMIT);
    });

    it("Should mint tokens natively within limits", async function () {
      const mintAmount = ethers.parseUnits("100000", 6);

      await expect(
        contractInstance.connect(minter1).mint(user1.address, mintAmount)
      )
        .to.emit(contractInstance, "MintNative")
        .withArgs(minter1.address, user1.address, mintAmount)
        .to.emit(contractInstance, "Transfer")
        .withArgs(addressZero, user1.address, mintAmount);

      expect(await contractInstance.balanceOf(user1.address)).to.equal(mintAmount);
      
      // Check limit was reduced
      const currentLimit = await contractInstance.mintingCurrentLimitOf(minter1.address, false);
      expect(currentLimit).to.equal(DAILY_MINT_LIMIT - mintAmount);
    });

    it("Should fail to mint when minter is not configured", async function () {
      const mintAmount = ethers.parseUnits("100000", 6);

      await expect(
        contractInstance.connect(randomAddress).mint(user1.address, mintAmount)
      ).to.be.revert(ethers);
    });

    it("Should fail to mint exceeding daily limit", async function () {
      // Remove and re-configure minter with fresh limits for this test
      await contractInstance.connect(masterMinter).removeMinter(minter1.address);
      await contractInstance.connect(masterMinter).configureMinter(minter1.address, DAILY_MINT_LIMIT, DAILY_BURN_LIMIT);
      
      // Use up most of the daily limit with multiple transactions to stay under per-tx cap
      // Mint 500k twice to use 1M out of daily limit, leaving very little
      await contractInstance.connect(minter1).mint(user1.address, PER_TX_CAP);
      await contractInstance.connect(minter1).mint(user1.address, PER_TX_CAP);
      
      // Now we should have used about 1M, check remaining
      const remainingLimit = await contractInstance.minterAllowance(minter1.address);
      
      // Try to mint more than what's left (should be ~100k or less remaining)
      const exceedingAmount = remainingLimit + ethers.parseUnits("10000", 6);

      await expect(
        contractInstance.connect(minter1).mint(user1.address, exceedingAmount)
      ).to.be.revertedWithCustomError(contractInstance, "InsufficientMinterAllowance");
    });

    it("Should fail to mint exceeding per-transaction cap", async function () {
      const exceedingAmount = PER_TX_CAP + 1n;

      await expect(
        contractInstance.connect(minter1).mint(user1.address, exceedingAmount)
      ).to.be.revertedWithCustomError(contractInstance, "ExceedsMintTransactionCap");
    });

    it("Should fail to mint to blacklisted address", async function () {
      await contractInstance.connect(blacklister).blacklist(user2.address);
      const mintAmount = ethers.parseUnits("100000", 6);

      await expect(
        contractInstance.connect(minter1).mint(user2.address, mintAmount)
      ).to.be.revertedWithCustomError(contractInstance, "RecipientBlacklisted");

      await contractInstance.connect(blacklister).unblacklist(user2.address);
    });

    it("Should burn tokens natively within limits", async function () {
      const burnAmount = ethers.parseUnits("50000", 6);
      const balanceBefore = await contractInstance.balanceOf(user1.address);

      // User1 must approve minter1 to burn their tokens
      await contractInstance.connect(user1).approve(minter1.address, burnAmount);

      await expect(
        contractInstance.connect(minter1).burn(user1.address, burnAmount)
      )
        .to.emit(contractInstance, "BurnNative")
        .withArgs(minter1.address, user1.address, burnAmount)
        .to.emit(contractInstance, "Transfer")
        .withArgs(user1.address, addressZero, burnAmount);

      expect(await contractInstance.balanceOf(user1.address)).to.equal(balanceBefore - burnAmount);
    });

    it("Should fail to burn exceeding daily limit", async function () {
      // First, use up most of the burn limit by burning tokens
      const user1Balance = await contractInstance.balanceOf(user1.address);
      const currentBurnLimit = await contractInstance.burningCurrentLimitOf(minter1.address, false);
      
      // Burn most of the available limit, leaving only 1000 tokens
      const amountToBurn = currentBurnLimit - ethers.parseUnits("1000", 6);
      
      if (amountToBurn > 0n && amountToBurn <= user1Balance) {
        // User1 approves minter1 to burn tokens
        await contractInstance.connect(user1).approve(minter1.address, amountToBurn);
        await contractInstance.connect(minter1).burn(user1.address, amountToBurn);
      }
      
      // Now try to burn more than what's left in the daily limit
      const remainingLimit = await contractInstance.burningCurrentLimitOf(minter1.address, false);
      const exceedingAmount = remainingLimit + ethers.parseUnits("1000", 6);

      // User1 approves the exceeding amount
      await contractInstance.connect(user1).approve(minter1.address, exceedingAmount);

      await expect(
        contractInstance.connect(minter1).burn(user1.address, exceedingAmount)
      ).to.be.revertedWithCustomError(contractInstance, "InsufficientBurnerAllowance");
    });

    it("Should mint batch successfully within limits", async function () {
      // Reset minter limits for this test
      await contractInstance.connect(masterMinter).removeMinter(minter1.address);
      await contractInstance.connect(masterMinter).configureMinter(minter1.address, DAILY_MINT_LIMIT, DAILY_BURN_LIMIT);
      
      const amounts = [
        ethers.parseUnits("10000", 6),
        ethers.parseUnits("20000", 6),
        ethers.parseUnits("30000", 6),
      ];
      const addresses = [user1.address, user2.address, randomAddress.address];

      await expect(
        contractInstance.connect(minter1).mintBatch(addresses, amounts)
      )
        .to.emit(contractInstance, "MintNative")
        .withArgs(minter1.address, user1.address, amounts[0]);

      expect(await contractInstance.balanceOf(addresses[2])).to.equal(amounts[2]);
    });

    it("Should fail mint batch with mismatched array lengths", async function () {
      const amounts = [ethers.parseUnits("10000", 6), ethers.parseUnits("20000", 6)];
      const addresses = [user1.address];

      await expect(
        contractInstance.connect(minter1).mintBatch(addresses, amounts)
      ).to.be.revertedWithCustomError(contractInstance, "ArrayLengthsMismatch");
    });
  });

  describe("Bridge Minter Operations", function () {
    before(async function () {
      // Re-configure bridgeMinter1 for tests
      await contractInstance
        .connect(masterMinter)
        .configureBridgeMinter(bridgeMinter1.address, DAILY_MINT_LIMIT, DAILY_BURN_LIMIT);
    });

    it("Should mint tokens via bridge within limits", async function () {
      const mintAmount = ethers.parseUnits("100000", 6);

      await expect(
        contractInstance.connect(bridgeMinter1).bridgeMint(user1.address, mintAmount)
      )
        .to.emit(contractInstance, "MintBridge")
        .withArgs(bridgeMinter1.address, user1.address, mintAmount)
        .to.emit(contractInstance, "Transfer")
        .withArgs(addressZero, user1.address, mintAmount);

      const currentLimit = await contractInstance.bridgeMinterAllowance(bridgeMinter1.address);
      expect(currentLimit).to.equal(DAILY_MINT_LIMIT - mintAmount);
    });

    it("Should fail to bridge mint when not configured", async function () {
      const mintAmount = ethers.parseUnits("100000", 6);

      await expect(
        contractInstance.connect(randomAddress).bridgeMint(user1.address, mintAmount)
      ).to.be.revert(ethers);
    });

    it("Should fail to bridge mint exceeding daily limit", async function () {
      // Remove and re-configure bridge minter with fresh limits for this test
      await contractInstance.connect(masterMinter).removeBridgeMinter(bridgeMinter1.address);
      await contractInstance.connect(masterMinter).configureBridgeMinter(bridgeMinter1.address, DAILY_MINT_LIMIT, DAILY_BURN_LIMIT);
      
      // Use up most of the daily limit with multiple transactions to stay under per-tx cap
      // Mint 500k twice to use 1M out of daily limit, leaving very little
      await contractInstance.connect(bridgeMinter1).bridgeMint(user1.address, PER_TX_CAP);
      await contractInstance.connect(bridgeMinter1).bridgeMint(user1.address, PER_TX_CAP);
      
      // Now we should have used about 1M, check remaining
      const remainingLimit = await contractInstance.bridgeMinterAllowance(bridgeMinter1.address);
      
      // Try to mint more than what's left (should be ~100k or less remaining)
      const exceedingAmount = remainingLimit + ethers.parseUnits("10000", 6);

      await expect(
        contractInstance.connect(bridgeMinter1).bridgeMint(user1.address, exceedingAmount)
      ).to.be.revertedWithCustomError(contractInstance, "InsufficientMinterAllowance");
    });

    it("Should burn tokens via bridge within limits", async function () {
      const burnAmount = ethers.parseUnits("50000", 6);
      const balanceBefore = await contractInstance.balanceOf(user1.address);

      // User1 must approve bridgeMinter1 to burn their tokens
      await contractInstance.connect(user1).approve(bridgeMinter1.address, burnAmount);

      await expect(
        contractInstance.connect(bridgeMinter1).bridgeBurn(user1.address, burnAmount)
      )
        .to.emit(contractInstance, "BurnBridge")
        .withArgs(bridgeMinter1.address, user1.address, burnAmount)
        .to.emit(contractInstance, "Transfer")
        .withArgs(user1.address, addressZero, burnAmount);

      expect(await contractInstance.balanceOf(user1.address)).to.equal(balanceBefore - burnAmount);
    });

    it("Should mint batch via bridge successfully", async function () {
      // Reset bridge minter limits for this test
      await contractInstance.connect(masterMinter).removeBridgeMinter(bridgeMinter1.address);
      await contractInstance.connect(masterMinter).configureBridgeMinter(bridgeMinter1.address, DAILY_MINT_LIMIT, DAILY_BURN_LIMIT);
      
      const amounts = [
        ethers.parseUnits("10000", 6),
        ethers.parseUnits("20000", 6),
      ];
      const addresses = [user1.address, user2.address];

      await expect(
        contractInstance.connect(bridgeMinter1).bridgeMintBatch(addresses, amounts)
      )
        .to.emit(contractInstance, "MintBridge")
        .withArgs(bridgeMinter1.address, user1.address, amounts[0]);
    });
  });

  describe("Rate Limit Replenishment", function () {
    before(async function () {
      // Configure minter2 with fresh limits
      await contractInstance
        .connect(masterMinter)
        .configureMinter(minter2.address, DAILY_MINT_LIMIT, DAILY_BURN_LIMIT);
    });

    it("Should replenish limits over time", async function () {
      const mintAmount = ethers.parseUnits("500000", 6);
      
      // Use half the daily limit
      await contractInstance.connect(minter2).mint(user1.address, mintAmount);
      
      const limitAfterMint = await contractInstance.mintingCurrentLimitOf(minter2.address, false);
      expect(limitAfterMint).to.equal(DAILY_MINT_LIMIT - mintAmount);

      // Fast forward 12 hours (half a day)
      await time.increase(12 * 60 * 60);

      // Check limit has replenished
      const limitAfterTime = await contractInstance.mintingCurrentLimitOf(minter2.address, false);
      expect(limitAfterTime).to.be.gt(limitAfterMint);
      
      // The rate is DAILY_MINT_LIMIT / 86400 per second
      // After 12 hours (43200 seconds), we should have replenished: (DAILY_MINT_LIMIT / 86400) * 43200 = DAILY_MINT_LIMIT / 2
      // So the limit should be: (DAILY_MINT_LIMIT - mintAmount) + (DAILY_MINT_LIMIT / 2)
      // Which simplifies to: DAILY_MINT_LIMIT - mintAmount / 2
      const expectedLimit = limitAfterMint + (DAILY_MINT_LIMIT / 2n);
      
      // Allow for some rounding tolerance
      expect(limitAfterTime).to.be.closeTo(expectedLimit, ethers.parseUnits("1000", 6));
    });

    it("Should fully replenish after 24 hours", async function () {
      const mintAmount = ethers.parseUnits("300000", 6);
      
      await contractInstance.connect(minter2).mint(user1.address, mintAmount);
      
      // Fast forward 24 hours
      await time.increase(24 * 60 * 60);

      const limitAfterDay = await contractInstance.mintingCurrentLimitOf(minter2.address, false);
      expect(limitAfterDay).to.equal(DAILY_MINT_LIMIT);
    });

    it("Should not exceed max limit even after long time", async function () {
      // Fast forward 48 hours
      await time.increase(48 * 60 * 60);

      const limit = await contractInstance.mintingCurrentLimitOf(minter2.address, false);
      expect(limit).to.equal(DAILY_MINT_LIMIT);
    });
  });

  describe("Multiple Minters Independence", function () {
    before(async function () {
      // Configure both minters
      await contractInstance
        .connect(masterMinter)
        .configureMinter(minter1.address, DAILY_MINT_LIMIT, DAILY_BURN_LIMIT);
      await contractInstance
        .connect(masterMinter)
        .configureBridgeMinter(bridgeMinter2.address, DAILY_MINT_LIMIT / 2n, DAILY_BURN_LIMIT / 2n);
    });

    it("Should have independent limits for different minters", async function () {
      const mintAmount1 = ethers.parseUnits("400000", 6);
      const mintAmount2 = ethers.parseUnits("200000", 6);

      // Minter1 mints
      await contractInstance.connect(minter1).mint(user1.address, mintAmount1);
      const limit1 = await contractInstance.minterAllowance(minter1.address);

      // BridgeMinter2 mints (different minter type)
      await contractInstance.connect(bridgeMinter2).bridgeMint(user2.address, mintAmount2);
      const limit2 = await contractInstance.bridgeMinterAllowance(bridgeMinter2.address);

      // Check limits are independent
      expect(limit1).to.equal(DAILY_MINT_LIMIT - mintAmount1);
      expect(limit2).to.equal(DAILY_MINT_LIMIT / 2n - mintAmount2);
    });
  });

  describe("View Functions", function () {
    it("Should return correct max limits", async function () {
      const mintLimit = await contractInstance.mintingMaxLimitOf(minter1.address, false);
      const burnLimit = await contractInstance.burningMaxLimitOf(minter1.address, false);

      expect(mintLimit).to.equal(DAILY_MINT_LIMIT);
      expect(burnLimit).to.equal(DAILY_BURN_LIMIT);
    });

    it("Should return correct current limits", async function () {
      const currentMintLimit = await contractInstance.mintingCurrentLimitOf(minter1.address, false);
      const currentBurnLimit = await contractInstance.burningCurrentLimitOf(minter1.address, false);

      expect(currentMintLimit).to.be.lte(DAILY_MINT_LIMIT);
      expect(currentBurnLimit).to.be.lte(DAILY_BURN_LIMIT);
    });

    it("Should correctly identify minters", async function () {
      expect(await contractInstance.isMinter(minter1.address)).to.be.true;
      expect(await contractInstance.isMinter(randomAddress.address)).to.be.false;
      // bridgeMinter1 was re-configured in "Bridge Minter Operations" section, so should be true
      expect(await contractInstance.isBridgeMinter(bridgeMinter1.address)).to.be.true;
      expect(await contractInstance.isBridgeMinter(bridgeMinter2.address)).to.be.true;
    });
  });

  describe("Minimum Limit Validation", function () {
    it("Should revert when configuring minter with mint limit below minimum", async function () {
      // _MIN_LIMIT is 86400 in raw units (not with decimals)
      // So we need a value less than 86400, like 50000 raw units
      const belowMinLimit = 50000; // Less than _MIN_LIMIT (86400) in raw units
      
      await expect(
        contractInstance.connect(masterMinter).configureMinter(
          user1.address, // Use a different address
          belowMinLimit,
          DAILY_BURN_LIMIT
        )
      ).to.be.revertedWithCustomError(contractInstance, "LimitTooLow");
    });

    it("Should revert when configuring minter with burn limit below minimum", async function () {
      const belowMinLimit = 50000; // Less than _MIN_LIMIT (86400) in raw units
      
      await expect(
        contractInstance.connect(masterMinter).configureMinter(
          user2.address, // Use a different address
          DAILY_MINT_LIMIT,
          belowMinLimit
        )
      ).to.be.revertedWithCustomError(contractInstance, "LimitTooLow");
    });

    it("Should revert when configuring bridge minter with limit below minimum", async function () {
      const belowMinLimit = 50000; // Less than _MIN_LIMIT (86400) in raw units
      
      await expect(
        contractInstance.connect(masterMinter).configureBridgeMinter(
          user1.address, // Use a different address
          belowMinLimit,
          DAILY_BURN_LIMIT
        )
      ).to.be.revertedWithCustomError(contractInstance, "LimitTooLow");
    });

    it("Should accept limit at exactly the minimum threshold", async function () {
      const minLimit = 86400; // Exactly _MIN_LIMIT in raw units
      
      await expect(
        contractInstance.connect(masterMinter).configureMinter(
          user2.address, // Use a different address that's not already configured
          minLimit,
          minLimit
        )
      ).to.emit(contractInstance, "MinterConfigured");
      
      // Cleanup
      await contractInstance.connect(masterMinter).removeMinter(user2.address);
    });
  });

  describe("Custom Error Tests", function () {
    it("Should revert with AccountAlreadyMinter when bridge account has MINTER role", async function () {
      // First configure as minter
      await contractInstance.connect(masterMinter).configureMinter(
        randomAddress.address,
        DAILY_MINT_LIMIT,
        DAILY_BURN_LIMIT
      );
      
      // Try to configure same address as bridge minter
      await expect(
        contractInstance.connect(masterMinter).configureBridgeMinter(
          randomAddress.address,
          DAILY_MINT_LIMIT,
          DAILY_BURN_LIMIT
        )
      ).to.be.revertedWithCustomError(contractInstance, "AccountAlreadyMinter");
      
      // Cleanup
      await contractInstance.connect(masterMinter).removeMinter(randomAddress.address);
    });

    it("Should revert with AccountAlreadyBridgeMinter when minter account has BRIDGE_MINTER role", async function () {
      // First configure as bridge minter
      await contractInstance.connect(masterMinter).configureBridgeMinter(
        randomAddress.address,
        DAILY_MINT_LIMIT,
        DAILY_BURN_LIMIT
      );
      
      // Try to configure same address as minter
      await expect(
        contractInstance.connect(masterMinter).configureMinter(
          randomAddress.address,
          DAILY_MINT_LIMIT,
          DAILY_BURN_LIMIT
        )
      ).to.be.revertedWithCustomError(contractInstance, "AccountAlreadyBridgeMinter");
      
      // Cleanup
      await contractInstance.connect(masterMinter).removeBridgeMinter(randomAddress.address);
    });
  });

  describe("Limit Update Event", function () {
    it("Should emit MinterLimitsUpdated when updating existing minter", async function () {
      // First configure minter
      await contractInstance.connect(masterMinter).configureMinter(
        randomAddress.address,
        DAILY_MINT_LIMIT,
        DAILY_BURN_LIMIT
      );
      
      const newMintLimit = ethers.parseUnits("2000000", 6);
      const newBurnLimit = ethers.parseUnits("2000000", 6);
      
      // Update limits
      await expect(
        contractInstance.connect(masterMinter).configureMinter(
          randomAddress.address,
          newMintLimit,
          newBurnLimit
        )
      ).to.emit(contractInstance, "MinterLimitsUpdated")
        .withArgs(randomAddress.address, newMintLimit, newBurnLimit, false, masterMinter.address);
      
      // Cleanup
      await contractInstance.connect(masterMinter).removeMinter(randomAddress.address);
    });

    it("Should emit BridgeMinterConfigured for new bridge minter, not update event", async function () {
      await expect(
        contractInstance.connect(masterMinter).configureBridgeMinter(
          randomAddress.address,
          DAILY_MINT_LIMIT,
          DAILY_BURN_LIMIT
        )
      ).to.emit(contractInstance, "BridgeMinterConfigured")
        .withArgs(randomAddress.address, DAILY_MINT_LIMIT, DAILY_BURN_LIMIT, masterMinter.address);
      
      // Cleanup
      await contractInstance.connect(masterMinter).removeBridgeMinter(randomAddress.address);
    });
  });

  describe("Destroy Blacklisted Funds", function () {
    it("Should destroy blacklisted funds by master minter", async function () {
      const mintAmount = ethers.parseUnits("100000", 6);
      
      // Mint to user
      await contractInstance.connect(minter1).mint(user2.address, mintAmount);
      
      // Blacklist user
      await contractInstance.connect(blacklister).blacklist(user2.address);
      
      const balanceBefore = await contractInstance.balanceOf(user2.address);
      
      await expect(
        contractInstance.connect(masterMinter).destroyBlacklistedFunds(user2.address)
      )
        .to.emit(contractInstance, "BurnNative")
        .withArgs(masterMinter.address, user2.address, balanceBefore);

      expect(await contractInstance.balanceOf(user2.address)).to.equal(0);
      
      await contractInstance.connect(blacklister).unblacklist(user2.address);
    });

    it("Should fail to destroy funds of non-blacklisted address", async function () {
      await expect(
        contractInstance.connect(masterMinter).destroyBlacklistedFunds(user1.address)
      ).to.be.revertedWithCustomError(contractInstance, "SenderNotBlacklisted");
    });
  });

  describe("Emergency Limit Replenishment", function () {
    let testMinter: SignerWithAddress;
    let testBridgeMinter: SignerWithAddress;

    before(async function () {
      [, , , , , , , , , , , , , testMinter, testBridgeMinter] = await ethers.getSigners();
      
      // Configure fresh minters for testing
      await contractInstance
        .connect(masterMinter)
        .configureMinter(testMinter.address, DAILY_MINT_LIMIT, DAILY_BURN_LIMIT);
      
      await contractInstance
        .connect(masterMinter)
        .configureBridgeMinter(testBridgeMinter.address, DAILY_MINT_LIMIT, DAILY_BURN_LIMIT);
    });

    it("Should replenish native minter limits to maximum", async function () {
      // Use some of the minter's limits
      const mintAmount = ethers.parseUnits("400000", 6);
      const burnAmount = ethers.parseUnits("300000", 6);
      
      await contractInstance.connect(testMinter).mint(user1.address, mintAmount);
      
      // User1 must approve testMinter to burn their tokens
      await contractInstance.connect(user1).approve(testMinter.address, burnAmount);
      await contractInstance.connect(testMinter).burn(user1.address, burnAmount);
      
      // Verify limits are reduced
      let currentMintLimit = await contractInstance.mintingCurrentLimitOf(testMinter.address, false);
      let currentBurnLimit = await contractInstance.burningCurrentLimitOf(testMinter.address, false);
      
      expect(currentMintLimit).to.be.lt(DAILY_MINT_LIMIT);
      expect(currentBurnLimit).to.be.lt(DAILY_BURN_LIMIT);
      
      // Replenish limits
      await expect(
        contractInstance.connect(masterMinter).replenishMinterLimits(testMinter.address, false)
      )
        .to.emit(contractInstance, "MinterLimitsReplenished")
        .withArgs(testMinter.address, false, masterMinter.address);
      
      // Verify limits are now at maximum
      currentMintLimit = await contractInstance.mintingCurrentLimitOf(testMinter.address, false);
      currentBurnLimit = await contractInstance.burningCurrentLimitOf(testMinter.address, false);
      
      expect(currentMintLimit).to.equal(DAILY_MINT_LIMIT);
      expect(currentBurnLimit).to.equal(DAILY_BURN_LIMIT);
    });

    it("Should replenish bridge minter limits to maximum", async function () {
      // Use some of the bridge minter's limits
      const mintAmount = ethers.parseUnits("450000", 6);
      const burnAmount = ethers.parseUnits("250000", 6);
      
      await contractInstance.connect(testBridgeMinter).bridgeMint(user1.address, mintAmount);
      
      // User1 must approve testBridgeMinter to burn their tokens
      await contractInstance.connect(user1).approve(testBridgeMinter.address, burnAmount);
      await contractInstance.connect(testBridgeMinter).bridgeBurn(user1.address, burnAmount);
      
      // Verify limits are reduced
      let currentMintLimit = await contractInstance.mintingCurrentLimitOf(testBridgeMinter.address, true);
      let currentBurnLimit = await contractInstance.burningCurrentLimitOf(testBridgeMinter.address, true);
      
      expect(currentMintLimit).to.be.lt(DAILY_MINT_LIMIT);
      expect(currentBurnLimit).to.be.lt(DAILY_BURN_LIMIT);
      
      // Replenish limits
      await expect(
        contractInstance.connect(masterMinter).replenishMinterLimits(testBridgeMinter.address, true)
      )
        .to.emit(contractInstance, "MinterLimitsReplenished")
        .withArgs(testBridgeMinter.address, true, masterMinter.address);
      
      // Verify limits are now at maximum
      currentMintLimit = await contractInstance.mintingCurrentLimitOf(testBridgeMinter.address, true);
      currentBurnLimit = await contractInstance.burningCurrentLimitOf(testBridgeMinter.address, true);
      
      expect(currentMintLimit).to.equal(DAILY_MINT_LIMIT);
      expect(currentBurnLimit).to.equal(DAILY_BURN_LIMIT);
    });

    it("Should allow minting at full capacity immediately after replenishment", async function () {
      // Use most of the limit
      await contractInstance.connect(testMinter).mint(user1.address, PER_TX_CAP);
      await contractInstance.connect(testMinter).mint(user1.address, PER_TX_CAP);
      
      const remainingLimit = await contractInstance.mintingCurrentLimitOf(testMinter.address, false);
      expect(remainingLimit).to.be.lt(PER_TX_CAP);
      
      // Replenish
      await contractInstance.connect(masterMinter).replenishMinterLimits(testMinter.address, false);
      
      // Should be able to mint at full capacity again
      await expect(
        contractInstance.connect(testMinter).mint(user1.address, PER_TX_CAP)
      ).to.emit(contractInstance, "MintNative");
      
      const newLimit = await contractInstance.mintingCurrentLimitOf(testMinter.address, false);
      expect(newLimit).to.equal(DAILY_MINT_LIMIT - PER_TX_CAP);
    });

    it("Should replenish both mint and burn limits simultaneously", async function () {
      // Drain both limits significantly
      await contractInstance.connect(testMinter).mint(user1.address, PER_TX_CAP);
      
      // User1 must approve testMinter to burn their tokens
      await contractInstance.connect(user1).approve(testMinter.address, PER_TX_CAP);
      await contractInstance.connect(testMinter).burn(user1.address, PER_TX_CAP);
      
      const mintLimitBefore = await contractInstance.mintingCurrentLimitOf(testMinter.address, false);
      const burnLimitBefore = await contractInstance.burningCurrentLimitOf(testMinter.address, false);
      
      expect(mintLimitBefore).to.be.lt(DAILY_MINT_LIMIT);
      expect(burnLimitBefore).to.be.lt(DAILY_BURN_LIMIT);
      
      // Replenish
      await contractInstance.connect(masterMinter).replenishMinterLimits(testMinter.address, false);
      
      // Check both limits are replenished
      const mintLimitAfter = await contractInstance.mintingCurrentLimitOf(testMinter.address, false);
      const burnLimitAfter = await contractInstance.burningCurrentLimitOf(testMinter.address, false);
      
      expect(mintLimitAfter).to.equal(DAILY_MINT_LIMIT);
      expect(burnLimitAfter).to.equal(DAILY_BURN_LIMIT);
    });

    it("Should work even when limits are already at maximum", async function () {
      // Wait for natural replenishment
      await time.increase(24 * 60 * 60);
      
      const mintLimitBefore = await contractInstance.mintingCurrentLimitOf(testMinter.address, false);
      const burnLimitBefore = await contractInstance.burningCurrentLimitOf(testMinter.address, false);
      
      expect(mintLimitBefore).to.equal(DAILY_MINT_LIMIT);
      expect(burnLimitBefore).to.equal(DAILY_BURN_LIMIT);
      
      // Replenish anyway (should not fail)
      await expect(
        contractInstance.connect(masterMinter).replenishMinterLimits(testMinter.address, false)
      )
        .to.emit(contractInstance, "MinterLimitsReplenished")
        .withArgs(testMinter.address, false, masterMinter.address);
      
      // Limits should still be at max
      const mintLimitAfter = await contractInstance.mintingCurrentLimitOf(testMinter.address, false);
      const burnLimitAfter = await contractInstance.burningCurrentLimitOf(testMinter.address, false);
      
      expect(mintLimitAfter).to.equal(DAILY_MINT_LIMIT);
      expect(burnLimitAfter).to.equal(DAILY_BURN_LIMIT);
    });

    it("Should fail when called by non-master-minter", async function () {
      await expect(
        contractInstance.connect(randomAddress).replenishMinterLimits(testMinter.address, false)
      ).to.be.revert(ethers);
    });

    it("Should fail when replenishing non-configured native minter", async function () {
      await expect(
        contractInstance.connect(masterMinter).replenishMinterLimits(randomAddress.address, false)
      ).to.be.revertedWithCustomError(contractInstance, "MinterNotConfigured");
    });

    it("Should fail when replenishing non-configured bridge minter", async function () {
      await expect(
        contractInstance.connect(masterMinter).replenishMinterLimits(randomAddress.address, true)
      ).to.be.revertedWithCustomError(contractInstance, "BridgeMinterNotConfigured");
    });

    it("Should fail when replenishing removed minter", async function () {
      // Create and then remove a minter
      const tempMinter = user2;
      await contractInstance.connect(masterMinter).configureMinter(
        tempMinter.address,
        DAILY_MINT_LIMIT,
        DAILY_BURN_LIMIT
      );
      await contractInstance.connect(masterMinter).removeMinter(tempMinter.address);
      
      // Try to replenish the removed minter
      await expect(
        contractInstance.connect(masterMinter).replenishMinterLimits(tempMinter.address, false)
      ).to.be.revertedWithCustomError(contractInstance, "MinterNotConfigured");
    });

    it("Should bypass time-based replenishment", async function () {
      // Use some limits
      const mintAmount = ethers.parseUnits("300000", 6);
      await contractInstance.connect(testMinter).mint(user1.address, mintAmount);
      
      const limitAfterMint = await contractInstance.mintingCurrentLimitOf(testMinter.address, false);
      expect(limitAfterMint).to.equal(DAILY_MINT_LIMIT - mintAmount);
      
      // Instead of waiting, immediately replenish
      await contractInstance.connect(masterMinter).replenishMinterLimits(testMinter.address, false);
      
      // Should be at max immediately without time passage
      const limitAfterReplenish = await contractInstance.mintingCurrentLimitOf(testMinter.address, false);
      expect(limitAfterReplenish).to.equal(DAILY_MINT_LIMIT);
    });

    it("Should handle multiple sequential replenishments", async function () {
      // First replenishment
      await contractInstance.connect(masterMinter).replenishMinterLimits(testMinter.address, false);
      let mintLimit = await contractInstance.mintingCurrentLimitOf(testMinter.address, false);
      expect(mintLimit).to.equal(DAILY_MINT_LIMIT);
      
      // Use some limit
      await contractInstance.connect(testMinter).mint(user1.address, ethers.parseUnits("100000", 6));
      
      // Second replenishment
      await contractInstance.connect(masterMinter).replenishMinterLimits(testMinter.address, false);
      mintLimit = await contractInstance.mintingCurrentLimitOf(testMinter.address, false);
      expect(mintLimit).to.equal(DAILY_MINT_LIMIT);
      
      // Use some limit again
      await contractInstance.connect(testMinter).mint(user1.address, ethers.parseUnits("200000", 6));
      
      // Third replenishment
      await contractInstance.connect(masterMinter).replenishMinterLimits(testMinter.address, false);
      mintLimit = await contractInstance.mintingCurrentLimitOf(testMinter.address, false);
      expect(mintLimit).to.equal(DAILY_MINT_LIMIT);
    });
  });
});
