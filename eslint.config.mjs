// Copyright (c) 2026 BitGo, Inc. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import chaiFriendly from "eslint-plugin-chai-friendly";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import { includeIgnoreFile } from "@eslint/compat";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gitignorePath = path.resolve(__dirname, ".gitignore");
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
    ...compat.extends(
      "eslint:recommended",
      "plugin:@typescript-eslint/recommended",
      "plugin:@typescript-eslint/stylistic"
    ),
  {
    plugins: {
      "chai-friendly": chaiFriendly,
    },

    rules: {
      "@typescript-eslint/no-unused-expressions": 0,
      "chai-friendly/no-unused-expressions": 2,
    },
  },

  includeIgnoreFile(gitignorePath),
];
