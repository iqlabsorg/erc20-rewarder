// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./interfaces/IRewarder.sol";

/// @title Rewarder implementation.
contract Rewarder is Ownable, IRewarder {
    using SafeERC20 for IERC20;

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
    IERC20 internal immutable _token; // 160 bits
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

    constructor(address vault, address token) Ownable() {
        _token = IERC20(token);

        _setVault(vault);
        _deploymentBlock = uint64(block.number);

        emit TokenUpdated(token);
    }

    function claim(bytes32[] calldata proof, Reward calldata claimData) external override whenClaimingEnabled {
        uint256 alreadyClaimed = _claimedRewards[msg.sender];

        if (alreadyClaimed >= claimData.amount) {
            revert NothingToClaim();
        }
        if (claimData.unlocksAt > block.timestamp) {
            revert ClaimNotYetUnlocked(claimData);
        }

        bytes32 computedHash = _calculateHash(claimData);
        bool isValid = MerkleProof.verify(proof, _merkleRoot, computedHash);
        if (!isValid) {
            revert InvalidMerkleProof();
        }

        _claimedRewards[msg.sender] = claimData.amount;

        uint256 toClaimThisTime = claimData.amount - alreadyClaimed;
        _token.safeTransferFrom(_vault, msg.sender, toClaimThisTime);

        emit Claimed(msg.sender, claimData.unlocksAt, toClaimThisTime);
    }

    function setVault(address vault) external override onlyOwner {
        _setVault(vault);
    }

    function enableClaiming() external override onlyOwner whenClaimingDisabled {
        require(_merkleRoot != bytes32(0), "Cannot enable claiming while merkle root not set!");
        _claimingEnabled = true;

        emit ClaimingEnabled();
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

    /// @notice Send ERC20 tokens to an address.
    /// Lets assume that a user has mistakingly sent his ERC20 tokens to our contract.
    ///  To help him out, the contract owner can send back the tokens.
    function recoverTokens(
        IERC20 token,
        address to,
        uint256 amount
    ) external override onlyOwner {
        token.safeTransfer(to, amount);
    }

    // ---- Internal setters ---- //
    function _calculateHash(Reward memory claimData) internal view virtual returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(address(this), msg.sender, block.chainid, claimData.amount, claimData.unlocksAt)
            );
    }

    function _setVault(address newVault) internal {
        emit VaultUpdated(_vault, newVault);
        _vault = newVault;
    }

    function _setMerkleRoot(bytes32 newMerkleRoot) internal {
        _merkleRoot = newMerkleRoot;

        emit MerkleRootUpdated(newMerkleRoot);
    }
}
