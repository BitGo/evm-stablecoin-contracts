import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
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
    await contractInstance
      .connect(supplyController)
      .mint(randomAddress.address, mintAmount);
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
    await contractInstance
      .connect(rescuer)
      .rescueTokens(
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
    await contractInstance
      .connect(supplyController)
      .burn(reserve1.address, burnAmount);
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
        "VM Exception while processing transaction: reverted with reason string 'Address is not a reserve address'"
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
    await contractInstance
      .connect(defaultAdmin)
      .setAcceptableProofOfReserveTimeDelay(14400);
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

  it("Should be able to update the proof of reserve feed", async function () {
    const newProofFeed = await ethers.getContractFactory("DummyAggregatorV3");
    const newProofFeedContract = await newProofFeed.deploy(
      6,
      "New proof feed",
      1
    );
    const newProofFeedAddress = await newProofFeedContract.getAddress();
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
    // setting state back as is
    await contractInstance
      .connect(defaultAdmin)
      .setProofOfReserveFeed(dummyAggregatorInstance.getAddress());
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
    await contractInstance
      .connect(supplyController)
      .mintBatch(addresses, amounts);

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
});
