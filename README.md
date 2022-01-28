# ERC20 token rewarder

Deploy the contracts:
```
hardhat --network [network] deploy --tags production
```

Create a csv file (e.g. `input.csv`) in format :

```csv
address,amount,unlocksAt
0x9d163f0c50742810e3ab51a9260c5c5747cf4b6d,1000000000000000000,1643666400
0x9d163f0c50742810e3ab51a9260c5c5747cf4b6d,1000000000000000000,1646085600
0x9d163f0c50742810e3ab51a9260c5c5747cf4b6d,1000000000000000000,1648760400
0x9d163f0c50742810e3ab51a9260c5c5747cf4b6d,1000000000000000000,1651352400
```

Generate the merkle roots and proofs:

```
npx hardhat --network bscTestnet generate-merkle-tree-output --input ./inputs.csv --output ./output --rewarder 0x9f2f77451aB50AE06B88f1857Fbeb6b414590c2C
```

Set necessary env variables inside your `.env` file
