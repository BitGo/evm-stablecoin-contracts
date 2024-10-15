import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { DummyAggregatorV3, USDS } from "../typechain-types";

describe("Transfer Tests", function () {
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
  let randomAddress: SignerWithAddress;
  
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

    describe("transferFrom", function () {
        it("should prevent 0 value transfers", async function () {
            // Set up test scenario
            const sender = defaultAdmin;
            const recipient = randomAddress;
            const amount =  ethers.parseUnits("0", 18);

            // Call the transferFrom function
            await expect(
                contractInstance.connect(sender).transferFrom(
                    sender.address,
                    recipient.address,
                    amount
                )
            ).to.be.revertedWith("Transfer amount must be greater than zero");
        });
    });

});
