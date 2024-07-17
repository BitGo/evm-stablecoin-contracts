import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify"
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import * as dotenv from 'dotenv';
dotenv.config();

const {
  DEPLOYMENT_KEY,
  ETHERSCAN_API_KEY
} = process.env;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
      },
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
  },
  etherscan: {
    apiKey: {
      holesky: `${ETHERSCAN_API_KEY}`,
    },
    customChains: [
      {
        network: 'holesky',
        chainId: 17000,
        urls: {
          apiURL: 'https://api-holesky.etherscan.io/api',
          browserURL: 'https://holesky.etherscan.io'
        }
      },
    ],
  }
};
export default config;
