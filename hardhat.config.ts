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
  INFURA_API_KEY,
  BSCSCAN_API_KEY,
  BSC_RPC_URL,
  BSC_TESTNET_RPC_URL,
} = process.env;

const targetNetwork = process.env.HARDHAT_NETWORK;
if (targetNetwork === "bsc" && !BSC_RPC_URL) {
  console.warn("Warning: BSC_RPC_URL is not set. Falling back to public RPC — not safe for production deployments. Set BSC_RPC_URL in .env.");
}
if (targetNetwork === "bscTestnet" && !BSC_TESTNET_RPC_URL) {
  console.warn("Warning: BSC_TESTNET_RPC_URL is not set. Falling back to public RPC. Set BSC_TESTNET_RPC_URL in .env.");
}

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
    },
    bsc: {
      url: BSC_RPC_URL?.trim() || 'https://bsc-dataseed.binance.org/',
      accounts: DEPLOYMENT_KEY ? [`${DEPLOYMENT_KEY}`] : [],
      chainId: 56,
    },
    bscTestnet: {
      url: BSC_TESTNET_RPC_URL?.trim() || 'https://bsc-testnet-rpc.publicnode.com',
      accounts: DEPLOYMENT_KEY ? [`${DEPLOYMENT_KEY}`] : [],
      chainId: 97,
    },
  },
  etherscan: {
    enabled: true,
    apiKey: {
      mainnet: `${ETHERSCAN_API_KEY}`,
      sepolia: `${ETHERSCAN_API_KEY}`,
      holesky: `${ETHERSCAN_API_KEY}`,
      hoodi: `${ETHERSCAN_API_KEY}`,
      bsc: BSCSCAN_API_KEY ?? '',
      bscTestnet: BSCSCAN_API_KEY ?? '',
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
      },
      {
        network: 'bsc',
        chainId: 56,
        urls: {
          apiURL: 'https://api.bscscan.com/api',
          browserURL: 'https://bscscan.com'
        }
      },
      {
        network: 'bscTestnet',
        chainId: 97,
        urls: {
          apiURL: 'https://api-testnet.bscscan.com/api',
          browserURL: 'https://testnet.bscscan.com'
        }
      }
    ],
  }
};
export default config;
