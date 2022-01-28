import { ethers } from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import dotenv from 'dotenv';

const env = dotenv.config();

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const deployer = await ethers.getNamedSigner('deployer');
  const { deployments } = hre;
  const { deploy } = deployments;

  // Read the deploy params from env file
  const tokenVault = env.parsed!.TOKEN_VAULT;
  const token = env.parsed!.TOKEN_ADDRESS;

  // Deploy the contract
  await deploy('Rewarder', {
    from: deployer.address,
    args: [tokenVault, token],
    log: true,
  });
};
export default func;

func.tags = ['production'];
