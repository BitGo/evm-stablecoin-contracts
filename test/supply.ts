import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { DummyAggregatorV3, USDS } from "../typechain-types";

describe("USDS Minting,  Burning And Token Rescue", function () {
  let contractInstance: USDS;
  let dummyAggregatorInstance: DummyAggregatorV3;
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
  const timeStampInSeconds = Math.floor(new Date().getTime() / 1000);
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
        rescuer.address,
        dummyAggregatorAddress,
      ],
      { kind: "uups" }
    );
    contractInstance = (await contract.waitForDeployment()) as unknown as USDS;
  });

  it("Should have 0 total supply on init and unpaused", async function () {
    const paused = await contractInstance.paused();

    expect(await contractInstance.totalSupply()).to.equal(0);
    expect(paused).to.be.false;
  });

  it("Should fail to mint tokens exceeding max mint limit", async function () {
    // Set mint amount greater than the maxMintLimit
    const mintAmount = ethers.parseUnits("2000000", 18); // 2 million tokens (assuming maxMintLimit is 1 million)

    await dummyAggregatorInstance
      .connect(supplyController)
      .updateData(mintAmount, 1, timeStampInSeconds, 1);

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
    await dummyAggregatorInstance
      .connect(supplyController)
      .updateData(mintAmount, 1, timeStampInSeconds, 1);
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
    const totalSupply = await contractInstance.totalSupply();
    await dummyAggregatorInstance
      .connect(supplyController)
      .updateData(totalSupply + transferAmount, 1, timeStampInSeconds, 1);
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
    let totalSupply = await contractInstance.totalSupply();
    await dummyAggregatorInstance
      .connect(supplyController)
      .updateData(totalSupply + burnAmount, 1, timeStampInSeconds, 1);

    await contractInstance
      .connect(supplyController)
      .mint(reserve1.address, burnAmount);
    totalSupply = await contractInstance.totalSupply();
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

  it("Should fail to mint tokens when there is not enough reserve from the aggregator", async function () {
    const mintAmount = ethers.parseUnits("1000", 18);
    let failed = false;
    const totalSupply = await contractInstance.totalSupply();
    await dummyAggregatorInstance
      .connect(supplyController)
      .updateData(totalSupply, 1, timeStampInSeconds, 1);
    try {
      // Attempt to mint tokens when there is not enough reserve from the aggregator
      await contractInstance
        .connect(supplyController)
        .mint(reserve1.address, mintAmount);
    } catch (error) {
      failed = true;
      expect((error as Error).message).equal(
        "VM Exception while processing transaction: reverted with custom error 'SupplyExceedsReserves()'"
      );
      expect(error).to.be.an("error");
    }
    expect(failed).to.be.true;
  });

  it("Should handle decimal normalization correctly when PoR decimals are higher than token decimals", async function() {
    const mintAmount = ethers.parseUnits("1000", 6); // Token has 6 decimals
    const totalSupply = await contractInstance.totalSupply();
    
    // Deploy new PoR feed with 18 decimals (higher than token's 6 decimals)
    const newPoRFeed = await ethers.getContractFactory("DummyAggregatorV3"); 
    const newPoRFeedContract = await newPoRFeed.deploy(18, "High decimal PoR", 1);
    
    // Set reserve amount in 18 decimals (need to scale up token amount)
    const scaledReserveAmount =  (mintAmount + totalSupply)  * BigInt(10**12); 
    
    await newPoRFeedContract
      .connect(supplyController)
      .updateData(scaledReserveAmount, 1, timeStampInSeconds, 1);
      
    await contractInstance
      .connect(defaultAdmin)
      .setProofOfReserveFeed(newPoRFeedContract.getAddress());
  
    // Mint should succeed since reserves are properly scaled
    await expect(
      contractInstance
        .connect(supplyController)
        .mint(randomAddress.address, mintAmount)
    ).to.emit(contractInstance, "Mint")
     .withArgs(randomAddress.address, mintAmount);
  });
  
  it("Should fail mint when reserves are insufficient after decimal normalization", async function() {
    const mintAmount = ethers.parseUnits("1000", 6); // Token has 6 decimals
    const totalSupply = await contractInstance.totalSupply();
  
    // Deploy new PoR feed with 18 decimals
    const newPoRFeed = await ethers.getContractFactory("DummyAggregatorV3");
    const newPoRFeedContract = await newPoRFeed.deploy(18, "High decimal PoR", 1);
  
    // Set reserve amount in 18 decimals but insufficient after normalization
    const insufficientReserves = (totalSupply * BigInt(10**12)) + (mintAmount * BigInt(10**11)); // One order of magnitude too low
  
    await newPoRFeedContract
      .connect(supplyController)
      .updateData(insufficientReserves, 1, timeStampInSeconds, 1);
      
    await contractInstance
      .connect(defaultAdmin)
      .setProofOfReserveFeed(newPoRFeedContract.getAddress());
  
    // Mint should fail since normalized reserves are insufficient
    await expect(
      contractInstance
        .connect(supplyController)
        .mint(randomAddress.address, mintAmount)
    ).to.be.revertedWithCustomError(contractInstance, "SupplyExceedsReserves()");
  });

  it("Should fail to mint tokens when proof of reserve feed is outdated", async function () {
    const mintAmount = ethers.parseUnits("1000", 18);
    let failed = false;
    const totalSupply = await contractInstance.totalSupply();
    // Default delay proof of reserve time delay is 24 hours
    await dummyAggregatorInstance
      .connect(supplyController)
      .updateData(totalSupply + mintAmount, 1, timeStampInSeconds, 1); // Delay proof of reserve by 24 hours
    await contractInstance
    .connect(defaultAdmin)
    .setProofOfReserveFeed(dummyAggregatorInstance.getAddress());
    
    try {
      await dummyAggregatorInstance
      .connect(supplyController)
      .updateData(totalSupply + mintAmount, 1, timeStampInSeconds - 86400, 1); 
      // Attempt to mint tokens when proof of reserve feed is more than 24 hours outdated
      await contractInstance
        .connect(supplyController)
        .mint(reserve1.address, mintAmount);
    } catch (error) {
      failed = true;
      expect((error as Error).message).equal(
        "VM Exception while processing transaction: reverted with custom error 'PoROutdated()'"
      );
      expect(error).to.be.an("error");
    }
    expect(failed).to.be.true;

    // Reset proof of reserve time delay to 25 hours
    await expect(
      contractInstance
        .connect(defaultAdmin)
        .setAcceptableProofOfReserveTimeDelay(90000)
    )
      .to.emit(contractInstance, "AcceptableProofOfReserveDelaySet")
      .withArgs(90000);
    const proofOfReserveTimeDelay =
      await contractInstance.getAcceptableProofOfReserveTimeDelay();
    expect(proofOfReserveTimeDelay).to.equal(90000);

    // Attempt to mint tokens when proof of reserve feed is not outdated
    const balance = await contractInstance.balanceOf(reserve1.address);
    await contractInstance
      .connect(supplyController)
      .mint(reserve1.address, mintAmount);
    const newBalance = await contractInstance.balanceOf(reserve1.address);
    expect(newBalance).to.equal(balance + mintAmount);
  });

  it("Should throw error when setAcceptableProofOfReserveTimeDelay is set to zero", async function () {
    let failed = false;
    try {
      await contractInstance
        .connect(defaultAdmin)
        .setAcceptableProofOfReserveTimeDelay(0);
    } catch (error) {
      failed = true;
      expect((error as Error).message).equal(
        "VM Exception while processing transaction: reverted with custom error 'InvalidTimeDelay()'"
      );
      expect(error).to.be.an("error");
    }
    expect(failed).to.be.true;
  });

  it("Should be able to update the proof of reserve feed", async function () {
    const newProofFeed = await ethers.getContractFactory("DummyAggregatorV3");
    const newProofFeedContract = await newProofFeed.deploy(
      6,
      "New proof feed",
      1
    );
    const newProofFeedAddress = await newProofFeedContract.getAddress();
    let totalSupply = await contractInstance.totalSupply();
    await newProofFeedContract
      .connect(supplyController)
      .updateData(totalSupply, 1, timeStampInSeconds, 1);
    await contractInstance
      .connect(defaultAdmin)
      .setProofOfReserveFeed(newProofFeedAddress);
    const currentProofFeed = await contractInstance.getProofOfReserveFeed();
    expect(currentProofFeed).to.equal(newProofFeedAddress);
    ++totalSupply;
    await newProofFeedContract
      .connect(supplyController)
      .updateData(totalSupply, 1, timeStampInSeconds, 1);
    const [proofFeedData , updatedAt, decimals] = await contractInstance
      .connect(defaultAdmin)
      .getLatestReserve();
    expect(proofFeedData).to.equal(totalSupply);
    expect(updatedAt).to.equal(timeStampInSeconds);
    expect(decimals).to.equal(6);

    // Should error out if proof of address set to zero address
    let failed = false;
    try {
      await contractInstance
        .connect(defaultAdmin)
        .setProofOfReserveFeed(addressZero);
    } catch (error) {
      failed = true;
      expect((error as Error).message).equal(
        "VM Exception while processing transaction: reverted with custom error 'InvalidAddress()'"
      );
      expect(error).to.be.an("error");
    }
    expect(failed).to.be.true;
    // setting state back as is
    await dummyAggregatorInstance
      .connect(supplyController)
      .updateData(totalSupply, 1, timeStampInSeconds, 1);
    await expect(
      contractInstance
        .connect(defaultAdmin)
        .setProofOfReserveFeed(dummyAggregatorInstance.getAddress())
    )
      .to.emit(contractInstance, "ProofOfReserveFeedSet")
      .withArgs(dummyAggregatorInstance.getAddress());
  });

  it("Should not allow setting PoR feed with decimals > 18 or  < 6", async function() {
    const newProofFeed = await ethers.getContractFactory("DummyAggregatorV3");
    const newPoRFeedContract = await newProofFeed.deploy(
      19, // 19 decimals (greater than 18)
      "Invalid decimal PoR feed",
      1
    );
    const newPoRFeedAddress = await newPoRFeedContract.getAddress();
    const totalSupply = await contractInstance.totalSupply();
  
    // Set some valid reserve data for the new feed
    await newPoRFeedContract
      .connect(supplyController)
      .updateData(totalSupply, 1, timeStampInSeconds, 1);
  
    // Attempt to set the new feed with invalid decimals
    await expect(
      contractInstance
        .connect(defaultAdmin)
        .setProofOfReserveFeed(newPoRFeedAddress)
    ).to.be.revertedWithCustomError(contractInstance, "InvalidDecimals()");

    const newPoRFeedContractWithLessPrecision = await newProofFeed.deploy(
      5, 
      "Invalid decimal PoR feed",
      1
    );
    const porFeedWithLessPrecision = await newPoRFeedContractWithLessPrecision.getAddress();
    await newPoRFeedContractWithLessPrecision
    .connect(supplyController)
    .updateData(totalSupply, 1, timeStampInSeconds, 1);

    await expect(
      contractInstance
        .connect(defaultAdmin)
        .setProofOfReserveFeed(porFeedWithLessPrecision)
    ).to.be.revertedWithCustomError(contractInstance, "InvalidDecimals()");

  
    // Verify that feed was not updated
    const currentFeed = await contractInstance.getProofOfReserveFeed();
    expect(currentFeed).to.not.equal(newPoRFeedAddress);
  });

  it("Should revert if the new proof of reserve feed data is stale", async function () {
    const newProofFeed = await ethers.getContractFactory("DummyAggregatorV3");
    const newProofFeedContract = await newProofFeed.deploy(
      6,
      "New proof feed",
      1
    );
    const newProofFeedAddress = await newProofFeedContract.getAddress();

    // Simulate stale data by setting a timestamp older than the acceptable delay
    const staleTimestamp = timeStampInSeconds - 90000; // 25 hours
    await newProofFeedContract
      .connect(supplyController)
      .updateData(12345, 1, staleTimestamp, 1);

    let failed = false;
    try {
      await contractInstance
        .connect(defaultAdmin)
        .setProofOfReserveFeed(newProofFeedAddress);
    } catch (error) {
      failed = true;
      expect((error as Error).message).to.equal(
        "VM Exception while processing transaction: reverted with custom error 'PoROutdated()'"
      );
      expect(error).to.be.an("error");
    }
    expect(failed).to.be.true;

    // Verify that the proof of reserve feed remains unchanged
    const currentProofFeed = await contractInstance.getProofOfReserveFeed();
    expect(currentProofFeed).to.not.equal(newProofFeedAddress);
  });

  it("Should mint tokens successfully in batch to multiple external addresses", async function () {
    const totalSupply = await contractInstance.totalSupply();
    const mintAmount = ethers.parseUnits("1000", 18);
    const addresses = [
      "0x32FdfD2eA08d916B8f4e73d057E99bc3358b2F4D",
      "0xECc966AB425F3F5Bd58085ce4eBDBf81D829126F",
      "0x4cC9f0D4dAD08B15e5C5fb85f9e390B6cddA88Ba",
    ];
    const amounts = [mintAmount, mintAmount * 2n, mintAmount * 3n];
    const reserve = totalSupply + mintAmount * 6n;

    await dummyAggregatorInstance
      .connect(supplyController)
      .updateData(reserve, 1, timeStampInSeconds, 1);
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

    const newTotalSupply = await contractInstance.totalSupply();
    expect(newTotalSupply).to.equal(reserve);
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

  it("Should fail to mint tokens in batch when there is not enough reserve from the aggregator", async function () {
    const mintAmount = ethers.parseUnits("1000", 18);
    const addresses = [reserve1.address, reserve2.address, reserve3.address];
    const amounts = [mintAmount, mintAmount, mintAmount];
    let failed = false;

    const totalSupply = await contractInstance.totalSupply();

    // Get the initial balances of the addresses
    const initialBalances = await Promise.all(
      addresses.map((address) => contractInstance.balanceOf(address))
    );

    await dummyAggregatorInstance
      .connect(supplyController)
      // We add the reserve amount to mintamount * 2 to do atleast 2 minting operations
      .updateData(totalSupply + mintAmount * 2n, 1, timeStampInSeconds, 1);

    try {
      // Attempt to mint tokens in batch when there is not enough reserve from the aggregator
      await contractInstance
        .connect(supplyController)
        .mintBatch(addresses, amounts);
    } catch (error) {
      failed = true;
      expect((error as Error).message).equal(
        "VM Exception while processing transaction: reverted with custom error 'SupplyExceedsReserves()'"
      );
      expect(error).to.be.an("error");
    }

    const finalBalances = await Promise.all(
      addresses.map((address) => contractInstance.balanceOf(address))
    );

    // Check that the balances remain the same
    for (let i = 0; i < addresses.length; i++) {
      expect(finalBalances[i]).to.equal(initialBalances[i]);
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
