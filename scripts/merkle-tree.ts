import { MerkleTree } from 'merkletreejs';

import { Address, keccak256 } from 'ethereumjs-util';
import { solidityKeccak256 } from 'ethers/lib/utils';

export type ClaimData = {
  amountToClaim: number;
  unlocksAt: number;
  index: number;
};

export type AddressStr = string;
export type MerkleProof = { merkleProof: Array<string> };
export type RawClaim = ClaimData & { address: Address };

export type FinalWhitelistProofMapping = {
  [key: AddressStr]: Array<ClaimData & MerkleProof>;
};

export function constructRewardsMerkleTree(
  inputs: Array<RawClaim>,
  chainId: number,
): [MerkleTree, FinalWhitelistProofMapping] {
  // --------- sort the addresses --------- //
  inputs.sort((a, b) => (a.address < b.address ? -1 : 1));

  // --------- Construct the Merkle tree --------- //
  const leaves = inputs.map(e => constructHash(e, chainId));
  const tree = new MerkleTree(leaves, keccak256, { sort: true });

  // --------- Generate final json mapping --------- //
  const res: FinalWhitelistProofMapping = {};
  for (const [_leaf, _input] of [leaves, inputs]) {
    const leaf = _leaf as unknown as Buffer;
    const input = _input as unknown as RawClaim;
    const proof = tree.getHexProof(leaf);

    const address = input.address.toString();
    const item: ClaimData & MerkleProof = {
      merkleProof: proof,
      amountToClaim: input.amountToClaim,
      unlocksAt: input.unlocksAt,
      index: input.index,
    };
    if (res[address] === undefined) {
      res[address] = [item];
    } else {
      res[address].push(item);
    }
  }

  // return the merkle tree, the address mapping
  return [tree, res];
}

function constructHash(claim: RawClaim, chainId: number) {
  const hash = solidityKeccak256(
    ['address', 'uint256', 'uint256', 'uint256', 'uint256'],
    [claim.address, chainId, claim.amountToClaim, claim.unlocksAt, claim.index],
  );
  return Buffer.from(hash.slice(2), 'hex');
}
