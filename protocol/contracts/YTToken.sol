// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IYieldTransferHook {
    function onYTTransfer(address from, address to, uint256 amount) external;
}

contract YTToken is ERC20, Ownable {
    address public splitter;

    constructor(string memory name_, string memory symbol_, address owner_)
        ERC20(name_, symbol_)
        Ownable(owner_)
    {}

    function setSplitter(address s) external onlyOwner {
        splitter = s;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (splitter != address(0)) {
            IYieldTransferHook(splitter).onYTTransfer(from, to, value);
        }
        super._update(from, to, value);
    }
}
