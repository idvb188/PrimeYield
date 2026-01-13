// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockMETH is ERC20 {
    constructor() ERC20("Mock Mantle ETH", "mETH") {
        _mint(msg.sender, 1_000_000 ether);
    }

    mapping(address => bool) public claimed;
    function faucet() external {
        require(!claimed[msg.sender], "claimed");
        claimed[msg.sender] = true;
        _mint(msg.sender, 1_000 ether);
    }

}