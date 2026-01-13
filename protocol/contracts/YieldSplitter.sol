// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./PTToken.sol";
import "./YTToken.sol";

interface ILendingPool {
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function collateralValue(address user) external view returns (uint256);
    function collateralToken() external view returns (address);
}

contract YieldSplitter is Ownable {
    IERC20 public immutable asset;       
    ILendingPool public immutable pool;

    PTToken public immutable pt;
    YTToken public immutable yt;

    uint256 public maturity;
    bool public matured;

    uint256 public accYieldPerYT_E18;
    uint256 public lastTotalAssets;

    mapping(address => uint256) public userYieldDebt_E18;
    mapping(address => uint256) public pendingYield;

    constructor(address pool_, uint256 maturity_, address owner_) Ownable(owner_) {
        pool = ILendingPool(pool_);
        asset = IERC20(ILendingPool(pool_).collateralToken());

        pt = new PTToken("PrimeYield PT", "pPT", address(this));
        yt = new YTToken("PrimeYield YT", "pYT", address(this));
        yt.setSplitter(address(this));

        maturity = maturity_;
        lastTotalAssets = pool.collateralValue(address(this));
    }

    function setMaturity(uint256 ts) external onlyOwner {
        require(!matured, "matured");
        maturity = ts;
    }

    function split(uint256 assets, address to) external {
        require(assets > 0, "zero");

        _updateYield();

        require(asset.transferFrom(msg.sender, address(this), assets), "transferFrom");
        asset.approve(address(pool), assets);
        pool.deposit(assets);

        lastTotalAssets = pool.collateralValue(address(this));

        pt.mint(to, assets);
        yt.mint(to, assets);
    }


    function redeemPT(uint256 ptAmount, address to) external {
        require(ptAmount > 0, "zero");

        _updateYield();
        _harvest(msg.sender);

        if (!matured && block.timestamp < maturity) {
            require(yt.balanceOf(msg.sender) >= ptAmount, "need YT too");
            yt.burn(msg.sender, ptAmount);
        }

        pt.burn(msg.sender, ptAmount);

        pool.withdraw(ptAmount);
        require(asset.transfer(to, ptAmount), "transfer");

        lastTotalAssets = pool.collateralValue(address(this));
    }


    function claimYield(address to) external {
        _updateYield();
        _harvest(msg.sender);

        uint256 amt = pendingYield[msg.sender];
        require(amt > 0, "nothing");
        pendingYield[msg.sender] = 0;

        pool.withdraw(amt); 
        require(asset.transfer(to, amt), "transfer");

        lastTotalAssets = pool.collateralValue(address(this));
    }


    function onYTTransfer(address from, address to, uint256 amount) external {
        require(msg.sender == address(yt), "only YT");
        if (amount == 0) return;

        _updateYield();

        if (from == to) {
            if (from != address(0)) {
                _harvest(from);
                uint256 bal = yt.balanceOf(from);
                userYieldDebt_E18[from] = (bal * accYieldPerYT_E18) / 1e18;
            }
            return;
        }

        if (from != address(0)) _harvest(from);
        if (to != address(0)) _harvest(to);

        if (from != address(0)) {
            uint256 balFrom = yt.balanceOf(from);
            userYieldDebt_E18[from] =
                ((balFrom - amount) * accYieldPerYT_E18) / 1e18;
        }

        if (to != address(0)) {
            uint256 balTo = yt.balanceOf(to);
            userYieldDebt_E18[to] =
                ((balTo + amount) * accYieldPerYT_E18) / 1e18;
        }
    }

    function _updateYield() internal {
        if (matured) return;
        if (block.timestamp >= maturity) {
            matured = true;
            return;
        }

        uint256 totalYT = yt.totalSupply();
        uint256 current = pool.collateralValue(address(this));

        if (totalYT == 0) {
            lastTotalAssets = current;
            return;
        }

        if (current > lastTotalAssets) {
            uint256 delta = current - lastTotalAssets;
            accYieldPerYT_E18 += (delta * 1e18) / totalYT;
        }

        lastTotalAssets = current;
    }

    function _harvest(address user) internal {
        uint256 bal = yt.balanceOf(user);
        uint256 accumulated_E18 = (bal * accYieldPerYT_E18) / 1e18;

        uint256 debt_E18 = userYieldDebt_E18[user];
        if (accumulated_E18 > debt_E18) {
            pendingYield[user] += (accumulated_E18 - debt_E18);
        }

        userYieldDebt_E18[user] = accumulated_E18;
    }

    function previewClaim(address user) external view returns (uint256) {
        uint256 bal = yt.balanceOf(user);
        uint256 accumulated_E18 = (bal * accYieldPerYT_E18) / 1e18;
        uint256 debt_E18 = userYieldDebt_E18[user];
        uint256 earned = accumulated_E18 > debt_E18 ? (accumulated_E18 - debt_E18) : 0;
        return pendingYield[user] + earned;
    }


    function previewClaimUpdated(address user) external view returns (uint256) {
        uint256 bal = yt.balanceOf(user);

        uint256 _acc = accYieldPerYT_E18;

        if (!matured && block.timestamp < maturity) {
            uint256 totalYT = yt.totalSupply();
            if (totalYT > 0) {
                uint256 current = pool.collateralValue(address(this));
                if (current > lastTotalAssets) {
                    uint256 delta = current - lastTotalAssets;
                    _acc += (delta * 1e18) / totalYT;
                }
            }
        }

        uint256 accumulated_E18 = (bal * _acc) / 1e18;
        uint256 debt_E18 = userYieldDebt_E18[user];
        uint256 earned = accumulated_E18 > debt_E18 ? (accumulated_E18 - debt_E18) : 0;

        return pendingYield[user] + earned;
    }


}
