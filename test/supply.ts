import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { DummyAggregatorV3, USDS } from "../typechain-types";

describe("USDS Minting and Burning", function () {
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
        [reserve1.address, reserve2.address, reserve3.address],
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

  it("Should correctly identify reserve addresses", async function () {
    const isReserve1 = await contractInstance.isReserveAddress(
      reserve1.address
    );
    const isReserve2 = await contractInstance.isReserveAddress(
      reserve2.address
    );

    expect(isReserve1).to.be.true;
    expect(isReserve2).to.be.true;
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

  it("Should not allow minting when the contract is paused", async function () {
    const mintAmount = ethers.parseUnits("1000", 18);

    // Pause the contract
    await contractInstance.connect(freezer).pause();

    // Try to mint tokens while paused and check for the custom error
    await expect(
      contractInstance
        .connect(supplyController)
        .mint(randomAddress.address, mintAmount)
    )
      .to.be.revertedWithCustomError(contractInstance, "EnforcedPause");

    // Unpause the contract
    await contractInstance.connect(freezer).unpause();
  });

  it("Should add a token address successfully to trusted token list", async function () {
    const newTrustedToken = contractInstance.getAddress();
    await expect(
      contractInstance
        .connect(defaultAdmin)
        .addTrustedToken(newTrustedToken)
    )
      .to.emit(contractInstance, "TrustedTokenAdded")
      .withArgs(newTrustedToken);
    const isTrustedToken =
      await contractInstance.isTrustedToken(newTrustedToken);
    expect(isTrustedToken).to.be.true;

    const randomTrustedToken = "0xABcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD";
    await expect(
      contractInstance
        .connect(defaultAdmin)
        .addTrustedToken(randomTrustedToken)
    )
      .to.emit(contractInstance, "TrustedTokenAdded")
      .withArgs(randomTrustedToken);
    const isTrustedToken1 =
      await contractInstance.isTrustedToken(randomTrustedToken);
    expect(isTrustedToken1).to.be.true;
  });

  it("Should remove a token address successfully from trusted token list", async function () {
    const trustedTokenToRemove = "0xABcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD";
    await expect(
      contractInstance
        .connect(defaultAdmin)
        .removeTrustedToken(trustedTokenToRemove)
    )
      .to.emit(contractInstance, "TrustedTokenRemoved")
      .withArgs(trustedTokenToRemove);
    const isTrustedToken = await contractInstance.isReserveAddress(
      trustedTokenToRemove
    );
    expect(isTrustedToken).to.be.false;
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
      );
    const newTokenContractBalance = await contractInstance.balanceOf(
      contractInstance.getAddress()
    );
    expect(newTokenContractBalance).to.equal(ethers.parseUnits("0", 18));
    const balanceAtRecoverAddress = await contractInstance.balanceOf(
      recoverAddress.address
    );
    expect(balanceAtRecoverAddress).to.equal(transferAmount);
  });

  it("Should burn tokens successfully from reserve1", async function () {
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

  it("Should fail to burn tokens from a non-reserve address", async function () {
    const burnAmount = ethers.parseUnits("500", 18);
    let failed = false;
    try {
      // Attempt to burn tokens from a non-reserve address (e.g., freezer)
      await contractInstance
        .connect(supplyController)
        .burn(freezer.address, burnAmount);
    } catch (error) {
      failed = true;
      expect((error as Error).message).equal(
        "VM Exception while processing transaction: reverted with reason string 'Burn only allowed from a reserve address'"
      );

      expect(error).to.be.an("error");
    }
    expect(failed).to.be.true;
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
        "VM Exception while processing transaction: reverted with reason string 'Total supply + requested mint amount exceeds available reserves'"
      );
      expect(error).to.be.an("error");
    }
    expect(failed).to.be.true;
  });

  it("Should fail to mint tokens when proof of reserve feed is outdated", async function () {
    const mintAmount = ethers.parseUnits("1000", 18);
    let failed = false;
    const totalSupply = await contractInstance.totalSupply();
    // Default delay proof of reserve time delay is 3 hours
    await dummyAggregatorInstance
      .connect(supplyController)
      .updateData(totalSupply + mintAmount, 1, timeStampInSeconds - 10800, 1); // Delay proof of reserve by 3 hours
    try {
      // Attempt to mint tokens when proof of reserve feed is more than 3 hours outdated
      await contractInstance
        .connect(supplyController)
        .mint(reserve1.address, mintAmount);
    } catch (error) {
      failed = true;
      expect((error as Error).message).equal(
        "VM Exception while processing transaction: reverted with reason string 'Proof of reserve is out of date'"
      );
      expect(error).to.be.an("error");
    }
    expect(failed).to.be.true;

    // Reset proof of reserve time delay to 4 hours
    await expect(
      contractInstance
        .connect(defaultAdmin)
        .setAcceptableProofOfReserveTimeDelay(14400)
    )
      .to.emit(contractInstance, "AcceptableProofOfReserveDelaySet")
      .withArgs(14400);
    const proofOfReserveTimeDelay =
      await contractInstance.acceptableProofOfReserveTimeDelay();
    expect(proofOfReserveTimeDelay).to.equal(14400);

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
        "VM Exception while processing transaction: reverted with reason string 'Time delay must be greater than zero'"
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
    await newProofFeedContract
      .connect(supplyController)
      .updateData(12345, 1, timeStampInSeconds, 1);
    await contractInstance
      .connect(defaultAdmin)
      .setProofOfReserveFeed(newProofFeedAddress);
    const currentProofFeed = await contractInstance.getProofOfReserveFeed();
    expect(currentProofFeed).to.equal(newProofFeedAddress);

    await newProofFeedContract
      .connect(supplyController)
      .updateData(1234, 1, timeStampInSeconds, 1);
    const [proofFeedData] = await contractInstance
      .connect(defaultAdmin)
      .getLatestReserve();
    expect(proofFeedData).to.equal(1234);

    // Should error out if proof of address set to zero address
    let failed = false;
    try {
      await contractInstance
        .connect(defaultAdmin)
        .setProofOfReserveFeed(addressZero);
    } catch (error) {
      failed = true;
      expect((error as Error).message).equal(
        "VM Exception while processing transaction: reverted with reason string 'Cannot add zero address as a proof of reserve feed'"
      );
      expect(error).to.be.an("error");
    }
    expect(failed).to.be.true;

    // setting state back as is
    await dummyAggregatorInstance
      .connect(supplyController)
      .updateData(12345, 1, timeStampInSeconds, 1);
    await expect(
      contractInstance
        .connect(defaultAdmin)
        .setProofOfReserveFeed(dummyAggregatorInstance.getAddress())
    )
      .to.emit(contractInstance, "ProofOfReserveFeedSet")
      .withArgs(dummyAggregatorInstance.getAddress());
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
        "VM Exception while processing transaction: reverted with reason string 'Total supply + requested mint amount exceeds available reserves'"
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
        "VM Exception while processing transaction: reverted with reason string 'Address array and amount array length must match'"
      );
      expect(error).to.be.an("error");
    }

    expect(failed).to.be.true;
  });

  it("Should add a reserve address successfully", async function () {
    const newReserveAddress = "0x1234567890123456789012345678901234567890";
    await expect(
      contractInstance
        .connect(defaultAdmin)
        .addReserveAddress(newReserveAddress)
    )
      .to.emit(contractInstance, "ReserveAddressAdded")
      .withArgs(newReserveAddress);
    const isReserveAddress =
      await contractInstance.isReserveAddress(newReserveAddress);
    expect(isReserveAddress).to.be.true;
  });

  it("Should skip write and event emission if address is already a reserve", async function () {
    const oldReserveAddress = "0x1234567890123456789012345678901234567890";
    const tx = await contractInstance
      .connect(defaultAdmin)
      .addReserveAddress(oldReserveAddress);

    const receipt = await tx.wait();

    const eventFound = receipt.logs.some((log) => {
      const parsedLog = contractInstance.interface.parseLog(log);
      return parsedLog.name === "ReserveAddressAdded";
    });
    expect(eventFound).to.be.false;

    const isReserveAddress =
      await contractInstance.isReserveAddress(oldReserveAddress);
    expect(isReserveAddress).to.be.true;
  });

  it("Should throw an error when trying to add a zero address as a reserve address", async function () {
    let failed = false;
    try {
      await contractInstance
        .connect(defaultAdmin)
        .addReserveAddress(addressZero);
    } catch (error) {
      failed = true;
      expect((error as Error).message).equal(
        "VM Exception while processing transaction: reverted with reason string 'Cannot add zero address as a reserve address'"
      );
      expect(error).to.be.an("error");
    }
    expect(failed).to.be.true;
  });

  it("Should remove a reserve address successfully", async function () {
    const reserveAddressToRemove = reserve1.address;
    await expect(
      contractInstance
        .connect(defaultAdmin)
        .removeReserveAddress(reserveAddressToRemove)
    )
      .to.emit(contractInstance, "ReserveAddressRemoved")
      .withArgs(reserveAddressToRemove);
    const isReserveAddress = await contractInstance.isReserveAddress(
      reserveAddressToRemove
    );
    expect(isReserveAddress).to.be.false;
  });
});
