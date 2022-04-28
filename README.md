# ERC20 token rewarder

Created with the intent of allowing users to claim arbitrary ERC20 tokens at given time frames.

It uses Merkle Trees to enforce the claiming logic and the contract never actually needs to hold any tokens itself.


## Deployment

### Step 1 - configuring

Set necessary env variables inside your `.env` file

### Step 2 - data preparation

Create a csv file (e.g. `input.csv`) in format :

```csv
address,amount,unlocksAt
0x9d163f0c50742810e3ab51a9260c5c5747cf4b6d,1000000000000000000,1643666400
0x9d163f0c50742810e3ab51a9260c5c5747cf4b6d,1000000000000000000,1646085600
0x9d163f0c50742810e3ab51a9260c5c5747cf4b6d,1000000000000000000,1648760400
0x9d163f0c50742810e3ab51a9260c5c5747cf4b6d,1000000000000000000,1651352400
```

### Step 3 - generating merkle tree

Generate the merkle roots and proofs (we're using the just deployed Rewarder address):

Notable settings:

- `token-vault` - the address that will hold the ERC20 tokens (will need to set allowance!)
- `token-address` - the address of the ERC20 token

```
yarn hardhat --network [network] deploy-rewarder --input ./inputs/may-1-airdrop-test.csv --output ./output --token-vault 0xE6747a55c7d6ce24064Ea1CA3ddB76dcCdFbBaBc --token-address 0xb0AB0255561ECFaC53c6065B29BBcBD88A521A32
```

### Step 4 - interaction with the ERC20 token contract

- set the allowance on the Token for the Rewarder - token.approve(rewarder.address, 1000_000000000000000000)
