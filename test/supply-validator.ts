// Copyright (c) 2026 BitGo, Inc. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Stablecoin, MockSupplyValidator } from "../typechain-types";

describe("Supply Validator", function () {
  let contractInstance: Stablecoin;
  let mockValidator: MockSupplyValidator;
  let defaultAdmin: SignerWithAddress;
  let freezer: SignerWithAddress;
  let masterMinter: SignerWithAddress;
  let minter: SignerWithAddress;
  let bridgeMinter: SignerWithAddress;
  let upgrader: SignerWithAddress;
  let blacklister: SignerWithAddress;
  let rescuer: SignerWithAddress;
  let recipient: SignerWithAddress;
  let unauthorized: SignerWithAddress;
  const addressZero = "0x0000000000000000000000000000000000000000";
  const DAILY_LIMIT = ethers.parseUnits("10000000", 6); // 10M tokens daily limit

  beforeEach(async function () {
    [
      defaultAdmin,
      freezer,
      masterMinter,
      minter,
      bridgeMinter,
      upgrader,
      blacklister,
      rescuer,
      recipient,
      unauthorized,
    ] = await ethers.getSigners();

    // Deploy Stablecoin contract
    const StablecoinFactory = await ethers.getContractFactory("Stablecoin");
    const defaultAdminDelay = 7 * 24 * 60 * 60; // 7 days
    const contract = await upgrades.deployProxy(
      StablecoinFactory,
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
    contractInstance = (await contract.waitForDeployment()) as unknown as Stablecoin;

    // Deploy MockSupplyValidator
    const MockValidatorFactory = await ethers.getContractFactory("MockSupplyValidator");
    mockValidator = await MockValidatorFactory.deploy();
    await mockValidator.waitForDeployment();

    // Configure minter and bridge minter with limits
    await contractInstance.connect(masterMinter).configureMinter(minter.address, DAILY_LIMIT, DAILY_LIMIT);
    await contractInstance.connect(masterMinter).configureBridgeMinter(bridgeMinter.address, DAILY_LIMIT, DAILY_LIMIT);
  });

  describe("Supply Validator Management", function () {
    it("Should set supply validator successfully by DEFAULT_ADMIN", async function () {
      await expect(
        contractInstance.connect(defaultAdmin).setSupplyValidator(mockValidator.getAddress())
      )
        .to.emit(contractInstance, "SupplyValidatorUpdated")
        .withArgs(addressZero, await mockValidator.getAddress(), defaultAdmin.address);

      expect(await contractInstance.getSupplyValidator()).to.equal(await mockValidator.getAddress());
    });

    it("Should fail to set supply validator by unauthorized address", async function () {
      await expect(
        contractInstance.connect(unauthorized).setSupplyValidator(mockValidator.getAddress())
      ).to.be.reverted;
    });

    it("Should allow setting validator to zero address (disable validation)", async function () {
      // First set a validator
      await contractInstance.connect(defaultAdmin).setSupplyValidator(mockValidator.getAddress());
      expect(await contractInstance.getSupplyValidator()).to.equal(await mockValidator.getAddress());

      // Then disable it by setting to zero address
      await expect(
        contractInstance.connect(defaultAdmin).setSupplyValidator(addressZero)
      )
        .to.emit(contractInstance, "SupplyValidatorUpdated")
        .withArgs(await mockValidator.getAddress(), addressZero, defaultAdmin.address);

      expect(await contractInstance.getSupplyValidator()).to.equal(addressZero);
    });

    it("Should get supply validator address", async function () {
      expect(await contractInstance.getSupplyValidator()).to.equal(addressZero);

      await contractInstance.connect(defaultAdmin).setSupplyValidator(mockValidator.getAddress());
      expect(await contractInstance.getSupplyValidator()).to.equal(await mockValidator.getAddress());
    });

    it("Should emit SupplyValidatorUpdated event when validator is set", async function () {
      const validatorAddress = await mockValidator.getAddress();
      
      await expect(
        contractInstance.connect(defaultAdmin).setSupplyValidator(validatorAddress)
      )
        .to.emit(contractInstance, "SupplyValidatorUpdated")
        .withArgs(addressZero, validatorAddress, defaultAdmin.address);
    });

    it("Should update validator from one address to another", async function () {
      const validatorAddress1 = await mockValidator.getAddress();
      
      // Set first validator
      await contractInstance.connect(defaultAdmin).setSupplyValidator(validatorAddress1);
      
      // Deploy second validator
      const MockValidatorFactory = await ethers.getContractFactory("MockSupplyValidator");
      const mockValidator2 = await MockValidatorFactory.deploy();
      const validatorAddress2 = await mockValidator2.getAddress();
      
      // Update to second validator
      await expect(
        contractInstance.connect(defaultAdmin).setSupplyValidator(validatorAddress2)
      )
        .to.emit(contractInstance, "SupplyValidatorUpdated")
        .withArgs(validatorAddress1, validatorAddress2, defaultAdmin.address);
        
      expect(await contractInstance.getSupplyValidator()).to.equal(validatorAddress2);
    });
  });

  describe("Validator Integration - Native Minting", function () {
    beforeEach(async function () {
      await contractInstance.connect(defaultAdmin).setSupplyValidator(mockValidator.getAddress());
    });

    it("Should call validator on native mint operations", async function () {
      const mintAmount = ethers.parseUnits("1000", 6);
      
      await contractInstance.connect(minter).mint(recipient.address, mintAmount);
      
      expect(await mockValidator.mintCallCount()).to.equal(1);
      expect(await mockValidator.lastMintAccount()).to.equal(recipient.address);
      expect(await mockValidator.lastMintAmount()).to.equal(mintAmount);
      expect(await mockValidator.lastMintMinter()).to.equal(minter.address);
      expect(await mockValidator.lastMintIsBridge()).to.equal(false);
    });

    it("Should pass correct parameters to validator for native mint", async function () {
      const mintAmount = ethers.parseUnits("5000", 6);
      
      await contractInstance.connect(minter).mint(recipient.address, mintAmount);
      
      expect(await mockValidator.lastMintAccount()).to.equal(recipient.address);
      expect(await mockValidator.lastMintAmount()).to.equal(mintAmount);
      expect(await mockValidator.lastMintMinter()).to.equal(minter.address);
      expect(await mockValidator.lastMintIsBridge()).to.equal(false);
    });

    it("Should revert mint if validator reverts", async function () {
      const mintAmount = ethers.parseUnits("1000", 6);
      
      // Configure validator to reject mints
      await mockValidator.setRejectMint(true);
      
      await expect(
        contractInstance.connect(minter).mint(recipient.address, mintAmount)
      ).to.be.revertedWith("MockValidator: Mint rejected");
    });

    it("Should allow mint when validator accepts", async function () {
      const mintAmount = ethers.parseUnits("1000", 6);
      
      // Validator accepts by default
      await expect(
        contractInstance.connect(minter).mint(recipient.address, mintAmount)
      )
        .to.emit(contractInstance, "MintNative")
        .withArgs(minter.address, recipient.address, mintAmount);
        
      expect(await contractInstance.balanceOf(recipient.address)).to.equal(mintAmount);
    });
  });

  describe("Validator Integration - Bridge Minting", function () {
    beforeEach(async function () {
      await contractInstance.connect(defaultAdmin).setSupplyValidator(mockValidator.getAddress());
    });

    it("Should call validator on bridge mint operations", async function () {
      const mintAmount = ethers.parseUnits("2000", 6);
      
      await contractInstance.connect(bridgeMinter).bridgeMint(recipient.address, mintAmount);
      
      expect(await mockValidator.mintCallCount()).to.equal(1);
      expect(await mockValidator.lastMintAccount()).to.equal(recipient.address);
      expect(await mockValidator.lastMintAmount()).to.equal(mintAmount);
      expect(await mockValidator.lastMintMinter()).to.equal(bridgeMinter.address);
      expect(await mockValidator.lastMintIsBridge()).to.equal(true);
    });

    it("Should pass correct parameters to validator for bridge mint", async function () {
      const mintAmount = ethers.parseUnits("3000", 6);
      
      await contractInstance.connect(bridgeMinter).bridgeMint(recipient.address, mintAmount);
      
      expect(await mockValidator.lastMintAccount()).to.equal(recipient.address);
      expect(await mockValidator.lastMintAmount()).to.equal(mintAmount);
      expect(await mockValidator.lastMintMinter()).to.equal(bridgeMinter.address);
      expect(await mockValidator.lastMintIsBridge()).to.equal(true);
    });

    it("Should revert bridge mint if validator reverts", async function () {
      const mintAmount = ethers.parseUnits("2000", 6);
      
      // Configure validator to reject mints
      await mockValidator.setRejectMint(true);
      
      await expect(
        contractInstance.connect(bridgeMinter).bridgeMint(recipient.address, mintAmount)
      ).to.be.revertedWith("MockValidator: Mint rejected");
    });
  });

  describe("Validator Integration - Native Burning", function () {
    beforeEach(async function () {
      await contractInstance.connect(defaultAdmin).setSupplyValidator(mockValidator.getAddress());
      // Mint some tokens first
      const mintAmount = ethers.parseUnits("5000", 6);
      await contractInstance.connect(minter).mint(recipient.address, mintAmount);
      await mockValidator.reset(); // Reset counters after minting
    });

    it("Should call validator on native burn operations", async function () {
      const burnAmount = ethers.parseUnits("1000", 6);
      
      // Recipient must approve minter to burn their tokens
      await contractInstance.connect(recipient).approve(minter.address, burnAmount);
      
      await contractInstance.connect(minter).burn(recipient.address, burnAmount);
      
      expect(await mockValidator.burnCallCount()).to.equal(1);
      expect(await mockValidator.lastBurnAccount()).to.equal(recipient.address);
      expect(await mockValidator.lastBurnAmount()).to.equal(burnAmount);
      expect(await mockValidator.lastBurnBurner()).to.equal(minter.address);
      expect(await mockValidator.lastBurnIsBridge()).to.equal(false);
    });

    it("Should pass correct parameters to validator for native burn", async function () {
      const burnAmount = ethers.parseUnits("2000", 6);
      
      // Recipient must approve minter to burn their tokens
      await contractInstance.connect(recipient).approve(minter.address, burnAmount);
      
      await contractInstance.connect(minter).burn(recipient.address, burnAmount);
      
      expect(await mockValidator.lastBurnAccount()).to.equal(recipient.address);
      expect(await mockValidator.lastBurnAmount()).to.equal(burnAmount);
      expect(await mockValidator.lastBurnBurner()).to.equal(minter.address);
      expect(await mockValidator.lastBurnIsBridge()).to.equal(false);
    });

    it("Should revert burn if validator reverts", async function () {
      const burnAmount = ethers.parseUnits("1000", 6);
      
      // Recipient must approve minter to burn their tokens
      await contractInstance.connect(recipient).approve(minter.address, burnAmount);
      
      // Configure validator to reject burns
      await mockValidator.setRejectBurn(true);
      
      await expect(
        contractInstance.connect(minter).burn(recipient.address, burnAmount)
      ).to.be.revertedWith("MockValidator: Burn rejected");
    });

    it("Should allow burn when validator accepts", async function () {
      const burnAmount = ethers.parseUnits("1000", 6);
      const initialBalance = await contractInstance.balanceOf(recipient.address);
      
      // Recipient must approve minter to burn their tokens
      await contractInstance.connect(recipient).approve(minter.address, burnAmount);
      
      await expect(
        contractInstance.connect(minter).burn(recipient.address, burnAmount)
      )
        .to.emit(contractInstance, "BurnNative")
        .withArgs(minter.address, recipient.address, burnAmount);
        
      expect(await contractInstance.balanceOf(recipient.address)).to.equal(initialBalance - burnAmount);
    });
  });

  describe("Validator Integration - Bridge Burning", function () {
    beforeEach(async function () {
      await contractInstance.connect(defaultAdmin).setSupplyValidator(mockValidator.getAddress());
      // Mint some tokens first using bridge minter
      const mintAmount = ethers.parseUnits("5000", 6);
      await contractInstance.connect(bridgeMinter).bridgeMint(recipient.address, mintAmount);
      await mockValidator.reset(); // Reset counters after minting
    });

    it("Should call validator on bridge burn operations", async function () {
      const burnAmount = ethers.parseUnits("1500", 6);
      
      // Recipient must approve bridgeMinter to burn their tokens
      await contractInstance.connect(recipient).approve(bridgeMinter.address, burnAmount);
      
      await contractInstance.connect(bridgeMinter).bridgeBurn(recipient.address, burnAmount);
      
      expect(await mockValidator.burnCallCount()).to.equal(1);
      expect(await mockValidator.lastBurnAccount()).to.equal(recipient.address);
      expect(await mockValidator.lastBurnAmount()).to.equal(burnAmount);
      expect(await mockValidator.lastBurnBurner()).to.equal(bridgeMinter.address);
      expect(await mockValidator.lastBurnIsBridge()).to.equal(true);
    });

    it("Should pass correct parameters to validator for bridge burn", async function () {
      const burnAmount = ethers.parseUnits("2500", 6);
      
      // Recipient must approve bridgeMinter to burn their tokens
      await contractInstance.connect(recipient).approve(bridgeMinter.address, burnAmount);
      
      await contractInstance.connect(bridgeMinter).bridgeBurn(recipient.address, burnAmount);
      
      expect(await mockValidator.lastBurnAccount()).to.equal(recipient.address);
      expect(await mockValidator.lastBurnAmount()).to.equal(burnAmount);
      expect(await mockValidator.lastBurnBurner()).to.equal(bridgeMinter.address);
      expect(await mockValidator.lastBurnIsBridge()).to.equal(true);
    });

    it("Should revert bridge burn if validator reverts", async function () {
      const burnAmount = ethers.parseUnits("1500", 6);
      
      // Recipient must approve bridgeMinter to burn their tokens
      await contractInstance.connect(recipient).approve(bridgeMinter.address, burnAmount);
      
      // Configure validator to reject burns
      await mockValidator.setRejectBurn(true);
      
      await expect(
        contractInstance.connect(bridgeMinter).bridgeBurn(recipient.address, burnAmount)
      ).to.be.revertedWith("MockValidator: Burn rejected");
    });
  });

  describe("Validator Integration - No Validator Set", function () {
    it("Should NOT call validator when not set (native mint)", async function () {
      const mintAmount = ethers.parseUnits("1000", 6);
      
      // Validator is not set (default is zero address)
      await contractInstance.connect(minter).mint(recipient.address, mintAmount);
      
      expect(await mockValidator.mintCallCount()).to.equal(0);
      expect(await contractInstance.balanceOf(recipient.address)).to.equal(mintAmount);
    });

    it("Should NOT call validator when not set (bridge mint)", async function () {
      const mintAmount = ethers.parseUnits("2000", 6);
      
      // Validator is not set
      await contractInstance.connect(bridgeMinter).bridgeMint(recipient.address, mintAmount);
      
      expect(await mockValidator.mintCallCount()).to.equal(0);
      expect(await contractInstance.balanceOf(recipient.address)).to.equal(mintAmount);
    });

    it("Should NOT call validator when not set (native burn)", async function () {
      const mintAmount = ethers.parseUnits("3000", 6);
      const burnAmount = ethers.parseUnits("1000", 6);
      
      // Mint first
      await contractInstance.connect(minter).mint(recipient.address, mintAmount);
      
      // Recipient must approve minter to burn their tokens
      await contractInstance.connect(recipient).approve(minter.address, burnAmount);
      
      // Burn without validator
      await contractInstance.connect(minter).burn(recipient.address, burnAmount);
      
      expect(await mockValidator.burnCallCount()).to.equal(0);
      expect(await contractInstance.balanceOf(recipient.address)).to.equal(mintAmount - burnAmount);
    });

    it("Should NOT call validator when not set (bridge burn)", async function () {
      const mintAmount = ethers.parseUnits("3000", 6);
      const burnAmount = ethers.parseUnits("1500", 6);
      
      // Mint first
      await contractInstance.connect(bridgeMinter).bridgeMint(recipient.address, mintAmount);
      
      // Recipient must approve bridgeMinter to burn their tokens
      await contractInstance.connect(recipient).approve(bridgeMinter.address, burnAmount);
      
      // Burn without validator
      await contractInstance.connect(bridgeMinter).bridgeBurn(recipient.address, burnAmount);
      
      expect(await mockValidator.burnCallCount()).to.equal(0);
      expect(await contractInstance.balanceOf(recipient.address)).to.equal(mintAmount - burnAmount);
    });
  });

  describe("Validator Integration - After Disabling", function () {
    it("Should stop calling validator after setting to zero address", async function () {
      const mintAmount = ethers.parseUnits("1000", 6);
      
      // Set validator
      await contractInstance.connect(defaultAdmin).setSupplyValidator(mockValidator.getAddress());
      
      // Mint with validator
      await contractInstance.connect(minter).mint(recipient.address, mintAmount);
      expect(await mockValidator.mintCallCount()).to.equal(1);
      
      // Disable validator
      await contractInstance.connect(defaultAdmin).setSupplyValidator(addressZero);
      await mockValidator.reset();
      
      // Mint without validator
      await contractInstance.connect(minter).mint(recipient.address, mintAmount);
      expect(await mockValidator.mintCallCount()).to.equal(0);
      expect(await contractInstance.balanceOf(recipient.address)).to.equal(mintAmount * 2n);
    });
  });

  describe("Validator Integration - Multiple Operations", function () {
    beforeEach(async function () {
      await contractInstance.connect(defaultAdmin).setSupplyValidator(mockValidator.getAddress());
    });

    it("Should track multiple mint operations", async function () {
      const mintAmount1 = ethers.parseUnits("1000", 6);
      const mintAmount2 = ethers.parseUnits("2000", 6);
      
      await contractInstance.connect(minter).mint(recipient.address, mintAmount1);
      await contractInstance.connect(minter).mint(recipient.address, mintAmount2);
      
      expect(await mockValidator.mintCallCount()).to.equal(2);
      expect(await mockValidator.lastMintAmount()).to.equal(mintAmount2);
    });

    it("Should track both mint and burn operations separately", async function () {
      const mintAmount = ethers.parseUnits("3000", 6);
      const burnAmount = ethers.parseUnits("1000", 6);
      
      await contractInstance.connect(minter).mint(recipient.address, mintAmount);
      expect(await mockValidator.mintCallCount()).to.equal(1);
      expect(await mockValidator.burnCallCount()).to.equal(0);
      
      // Recipient must approve minter to burn their tokens
      await contractInstance.connect(recipient).approve(minter.address, burnAmount);
      
      await contractInstance.connect(minter).burn(recipient.address, burnAmount);
      expect(await mockValidator.mintCallCount()).to.equal(1);
      expect(await mockValidator.burnCallCount()).to.equal(1);
    });
  });

  describe("Validator Integration - Native Batch Minting", function () {
    let recipient1: SignerWithAddress;
    let recipient2: SignerWithAddress;
    let recipient3: SignerWithAddress;

    beforeEach(async function () {
      const signers = await ethers.getSigners();
      // Use signers that haven't been used yet (indices 11, 12, 13)
      recipient1 = signers[11];
      recipient2 = signers[12];
      recipient3 = signers[13];
      await contractInstance.connect(defaultAdmin).setSupplyValidator(mockValidator.getAddress());
    });

    it("Should call validateMintBatch on native batch mint operations", async function () {
      const amounts = [
        ethers.parseUnits("1000", 6),
        ethers.parseUnits("2000", 6),
        ethers.parseUnits("3000", 6),
      ];
      const addresses = [recipient1.address, recipient2.address, recipient3.address];
      
      await contractInstance.connect(minter).mintBatch(addresses, amounts);
      
      // validateMintBatch should increment mintCallCount for each account in the batch
      expect(await mockValidator.mintCallCount()).to.equal(3);
      // Last mint should reflect the last account in the batch
      expect(await mockValidator.lastMintAccount()).to.equal(recipient3.address);
      expect(await mockValidator.lastMintAmount()).to.equal(amounts[2]);
      expect(await mockValidator.lastMintMinter()).to.equal(minter.address);
      expect(await mockValidator.lastMintIsBridge()).to.equal(false);
    });

    it("Should pass correct parameters to validateMintBatch for native batch mint", async function () {
      const amounts = [
        ethers.parseUnits("5000", 6),
        ethers.parseUnits("10000", 6),
      ];
      const addresses = [recipient1.address, recipient2.address];
      
      await contractInstance.connect(minter).mintBatch(addresses, amounts);
      
      expect(await mockValidator.mintCallCount()).to.equal(2);
      expect(await mockValidator.lastMintAccount()).to.equal(recipient2.address);
      expect(await mockValidator.lastMintAmount()).to.equal(amounts[1]);
      expect(await mockValidator.lastMintMinter()).to.equal(minter.address);
      expect(await mockValidator.lastMintIsBridge()).to.equal(false);
    });

    it("Should revert batch mint if validator rejects", async function () {
      const amounts = [
        ethers.parseUnits("1000", 6),
        ethers.parseUnits("2000", 6),
      ];
      const addresses = [recipient1.address, recipient2.address];
      
      // Configure validator to reject mints
      await mockValidator.setRejectMint(true);
      
      await expect(
        contractInstance.connect(minter).mintBatch(addresses, amounts)
      ).to.be.revertedWith("MockValidator: Mint rejected");
      
      // No tokens should be minted
      expect(await contractInstance.balanceOf(recipient1.address)).to.equal(0);
      expect(await contractInstance.balanceOf(recipient2.address)).to.equal(0);
    });

    it("Should allow batch mint when validator accepts", async function () {
      const amounts = [
        ethers.parseUnits("1000", 6),
        ethers.parseUnits("2000", 6),
        ethers.parseUnits("3000", 6),
      ];
      const addresses = [recipient1.address, recipient2.address, recipient3.address];
      
      // Validator accepts by default
      await expect(
        contractInstance.connect(minter).mintBatch(addresses, amounts)
      )
        .to.emit(contractInstance, "MintNative")
        .withArgs(minter.address, recipient1.address, amounts[0])
        .to.emit(contractInstance, "MintNative")
        .withArgs(minter.address, recipient2.address, amounts[1])
        .to.emit(contractInstance, "MintNative")
        .withArgs(minter.address, recipient3.address, amounts[2]);
        
      expect(await contractInstance.balanceOf(recipient1.address)).to.equal(amounts[0]);
      expect(await contractInstance.balanceOf(recipient2.address)).to.equal(amounts[1]);
      expect(await contractInstance.balanceOf(recipient3.address)).to.equal(amounts[2]);
    });

    it("Should call validateMintBatch before minting tokens", async function () {
      const amounts = [
        ethers.parseUnits("1000", 6),
        ethers.parseUnits("2000", 6),
      ];
      const addresses = [recipient1.address, recipient2.address];
      
      // Reset validator to track calls
      await mockValidator.reset();
      
      // Perform batch mint
      await contractInstance.connect(minter).mintBatch(addresses, amounts);
      
      // Validator should have been called (validateMintBatch increments count for each account)
      expect(await mockValidator.mintCallCount()).to.equal(2);
      
      // Tokens should be minted
      expect(await contractInstance.balanceOf(recipient1.address)).to.equal(amounts[0]);
      expect(await contractInstance.balanceOf(recipient2.address)).to.equal(amounts[1]);
    });

    it("Should NOT call validateMintBatch when validator is not set", async function () {
      // Explicitly unset the validator (set to zero address)
      await contractInstance.connect(defaultAdmin).setSupplyValidator(addressZero);
      await mockValidator.reset(); // Reset counters
      
      const amounts = [
        ethers.parseUnits("1000", 6),
        ethers.parseUnits("2000", 6),
      ];
      const addresses = [recipient1.address, recipient2.address];
      
      // Validator is not set (default is zero address)
      await contractInstance.connect(minter).mintBatch(addresses, amounts);
      
      expect(await mockValidator.mintCallCount()).to.equal(0);
      expect(await contractInstance.balanceOf(recipient1.address)).to.equal(amounts[0]);
      expect(await contractInstance.balanceOf(recipient2.address)).to.equal(amounts[1]);
    });

    it("Should stop calling validateMintBatch after disabling validator", async function () {
      const amounts = [
        ethers.parseUnits("1000", 6),
        ethers.parseUnits("2000", 6),
      ];
      const addresses = [recipient1.address, recipient2.address];
      
      // Set validator
      await contractInstance.connect(defaultAdmin).setSupplyValidator(mockValidator.getAddress());
      
      // Batch mint with validator
      await contractInstance.connect(minter).mintBatch(addresses, amounts);
      expect(await mockValidator.mintCallCount()).to.equal(2);
      
      // Disable validator
      await contractInstance.connect(defaultAdmin).setSupplyValidator(addressZero);
      await mockValidator.reset();
      
      // Batch mint without validator
      const newAmounts = [
        ethers.parseUnits("500", 6),
        ethers.parseUnits("1500", 6),
      ];
      await contractInstance.connect(minter).mintBatch(addresses, newAmounts);
      expect(await mockValidator.mintCallCount()).to.equal(0);
      expect(await contractInstance.balanceOf(recipient1.address)).to.equal(amounts[0] + newAmounts[0]);
      expect(await contractInstance.balanceOf(recipient2.address)).to.equal(amounts[1] + newAmounts[1]);
    });
  });

  describe("Validator Integration - Bridge Batch Minting", function () {
    let recipient1: SignerWithAddress;
    let recipient2: SignerWithAddress;
    let recipient3: SignerWithAddress;

    beforeEach(async function () {
      const signers = await ethers.getSigners();
      // Use signers that haven't been used yet (indices 11, 12, 13)
      recipient1 = signers[11];
      recipient2 = signers[12];
      recipient3 = signers[13];
      await contractInstance.connect(defaultAdmin).setSupplyValidator(mockValidator.getAddress());
    });

    it("Should call validateMintBatch on bridge batch mint operations", async function () {
      const amounts = [
        ethers.parseUnits("2000", 6),
        ethers.parseUnits("3000", 6),
        ethers.parseUnits("4000", 6),
      ];
      const addresses = [recipient1.address, recipient2.address, recipient3.address];
      
      await contractInstance.connect(bridgeMinter).bridgeMintBatch(addresses, amounts);
      
      // validateMintBatch should increment mintCallCount for each account in the batch
      expect(await mockValidator.mintCallCount()).to.equal(3);
      // Last mint should reflect the last account in the batch
      expect(await mockValidator.lastMintAccount()).to.equal(recipient3.address);
      expect(await mockValidator.lastMintAmount()).to.equal(amounts[2]);
      expect(await mockValidator.lastMintMinter()).to.equal(bridgeMinter.address);
      expect(await mockValidator.lastMintIsBridge()).to.equal(true);
    });

    it("Should pass correct parameters to validateMintBatch for bridge batch mint", async function () {
      const amounts = [
        ethers.parseUnits("5000", 6),
        ethers.parseUnits("10000", 6),
      ];
      const addresses = [recipient1.address, recipient2.address];
      
      await contractInstance.connect(bridgeMinter).bridgeMintBatch(addresses, amounts);
      
      expect(await mockValidator.mintCallCount()).to.equal(2);
      expect(await mockValidator.lastMintAccount()).to.equal(recipient2.address);
      expect(await mockValidator.lastMintAmount()).to.equal(amounts[1]);
      expect(await mockValidator.lastMintMinter()).to.equal(bridgeMinter.address);
      expect(await mockValidator.lastMintIsBridge()).to.equal(true);
    });

    it("Should revert bridge batch mint if validator rejects", async function () {
      const amounts = [
        ethers.parseUnits("2000", 6),
        ethers.parseUnits("3000", 6),
      ];
      const addresses = [recipient1.address, recipient2.address];
      
      // Configure validator to reject mints
      await mockValidator.setRejectMint(true);
      
      await expect(
        contractInstance.connect(bridgeMinter).bridgeMintBatch(addresses, amounts)
      ).to.be.revertedWith("MockValidator: Mint rejected");
      
      // No tokens should be minted
      expect(await contractInstance.balanceOf(recipient1.address)).to.equal(0);
      expect(await contractInstance.balanceOf(recipient2.address)).to.equal(0);
    });

    it("Should allow bridge batch mint when validator accepts", async function () {
      const amounts = [
        ethers.parseUnits("2000", 6),
        ethers.parseUnits("3000", 6),
        ethers.parseUnits("4000", 6),
      ];
      const addresses = [recipient1.address, recipient2.address, recipient3.address];
      
      // Validator accepts by default
      await expect(
        contractInstance.connect(bridgeMinter).bridgeMintBatch(addresses, amounts)
      )
        .to.emit(contractInstance, "MintBridge")
        .withArgs(bridgeMinter.address, recipient1.address, amounts[0])
        .to.emit(contractInstance, "MintBridge")
        .withArgs(bridgeMinter.address, recipient2.address, amounts[1])
        .to.emit(contractInstance, "MintBridge")
        .withArgs(bridgeMinter.address, recipient3.address, amounts[2]);
        
      expect(await contractInstance.balanceOf(recipient1.address)).to.equal(amounts[0]);
      expect(await contractInstance.balanceOf(recipient2.address)).to.equal(amounts[1]);
      expect(await contractInstance.balanceOf(recipient3.address)).to.equal(amounts[2]);
    });

    it("Should NOT call validateMintBatch when validator is not set (bridge)", async function () {
      // Explicitly unset the validator (set to zero address)
      await contractInstance.connect(defaultAdmin).setSupplyValidator(addressZero);
      await mockValidator.reset(); // Reset counters
      
      const amounts = [
        ethers.parseUnits("2000", 6),
        ethers.parseUnits("3000", 6),
      ];
      const addresses = [recipient1.address, recipient2.address];
      
      // Validator is not set (default is zero address)
      await contractInstance.connect(bridgeMinter).bridgeMintBatch(addresses, amounts);
      
      expect(await mockValidator.mintCallCount()).to.equal(0);
      expect(await contractInstance.balanceOf(recipient1.address)).to.equal(amounts[0]);
      expect(await contractInstance.balanceOf(recipient2.address)).to.equal(amounts[1]);
    });
  });
});
