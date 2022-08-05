import { task, types } from 'hardhat/config';
import { config as dotenvConfig } from 'dotenv';
import { promises as fs } from 'fs';

const env = dotenvConfig();
const ABSOLUTE_PROJECT_PATH = env.parsed?.ABSOLUTE_PROJECT_PATH as string;

// eslint-disable-next-line consistent-return
export const writeLibrariesToFile = async (contractName: string, libraries: object): Promise<string | undefined> => {
  const librariesFilePath = `${ABSOLUTE_PROJECT_PATH}/${contractName}-libraries.js`;
  const librariesObject = `module.exports = ${JSON.stringify(libraries)}`;

  console.log(`Writing { ${librariesObject} } to ${librariesFilePath}`);

  try {
    await fs.writeFile(librariesFilePath, librariesObject);
    return librariesFilePath;
  } catch (err) {
    console.error(`Error occured while writing libraries to file for ${contractName} contract: `, err);
  }
};

class ContractWithDynamicLibraryVerificationError extends Error {
  constructor(contractName: string, libraries: object) {
    super(`Failed verifying libraries set { ${JSON.stringify(libraries)} } for ${contractName} contract`);
    Object.setPrototypeOf(this, ContractWithDynamicLibraryVerificationError.prototype);
  }
}

interface VerificationParams {
  address: string;
  constructorArguments: any[];
  libraries: string | undefined;
  contract: string | undefined;
}

task('verification:verify', 'Verification of a contract for a different chain scanners')
  .addParam('contractName', 'The name of the contract', undefined, types.string, false)
  .addParam('contractAddress', 'The ETH address of the contract', undefined, types.string, false)
  .addParam('constructorArguments', 'The arguments passed to constructor during deploy', undefined, types.json, false)
  .addParam('proxyVerification', 'Usage of old verify task', undefined, types.boolean, false)
  .addParam('contractLibraries', 'The set of libraries used by contract', undefined, types.json, true)
  .addParam('contractSpecifier', 'The contract Solidity specifier', undefined, types.string, true)
  .setAction(
    async (
      { contractName, contractAddress, constructorArguments, proxyVerification, contractLibraries, contractSpecifier },
      hre,
    ) => {
      try {
        console.log(`Verifying ${contractName} contract: ${contractAddress}`);
        const verificationParams: VerificationParams = {
          address: contractAddress as string,
          constructorArguments: constructorArguments as [],
          libraries: undefined,
          contract: undefined,
        };

        if (contractLibraries) {
          const librariesFilePath: string | undefined = await writeLibrariesToFile(
            contractName as string,
            contractLibraries as object,
          );

          if (librariesFilePath) {
            verificationParams.libraries = librariesFilePath;
          } else {
            throw new ContractWithDynamicLibraryVerificationError(contractName as string, contractLibraries as object);
          }
        }

        if (contractSpecifier) {
          verificationParams.contract = contractSpecifier as string;
        }

        console.log(`Verification params ${JSON.stringify(verificationParams)}`);

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
