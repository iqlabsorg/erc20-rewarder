// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

import "../Rewarder.sol";

contract HasherExposer is Rewarder {
    constructor(
        bytes32 merkleRoot,
        address vault,
        address token
    ) Rewarder(merkleRoot, vault, token) {}

    //solhint-disable-next-line comprehensive-interface
    function calculateHashPub(Reward memory claim) public view returns (bytes32) {
        return super.calculateHash(claim);
    }
}
