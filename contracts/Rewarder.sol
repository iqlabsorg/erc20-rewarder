// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

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
    Phase internal _currentPhase; // 8 bits
    // 88 free bits
    // --- Slot end --- //

    // --- Slot start --- //
    IERC20 internal _tokenAddress; // 160 bits
    // 96 free bits
    // --- Slot end --- //

    mapping(address => uint256) internal _claimedClaims;

    modifier whenPhase(Phase expectedPhase) {
        if (expectedPhase != _currentPhase) {
            revert InvalidContractPhase(expectedPhase, _currentPhase);
        }
        _;
    }

    constructor(
        bytes32 merkleRoot,
        address vault,
        address tokenAddress
    ) Ownable() {
        _setVault(vault);
        _setMerkleRoot(merkleRoot);
        _setTokenAddress(tokenAddress);

        _deploymentBlock = uint64(block.number);
        _currentPhase = Phase.CONFIGURING;
    }

    function claimRewards(bytes32[][] calldata proofs, ClaimData[] memory claims)
        external
        override
        whenPhase(Phase.CLAIMING)
    {
        uint256 totalClaimAmount = 0;
        uint256 newlyUnlockedClaims = 0;
        uint256 currentlyUnlockedClaims = _claimedClaims[msg.sender];
        for (uint256 i = 0; i < proofs.length; i++) {
            bytes32[] memory proof = proofs[i];
            ClaimData memory claim = claims[i];

            if (!(claim.unlocksAt >= block.timestamp)) {
                revert ClaimNotYetUnlocked(claim);
            }

            if (currentlyUnlockedClaims & claim.index > 0) {
                revert AlreadyClaimed(claim);
            }

            bytes32 computedHash = calculateHash(claim);
            bool isValid = MerkleProof.verify(proof, _merkleRoot, computedHash);

            if (isValid) {
                totalClaimAmount += claim.amountToClaim;
            } else {
                revert InvalidMerkleProof();
            }

            newlyUnlockedClaims |= claim.index;
        }

        if (totalClaimAmount > 0) {
            _tokenAddress.transferFrom(_vault, msg.sender, totalClaimAmount);
            _claimedClaims[msg.sender] |= newlyUnlockedClaims;
        }
    }

    function enableClaiming() external override onlyOwner whenPhase(Phase.CONFIGURING) {
        _setPhase(Phase.CLAIMING);
    }

    function setVault(address vault) external override onlyOwner whenPhase(Phase.CONFIGURING) {
        _setVault(vault);
    }

    function setTokenAddress(address tokenAddress) external override onlyOwner whenPhase(Phase.CONFIGURING) {
        _setTokenAddress(tokenAddress);
    }

    function setMerkleRoot(bytes32 merkleRoot) external override onlyOwner whenPhase(Phase.CONFIGURING) {
        _setMerkleRoot(merkleRoot);
    }

    function getTokenAddress() external view override returns (address) {
        return address(_tokenAddress);
    }

    function getCurrentPhase() external view override returns (Phase) {
        return _currentPhase;
    }

    function getDeploymentBlockNumber() external view override returns (uint64) {
        return _deploymentBlock;
    }

    function getVault() external view override returns (address) {
        return _vault;
    }

    function getClaimedClaims(address claimer) external view override returns (uint256) {
        return _claimedClaims[claimer];
    }

    function calculateHash(ClaimData memory claim) public view override returns (bytes32) {
        bytes32 computedHash = keccak256(
            abi.encodePacked(msg.sender, block.chainid, claim.amountToClaim, claim.unlocksAt, claim.index)
        );
        return computedHash;
    }

    // ---- Internal setters ---- //
    function _setVault(address newVault) internal {
        address oldVault = _vault;
        _vault = newVault;

        emit VaultUpdated(oldVault, newVault);
    }

    function _setPhase(Phase newPhase) internal {
        _currentPhase = newPhase;

        emit CurrentPhaseUpdated(newPhase);
    }

    function _setMerkleRoot(bytes32 newMerkleRoot) internal {
        _merkleRoot = newMerkleRoot;
        emit MerkleRootUpdated(newMerkleRoot);
    }

    function _setTokenAddress(address newTokenAddress) internal {
        if (!IERC165(newTokenAddress).supportsInterface(type(IERC20).interfaceId)) {
            revert NotAnERC20Token();
        }

        _tokenAddress = IERC20(newTokenAddress);

        emit TokenAddressUpdated(newTokenAddress);
    }
}
