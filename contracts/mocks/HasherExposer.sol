// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

import "../Rewarder.sol";

contract HasherExposer is Rewarder {
    constructor(address vault, address token) Rewarder(vault, token) {}

    //solhint-disable-next-line comprehensive-interface
    function calculateHash(Reward memory claim) public view returns (bytes32) {
        return _calculateHash(claim);
    }
}
