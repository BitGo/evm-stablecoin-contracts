// Copyright (c) 2026 BitGo, Inc. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-solhint";
import "@openzeppelin/hardhat-upgrades";
import * as dotenv from 'dotenv';
dotenv.config();

const {
  DEPLOYMENT_KEY,
  ETHERSCAN_API_KEY,
  INFURA_API_KEY
} = process.env;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.30",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      loggingEnabled: false
    },
    holesky: {
      url: `https://rpc.holesky.ethpandaops.io/`,
      accounts: DEPLOYMENT_KEY? [`${DEPLOYMENT_KEY}`]: [],
      chainId: 17000,
    },
    sepolia: {
      url: `https://sepolia.infura.io/v3/${INFURA_API_KEY}`,
      accounts: DEPLOYMENT_KEY ? [`${DEPLOYMENT_KEY}`] : [],
      chainId: 11155111,
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${INFURA_API_KEY}`,
      accounts: DEPLOYMENT_KEY ? [`${DEPLOYMENT_KEY}`] : [],
      chainId: 1,
    },
    hoodi: {
      url: `https://rpc.hoodi.ethpandaops.io/`,
      accounts: DEPLOYMENT_KEY ? [`${DEPLOYMENT_KEY}`] : [],
      chainId: 560048
    }
  },
  etherscan: {
    enabled: true,
    apiKey: {
      mainnet: `${ETHERSCAN_API_KEY}`,
      sepolia: `${ETHERSCAN_API_KEY}`,
      holesky: `${ETHERSCAN_API_KEY}`,
      hoodi: `${ETHERSCAN_API_KEY}`,
    },
    customChains: [
      {
        network: 'mainnet',
        chainId: 1,
        urls: {
          apiURL: 'https://api.etherscan.io/v2/api?chainid=1',
          browserURL: 'https://etherscan.io'
        }
      },
      {
        network: 'holesky',
        chainId: 17000,
        urls: {
          apiURL: 'https://api.etherscan.io/v2/api?chainid=17000',
          browserURL: 'https://holesky.etherscan.io'
        }
      },
      {
        network: 'sepolia',
        chainId: 11155111,
        urls: {
          apiURL: 'https://api.etherscan.io/v2/api?chainid=11155111',
          browserURL: 'https://sepolia.etherscan.io'
        }
      },
      {
        network: 'hoodi',
        chainId: 560048,
        urls: {
          apiURL: 'https://api.etherscan.io/v2/api?chainid=560048',
          browserURL: 'https://hoodi.etherscan.io'
        }
      }
    ],
  }
};
export default config;
