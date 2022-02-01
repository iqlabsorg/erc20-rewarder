import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import hre, { ethers } from 'hardhat';
import { Rewarder, Rewarder__factory, ERC20__factory, ERC20 } from '../../typechain';
import { impersonate, resetFork } from '../utils';

const DEPLOYER = '0x074aE4E6C427B5E9e83C12bC51e263A91C6C6bB5';
const VAULT = '0xA9dE88cCd223b1Cdb4B94C61CC9b5b3903c4aed0';
const TOKEN_ADDRESS = '0xd21d29b38374528675c34936bf7d5dd693d2a577';
const REWARDER_ADDRESS = '0xc1793d2f79C45b6564cD54DdBFb1b3fCf732238a';

const EXPECTED_MERKLE_ROOT = '0x6fd6c23162070456432b2b47efef4cae0d8f14fda8642a2b8f7d1c958078076e';

const DEPLOYMENT_BLOCK_NUMBER = 14875078;

describe('forking tests', () => {
  let token: ERC20;
  let rewarder: Rewarder;
  let deployer: SignerWithAddress;
  let vault: SignerWithAddress;

  beforeEach(async () => {
    await resetFork(hre, DEPLOYMENT_BLOCK_NUMBER);
    console.log('Block: ' + (await hre.ethers.provider.getBlockNumber()));

    await impersonate(hre, DEPLOYER);
    await impersonate(hre, VAULT);
    deployer = await ethers.getSigner(DEPLOYER);
    vault = await ethers.getSigner(VAULT);
    console.log('Chain ID', hre.network.config.chainId);
    console.log('Deployer:', deployer.address);

    rewarder = new Rewarder__factory(deployer).attach(REWARDER_ADDRESS);
    token = new ERC20__factory(vault).attach(TOKEN_ADDRESS);

    await rewarder.setMerkleRoot(EXPECTED_MERKLE_ROOT);
    await rewarder.enableClaiming();

    await hre.network.provider.send('hardhat_setBalance', [vault.address, '0x99999999999999999999']);

    {
      // Perform PRQ fund transfer to the vault
      const tmpPrqOwner = '0xfaa9721d51c49f0ca7e82203d7914c9726b5ccab';
      await impersonate(hre, tmpPrqOwner);
      await hre.network.provider.send('hardhat_setBalance', [tmpPrqOwner, '0x99999999999999999999']);
      const prqOwner = await ethers.getSigner(tmpPrqOwner);
      new ERC20__factory(prqOwner).attach(TOKEN_ADDRESS).transfer(VAULT, '356270202994929792513');
    }

    await token.increaseAllowance(rewarder.address, '356270202994929792513');
  });

  it('user claims', async () => {
    const claimer = '0xe3b5ed549b04ba386875ab5e48d169b00a7b8cfa';
    await hre.network.provider.send('hardhat_setBalance', [claimer, '0x99999999999999999999']);
    await impersonate(hre, claimer);
    const claimData = {
      amount: '356270202994929792513',
      unlocksAt: '1643673600',
    };

    const proof: Array<string> = [
      '0x3e2eb51b60ab386989ea1d9f853e3d0037dd7b91e287c9f346a9f0b0b079a5d4',
      '0xae0e5a2f7bf42982acf8b7a8db713c226d7237757a4a8cd204ac97cc042307e2',
      '0xc45ff37a95731cad5375bd8b09181e2ac725099c8959935b3cbe38973f136e09',
      '0x71869018927efd16ea7b770f6712db831f56ab23a9c83da9c41e641aea1bce8f',
      '0x1bc09b0a1a8c63670b08e626a283a05e681dcbb19536fa23a11c43d531b18cf2',
      '0xc452ce62c64a0ace67d8cc52bdbed18d07adba7c0b31c00f2492ea3e0e287241',
      '0x475c85d2988b2b4bd9db92f9f4fb205e80fa7cf24a8376f213fce0adce82dba3',
      '0x16555518bdb9cc2ae56624541dd997b3d23a4938df5e1b44e41e960e0e6d4097',
      '0x1ff8c5ceb13aa3e25648632541352ac88750d06a928888793920762c207aa039',
      '0x4cf5b97a7cd8145fd4ca4dc821ba725b13dc2d807ef5f67248cad6c249aa9e51',
      '0xf26af50476481759affe7e307a71b25bf8228e9206523fc1bd23413df7ffe9c5',
      '0xfefde8b8303653a8eeb992a8f16aaee9fb3c0ba3d8ac6d67f4f74aa80239d37f',
      '0xdbc6d7c455805882fb08fe9c887da22ea1e8b9e33e8e47e9eb2c0f8b4e3e7f43',
      '0x1b8b3067ca8b7618deab5f8c8395aa32bbca87c83ae65f9866dc66e878600c9e',
      '0x474be5f436ef88f871b56a56dec4370770b5d2588c9efe8e3cd0593db8c1e285',
    ];
    console.log('Balance:' + (await hre.ethers.provider.getBalance(claimer)));
    const claimerSigner = await ethers.getSigner(claimer);

    await expect(() => rewarder.connect(claimerSigner).claim(proof, claimData)).to.changeTokenBalance(
      token,
      claimerSigner,
      claimData.amount,
    );
  });
});
