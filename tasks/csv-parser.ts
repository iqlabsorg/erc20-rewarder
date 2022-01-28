// eslint-disable-next-line import/no-unresolved
import { parse } from 'csv-parse/sync';
import { task } from 'hardhat/config';
import { readFileSync, writeFileSync } from 'fs';
import { mkdir } from 'fs/promises';
import { constructRewardsMerkleTree } from '../scripts/merkle-tree';
import path from 'path';
import { BigNumber } from 'ethers';
import { isValidAddress } from 'ethereumjs-util';

task('generate-merkle-tree-output', 'Generate the merkel proof for the incentivization program')
  .addParam('input', `Path to the csv file`)
  .addParam('rewarder', `Deployed rewarder address`)
  .addParam(
    'output',
    `the base path where to output files in form of :
      - \`<outputPath>/<chain_id>/claim_proofs.json\`
      - \`<outputPath>/<chain_id>/merkle_root.txt\`
    The new folders will be created automatically.
    `,
  )
  .setAction(async (args, hre) => {
    const { output, input, rewarder } = args;
    const chainId = await hre.getChainId();
    // 1. Load the file
    // 2. Generate the tree and proofs
    // 3. Output the merkle root file
    // 4. Output the proof mapping file

    // ---- 1. ---- //
    const data = readFileSync(input);

    const recordsRaw: Array<{ address: string; amount: string; unlocksAt: string }> = parse(data, {
      columns: true,
      skip_empty_lines: true,
    });
    const records = recordsRaw.map(e => ({
      address: e.address,
      amount: BigNumber.from(e.amount),
      unlocksAt: Number(e.unlocksAt),
    }));

    // ---- 2. ---- //
    const [tree, proofs] = constructRewardsMerkleTree(records, Number(chainId), rewarder);

    // ---- 3. ---- //
    const basePath = path.resolve(output, `${chainId.toString()}`);
    await mkdir(basePath, { recursive: true });

    const merkleRootFilePath = path.resolve(basePath, 'merkle_root.txt');
    writeFileSync(merkleRootFilePath, tree.getHexRoot());

    // ---- 4. ---- //
    const proofsAsObj: any = {};
    proofs.forEach((value, key) => {
      const uiFriendlyValues = value.map(e => ({
        ...e,
        claimData: { ...e.claimData, amount: e.claimData.amount.toString() },
      }));
      proofsAsObj[key] = uiFriendlyValues;
    });

    const merkleProofsFilePath = path.resolve(basePath, 'claim_proofs.json');
    writeFileSync(merkleProofsFilePath, JSON.stringify(proofsAsObj));
  });

export {};
