// Copyright (c) 2026 BitGo, Inc. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import hre from "hardhat";
import { upgrades as upgradesFactory } from "@openzeppelin/hardhat-upgrades";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  DeterministicConfig,
  checkNoOzManifest,
  loadConfig,
  preflight,
  runDeterministicDeploy,
  verifyReferenceMetadata,
  verifyReferenceBytecode,
  stripCborMetadata,
  defaultReferenceRpcUrl,
} from "../scripts/deploy-deterministic";
const connection = await hre.network.getOrCreate();
const { ethers } = connection;
const upgrades = await upgradesFactory(hre, connection);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Explicit rejection helper: asserts the promise rejects and that the error
 * message contains the given substring.
 */
async function expectReject(promise: Promise<unknown>, messageSubstring: string): Promise<void> {
  let error: Error | undefined;
  try {
    await promise;
  } catch (e) {
    error = e as Error;
  }
  expect(error, `expected rejection containing "${messageSubstring}" but promise resolved`).to.not
    .be.undefined;
  expect(error!.message).to.contain(messageSubstring);
}

const HARDHAT_CHAIN_ID = 31337n;
const DEFAULT_ADMIN_DELAY = 7n * 24n * 60n * 60n;
const MINT_CAP = 1_000_000n * 10n ** 6n;

describe("deploy-deterministic script", function () {
  let deployer: SignerWithAddress;
  let freezer: SignerWithAddress;
  let masterMinter: SignerWithAddress;
  let upgrader: SignerWithAddress;
  let blacklister: SignerWithAddress;
  let rescuer: SignerWithAddress;

  before(async function () {
    [deployer, freezer, masterMinter, upgrader, blacklister, rescuer] =
      await ethers.getSigners();
  });

  /**
   * Builds a config whose expected addresses are freshly derived from the
   * deployer's CURRENT nonce (implementation at nonce N, proxy at N+1), so
   * the preflight predictions line up regardless of test ordering.
   */
  async function buildAlignedConfig(
    overrides: Partial<DeterministicConfig> = {}
  ): Promise<DeterministicConfig> {
    const nonce = await ethers.provider.getTransactionCount(deployer.address, "latest");
    return {
      tokenName: "Test SOFI",
      tokenSymbol: "SOFI",
      tokenDecimals: 6,
      defaultMintCap: MINT_CAP,
      adminAddress: deployer.address,
      defaultAdminDelay: DEFAULT_ADMIN_DELAY,
      freezerAddress: freezer.address,
      masterMinterAddress: masterMinter.address,
      upgraderAddress: upgrader.address,
      blacklisterAddress: blacklister.address,
      rescuerAddress: rescuer.address,
      expectedChainId: HARDHAT_CHAIN_ID,
      expectedDeployer: deployer.address,
      expectedProxy: ethers.getCreateAddress({ from: deployer.address, nonce: nonce + 1 }),
      expectedImplementation: ethers.getCreateAddress({ from: deployer.address, nonce }),
      referenceRpcUrl: undefined,
      allowBytecodeMismatch: false,
      gasBufferPercent: 25n,
      dryRun: false,
      ...overrides,
    };
  }

  describe("preflight", function () {
    it("passes when every expectation lines up", async function () {
      const config = await buildAlignedConfig();
      const { deployer: reported } = await preflight(config);
      expect(reported).to.equal(deployer.address);
    });

    it("rejects when the RPC chain id does not match EXPECTED_CHAIN_ID", async function () {
      const config = await buildAlignedConfig({ expectedChainId: 137n });
      await expectReject(preflight(config), "chainId");
    });

    it("rejects when the signer is not the expected deployer", async function () {
      const config = await buildAlignedConfig({ expectedDeployer: freezer.address });
      await expectReject(preflight(config), "same deployer EOA is required");
    });

    it("rejects when the nonce does not line up with the expected proxy address", async function () {
      const nonce = await ethers.provider.getTransactionCount(deployer.address, "latest");
      // Expectation computed for a nonce five transactions in the future.
      const config = await buildAlignedConfig({
        expectedProxy: ethers.getCreateAddress({ from: deployer.address, nonce: nonce + 6 }),
      });
      await expectReject(preflight(config), "does not line up");
    });

    it("rejects when the predicted implementation does not match", async function () {
      const config = await buildAlignedConfig({
        expectedImplementation: freezer.address,
      });
      await expectReject(preflight(config), "EXPECTED_IMPLEMENTATION_ADDRESS");
    });

    it("detects that a transaction shifted the nonce since expectations were computed", async function () {
      const config = await buildAlignedConfig();
      // Any transaction from the deployer invalidates the prediction.
      await (await deployer.sendTransaction({ to: freezer.address, value: 1n })).wait();
      await expectReject(preflight(config), "does not line up");
    });

    it("rejects when code already exists at the predicted implementation address", async function () {
      const config = await buildAlignedConfig();
      await ethers.provider.send("hardhat_setCode", [
        config.expectedImplementation,
        "0x60006000fd",
      ]);
      try {
        await expectReject(preflight(config), "code already exists");
      } finally {
        await ethers.provider.send("hardhat_setCode", [config.expectedImplementation, "0x"]);
      }
    });

    it("rejects when the deployer has in-flight (pending) transactions", async function () {
      const config = await buildAlignedConfig();
      await ethers.provider.send("evm_setAutomine", [false]);
      try {
        await deployer.sendTransaction({ to: freezer.address, value: 1n });
        await expectReject(preflight(config), "in-flight");
      } finally {
        await ethers.provider.send("evm_setAutomine", [true]);
        await ethers.provider.send("evm_mine");
      }
    });

    it("rejects when the deployer balance cannot cover both transactions", async function () {
      const config = await buildAlignedConfig();
      const originalBalance = await ethers.provider.getBalance(deployer.address);
      // 1 wei: far below the cost of either transaction.
      await ethers.provider.send("hardhat_setBalance", [deployer.address, "0x1"]);
      try {
        // Depending on the node this fails at gas estimation (upfront-cost
        // validation) or at the explicit balance check — both are preflight
        // failures that abort before any broadcast.
        await expectReject(preflight(config), "PREFLIGHT FAILED");
      } finally {
        await ethers.provider.send("hardhat_setBalance", [
          deployer.address,
          "0x" + originalBalance.toString(16),
        ]);
      }
    });
  });

  describe("verifyReferenceMetadata", function () {
    // A token deployed the normal way stands in for the reference deployment
    // (e.g. SOFID on Ethereum). The check only reads metadata at
    // config.expectedProxy on the given provider, so pointing expectedProxy at
    // this token exercises it without a second chain.
    let referenceTokenAddress: string;

    before(async function () {
      const ContractFactory = await ethers.getContractFactory("Stablecoin");
      const instance = await upgrades.deployProxy(
        ContractFactory,
        [
          "Test SOFI",
          "SOFI",
          6,
          deployer.address,
          DEFAULT_ADMIN_DELAY,
          freezer.address,
          masterMinter.address,
          upgrader.address,
          blacklister.address,
          rescuer.address,
          MINT_CAP,
        ],
        { kind: "uups", redeployImplementation: "always" }
      );
      await instance.waitForDeployment();
      referenceTokenAddress = await instance.getAddress();
    });

    async function configAgainstReference(
      overrides: Partial<DeterministicConfig> = {}
    ): Promise<DeterministicConfig> {
      const config = await buildAlignedConfig(overrides);
      return { ...config, expectedProxy: referenceTokenAddress, ...overrides };
    }

    it("passes when name, symbol, and decimals all match", async function () {
      const config = await configAgainstReference();
      await verifyReferenceMetadata(config, ethers.provider);
    });

    it("rejects a name mismatch", async function () {
      const config = await configAgainstReference({ tokenName: "Wrong Name" });
      await expectReject(
        verifyReferenceMetadata(config, ethers.provider),
        'name: reference is "Test SOFI" but TOKEN_NAME is "Wrong Name"'
      );
    });

    it("rejects a symbol mismatch", async function () {
      const config = await configAgainstReference({ tokenSymbol: "WRONG" });
      await expectReject(
        verifyReferenceMetadata(config, ethers.provider),
        'symbol: reference is "SOFI" but TOKEN_SYMBOL is "WRONG"'
      );
    });

    it("rejects a decimals mismatch", async function () {
      const config = await configAgainstReference({ tokenDecimals: 18 });
      await expectReject(
        verifyReferenceMetadata(config, ethers.provider),
        "decimals: reference is 6 but TOKEN_DECIMALS is 18"
      );
    });

    it("reports every mismatched field at once", async function () {
      const config = await configAgainstReference({
        tokenName: "Wrong Name",
        tokenSymbol: "WRONG",
        tokenDecimals: 18,
      });
      let error: Error | undefined;
      try {
        await verifyReferenceMetadata(config, ethers.provider);
      } catch (e) {
        error = e as Error;
      }
      expect(error).to.not.be.undefined;
      expect(error!.message).to.contain("name:");
      expect(error!.message).to.contain("symbol:");
      expect(error!.message).to.contain("decimals:");
    });

    it("rejects when no contract exists at the reference address", async function () {
      const config = await buildAlignedConfig(); // expectedProxy has no code yet
      await expectReject(
        verifyReferenceMetadata(config, ethers.provider),
        "no contract at"
      );
    });
  });

  describe("verifyReferenceBytecode", function () {
    let referenceProxy: string;
    let referenceImpl: string;

    before(async function () {
      const ContractFactory = await ethers.getContractFactory("Stablecoin");
      const instance = await upgrades.deployProxy(
        ContractFactory,
        [
          "Bytecode Ref",
          "BREF",
          6,
          deployer.address,
          DEFAULT_ADMIN_DELAY,
          freezer.address,
          masterMinter.address,
          upgrader.address,
          blacklister.address,
          rescuer.address,
          MINT_CAP,
        ],
        { kind: "uups", redeployImplementation: "always" }
      );
      await instance.waitForDeployment();
      referenceProxy = await instance.getAddress();
      referenceImpl = await upgrades.erc1967.getImplementationAddress(referenceProxy);
    });

    async function configAgainstReference(
      overrides: Partial<DeterministicConfig> = {}
    ): Promise<DeterministicConfig> {
      const config = await buildAlignedConfig();
      return {
        ...config,
        expectedProxy: referenceProxy,
        expectedImplementation: undefined,
        ...overrides,
      };
    }

    it("passes when the artifact matches the reference implementation byte-for-byte", async function () {
      const config = await configAgainstReference();
      await verifyReferenceBytecode(config, ethers.provider);
    });

    it("cross-checks EXPECTED_IMPLEMENTATION_ADDRESS against the reference proxy's slot", async function () {
      const config = await configAgainstReference({
        expectedImplementation: freezer.address,
      });
      await expectReject(
        verifyReferenceBytecode(config, ethers.provider),
        "may have been upgraded"
      );
    });

    it("rejects when the reference implementation runs different code", async function () {
      // Overwrite the reference implementation's code with a different
      // contract's bytecode to simulate source/compiler drift.
      const original = await ethers.provider.getCode(referenceImpl);
      const validatorArtifact = await ethers.getContractFactory("MockSupplyValidator");
      const validator = await validatorArtifact.deploy();
      await validator.waitForDeployment();
      const otherCode = await ethers.provider.getCode(await validator.getAddress());
      await ethers.provider.send("hardhat_setCode", [referenceImpl, otherCode]);
      try {
        const config = await configAgainstReference();
        await expectReject(
          verifyReferenceBytecode(config, ethers.provider),
          "does not match the reference implementation"
        );
        // ...unless the mismatch is explicitly allowed.
        const permissive = await configAgainstReference({ allowBytecodeMismatch: true });
        await verifyReferenceBytecode(permissive, ethers.provider);
      } finally {
        await ethers.provider.send("hardhat_setCode", [referenceImpl, original]);
      }
    });

    it("rejects when the reference address is not an ERC1967 proxy", async function () {
      const config = await configAgainstReference({ expectedProxy: referenceImpl });
      await expectReject(
        verifyReferenceBytecode(config, ethers.provider),
        "no ERC1967"
      );
    });

    it("stripCborMetadata removes only a plausible trailer", function () {
      // 4 data bytes + 2-byte trailer + 2-byte length (0x0002).
      expect(stripCborMetadata("0xaabbccddeeff0002")).to.equal("0xaabbccdd");
      // Implausible length (longer than the bytecode) → undefined.
      expect(stripCborMetadata("0xaabbffff")).to.equal(undefined);
      expect(stripCborMetadata("0x")).to.equal(undefined);
    });
  });

  describe("checkNoOzManifest", function () {
    const manifestPath = path.join(__dirname, "..", ".openzeppelin", "unknown-31337.json");

    it("throws when a manifest exists for the target chain", function () {
      fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
      fs.writeFileSync(manifestPath, "{}");
      try {
        expect(() => checkNoOzManifest(31337n)).to.throw("manifest");
      } finally {
        fs.rmSync(manifestPath, { force: true });
      }
    });

    it("passes when no manifest exists for the target chain", function () {
      expect(fs.existsSync(manifestPath)).to.equal(false);
      expect(() => checkNoOzManifest(31337n)).to.not.throw();
    });
  });

  describe("loadConfig environment validation", function () {
    const ENV_KEYS = [
      "TOKEN_NAME",
      "TOKEN_SYMBOL",
      "TOKEN_DECIMALS",
      "DEFAULT_MINT_CAP",
      "ADMIN_ADDRESS",
      "DEFAULT_ADMIN_DELAY",
      "FREEZER_ADDRESS",
      "MASTER_MINTER_ADDRESS",
      "UPGRADER_ADDRESS",
      "BLACKLISTER_ADDRESS",
      "RESCUER_ADDRESS",
      "EXPECTED_CHAIN_ID",
      "EXPECTED_DEPLOYER_ADDRESS",
      "EXPECTED_PROXY_ADDRESS",
      "EXPECTED_IMPLEMENTATION_ADDRESS",
      "REFERENCE_RPC_URL",
      "INFURA_API_KEY",
      "GAS_BUFFER_PERCENT",
      "DRY_RUN",
      "PROXY_CONTRACT_ADDRESS",
    ];
    let savedEnv: Record<string, string | undefined>;

    beforeEach(function () {
      savedEnv = {};
      for (const key of ENV_KEYS) {
        savedEnv[key] = process.env[key];
        delete process.env[key];
      }
      process.env.TOKEN_NAME = "Test SOFI";
      process.env.TOKEN_SYMBOL = "SOFI";
      process.env.TOKEN_DECIMALS = "6";
      process.env.DEFAULT_MINT_CAP = MINT_CAP.toString();
      process.env.ADMIN_ADDRESS = deployer.address;
      process.env.DEFAULT_ADMIN_DELAY = DEFAULT_ADMIN_DELAY.toString();
      process.env.FREEZER_ADDRESS = freezer.address;
      process.env.MASTER_MINTER_ADDRESS = masterMinter.address;
      process.env.UPGRADER_ADDRESS = upgrader.address;
      process.env.BLACKLISTER_ADDRESS = blacklister.address;
      process.env.RESCUER_ADDRESS = rescuer.address;
      process.env.EXPECTED_CHAIN_ID = "31337";
      process.env.EXPECTED_DEPLOYER_ADDRESS = deployer.address;
      process.env.EXPECTED_PROXY_ADDRESS = freezer.address; // any valid address
    });

    afterEach(function () {
      for (const key of ENV_KEYS) {
        if (savedEnv[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = savedEnv[key];
        }
      }
    });

    it("parses a fully specified environment", function () {
      const config = loadConfig();
      expect(config.tokenSymbol).to.equal("SOFI");
      expect(config.tokenDecimals).to.equal(6);
      expect(config.defaultMintCap).to.equal(MINT_CAP);
      expect(config.expectedChainId).to.equal(31337n);
      expect(config.gasBufferPercent).to.equal(25n); // default
      expect(config.dryRun).to.equal(false);
    });

    it("rejects when PROXY_CONTRACT_ADDRESS is set (already deployed)", function () {
      process.env.PROXY_CONTRACT_ADDRESS = freezer.address;
      expect(() => loadConfig()).to.throw("already deployed");
    });

    it("rejects a missing required variable", function () {
      delete process.env.EXPECTED_PROXY_ADDRESS;
      expect(() => loadConfig()).to.throw("EXPECTED_PROXY_ADDRESS");
    });

    it("rejects a malformed address", function () {
      process.env.EXPECTED_PROXY_ADDRESS = "0x1234";
      expect(() => loadConfig()).to.throw("not a valid EVM address");
    });

    it("rejects a mixed-case address with a bad checksum", function () {
      // Valid hex, wrong EIP-55 capitalization.
      process.env.EXPECTED_PROXY_ADDRESS = "0x0CB6d03B0aC88A463F67B7Ad99f9f3ec4678092e";
      expect(() => loadConfig()).to.throw("not a valid EVM address");
    });

    it("rejects the zero address for a role", function () {
      process.env.FREEZER_ADDRESS = ethers.ZeroAddress;
      expect(() => loadConfig()).to.throw("zero address");
    });

    it("rejects a non-numeric chain id", function () {
      process.env.EXPECTED_CHAIN_ID = "polygon";
      expect(() => loadConfig()).to.throw("not a valid integer");
    });

    it("rejects decimals the initializer would revert on (0 and > 18)", function () {
      process.env.TOKEN_DECIMALS = "19";
      expect(() => loadConfig()).to.throw("InvalidDecimals");
      process.env.TOKEN_DECIMALS = "0";
      expect(() => loadConfig()).to.throw("InvalidDecimals");
    });

    it("rejects a mint cap below Stablecoin._MIN_LIMIT", function () {
      process.env.DEFAULT_MINT_CAP = "0";
      expect(() => loadConfig()).to.throw("LimitTooLow");
      process.env.DEFAULT_MINT_CAP = "86399"; // one below _MIN_LIMIT
      expect(() => loadConfig()).to.throw("LimitTooLow");
      process.env.DEFAULT_MINT_CAP = "86400"; // exactly _MIN_LIMIT is valid
      expect(loadConfig().defaultMintCap).to.equal(86400n);
    });

    it("rejects a zero admin delay (initializer InvalidDelay)", function () {
      process.env.DEFAULT_ADMIN_DELAY = "0";
      expect(() => loadConfig()).to.throw("InvalidDelay");
    });

    it("parses REFERENCE_RPC_URL, falling back to a per-target default when blank", function () {
      // Explicit value always wins.
      process.env.REFERENCE_RPC_URL = "https://example.com/rpc";
      expect(loadConfig().referenceRpcUrl).to.equal("https://example.com/rpc");

      // Blank + unknown target chain (31337): no default available.
      process.env.REFERENCE_RPC_URL = "   ";
      expect(loadConfig().referenceRpcUrl).to.equal(undefined);

      // Blank + mainnet target: defaults to Ethereum mainnet via Infura.
      delete process.env.REFERENCE_RPC_URL;
      process.env.EXPECTED_CHAIN_ID = "137";
      process.env.INFURA_API_KEY = "testkey";
      expect(loadConfig().referenceRpcUrl).to.equal("https://mainnet.infura.io/v3/testkey");

      // Blank + testnet target: defaults to Hoodi.
      process.env.EXPECTED_CHAIN_ID = "80002";
      expect(loadConfig().referenceRpcUrl).to.equal("https://rpc.hoodi.ethpandaops.io");
    });

    it("defaultReferenceRpcUrl maps targets to reference chains", function () {
      const savedInfura = process.env.INFURA_API_KEY;
      try {
        process.env.INFURA_API_KEY = "k";
        // Mainnet targets -> Ethereum mainnet.
        for (const id of [137n, 143n, 56n]) {
          expect(defaultReferenceRpcUrl(id)).to.equal("https://mainnet.infura.io/v3/k");
        }
        // Mainnet target without an Infura key -> no default.
        delete process.env.INFURA_API_KEY;
        expect(defaultReferenceRpcUrl(137n)).to.equal(undefined);
        // Testnet targets -> Hoodi.
        for (const id of [80002n, 10143n]) {
          expect(defaultReferenceRpcUrl(id)).to.equal("https://rpc.hoodi.ethpandaops.io");
        }
        // Unknown target -> no default.
        expect(defaultReferenceRpcUrl(31337n)).to.equal(undefined);
      } finally {
        if (savedInfura === undefined) delete process.env.INFURA_API_KEY;
        else process.env.INFURA_API_KEY = savedInfura;
      }
    });

    it("honors DRY_RUN and GAS_BUFFER_PERCENT", function () {
      process.env.DRY_RUN = "true";
      process.env.GAS_BUFFER_PERCENT = "50";
      const config = loadConfig();
      expect(config.dryRun).to.equal(true);
      expect(config.gasBufferPercent).to.equal(50n);
    });
  });

  describe("end-to-end deployment", function () {
    it("dry run passes preflight and broadcasts nothing", async function () {
      const config = await buildAlignedConfig({ dryRun: true });
      const nonceBefore = await ethers.provider.getTransactionCount(deployer.address, "latest");
      const result = await runDeterministicDeploy(config);
      expect(result).to.equal(undefined);
      const nonceAfter = await ethers.provider.getTransactionCount(deployer.address, "latest");
      expect(nonceAfter).to.equal(nonceBefore, "dry run must not consume a nonce");
    });

    it("aborts before broadcasting anything when the expected proxy is wrong", async function () {
      const nonce = await ethers.provider.getTransactionCount(deployer.address, "latest");
      const config = await buildAlignedConfig({
        expectedProxy: ethers.getCreateAddress({ from: deployer.address, nonce: nonce + 6 }),
      });
      const nonceBefore = await ethers.provider.getTransactionCount(deployer.address, "latest");
      await expectReject(runDeterministicDeploy(config), "does not line up");
      const nonceAfter = await ethers.provider.getTransactionCount(deployer.address, "latest");
      expect(nonceAfter).to.equal(nonceBefore, "failed preflight must not consume a nonce");
    });

    it("deploys implementation and proxy at the predicted addresses and passes all post-deploy checks", async function () {
      this.timeout(120000);
      const config = await buildAlignedConfig();
      const result = await runDeterministicDeploy(config);

      expect(result).to.not.equal(undefined);
      expect(result!.proxyAddress).to.equal(config.expectedProxy);
      expect(result!.implementationAddress).to.equal(config.expectedImplementation);

      // Independent verification against the chain (not just the script's output).
      const token = await ethers.getContractAt("Stablecoin", result!.proxyAddress);
      expect(await token.name()).to.equal(config.tokenName);
      expect(await token.symbol()).to.equal(config.tokenSymbol);
      expect(Number(await token.decimals())).to.equal(config.tokenDecimals);
      expect(await token.defaultAdmin()).to.equal(config.adminAddress);
      expect(await token.hasRole(await token.MASTER_MINTER_ROLE(), masterMinter.address)).to.equal(
        true
      );
      expect(await token.hasRole(await token.UPGRADER_ROLE(), upgrader.address)).to.equal(true);
      expect(await token.hasRole(await token.FREEZER_ROLE(), freezer.address)).to.equal(true);
      expect(await token.hasRole(await token.BLACKLISTER_ROLE(), blacklister.address)).to.equal(
        true
      );
      expect(await token.hasRole(await token.RESCUER_ROLE(), rescuer.address)).to.equal(true);

      const implCode = await ethers.provider.getCode(result!.implementationAddress);
      expect(implCode).to.not.equal("0x");
    });

    it("rejects a rerun with stale expectations without consuming a nonce", async function () {
      // The previous test deployed the implementation and proxy, advancing
      // the nonce. Rerunning with those now-stale expected addresses must be
      // rejected outright — and the rejection must not broadcast anything.
      const nonce = await ethers.provider.getTransactionCount(deployer.address, "latest");
      const staleConfig = await buildAlignedConfig({
        expectedImplementation: ethers.getCreateAddress({
          from: deployer.address,
          nonce: nonce - 2,
        }),
        expectedProxy: ethers.getCreateAddress({ from: deployer.address, nonce: nonce - 1 }),
      });
      await expectReject(runDeterministicDeploy(staleConfig), "does not line up");
      const nonceAfter = await ethers.provider.getTransactionCount(deployer.address, "latest");
      expect(nonceAfter).to.equal(nonce, "stale-config rejection must not consume a nonce");

      // A freshly aligned config for the same token still preflights cleanly.
      const freshConfig = await buildAlignedConfig();
      const result = await runDeterministicDeploy({ ...freshConfig, dryRun: true });
      expect(result).to.equal(undefined);
    });
  });
});
