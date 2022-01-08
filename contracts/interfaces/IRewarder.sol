// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

import "./IBlockAware.sol";

interface IRewarder is IBlockAware {
    // ------------- Types ------------- //
    enum Phase {
        CONFIGURING,
        CLAIMING
    }

    struct ClaimData {
        uint64 amountToClaim;
        uint256 unlocksAt;
    }

    // ------------- Events ------------- //
    event VaultUpdated(address indexed oldVault, address indexed newVault);
    event MerkleRootUpdated(bytes32 indexed newMerkleRoot);
    event TokenAddressUpdated(address newTokenAddress);
    event CurrentPhaseUpdated(Phase newPhase);

    // ------------- Errors ------------- //
    error InvalidContractPhase(Phase expectedPhase, Phase currentPhase);
    error NotAnERC20Token();
    error InvalidMerkleProof();

    // ------------- Methods ------------- //
    function claimRewards(bytes32[][] calldata proofs, ClaimData[] memory claims) external;

    function enableClaiming() external;

    function calculateHash(ClaimData memory claim) external returns (bytes32);

    function setMerkleRoot(bytes32 merkleRoot) external;

    function setTokenAddress(address tokenAddress) external;

    function setVault(address vault) external;

    function getCurrentPhase() external returns (Phase);

    function getTokenAddress() external returns (address);

    function getVault() external returns (address);
}
