// OpenZeppelin не содержит свежую версию ERC20Mock, поэтому создадим её сами.
// Это будет тестовый токен, с которым можно играться локально
// При деплое в тестовой сети заменить этот mock настоящим токеном (USDC, DAI и т.п.).

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Mock is ERC20 {
    constructor(
        string memory name,
        string memory symbol,
        address initialHolder,
        uint256 initialSupply
    ) ERC20(name, symbol) {
        _mint(initialHolder, initialSupply);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
    
}
