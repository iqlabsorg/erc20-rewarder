import { task, types } from 'hardhat/config';

task('verify-rewarder', 'Verify the rewarder on chain scan')
  .addParam('rewarderAddress', `Address of the Rewarder contract`, undefined, types.string)
  .addParam('tokenVaultAddress', `Address of the token vault`, undefined, types.string)
  .addParam('tokenAddress', `Address of the token`, undefined, types.string)
  .setAction(async (args, hre) => {
    const { rewarderAddress, tokenVaultAddress, tokenAddress } = args;

    console.log('Verification of Rewarder contract');
    const verifiedRewarder = await hre.run('verify:verify', {
      address: rewarderAddress,
      constructorArguments: [tokenVaultAddress, tokenAddress],
    });

    return verifiedRewarder;
  });
