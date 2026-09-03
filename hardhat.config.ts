// Copyright (c) 2026 BitGo, Inc. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import hardhatUpgrades from "@openzeppelin/hardhat-upgrades";
import * as dotenv from 'dotenv';
dotenv.config();

const {
  DEPLOYMENT_KEY,
  ETHERSCAN_API_KEY,
  INFURA_API_KEY,
  BSCSCAN_API_KEY,
  BSC_RPC_URL,
  BSC_TESTNET_RPC_URL,
  POLYGON_RPC_URL,
  MONAD_RPC_URL,
  POLYGON_AMOY_RPC_URL,
  MONAD_TESTNET_RPC_URL,
} = process.env;

const targetNetwork = process.env.HARDHAT_NETWORK;
if (targetNetwork === "bsc" && !BSC_RPC_URL) {
  console.warn("Warning: BSC_RPC_URL is not set. Falling back to public RPC — not safe for production deployments. Set BSC_RPC_URL in .env.");
}
if (targetNetwork === "bscTestnet" && !BSC_TESTNET_RPC_URL) {
  console.warn("Warning: BSC_TESTNET_RPC_URL is not set. Falling back to public RPC. Set BSC_TESTNET_RPC_URL in .env.");
}
if (targetNetwork === "polygon" && !POLYGON_RPC_URL) {
  console.warn("Warning: POLYGON_RPC_URL is not set. Falling back to public RPC — not safe for production deployments. Set POLYGON_RPC_URL in .env.");
}
if (targetNetwork === "monad" && !MONAD_RPC_URL) {
  console.warn("Warning: MONAD_RPC_URL is not set. Falling back to public RPC — not safe for production deployments. Set MONAD_RPC_URL in .env.");
}
if (targetNetwork === "polygonAmoy" && !POLYGON_AMOY_RPC_URL) {
  console.warn("Warning: POLYGON_AMOY_RPC_URL is not set. Falling back to public RPC. Set POLYGON_AMOY_RPC_URL in .env.");
}
if (targetNetwork === "monadTestnet" && !MONAD_TESTNET_RPC_URL) {
  console.warn("Warning: MONAD_TESTNET_RPC_URL is not set. Falling back to public RPC. Set MONAD_TESTNET_RPC_URL in .env.");
}

const config = defineConfig({
  plugins: [hardhatToolboxMochaEthers, hardhatUpgrades],
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
      type: "edr-simulated",
    },
    holesky: {
      type: "http",
      url: `https://rpc.holesky.ethpandaops.io/`,
      accounts: DEPLOYMENT_KEY ? [`${DEPLOYMENT_KEY}`] : [],
      chainId: 17000,
    },
    sepolia: {
      type: "http",
      url: `https://sepolia.infura.io/v3/${INFURA_API_KEY}`,
      accounts: DEPLOYMENT_KEY ? [`${DEPLOYMENT_KEY}`] : [],
      chainId: 11155111,
    },
    mainnet: {
      type: "http",
      url: `https://mainnet.infura.io/v3/${INFURA_API_KEY}`,
      accounts: DEPLOYMENT_KEY ? [`${DEPLOYMENT_KEY}`] : [],
      chainId: 1,
    },
    hoodi: {
      type: "http",
      url: `https://rpc.hoodi.ethpandaops.io/`,
      accounts: DEPLOYMENT_KEY ? [`${DEPLOYMENT_KEY}`] : [],
      chainId: 560048,
    },
    bsc: {
      type: "http",
      url: BSC_RPC_URL?.trim() || "https://bsc-dataseed.binance.org/",
      accounts: DEPLOYMENT_KEY ? [`${DEPLOYMENT_KEY}`] : [],
      chainId: 56,
    },
    bscTestnet: {
      type: "http",
      url: BSC_TESTNET_RPC_URL?.trim() || "https://bsc-testnet-rpc.publicnode.com",
      accounts: DEPLOYMENT_KEY ? [`${DEPLOYMENT_KEY}`] : [],
      chainId: 97,
    },
    polygon: {
      type: "http",
      url: POLYGON_RPC_URL?.trim() || "https://polygon.drpc.org",
      accounts: DEPLOYMENT_KEY ? [`${DEPLOYMENT_KEY}`] : [],
      chainId: 137,
    },
    monad: {
      type: "http",
      url: MONAD_RPC_URL?.trim() || "https://rpc.monad.xyz",
      accounts: DEPLOYMENT_KEY ? [`${DEPLOYMENT_KEY}`] : [],
      chainId: 143,
    },
    polygonAmoy: {
      type: "http",
      url: POLYGON_AMOY_RPC_URL?.trim() || "https://polygon-amoy-public.nodies.app",
      accounts: DEPLOYMENT_KEY ? [`${DEPLOYMENT_KEY}`] : [],
      chainId: 80002,
    },
    monadTestnet: {
      type: "http",
      url: MONAD_TESTNET_RPC_URL?.trim() || "https://testnet-rpc.monad.xyz",
      accounts: DEPLOYMENT_KEY ? [`${DEPLOYMENT_KEY}`] : [],
      chainId: 10143,
    },
  },
  sourcify: {
    enabled: true,
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
      polygon: `${ETHERSCAN_API_KEY}`,
      monad: `${ETHERSCAN_API_KEY}`,
      polygonAmoy: `${ETHERSCAN_API_KEY}`,
      monadTestnet: `${ETHERSCAN_API_KEY}`,
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
      },
      {
        network: 'polygon',
        chainId: 137,
        urls: {
          apiURL: 'https://api.etherscan.io/v2/api?chainid=137',
          browserURL: 'https://polygonscan.com'
        }
      },
      {
        network: 'monad',
        chainId: 143,
        urls: {
          apiURL: 'https://api.etherscan.io/v2/api?chainid=143',
          browserURL: 'https://monadscan.com'
        }
      },
      {
        network: 'polygonAmoy',
        chainId: 80002,
        urls: {
          apiURL: 'https://api.etherscan.io/v2/api?chainid=80002',
          browserURL: 'https://amoy.polygonscan.com'
        }
      },
      {
        network: 'monadTestnet',
        chainId: 10143,
        urls: {
          apiURL: 'https://api.etherscan.io/v2/api?chainid=10143',
          browserURL: 'https://testnet.monadscan.com'
        }
      }
    ],
  }
});
export default config;
