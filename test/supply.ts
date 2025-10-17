import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Stablecoin } from "../typechain-types";

describe("Minting,  Burning And Token Rescue", function () {
  let contractInstance: Stablecoin;
  let defaultAdmin: SignerWithAddress;
  let freezer: SignerWithAddress;
  let supplyController: SignerWithAddress;
  let upgrader: SignerWithAddress;
  let reserve1: SignerWithAddress;
  let reserve2: SignerWithAddress;
  let reserve3: SignerWithAddress;
  let blacklister: SignerWithAddress;
  let rescuer: SignerWithAddress;
  let recoverAddress: SignerWithAddress;
  let randomAddress: SignerWithAddress;
  const addressZero = "0x0000000000000000000000000000000000000000";

  before(async function () {
    [
      defaultAdmin,
      freezer,
      supplyController,
      upgrader,
      blacklister,
      reserve1,
      reserve2,
      reserve3,
      rescuer,
      recoverAddress,
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
        supplyController.address,
        upgrader.address,
        blacklister.address,
        rescuer.address,
        1000000 * (10 ** 6)
      ],
      { kind: "uups" }
    );
    contractInstance = (await contract.waitForDeployment()) as unknown as Stablecoin;
  });

  it("Should have 0 total supply on init and unpaused", async function () {
    const paused = await contractInstance.paused();

    expect(await contractInstance.totalSupply()).to.equal(0);
    expect(paused).to.be.false;
  });

  it("Should fail to mint tokens exceeding max mint limit", async function () {
    // Set mint amount greater than the maxMintLimit
    const mintAmount = ethers.parseUnits("2000000", 18); // 2 million tokens (assuming maxMintLimit is 1 million)

    await expect(
      contractInstance
        .connect(supplyController)
        .mint(randomAddress.address, mintAmount)
    ).to.be.revertedWithCustomError(contractInstance, "ExceedsMintTransactionCap()");
  });

  it("Should update the max mint limit successfully through setter function", async function () {
    const newPerTransactionCap = ethers.parseUnits("2000000", 18); // 2 million tokens

    // Update the max mint limit using the setter function
    await expect(contractInstance
      .connect(defaultAdmin)
      .setMintCapPerTransaction(newPerTransactionCap)
    )
      .to.emit(contractInstance, "MintCapPerTransactionSet")
      .withArgs(newPerTransactionCap)

    const currentMaxMintLimit = await contractInstance.getMintCapPerTransaction();
    expect(currentMaxMintLimit).to.equal(newPerTransactionCap);

    // Attempt to mint exceeding the updated limit and expect it to fail
    const exceedingMintAmount = ethers.parseUnits("2500000", 18); // 2.5 million tokens
    await expect(
      contractInstance.connect(supplyController).mint(randomAddress.address, exceedingMintAmount)
    ).to.be.revertedWithCustomError(contractInstance, "ExceedsMintTransactionCap()");
  });

  it("Should fail to update the max mint limit to zero", async function () {
    const zeroCap = ethers.parseUnits("0", 18); // Zero tokens

    // Attempt to update the max mint limit to zero and expect it to fail
    await expect(
      contractInstance.connect(defaultAdmin).setMintCapPerTransaction(zeroCap)
    ).to.be.revertedWithCustomError(contractInstance, "InvalidAmount()");
  });

  it("Should mint tokens successfully to any external address", async function () {
    const mintAmount = ethers.parseUnits("1000", 18);
    await expect(
      contractInstance
        .connect(supplyController)
        .mint(randomAddress.address, mintAmount)
    )
      .to.emit(contractInstance, "Transfer")
      .withArgs(addressZero, randomAddress.address, mintAmount)
      .to.emit(contractInstance, "Mint")
      .withArgs(randomAddress.address, mintAmount);
    const balance = await contractInstance.balanceOf(randomAddress.address);
    expect(balance).to.equal(mintAmount);
    expect(await contractInstance.totalSupply()).to.equal(mintAmount);
  });

  it("Should be able to recover tokens stuck in contract address", async function () {
    const transferAmount = ethers.parseUnits("1000", 18);
    await contractInstance
      .connect(supplyController)
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
      .withArgs(contractInstance.getAddress(), recoverAddress.address, transferAmount);
    const newTokenContractBalance = await contractInstance.balanceOf(
      contractInstance.getAddress()
    );
    expect(newTokenContractBalance).to.equal(ethers.parseUnits("0", 18));
    const balanceAtRecoverAddress = await contractInstance.balanceOf(
      recoverAddress.address
    );
    expect(balanceAtRecoverAddress).to.equal(transferAmount);
  });
  
  it("Should fail to rescue tokens when called by unauthorized address", async function() {
    const transferAmount = ethers.parseUnits("1000", 18);
  
    await expect(
      contractInstance.connect(randomAddress).rescueTokens(
        contractInstance.getAddress(),
        recoverAddress.address,
        transferAmount  
      )
    ).to.be.reverted;
  });
  
  it("Should fail to rescue tokens to address zero", async function() {
    const transferAmount = ethers.parseUnits("1000", 18);
  
    await expect(
      contractInstance.connect(rescuer).rescueTokens(
        contractInstance.getAddress(), 
        addressZero,
        transferAmount
      )
    ).to.be.revertedWithCustomError(contractInstance, "InvalidAddress()");
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
    const transferAmount = ethers.parseUnits("1000", 18);
    
    // Blacklist the recipient address
    await contractInstance.connect(blacklister).blacklist(recoverAddress.address);
  
    await expect(
      contractInstance.connect(rescuer).rescueTokens(
        contractInstance.getAddress(),
        recoverAddress.address,
        transferAmount
      )
    ).to.be.revertedWithCustomError(contractInstance, "RecipientBlacklisted");
    await contractInstance.connect(blacklister).unblacklist(recoverAddress.address);
  });

  it("Should fail to mint tokens when called by unauthorized address", async function () {
    const mintAmount = ethers.parseUnits("1000", 18);
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
    const burnAmount = ethers.parseUnits("500", 18);
    await contractInstance
      .connect(supplyController)
      .mint(reserve1.address, burnAmount);
    const totalSupply = await contractInstance.totalSupply();
    const initialBalance = await contractInstance.balanceOf(reserve1.address);
    await expect(
      contractInstance
        .connect(supplyController)
        .burn(reserve1.address, burnAmount)
    )
      .to.emit(contractInstance, "Transfer")
      .withArgs(reserve1.address, addressZero, burnAmount)
      .to.emit(contractInstance, "Burn")
      .withArgs(reserve1.address, burnAmount);
    const finalBalance = await contractInstance.balanceOf(reserve1.address);
    expect(finalBalance).to.equal(initialBalance - burnAmount);
    expect(await contractInstance.totalSupply()).to.equal(
      totalSupply - burnAmount
    );
  });

  it("Should fail to burn tokens when called by unauthorized address", async function () {
    const burnAmount = ethers.parseUnits("500", 18);
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
    const mintAmount = ethers.parseUnits("1000", 18);
    const addresses = [
      "0x32FdfD2eA08d916B8f4e73d057E99bc3358b2F4D",
      "0xECc966AB425F3F5Bd58085ce4eBDBf81D829126F",
      "0x4cC9f0D4dAD08B15e5C5fb85f9e390B6cddA88Ba",
    ];
    const amounts = [mintAmount, mintAmount * 2n, mintAmount * 3n];

    await expect(
      contractInstance.connect(supplyController).mintBatch(addresses, amounts)
    )
      .to.emit(contractInstance, "Transfer")
      .withArgs(addressZero, addresses[0], mintAmount)
      .to.emit(contractInstance, "Mint")
      .withArgs(addresses[0], mintAmount)
      .to.emit(contractInstance, "Transfer")
      .withArgs(addressZero, addresses[1], mintAmount * 2n)
      .to.emit(contractInstance, "Mint")
      .withArgs(addresses[1], mintAmount * 2n)
      .to.emit(contractInstance, "Transfer")
      .withArgs(addressZero, addresses[2], mintAmount * 3n);

    for (const address of addresses) {
      const balance = await contractInstance.balanceOf(address);
      expect(balance).to.equal(amounts[addresses.indexOf(address)]);
    }
  });

  it("Should fail to mint tokens in batch when called by unauthorized address", async function () {
    const mintAmount = ethers.parseUnits("1000", 18);
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
    const mintAmount = ethers.parseUnits("1000", 18);
    const addresses = [reserve1.address, reserve2.address];
    const amounts = [mintAmount, mintAmount, mintAmount];
    let failed = false;

    try {
      // Attempt to mint tokens when address array and amount array length doesn't match
      await contractInstance
        .connect(supplyController)
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
});
