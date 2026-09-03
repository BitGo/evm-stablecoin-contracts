// Copyright (c) 2026 BitGo, Inc. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import hre from "hardhat";
import { upgrades as upgradesFactory } from "@openzeppelin/hardhat-upgrades";
import { Stablecoin } from "../typechain-types";
const connection = await hre.network.getOrCreate();
const { ethers } = connection;
const upgrades = await upgradesFactory(hre, connection);

describe("Initialize Function Validation Tests", function () {
  let defaultAdmin: SignerWithAddress;
  let freezer: SignerWithAddress;
  let masterMinter: SignerWithAddress;
  let upgrader: SignerWithAddress;
  let blacklister: SignerWithAddress;
  let rescuer: SignerWithAddress;
  const addressZero = "0x0000000000000000000000000000000000000000";
  const defaultAdminDelay = 7 * 24 * 60 * 60; // 7 days
  const MIN_LIMIT = 86400; // 1 day in seconds

  before(async function () {
    [defaultAdmin, freezer, masterMinter, upgrader, blacklister, rescuer] =
      await ethers.getSigners();
  });

  describe("Zero Address Validation", function () {
    it("Should revert when defaultAdmin is zero address", async function () {
      const ContractFactory = await ethers.getContractFactory("Stablecoin");
      
      await expect(
        upgrades.deployProxy(
          ContractFactory,
          [
            "GoUSD",
            "GoUSD",
            6,
            addressZero, // Invalid defaultAdmin
            defaultAdminDelay,
            freezer.address,
            masterMinter.address,
            upgrader.address,
            blacklister.address,
            rescuer.address,
            1000000 * (10 ** 6)
          ],
          { kind: "uups" }
        )
      ).to.be.revertedWithCustomError(ContractFactory, "InvalidAddress");
    });

    it("Should revert when freezer is zero address", async function () {
      const ContractFactory = await ethers.getContractFactory("Stablecoin");
      
      await expect(
        upgrades.deployProxy(
          ContractFactory,
          [
            "GoUSD",
            "GoUSD",
            6,
            defaultAdmin.address,
            defaultAdminDelay,
            addressZero, // Invalid freezer
            masterMinter.address,
            upgrader.address,
            blacklister.address,
            rescuer.address,
            1000000 * (10 ** 6)
          ],
          { kind: "uups" }
        )
      ).to.be.revertedWithCustomError(ContractFactory, "InvalidAddress");
    });

    it("Should revert when masterMinter is zero address", async function () {
      const ContractFactory = await ethers.getContractFactory("Stablecoin");
      
      await expect(
        upgrades.deployProxy(
          ContractFactory,
          [
            "GoUSD",
            "GoUSD",
            6,
            defaultAdmin.address,
            defaultAdminDelay,
            freezer.address,
            addressZero, // Invalid masterMinter
            upgrader.address,
            blacklister.address,
            rescuer.address,
            1000000 * (10 ** 6)
          ],
          { kind: "uups" }
        )
      ).to.be.revertedWithCustomError(ContractFactory, "InvalidAddress");
    });

    it("Should revert when upgrader is zero address", async function () {
      const ContractFactory = await ethers.getContractFactory("Stablecoin");
      
      await expect(
        upgrades.deployProxy(
          ContractFactory,
          [
            "GoUSD",
            "GoUSD",
            6,
            defaultAdmin.address,
            defaultAdminDelay,
            freezer.address,
            masterMinter.address,
            addressZero, // Invalid upgrader
            blacklister.address,
            rescuer.address,
            1000000 * (10 ** 6)
          ],
          { kind: "uups" }
        )
      ).to.be.revertedWithCustomError(ContractFactory, "InvalidAddress");
    });

    it("Should revert when blacklister is zero address", async function () {
      const ContractFactory = await ethers.getContractFactory("Stablecoin");
      
      await expect(
        upgrades.deployProxy(
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
            addressZero, // Invalid blacklister
            rescuer.address,
            1000000 * (10 ** 6)
          ],
          { kind: "uups" }
        )
      ).to.be.revertedWithCustomError(ContractFactory, "InvalidAddress");
    });

    it("Should revert when rescuer is zero address", async function () {
      const ContractFactory = await ethers.getContractFactory("Stablecoin");
      
      await expect(
        upgrades.deployProxy(
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
            addressZero, // Invalid rescuer
            1000000 * (10 ** 6)
          ],
          { kind: "uups" }
        )
      ).to.be.revertedWithCustomError(ContractFactory, "InvalidAddress");
    });
  });

  describe("String Validation", function () {
    it("Should revert when tokenName is empty", async function () {
      const ContractFactory = await ethers.getContractFactory("Stablecoin");
      
      await expect(
        upgrades.deployProxy(
          ContractFactory,
          [
            "", // Empty tokenName
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
        )
      ).to.be.revertedWithCustomError(ContractFactory, "InvalidString");
    });

    it("Should revert when tokenSymbol is empty", async function () {
      const ContractFactory = await ethers.getContractFactory("Stablecoin");
      
      await expect(
        upgrades.deployProxy(
          ContractFactory,
          [
            "GoUSD",
            "", // Empty tokenSymbol
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
        )
      ).to.be.revertedWithCustomError(ContractFactory, "InvalidString");
    });

    it("Should accept valid non-empty strings", async function () {
      const ContractFactory = await ethers.getContractFactory("Stablecoin");
      
      const contract = await upgrades.deployProxy(
        ContractFactory,
        [
          "Test Token",
          "TEST",
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
      
      const contractInstance = (await contract.waitForDeployment()) as unknown as Stablecoin;
      
      expect(await contractInstance.name()).to.equal("Test Token");
      expect(await contractInstance.symbol()).to.equal("TEST");
    });
  });

  describe("Decimals Validation", function () {
    it("Should revert when tokenDecimals is 0", async function () {
      const ContractFactory = await ethers.getContractFactory("Stablecoin");
      
      await expect(
        upgrades.deployProxy(
          ContractFactory,
          [
            "GoUSD",
            "GoUSD",
            0, // Invalid decimals
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
        )
      ).to.be.revertedWithCustomError(ContractFactory, "InvalidDecimals");
    });

    it("Should revert when tokenDecimals is greater than 18", async function () {
      const ContractFactory = await ethers.getContractFactory("Stablecoin");
      
      await expect(
        upgrades.deployProxy(
          ContractFactory,
          [
            "GoUSD",
            "GoUSD",
            19, // Invalid decimals > 18
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
        )
      ).to.be.revertedWithCustomError(ContractFactory, "InvalidDecimals");
    });

    it("Should accept tokenDecimals = 1 (minimum)", async function () {
      const ContractFactory = await ethers.getContractFactory("Stablecoin");
      
      const contract = await upgrades.deployProxy(
        ContractFactory,
        [
          "GoUSD",
          "GoUSD",
          1, // Minimum valid decimals
          defaultAdmin.address,
          defaultAdminDelay,
          freezer.address,
          masterMinter.address,
          upgrader.address,
          blacklister.address,
          rescuer.address,
          MIN_LIMIT
        ],
        { kind: "uups" }
      );
      
      const contractInstance = (await contract.waitForDeployment()) as unknown as Stablecoin;
      expect(await contractInstance.decimals()).to.equal(1);
    });

    it("Should accept tokenDecimals = 18 (maximum)", async function () {
      const ContractFactory = await ethers.getContractFactory("Stablecoin");
      
      const contract = await upgrades.deployProxy(
        ContractFactory,
        [
          "GoUSD",
          "GoUSD",
          18, // Maximum valid decimals
          defaultAdmin.address,
          defaultAdminDelay,
          freezer.address,
          masterMinter.address,
          upgrader.address,
          blacklister.address,
          rescuer.address,
          MIN_LIMIT
        ],
        { kind: "uups" }
      );
      
      const contractInstance = (await contract.waitForDeployment()) as unknown as Stablecoin;
      expect(await contractInstance.decimals()).to.equal(18);
    });

    it("Should accept tokenDecimals = 6 (common value)", async function () {
      const ContractFactory = await ethers.getContractFactory("Stablecoin");
      
      const contract = await upgrades.deployProxy(
        ContractFactory,
        [
          "GoUSD",
          "GoUSD",
          6, // Common decimals value (USDC, USDT)
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
      
      const contractInstance = (await contract.waitForDeployment()) as unknown as Stablecoin;
      expect(await contractInstance.decimals()).to.equal(6);
    });
  });

  describe("Delay Validation", function () {
    it("Should revert when defaultAdminDelay is 0", async function () {
      const ContractFactory = await ethers.getContractFactory("Stablecoin");
      
      await expect(
        upgrades.deployProxy(
          ContractFactory,
          [
            "GoUSD",
            "GoUSD",
            6,
            defaultAdmin.address,
            0, // Invalid delay
            freezer.address,
            masterMinter.address,
            upgrader.address,
            blacklister.address,
            rescuer.address,
            1000000 * (10 ** 6)
          ],
          { kind: "uups" }
        )
      ).to.be.revertedWithCustomError(ContractFactory, "InvalidDelay");
    });

    it("Should accept positive delay values", async function () {
      const ContractFactory = await ethers.getContractFactory("Stablecoin");
      const oneDay = 24 * 60 * 60;
      
      const contract = await upgrades.deployProxy(
        ContractFactory,
        [
          "GoUSD",
          "GoUSD",
          6,
          defaultAdmin.address,
          oneDay, // Valid 1-day delay
          freezer.address,
          masterMinter.address,
          upgrader.address,
          blacklister.address,
          rescuer.address,
          1000000 * (10 ** 6)
        ],
        { kind: "uups" }
      );
      
      await contract.waitForDeployment();
      // If we get here without reverting, the test passes
      expect(contract.target).to.not.equal(addressZero);
    });
  });

  describe("Mint Cap Validation", function () {
    it("Should revert when defaultMintCap is less than MIN_LIMIT", async function () {
      const ContractFactory = await ethers.getContractFactory("Stablecoin");
      
      await expect(
        upgrades.deployProxy(
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
            MIN_LIMIT - 1 // Below minimum
          ],
          { kind: "uups" }
        )
      ).to.be.revertedWithCustomError(ContractFactory, "LimitTooLow");
    });

    it("Should accept defaultMintCap equal to MIN_LIMIT (exact minimum)", async function () {
      const ContractFactory = await ethers.getContractFactory("Stablecoin");
      
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
          MIN_LIMIT // Exact minimum
        ],
        { kind: "uups" }
      );
      
      const contractInstance = (await contract.waitForDeployment()) as unknown as Stablecoin;
      expect(await contractInstance.getMintCapPerTransaction()).to.equal(MIN_LIMIT);
    });

    it("Should accept defaultMintCap greater than MIN_LIMIT", async function () {
      const ContractFactory = await ethers.getContractFactory("Stablecoin");
      const largeCap = MIN_LIMIT * 1000;
      
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
          largeCap // Well above minimum
        ],
        { kind: "uups" }
      );
      
      const contractInstance = (await contract.waitForDeployment()) as unknown as Stablecoin;
      expect(await contractInstance.getMintCapPerTransaction()).to.equal(largeCap);
    });
  });

  describe("Combined Valid Initialization", function () {
    it("Should successfully deploy with all valid parameters", async function () {
      const ContractFactory = await ethers.getContractFactory("Stablecoin");
      
      const contract = await upgrades.deployProxy(
        ContractFactory,
        [
          "GoUSD Stablecoin",
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
      
      const contractInstance = (await contract.waitForDeployment()) as unknown as Stablecoin;
      
      // Verify all parameters were set correctly
      expect(await contractInstance.name()).to.equal("GoUSD Stablecoin");
      expect(await contractInstance.symbol()).to.equal("GoUSD");
      expect(await contractInstance.decimals()).to.equal(6);
      expect(await contractInstance.getMintCapPerTransaction()).to.equal(1000000 * (10 ** 6));
      
      // Verify roles were assigned
      const FREEZER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("FREEZER_ROLE"));
      const MASTER_MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MASTER_MINTER_ROLE"));
      const UPGRADER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("UPGRADER_ROLE"));
      const BLACKLISTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BLACKLISTER_ROLE"));
      const RESCUER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("RESCUER_ROLE"));
      
      expect(await contractInstance.hasRole(FREEZER_ROLE, freezer.address)).to.be.true;
      expect(await contractInstance.hasRole(MASTER_MINTER_ROLE, masterMinter.address)).to.be.true;
      expect(await contractInstance.hasRole(UPGRADER_ROLE, upgrader.address)).to.be.true;
      expect(await contractInstance.hasRole(BLACKLISTER_ROLE, blacklister.address)).to.be.true;
      expect(await contractInstance.hasRole(RESCUER_ROLE, rescuer.address)).to.be.true;
    });
  });
});

