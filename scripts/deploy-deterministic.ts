// Copyright (c) 2026 BitGo, Inc. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import hre from "hardhat";
import { upgrades as upgradesFactory } from "@openzeppelin/hardhat-upgrades";
import { networkNames } from "@openzeppelin/upgrades-core";
import type { Provider } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const connection = await hre.network.getOrCreate();
const { ethers } = connection;
const artifacts = hre.artifacts;
const upgrades = await upgradesFactory(hre, connection);

/**
 * Deterministic deployment script for reproducing an existing token address
 * on a new chain.
 *
 * A CREATE-deployed contract's address is derived from (deployer, nonce).
 * To land the proxy at the SAME address as on another chain (e.g. Ethereum),
 * the SAME deployer EOA must broadcast the proxy-creation transaction at the
 * SAME nonce. `upgrades.deployProxy` on a fresh chain sends exactly two
 * transactions:
 *
 *   nonce N     -> Stablecoin implementation
 *   nonce N + 1 -> ERC1967 proxy (this is the token address)
 *
 * This script refuses to broadcast anything unless every precondition for
 * reproducing the expected address is verified. All failure modes that would
 * consume a nonce on-chain (out-of-gas from a hardcoded gas limit, reverting
 * initializer, insufficient balance mid-sequence) are checked or estimated
 * BEFORE any transaction is sent, because a single failed on-chain tx burns
 * the nonce and makes the target address permanently unreachable.
 *
 * Usage (example: SOFI on Polygon):
 *   TOKEN_NAME=... TOKEN_SYMBOL=SOFI TOKEN_DECIMALS=6 \
 *   DEFAULT_MINT_CAP=... ADMIN_ADDRESS=0x... DEFAULT_ADMIN_DELAY=... \
 *   FREEZER_ADDRESS=0x... MASTER_MINTER_ADDRESS=0x... UPGRADER_ADDRESS=0x... \
 *   BLACKLISTER_ADDRESS=0x... RESCUER_ADDRESS=0x... \
 *   EXPECTED_CHAIN_ID=137 \
 *   EXPECTED_DEPLOYER_ADDRESS=0x571aFFbdaf5B4ACE4C54f7E729a379D6FC4820d8 \
 *   EXPECTED_PROXY_ADDRESS=0x0CB6d03B0aC88A463F67B7Ad99f9f3ec4678092E \
 *   EXPECTED_IMPLEMENTATION_ADDRESS=0x69eDf9Fa820Df057E493635ed1dB6b9E5F8124A0 \
 *   npx hardhat run scripts/deploy-deterministic.ts --network polygon
 *
 * Additional environment variables (on top of deploy-token.ts variables):
 * - EXPECTED_CHAIN_ID: chain id the connected RPC must report (e.g. 137, 143)
 * - EXPECTED_DEPLOYER_ADDRESS: the EOA that deployed on the reference chain
 * - EXPECTED_PROXY_ADDRESS: the token (proxy) address to reproduce
 * - EXPECTED_IMPLEMENTATION_ADDRESS: (optional) implementation address to reproduce
 * - REFERENCE_RPC_URL: (optional) RPC of the chain where the token is ALREADY
 *   deployed (e.g. Ethereum mainnet for SOFID). Preflight reads
 *   name/symbol/decimals from EXPECTED_PROXY_ADDRESS there and aborts if they do
 *   not match TOKEN_NAME/TOKEN_SYMBOL/TOKEN_DECIMALS, guaranteeing metadata parity.
 *   When unset, a per-target default is used: mainnet targets reference Ethereum
 *   mainnet (requires INFURA_API_KEY), testnet targets reference Hoodi.
 * - GAS_BUFFER_PERCENT: (optional) buffer applied on top of gas estimates, default 25
 * - DRY_RUN: (optional) if "true", run every preflight check and exit without broadcasting
 */

const ERC1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

// Rough upper bound for the ERC1967 proxy deployment + initializer execution.
// Used ONLY for the balance preflight (the actual tx is estimated by the node
// right before broadcast). The SOFI proxy on Ethereum used ~1.1M gas.
const PROXY_GAS_UPPER_BOUND = 3_000_000n;

export interface DeterministicConfig {
  tokenName: string;
  tokenSymbol: string;
  tokenDecimals: number;
  defaultMintCap: bigint;
  adminAddress: string;
  defaultAdminDelay: bigint;
  freezerAddress: string;
  masterMinterAddress: string;
  upgraderAddress: string;
  blacklisterAddress: string;
  rescuerAddress: string;
  expectedChainId: bigint;
  expectedDeployer: string | undefined;
  expectedProxy: string;
  expectedImplementation: string | undefined;
  referenceRpcUrl: string | undefined;
  allowBytecodeMismatch: boolean;
  gasBufferPercent: bigint;
  dryRun: boolean;
}

function fail(message: string): never {
  throw new Error(`PREFLIGHT FAILED: ${message}`);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    fail(`missing required environment variable ${name}`);
  }
  return value.trim();
}

/** Validates address format and (for mixed-case input) checksum, so a
 * mangled address cannot slip through. Returns the checksummed form. */
function requireAddress(name: string, value: string): string {
  let checksummed: string;
  try {
    checksummed = ethers.getAddress(value);
  } catch {
    fail(`${name} is not a valid EVM address: "${value}"`);
  }
  if (checksummed === ethers.ZeroAddress) {
    fail(`${name} must not be the zero address`);
  }
  return checksummed;
}

function requireBigInt(name: string, value: string): bigint {
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    fail(`${name} is not a valid integer: "${value}"`);
  }
  if (parsed < 0n) {
    fail(`${name} must not be negative: ${parsed}`);
  }
  return parsed;
}

/**
 * Default reference RPC for a given TARGET chain when REFERENCE_RPC_URL is not
 * set explicitly. Mainnet targets reference Ethereum mainnet (where the
 * production tokens live); testnet targets reference Hoodi (the team's
 * rehearsal reference chain). An explicit REFERENCE_RPC_URL always wins.
 */
export function defaultReferenceRpcUrl(targetChainId: bigint): string | undefined {
  const MAINNET_TARGETS = [1n, 56n, 137n, 143n];
  const TESTNET_TARGETS = [97n, 17000n, 11155111n, 80002n, 10143n];
  if (MAINNET_TARGETS.includes(targetChainId)) {
    const infuraKey = process.env.INFURA_API_KEY?.trim();
    return infuraKey ? `https://mainnet.infura.io/v3/${infuraKey}` : undefined;
  }
  if (TESTNET_TARGETS.includes(targetChainId)) {
    return "https://rpc.hoodi.ethpandaops.io";
  }
  return undefined;
}

export function loadConfig(): DeterministicConfig {
  if (process.env.PROXY_CONTRACT_ADDRESS) {
    fail(
      "PROXY_CONTRACT_ADDRESS is set, which means this contract is already deployed. " +
        "Use scripts/manage-roles.ts to update roles instead."
    );
  }

  // The following limits mirror Stablecoin.initialize's own validation
  // (InvalidDecimals / InvalidDelay / LimitTooLow). Values the initializer
  // would revert on MUST be rejected here, before anything is broadcast:
  // discovered on-chain, the revert would surface only at the proxy step,
  // after the implementation tx already consumed nonce N — stranding the
  // deterministic sequence.
  const decimals = Number(requireBigInt("TOKEN_DECIMALS", requireEnv("TOKEN_DECIMALS")));
  if (decimals === 0 || decimals > 18) {
    fail(
      `TOKEN_DECIMALS is ${decimals}; Stablecoin.initialize requires 1-18 (InvalidDecimals).`
    );
  }

  // Stablecoin._MIN_LIMIT — initialize reverts with LimitTooLow below this.
  const STABLECOIN_MIN_LIMIT = 86400n;
  const mintCap = requireBigInt("DEFAULT_MINT_CAP", requireEnv("DEFAULT_MINT_CAP"));
  if (mintCap < STABLECOIN_MIN_LIMIT) {
    fail(
      `DEFAULT_MINT_CAP is ${mintCap}; Stablecoin.initialize requires >= ${STABLECOIN_MIN_LIMIT} ` +
        "(_MIN_LIMIT, LimitTooLow)."
    );
  }

  const adminDelay = requireBigInt("DEFAULT_ADMIN_DELAY", requireEnv("DEFAULT_ADMIN_DELAY"));
  if (adminDelay === 0n) {
    fail("DEFAULT_ADMIN_DELAY must be > 0; Stablecoin.initialize reverts on zero (InvalidDelay).");
  }

  return {
    tokenName: requireEnv("TOKEN_NAME"),
    tokenSymbol: requireEnv("TOKEN_SYMBOL"),
    tokenDecimals: decimals,
    defaultMintCap: mintCap,
    adminAddress: requireAddress("ADMIN_ADDRESS", requireEnv("ADMIN_ADDRESS")),
    defaultAdminDelay: adminDelay,
    freezerAddress: requireAddress("FREEZER_ADDRESS", requireEnv("FREEZER_ADDRESS")),
    masterMinterAddress: requireAddress("MASTER_MINTER_ADDRESS", requireEnv("MASTER_MINTER_ADDRESS")),
    upgraderAddress: requireAddress("UPGRADER_ADDRESS", requireEnv("UPGRADER_ADDRESS")),
    blacklisterAddress: requireAddress("BLACKLISTER_ADDRESS", requireEnv("BLACKLISTER_ADDRESS")),
    rescuerAddress: requireAddress("RESCUER_ADDRESS", requireEnv("RESCUER_ADDRESS")),
    expectedChainId: requireBigInt("EXPECTED_CHAIN_ID", requireEnv("EXPECTED_CHAIN_ID")),
    expectedDeployer: process.env.EXPECTED_DEPLOYER_ADDRESS
      ? requireAddress("EXPECTED_DEPLOYER_ADDRESS", process.env.EXPECTED_DEPLOYER_ADDRESS)
      : undefined,
    expectedProxy: requireAddress("EXPECTED_PROXY_ADDRESS", requireEnv("EXPECTED_PROXY_ADDRESS")),
    expectedImplementation: process.env.EXPECTED_IMPLEMENTATION_ADDRESS
      ? requireAddress("EXPECTED_IMPLEMENTATION_ADDRESS", process.env.EXPECTED_IMPLEMENTATION_ADDRESS)
      : undefined,
    referenceRpcUrl:
      process.env.REFERENCE_RPC_URL?.trim() ||
      defaultReferenceRpcUrl(requireBigInt("EXPECTED_CHAIN_ID", requireEnv("EXPECTED_CHAIN_ID"))),
    allowBytecodeMismatch: process.env.ALLOW_BYTECODE_MISMATCH === "true",
    gasBufferPercent: process.env.GAS_BUFFER_PERCENT
      ? requireBigInt("GAS_BUFFER_PERCENT", process.env.GAS_BUFFER_PERCENT)
      : 25n,
    dryRun: process.env.DRY_RUN === "true",
  };
}

/**
 * An existing OpenZeppelin network manifest changes deployProxy's behavior:
 * if it already records this implementation, the implementation deploy is
 * SKIPPED and the proxy lands one nonce earlier than expected, producing the
 * wrong address. A fresh chain must have no manifest.
 */
export function checkNoOzManifest(chainId: bigint): void {
  // Resolve manifest names exactly the way @openzeppelin/upgrades-core does:
  // the network's registered name if it has one, with unknown-<chainId>.json
  // always considered as the fallback. Importing OZ's own map means new
  // networks can never silently drift out of this check.
  const candidates = new Set([`unknown-${chainId}.json`]);
  const known = networkNames[Number(chainId)];
  if (known) {
    candidates.add(`${known}.json`);
  }
  for (const candidate of candidates) {
    const manifestPath = path.join(__dirname, "..", ".openzeppelin", candidate);
    if (fs.existsSync(manifestPath)) {
      fail(
        `OpenZeppelin manifest ${manifestPath} already exists for chain ${chainId}. ` +
          "If it records this implementation, deployProxy will SKIP the implementation " +
          "transaction and the proxy will land at the wrong nonce (wrong address). " +
          "Move the manifest aside (do not delete — archive it like the other " +
          ".openzeppelin/*-<token>.json files) and re-run."
      );
    }
  }
}

export const ERC20_METADATA_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

/**
 * Reads name/symbol/decimals from the ALREADY-DEPLOYED token at
 * config.expectedProxy on the reference chain and fails unless they exactly
 * match the values this deployment would initialize with. Guarantees the new
 * chain's token is metadata-identical to the reference, not just
 * address-identical.
 */
export async function verifyReferenceMetadata(
  config: DeterministicConfig,
  referenceProvider: Provider
): Promise<void> {
  let code: string;
  try {
    code = await referenceProvider.getCode(config.expectedProxy);
  } catch (error) {
    fail(`could not reach the reference RPC: ${error}`);
  }
  if (code === "0x") {
    fail(
      `no contract at ${config.expectedProxy} on the reference chain. ` +
        "REFERENCE_RPC_URL must point at the chain where the token is already deployed."
    );
  }

  const token = new ethers.Contract(config.expectedProxy, ERC20_METADATA_ABI, referenceProvider);
  let refName: string, refSymbol: string, refDecimals: bigint;
  try {
    [refName, refSymbol, refDecimals] = await Promise.all([
      token.name(),
      token.symbol(),
      token.decimals(),
    ]);
  } catch (error) {
    fail(`could not read ERC20 metadata from the reference token: ${error}`);
  }

  const mismatches: string[] = [];
  if (refName !== config.tokenName) {
    mismatches.push(`name: reference is "${refName}" but TOKEN_NAME is "${config.tokenName}"`);
  }
  if (refSymbol !== config.tokenSymbol) {
    mismatches.push(
      `symbol: reference is "${refSymbol}" but TOKEN_SYMBOL is "${config.tokenSymbol}"`
    );
  }
  if (Number(refDecimals) !== config.tokenDecimals) {
    mismatches.push(
      `decimals: reference is ${refDecimals} but TOKEN_DECIMALS is ${config.tokenDecimals}`
    );
  }
  if (mismatches.length > 0) {
    fail(
      `token metadata does not match the reference deployment:\n    - ${mismatches.join("\n    - ")}`
    );
  }
}

/**
 * Strips the CBOR metadata trailer the Solidity compiler appends to runtime
 * bytecode (last two bytes encode the trailer length). Returns undefined if
 * the bytecode is too short or the encoded length is implausible.
 */
export function stripCborMetadata(bytecodeHex: string): string | undefined {
  const bytes = ethers.getBytes(bytecodeHex);
  if (bytes.length < 4) {
    return undefined;
  }
  const trailerLength = (bytes[bytes.length - 2] << 8) | bytes[bytes.length - 1];
  const total = trailerLength + 2;
  if (total >= bytes.length) {
    return undefined;
  }
  return ethers.hexlify(bytes.slice(0, bytes.length - total));
}

/**
 * Verifies the runtime bytecode this deployment will produce is identical to
 * the implementation live behind the reference proxy.
 *
 * The locally compiled artifact has placeholder zeros where immutables live
 * (UUPS embeds `address(this)`), so those positions are filled with the
 * reference implementation address before comparing — valid because the
 * implementation deploys at the SAME address on the new chain. If only the
 * compiler's CBOR metadata trailer differs (source formatting/paths), that is
 * reported but allowed; a logic difference fails unless
 * ALLOW_BYTECODE_MISMATCH=true.
 */
export async function verifyReferenceBytecode(
  config: DeterministicConfig,
  referenceProvider: Provider
): Promise<void> {
  // Resolve the reference implementation from the proxy's ERC1967 slot.
  let slotValue: string;
  try {
    slotValue = await referenceProvider.getStorage(
      config.expectedProxy,
      ERC1967_IMPLEMENTATION_SLOT
    );
  } catch (error) {
    fail(`could not read the reference proxy's implementation slot: ${error}`);
  }
  const referenceImpl = ethers.getAddress(ethers.dataSlice(ethers.zeroPadValue(slotValue, 32), 12));
  if (referenceImpl === ethers.ZeroAddress) {
    fail(
      `the contract at ${config.expectedProxy} on the reference chain has no ERC1967 ` +
        "implementation — is it really the token proxy?"
    );
  }
  if (config.expectedImplementation && referenceImpl !== config.expectedImplementation) {
    fail(
      `reference proxy points at implementation ${referenceImpl} but ` +
        `EXPECTED_IMPLEMENTATION_ADDRESS is ${config.expectedImplementation}. The reference ` +
        "token may have been upgraded since those expectations were recorded."
    );
  }

  const referenceCode = await referenceProvider.getCode(referenceImpl);
  if (referenceCode === "0x") {
    fail(`no code at the reference implementation ${referenceImpl}`);
  }

  // Build the runtime bytecode this deployment will produce: the compiled
  // artifact with immutable positions filled with the implementation address.
  const artifact = await artifacts.readArtifact("Stablecoin");
  const localBytes = ethers.getBytes(artifact.deployedBytecode);
  const buildInfoId = await artifacts.getBuildInfoId("contracts/Stablecoin.sol:Stablecoin");
  const buildInfoPath = buildInfoId ? await artifacts.getBuildInfoOutputPath(buildInfoId) : undefined;
  const buildInfo = buildInfoPath
    ? JSON.parse(await fs.promises.readFile(buildInfoPath, "utf8"))
    : undefined;
  const immutableReferences =
    buildInfo?.output.contracts?.["project/contracts/Stablecoin.sol"]?.["Stablecoin"]?.evm
      ?.deployedBytecode?.immutableReferences ?? {};
  for (const references of Object.values(immutableReferences)) {
    for (const { start, length } of references) {
      if (start + length > localBytes.length) {
        fail(`immutable reference at ${start} (+${length}) exceeds local bytecode length`);
      }
      localBytes.set(ethers.getBytes(ethers.zeroPadValue(referenceImpl, length)), start);
    }
  }
  const localCode = ethers.hexlify(localBytes);

  if (localCode.toLowerCase() === referenceCode.toLowerCase()) {
    return; // byte-for-byte identical, metadata included
  }

  const localStripped = stripCborMetadata(localCode);
  const referenceStripped = stripCborMetadata(referenceCode);
  if (
    localStripped !== undefined &&
    referenceStripped !== undefined &&
    localStripped.toLowerCase() === referenceStripped.toLowerCase()
  ) {
    console.warn(
      "  ! logic bytecode matches the reference implementation, but the CBOR metadata " +
        "trailer differs (source formatting, file paths, or compiler metadata settings). " +
        "Functionally identical; explorer verification may show a different metadata hash."
    );
    return;
  }

  const message =
    `compiled runtime bytecode does not match the reference implementation ${referenceImpl} ` +
    `(local ${localBytes.length} bytes vs reference ${(referenceCode.length - 2) / 2} bytes). ` +
    "The contract source or compiler settings have changed since the reference deployment.";
  if (config.allowBytecodeMismatch) {
    console.warn(
      `  ! ${message}\n  ! Proceeding because ALLOW_BYTECODE_MISMATCH=true — the new chain ` +
        "will run DIFFERENT code than the reference chain."
    );
    return;
  }
  fail(`${message} Set ALLOW_BYTECODE_MISMATCH=true only if deploying newer code is intentional.`);
}

export async function preflight(config: DeterministicConfig): Promise<{ deployer: string }> {
  const provider = ethers.provider;
  const checks: string[] = [];
  const pass = (msg: string) => {
    checks.push(msg);
    console.log(`  ✓ ${msg}`);
  };

  console.log("\n=== Preflight checks ===");

  // 1. Chain identity: the RPC must actually be the chain we think it is.
  const network = await provider.getNetwork();
  if (network.chainId !== config.expectedChainId) {
    fail(
      `connected RPC reports chainId ${network.chainId} but EXPECTED_CHAIN_ID is ` +
        `${config.expectedChainId}. Wrong --network flag or wrong RPC URL.`
    );
  }
  pass(`chainId is ${network.chainId}`);

  // 2. Signer identity: must be the same EOA that deployed on the reference chain.
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    fail("no signer configured. Is DEPLOYMENT_KEY set in .env?");
  }
  const deployer = await signers[0].getAddress();
  if (config.expectedDeployer && deployer !== config.expectedDeployer) {
    fail(
      `signer is ${deployer} but EXPECTED_DEPLOYER_ADDRESS is ${config.expectedDeployer}. ` +
        "The same deployer EOA is required to reproduce the address."
    );
  }
  pass(`deployer is ${deployer}`);

  // 3. Nonce state: no in-flight transactions, otherwise the mempool could
  //    consume our target nonces with someone else's payload.
  const latestNonce = await provider.getTransactionCount(deployer, "latest");
  const pendingNonce = await provider.getTransactionCount(deployer, "pending");
  if (latestNonce !== pendingNonce) {
    fail(
      `deployer has in-flight transactions (latest nonce ${latestNonce}, pending ` +
        `${pendingNonce}). Wait for them to confirm or be dropped, then re-run.`
    );
  }
  pass(`nonce is ${latestNonce} with no pending transactions`);

  // 4. Address prediction: implementation at nonce N, proxy at nonce N+1.
  const predictedImpl = ethers.getCreateAddress({ from: deployer, nonce: latestNonce });
  const predictedProxy = ethers.getCreateAddress({ from: deployer, nonce: latestNonce + 1 });
  if (predictedProxy !== config.expectedProxy) {
    fail(
      `proxy would deploy to ${predictedProxy} (deployer ${deployer}, nonce ${latestNonce + 1}) ` +
        `but EXPECTED_PROXY_ADDRESS is ${config.expectedProxy}. The deployer's nonce on this ` +
        "chain does not line up with the reference deployment. DO NOT send filler transactions " +
        "without recomputing — every extra transaction moves the prediction."
    );
  }
  if (config.expectedImplementation && predictedImpl !== config.expectedImplementation) {
    fail(
      `implementation would deploy to ${predictedImpl} but EXPECTED_IMPLEMENTATION_ADDRESS ` +
        `is ${config.expectedImplementation}.`
    );
  }
  pass(`predicted implementation ${predictedImpl} (nonce ${latestNonce})`);
  pass(`predicted proxy ${predictedProxy} matches expected (nonce ${latestNonce + 1})`);

  // 5. Targets must be empty: no contract may already live at either address.
  for (const [label, addr] of [
    ["implementation", predictedImpl],
    ["proxy", predictedProxy],
  ] as const) {
    const code = await provider.getCode(addr);
    if (code !== "0x") {
      fail(`code already exists at predicted ${label} address ${addr}`);
    }
  }
  pass("no code at either predicted address");

  // 6. OZ manifest must not exist for this chain (would skip the impl tx and
  //    shift the proxy nonce).
  checkNoOzManifest(config.expectedChainId);
  pass("no OpenZeppelin manifest for this chain");

  // 7. Gas estimation for the implementation deployment. This is executed by
  //    the node against current state, so it catches init-code problems and
  //    chain-specific gas differences BEFORE anything is broadcast. The proxy
  //    tx (which runs the initializer) is estimated by ethers right before it
  //    is sent — a reverting initializer aborts off-chain without consuming
  //    the proxy nonce.
  const ContractFactory = await ethers.getContractFactory("Stablecoin");
  let implGasEstimate: bigint;
  try {
    implGasEstimate = await provider.estimateGas({
      from: deployer,
      data: ContractFactory.bytecode,
    });
  } catch (error) {
    fail(`implementation deployment gas estimation reverted: ${error}`);
  }
  pass(`implementation gas estimate: ${implGasEstimate}`);

  // 8. Initializer arguments must encode cleanly (catches type/arity drift
  //    between this script and the contract's initialize signature).
  try {
    ContractFactory.interface.encodeFunctionData("initialize", [
      config.tokenName,
      config.tokenSymbol,
      config.tokenDecimals,
      config.adminAddress,
      config.defaultAdminDelay,
      config.freezerAddress,
      config.masterMinterAddress,
      config.upgraderAddress,
      config.blacklisterAddress,
      config.rescuerAddress,
      config.defaultMintCap,
    ]);
  } catch (error) {
    fail(`initializer arguments failed to encode: ${error}`);
  }
  pass("initializer arguments encode cleanly");

  // 9. Metadata parity with the reference deployment: the token being created
  //    here must have the same name/symbol/decimals as the token already live
  //    at the expected address on the reference chain. Address parity alone
  //    is not enough — a typo'd TOKEN_NAME would otherwise deploy a
  //    different-looking token at the right address.
  if (config.referenceRpcUrl) {
    const referenceProvider = new ethers.JsonRpcProvider(config.referenceRpcUrl);
    try {
      let referenceChainId: bigint;
      try {
        referenceChainId = (await referenceProvider.getNetwork()).chainId;
      } catch (error) {
        fail(`could not reach REFERENCE_RPC_URL: ${error}`);
      }
      if (referenceChainId === config.expectedChainId) {
        fail(
          `REFERENCE_RPC_URL reports chainId ${referenceChainId}, the same as the target ` +
            "chain. It must point at the chain where the token is ALREADY deployed."
        );
      }
      await verifyReferenceMetadata(config, referenceProvider);
      pass(`token metadata matches the reference deployment on chain ${referenceChainId}`);
      await verifyReferenceBytecode(config, referenceProvider);
      pass("runtime bytecode matches the reference implementation");
    } finally {
      referenceProvider.destroy();
    }
  } else {
    console.warn(
      "  ! no reference RPC available — skipping metadata parity check. Set " +
        "REFERENCE_RPC_URL (or INFURA_API_KEY for mainnet targets) so " +
        "name/symbol/decimals are verified against the live token."
    );
  }

  // 10. Balance must cover BOTH transactions with buffer. Running out of funds
  //    after the implementation tx would strand the deployment mid-sequence.
  const feeData = await provider.getFeeData();
  const maxFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice;
  // Explicit null check: 0n is falsy but is legitimate fee data on
  // zero-fee networks and must not abort preflight.
  if (maxFeePerGas === null) {
    fail("RPC returned no fee data; cannot verify the deployer balance is sufficient");
  }
  const totalGas =
    ((implGasEstimate + PROXY_GAS_UPPER_BOUND) * (100n + config.gasBufferPercent)) / 100n;
  const requiredWei = totalGas * maxFeePerGas;
  const balance = await provider.getBalance(deployer);
  if (balance < requiredWei) {
    fail(
      `deployer balance ${ethers.formatEther(balance)} is below the required ` +
        `~${ethers.formatEther(requiredWei)} (both txs at current max fee ` +
        `${maxFeePerGas} wei/gas + ${config.gasBufferPercent}% buffer). Fund ${deployer} first.`
    );
  }
  pass(
    `balance ${ethers.formatEther(balance)} covers estimated ` +
      `${ethers.formatEther(requiredWei)} for both transactions`
  );

  console.log(`=== All ${checks.length} preflight checks passed ===\n`);
  return { deployer };
}

export async function verifyDeployment(
  config: DeterministicConfig,
  proxyAddress: string
): Promise<void> {
  console.log("\n=== Post-deploy verification ===");
  const provider = ethers.provider;
  const failures: string[] = [];
  const assert = (condition: boolean, message: string) => {
    if (condition) {
      console.log(`  ✓ ${message}`);
    } else {
      console.error(`  ✗ ${message}`);
      failures.push(message);
    }
  };

  assert(
    proxyAddress === config.expectedProxy,
    `proxy address ${proxyAddress} matches expected ${config.expectedProxy}`
  );

  const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  if (config.expectedImplementation) {
    assert(
      ethers.getAddress(implementationAddress) === config.expectedImplementation,
      `implementation ${implementationAddress} matches expected ${config.expectedImplementation}`
    );
  }

  const slotValue = await provider.getStorage(proxyAddress, ERC1967_IMPLEMENTATION_SLOT);
  assert(
    ethers.getAddress(ethers.dataSlice(slotValue, 12)) === ethers.getAddress(implementationAddress),
    "ERC1967 implementation slot points at the implementation"
  );

  const token = await ethers.getContractAt("Stablecoin", proxyAddress);
  assert((await token.name()) === config.tokenName, `name() is "${config.tokenName}"`);
  assert((await token.symbol()) === config.tokenSymbol, `symbol() is "${config.tokenSymbol}"`);
  assert(
    Number(await token.decimals()) === config.tokenDecimals,
    `decimals() is ${config.tokenDecimals}`
  );

  const roleChecks: [string, string][] = [
    ["MASTER_MINTER_ROLE", config.masterMinterAddress],
    ["UPGRADER_ROLE", config.upgraderAddress],
    ["FREEZER_ROLE", config.freezerAddress],
    ["BLACKLISTER_ROLE", config.blacklisterAddress],
    ["RESCUER_ROLE", config.rescuerAddress],
  ];
  for (const [roleName, holder] of roleChecks) {
    const roleHash = await token.getFunction(roleName)();
    assert(await token.hasRole(roleHash, holder), `${roleName} granted to ${holder}`);
  }
  assert(
    ethers.getAddress(await token.defaultAdmin()) === config.adminAddress,
    `defaultAdmin() is ${config.adminAddress}`
  );

  if (failures.length > 0) {
    throw new Error(
      `POST-DEPLOY VERIFICATION FAILED (${failures.length} check(s)):\n- ${failures.join("\n- ")}\n` +
        "The contracts are on-chain; investigate before granting any roles or minting."
    );
  }
  console.log("=== All post-deploy checks passed ===");
}

export async function runDeterministicDeploy(
  config: DeterministicConfig
): Promise<{ proxyAddress: string; implementationAddress: string } | undefined> {
  console.log(
    `Deterministic deploy of ${config.tokenName} (${config.tokenSymbol}, ` +
      `${config.tokenDecimals} decimals) targeting ${config.expectedProxy} ` +
      `on chain ${config.expectedChainId}`
  );

  await preflight(config);

  if (config.dryRun) {
    console.log("DRY_RUN=true — all preflight checks passed; nothing was broadcast.");
    return undefined;
  }

  // NOTE: deliberately NO hardcoded gasLimit. With no override, ethers runs
  // eth_estimateGas for each transaction immediately before broadcasting it.
  // A transaction that would revert (or exceed the block gas limit) fails the
  // estimation and aborts OFF-CHAIN — the nonce is never consumed. A
  // hardcoded limit would skip estimation and turn those same failures into
  // on-chain reverts that burn the nonce.
  const ContractFactory = await ethers.getContractFactory("Stablecoin");
  const instance = await upgrades.deployProxy(
    ContractFactory,
    [
      config.tokenName,
      config.tokenSymbol,
      config.tokenDecimals,
      config.adminAddress,
      config.defaultAdminDelay,
      config.freezerAddress,
      config.masterMinterAddress,
      config.upgraderAddress,
      config.blacklisterAddress,
      config.rescuerAddress,
      config.defaultMintCap,
    ],
    {
      kind: "uups",
      // The nonce math REQUIRES two transactions: implementation at nonce N,
      // proxy at N+1. Without this, the plugin reuses any implementation it
      // already knows about (manifest or in-memory state) and sends only the
      // proxy tx — which then lands at nonce N, i.e. the WRONG address.
      redeployImplementation: "always",
    }
  );
  await instance.waitForDeployment();

  const proxyAddress = ethers.getAddress(await instance.getAddress());
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log(`${config.tokenSymbol} Proxy deployed to: ${proxyAddress}`);
  console.log(`${config.tokenSymbol} Implementation deployed to: ${implementationAddress}`);

  await verifyDeployment(config, proxyAddress);

  return { proxyAddress, implementationAddress: ethers.getAddress(implementationAddress) };
}

async function main() {
  const config = loadConfig();
  const result = await runDeterministicDeploy(config);
  if (result) {
    console.log(
      `\nRemember to archive .openzeppelin/unknown-${config.expectedChainId}.json (or the ` +
        "named manifest) per-token, and verify the contracts on the block explorer."
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
