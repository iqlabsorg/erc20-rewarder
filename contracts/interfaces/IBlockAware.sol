// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

interface IBlockAware {
    /// @notice Get deployment block number
    function getDeploymentBlockNumber() external returns (uint64);
}
