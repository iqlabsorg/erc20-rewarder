# ERC20 token rewarder

## 1.
Set necessary env variables inside your `.env` file


## 2.
Deploy the contracts:
```
hardhat --network [network] deploy --tags production
```

## 3.
Create a csv file (e.g. `input.csv`) in format :

```csv
address,amount,unlocksAt
0x9d163f0c50742810e3ab51a9260c5c5747cf4b6d,1000000000000000000,1643666400
0x9d163f0c50742810e3ab51a9260c5c5747cf4b6d,1000000000000000000,1646085600
0x9d163f0c50742810e3ab51a9260c5c5747cf4b6d,1000000000000000000,1648760400
0x9d163f0c50742810e3ab51a9260c5c5747cf4b6d,1000000000000000000,1651352400
```

## 4.
Generate the merkle roots and proofs:

```
npx hardhat --network bscTestnet generate-merkle-tree-output --input ./inputs.csv --output ./output --rewarder 0x9f2f77451aB50AE06B88f1857Fbeb6b414590c2C
```

## 5.

- set the merkle tree on the Rewarder using etherscan
- set the allowance on the Token for the Rewarder
- enable claiming on the Rewarder using etherscan
