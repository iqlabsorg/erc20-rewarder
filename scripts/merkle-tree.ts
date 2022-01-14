import { MerkleTree } from 'merkletreejs';

import { isValidAddress, keccak256 } from 'ethereumjs-util';
import { solidityKeccak256 } from 'ethers/lib/utils';
import { BigNumber } from 'ethers';

export type ClaimData = {
  amountToClaim: number;
  unlocksAt: number;
};

type Address = { address: AddressStr };
type Index = { index: BigNumber };
type AddressStr = string;

export type ClaimWithAddress = ClaimData & Address;
export type ClaimWithIndex = ClaimData & Index;
export type ClaimWithAddressAndIndex = ClaimData & Address & Index;

export type ClaimInfo = {
  claimData: ClaimWithIndex;
  merkleProof: Array<string>;
};
export type ClaimProofMapping = {
  [key: AddressStr]: Array<ClaimInfo>;
};

export function constructRewardsMerkleTree(
  inputs: Array<ClaimWithAddress>,
  chainId: number,
): [MerkleTree, ClaimProofMapping] {
  // --------- validation --------- //
  {
    // Validate addresses
    for (const input of inputs) {
      if (!isValidAddress(input.address)) {
        throw Error(`${input.address} is not a valid address`);
      }
    }
  }
  // --------- Generate the indexes for each user --------- //
  const claimsWithIndex: { [key: AddressStr]: Array<ClaimWithIndex> } = {};
  for (const input of inputs) {
    if (claimsWithIndex[input.address.toLowerCase()] === undefined) {
      claimsWithIndex[input.address.toLowerCase()] = [{ ...input, index: BigNumber.from(2).pow(0) }];
    } else {
      const amountOfItems = claimsWithIndex[input.address.toLowerCase()].length;

      // NOTE: BigNumber will throw an error if we're trying to exit the 256bit range. Yes, there are tests for that.
      const index = BigNumber.from(2).pow(amountOfItems);
      claimsWithIndex[input.address.toLowerCase()].push({ ...input, index });
    }
  }

  const inputsWithIndex = Object.keys(claimsWithIndex).reduce((acc, i) => {
    const addressAware = claimsWithIndex[i].map<ClaimWithAddressAndIndex>(e => ({ ...e, address: i }));
    acc.push(...addressAware);
    return acc;
  }, [] as Array<ClaimWithAddressAndIndex>);
  const lowercaseInputs: Array<ClaimWithAddressAndIndex> = inputsWithIndex.map(e => ({
    ...e,
    address: e.address.toLowerCase(),
  }));

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

export function constructHash(claim: ClaimWithAddressAndIndex, chainId: number) {
  const hash = solidityKeccak256(
    ['address', 'uint256', 'uint256', 'uint256', 'uint256'],
    [claim.address, chainId, claim.amountToClaim, claim.unlocksAt, claim.index],
  );
  return Buffer.from(hash.slice(2), 'hex');
}

function zip<T, K>(first: Array<T>, second: Array<K>): Array<[T, K]> {
  return first.map((e, idx) => [e, second[idx]]);
}
