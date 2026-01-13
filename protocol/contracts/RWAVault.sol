// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IWhitelistPolicy {
    function check(address user) external view returns (bool);
}

contract RWAVault is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable asset;
    IWhitelistPolicy public policy;

    mapping(address => uint256) public balanceOf;

    event PolicySet(address indexed policy);
    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);

    constructor(address owner_, address asset_, address policy_) Ownable(owner_) {
        asset = IERC20(asset_);
        policy = IWhitelistPolicy(policy_);
    }

    function setPolicy(address policy_) external onlyOwner {
        policy = IWhitelistPolicy(policy_);
        emit PolicySet(policy_);
    }

    function deposit(uint256 amount) external {
        require(amount > 0, "AMOUNT_ZERO");
        require(policy.check(msg.sender), "NOT_WHITELISTED");

        balanceOf[msg.sender] += amount;
        asset.safeTransferFrom(msg.sender, address(this), amount);

        emit Deposit(msg.sender, amount);
    }

    function withdraw(uint256 amount) external {
        require(amount > 0, "AMOUNT_ZERO");
        uint256 bal = balanceOf[msg.sender];
        require(bal >= amount, "INSUFFICIENT_BAL");

        balanceOf[msg.sender] = bal - amount;
        asset.safeTransfer(msg.sender, amount);

        emit Withdraw(msg.sender, amount);
    }
}
