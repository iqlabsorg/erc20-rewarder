import { task, types } from 'hardhat/config';

task('verification:verify', 'Verification of a contract for a different chain scanners')
  .addParam('contractName', 'The name of the contract', undefined, types.string, false)
  .addParam('contractAddress', 'The ETH address of the contract', undefined, types.string, false)
  .addParam('constructorArguments', 'The arguments passed to constructor during deploy', undefined, types.json, false)
  .addParam('proxyVerification', 'Usage of old verify task', undefined, types.boolean, false)
  .addParam('contractLibraries', 'The set of libraries used by contract', undefined, types.json, true)
  .setAction(
    async ({ contractName, contractAddress, constructorArguments, proxyVerification, contractLibraries }, hre) => {
      try {
        console.log(`Verifying ${contractName} contract: ${contractAddress}`);
        let verificationParams;

        if (contractLibraries) {
          verificationParams = {
            address: contractAddress as string,
            constructorArguments: constructorArguments as [],
            libraries: contractLibraries as object,
          };
        } else {
          verificationParams = {
            address: contractAddress as string,
            constructorArguments: constructorArguments as [],
          };
        }

        if (proxyVerification) {
          await hre.run('verify', verificationParams);
        } else {
          await hre.run('verify:verify', verificationParams);
        }
      } catch (err: any) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        if (err.message.includes('Reason: Already Verified')) {
          console.log(`Contract ${contractName} is already verified`);
        } else {
          console.error(err);
        }
      }
    },
  );
