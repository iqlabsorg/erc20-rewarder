# ERC20 token rewarder

Created with the intent of allowing users to claim arbitrary ERC20 tokens at given time frames.

It uses Merkle Trees to enforce the claiming logic and the contract never actually needs to hold any tokens itself.


## Deployment

### Step 1 - configuring

Set necessary env variables inside your `.env` file

Notable settings:

- TOKEN_VAULT - the address that will hold the ERC20 tokens (will need to set allowance!)
- TOKEN_ADDRESS - the address of the ERC20 token


### Step 2 - contract deployment

Deploy the contracts:
```
hardhat --network [network] deploy --tags production
```

### Step 3 - data preparation

Create a csv file (e.g. `input.csv`) in format :

```csv
address,amount,unlocksAt
0x9d163f0c50742810e3ab51a9260c5c5747cf4b6d,1000000000000000000,1643666400
0x9d163f0c50742810e3ab51a9260c5c5747cf4b6d,1000000000000000000,1646085600
0x9d163f0c50742810e3ab51a9260c5c5747cf4b6d,1000000000000000000,1648760400
0x9d163f0c50742810e3ab51a9260c5c5747cf4b6d,1000000000000000000,1651352400
```

### Step 4 - generating merkle tree

Generate the merkle roots and proofs (we're using the just deployed Rewarder address):

```
npx hardhat --network bscTestnet generate-merkle-tree-output --input ./inputs.csv --output ./output --rewarder 0x9f2f77451aB50AE06B88f1857Fbeb6b414590c2C
```

### Step 5 - interaction with the contracts

- set the merkle tree on the Rewarder using etherscan
- set the allowance on the Token for the Rewarder
- enable claiming on the Rewarder using etherscan
