// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title Sample ERC20 contract
contract ERC20Mock is ERC20 {
    uint8 internal _decimals;

    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals_,
        uint256 _totalSupply
    ) ERC20(name, symbol) {
        _decimals = decimals_;
        _mint(msg.sender, _totalSupply);
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
}
