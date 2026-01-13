// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract WhitelistPolicy is Ownable {
    mapping(address => bool) public isAllowed;

    event AllowedSet(address indexed user, bool allowed);

    constructor(address owner_) Ownable(owner_) {}

    function setAllowed(address user, bool allowed) external onlyOwner {
        isAllowed[user] = allowed;
        emit AllowedSet(user, allowed);
    }

    function setAllowedBatch(address[] calldata users, bool allowed) external onlyOwner {
        for (uint256 i = 0; i < users.length; i++) {
            isAllowed[users[i]] = allowed;
            emit AllowedSet(users[i], allowed);
        }
    }

    function check(address user) external view returns (bool) {
        return isAllowed[user];
    }
}
