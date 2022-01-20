// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

import "./IBlockAware.sol";

interface IRewarder is IBlockAware {
    // ------------- Types ------------- //
    struct Reward {
        uint256 amount;
        uint256 unlocksAt;
        uint256 index; // Unique per-user claim of the index, starts with `1`
    }

    // ------------- Events ------------- //
    event VaultUpdated(address indexed oldVault, address indexed newVault);
    event MerkleRootUpdated(bytes32 indexed newMerkleRoot);
    event TokenUpdated(address newToken); // TODO remove `Address` from everywhere
    event ClaimingEnabled();
    event Claimed(address indexed claimer, Reward claim);

    // ------------- Errors ------------- //
    error ClaimingNotYetEnabled();
    error InvalidMerkleProof();
    error ClaimNotYetUnlocked(Reward claim); // TODO remove block timestamp param
    error AlreadyClaimed(Reward claim);

    // ------------- Methods ------------- //
    function claim(bytes32[][] calldata proofs, Reward[] memory claims) external;

    function enableClaiming() external;

    function setMerkleRoot(bytes32 merkleRoot) external;

    function setToken(address token) external;

    function setVault(address vault) external;

    function isClaimingEnabled() external returns (bool);

    function getToken() external returns (address);

    function getMerkleRoot() external view returns (bytes32);

    function getVault() external returns (address);

    function getClaimedRewards(address claimer) external returns (uint256);
}
