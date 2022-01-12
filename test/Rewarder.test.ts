import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai, { expect } from 'chai';
import { ethers, network } from 'hardhat';
import { constructRewardsMerkleTree, ClaimProofMapping, RawClaim, constructHash } from '../scripts/merkle-tree';
import { ERC20Mock, ERC20Mock__factory, Rewarder, Rewarder__factory } from '../typechain';
import chaiAsPromised from 'chai-as-promised';
import { solidity } from 'ethereum-waffle';
import { Address, bufferToHex, keccakFromString, toChecksumAddress } from 'ethereumjs-util';
import { currentBlock, currentTime, expectError, forceTime, Phases } from './utils';
import { Block } from '@ethersproject/abstract-provider';
import MerkleTree from 'merkletreejs';

// inject domain specific assertion methods
chai.use(solidity);
chai.use(chaiAsPromised);

describe('Rewarder', function () {
  let deployer: SignerWithAddress;
  let vault: SignerWithAddress;
  let chainId: number;
  let token: ERC20Mock;

  beforeEach(async () => {
    deployer = await ethers.getNamedSigner('deployer');
    vault = await ethers.getNamedSigner('vault');
    chainId = network.config.chainId!;
    token = await new ERC20Mock__factory(vault).deploy('PRQ', 'PRQ', 18, 100000000n);
  });

  it('can be deployed', async () => {
    const time = await currentTime();
    const inputs: Array<RawClaim> = [{ address: deployer.address, amountToClaim: 100000, unlocksAt: time, index: 1 }];
    const [tree] = constructRewardsMerkleTree(inputs, chainId);

    await new Rewarder__factory(deployer).deploy(tree.getHexRoot(), vault.address, token.address);
  });

  describe('Misc validation', () => {
    let rewarder: Rewarder;
    let blockBeforeDeployment: Block;
    let timeBeforeDeployment: number;
    let merkleTree: MerkleTree;
    beforeEach(async () => {
      timeBeforeDeployment = await currentTime();
      blockBeforeDeployment = await currentBlock();

      const inputs: Array<RawClaim> = [
        { address: deployer.address, amountToClaim: 100000, unlocksAt: timeBeforeDeployment, index: 1 },
      ];
      [merkleTree] = constructRewardsMerkleTree(inputs, chainId);

      rewarder = await new Rewarder__factory(deployer).deploy(merkleTree.getHexRoot(), vault.address, token.address);
    });

    it('has the correct block number', async () => {
      await expect(rewarder.getDeploymentBlockNumber()).to.eventually.equal(blockBeforeDeployment.number + 1);
    });

    it('has the correct phase after deployment', async () => {
      await expect(rewarder.getCurrentPhase()).to.eventually.equal(0);
    });

    it('has the correct token address', async () => {
      await expect(rewarder.getTokenAddress()).to.eventually.equal(token.address);
    });

    it('has the correct vault', async () => {
      await expect(rewarder.getVault()).to.eventually.equal(vault.address);
    });

    it('has the correct default claimed rewards', async () => {
      await expect(rewarder.getClaimedRewards(deployer.address)).to.eventually.equal(0n);
    });

    it('has the correct merkle root', async () => {
      await expect(rewarder.getMerkleRoot()).to.eventually.equal(merkleTree.getHexRoot());
    });

    it('performs same hashing calculation as off-chain', async () => {
      const sampleClaim = {
        amountToClaim: 21341,
        unlocksAt: 515151,
        index: 1,
      };

      const preComputedHash = bufferToHex(constructHash({ ...sampleClaim, address: deployer.address }, chainId));

      await expect(rewarder.connect(deployer).calculateHash(sampleClaim)).to.eventually.equal(preComputedHash);
    });
  });

  describe('Merkle tree gen validation', () => {
    const amountToClaim = 100;
    const unlocksAt = 100;

    it('throws when index below 1', () => {
      const inputs: Array<RawClaim> = [
        { address: deployer.address, amountToClaim, unlocksAt, index: 1 },
        { address: vault.address, amountToClaim, unlocksAt, index: 2 },
        { address: deployer.address, amountToClaim, unlocksAt, index: 0 },
      ];
      expect(() => constructRewardsMerkleTree(inputs, chainId)).to.throw(
        '0 is invalid. it must be specified in range [1; 255]',
      );
    });

    it('throws when index above 255', () => {
      const inputs: Array<RawClaim> = [
        { address: deployer.address, amountToClaim, unlocksAt, index: 1 },
        { address: vault.address, amountToClaim, unlocksAt, index: 2 },
        { address: deployer.address, amountToClaim, unlocksAt, index: 256 },
      ];
      expect(() => constructRewardsMerkleTree(inputs, chainId)).to.throw(
        '256 is invalid. it must be specified in range [1; 255]',
      );
    });

    it('throws when index repeats', () => {
      const inputs: Array<RawClaim> = [
        { address: deployer.address, amountToClaim, unlocksAt, index: 1 },
        { address: vault.address, amountToClaim, unlocksAt, index: 2 },
        { address: deployer.address, amountToClaim, unlocksAt, index: 1 },
      ];
      expect(() => constructRewardsMerkleTree(inputs, chainId)).to.throw(
        `${deployer.address} has the same index (1) specified multiple times`,
      );
    });

    it('throws on invalid address', () => {
      const invalidAddress = deployer.address.replace('0', 'z');
      const inputs: Array<RawClaim> = [
        { address: deployer.address.replace('0', 'z'), amountToClaim, unlocksAt, index: 1 },
        { address: vault.address, amountToClaim, unlocksAt, index: 2 },
      ];
      expect(() => constructRewardsMerkleTree(inputs, chainId)).to.throw(`${invalidAddress} is not a valid address`);
    });

    it('created lowercased address from checksummed ', () => {
      const deployerChecksummed = toChecksumAddress(deployer.address);
      const inputs: Array<RawClaim> = [{ address: deployerChecksummed, amountToClaim, unlocksAt, index: 1 }];
      const [, mapping] = constructRewardsMerkleTree(inputs, chainId);

      expect(mapping[deployerChecksummed]).to.equal(undefined);
      expect(mapping[deployerChecksummed.toLowerCase()]).to.not.equal(undefined);
    });
  });

  describe('Successful deployment', () => {
    const amountToClaim = 100000;

    let rewarder: Rewarder;
    let timeBeforeDeployment: number;
    let merkleTree: MerkleTree;
    let claimProofMapping: ClaimProofMapping;

    let usersThatCanClaim: Array<SignerWithAddress>;
    let inputs: Array<RawClaim>;

    const totalClaimsPerUser = 5;
    const claimDelta = 360; // seconds
    beforeEach(async () => {
      timeBeforeDeployment = await currentTime();
      usersThatCanClaim = (await ethers.getSigners()).slice(0, 5);
      inputs = [];
      for (let index = 0; index < totalClaimsPerUser; index++) {
        const claimsForUser = usersThatCanClaim.map(e => ({
          address: e.address,
          amountToClaim,
          unlocksAt: claimDelta * (index + 1) + timeBeforeDeployment,
          index: index + 1,
        }));

        inputs.push(...claimsForUser);
      }

      [merkleTree, claimProofMapping] = constructRewardsMerkleTree(inputs, chainId);

      rewarder = await new Rewarder__factory(deployer).deploy(merkleTree.getHexRoot(), vault.address, token.address);

      await token.connect(vault).increaseAllowance(rewarder.address, await token.balanceOf(vault.address));
    });

    describe('While configuring', () => {
      it('cannot claim while phase not in claiming mode', async () => {
        const claimer = usersThatCanClaim[0];
        const claim = claimProofMapping[claimer.address.toLowerCase()][0];

        await forceTime(claim.claimData.unlocksAt);
        await expectError(
          rewarder.connect(claimer).claimRewards([claim.merkleProof], [claim.claimData]),
          'InvalidContractPhase',
          [Phases.CLAIMING, Phases.CONFIGURING],
        );
      });

      it('can change merkle root', async () => {
        const newMerkleRoot = bufferToHex(keccakFromString('the new seed'));

        await rewarder.connect(deployer).setMerkleRoot(newMerkleRoot);

        await expect(rewarder.getMerkleRoot()).to.eventually.equal(newMerkleRoot);
      });

      it('can change vault', async () => {
        await rewarder.connect(deployer).setVault(deployer.address);

        await expect(rewarder.getVault()).to.eventually.equal(deployer.address);
      });

      it('can change token address', async () => {
        await rewarder.connect(deployer).setTokenAddress(ethers.constants.AddressZero);

        await expect(rewarder.getTokenAddress()).to.eventually.equal(ethers.constants.AddressZero);
      });

      it('can enable claiming', async () => {
        await rewarder.connect(deployer).enableClaiming();

        await expect(rewarder.getCurrentPhase()).to.eventually.equal(Phases.CLAIMING);
      });

      describe.only('While claiming', () => {
        beforeEach(async () => {
          await rewarder.connect(deployer).enableClaiming();
        });

        it('cannot change merkle root', async () => {
          const newMerkleRoot = bufferToHex(keccakFromString('the new seed'));

          await expectError(rewarder.connect(deployer).setMerkleRoot(newMerkleRoot), 'InvalidContractPhase', [
            Phases.CONFIGURING,
            Phases.CLAIMING,
          ]);
        });

        it('cannot change token', async () => {
          await expectError(
            rewarder.connect(deployer).setTokenAddress(ethers.constants.AddressZero),
            'InvalidContractPhase',
            [Phases.CONFIGURING, Phases.CLAIMING],
          );
        });

        it('cannot enable claiming again', async () => {
          await expectError(rewarder.connect(deployer).enableClaiming(), 'InvalidContractPhase', [
            Phases.CONFIGURING,
            Phases.CLAIMING,
          ]);
        });

        it('can still change vault', async () => {
          await rewarder.connect(deployer).setVault(deployer.address);

          await expect(rewarder.getVault()).to.eventually.equal(deployer.address);
        });

        it('can claim when timestamp has passed', async () => {
          const claimer = usersThatCanClaim[0];
          const claim = claimProofMapping[claimer.address.toLowerCase()][0];

          await forceTime(claim.claimData.unlocksAt);
          await expect(() =>
            rewarder.connect(claimer).claimRewards([claim.merkleProof], [claim.claimData]),
          ).to.changeTokenBalance(token, claimer, claim.claimData.amountToClaim);
        });

        it('can do batch claiming', async () => {
          const claimCountToUnlock = totalClaimsPerUser - 2;
          const claimer = usersThatCanClaim[0];
          const claimsToUnlock = claimProofMapping[claimer.address.toLowerCase()].slice(0, claimCountToUnlock);

          const merkleRoots = claimsToUnlock.map(e => e.merkleProof);
          const claims = claimsToUnlock.map(e => e.claimData);
          const amountToClaim = claims.map(e => e.amountToClaim).reduce((acc, i) => acc + i);
          const lastClaimUnlockTime = claims.map(e => e.unlocksAt).reduce((acc, i) => (i > acc ? i : acc));
          await forceTime(lastClaimUnlockTime);

          await expect(() => rewarder.connect(claimer).claimRewards(merkleRoots, claims)).to.changeTokenBalance(
            token,
            claimer,
            amountToClaim,
          );
        });

        it('cannot claim when timestamp not passed', async () => {
          const claimer = usersThatCanClaim[0];
          const claim = claimProofMapping[claimer.address.toLowerCase()][0];
          const ts = await currentTime();

          await expectError(
            rewarder.connect(claimer).claimRewards([claim.merkleProof], [claim.claimData]),
            'ClaimNotYetUnlocked',
            [[claim.claimData.amountToClaim, claim.claimData.unlocksAt, claim.claimData.index], ts],
          );
        });

        it('cannot do batch claiming when one claim is not yet unlocked', async () => {
          const claimCountToUnlock = totalClaimsPerUser;
          const claimer = usersThatCanClaim[0];
          const claimsToUnlock = claimProofMapping[claimer.address.toLowerCase()].slice(0, claimCountToUnlock);

          const merkleRoots = claimsToUnlock.map(e => e.merkleProof);
          const claims = claimsToUnlock.map(e => e.claimData);
          const amountToClaim = claims.map(e => e.amountToClaim).reduce((acc, i) => acc + i);
          const previousToLastClaimUnlockTime = claims[totalClaimsPerUser - 2];

          await expectError(rewarder.connect(claimer).claimRewards(merkleRoots, claims), 'E', []);
        });

        it('cannot claim the same reward multiple times');

        it('cannot claim reward for other players');

        it('all users can claim rewards');

        it('reverts work with invalid merkle proof');
      });

      describe('ACL', () => {
        it('average user cannot change merkle root');

        it('average user cannot change token');

        it('average user cannot change vault');

        it('average user cannot enable claiming');
      });
    });
  });
});
