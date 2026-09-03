import hre from "hardhat";
import * as readline from "readline";
const { ethers } = await hre.network.getOrCreate();

/**
 * Role management script for deployed stablecoin contracts.
 *
 * Reads all configuration from .env. Set PROXY_CONTRACT_ADDRESS and any
 * UPDATED_* addresses you want to rotate, then run:
 *
 *   npx hardhat run scripts/manage-roles.ts --network mainnet
 *
 * For each UPDATED_* address that is set, the script will:
 *   - grant the role to the UPDATED_ address
 *   - revoke the role from the original address
 *
 * Only roles where an UPDATED_ address is provided are touched.
 *
 * Admin transfer is a two-step process (enforced by the contract's DEFAULT_ADMIN_DELAY):
 *   Step 1 — set UPDATED_ADMIN_ADDRESS and run normally → begins the transfer
 *   Step 2 — after the delay, the new admin runs with ACTION=accept-admin-transfer
 *
 *   ACTION=accept-admin-transfer npx hardhat run scripts/manage-roles.ts --network mainnet
 *
 * Environment variables:
 *   PROXY_CONTRACT_ADDRESS              - (required) deployed proxy address
 *   ADMIN_ADDRESS                       - current admin (used only for display; signer must be the admin)
 *   UPDATED_ADMIN_ADDRESS               - new admin address (begins time-delayed transfer)
 *   FREEZER_ADDRESS                     - current freezer
 *   UPDATED_FREEZER_ADDRESS             - new freezer
 *   MASTER_MINTER_ADDRESS               - current master minter (MASTER_MINTER_ROLE)
 *   UPDATED_MASTER_MINTER_ADDRESS       - new master minter
 *   UPGRADER_ADDRESS                    - current upgrader
 *   UPDATED_UPGRADER_ADDRESS            - new upgrader
 *   BLACKLISTER_ADDRESS                 - current blacklister
 *   UPDATED_BLACKLISTER_ADDRESS         - new blacklister
 *   RESCUER_ADDRESS                     - current rescuer
 *   UPDATED_RESCUER_ADDRESS             - new rescuer
 *
 * Minter configuration (signer must hold MASTER_MINTER_ROLE):
 *   ACTION=configure-minter
 *     MINTER_ADDRESS      - address to grant MINTER role and set limits for
 *     MINTER_MINT_LIMIT   - mint limit in human-readable token units (e.g. "1000000")
 *     MINTER_BURN_LIMIT   - burn limit in human-readable token units (e.g. "1000000")
 *
 *   ACTION=remove-minter
 *     MINTER_ADDRESS      - address to remove MINTER role from
 */

function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

// Pre-compute role constants locally — avoids calling on-chain role-constant getters
// (e.g. getRoleAdmin), which cause nonce validation errors on some RPC nodes (e.g. Hoodi).
const ROLES: Record<string, string> = {
  FREEZER_ROLE:      ethers.keccak256(ethers.toUtf8Bytes("FREEZER_ROLE")),
  MASTER_MINTER_ROLE: ethers.keccak256(ethers.toUtf8Bytes("MASTER_MINTER_ROLE")),
  UPGRADER_ROLE:     ethers.keccak256(ethers.toUtf8Bytes("UPGRADER_ROLE")),
  RESCUER_ROLE:      ethers.keccak256(ethers.toUtf8Bytes("RESCUER_ROLE")),
  BLACKLISTER_ROLE:  ethers.keccak256(ethers.toUtf8Bytes("BLACKLISTER_ROLE")),
  MINTER:            ethers.keccak256(ethers.toUtf8Bytes("MINTER")),
  // BRIDGE_MINTER is intentionally omitted — configureBridgeMinter/removeBridgeMinter
  // are not yet supported by this script.
};

interface RoleUpdate {
  label: string;
  roleKey: string;
  current: string | undefined;
  updated: string | undefined;
}

async function main() {
  const proxyAddress = process.env.PROXY_CONTRACT_ADDRESS ?? process.env.PROXY_ADDRESS;
  if (!proxyAddress) {
    throw new Error(
      "PROXY_CONTRACT_ADDRESS (or PROXY_ADDRESS) is not set. Set it in .env to use this script."
    );
  }

  const action = process.env.ACTION;

  const contract = await ethers.getContractAt("Stablecoin", proxyAddress);

  // --- Accept admin transfer (step 2) ---
  // The new admin is a separate wallet whose keys we do NOT hold, so we don't
  // sign/broadcast here. Instead we emit the raw transaction (to + calldata) for
  // the new admin's owner to sign and broadcast themselves. No signer required.
  if (action === "accept-admin-transfer") {
    const data = contract.interface.encodeFunctionData("acceptDefaultAdminTransfer");

    console.log("Accept admin transfer — hand the following to the NEW admin wallet owner");
    console.log("to sign & broadcast (must be sent FROM the pending new admin address):\n");
    console.log(`  To (contract) : ${proxyAddress}`);
    console.log(`  Value         : 0`);
    console.log(`  Function      : acceptDefaultAdminTransfer()`);
    console.log(`  Data          : ${data}`);

    // Best-effort context reads (skip silently if the RPC rejects the eth_call).
    try {
      const net = await ethers.provider.getNetwork();
      console.log(`  Chain ID      : ${net.chainId}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pending = await (contract as any).pendingDefaultAdmin();
      console.log(`\n  (info) pending new admin : ${pending.newAdmin}`);
      console.log(`  (info) accept schedule   : ${pending.schedule} (unix; the tx will revert until this time is reached)`);
    } catch {
      // reads are optional — the To/Data above are all that's needed to sign
    }
    return;
  }

  const [signer] = await ethers.getSigners();
  console.log(`Signer:   ${signer.address}`);
  console.log(`Contract: ${proxyAddress}\n`);

  // --- Build the list of role updates from env ---
  const roleUpdates: RoleUpdate[] = [
    {
      label: "FREEZER",
      roleKey: "FREEZER_ROLE",
      current: process.env.FREEZER_ADDRESS,
      updated: process.env.UPDATED_FREEZER_ADDRESS,
    },
    {
      label: "MASTER_MINTER",
      roleKey: "MASTER_MINTER_ROLE",
      current: process.env.MASTER_MINTER_ADDRESS,
      updated: process.env.UPDATED_MASTER_MINTER_ADDRESS,
    },
    {
      label: "UPGRADER",
      roleKey: "UPGRADER_ROLE",
      current: process.env.UPGRADER_ADDRESS,
      updated: process.env.UPDATED_UPGRADER_ADDRESS,
    },
    {
      label: "BLACKLISTER",
      roleKey: "BLACKLISTER_ROLE",
      current: process.env.BLACKLISTER_ADDRESS,
      updated: process.env.UPDATED_BLACKLISTER_ADDRESS,
    },
    {
      label: "RESCUER",
      roleKey: "RESCUER_ROLE",
      current: process.env.RESCUER_ADDRESS,
      updated: process.env.UPDATED_RESCUER_ADDRESS,
    },
  ];

  const pendingUpdates = roleUpdates.filter((r) => r.updated);
  const adminUpdated = process.env.UPDATED_ADMIN_ADDRESS;
  const minterAddress = process.env.MINTER_ADDRESS;

  // Validate action-specific requirements before the generic nothing-to-do guard.
  if (action === "remove-minter" && !minterAddress) {
    throw new Error("ACTION=remove-minter requires MINTER_ADDRESS.");
  }
  if (action === "configure-minter" && !minterAddress) {
    throw new Error("ACTION=configure-minter requires MINTER_ADDRESS.");
  }

  if (
    pendingUpdates.length === 0 &&
    !adminUpdated &&
    action !== "configure-minter" &&
    action !== "remove-minter"
  ) {
    throw new Error("No UPDATED_* addresses are set in .env. Nothing to do.");
  }

  // --- Process each role ---
  for (const { label, roleKey, current, updated } of pendingUpdates) {
    if (!updated) continue;

    if (!current) {
      throw new Error(
        `${label}: UPDATED address is set but the current address is missing from .env. ` +
        `Set the original address so it can be revoked.`
      );
    }

    if (current.toLowerCase() === updated.toLowerCase()) {
      throw new Error(
        `${label}: UPDATED address is the same as the current address (${current}). No change needed.`
      );
    }

    console.log(`--- ${label} ---`);
    console.log(`  Grant  → ${updated}`);
    console.log(`  Revoke ← ${current}`);
    const confirmed = await confirm(`  Proceed with grant + revoke for ${label}? (y to confirm): `);
    if (!confirmed) {
      console.log(`  Skipped ${label}.`);
      continue;
    }

    const roleBytes32 = ROLES[roleKey];

    const holdsRole = await contract.hasRole(roleBytes32, current);
    if (!holdsRole) {
      throw new Error(
        `${label}: on-chain check failed — ${current} does not currently hold this role. ` +
        `Verify ${label.includes("MASTER_MINTER") ? "MASTER_MINTER_ADDRESS" : label + "_ADDRESS"} in .env is correct.`
      );
    }

    const grantTx = await contract.grantRole(roleBytes32, updated);
    await grantTx.wait();
    console.log(`  Grant tx: ${grantTx.hash}`);

    const revokeCalldata = contract.interface.encodeFunctionData("revokeRole", [roleBytes32, current]);
    console.log(`  WARNING: grant succeeded — revoking ${current} now.`);
    console.log(`  If this step fails, replay manually: To=${proxyAddress} Data=${revokeCalldata}`);

    const revokeTx = await contract.revokeRole(roleBytes32, current);
    await revokeTx.wait();
    console.log(`  Revoke tx: ${revokeTx.hash}\n`);
  }

  // --- Configure minter ---
  if (action === "configure-minter") {
    const mintLimitRaw = process.env.MINTER_MINT_LIMIT;
    const burnLimitRaw = process.env.MINTER_BURN_LIMIT;

    if (!mintLimitRaw || !burnLimitRaw) {
      throw new Error("MINTER_ADDRESS is set but MINTER_MINT_LIMIT and MINTER_BURN_LIMIT are missing.");
    }

    // Contract enforces limit <= type(uint256).max / 2 (reverts with LimitsTooHigh above that).
    const MAX_LIMIT = ethers.MaxUint256 / 2n;
    const tokenDecimals = await contract.decimals();
    const mintLimit = mintLimitRaw === "max" ? MAX_LIMIT : ethers.parseUnits(mintLimitRaw, tokenDecimals);
    const burnLimit = burnLimitRaw === "max" ? MAX_LIMIT : ethers.parseUnits(burnLimitRaw, tokenDecimals);

    console.log(`--- MINTER ---`);
    console.log(`  Configuring minter : ${minterAddress}`);
    console.log(`  Mint limit         : ${mintLimitRaw}`);
    console.log(`  Burn limit         : ${burnLimitRaw}`);

    const hasMasterMinter = await contract.hasRole(ROLES["MASTER_MINTER_ROLE"], signer.address);
    if (!hasMasterMinter) {
      throw new Error(`Signer ${signer.address} does not have MASTER_MINTER_ROLE.`);
    }

    const alreadyMinter = await contract.hasRole(ROLES["MINTER"], minterAddress);
    if (alreadyMinter) {
      console.log(`  Note: ${minterAddress} already has MINTER role — this will update limits.`);
    }

    const confirmed = await confirm(`  Confirm configuring ${minterAddress} as minter with mint=${mintLimitRaw} burn=${burnLimitRaw}? (y to confirm): `);
    if (!confirmed) {
      console.log(`  Skipped MINTER.`);
    } else {
      const tx = await contract.configureMinter(minterAddress, mintLimit, burnLimit);
      await tx.wait();
      console.log(`  Done. Tx: ${tx.hash}\n`);
    }
  }

  // --- Remove minter ---
  if (action === "remove-minter") {
    console.log(`--- REMOVE MINTER ---`);
    console.log(`  Removing minter: ${minterAddress}`);
    const confirmed = await confirm(`  Proceed? (y to confirm): `);
    if (!confirmed) {
      console.log(`  Skipped.`);
    } else {
      const tx = await contract.removeMinter(minterAddress);
      await tx.wait();
      console.log(`  Done. Tx: ${tx.hash}\n`);
    }
  }

  // --- Begin admin transfer if requested (always last) ---
  if (adminUpdated) {
    console.log("--- DEFAULT_ADMIN ---");
    console.log(`  Current admin : ${process.env.ADMIN_ADDRESS || "(not set in .env)"}`);
    console.log(`  New admin     : ${adminUpdated}`);
    console.log();
    console.log("  WARNING: Once the new admin accepts the transfer, the current admin loses");
    console.log("  DEFAULT_ADMIN_ROLE permanently — no grant/revoke, no setMintCap, no setSupplyValidator.");
    console.log("  Verify all role changes above completed successfully before proceeding.");
    console.log();

    const confirmed = await confirm("  All role updates look correct. Begin admin transfer? (y to confirm): ");
    if (!confirmed) {
      console.log("  Admin transfer skipped. Re-run the script to initiate it when ready.");
      console.log("\nAll other updates complete.");
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pending = await (contract as any).pendingDefaultAdmin();
    if (pending.newAdmin !== ethers.ZeroAddress) {
      console.warn(`  Warning: a pending transfer to ${pending.newAdmin} is already in progress.`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = await (contract as any).beginDefaultAdminTransfer(adminUpdated);
    await tx.wait();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delay = await (contract as any).defaultAdminDelay();
    const delayHours = (Number(delay) / 3600).toFixed(1);
    console.log(`  Transfer initiated. Tx: ${tx.hash}`);
    console.log(`  The new admin must run ACTION=accept-admin-transfer after the ${delayHours}h delay.`);
    console.log(`  Until then, the current admin is still active.\n`);
  }

  console.log("All updates complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
