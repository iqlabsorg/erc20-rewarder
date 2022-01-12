import { MerkleTree } from 'merkletreejs';

import { isValidAddress, keccak256 } from 'ethereumjs-util';
import { solidityKeccak256 } from 'ethers/lib/utils';

export type ClaimData = {
  amountToClaim: number;
  unlocksAt: number;
  index: number;
};

export type AddressStr = string;
export type MerkleProof = { merkleProof: Array<string> };
export type RawClaim = ClaimData & { address: AddressStr };
export type ClaimInfo = { claimData: ClaimData } & MerkleProof;
export type ClaimProofMapping = {
  [key: AddressStr]: Array<ClaimInfo>;
};

export function constructRewardsMerkleTree(inputs: Array<RawClaim>, chainId: number): [MerkleTree, ClaimProofMapping] {
  // --------- validation --------- //
  {
    // Validate addresses
    for (const input of inputs) {
      if (!isValidAddress(input.address)) {
        throw Error(`${input.address} is not a valid address`);
      }
    }

    // Validate index being unique
    const validated: { [key: string]: Array<number> } = {};
    for (const input of inputs) {
      // Validate the index itself
      if (input.index < 1 || input.index > 255) {
        throw Error(`${input.index} is invalid. it must be specified in range [1; 255]`);
      }

      // Make sure it's unique
      if (validated[input.address.toLowerCase()] === undefined) {
        validated[input.address.toLowerCase()] = [input.index];
      } else if (validated[input.address.toLowerCase()].includes(input.index)) {
        throw Error(`${input.address} has the same index (${input.index}) specified multiple times`);
      } else {
        validated[input.address.toLowerCase()].push(input.index);
      }
    }
  }

  const lowercaseInputs: Array<RawClaim> = inputs.map(e => ({ ...e, address: e.address.toLowerCase() }));

  // --------- sort the addresses --------- //
  lowercaseInputs.sort((a, b) => (a.address < b.address ? -1 : 1));

  // --------- Construct the Merkle tree --------- //
  const leaves = lowercaseInputs.map(e => constructHash(e, chainId));
  const tree = new MerkleTree(leaves, keccak256, { sort: true });

  // --------- Generate final json mapping --------- //
  const res: ClaimProofMapping = {};
  for (const zipped of zip(leaves, lowercaseInputs)) {
    const leaf = zipped[0];
    const input = zipped[1];
    const proof = tree.getHexProof(leaf);

    const item: ClaimInfo = {
      claimData: {
        amountToClaim: input.amountToClaim,
        unlocksAt: input.unlocksAt,
        index: input.index,
      },
      merkleProof: proof,
    };
    if (res[input.address] === undefined) {
      res[input.address] = [item];
    } else {
      res[input.address].push(item);
    }
  }

  // return the merkle tree, the address mapping
  return [tree, res];
}

export function constructHash(claim: RawClaim, chainId: number) {
  const hash = solidityKeccak256(
    ['address', 'uint256', 'uint256', 'uint256', 'uint256'],
    [claim.address, chainId, claim.amountToClaim, claim.unlocksAt, claim.index],
  );
  return Buffer.from(hash.slice(2), 'hex');
}

function zip<T, K>(first: Array<T>, second: Array<K>): Array<[T, K]> {
  return first.map((e, idx) => [e, second[idx]]);
}
