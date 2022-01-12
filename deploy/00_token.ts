import { ethers } from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { BigNumber } from 'ethers';

const ONE_TOKEN = 10n ** 18n;
const TOKEN_DECIMALS = 18;

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const [deployer] = await ethers.getSigners();
  const { deployments } = hre;
  const { deploy } = deployments;

  const tokenAmount = ONE_TOKEN * 1_000_000n;
  await deploy('ERC20Mock', {
    from: deployer.address,
    args: ['PRQ', 'PRQ', TOKEN_DECIMALS, BigNumber.from(tokenAmount)],
    log: true,
  });
};
export default func;

func.tags = ['test'];
