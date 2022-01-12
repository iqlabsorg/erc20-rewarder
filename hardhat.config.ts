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

const env = dotenv.config();

const HH_MNEMONIC = 'test test test test test test test test test test test junk';
const MNEMONIC = env.parsed?.MNEMONIC || HH_MNEMONIC;
const ETHERSCAN_API_KEY = env.parsed?.ETHERSCAN_API;

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
    ropsten: {
      url: process.env.ROPSTEN_URL || '',
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: 'USD',
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  typechain: {
    outDir: './typechain',
    target: 'ethers-v5',
  },
};

export default config;
