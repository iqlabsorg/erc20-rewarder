import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Block } from '@ethersproject/abstract-provider';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import dotenv from 'dotenv';
const env = dotenv.config();

export const nextBlock = (timestamp = 0): Promise<unknown> =>
  ethers.provider.send('evm_mine', timestamp > 0 ? [timestamp] : []);

export const increaseTime = async (seconds: number): Promise<void> => {
  const time = await currentTime();
  await nextBlock(time + seconds);
};

export const mineBlocks = async (blocks: number): Promise<void> => {
  const blockBefore = await ethers.provider.getBlock('latest');
  for (let f = 0; f < blocks; f++) {
    await ethers.provider.send('evm_mine', [blockBefore.timestamp + (f + 1) * 15]);
  }
};

export const forceNextTime = async (newTimestamp: number): Promise<void> => {
  if (newTimestamp <= (await currentTime())) return;
  await ethers.provider.send('evm_setNextBlockTimestamp', [newTimestamp]);
};

export const forceTimeDelta = async (timeElapsed = 15): Promise<void> => {
  const blockBefore = await ethers.provider.getBlock('latest');
  await ethers.provider.send('evm_mine', [blockBefore.timestamp + timeElapsed]);
};

export const currentBlock = async (): Promise<Block> => {
  return (await ethers.provider.getBlock('latest')) as Block;
};

export const currentTime = async (): Promise<number> => {
  return (await currentBlock()).timestamp;
};

export const autoMineOff = async (): Promise<void> => {
  await ethers.provider.send('evm_setAutomine', [false]);
  await ethers.provider.send('evm_setIntervalMining', [0]);
};

export const autoMineOn = async (): Promise<void> => {
  await ethers.provider.send('evm_setAutomine', [true]);
  await ethers.provider.send('evm_setIntervalMining', [5000]);
};

/**
 * Asserts contract call was reverted with specific custom error.
 * @param tx Contract call result promise.
 * @param error Custom error name.
 * @param errorParams Custom error params.
 */
export const expectError = async (tx: Promise<unknown>, error: string, errorParams?: unknown[]): Promise<void> => {
  const formatter = (p: unknown): unknown => {
    if (typeof p === 'string') {
      return `"${p}"`;
    } else if (typeof p === 'object') {
      return `[${Object.values(p!)
        .map(p => formatter(p))
        .join(', ')}]`;
    }
    return p;
  };
  const formattedErrorParams = errorParams !== undefined ? errorParams.map(p => formatter(p)).join(', ') : '';
  await expect(tx).to.be.revertedWith(`${error}(${formattedErrorParams})`);
};

export enum Phases {
  CONFIGURING = 0,
  CLAIMING = 1,
}

export const impersonate = async (hre: HardhatRuntimeEnvironment, account: string): Promise<SignerWithAddress> => {
  await hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [account],
  });

  return await hre.ethers.getSigner(account);
};

export const resetFork = async (hre: HardhatRuntimeEnvironment, block?: number): Promise<void> => {
  await hre.network.provider.request({
    method: 'hardhat_reset',
    params: block
      ? [
          {
            forking: {
              jsonRpcUrl: env.parsed!.FORK_URL,
              blockNumber: block,
            },
          },
        ]
      : [],
  });
};
