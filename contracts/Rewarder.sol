// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./interfaces/IRewarder.sol";

/// @title Rewarder implementation.
contract Rewarder is Ownable, IRewarder {
    // ------------- Immutables ------------- //
    uint64 internal immutable _deploymentBlock;

    // ------------- Storage ------------- //

    // --- Slot start --- //
    bytes32 internal _merkleRoot; // 256 bits
    // --- Slot end --- //

    // --- Slot start --- //
    address internal _vault; // 160 bits
    bool internal _claimingEnabled; // 8 bits
    // 88 free bits
    // --- Slot end --- //

    // --- Slot start --- //
    IERC20 internal _token; // 160 bits
    // 96 free bits
    // --- Slot end --- //

    mapping(address => uint256) internal _claimedRewards;

    modifier whenClaimingEnabled() {
        if (!_claimingEnabled) {
            revert ClaimingNotYetEnabled();
        }
        _;
    }

    constructor(
        bytes32 merkleRoot,
        address vault,
        address token
    ) Ownable() {
        _setVault(vault);
        _setMerkleRoot(merkleRoot);
        _setToken(token);

        _deploymentBlock = uint64(block.number);
    }

    function claim(bytes32[][] calldata proofs, Reward[] memory claims) external override whenClaimingEnabled {
        // TODO make sure that proofs and claims length is matvhing
        uint256 totalClaimAmount = 0;
        uint256 newlyUnlockedClaims = 0;
        uint256 currentlyUnlockedClaims = _claimedRewards[msg.sender];
        for (uint256 i = 0; i < proofs.length; i++) {
            bytes32[] memory proof = proofs[i];
            Reward memory claim = claims[i];

            if (claim.unlocksAt > block.timestamp) {
                revert ClaimNotYetUnlocked(claim);
            }
            if (currentlyUnlockedClaims & claim.index != 0) {
                revert AlreadyClaimed(claim);
            }

            bytes32 computedHash = calculateHash(claim);
            bool isValid = MerkleProof.verify(proof, _merkleRoot, computedHash);

            if (!isValid) {
                revert InvalidMerkleProof();
            }
            newlyUnlockedClaims |= claim.index;

            emit Claimed(msg.sender, claim);
        }

        if (totalClaimAmount > 0) {
            _claimedRewards[msg.sender] |= newlyUnlockedClaims;
            _token.transferFrom(_vault, msg.sender, totalClaimAmount);
        }
    }

    function setVault(address vault) external override onlyOwner {
        _setVault(vault);
    }

    function enableClaiming() external override onlyOwner {
        _claimingEnabled = true;

        emit ClaimingEnabled();
    }

    function setToken(address token) external override onlyOwner {
        _setToken(token);
    }

    function setMerkleRoot(bytes32 merkleRoot) external override onlyOwner {
        _setMerkleRoot(merkleRoot);
    }

    function getToken() external view override returns (address) {
        return address(_token);
    }

    function isClaimingEnabled() external view override returns (bool) {
        return _claimingEnabled;
    }

    function getMerkleRoot() external view override returns (bytes32) {
        return _merkleRoot;
    }

    function getDeploymentBlockNumber() external view override returns (uint64) {
        return _deploymentBlock;
    }

    function getVault() external view override returns (address) {
        return _vault;
    }

    function getClaimedRewards(address claimer) external view override returns (uint256) {
        return _claimedRewards[claimer];
    }

    function calculateHash(Reward memory claim) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(msg.sender, block.chainid, claim.amount, claim.unlocksAt, claim.index));
    }

    // ---- Internal setters ---- //
    function _setVault(address newVault) internal {
        address oldVault = _vault;
        _vault = newVault;

        emit VaultUpdated(oldVault, newVault);
    }

    function _setMerkleRoot(bytes32 newMerkleRoot) internal {
        _merkleRoot = newMerkleRoot;

        emit MerkleRootUpdated(newMerkleRoot);
    }

    function _setToken(address newToken) internal {
        _token = IERC20(newToken);

        emit TokenUpdated(newToken);
    }
}
