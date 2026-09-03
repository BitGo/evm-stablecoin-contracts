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

describe("Minting,  Burning And Token Rescue", function () {
  let contractInstance: Stablecoin;
  let defaultAdmin: SignerWithAddress;
  let freezer: SignerWithAddress;
  let masterMinter: SignerWithAddress;
  let minter: SignerWithAddress;
  let bridgeMinter: SignerWithAddress;
  let upgrader: SignerWithAddress;
  let reserve1: SignerWithAddress;
  let reserve2: SignerWithAddress;
  let reserve3: SignerWithAddress;
  let blacklister: SignerWithAddress;
  let rescuer: SignerWithAddress;
  let recoverAddress: SignerWithAddress;
  let randomAddress: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;
  const addressZero = "0x0000000000000000000000000000000000000000";
  const DAILY_LIMIT = ethers.parseUnits("10000000", 6); // 10M tokens daily limit

  before(async function () {
    [
      defaultAdmin,
      freezer,
      masterMinter,
      minter,
      bridgeMinter,
      upgrader,
      blacklister,
      reserve1,
      reserve2,
      reserve3,
      rescuer,
      recoverAddress,
      randomAddress,
      user1,
      user2,
      user3,
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
    contractInstance = (await contract.waitForDeployment()) as unknown as Stablecoin;
    
    // Configure minter with high limits for testing
    await contractInstance.connect(masterMinter).configureMinter(minter.address, DAILY_LIMIT, DAILY_LIMIT);
    
    // Configure bridge minter with high limits for testing
    await contractInstance.connect(masterMinter).configureBridgeMinter(bridgeMinter.address, DAILY_LIMIT, DAILY_LIMIT);
  });

  it("Should have 0 total supply on init and unpaused", async function () {
    const paused = await contractInstance.paused();

    expect(await contractInstance.totalSupply()).to.equal(0);
    expect(paused).to.be.false;
  });

  it("Should fail to mint tokens exceeding max mint limit", async function () {
    // Set mint amount greater than the maxMintLimit
    const mintAmount = ethers.parseUnits("2000000", 6); // 2 million tokens (exceeds 1M per-tx cap)

    await expect(
      contractInstance
        .connect(minter)
        .mint(randomAddress.address, mintAmount)
    ).to.be.revertedWithCustomError(contractInstance, "ExceedsMintTransactionCap");
  });

  it("Should update the max mint limit successfully through setter function", async function () {
    const newPerTransactionCap = ethers.parseUnits("2000000", 6); // 2 million tokens
    const oldPerTransactionCap = await contractInstance.getMintCapPerTransaction();

    // Update the max mint limit using the setter function
    await expect(contractInstance
      .connect(defaultAdmin)
      .setMintCapPerTransaction(newPerTransactionCap)
    )
      .to.emit(contractInstance, "MintCapPerTransactionSet")
      .withArgs(oldPerTransactionCap, newPerTransactionCap, defaultAdmin.address)

    const currentMaxMintLimit = await contractInstance.getMintCapPerTransaction();
    expect(currentMaxMintLimit).to.equal(newPerTransactionCap);

    // Attempt to mint exceeding the updated limit and expect it to fail
    const exceedingMintAmount = ethers.parseUnits("2500000", 6); // 2.5 million tokens
    await expect(
      contractInstance.connect(minter).mint(randomAddress.address, exceedingMintAmount)
    ).to.be.revertedWithCustomError(contractInstance, "ExceedsMintTransactionCap");
  });

  it("Should fail to update the max mint limit to zero", async function () {
    const zeroCap = ethers.parseUnits("0", 6); // Zero tokens

    // Attempt to update the max mint limit to zero and expect it to fail
    await expect(
      contractInstance.connect(defaultAdmin).setMintCapPerTransaction(zeroCap)
    ).to.be.revertedWithCustomError(contractInstance, "InvalidAmount");
  });

  it("Should mint tokens successfully to any external address", async function () {
    const mintAmount = ethers.parseUnits("1000", 6);
    await expect(
      contractInstance
        .connect(minter)
        .mint(randomAddress.address, mintAmount)
    )
      .to.emit(contractInstance, "Transfer")
      .withArgs(addressZero, randomAddress.address, mintAmount)
      .to.emit(contractInstance, "MintNative")
      .withArgs(minter.address, randomAddress.address, mintAmount);
    const balance = await contractInstance.balanceOf(randomAddress.address);
    expect(balance).to.equal(mintAmount);
    expect(await contractInstance.totalSupply()).to.equal(mintAmount);
  });

  it("Should be able to recover tokens stuck in contract address", async function () {
    const transferAmount = ethers.parseUnits("1000", 6);
    await contractInstance
      .connect(minter)
      .mint(reserve3.address, transferAmount);
    const balanceAfterTransfer = await contractInstance.balanceOf(
      reserve3.address
    );
    expect(balanceAfterTransfer).to.equal(transferAmount);

    // Mint tokens to the contract itself

    await contractInstance
      .connect(reserve3)
      .transfer(contractInstance.getAddress(), transferAmount);
    const balance = await contractInstance.balanceOf(
      contractInstance.getAddress()
    );
    expect(balance).to.equal(transferAmount);

    // Recover the tokens
    await expect(
      contractInstance
      .connect(rescuer)
      .rescueTokens(
        contractInstance.getAddress(),
        recoverAddress.address,
        transferAmount
      )
    )
      .to.emit(contractInstance, "Transfer")
      .withArgs(
      contractInstance.getAddress(),
      recoverAddress.address,
      transferAmount
      )
      .to.emit(contractInstance, "TokensRescued")
      .withArgs(contractInstance.getAddress(), recoverAddress.address, transferAmount, rescuer.address);
    const newTokenContractBalance = await contractInstance.balanceOf(
      contractInstance.getAddress()
    );
    expect(newTokenContractBalance).to.equal(ethers.parseUnits("0", 6));
    const balanceAtRecoverAddress = await contractInstance.balanceOf(
      recoverAddress.address
    );
    expect(balanceAtRecoverAddress).to.equal(transferAmount);
  });
  
  it("Should fail to rescue tokens when called by unauthorized address", async function() {
    const transferAmount = ethers.parseUnits("1000", 6);
  
    await expect(
      contractInstance.connect(randomAddress).rescueTokens(
        contractInstance.getAddress(),
        recoverAddress.address,
        transferAmount  
      )
    ).to.be.revert(ethers);
  });
  
  it("Should fail to rescue tokens to address zero", async function() {
    const transferAmount = ethers.parseUnits("1000", 6);
  
    await expect(
      contractInstance.connect(rescuer).rescueTokens(
        contractInstance.getAddress(), 
        addressZero,
        transferAmount
      )
    ).to.be.revertedWithCustomError(contractInstance, "InvalidAddress");
  });
  
  it("Should fail to rescue zero tokens", async function() {
    await expect(
      contractInstance.connect(rescuer).rescueTokens(
        contractInstance.getAddress(),
        recoverAddress.address,
        0
      )
    ).to.be.revertedWithCustomError(contractInstance, "InvalidAmount()");
  });
  
  it("Should fail to rescue tokens to blacklisted address", async function() {
    const transferAmount = ethers.parseUnits("1000", 6);
    
    // Blacklist the recipient address
    await contractInstance.connect(blacklister).blacklist(reserve2.address);
  
    await expect(
      contractInstance.connect(rescuer).rescueTokens(
        contractInstance.getAddress(),
        reserve2.address,
        transferAmount
      )
    ).to.be.revertedWithCustomError(contractInstance, "RecipientBlacklisted");
    await contractInstance.connect(blacklister).unblacklist(reserve2.address);
  });

  it("Should fail to mint tokens when called by unauthorized address", async function () {
    const mintAmount = ethers.parseUnits("1000", 6);
    let failed = false;
    try {
      // Attempt to mint tokens by an unauthorized signer (e.g., defaultAdmin)
      await contractInstance
        .connect(defaultAdmin)
        .mint(reserve1.address, mintAmount);
    } catch (error) {
      failed = true;
      expect(error).to.be.an("error");
    }
    expect(failed).to.be.true;
  });

  it("Should burn tokens successfully from an address", async function () {
    const burnAmount = ethers.parseUnits("500", 6);
    await contractInstance
      .connect(minter)
      .mint(reserve1.address, burnAmount);
    const totalSupply = await contractInstance.totalSupply();
    const initialBalance = await contractInstance.balanceOf(reserve1.address);
    
    // Reserve1 must approve minter to burn their tokens
    await contractInstance.connect(reserve1).approve(minter.address, burnAmount);
    
    await expect(
      contractInstance
        .connect(minter)
        .burn(reserve1.address, burnAmount)
    )
      .to.emit(contractInstance, "Transfer")
      .withArgs(reserve1.address, addressZero, burnAmount)
      .to.emit(contractInstance, "BurnNative")
      .withArgs(minter.address, reserve1.address, burnAmount);
    const finalBalance = await contractInstance.balanceOf(reserve1.address);
    expect(finalBalance).to.equal(initialBalance - burnAmount);
    expect(await contractInstance.totalSupply()).to.equal(
      totalSupply - burnAmount
    );
  });

  it("Should fail to burn tokens when called by unauthorized address", async function () {
    const burnAmount = ethers.parseUnits("500", 6);
    let failed = false;
    try {
      // Attempt to burn tokens by an unauthorized signer (e.g., defaultAdmin)
      await contractInstance
        .connect(defaultAdmin)
        .burn(reserve1.address, burnAmount);
    } catch (error) {
      failed = true;
      expect(error).to.be.an("error");
    }
    expect(failed).to.be.true;
  });

  it("Should mint tokens successfully in batch to multiple external addresses", async function () {
    const mintAmount = ethers.parseUnits("1000", 6);
    const addresses = [
      "0x32FdfD2eA08d916B8f4e73d057E99bc3358b2F4D",
      "0xECc966AB425F3F5Bd58085ce4eBDBf81D829126F",
      "0x4cC9f0D4dAD08B15e5C5fb85f9e390B6cddA88Ba",
    ];
    const amounts = [mintAmount, mintAmount * 2n, mintAmount * 3n];

    await expect(
      contractInstance.connect(minter).mintBatch(addresses, amounts)
    )
      .to.emit(contractInstance, "Transfer")
      .withArgs(addressZero, addresses[0], mintAmount)
      .to.emit(contractInstance, "MintNative")
      .withArgs(minter.address, addresses[0], mintAmount)
      .to.emit(contractInstance, "Transfer")
      .withArgs(addressZero, addresses[1], mintAmount * 2n)
      .to.emit(contractInstance, "MintNative")
      .withArgs(minter.address, addresses[1], mintAmount * 2n)
      .to.emit(contractInstance, "Transfer")
      .withArgs(addressZero, addresses[2], mintAmount * 3n);

    for (const address of addresses) {
      const balance = await contractInstance.balanceOf(address);
      expect(balance).to.equal(amounts[addresses.indexOf(address)]);
    }
  });

  it("Should fail to mint tokens in batch when called by unauthorized address", async function () {
    const mintAmount = ethers.parseUnits("1000", 6);
    const addresses = [reserve1.address, reserve2.address, reserve3.address];
    const amounts = [mintAmount, mintAmount, mintAmount];
    let failed = false;

    try {
      // Attempt to mint tokens in batch by an unauthorized signer (e.g., defaultAdmin)
      await contractInstance
        .connect(defaultAdmin)
        .mintBatch(addresses, amounts);
    } catch (error) {
      failed = true;
      expect(error).to.be.an("error");
    }

    expect(failed).to.be.true;
  });

  it("Should fail to mint tokens if address array and amount array length doesn't match", async function () {
    const mintAmount = ethers.parseUnits("1000", 6);
    const addresses = [reserve1.address, reserve2.address];
    const amounts = [mintAmount, mintAmount, mintAmount];
    let failed = false;

    try {
      // Attempt to mint tokens when address array and amount array length doesn't match
      await contractInstance
        .connect(minter)
        .mintBatch(addresses, amounts);
    } catch (error) {
      failed = true;
      expect((error as Error).message).equal(
        "VM Exception while processing transaction: reverted with custom error 'ArrayLengthsMismatch()'"
      );
      expect(error).to.be.an("error");
    }

    expect(failed).to.be.true;
  });

  describe("Batch Mint Cap Enforcement Tests", function () {
    it("Should succeed when total batch amount equals cap", async function () {
      const cap = await contractInstance.getMintCapPerTransaction();
      const amount1 = cap / 3n;
      const amount2 = cap / 3n;
      const amount3 = cap - amount1 - amount2; // Remaining to equal cap exactly

      await expect(
        contractInstance.connect(minter).mintBatch(
          [user1.address, user2.address, user3.address],
          [amount1, amount2, amount3]
        )
      ).to.emit(contractInstance, "MintNative");

      expect(await contractInstance.balanceOf(user1.address)).to.be.gte(amount1);
      expect(await contractInstance.balanceOf(user2.address)).to.be.gte(amount2);
      expect(await contractInstance.balanceOf(user3.address)).to.be.gte(amount3);
    });

    it("Should revert when total batch amount exceeds cap with valid individual amounts", async function () {
      const cap = await contractInstance.getMintCapPerTransaction();
      const amount1 = cap / 2n + ethers.parseUnits("1", 6);
      const amount2 = cap / 2n + ethers.parseUnits("1", 6);

      await expect(
        contractInstance.connect(minter).mintBatch(
          [user1.address, user2.address],
          [amount1, amount2]
        )
      ).to.be.revertedWithCustomError(contractInstance, "ExceedsMintTransactionCap");
    });

    it("Should prevent same address from receiving more than cap via batch (duplicate address exploit)", async function () {
      const cap = await contractInstance.getMintCapPerTransaction();
      const amount = cap / 2n + ethers.parseUnits("1", 6);

      // Same address appears twice - total exceeds cap
      await expect(
        contractInstance.connect(minter).mintBatch(
          [user1.address, user1.address],
          [amount, amount]
        )
      ).to.be.revertedWithCustomError(contractInstance, "ExceedsMintTransactionCap");
    });

    it("Should allow multiple recipients if total is within cap", async function () {
      const cap = await contractInstance.getMintCapPerTransaction();
      const amount = cap / 4n;

      const balancesBefore = {
        user1: await contractInstance.balanceOf(user1.address),
        user2: await contractInstance.balanceOf(user2.address),
        user3: await contractInstance.balanceOf(user3.address),
      };

      await expect(
        contractInstance.connect(minter).mintBatch(
          [user1.address, user2.address, user3.address],
          [amount, amount, amount]
        )
      ).to.emit(contractInstance, "MintNative");

      expect(await contractInstance.balanceOf(user1.address)).to.equal(balancesBefore.user1 + amount);
      expect(await contractInstance.balanceOf(user2.address)).to.equal(balancesBefore.user2 + amount);
      expect(await contractInstance.balanceOf(user3.address)).to.equal(balancesBefore.user3 + amount);
    });

    it("Should revert when single large total amount exceeds cap", async function () {
      const cap = await contractInstance.getMintCapPerTransaction();
      const exceedingAmount = cap + ethers.parseUnits("1", 6);

      await expect(
        contractInstance.connect(minter).mintBatch(
          [user1.address],
          [exceedingAmount]
        )
      ).to.be.revertedWithCustomError(contractInstance, "ExceedsMintTransactionCap");
    });

    it("Should handle edge case with many small amounts that exceed cap", async function () {
      const cap = await contractInstance.getMintCapPerTransaction();
      const smallAmount = cap / 10n;
      
      // 11 small amounts = 110% of cap
      const addresses = Array(11).fill(user1.address);
      const amounts = Array(11).fill(smallAmount);

      await expect(
        contractInstance.connect(minter).mintBatch(addresses, amounts)
      ).to.be.revertedWithCustomError(contractInstance, "ExceedsMintTransactionCap");
    });

    it("Should succeed with many small amounts that don't exceed cap", async function () {
      const cap = await contractInstance.getMintCapPerTransaction();
      const smallAmount = cap / 10n;
      
      // 9 small amounts = 90% of cap
      const addresses = Array(9).fill(reserve1.address);
      const amounts = Array(9).fill(smallAmount);

      const balanceBefore = await contractInstance.balanceOf(reserve1.address);

      await expect(
        contractInstance.connect(minter).mintBatch(addresses, amounts)
      ).to.emit(contractInstance, "MintNative");

      const balanceAfter = await contractInstance.balanceOf(reserve1.address);
      expect(balanceAfter - balanceBefore).to.equal(smallAmount * 9n);
    });
  });

  describe("Native Burn Authorization Tests", function () {
    it("Should allow minter to burn their own tokens without approval", async function () {
      const mintAmount = ethers.parseUnits("1000", 6);
      const burnAmount = ethers.parseUnits("500", 6);

      // Mint tokens to the minter
      const balanceBefore = await contractInstance.balanceOf(minter.address);
      await contractInstance.connect(minter).mint(minter.address, mintAmount);
      
      const balanceAfterMint = await contractInstance.balanceOf(minter.address);
      expect(balanceAfterMint).to.equal(balanceBefore + mintAmount);

      // Minter should be able to burn their own tokens
      await expect(
        contractInstance.connect(minter).burn(minter.address, burnAmount)
      )
        .to.emit(contractInstance, "Transfer")
        .withArgs(minter.address, addressZero, burnAmount)
        .to.emit(contractInstance, "BurnNative")
        .withArgs(minter.address, minter.address, burnAmount);

      const balanceAfter = await contractInstance.balanceOf(minter.address);
      expect(balanceAfter).to.equal(balanceAfterMint - burnAmount);
    });

    it("Should revert when minter tries to burn from another address without approval", async function () {
      const mintAmount = ethers.parseUnits("1000", 6);

      // Mint tokens to user1
      await contractInstance.connect(minter).mint(user1.address, mintAmount);

      // Minter tries to burn from user1 without approval - should fail
      await expect(
        contractInstance.connect(minter).burn(user1.address, mintAmount)
      ).to.be.revertedWithCustomError(contractInstance, "ERC20InsufficientAllowance");
    });

    it("Should revert when minter tries to burn from another address with insufficient approval", async function () {
      const mintAmount = ethers.parseUnits("1000", 6);
      const approvalAmount = ethers.parseUnits("500", 6);

      // Mint tokens to user1
      await contractInstance.connect(minter).mint(user1.address, mintAmount);

      // User1 approves minter for only 500 tokens
      await contractInstance.connect(user1).approve(minter.address, approvalAmount);

      // Minter tries to burn 1000 tokens - should fail
      await expect(
        contractInstance.connect(minter).burn(user1.address, mintAmount)
      ).to.be.revertedWithCustomError(contractInstance, "ERC20InsufficientAllowance");
    });

    it("Should allow minter to burn from another address with sufficient approval and reduce allowance", async function () {
      const mintAmount = ethers.parseUnits("1000", 6);
      const burnAmount = ethers.parseUnits("500", 6);

      // Get initial balance
      const balanceBefore = await contractInstance.balanceOf(user1.address);

      // Mint tokens to user1
      await contractInstance.connect(minter).mint(user1.address, mintAmount);

      // User1 approves minter for 1000 tokens
      await contractInstance.connect(user1).approve(minter.address, mintAmount);

      const allowanceBefore = await contractInstance.allowance(user1.address, minter.address);
      expect(allowanceBefore).to.equal(mintAmount);

      // Minter burns 500 tokens from user1
      await expect(
        contractInstance.connect(minter).burn(user1.address, burnAmount)
      )
        .to.emit(contractInstance, "Transfer")
        .withArgs(user1.address, addressZero, burnAmount)
        .to.emit(contractInstance, "BurnNative")
        .withArgs(minter.address, user1.address, burnAmount);

      const balanceAfter = await contractInstance.balanceOf(user1.address);
      expect(balanceAfter).to.equal(balanceBefore + mintAmount - burnAmount);

      // Allowance should be reduced by burn amount
      const allowanceAfter = await contractInstance.allowance(user1.address, minter.address);
      expect(allowanceAfter).to.equal(mintAmount - burnAmount);
    });

    it("Should allow minter to burn from another address with infinite approval without reducing allowance", async function () {
      const mintAmount = ethers.parseUnits("1000", 6);
      const burnAmount = ethers.parseUnits("500", 6);
      const maxUint256 = ethers.MaxUint256;

      // Get initial balance
      const balanceBefore = await contractInstance.balanceOf(user1.address);

      // Mint tokens to user1
      await contractInstance.connect(minter).mint(user1.address, mintAmount);

      // User1 approves minter for infinite amount
      await contractInstance.connect(user1).approve(minter.address, maxUint256);

      const allowanceBefore = await contractInstance.allowance(user1.address, minter.address);
      expect(allowanceBefore).to.equal(maxUint256);

      // Minter burns 500 tokens from user1
      await expect(
        contractInstance.connect(minter).burn(user1.address, burnAmount)
      )
        .to.emit(contractInstance, "Transfer")
        .withArgs(user1.address, addressZero, burnAmount)
        .to.emit(contractInstance, "BurnNative")
        .withArgs(minter.address, user1.address, burnAmount);

      const balanceAfter = await contractInstance.balanceOf(user1.address);
      expect(balanceAfter).to.equal(balanceBefore + mintAmount - burnAmount);

      // Allowance should remain infinite (not reduced)
      const allowanceAfter = await contractInstance.allowance(user1.address, minter.address);
      expect(allowanceAfter).to.equal(maxUint256);
    });

    it("Should verify allowance is spent correctly after partial burn", async function () {
      const mintAmount = ethers.parseUnits("1000", 6);
      const approvalAmount = ethers.parseUnits("1000", 6);
      const firstBurn = ethers.parseUnits("300", 6);
      const secondBurn = ethers.parseUnits("400", 6);

      // Get initial balance
      const balanceBefore = await contractInstance.balanceOf(user1.address);

      // Mint tokens to user1
      await contractInstance.connect(minter).mint(user1.address, mintAmount);

      // User1 approves minter for 1000 tokens
      await contractInstance.connect(user1).approve(minter.address, approvalAmount);

      // First burn: 300 tokens
      await contractInstance.connect(minter).burn(user1.address, firstBurn);
      let allowance = await contractInstance.allowance(user1.address, minter.address);
      expect(allowance).to.equal(approvalAmount - firstBurn);

      // Second burn: 400 tokens
      await contractInstance.connect(minter).burn(user1.address, secondBurn);
      allowance = await contractInstance.allowance(user1.address, minter.address);
      expect(allowance).to.equal(approvalAmount - firstBurn - secondBurn);

      // Verify balance
      const balance = await contractInstance.balanceOf(user1.address);
      expect(balance).to.equal(balanceBefore + mintAmount - firstBurn - secondBurn);

      // Try to burn more than remaining allowance - should fail
      const remainingAllowance = approvalAmount - firstBurn - secondBurn;
      const exceedingBurn = remainingAllowance + ethers.parseUnits("1", 6);
      await expect(
        contractInstance.connect(minter).burn(user1.address, exceedingBurn)
      ).to.be.revertedWithCustomError(contractInstance, "ERC20InsufficientAllowance");
    });
  });

  describe("Bridge Burn Authorization Tests", function () {
    it("Should allow bridge minter to burn their own tokens without approval", async function () {
      const mintAmount = ethers.parseUnits("1000", 6);
      const burnAmount = ethers.parseUnits("500", 6);

      // Mint tokens to the bridge minter
      await contractInstance.connect(bridgeMinter).bridgeMint(bridgeMinter.address, mintAmount);
      
      const balanceBefore = await contractInstance.balanceOf(bridgeMinter.address);
      expect(balanceBefore).to.equal(mintAmount);

      // Bridge minter should be able to burn their own tokens
      await expect(
        contractInstance.connect(bridgeMinter).bridgeBurn(bridgeMinter.address, burnAmount)
      )
        .to.emit(contractInstance, "Transfer")
        .withArgs(bridgeMinter.address, addressZero, burnAmount)
        .to.emit(contractInstance, "BurnBridge")
        .withArgs(bridgeMinter.address, bridgeMinter.address, burnAmount);

      const balanceAfter = await contractInstance.balanceOf(bridgeMinter.address);
      expect(balanceAfter).to.equal(mintAmount - burnAmount);
    });

    it("Should revert when bridge minter tries to burn from another address without approval", async function () {
      const mintAmount = ethers.parseUnits("1000", 6);

      // Mint tokens to user2
      await contractInstance.connect(bridgeMinter).bridgeMint(user2.address, mintAmount);

      // Bridge minter tries to burn from user2 without approval - should fail
      await expect(
        contractInstance.connect(bridgeMinter).bridgeBurn(user2.address, mintAmount)
      ).to.be.revertedWithCustomError(contractInstance, "ERC20InsufficientAllowance");
    });

    it("Should revert when bridge minter tries to burn from another address with insufficient approval", async function () {
      const mintAmount = ethers.parseUnits("1000", 6);
      const approvalAmount = ethers.parseUnits("500", 6);

      // Mint tokens to user2
      await contractInstance.connect(bridgeMinter).bridgeMint(user2.address, mintAmount);

      // User2 approves bridge minter for only 500 tokens
      await contractInstance.connect(user2).approve(bridgeMinter.address, approvalAmount);

      // Bridge minter tries to burn 1000 tokens - should fail
      await expect(
        contractInstance.connect(bridgeMinter).bridgeBurn(user2.address, mintAmount)
      ).to.be.revertedWithCustomError(contractInstance, "ERC20InsufficientAllowance");
    });

    it("Should allow bridge minter to burn from another address with sufficient approval and reduce allowance", async function () {
      const mintAmount = ethers.parseUnits("1000", 6);
      const burnAmount = ethers.parseUnits("500", 6);

      // Get initial balance
      const balanceBefore = await contractInstance.balanceOf(user2.address);

      // Mint tokens to user2
      await contractInstance.connect(bridgeMinter).bridgeMint(user2.address, mintAmount);

      // User2 approves bridge minter for 1000 tokens
      await contractInstance.connect(user2).approve(bridgeMinter.address, mintAmount);

      const allowanceBefore = await contractInstance.allowance(user2.address, bridgeMinter.address);
      expect(allowanceBefore).to.equal(mintAmount);

      // Bridge minter burns 500 tokens from user2
      await expect(
        contractInstance.connect(bridgeMinter).bridgeBurn(user2.address, burnAmount)
      )
        .to.emit(contractInstance, "Transfer")
        .withArgs(user2.address, addressZero, burnAmount)
        .to.emit(contractInstance, "BurnBridge")
        .withArgs(bridgeMinter.address, user2.address, burnAmount);

      const balanceAfter = await contractInstance.balanceOf(user2.address);
      expect(balanceAfter).to.equal(balanceBefore + mintAmount - burnAmount);

      // Allowance should be reduced by burn amount
      const allowanceAfter = await contractInstance.allowance(user2.address, bridgeMinter.address);
      expect(allowanceAfter).to.equal(mintAmount - burnAmount);
    });

    it("Should allow bridge minter to burn from another address with infinite approval without reducing allowance", async function () {
      const mintAmount = ethers.parseUnits("1000", 6);
      const burnAmount = ethers.parseUnits("500", 6);
      const maxUint256 = ethers.MaxUint256;

      // Get initial balance
      const balanceBefore = await contractInstance.balanceOf(user2.address);

      // Mint tokens to user2
      await contractInstance.connect(bridgeMinter).bridgeMint(user2.address, mintAmount);

      // User2 approves bridge minter for infinite amount
      await contractInstance.connect(user2).approve(bridgeMinter.address, maxUint256);

      const allowanceBefore = await contractInstance.allowance(user2.address, bridgeMinter.address);
      expect(allowanceBefore).to.equal(maxUint256);

      // Bridge minter burns 500 tokens from user2
      await expect(
        contractInstance.connect(bridgeMinter).bridgeBurn(user2.address, burnAmount)
      )
        .to.emit(contractInstance, "Transfer")
        .withArgs(user2.address, addressZero, burnAmount)
        .to.emit(contractInstance, "BurnBridge")
        .withArgs(bridgeMinter.address, user2.address, burnAmount);

      const balanceAfter = await contractInstance.balanceOf(user2.address);
      expect(balanceAfter).to.equal(balanceBefore + mintAmount - burnAmount);

      // Allowance should remain infinite (not reduced)
      const allowanceAfter = await contractInstance.allowance(user2.address, bridgeMinter.address);
      expect(allowanceAfter).to.equal(maxUint256);
    });
  });

  describe("Burn Authorization Edge Cases", function () {
    it("Should revert when trying to burn from blacklisted address", async function () {
      const mintAmount = ethers.parseUnits("1000", 6);

      // Mint tokens to user3
      await contractInstance.connect(minter).mint(user3.address, mintAmount);

      // User3 approves minter
      await contractInstance.connect(user3).approve(minter.address, mintAmount);

      // Blacklist user3
      await contractInstance.connect(blacklister).blacklist(user3.address);

      // Minter tries to burn from blacklisted address - should fail
      await expect(
        contractInstance.connect(minter).burn(user3.address, mintAmount)
      ).to.be.revertedWithCustomError(contractInstance, "SenderBlacklisted");

      // Unblacklist for cleanup
      await contractInstance.connect(blacklister).unblacklist(user3.address);
    });

    it("Should work correctly when using ERC20 Permit for approval followed by burn", async function () {
      const mintAmount = ethers.parseUnits("1000", 6);
      const burnAmount = ethers.parseUnits("500", 6);

      // Get initial balance
      const balanceBefore = await contractInstance.balanceOf(user1.address);

      // Mint tokens to user1
      await contractInstance.connect(minter).mint(user1.address, mintAmount);

      // Get permit signature parameters
      const nonce = await contractInstance.nonces(user1.address);
      const deadline = (await time.latest()) + 3600; // 1 hour from now
      const name = await contractInstance.name();
      const version = "1";
      const chainId = (await ethers.provider.getNetwork()).chainId;

      // Create permit signature
      const domain = {
        name: name,
        version: version,
        chainId: chainId,
        verifyingContract: await contractInstance.getAddress(),
      };

      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      const value = {
        owner: user1.address,
        spender: minter.address,
        value: mintAmount,
        nonce: nonce,
        deadline: deadline,
      };

      const signature = await user1.signTypedData(domain, types, value);
      const sig = ethers.Signature.from(signature);

      // Execute permit
      await contractInstance.permit(
        user1.address,
        minter.address,
        mintAmount,
        deadline,
        sig.v,
        sig.r,
        sig.s
      );

      // Verify allowance was set
      const allowance = await contractInstance.allowance(user1.address, minter.address);
      expect(allowance).to.equal(mintAmount);

      // Now minter can burn
      await expect(
        contractInstance.connect(minter).burn(user1.address, burnAmount)
      )
        .to.emit(contractInstance, "Transfer")
        .withArgs(user1.address, addressZero, burnAmount)
        .to.emit(contractInstance, "BurnNative")
        .withArgs(minter.address, user1.address, burnAmount);

      const balanceAfter = await contractInstance.balanceOf(user1.address);
      expect(balanceAfter).to.equal(balanceBefore + mintAmount - burnAmount);
    });

    it("Should correctly update allowance and emit Transfer event when burning", async function () {
      const mintAmount = ethers.parseUnits("1000", 6);
      const burnAmount = ethers.parseUnits("500", 6);

      // Get initial balance
      const balanceBefore = await contractInstance.balanceOf(user1.address);

      // Mint tokens to user1
      await contractInstance.connect(minter).mint(user1.address, mintAmount);

      // User1 approves minter
      await contractInstance.connect(user1).approve(minter.address, mintAmount);

      const allowanceBefore = await contractInstance.allowance(user1.address, minter.address);
      expect(allowanceBefore).to.equal(mintAmount);

      // Burn should emit Transfer event and properly update allowance
      await expect(
        contractInstance.connect(minter).burn(user1.address, burnAmount)
      )
        .to.emit(contractInstance, "Transfer")
        .withArgs(user1.address, ethers.ZeroAddress, burnAmount)
        .to.emit(contractInstance, "BurnNative")
        .withArgs(minter.address, user1.address, burnAmount);

      // Verify allowance was correctly reduced
      const allowanceAfter = await contractInstance.allowance(user1.address, minter.address);
      expect(allowanceAfter).to.equal(mintAmount - burnAmount);
      
      // Verify balance was reduced to initial + minted - burned
      const balance = await contractInstance.balanceOf(user1.address);
      expect(balance).to.equal(balanceBefore + mintAmount - burnAmount);
    });

    it("Should prevent unauthorized user from burning even with tokens", async function () {
      const mintAmount = ethers.parseUnits("1000", 6);

      // Mint tokens to user1 and user2
      await contractInstance.connect(minter).mint(user1.address, mintAmount);
      await contractInstance.connect(minter).mint(user2.address, mintAmount);

      // User2 approves user1 (who is not a minter)
      await contractInstance.connect(user2).approve(user1.address, mintAmount);

      // User1 (not a minter) tries to burn user2's tokens - should fail
      await expect(
        contractInstance.connect(user1).burn(user2.address, mintAmount)
      ).to.be.revert(ethers); // Will revert due to lack of MINTER role
    });

    it("Should handle multiple approvals and burns correctly", async function () {
      const mintAmount = ethers.parseUnits("3000", 6);
      const approval1 = ethers.parseUnits("1000", 6);
      const approval2 = ethers.parseUnits("500", 6);
      const burn1 = ethers.parseUnits("800", 6);
      const burn2 = ethers.parseUnits("400", 6);

      // Get initial balance
      const balanceBefore = await contractInstance.balanceOf(user1.address);

      // Mint tokens to user1
      await contractInstance.connect(minter).mint(user1.address, mintAmount);

      // First approval and burn
      await contractInstance.connect(user1).approve(minter.address, approval1);
      await contractInstance.connect(minter).burn(user1.address, burn1);
      
      let allowance = await contractInstance.allowance(user1.address, minter.address);
      expect(allowance).to.equal(approval1 - burn1);

      // Second approval (replaces existing)
      await contractInstance.connect(user1).approve(minter.address, approval2);
      allowance = await contractInstance.allowance(user1.address, minter.address);
      expect(allowance).to.equal(approval2);

      // Second burn
      await contractInstance.connect(minter).burn(user1.address, burn2);
      allowance = await contractInstance.allowance(user1.address, minter.address);
      expect(allowance).to.equal(approval2 - burn2);

      // Verify final balance
      const balance = await contractInstance.balanceOf(user1.address);
      expect(balance).to.equal(balanceBefore + mintAmount - burn1 - burn2);
    });
  });
});
