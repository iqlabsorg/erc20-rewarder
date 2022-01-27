import { MerkleTree } from 'merkletreejs';

import { isValidAddress, keccak256 } from 'ethereumjs-util';
import { solidityKeccak256 } from 'ethers/lib/utils';
import { BigNumber } from 'ethers';

export type ClaimData = {
  amount: BigNumber;
  unlocksAt: number;
};

type Address = { address: string };

export type ClaimWithAddress = ClaimData & Address;

export type ClaimInfo = {
  claimData: ClaimData;
  merkleProof: Array<string>;
};
export type ClaimProofMapping = Map<string, Array<ClaimInfo>>;

export function constructRewardsMerkleTree(
  inputs: Array<ClaimWithAddress>,
  chainId: number,
  rewarderAddress: string,
): [MerkleTree, ClaimProofMapping] {
  // --------- validation --------- //
  throwIfInvalidAddress(inputs);
  throwIfUnlockPeriodsRepeatPerUser(inputs);
  if (!isValidAddress(rewarderAddress)) {
    throw Error(`Invalid tokenAddress! ${rewarderAddress}`);
  }

  // --------- Generate the increasing claim amount --------- //
  // 0. Store all addresses in lower case
  // 1. Create a mapping Map<Address, Array<Claim>>
  // 2. For each mapping entry: sort by time in increasing order
  // 3. For each mapping entry: rollover the amount from the previous entry to the next one
  // 4. For each mapping entry: For each entry: create merkle hash, store with the [i] object
  // 5. Flatten out all hashes, construct merkle tree
  // 6. For each mapping entry: For each entry: fetch merkle proof, store with the [i] object, drop "address" from claim object

  // ---- 0 ---- //
  const lowercasedInputs = inputs.map(e => ({ ...e, address: e.address.toLowerCase() }));

  // ---- 1 ---- //
  const claims = new Map<string, Array<ClaimWithAddress>>();
  for (const input of lowercasedInputs) {
    const currentlyStored = claims.get(input.address);
    if (currentlyStored === undefined) {
      claims.set(input.address, [input]);
    } else {
      currentlyStored.push(input);
    }
  }

  // ---- 2 ---- //
  for (const input of claims.keys()) {
    const currentlyStored = claims.get(input)!;
    currentlyStored.sort();
  }
  // ---- 3 ---- //
  for (const input of claims.keys()) {
    const items = claims.get(input)!;
    const updatedInputs = items.reduce(
      (acc, i, idx) => {
        const altered = { ...i, amount: i.amount.add(acc.rollover) };
        acc.newItems.push(altered);
        acc.rollover = altered.amount;
        return acc;
      },
      {
        newItems: [] as Array<ClaimWithAddress>,
        rollover: BigNumber.from(0),
      },
    ).newItems;

    claims.set(input, updatedInputs);
  }

  // ---- 4 ---- //
  const claimsWithHashes = new Map<string, Array<ClaimWithAddress & { hash: Buffer }>>();
  const allHashes: Array<Buffer> = [];
  for (const input of claims.keys()) {
    const items = claims.get(input)!.map(e => ({
      ...e,
      hash: constructHash(rewarderAddress, e.address, BigNumber.from(e.amount), e.unlocksAt, chainId),
    }));
    claimsWithHashes.set(input, items);
    allHashes.push(...items.map(e => e.hash));
  }

  // ---- 5 ---- //
  const tree = new MerkleTree(allHashes, keccak256, { sort: true });

  // ---- 6 ---- //
  const claimsWithProofs = new Map<string, Array<ClaimInfo>>();
  for (const input of claims.keys()) {
    const items: Array<ClaimInfo> = claimsWithHashes.get(input)!.map(e => ({
      merkleProof: tree.getHexProof(e.hash),
      claimData: {
        amount: e.amount,
        unlocksAt: e.unlocksAt,
      },
    }));
    claimsWithProofs.set(input, items);
  }

  // return the merkle tree, the address mapping
  return [tree, claimsWithProofs];
}

export function constructHash(
  rewarderAddress: string,
  address: string,
  amount: BigNumber,
  unlocksAt: number,
  chainId: number,
) {
  const hash = solidityKeccak256(
    ['address', 'address', 'uint256', 'uint256', 'uint256'],
    [rewarderAddress, address, chainId, amount, unlocksAt],
  );
  return Buffer.from(hash.slice(2), 'hex');
}

function throwIfInvalidAddress(inputs: Array<ClaimWithAddress>) {
  for (const input of inputs) {
    if (!isValidAddress(input.address)) {
      throw Error(`${input.address} is not a valid address`);
    }
  }
}

function throwIfUnlockPeriodsRepeatPerUser(inputs: Array<ClaimWithAddress>) {
  const unlockPeriods = new Map<string, Set<number>>();
  for (const input of inputs) {
    const currentlyStored = unlockPeriods.get(input.address.toLowerCase());
    if (currentlyStored === undefined) {
      const set = new Set<number>();
      const newSet = set.add(input.unlocksAt);
      unlockPeriods.set(input.address.toLowerCase(), newSet);
    } else {
      if (currentlyStored.has(input.unlocksAt)) {
        throw Error(`Duplicate unlock period for user ${input.address}; offending period: ${input.unlocksAt}!`);
      }
      const newSet = currentlyStored.add(input.unlocksAt);
      unlockPeriods.set(input.address.toLowerCase(), newSet);
    }
  }
}
