import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai, { expect } from 'chai';
import { ethers, network } from 'hardhat';
import { constructRewardsMerkleTree, ClaimProofMapping, constructHash, ClaimWithAddress } from '../scripts/merkle-tree';
import { ERC20Mock, ERC20Mock__factory, HasherExposer__factory, Rewarder, Rewarder__factory } from '../typechain';
import chaiAsPromised from 'chai-as-promised';
import { solidity } from 'ethereum-waffle';
import { bufferToHex, keccakFromString, toChecksumAddress } from 'ethereumjs-util';
import { currentBlock, currentTime, expectError, forceNextTime, Phases } from './utils';
import { Block } from '@ethersproject/abstract-provider';
import MerkleTree from 'merkletreejs';
import { BigNumber } from 'ethers';
import { parseEther } from 'ethers/lib/utils';

// inject domain specific assertion methods
chai.use(solidity);
chai.use(chaiAsPromised);

describe('Rewarder', function () {
  let deployer: SignerWithAddress;
  let stranger1: SignerWithAddress;
  let stranger2: SignerWithAddress;
  let vault: SignerWithAddress;
  let chainId: number;
  let token: ERC20Mock;

  beforeEach(async () => {
    deployer = await ethers.getNamedSigner('deployer');
    vault = await ethers.getNamedSigner('vault');
    [stranger1, stranger2] = await ethers.getUnnamedSigners();
    chainId = network.config.chainId!;
    token = await new ERC20Mock__factory(vault).deploy('PRQ', 'PRQ', 18, parseEther('1000000000000000000'));
  });

  it('can be deployed', async () => {
    await new Rewarder__factory(deployer).deploy(vault.address, token.address);
  });

  describe('Misc validation', () => {
    let rewarder: Rewarder;
    let blockBeforeDeployment: Block;
    let timeBeforeDeployment: number;
    let merkleTree: MerkleTree;
    beforeEach(async () => {
      timeBeforeDeployment = await currentTime();
      blockBeforeDeployment = await currentBlock();

      const inputs: Array<ClaimWithAddress> = [
        {
          address: stranger1.address,
          amount: BigNumber.from(100000),
          unlocksAt: timeBeforeDeployment,
        },
      ];

      rewarder = await new Rewarder__factory(deployer).deploy(vault.address, token.address);
      [merkleTree] = constructRewardsMerkleTree(inputs, chainId, rewarder.address);
    });

    it('has the correct block number', async () => {
      await expect(rewarder.getDeploymentBlockNumber()).to.eventually.equal(blockBeforeDeployment.number + 1);
    });

    it('has the correct phase after deployment', async () => {
      await expect(rewarder.isClaimingEnabled()).to.eventually.equal(false);
    });

    it('has the correct token address', async () => {
      await expect(rewarder.getToken()).to.eventually.equal(token.address);
    });

    it('has the correct vault', async () => {
      await expect(rewarder.getVault()).to.eventually.equal(vault.address);
    });

    it('has the correct default claimed rewards', async () => {
      await expect(rewarder.getCurrentlyClaimedAmount(stranger1.address)).to.eventually.equal(0n);
    });

    it('has the correct merkle root', async () => {
      await expect(rewarder.getMerkleRoot()).to.eventually.equal(
        '0x0000000000000000000000000000000000000000000000000000000000000000',
      );
    });

    it('performs same hashing calculation as off-chain', async () => {
      const hashExposer = await new HasherExposer__factory(stranger1).deploy(vault.address, token.address);
      const sampleClaim = {
        amount: BigNumber.from(21341),
        unlocksAt: 515151,
      };

      const preComputedHash = bufferToHex(
        constructHash(hashExposer.address, deployer.address, sampleClaim.amount, sampleClaim.unlocksAt, chainId),
      );

      await expect(hashExposer.connect(deployer).calculateHash(sampleClaim)).to.eventually.equal(preComputedHash);
    });
  });

  describe('Merkle tree gen validation', () => {
    const amount = parseEther('100');
    const unlocksAt = 100;

    it('throws unlock time does not change', () => {
      const inputs: Array<ClaimWithAddress> = [];
      const claimAmount = 4;
      for (let index = 0; index < claimAmount; index++) {
        inputs.push({ address: deployer.address, amount, unlocksAt });
      }

      expect(() => constructRewardsMerkleTree(inputs, chainId, token.address)).to.throw(
        'Duplicate unlock period for user',
      );
    });

    it('makes all subsequent claims larger than the previous one', () => {
      const inputs: Array<ClaimWithAddress> = [];
      const claimsPerUser = 3;
      const toGenerateFor = [deployer.address, vault.address];
      for (const address of toGenerateFor) {
        for (let index = 0; index < claimsPerUser; index++) {
          inputs.push({ address, amount, unlocksAt: unlocksAt * (index + 1) });
        }
      }

      const [, mapping] = constructRewardsMerkleTree(inputs, chainId, token.address);
      for (const address of toGenerateFor) {
        const items = mapping.get(address.toLowerCase())!;

        // Assert valid unlock periods
        expect(items[0].claimData.unlocksAt).to.equal(unlocksAt * 1);
        expect(items[1].claimData.unlocksAt).to.equal(unlocksAt * 2);
        expect(items[2].claimData.unlocksAt).to.equal(unlocksAt * 3);

        // Assert valid amounts
        expect(items[0].claimData.amount).to.equal(amount.mul(1));
        expect(items[1].claimData.amount).to.equal(amount.mul(2));
        expect(items[2].claimData.amount).to.equal(amount.mul(3));
      }
    });

    it('throws on invalid address', () => {
      const invalidAddress = deployer.address.replace('0', 'z');
      const inputs: Array<ClaimWithAddress> = [
        { address: invalidAddress, amount, unlocksAt },
        { address: vault.address, amount, unlocksAt: unlocksAt + 1 },
      ];
      expect(() => constructRewardsMerkleTree(inputs, chainId, token.address)).to.throw(
        `${invalidAddress} is not a valid address`,
      );
    });

    it('throws on invalid rewarder address', () => {
      const invalidRewarderAddress = stranger1.address.replace('0', 'z');
      const inputs: Array<ClaimWithAddress> = [
        { address: deployer.address, amount, unlocksAt },
        { address: vault.address, amount, unlocksAt: unlocksAt + 1 },
      ];
      expect(() => constructRewardsMerkleTree(inputs, chainId, invalidRewarderAddress)).to.throw(
        `Invalid tokenAddress! ${invalidRewarderAddress}`,
      );
    });

    it('creates lowercased address from checksummed one', () => {
      const deployerChecksummed = toChecksumAddress(deployer.address);
      const inputs: Array<ClaimWithAddress> = [{ address: deployerChecksummed, amount, unlocksAt }];
      const [, mapping] = constructRewardsMerkleTree(inputs, chainId, token.address);

      expect(mapping.get(deployerChecksummed)).to.equal(undefined);
      expect(mapping.get(deployerChecksummed.toLowerCase())).to.not.equal(undefined);
    });
  });

  describe('When successful deployment', () => {
    const amount = parseEther('1');

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
          amount,
          unlocksAt: claimDelta * (index + 1) + timeBeforeDeployment,
        }));

        inputs.push(...claimsForUser);
      }

      rewarder = await new Rewarder__factory(deployer).deploy(vault.address, token.address);

      [merkleTree, claimProofMapping] = constructRewardsMerkleTree(inputs, chainId, rewarder.address);

      await token.connect(vault).increaseAllowance(rewarder.address, await token.balanceOf(vault.address));
    });

    describe('While configuring', () => {
      it('cannot claim while phase not in claiming mode', async () => {
        const claimer = usersThatCanClaim[0];
        const claim = claimProofMapping.get(claimer.address.toLowerCase())![0];

        await forceNextTime(claim.claimData.unlocksAt);
        await expect(rewarder.connect(claimer).claim(claim.merkleProof, claim.claimData)).to.be.revertedWithError(
          'ClaimingNotYetEnabled',
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

      it('can enable claiming after setting merkle root', async () => {
        await rewarder.connect(deployer).setMerkleRoot(merkleTree.getHexRoot());
        await rewarder.connect(deployer).enableClaiming();

        await expect(rewarder.isClaimingEnabled()).to.eventually.equal(true);
      });

      it('cannot enable claiming without setting merkle root', async () => {
        await expect(rewarder.connect(deployer).enableClaiming()).to.be.revertedWith(
          'Cannot enable claiming while merkle root not set!',
        );
      });

      describe('While claiming', () => {
        beforeEach(async () => {
          await rewarder.connect(deployer).setMerkleRoot(merkleTree.getHexRoot());
          await rewarder.connect(deployer).enableClaiming();
        });

        it('cannot change merkle root', async () => {
          const newMerkleRoot = bufferToHex(keccakFromString('the new seed'));

          await expect(rewarder.connect(deployer).setMerkleRoot(newMerkleRoot)).to.be.revertedWithError(
            'ClaimingAlreadyEnabled',
          );
        });

        it('cannot enable claiming again', async () => {
          await expect(rewarder.connect(deployer).enableClaiming()).to.be.revertedWithError('ClaimingAlreadyEnabled');
        });

        it('can still change vault', async () => {
          await rewarder.connect(deployer).setVault(deployer.address);

          await expect(rewarder.getVault()).to.eventually.equal(deployer.address);
        });

        it('can claim when timestamp has passed', async () => {
          const claimer = usersThatCanClaim[0];
          const claim = claimProofMapping.get(claimer.address.toLowerCase())![0];

          await forceNextTime(claim.claimData.unlocksAt);
          await expect(() => rewarder.connect(claimer).claim(claim.merkleProof, claim.claimData)).to.changeTokenBalance(
            token,
            claimer,
            claim.claimData.amount,
          );
        });

        it('cannot claim when timestamp not passed', async () => {
          // Force the unlock time to match the very first available claim
          //  but try to claim the lhe last claim (that's not yet unlocked)
          const claimer = usersThatCanClaim[0];
          const claimFirst = claimProofMapping.get(claimer.address.toLowerCase())![0];
          const claimLast = claimProofMapping.get(claimer.address.toLowerCase())![totalClaimsPerUser - 1];
          const claimData = claimLast.claimData;
          await forceNextTime(claimFirst.claimData.unlocksAt);

          await expectError(
            rewarder.connect(claimer).claim(claimLast.merkleProof, claimLast.claimData),
            'ClaimNotYetUnlocked',
            [[claimData.amount.toBigInt(), claimData.unlocksAt]],
          );
        });

        it('cannot claim the same reward multiple times', async () => {
          const claimer = usersThatCanClaim[0];
          const claim = claimProofMapping.get(claimer.address.toLowerCase())![0];
          await forceNextTime(claim.claimData.unlocksAt);

          // claim once
          await rewarder.connect(claimer).claim(claim.merkleProof, claim.claimData);

          // try claiming the second time
          await expectError(rewarder.connect(claimer).claim(claim.merkleProof, claim.claimData), 'NothingToClaim');
        });

        it('cannot claim reward for other players', async () => {
          const maliciousClaimer = usersThatCanClaim[0];
          const otherClaimer = usersThatCanClaim[1];

          // Get claim for the `otherClaimer`
          const claim = claimProofMapping.get(otherClaimer.address.toLowerCase())![0];
          await forceNextTime(claim.claimData.unlocksAt);

          // send claim tx from `maliciousClaimer`
          await expectError(
            rewarder.connect(maliciousClaimer).claim(claim.merkleProof, claim.claimData),
            'InvalidMerkleProof',
          );
        });

        it('all users can claim rewards', async () => {
          for (let claimIndex = 0; claimIndex < totalClaimsPerUser; claimIndex++) {
            for (let index = 0; index < usersThatCanClaim.length; index++) {
              const claimer = usersThatCanClaim[index];
              const claim = claimProofMapping.get(claimer.address.toLowerCase())![claimIndex];
              await forceNextTime(claim.claimData.unlocksAt);

              const tx = await rewarder.connect(claimer).claim(claim.merkleProof, claim.claimData);
              // Tokens have been transferred
              await expect(tx).to.emit(token, 'Transfer').withArgs(vault.address, claimer.address, amount);

              // Cannot claim the second time
              await expectError(rewarder.connect(claimer).claim(claim.merkleProof, claim.claimData), 'NothingToClaim');
            }
          }
        });

        it('cannot claim past claims if recent one already claimed', async () => {
          const claimer = usersThatCanClaim[0];
          const claimLast = claimProofMapping.get(claimer.address.toLowerCase())![totalClaimsPerUser - 1];
          await forceNextTime(claimLast.claimData.unlocksAt);
          await rewarder.connect(claimer).claim(claimLast.merkleProof, claimLast.claimData);

          const claimFirst = claimProofMapping.get(claimer.address.toLowerCase())![0];

          await expectError(
            rewarder.connect(claimer).claim(claimFirst.merkleProof, claimFirst.claimData),
            'NothingToClaim',
          );
        });
      });

      describe('ACL', () => {
        let regularUser: SignerWithAddress;

        before(async () => {
          [regularUser] = await ethers.getUnnamedSigners();
        });

        it('make sure that average user cannot change merkle root', async () => {
          const newMerkleRoot = bufferToHex(keccakFromString('the new seed'));

          await expect(rewarder.connect(regularUser).setMerkleRoot(newMerkleRoot)).to.be.revertedWith(
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
