import { ethers } from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { BigNumber } from 'ethers';

const TOKEN_DECIMALS = 18n;
const ONE_TOKEN = 10n ** TOKEN_DECIMALS;

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const [deployer] = await ethers.getSigners();
  const { deployments } = hre;
  const { deploy } = deployments;

  const tokenAmount = BigNumber.from(ONE_TOKEN * 100000000000000000n);
  await deploy('ERC20Mock', {
    from: deployer.address,
    args: ['TESTTOKEN', 'TTKN', BigNumber.from(TOKEN_DECIMALS), BigNumber.from(tokenAmount)],
    log: true,
  });
};
export default func;

func.tags = ['test'];
