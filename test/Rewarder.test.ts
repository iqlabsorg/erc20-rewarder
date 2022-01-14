import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai, { expect } from 'chai';
import { ethers, network } from 'hardhat';
import {
  constructRewardsMerkleTree,
  ClaimProofMapping,
  ClaimWithAddressAndIndex,
  constructHash,
  ClaimWithAddress,
} from '../scripts/merkle-tree';
import { ERC20Mock, ERC20Mock__factory, Rewarder, Rewarder__factory } from '../typechain';
import chaiAsPromised from 'chai-as-promised';
import { solidity } from 'ethereum-waffle';
import { bufferToHex, keccakFromString, toChecksumAddress } from 'ethereumjs-util';
import { currentBlock, currentTime, expectError, forceNextTime, Phases } from './utils';
import { Block } from '@ethersproject/abstract-provider';
import MerkleTree from 'merkletreejs';
import { BigNumber } from 'ethers';

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
    const inputs: Array<ClaimWithAddressAndIndex> = [
      { address: deployer.address, amountToClaim: 100000, unlocksAt: time, index: BigNumber.from(1) },
    ];
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

      const inputs: Array<ClaimWithAddressAndIndex> = [
        { address: deployer.address, amountToClaim: 100000, unlocksAt: timeBeforeDeployment, index: BigNumber.from(1) },
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
        index: BigNumber.from(1),
      };

      const preComputedHash = bufferToHex(constructHash({ ...sampleClaim, address: deployer.address }, chainId));

      await expect(rewarder.connect(deployer).calculateHash(sampleClaim)).to.eventually.equal(preComputedHash);
    });
  });

  describe('Merkle tree gen validation', () => {
    const amountToClaim = 100;
    const unlocksAt = 100;

    it('throws when input more than 256 entries', () => {
      const inputs: Array<ClaimWithAddress> = [];
      for (const address of [deployer.address, vault.address]) {
        for (let index = 1; index <= 257; index++) {
          inputs.push({ address, amountToClaim, unlocksAt });
        }
      }

      expect(() => constructRewardsMerkleTree(inputs, chainId)).to.throw('value out of range');
    });

    it('does not throw when input equal to 256 entries', () => {
      const inputs: Array<ClaimWithAddress> = [];
      for (const address of [deployer.address, vault.address]) {
        for (let index = 1; index <= 256; index++) {
          inputs.push({ address, amountToClaim, unlocksAt });
        }
      }

      expect(() => constructRewardsMerkleTree(inputs, chainId)).to.not.throw();
    });

    it('makes all indexes unique', () => {
      const inputs: Array<ClaimWithAddress> = [];
      const claimsPerUser = 256;
      for (const address of [deployer.address, vault.address]) {
        for (let index = 1; index <= 256; index++) {
          inputs.push({ address, amountToClaim, unlocksAt });
        }
      }

      const [, mapping] = constructRewardsMerkleTree(inputs, chainId);

      for (const address of [deployer.address, vault.address]) {
        const rewards = mapping[address.toLowerCase()];
        expect(rewards.length).to.equal(claimsPerUser);

        const indexSet = new Set(rewards.map(e => e.claimData.index.toString()));
        expect(indexSet.size).to.equal(claimsPerUser);
      }
    });

    it('throws on invalid address', () => {
      const invalidAddress = deployer.address.replace('0', 'z');
      const inputs: Array<ClaimWithAddress> = [
        { address: deployer.address.replace('0', 'z'), amountToClaim, unlocksAt },
        { address: vault.address, amountToClaim, unlocksAt },
      ];
      expect(() => constructRewardsMerkleTree(inputs, chainId)).to.throw(`${invalidAddress} is not a valid address`);
    });

    it('creates lowercased address from checksummed one', () => {
      const deployerChecksummed = toChecksumAddress(deployer.address);
      const inputs: Array<ClaimWithAddress> = [{ address: deployerChecksummed, amountToClaim, unlocksAt }];
      const [, mapping] = constructRewardsMerkleTree(inputs, chainId);

      expect(mapping[deployerChecksummed]).to.equal(undefined);
      expect(mapping[deployerChecksummed.toLowerCase()]).to.not.equal(undefined);
    });
  });

  describe('When successful deployment', () => {
    const amountToClaim = 100000;

    let rewarder: Rewarder;
    let timeBeforeDeployment: number;
    let merkleTree: MerkleTree;
    let claimProofMapping: ClaimProofMapping;

    let usersThatCanClaim: Array<SignerWithAddress>;
    let inputs: Array<ClaimWithAddress>;

    const totalClaimsPerUser = 5;
    const claimDelta = 3600; // seconds
    beforeEach(async () => {
      timeBeforeDeployment = await currentTime();
      usersThatCanClaim = (await ethers.getSigners()).slice(0, 5);
      inputs = [];
      for (let index = 0; index < totalClaimsPerUser; index++) {
        const claimsForUser = usersThatCanClaim.map(e => ({
          address: e.address,
          amountToClaim,
          unlocksAt: claimDelta * (index + 1) + timeBeforeDeployment,
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

        await forceNextTime(claim.claimData.unlocksAt);
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

      describe('While claiming', () => {
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

          await forceNextTime(claim.claimData.unlocksAt);
          await expect(() =>
            rewarder.connect(claimer).claimRewards([claim.merkleProof], [claim.claimData]),
          ).to.changeTokenBalance(token, claimer, claim.claimData.amountToClaim);
        });

        it('can do batch claiming', async () => {
          const claimCountToUnlock = totalClaimsPerUser - 2;
          const claimer = usersThatCanClaim[0];
          const claimsToUnlock = claimProofMapping[claimer.address.toLowerCase()].slice(0, claimCountToUnlock);

          const merkleProofs = claimsToUnlock.map(e => e.merkleProof);
          const claims = claimsToUnlock.map(e => e.claimData);
          const amountToClaim = claims.map(e => e.amountToClaim).reduce((acc, i) => acc + i);
          const lastClaimUnlockTime = claims.map(e => e.unlocksAt).reduce((acc, i) => (i > acc ? i : acc));
          await forceNextTime(lastClaimUnlockTime);

          await expect(() => rewarder.connect(claimer).claimRewards(merkleProofs, claims)).to.changeTokenBalance(
            token,
            claimer,
            amountToClaim,
          );
        });

        it('cannot claim when timestamp not passed', async () => {
          // Force the unlock time to match the very first available claim
          //  but try to claim the lhe last claim (that's not yet unlocked)
          const claimer = usersThatCanClaim[0];
          const claimFirst = claimProofMapping[claimer.address.toLowerCase()][0];
          const claimLast = claimProofMapping[claimer.address.toLowerCase()][totalClaimsPerUser - 1];
          const claimData = claimLast.claimData;
          await forceNextTime(claimFirst.claimData.unlocksAt);

          await expectError(
            rewarder.connect(claimer).claimRewards([claimLast.merkleProof], [claimLast.claimData]),
            'ClaimNotYetUnlocked',
            [
              [claimData.amountToClaim, claimData.unlocksAt, claimData.index.toNumber()],
              claimFirst.claimData.unlocksAt,
            ],
          );
        });

        it('cannot do batch claiming when one reward is not yet unlocked', async () => {
          const claimer = usersThatCanClaim[0];
          const claimsToUnlock = claimProofMapping[claimer.address.toLowerCase()];

          const merkleProofs = claimsToUnlock.map(e => e.merkleProof);
          const claims = claimsToUnlock.map(e => e.claimData);
          const previousToLastClaimUnlockTime = claims[totalClaimsPerUser - 2];
          await forceNextTime(previousToLastClaimUnlockTime.unlocksAt);

          const lastClaim = claims[totalClaimsPerUser - 1];
          await expectError(rewarder.connect(claimer).claimRewards(merkleProofs, claims), 'ClaimNotYetUnlocked', [
            [lastClaim.amountToClaim, lastClaim.unlocksAt, lastClaim.index.toNumber()],
            previousToLastClaimUnlockTime.unlocksAt,
          ]);
        });

        it('cannot claim the same reward multiple times', async () => {
          const claimer = usersThatCanClaim[0];
          const claim = claimProofMapping[claimer.address.toLowerCase()][0];
          await forceNextTime(claim.claimData.unlocksAt);

          // claim once
          await rewarder.connect(claimer).claimRewards([claim.merkleProof], [claim.claimData]);

          // try claiming the second time
          await expectError(
            rewarder.connect(claimer).claimRewards([claim.merkleProof], [claim.claimData]),
            'AlreadyClaimed',
            [[claim.claimData.amountToClaim, claim.claimData.unlocksAt, claim.claimData.index.toNumber()]],
          );
        });

        it('cannot claim reward for other players', async () => {
          const maliciousClaimer = usersThatCanClaim[0];
          const otherClaimer = usersThatCanClaim[1];

          // Get claim for the `otherClaimer`
          const claim = claimProofMapping[otherClaimer.address.toLowerCase()][0];
          await forceNextTime(claim.claimData.unlocksAt);

          // send claim tx from `maliciousClaimer`
          await expectError(
            rewarder.connect(maliciousClaimer).claimRewards([claim.merkleProof], [claim.claimData]),
            'InvalidMerkleProof',
          );
        });

        it('all users can claim rewards', async () => {
          for (let claimIndex = 0; claimIndex < totalClaimsPerUser; claimIndex++) {
            for (let index = 0; index < usersThatCanClaim.length; index++) {
              const claimer = usersThatCanClaim[index];
              const claim = claimProofMapping[claimer.address.toLowerCase()][claimIndex];
              await forceNextTime(claim.claimData.unlocksAt);

              const tx = await rewarder.connect(claimer).claimRewards([claim.merkleProof], [claim.claimData]);
              // Tokens have been transferred
              await expect(tx)
                .to.emit(token, 'Transfer')
                .withArgs(vault.address, claimer.address, claim.claimData.amountToClaim);

              // Cannot claim the second time
              await expectError(
                rewarder.connect(claimer).claimRewards([claim.merkleProof], [claim.claimData]),
                'AlreadyClaimed',
                [[claim.claimData.amountToClaim, claim.claimData.unlocksAt, claim.claimData.index.toNumber()]],
              );
            }
          }
        });
      });

      describe('ACL', () => {
        let regularUser: SignerWithAddress;

        before(async () => {
          regularUser = await ethers.getNamedSigner('regularUser');
        });

        it('make sure that average user cannot change merkle root', async () => {
          const newMerkleRoot = bufferToHex(keccakFromString('the new seed'));

          await expect(rewarder.connect(regularUser).setMerkleRoot(newMerkleRoot)).to.be.revertedWith(
            'Ownable: caller is not the owner',
          );
        });

        it('make sure that average user cannot change token', async () => {
          await expect(rewarder.connect(regularUser).setTokenAddress(regularUser.address)).to.be.revertedWith(
            'Ownable: caller is not the owner',
          );
        });

        it('make sure that average user cannot change vault', async () => {
          await expect(rewarder.connect(regularUser).setVault(regularUser.address)).to.be.revertedWith(
            'Ownable: caller is not the owner',
          );
        });

        it('make sure that average user cannot enable claiming', async () => {
          await expect(rewarder.connect(regularUser).enableClaiming()).to.be.revertedWith(
            'Ownable: caller is not the owner',
          );
        });
      });
    });
  });
});
