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
        uint256 index; // Unique per-user claim of the index, starts with `1`
    }

    // ------------- Events ------------- //
    event VaultUpdated(address indexed oldVault, address indexed newVault);
    event MerkleRootUpdated(bytes32 indexed newMerkleRoot);
    event TokenAddressUpdated(address newTokenAddress);
    event CurrentPhaseUpdated(Phase newPhase);
    event Claimed(address indexed claimer, ClaimData claim);

    // ------------- Errors ------------- //
    error InvalidContractPhase(Phase expectedPhase, Phase currentPhase);
    error NotAnERC20Token();
    error InvalidMerkleProof();
    error ClaimNotYetUnlocked(ClaimData claim);
    error AlreadyClaimed(ClaimData claim);

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

    function getClaimedClaims(address claimer) external returns (uint256);
}
