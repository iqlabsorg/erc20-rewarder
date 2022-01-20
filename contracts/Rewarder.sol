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

    modifier whenClaimingDisabled() {
        if (_claimingEnabled) {
            revert ClaimingAlreadyEnabled();
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

    function claim(bytes32[] calldata proof, Reward memory claimData) external override whenClaimingEnabled {
        uint256 alreadyClaimed = _claimedRewards[msg.sender];

        if (alreadyClaimed >= claimData.amount) {
            revert NothingToClaim();
        }

        uint256 toClaimThisTime = claimData.amount - alreadyClaimed;

        if (claimData.unlocksAt > block.timestamp) {
            revert ClaimNotYetUnlocked(claimData);
        }

        bytes32 computedHash = calculateHash(claimData);
        bool isValid = MerkleProof.verify(proof, _merkleRoot, computedHash);

        if (!isValid) {
            revert InvalidMerkleProof();
        }

        _claimedRewards[msg.sender] += toClaimThisTime;
        _token.transferFrom(_vault, msg.sender, toClaimThisTime);

        emit Claimed(msg.sender, claimData.unlocksAt, toClaimThisTime);
    }

    function setVault(address vault) external override onlyOwner {
        _setVault(vault);
    }

    function enableClaiming() external override onlyOwner whenClaimingDisabled {
        _claimingEnabled = true;

        emit ClaimingEnabled();
    }

    function setToken(address token) external override onlyOwner whenClaimingDisabled {
        _setToken(token);
    }

    function setMerkleRoot(bytes32 merkleRoot) external override onlyOwner whenClaimingDisabled {
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

    function getCurrentlyClaimedAmount(address claimer) external view override returns (uint256) {
        return _claimedRewards[claimer];
    }

    function calculateHash(Reward memory claimData) internal view virtual returns (bytes32) {
        return keccak256(abi.encodePacked(msg.sender, block.chainid, claimData.amount, claimData.unlocksAt));
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
