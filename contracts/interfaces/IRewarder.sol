// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./IBlockAware.sol";

interface IRewarder is IBlockAware {
    // ------------- Types ------------- //
    struct Reward {
        uint256 amount; // Always increasing.
        uint256 unlocksAt;
    }

    // ------------- Events ------------- //
    event VaultUpdated(address indexed oldVault, address indexed newVault);
    event MerkleRootUpdated(bytes32 indexed newMerkleRoot);
    event TokenUpdated(address newToken); // TODO remove `Address` from everywhere
    event ClaimingEnabled();
    event Claimed(address indexed claimer, uint256 indexed unlockTime, uint256 indexed amountClaimed);

    // ------------- Errors ------------- //
    error ClaimingNotYetEnabled();
    error ClaimingAlreadyEnabled();
    error InvalidMerkleProof();
    error ClaimNotYetUnlocked(Reward claim); // TODO remove block timestamp param
    error NothingToClaim();

    // ------------- Methods ------------- //
    function claim(bytes32[] calldata proof, Reward memory claimData) external;

    function enableClaiming() external;

    function setMerkleRoot(bytes32 merkleRoot) external;

    function setVault(address vault) external;

    function isClaimingEnabled() external returns (bool);

    function getToken() external returns (address);

    function getMerkleRoot() external view returns (bytes32);

    function getVault() external returns (address);

    function getCurrentlyClaimedAmount(address claimer) external returns (uint256);

    function recoverTokens(
        IERC20 token,
        address to,
        uint256 amount
    ) external;
}
