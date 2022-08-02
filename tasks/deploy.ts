import { task, types } from 'hardhat/config';
import MerkleTree from 'merkletreejs';
import { Rewarder__factory, ERC20Mock__factory } from '../typechain';

task('deploy-rewarder', 'Deploy the rewarder and set up the merkle root')
  .addParam('input', `Path to the csv file`)
  .addParam('tokenVault', `Address of the token vault`, undefined, types.string)
  .addParam('tokenAddress', `Address of the token`, undefined, types.string)
  .addParam(
    'output',
    `the base path where to output files in form of :
    - \`<outputPath>/<chain_id>/claim_proofs.json\`
    - \`<outputPath>/<chain_id>/merkle_root.txt\`
  The new folders will be created automatically.
  `,
  )
  .setAction(async (args, hre) => {
    const { output, input, tokenAddress, tokenVault } = args;
    const deployer = await hre.ethers.getNamedSigner('deployer');

    await hre.deployments.delete('Rewarder');

    // Deploy the contract
    const rewarderDeployment = await hre.deployments.deploy('Rewarder', {
      from: deployer.address,
      args: [tokenVault, tokenAddress],
      log: true,
    });
    console.log('rewarderDeployment', rewarderDeployment.address);

    const merkleRoot = (await hre.run('generate-merkle-tree-output', {
      rewarder: rewarderDeployment.address,
      input,
      output,
    })) as string;

    const rewarder = Rewarder__factory.connect(rewarderDeployment.address, deployer);
    {
      console.log('merkleRoot', merkleRoot);
      const tx = await rewarder.setMerkleRoot(merkleRoot);
      console.log('setMerkleRoot tx', tx.hash, tx.data);
      await tx.wait();
    }

    {
      const tx = await rewarder.enableClaiming();
      console.log('enableClaiming tx', tx.hash, tx.data);
      await tx.wait();
    }

    await hre.run('verification:verify', {
      contractName: 'Rewarder',
      contractAddress: rewarderDeployment.address,
      constructorArguments: [tokenVault, tokenAddress],
      proxyVerification: false,
    });

    console.log(
      `Further steps: set allowance from the vault account (${tokenVault}) on the token address (${tokenAddress}) - token.approve(${rewarder.address}, ${hre.ethers.constants.MaxUint256})`,
    );
  });
