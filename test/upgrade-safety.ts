// Copyright (c) 2026 BitGo, Inc. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { expect } from "chai";
import { artifacts, ethers, upgrades } from "hardhat";
import { UpgradeableContract, SolcInput, SolcOutput } from "@openzeppelin/upgrades-core";

const STORAGE_ERROR = /New storage layout is incompatible|storage layout/i;

describe("upgrade safety", function () {
  describe("Stablecoin namespaced storage", function () {
    it("is annotated as ERC-7201 namespace contract.storage.Stablecoin with the expected members", async function () {
      const buildInfo = await artifacts.getBuildInfo("contracts/Stablecoin.sol:Stablecoin");
      const contract = new UpgradeableContract(
        "contracts/Stablecoin.sol:Stablecoin",
        buildInfo!.input as SolcInput,
        buildInfo!.output as SolcOutput,
        {},
        buildInfo!.solcVersion
      );
      const members = contract.layout.namespaces?.["erc7201:contract.storage.Stablecoin"];
      expect(members, "namespace erc7201:contract.storage.Stablecoin not tracked").to.not.equal(undefined);
      expect(members!.map((m) => m.label)).to.deep.equal([
        "mintCapPerTransaction",
        "tokenDecimals",
        "minters",
        "bridgeMinters",
        "supplyValidator",
      ]);
    });

    it("accepts the current implementation as an upgrade of itself", async function () {
      const Factory = await ethers.getContractFactory("Stablecoin");
      await upgrades.validateUpgrade(Factory, Factory, { kind: "uups" });
    });
  });

  describe("validateUpgrade on annotated namespaced storage", function () {
    async function factory(name: string) {
      return ethers.getContractFactory(name);
    }

    it("accepts appending a field", async function () {
      await upgrades.validateUpgrade(await factory("MockLayoutV1"), await factory("MockLayoutV2Appended"), {
        kind: "uups",
      });
    });

    it("rejects reordering fields", async function () {
      await expect(
        upgrades.validateUpgrade(await factory("MockLayoutV1"), await factory("MockLayoutV2Reordered"), {
          kind: "uups",
        })
      ).to.be.rejectedWith(STORAGE_ERROR);
    });

    it("rejects changing a field's type", async function () {
      await expect(
        upgrades.validateUpgrade(await factory("MockLayoutV1"), await factory("MockLayoutV2RetypedField"), {
          kind: "uups",
        })
      ).to.be.rejectedWith(STORAGE_ERROR);
    });

    describe("nested MinterConfig / MinterParams (mirrors the real StablecoinStorage)", function () {
      it("accepts the nested baseline as an upgrade of itself", async function () {
        await upgrades.validateUpgrade(await factory("MockNestedV1"), await factory("MockNestedV1"), { kind: "uups" });
      });

      it("rejects reordering fields inside MinterParams", async function () {
        await expect(
          upgrades.validateUpgrade(await factory("MockNestedV1"), await factory("MockNestedV2ReorderedParams"), {
            kind: "uups",
          })
        ).to.be.rejectedWith(STORAGE_ERROR);
      });

      it("rejects reordering minterParams/burnerParams inside MinterConfig", async function () {
        await expect(
          upgrades.validateUpgrade(await factory("MockNestedV1"), await factory("MockNestedV2ReorderedConfig"), {
            kind: "uups",
          })
        ).to.be.rejectedWith(STORAGE_ERROR);
      });

      it("rejects swapping the minters and bridgeMinters mappings", async function () {
        await expect(
          upgrades.validateUpgrade(await factory("MockNestedV1"), await factory("MockNestedV2SwappedMappings"), {
            kind: "uups",
          })
        ).to.be.rejectedWith(STORAGE_ERROR);
      });
    });

    it("accepts introducing the annotation: unannotated layout -> annotated layout with identical members", async function () {
      await upgrades.validateUpgrade(await factory("MockLayoutUnannotatedV1"), await factory("MockLayoutV1"), {
        kind: "uups",
      });
    });

    it("cannot detect a reorder when the annotation is missing (why the annotation is required)", async function () {
      await upgrades.validateUpgrade(
        await factory("MockLayoutUnannotatedV1"),
        await factory("MockLayoutUnannotatedV2Reordered"),
        { kind: "uups" }
      );
    });
  });
});
