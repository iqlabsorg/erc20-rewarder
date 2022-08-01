import '@typechain/hardhat';

import { HardhatUserConfig } from 'hardhat/config';
import '@nomiclabs/hardhat-etherscan';
import '@nomiclabs/hardhat-waffle';
import '@nomiclabs/hardhat-ethers';
import 'hardhat-gas-reporter';
import 'solidity-coverage';
import 'hardhat-contract-sizer';
import 'hardhat-deploy';

import dotenv from 'dotenv';

// Enable tasks
import './tasks';

const env = dotenv.config();

const ETHERSCAN_API_KEY = env.parsed?.ETHERSCAN_API;
const PRIVATE_KEY = env.parsed!.PRIVATE_KEY;
const RINKEBY_URL = env.parsed!.RINKEBY_URL;
const BSCTESTNET_URL = env.parsed!.BSCTESTNET_URL;
const BSC_URL = env.parsed!.BSC_URL;

const config: HardhatUserConfig = {
  mocha: {
    bail: true,
  },
  namedAccounts: {
    deployer: 0,
    vault: 1,
  },
  solidity: {
    compilers: [
      {
        version: '0.8.11',
        settings: {
          optimizer: {
            enabled: true,
            runs: 1000,
          },
        },
      },
    ],
  },
  networks: {
    rinkeby: {
      url: RINKEBY_URL,
      accounts: [PRIVATE_KEY],
    },
    bscTestnet: {
      url: BSCTESTNET_URL,
      accounts: [PRIVATE_KEY],
    },
    bsc: {
      url: BSC_URL,
      accounts: [PRIVATE_KEY],
    },
    polygon: {
      url: 'https://polygon-mainnet.g.alchemy.com/v2/2iGyxP0Xl7W88mYQ1LhzFYZ1XkIOGMLm',
      accounts: [PRIVATE_KEY],
    },
    mumbaiTestnet: {
      url: 'https://polygon-mumbai.g.alchemy.com/v2/SvFhsM2TjGcQnUYrniK7HfytBADmmqvU',
      accounts: [PRIVATE_KEY],
    },
  },
  etherscan: {
    apiKey: {
      polygon: '3SAKKF6CCEV9TW8JBJP9TERTY2U6NQHGHT',
      bsc: 'TTWE1EGN7G8VFWP78UJXGBAFJMV9XIHRA6',
      polygonMumbai: '3SAKKF6CCEV9TW8JBJP9TERTY2U6NQHGHT',
      bscTestnet: 'TTWE1EGN7G8VFWP78UJXGBAFJMV9XIHRA6',
    },
    customChains: [],
  },
  typechain: {
    outDir: './typechain',
    target: 'ethers-v5',
  },
};

if (process.env.FORKING) {
  const FORK_URL = env.parsed!.FORK_URL;
  const FORK_CHAIN_ID = env.parsed!.FORK_CHAIN_ID;

  config.networks!.hardhat = {
    forking: {
      url: FORK_URL,
    },
    chainId: FORK_CHAIN_ID ? Number(FORK_CHAIN_ID) : undefined,
  };
}

export default config;
