// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract LendingPool {
    IERC20 public immutable collateralToken;
    using SafeERC20 for IERC20;

    mapping(address => uint256) public sharesOf; 

    uint256 public constant YEAR = 365 days;
    uint256 public totalShares;
    uint256 public sharePriceE18 = 1e18;
    uint256 public lastShareAccrual;
    uint256 public aprE18 = 5e16;
    uint256 public constant LTV_BPS = 5000; 
    uint256 public constant BPS = 10_000;
    uint256 public borrowIndexE18 = 1e18;
    uint256 public lastBorrowAccrual;
    uint256 public totalDebtShares;
    mapping(address => uint256) public debtSharesOf;
    uint256 public borrowAprE18 = 2e17;
    address public owner;
    uint256 public liqBonusBps = 1000;
    uint256 public constant HF_LIQUIDATION_THRESHOLD_E18 = 1e18;
    uint256 public closeFactorBps = 5000;    
    uint256 public reserveFactorBps = 1000; 
    uint256 public protocolReserves; 
    uint256 public baseBorrowAprE18 = 0;    
    uint256 public slope1E18 = 2e17;      
    uint256 public slope2E18 = 8e17;
    uint256 public kinkE18 = 8e17;     
    event RateModelUpdated(uint256 baseBorrowAprE18, uint256 slope1E18, uint256 kinkE18, uint256 slope2E18);
    event ReserveFactorUpdated(uint256 newReserveFactorBps);
    event ReservesAccrued(uint256 interestToSuppliers, uint256 feeToReserves, uint256 protocolReserves);
    event ReservesWithdrawn(address indexed to, uint256 amount);

    event Deposit(
        address indexed user,
        uint256 assetsIn,
        uint256 sharesMinted,
        uint256 sharePriceE18
    );

    event Withdraw(
        address indexed user,
        uint256 assetsOut,
        uint256 sharesBurned,
        uint256 sharePriceE18
    );

    event Borrow(
        address indexed user,
        uint256 assetsOut,
        uint256 debtSharesMinted,
        uint256 borrowIndexE18
    );

    event Repay(
        address indexed user,
        uint256 assetsPaid,
        uint256 debtSharesBurned,
        uint256 borrowIndexE18
    );

    event Liquidate(
        address indexed liquidator,
        address indexed user,
        uint256 assetsPaid,
        uint256 debtSharesBurned,
        uint256 collateralSeized,
        uint256 sharesSeized,
        uint256 borrowIndexE18,
        uint256 sharePriceE18
    );

    event ParamsUpdated(
        uint256 aprE18,
        uint256 borrowAprE18,
        uint256 liqBonusBps,
        uint256 closeFactorBps
    );



    constructor(address _collateralToken) {
        owner = msg.sender;
        collateralToken = IERC20(_collateralToken);
        lastShareAccrual = block.timestamp;
        lastBorrowAccrual = block.timestamp;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    function setReserveFactor(uint256 newReserveFactorBps) external onlyOwner {
        _accrue();
        _accrueBorrow();
        require(newReserveFactorBps <= 5000, "reserve factor too high"); 
        reserveFactorBps = newReserveFactorBps;
        emit ReserveFactorUpdated(newReserveFactorBps);
    }

    function setApr(uint256 newAprE18) external onlyOwner {
        _accrue(); 
        require(newAprE18 <= 5e18, "apr too high"); 
        aprE18 = newAprE18;
        emit ParamsUpdated(aprE18, borrowAprE18, liqBonusBps, closeFactorBps);
    }

    function setBorrowApr(uint256 newBorrowAprE18) external onlyOwner {
        _accrueBorrow();
        require(newBorrowAprE18 <= 5e18, "borrow apr too high");

        borrowAprE18 = newBorrowAprE18;

        baseBorrowAprE18 = newBorrowAprE18;
        slope1E18 = 0;
        slope2E18 = 0;
        kinkE18 = 8e17;

        emit ParamsUpdated(aprE18, borrowAprE18, liqBonusBps, closeFactorBps);
        emit RateModelUpdated(baseBorrowAprE18, slope1E18, kinkE18, slope2E18);
    }

    function setLiqBonus(uint256 newLiqBonusBps) external onlyOwner {
        _accrue();
        _accrueBorrow();

        require(newLiqBonusBps <= 5000, "liq bonus too high"); 
        liqBonusBps = newLiqBonusBps;
        emit ParamsUpdated(aprE18, borrowAprE18, liqBonusBps, closeFactorBps);
    }

    function setCloseFactor(uint256 newCloseFactorBps) external onlyOwner {
        _accrue();
        _accrueBorrow();

        require(newCloseFactorBps > 0 && newCloseFactorBps <= BPS, "bad close factor");
        closeFactorBps = newCloseFactorBps;
        emit ParamsUpdated(aprE18, borrowAprE18, liqBonusBps, closeFactorBps);
    }

    function setRateModel(uint256 newBaseBorrowAprE18, uint256 newSlope1E18, uint256 newKinkE18, uint256 newSlope2E18) external onlyOwner {
        _accrueBorrow();

        require(newKinkE18 <= 1e18, "kink > 1");
        require(newBaseBorrowAprE18 <= 5e18, "base too high");
        require(newSlope1E18 <= 5e18, "slope1 too high");
        require(newSlope2E18 <= 5e18, "slope2 too high");

        baseBorrowAprE18 = newBaseBorrowAprE18;
        slope1E18 = newSlope1E18;
        kinkE18 = newKinkE18;
        slope2E18 = newSlope2E18;

        emit RateModelUpdated(baseBorrowAprE18, slope1E18, kinkE18, slope2E18);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero addr");
        owner = newOwner;
    }

    function _accrue() internal {
        uint256 dt = block.timestamp - lastShareAccrual;
        if (dt == 0) return;

        if (totalShares == 0) {
            lastShareAccrual = block.timestamp;
            return;
        }
        lastShareAccrual = block.timestamp;
    }

    function deposit(uint256 amount) external {
        _accrueBorrow();
        require(amount > 0, "amount = 0");

        collateralToken.safeTransferFrom(msg.sender, address(this), amount);
        uint256 mintedShares = (amount * 1e18 + sharePriceE18 - 1) / sharePriceE18; 

        totalShares += mintedShares;
        sharesOf[msg.sender] += mintedShares;

        emit Deposit(msg.sender, amount, mintedShares, sharePriceE18);
    }

    function _balanceByShares(address user) internal view returns (uint256) {
        uint256 s = sharesOf[user];
        if (s == 0) return 0;

        uint256 price = _currentSharePriceE18(); 
        return (s * price) / 1e18;
    }

    function getBalanceWithInterest(address user) external view returns (uint256) {
        return collateralValue(user);
    }

    function withdraw(uint256 amount) external {
        _accrueBorrow();

        require(amount > 0, "amount = 0");
        require(healthOkAfterWithdraw(msg.sender, amount), "withdraw breaks LTV");

        uint256 max = (sharesOf[msg.sender] * sharePriceE18) / 1e18;
        require(amount <= max, "not enough balance");

        uint256 sharesToBurn = (amount * 1e18 + sharePriceE18 - 1) / sharePriceE18; // ceil
        require(sharesOf[msg.sender] >= sharesToBurn, "not enough shares");

        sharesOf[msg.sender] -= sharesToBurn;
        totalShares -= sharesToBurn;

        collateralToken.safeTransfer(msg.sender, amount);

        emit Withdraw(msg.sender, amount, sharesToBurn, sharePriceE18);
    }

    function maxWithdraw(address user) external view returns (uint256) {
        uint256 c = collateralValue(user);
        uint256 d = debtOf(user);

        if (d == 0) return c;

        uint256 minCollateral = (d * BPS + LTV_BPS - 1) / LTV_BPS; // ceil
        if (c <= minCollateral) return 0;

        uint256 hi = c - minCollateral;
        uint256 lo = 0;

        while (lo < hi) {
            uint256 mid = (lo + hi + 1) / 2;
            if (healthOkAfterWithdraw(user, mid)) {
                lo = mid;
            } else {
                hi = mid - 1;
            }
        }
        return lo;
    }

    function collateralValue(address user) public view returns (uint256) {
        uint256 userShares = sharesOf[user];
        if (userShares == 0) return 0;

        uint256 price = _currentSharePriceE18();
        return (sharesOf[user] * price) / 1e18;
    }

    function maxBorrow(address user) public view returns (uint256) {
        uint256 collateral = collateralValue(user);
        if (collateral == 0) return 0;

        uint256 limit = (collateral * LTV_BPS) / BPS;
        uint256 d = debtOf(user);

        if (limit <= d) return 0;
        return limit - d;
    }

    function borrow(uint256 amount) external {
        _accrueBorrow();  
        require(amount > 0, "amount = 0");

        uint256 avail = maxBorrow(msg.sender);
        require(amount <= avail, "borrow > limit");

        uint256 poolBal = collateralToken.balanceOf(address(this));
        require(amount <= poolBal, "not enough liquidity");

        uint256 shares = (amount * 1e18) / borrowIndexE18;
        if ((shares * borrowIndexE18) / 1e18 < amount) {
            shares += 1;
        }

        debtSharesOf[msg.sender] += shares;
        totalDebtShares += shares;

        collateralToken.safeTransfer(msg.sender, amount); // выдача займа

        emit Borrow(msg.sender, amount, shares, borrowIndexE18);
    }

    function _accrueBorrow() internal {
        uint256 dt = block.timestamp - lastBorrowAccrual;
        if (dt == 0) return;

        if (totalDebtShares == 0) {
            lastBorrowAccrual = block.timestamp;
            return;
        }

        uint256 oldIdx = borrowIndexE18;

        uint256 util = _utilizationE18WithIndex(oldIdx);
        uint256 borrowRate = _borrowRateE18(util);
        uint256 growth = (borrowRate * dt) / YEAR; // 1e18

        uint256 newIdx = (oldIdx * (1e18 + growth)) / 1e18;
        borrowIndexE18 = newIdx;
        lastBorrowAccrual = block.timestamp;

        uint256 oldDebtAssets = (totalDebtShares * oldIdx) / 1e18;
        uint256 newDebtAssets = (totalDebtShares * newIdx) / 1e18;

        if (newDebtAssets <= oldDebtAssets) return;
        uint256 interestAssets = newDebtAssets - oldDebtAssets;

        uint256 fee = (interestAssets * reserveFactorBps) / BPS;
        uint256 toSuppliers = interestAssets - fee;

        protocolReserves += fee;

        if (totalShares > 0 && toSuppliers > 0) {
            uint256 deltaPriceE18 = (toSuppliers * 1e18) / totalShares;
            if (deltaPriceE18 > 0) {
                sharePriceE18 += deltaPriceE18;
            }
        }

        emit ReservesAccrued(toSuppliers, fee, protocolReserves);
    }

    function debtOf(address user) public view returns (uint256) {
        uint256 idx = _currentBorrowIndexE18();
        return (debtSharesOf[user] * idx) / 1e18;
    }
    
    function repay(uint256 amount) external {
        _accrueBorrow();
        require(amount > 0, "amount = 0");

        uint256 idx = borrowIndexE18;
        uint256 debtShares = debtSharesOf[msg.sender];
        require(debtShares > 0, "no debt");

        uint256 debtAssets = (debtShares * idx) / 1e18;

        uint256 sharesToBurn;
        uint256 pay;

        if (amount >= debtAssets) {
            sharesToBurn = debtShares;
            pay = debtAssets;
        } else {
            pay = amount;
            require(pay > 0, "repay too small");

            sharesToBurn = (pay * 1e18 + idx - 1) / idx; // ceil
            if (sharesToBurn > debtShares) sharesToBurn = debtShares;

            pay = (sharesToBurn * idx) / 1e18; // floor
            require(pay > 0, "repay too small");
        }

        debtSharesOf[msg.sender] = debtShares - sharesToBurn;
        totalDebtShares -= sharesToBurn;

        collateralToken.safeTransferFrom(msg.sender, address(this), pay);

        emit Repay(msg.sender, pay, sharesToBurn, idx);
    }

    function repayAll() external {
        _accrueBorrow();

        uint256 idx = borrowIndexE18;
        uint256 debtShares = debtSharesOf[msg.sender];
        require(debtShares > 0, "no debt");

        uint256 pay = (debtShares * idx + 1e18 - 1) / 1e18;

        debtSharesOf[msg.sender] = 0;
        totalDebtShares -= debtShares;

        collateralToken.safeTransferFrom(msg.sender, address(this), pay);

        emit Repay(msg.sender, pay, debtShares, idx);
    }

    function liquidate(address user, uint256 repayAmount) external {
        require(repayAmount > 0, "amount = 0");
        _accrueBorrow();

        require(healthFactorE18(user) < HF_LIQUIDATION_THRESHOLD_E18, "health factor ok");

        uint256 userDebtShares = debtSharesOf[user];
        require(userDebtShares > 0, "no debt");

        uint256 idx = borrowIndexE18;
        uint256 price = sharePriceE18;

        uint256 debtAssets = (userDebtShares * idx) / 1e18;
        uint256 collateralAssets = (sharesOf[user] * price) / 1e18;

        uint256 payTarget = _liquidationPay(repayAmount, debtAssets, collateralAssets);

        uint256 sharesToBurn = (payTarget * 1e18 + idx - 1) / idx; // ceil
        if (sharesToBurn > userDebtShares) sharesToBurn = userDebtShares;
        require(sharesToBurn > 0, "repay too small");

        uint256 pay = (sharesToBurn * idx) / 1e18;
        require(pay > 0, "repay too small");

        require(
            pay <= (collateralAssets * BPS) / (BPS + liqBonusBps),
            "insufficient collateral"
    );

    collateralToken.safeTransferFrom(msg.sender, address(this), pay);

    debtSharesOf[user] = userDebtShares - sharesToBurn;
    totalDebtShares -= sharesToBurn;

    uint256 seizeAssets = (pay * (BPS + liqBonusBps)) / BPS;

    uint256 seizeShares = (seizeAssets * 1e18 + price - 1) / price; // ceil
    uint256 uShares = sharesOf[user];
    if (seizeShares > uShares) seizeShares = uShares;

    uint256 actualSeizeAssets = _seizeCollateralShares(user, seizeAssets, price);

    require(collateralToken.balanceOf(address(this)) >= actualSeizeAssets, "not enough liquidity");
    collateralToken.safeTransfer(msg.sender, actualSeizeAssets);

    emit Liquidate(msg.sender,user, pay, sharesToBurn, actualSeizeAssets, seizeShares, borrowIndexE18, sharePriceE18);
    }

    function _liquidationPay(uint256 repayAmount, uint256 debtAssets, uint256 collateralAssets) internal view returns (uint256 pay) {
        pay = repayAmount;

        uint256 closeCap = (debtAssets * closeFactorBps) / BPS;
        if (pay > closeCap) pay = closeCap;
        if (pay > debtAssets) pay = debtAssets;
        uint256 maxPayByCollateral = (collateralAssets * BPS) / (BPS + liqBonusBps);
        if (pay > maxPayByCollateral) pay = maxPayByCollateral;

        require(pay > 0, "insufficient collateral");
    }

    function _burnDebtSharesByPay(address user, uint256 pay, uint256 idx) internal {
        uint256 userDebtShares = debtSharesOf[user];

        uint256 sharesToBurn = (pay * 1e18) / idx; // floor
        if (sharesToBurn > userDebtShares) sharesToBurn = userDebtShares;
        require(sharesToBurn > 0, "repay too small");

        debtSharesOf[user] = userDebtShares - sharesToBurn;
        totalDebtShares -= sharesToBurn;
    }

    function _seizeAssetsFromPay(uint256 pay) internal view returns (uint256) {
        return (pay * (BPS + liqBonusBps)) / BPS;
    }

    function _seizeCollateralShares(address user, uint256 seizeAssets, uint256 price) internal returns (uint256 actualSeizeAssets) {
        uint256 seizeShares = (seizeAssets * 1e18 + price - 1) / price;

        uint256 userShares = sharesOf[user];
        if (seizeShares > userShares) {
            seizeShares = userShares;
        }

        sharesOf[user] = userShares - seizeShares;
        totalShares -= seizeShares;

        actualSeizeAssets = (seizeShares * price) / 1e18;
        require(actualSeizeAssets > 0, "seize too small");
    }

    function _utilizationE18WithIndex(uint256 idxE18) internal view returns (uint256) {
        uint256 cash = _cashAvailable(); 
        uint256 debtAssets = (totalDebtShares * idxE18) / 1e18;

        uint256 denom = cash + debtAssets;
        if (denom == 0) return 0;

        return (debtAssets * 1e18) / denom;
    }

    function utilizationE18() public view returns (uint256) {
        return _utilizationE18WithIndex(borrowIndexE18);
    }

    function _borrowRateE18(uint256 utilE18) internal view returns (uint256) {
        if (utilE18 == 0) return baseBorrowAprE18;

        uint256 k = kinkE18;
        if (k == 0) return baseBorrowAprE18 + slope1E18 + slope2E18;

        if (utilE18 <= k) {
            uint256 part = (utilE18 * slope1E18) / k;
            return baseBorrowAprE18 + part;
        } else {
            uint256 excess = utilE18 - k;
            uint256 denom = 1e18 - k;
            if (denom == 0) return baseBorrowAprE18 + slope1E18;
            uint256 part2 = (excess * slope2E18) / denom;
            return baseBorrowAprE18 + slope1E18 + part2;
        }
    }

    function pricePerShare() external view returns (uint256) {
        return _currentSharePriceE18();
    }

    function _currentSharePriceE18() internal view returns (uint256) {

        if (totalShares == 0) return sharePriceE18;

        uint256 dt = block.timestamp - lastBorrowAccrual;
        if (dt == 0) return sharePriceE18;

        if (totalDebtShares == 0) return sharePriceE18;

        uint256 oldIdx = borrowIndexE18;

        uint256 util = _utilizationE18WithIndex(oldIdx);
        uint256 borrowRate = _borrowRateE18(util);
        uint256 growth = (borrowRate * dt) / YEAR; // 1e18
        uint256 newIdx = (oldIdx * (1e18 + growth)) / 1e18;
        uint256 oldDebtAssets = (totalDebtShares * oldIdx) / 1e18;
        uint256 newDebtAssets = (totalDebtShares * newIdx) / 1e18;
        if (newDebtAssets <= oldDebtAssets) return sharePriceE18;

        uint256 interestAssets = newDebtAssets - oldDebtAssets;

        uint256 fee = (interestAssets * reserveFactorBps) / BPS;
        uint256 toSuppliers = interestAssets - fee;
        if (toSuppliers == 0) return sharePriceE18;

        uint256 deltaPriceE18 = (toSuppliers * 1e18) / totalShares;
        return sharePriceE18 + deltaPriceE18;
    }

    function _currentBorrowIndexE18() internal view returns (uint256) {
        uint256 dt = block.timestamp - lastBorrowAccrual;
        uint256 idx = borrowIndexE18;

        if (dt == 0) return idx;
        if (totalDebtShares == 0) return idx; 

        uint256 util = _utilizationE18WithIndex(idx);
        uint256 borrowRate = _borrowRateE18(util);
        uint256 growth = (borrowRate * dt) / YEAR;
        return (idx * (1e18 + growth)) / 1e18;

    }

    function collateralAfterWithdraw(address user, uint256 withdrawAmount) public view returns (uint256) {
        uint256 c = collateralValue(user);
        require(withdrawAmount <= c, "withdraw > collateral");
        return c - withdrawAmount;
    }

    function maxDebtAllowed(uint256 collateralAssets) public pure returns (uint256) {
        return (collateralAssets * LTV_BPS) / BPS;
    }

    function healthOkAfterWithdraw(address user, uint256 amount) public view returns (bool) {
        uint256 price = _currentSharePriceE18();
        uint256 sharesToBurn = (amount * 1e18 + price - 1) / price; // ceil
        if (sharesToBurn > sharesOf[user]) return false;

        uint256 remainingShares = sharesOf[user] - sharesToBurn;
        uint256 remainingCollateral = (remainingShares * price) / 1e18;

        uint256 d = debtOf(user);
        return d <= maxDebtAllowed(remainingCollateral);
    }


    function debtValue(address user) public view returns (uint256) {
        return debtOf(user); 
    }

    function ltvBps(address user) public view returns (uint256) {
        uint256 c = collateralValue(user);
        uint256 d = debtOf(user);
        if (c == 0) return d == 0 ? 0 : type(uint256).max; 
        return (d * BPS) / c;
    }

    function healthFactorE18(address user) public view returns (uint256) {
        uint256 d = debtOf(user);
        if (d == 0) return type(uint256).max;

        uint256 c = collateralValue(user);
        if (c == 0) return 0; 

        uint256 maxD = (c * LTV_BPS) / BPS; 
        if (maxD == 0) return 0; 
        return (maxD * 1e18) / d;
    }

    function withdrawReserves(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "zero addr");

        _accrue();
        _accrueBorrow();

        uint256 avail = availableReserves();
        require(amount > 0 && amount <= avail, "insufficient reserves");

        protocolReserves -= amount;
        collateralToken.safeTransfer(to, amount);
        emit ReservesWithdrawn(to, amount);
    }

    struct PositionView {
        uint256 collateralAssets;
        uint256 debtAssets;
        uint256 ltvBps;
        uint256 healthFactorE18;
        uint256 maxBorrowAssets;
        uint256 maxWithdrawAssets;
    }

    struct PoolView {
        uint256 totalAssets;        
        uint256 totalDebtAssets;    
        uint256 availableLiquidity;
        uint256 utilizationE18;     
        uint256 sharePriceE18;      
        uint256 borrowIndexE18;    
        uint256 supplyAprE18;       
        uint256 borrowAprE18;       
        uint256 liqBonusBps;        
        uint256 closeFactorBps;     
        uint256 reserveFactorBps;
        uint256 protocolReserves;
    }

    function position(address user) external view returns (PositionView memory p) {
        uint256 c = collateralValue(user);
        uint256 d = debtOf(user);

        uint256 ltv = 0;
        if (c > 0) ltv = (d * BPS) / c;

        uint256 hf;
        if (d == 0) hf = type(uint256).max;
        else {
            uint256 maxD = (c * LTV_BPS) / BPS;
            hf = (maxD * 1e18) / d;
        }

        p = PositionView({
            collateralAssets: c,
            debtAssets: d,
            ltvBps: ltv,
            healthFactorE18: hf,
            maxBorrowAssets: maxBorrow(user),
            maxWithdrawAssets: _maxWithdrawView(user, c, d) 
        });
    }

    function _maxWithdrawView(address user, uint256 c, uint256 d) internal view returns (uint256) {
        if (d == 0) return c;
        uint256 minCollateral = (d * BPS + LTV_BPS - 1) / LTV_BPS;
        if (c <= minCollateral) return 0;
        uint256 hi = c - minCollateral; 
        return _maxWithdrawBinary(user, hi);
    }

    function _maxWithdrawBinary(address user, uint256 hi) internal view returns (uint256) {
        uint256 lo = 0;
        while (lo < hi) {
            uint256 mid = (lo + hi + 1) / 2;
            if (healthOkAfterWithdraw(user, mid)) lo = mid;
            else hi = mid - 1;
        }
        return lo;
    }

    function poolState() external view returns (PoolView memory s) {
        uint256 curSharePrice = _currentSharePriceE18();
        uint256 curBorrowIndex = _currentBorrowIndexE18();

        uint256 assets = collateralToken.balanceOf(address(this));
        uint256 debtAssets = (totalDebtShares * curBorrowIndex) / 1e18;

        uint256 cash = _cashAvailable(); 
        uint256 denom = cash + debtAssets;
        uint256 util = denom == 0 ? 0 : (debtAssets * 1e18) / denom;

        uint256 bApr = _borrowRateE18(util);
        uint256 sApr;
        if (debtAssets == 0) {
            sApr = 0;
        } else {
            sApr = ((bApr * util) / 1e18) * (BPS - reserveFactorBps) / BPS;
        }

        s = PoolView({
            totalAssets: assets,
            totalDebtAssets: debtAssets,
            availableLiquidity: cash,      
            utilizationE18: util,
            sharePriceE18: curSharePrice,
            borrowIndexE18: curBorrowIndex,
            supplyAprE18: sApr,
            borrowAprE18: bApr,
            liqBonusBps: liqBonusBps,
            closeFactorBps: closeFactorBps,
            reserveFactorBps: reserveFactorBps,
            protocolReserves: protocolReserves
        });
    }

    function _cashAvailable() internal view returns (uint256) {
        uint256 bal = collateralToken.balanceOf(address(this));
        if (bal <= protocolReserves) return 0;
        return bal - protocolReserves;
    }

    function totalSupplyAssets() public view returns (uint256) {
        uint256 price = _currentSharePriceE18();
        return (totalShares * price) / 1e18;
    }

    function availableReserves() public view returns (uint256) {
        uint256 bal = collateralToken.balanceOf(address(this));
        uint256 owedToSuppliers = totalSupplyAssets();

        if (bal <= owedToSuppliers) return 0;
        uint256 free = bal - owedToSuppliers;

        return free < protocolReserves ? free : protocolReserves;
    }
}
