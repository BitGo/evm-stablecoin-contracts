import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify"
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-solhint";
import "@openzeppelin/hardhat-upgrades";
import * as dotenv from 'dotenv';
dotenv.config();

const {
  DEPLOYMENT_KEY,
  ETHERSCAN_API_KEY
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
    mainnet: {
      url: `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
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
    apiKey: `${ETHERSCAN_API_KEY}`,
    customChains: [
      {
        network: 'holesky',
        chainId: 17000,
        urls: {
          apiURL: 'https://api-holesky.etherscan.io/api',
          browserURL: 'https://holesky.etherscan.io'
        }
      },
      {
        network: 'hoodi',
        chainId: 560048,
        urls: {
          apiURL: 'https://api-hoodi.etherscan.io/api',
          browserURL: 'https://hoodi.etherscan.io'
        }
      },
    ],
  }
};
export default config;
