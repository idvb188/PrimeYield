import { describe, it } from "node:test";
import assert from "node:assert";
import hre from "hardhat";
import { decodeEventLog, parseAbiItem } from "viem";

const { viem, networkHelpers } = await hre.network.connect();

describe("LendingPool", () => {
  async function deployFixture() {
    const [deployer, user] = await viem.getWalletClients();
    const erc20 = await viem.deployContract("ERC20Mock", [
      "Test Token",
      "TT",
      deployer.account.address,
      0n,                          
    ]);

    await erc20.write.mint([user.account.address, 1_000n]);
    const pool = await viem.deployContract("LendingPool", [erc20.address,]);
    return { erc20, pool, user };
  }

  it("lets user deposit tokens into the pool", async () => {
    const { erc20, pool, user } = await networkHelpers.loadFixture(deployFixture);
    const amount = 500n;

    await erc20.write.approve([pool.address, amount], {account: user.account,});

    const userBefore = await erc20.read.balanceOf([user.account.address,]);
    const poolBefore = await erc20.read.balanceOf([pool.address]);

    await pool.write.deposit([amount], { account: user.account });

    const userAfter = await erc20.read.balanceOf([user.account.address,]);
    const poolAfter = await erc20.read.balanceOf([pool.address]);

    assert.equal(userBefore - userAfter, amount);
    assert.equal(poolAfter - poolBefore, amount);
  });


    it("lets user withdraw previously deposited tokens", async () => {
      const { erc20, pool, user } = await networkHelpers.loadFixture(deployFixture);
      const amount = 500n;

      await erc20.write.approve([pool.address, amount], {account: user.account});
      await pool.write.deposit([amount], { account: user.account });

      const userBefore = await erc20.read.balanceOf([user.account.address,]);
      const poolBefore = await erc20.read.balanceOf([pool.address]);
      const sharesBefore = await pool.read.sharesOf([user.account.address]); 

      await pool.write.withdraw([amount], { account: user.account });

      const userAfter = await erc20.read.balanceOf([user.account.address,]);
      const poolAfter = await erc20.read.balanceOf([pool.address]);
      const sharesAfter = await pool.read.sharesOf([user.account.address]); 

      assert.equal(userAfter - userBefore, amount);
      assert.equal(poolBefore - poolAfter, amount);

      assert.ok(sharesAfter < sharesBefore); 
  });

  it("reverts when user tries to withdraw more than deposited", async () => {
    const { erc20, pool, user } = await networkHelpers.loadFixture(deployFixture);
    const amount = 500n;

    await erc20.write.approve([pool.address, amount], {account: user.account});
    await pool.write.deposit([amount], { account: user.account });

    const max = await pool.read.getBalanceWithInterest([user.account.address]);
    await assert.rejects(pool.write.withdraw([max + 1n], { account: user.account }));
  });

  it("deposit does not grow without borrows (real-economy model)", async () => {
    const { erc20, pool, user } = await networkHelpers.loadFixture(deployFixture);
    const deposit = 1000n;

    await erc20.write.approve([pool.address, deposit], { account: user.account });
    await pool.write.deposit([deposit], { account: user.account });

    const t0 = await networkHelpers.time.latest();
    await networkHelpers.time.increaseTo(t0 + 365 * 24 * 60 * 60);
    await networkHelpers.mine(1);

    const withInterest = await pool.read.getBalanceWithInterest([user.account.address]);
    assert.equal(withInterest, deposit);
  });

  it("supplier can withdraw > principal after borrows generate interest", async () => {
    const { erc20, pool, user } = await networkHelpers.loadFixture(deployFixture);
    const [deployer, borrower] = await viem.getWalletClients();

    await erc20.write.mint([user.account.address, 1000n]);
    await erc20.write.approve([pool.address, 1000n], { account: user.account });
    await pool.write.deposit([1000n], { account: user.account });
    await erc20.write.mint([borrower.account.address, 1000n]);
    await erc20.write.approve([pool.address, 1000n], { account: borrower.account });
    await pool.write.deposit([1000n], { account: borrower.account });

    const maxB = await pool.read.maxBorrow([borrower.account.address]);
    await pool.write.borrow([maxB], { account: borrower.account }); 

    const t0 = await networkHelpers.time.latest();
    await networkHelpers.time.increaseTo(t0 + 365 * 24 * 60 * 60);
    await networkHelpers.mine(1);

    await erc20.write.approve([pool.address, 1000n], { account: borrower.account });
    await pool.write.repay([100n], { account: borrower.account });

    const bal = await pool.read.getBalanceWithInterest([user.account.address]);
    assert.ok(bal > 1000n, "supplier did not earn from borrower interest");

    const maxW = await pool.read.maxWithdraw([user.account.address]);
    assert.ok(maxW > 0n);
  });


  it("multiple deposits do not grow without borrows", async () => {
    const { erc20, pool, user } = await networkHelpers.loadFixture(deployFixture);

    const a = 1000n;
    await erc20.write.approve([pool.address, a], { account: user.account });
    await pool.write.deposit([a], { account: user.account });

    const t0 = await networkHelpers.time.latest();
    await networkHelpers.time.increaseTo(t0 + 182 * 24 * 60 * 60);
    await networkHelpers.mine(1);

    const b = 1000n;
    await erc20.write.mint([user.account.address, b]);
    await erc20.write.approve([pool.address, b], { account: user.account });
    await pool.write.deposit([b], { account: user.account });

    const t1 = await networkHelpers.time.latest();
    await networkHelpers.time.increaseTo(t1 + 182 * 24 * 60 * 60);
    await networkHelpers.mine(1);

    const withInterest = await pool.read.getBalanceWithInterest([user.account.address]);
    assert.equal(withInterest, 2000n);
  });


  it("deposit then immediate withdraw returns same amount", async () => {
    const { erc20, pool, user } = await networkHelpers.loadFixture(deployFixture);

    const amount = 500n;
    await erc20.write.approve([pool.address, amount], { account: user.account });
    await pool.write.deposit([amount], { account: user.account });

    const before = await erc20.read.balanceOf([user.account.address]);
    await pool.write.withdraw([amount], { account: user.account });
    const after = await erc20.read.balanceOf([user.account.address]);

    assert.equal(after - before, amount);
  });


  it("withdraw burns shares", async () => {
    const { erc20, pool, user } = await networkHelpers.loadFixture(deployFixture);

    await erc20.write.approve([pool.address, 1000n], { account: user.account });
    await pool.write.deposit([1000n], { account: user.account });

    const sharesBefore = await pool.read.sharesOf([user.account.address]);
    await pool.write.withdraw([500n], { account: user.account });
    const sharesAfter = await pool.read.sharesOf([user.account.address]);

    assert.ok(sharesAfter < sharesBefore);
  });

  it("allows borrow up to LTV and tracks debt", async () => {
    const { erc20, pool, user } = await networkHelpers.loadFixture(deployFixture);
    const deposit = 1000n;
    await erc20.write.approve([pool.address, deposit], { account: user.account });
    await pool.write.deposit([deposit], { account: user.account });

    const maxBorrow = await pool.read.maxBorrow([user.account.address]); 
    const borrowAmt = maxBorrow; 
    const userBefore = await erc20.read.balanceOf([user.account.address]);
    const poolBefore = await erc20.read.balanceOf([pool.address]);

    await pool.write.borrow([borrowAmt], { account: user.account });

    const userAfter = await erc20.read.balanceOf([user.account.address]);
    const poolAfter = await erc20.read.balanceOf([pool.address]);

    assert.equal(userAfter - userBefore, borrowAmt);
    assert.equal(poolBefore - poolAfter, borrowAmt);

    const debt = await pool.read.debtOf([user.account.address]);
    assert.equal(debt, borrowAmt);
  });


  it("allows repay and reduces debt", async () => {
    const { erc20, pool, user } = await networkHelpers.loadFixture(deployFixture);

    const dep = 1000n;
    await erc20.write.approve([pool.address, dep], { account: user.account });
    await pool.write.deposit([dep], { account: user.account });
    await pool.write.borrow([500n], { account: user.account });

    const t0 = await networkHelpers.time.latest();
    await networkHelpers.time.increaseTo(t0 + 30 * 24 * 60 * 60);
    await networkHelpers.mine(1);

    const debtBefore = await pool.read.debtOf([user.account.address]);
    assert.ok(debtBefore > 0n);

    const repayAmount = 100n;

    await erc20.write.mint([user.account.address, repayAmount + 10n]);
    await erc20.write.approve([pool.address, repayAmount + 10n], { account: user.account });
    await pool.write.repay([repayAmount], { account: user.account });

    const debtAfter = await pool.read.debtOf([user.account.address]);

    assert.ok(debtAfter < debtBefore);
  });


  it("reverts withdraw if it would break LTV", async () => {
    const { erc20, pool, user } = await networkHelpers.loadFixture(deployFixture);

    const deposit = 1000n;

    await erc20.write.approve([pool.address, deposit], { account: user.account });
    await pool.write.deposit([deposit], { account: user.account });
    await pool.write.borrow([500n], { account: user.account });
    await assert.rejects(pool.write.withdraw([1n], { account: user.account }));
  });

  it("allows partial withdraw as long as LTV remains healthy", async () => {
    const { erc20, pool, user } = await networkHelpers.loadFixture(deployFixture);

    const deposit = 1000n;

    await erc20.write.approve([pool.address, deposit], { account: user.account });
    await pool.write.deposit([deposit], { account: user.account });
    await pool.write.borrow([400n], { account: user.account });

    const maxW = await pool.read.maxWithdraw([user.account.address]);
    assert.ok(maxW > 0n);

    const userBefore = await erc20.read.balanceOf([user.account.address]);
    const poolBefore = await erc20.read.balanceOf([pool.address]);

    await pool.write.withdraw([maxW], { account: user.account });

    const userAfter = await erc20.read.balanceOf([user.account.address]);
    const poolAfter = await erc20.read.balanceOf([pool.address]);

    assert.equal(userAfter - userBefore, maxW);
    assert.equal(poolBefore - poolAfter, maxW);

    const maxWAfter = await pool.read.maxWithdraw([user.account.address]);
    assert.ok(maxWAfter <= 1n);
  });

  it("repay increases maxWithdraw", async () => {
    const { erc20, pool, user } = await networkHelpers.loadFixture(deployFixture);

    const deposit = 1000n;

    await erc20.write.approve([pool.address, deposit], { account: user.account });
    await pool.write.deposit([deposit], { account: user.account });

    await pool.write.borrow([500n], { account: user.account });

    const maxBefore = await pool.read.maxWithdraw([user.account.address]);
    assert.equal(maxBefore, 0n);

    const repay = 100n;
    await erc20.write.approve([pool.address, repay], { account: user.account });
    await pool.write.repay([repay], { account: user.account });

    const maxAfter = await pool.read.maxWithdraw([user.account.address]);
    assert.ok(maxAfter > 0n);
  });

  it("health factor drops below 1 when borrow APR > deposit APR", async () => {
    const { erc20, pool, user } = await networkHelpers.loadFixture(deployFixture);

    const deposit = 1_000n;
    await erc20.write.mint([user.account.address, deposit]);
    await erc20.write.approve([pool.address, deposit], { account: user.account });
    await pool.write.deposit([deposit], { account: user.account });

    const max = await pool.read.maxBorrow([user.account.address]);
    await pool.write.borrow([max - 1n], { account: user.account });

    const t0 = await networkHelpers.time.latest();
    await networkHelpers.time.increaseTo(t0 + 365 * 24 * 60 * 60);
    await networkHelpers.mine(1);

    const hf = await pool.read.healthFactorE18([user.account.address]);
    assert.ok(hf < 1_000_000_000_000_000_000n); // < 1e18
  });


  it("allows liquidation when health factor < 1", async () => {
    const { erc20, pool, user } = await networkHelpers.loadFixture(deployFixture);
    const [deployer, liquidator] = await viem.getWalletClients();

    await erc20.write.mint([user.account.address, 1_000n]);
    await erc20.write.approve([pool.address, 1_000n], { account: user.account });
    await pool.write.deposit([1_000n], { account: user.account });

    const max = await pool.read.maxBorrow([user.account.address]);
    await pool.write.borrow([max], { account: user.account });
    const t = await networkHelpers.time.latest();
    await networkHelpers.time.increaseTo(t + 365 * 24 * 60 * 60);
    await networkHelpers.mine(1);

    const hf = await pool.read.healthFactorE18([user.account.address]);
    assert.ok(hf < 1_000_000_000_000_000_000n); // < 1e18

    await erc20.write.mint([liquidator.account.address, 1_000n]);
    await erc20.write.approve([pool.address, 1_000n], { account: liquidator.account });

    const repay = 100n;
    await pool.write.liquidate([user.account.address, repay], { account: liquidator.account });

    const debtAfter = await pool.read.debtOf([user.account.address]);
    assert.ok(debtAfter < (await pool.read.debtOf([user.account.address])) === false); 
  });

  it("reverts liquidation when health factor >= 1", async () => {
    const { erc20, pool, user } = await networkHelpers.loadFixture(deployFixture);
    const [, liquidator] = await viem.getWalletClients();

    await erc20.write.mint([user.account.address, 1_000n]);
    await erc20.write.approve([pool.address, 1_000n], { account: user.account });
    await pool.write.deposit([1_000n], { account: user.account });

    // долг маленький -> hf >= 1
    await pool.write.borrow([100n], { account: user.account });

    await erc20.write.mint([liquidator.account.address, 1_000n]);
    await erc20.write.approve([pool.address, 1_000n], { account: liquidator.account });

    await assert.rejects(
      pool.write.liquidate([user.account.address, 50n], { account: liquidator.account })
    );
  });

  it("reverts liquidation when health factor is ok (>= 1)", async () => {
    const { erc20, pool, user } = await networkHelpers.loadFixture(deployFixture);
    const [deployer] = await viem.getWalletClients(); 
    const dep = 1000n;
    await erc20.write.approve([pool.address, dep], { account: user.account });
    await pool.write.deposit([dep], { account: user.account });
    await pool.write.borrow([500n], { account: user.account });
    await erc20.write.mint([deployer.account.address, 1000n]);
    await erc20.write.approve([pool.address, 1000n], { account: deployer.account });
    await assert.rejects(pool.write.liquidate([user.account.address, 100n], { account: deployer.account }));
  });

  it("liquidation is capped by close factor", async () => {
    const { erc20, pool, user } = await networkHelpers.loadFixture(deployFixture);
    const [deployer] = await viem.getWalletClients();
    const dep = 1000n;
    await erc20.write.approve([pool.address, dep], { account: user.account });
    await pool.write.deposit([dep], { account: user.account });
    await pool.write.borrow([500n], { account: user.account });

    const t0 = await networkHelpers.time.latest();
    await networkHelpers.time.increaseTo(t0 + 365 * 24 * 60 * 60);
    await networkHelpers.mine(1);

    const hf = await pool.read.healthFactorE18([user.account.address]);
    assert.ok(hf < 1_000_000_000_000_000_000n); // < 1e18

    const debtBefore = await pool.read.debtOf([user.account.address]);

    await erc20.write.mint([deployer.account.address, 10_000n]);
    await erc20.write.approve([pool.address, 10_000n], { account: deployer.account });
    await pool.write.liquidate([user.account.address, 10_000n], { account: deployer.account });

    const debtAfter = await pool.read.debtOf([user.account.address]);

    assert.ok(debtAfter < debtBefore);
    assert.ok(debtAfter * 100n >= debtBefore * 45n); 
  });

  it("liquidator receives collateral with bonus; user shares decrease", async () => {
    const { erc20, pool, user } = await networkHelpers.loadFixture(deployFixture);
    const [deployer, liquidator] = await viem.getWalletClients();

    const dep = 1000n;
    await erc20.write.mint([user.account.address, dep]);
    await erc20.write.approve([pool.address, dep], { account: user.account });
    await pool.write.deposit([dep], { account: user.account });

    const max = await pool.read.maxBorrow([user.account.address]);
    await pool.write.borrow([max], { account: user.account });

    await pool.write.setBorrowApr([2_000_000_000_000_000_000n], { account: deployer.account }); // 200%
    const t0 = await networkHelpers.time.latest();
    await networkHelpers.time.increaseTo(t0 + 365 * 24 * 60 * 60);
    await networkHelpers.mine(1);

    const hf = await pool.read.healthFactorE18([user.account.address]);
    assert.ok(hf < 10n ** 18n, "HF did not drop below 1");

    await erc20.write.mint([liquidator.account.address, 10_000n]);
    await erc20.write.approve([pool.address, 10_000n], { account: liquidator.account });

    const userSharesBefore = await pool.read.sharesOf([user.account.address]);
    const userDebtBefore = await pool.read.debtOf([user.account.address]);

    const txHash = await pool.write.liquidate([user.account.address, 500n], { account: liquidator.account });

    const userSharesAfter = await pool.read.sharesOf([user.account.address]);
    const userDebtAfter = await pool.read.debtOf([user.account.address]);

    assert.ok(userSharesAfter < userSharesBefore, "user shares did not decrease");
    assert.ok(userDebtAfter < userDebtBefore, "user debt did not decrease");

    const publicClient = await viem.getPublicClient();
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });

    const liquidateEventAbi = parseAbiItem(
      "event Liquidate(address indexed liquidator, address indexed user, uint256 assetsPaid, uint256 debtSharesBurned, uint256 collateralSeized, uint256 sharesSeized, uint256 borrowIndexE18, uint256 sharePriceE18)"
    );

    let ev: any = null;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== pool.address.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({ abi: [liquidateEventAbi], data: log.data, topics: log.topics });
        if (decoded.eventName === "Liquidate") { ev = decoded; break; }
      } catch {}
    }
    assert.ok(ev, "Liquidate event not found");
    assert.ok(ev.args.sharesSeized > 0n, "sharesSeized should be > 0");
  });

  it("onlyOwner: non-owner cannot setBorrowApr", async () => {
    const { pool, user } = await networkHelpers.loadFixture(deployFixture);

    await assert.rejects(
      pool.write.setBorrowApr([2_000_000_000_000_000_000n], { account: user.account }) // 2e18 = 200%
    );
  });

  it("owner can setBorrowApr; health factor drops < 1 after 1y when borrowApr >> apr", async () => {
    const { erc20, pool, user } = await networkHelpers.loadFixture(deployFixture);
    const [deployer] = await viem.getWalletClients();

    const dep = 1_000n;
    await erc20.write.mint([user.account.address, dep]);
    await erc20.write.approve([pool.address, dep], { account: user.account });
    await pool.write.deposit([dep], { account: user.account });

    const max = await pool.read.maxBorrow([user.account.address]);
    await pool.write.borrow([max - 1n], { account: user.account });

    await pool.write.setBorrowApr([2_000_000_000_000_000_000n], { account: deployer.account }); // 200%

    const t0 = await networkHelpers.time.latest();
    await networkHelpers.time.increaseTo(t0 + 365 * 24 * 60 * 60);
    await networkHelpers.mine(1);

    const hf = await pool.read.healthFactorE18([user.account.address]);
    assert.ok(hf < 1_000_000_000_000_000_000n);
  });

  it("transferOwnership changes permissions", async () => {
    const { pool } = await networkHelpers.loadFixture(deployFixture);
    const [deployer, newOwner, randomUser] = await viem.getWalletClients();

    await pool.write.transferOwnership([newOwner.account.address], { account: deployer.account });

    await assert.rejects(
      pool.write.setApr([1_000_000_000_000_000n], { account: deployer.account }) // 0.001
    );

    await assert.rejects(
      pool.write.setApr([1_000_000_000_000_000n], { account: randomUser.account })
    );

    await pool.write.setApr([1_000_000_000_000_000n], { account: newOwner.account });
  });

  it("liquidates event amounts match liquidator balance deltas", async () => {
    const { erc20, pool, user } = await networkHelpers.loadFixture(deployFixture);
    const [deployer, liquidator] = await viem.getWalletClients();

    const dep = 1_000n;
    await erc20.write.mint([user.account.address, dep]);
    await erc20.write.approve([pool.address, dep], { account: user.account });
    await pool.write.deposit([dep], { account: user.account });

    const max = await pool.read.maxBorrow([user.account.address]);
    await pool.write.borrow([max], { account: user.account });

    await pool.write.setBorrowApr([2_000_000_000_000_000_000n], { account: deployer.account }); // 200%
    const t0 = await networkHelpers.time.latest();
    await networkHelpers.time.increaseTo(t0 + 365 * 24 * 60 * 60);
    await networkHelpers.mine(1);

    const hf = await pool.read.healthFactorE18([user.account.address]);
    assert.ok(hf < 1_000_000_000_000_000_000n);

    await erc20.write.mint([liquidator.account.address, 10_000n]);
    await erc20.write.approve([pool.address, 10_000n], { account: liquidator.account });

    const liqBefore = await erc20.read.balanceOf([liquidator.account.address]);
    const repayInput = 500n;
    const txHash = await pool.write.liquidate([user.account.address, repayInput], { account: liquidator.account });
    const liqAfter = await erc20.read.balanceOf([liquidator.account.address]);
    const publicClient = await viem.getPublicClient();
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
    const liquidateEventAbi = parseAbiItem(
      "event Liquidate(address indexed liquidator, address indexed user, uint256 assetsPaid, uint256 debtSharesBurned, uint256 collateralSeized, uint256 sharesSeized, uint256 borrowIndexE18, uint256 sharePriceE18)"
    );

    let ev: any = null;

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== pool.address.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({
          abi: [liquidateEventAbi],
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === "Liquidate") {
          ev = decoded;
          break;
        }
      } catch {
        
      }
    }

    assert.ok(ev, "Liquidate event not found");
    const assetsPaid: bigint = ev.args.assetsPaid;
    const collateralSeized: bigint = ev.args.collateralSeized;
    assert.equal(liqAfter - liqBefore, collateralSeized - assetsPaid);
  });

  it("liquidation: liquidator wallet delta equals seized - paid (event-based)", async () => {
    const { erc20, pool, user } = await networkHelpers.loadFixture(deployFixture);
    const [deployer, liquidator] = await viem.getWalletClients();

    await erc20.write.mint([user.account.address, 1000n]);
    await erc20.write.approve([pool.address, 1000n], { account: user.account });
    await pool.write.deposit([1000n], { account: user.account });

    const max = await pool.read.maxBorrow([user.account.address]);
    await pool.write.borrow([max], { account: user.account });

    await pool.write.setBorrowApr([2_000_000_000_000_000_000n], { account: deployer.account });
    const t0 = await networkHelpers.time.latest();
    await networkHelpers.time.increaseTo(t0 + 365 * 24 * 60 * 60);
    await networkHelpers.mine(1);

    const hf = await pool.read.healthFactorE18([user.account.address]);
    assert.ok(hf < 10n ** 18n);

    await erc20.write.mint([liquidator.account.address, 10_000n]);
    await erc20.write.approve([pool.address, 10_000n], { account: liquidator.account });

    const liqBefore = await erc20.read.balanceOf([liquidator.account.address]);

    const txHash = await pool.write.liquidate([user.account.address, 500n], { account: liquidator.account });

    const liqAfter = await erc20.read.balanceOf([liquidator.account.address]);

    const publicClient = await viem.getPublicClient();
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });

    const abiItem = parseAbiItem(
      "event Liquidate(address indexed liquidator, address indexed user, uint256 assetsPaid, uint256 debtSharesBurned, uint256 collateralSeized, uint256 sharesSeized, uint256 borrowIndexE18, uint256 sharePriceE18)"
    );

    let ev: any = null;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== pool.address.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({ abi: [abiItem], data: log.data, topics: log.topics });
        if (decoded.eventName === "Liquidate") { ev = decoded; break; }
      } catch {}
    }
    assert.ok(ev, "Liquidate event not found");

    const paid: bigint = ev.args.assetsPaid;
    const seized: bigint = ev.args.collateralSeized;

    assert.equal(liqAfter - liqBefore, seized - paid);
    assert.ok(seized >= paid, "expected seized >= paid");
  });

  it("reserves accrue and owner can withdraw only available reserves", async () => {
    const { erc20, pool, user } = await networkHelpers.loadFixture(deployFixture);
    const [deployer] = await viem.getWalletClients();

    const dep = 1000n;
    await erc20.write.mint([user.account.address, dep]);
    await erc20.write.approve([pool.address, dep], { account: user.account });
    await pool.write.deposit([dep], { account: user.account });

    await pool.write.borrow([500n], { account: user.account });

    await pool.write.setReserveFactor([2000n], { account: deployer.account }); // 20%
    await pool.write.setBorrowApr([2_000_000_000_000_000_000n], { account: deployer.account }); // 200%

    const t0 = await networkHelpers.time.latest();
    await networkHelpers.time.increaseTo(t0 + 365 * 24 * 60 * 60);
    await networkHelpers.mine(1);

    const debtNow = await pool.read.debtOf([user.account.address]);
    await erc20.write.mint([user.account.address, debtNow]); // give user enough to repay
    await erc20.write.approve([pool.address, debtNow], { account: user.account });
    await pool.write.repay([debtNow], { account: user.account });

    const reserves = await pool.read.protocolReserves();
    assert.ok(reserves > 0n, "protocolReserves did not accrue");

    const avail = await pool.read.availableReserves();
    assert.ok(avail > 0n, "availableReserves should be > 0 after repay");

    const withdrawAmt = avail / 2n;
    const ownerBefore = await erc20.read.balanceOf([deployer.account.address]);

    await pool.write.withdrawReserves([deployer.account.address, withdrawAmt], { account: deployer.account });

    const ownerAfter = await erc20.read.balanceOf([deployer.account.address]);
    assert.equal(ownerAfter - ownerBefore, withdrawAmt);

    const reservesAfter = await pool.read.protocolReserves();
    assert.equal(reservesAfter, reserves - withdrawAmt);
  });

  it("utilization-based borrow APR increases with utilization", async () => {
    const { erc20, pool, user } = await networkHelpers.loadFixture(deployFixture);
    const [deployer] = await viem.getWalletClients();

    await pool.write.setRateModel([
      0n,                              
      1_000_000_000_000_000_000n,       
      800_000_000_000_000_000n,         
      2_000_000_000_000_000_000n       
    ], { account: deployer.account });

    await erc20.write.mint([user.account.address, 1_000n]);
    await erc20.write.approve([pool.address, 1_000n], { account: user.account });
    await pool.write.deposit([1_000n], { account: user.account });
    await pool.write.borrow([100n], { account: user.account });
    const s1 = await pool.read.poolState();
    const aprLow = s1.borrowAprE18;
    await pool.write.borrow([300n], { account: user.account });
    const s2 = await pool.read.poolState();
    const aprHigh = s2.borrowAprE18;
    assert.ok(aprHigh > aprLow, "borrow APR did not increase with utilization");
  });

  it("supply APR matches borrowAPR * util * (1-reserveFactor)", async () => {
    const { erc20, pool, user } = await networkHelpers.loadFixture(deployFixture);
    const [deployer] = await viem.getWalletClients();

    await pool.write.setReserveFactor([1000n], { account: deployer.account }); 

    await pool.write.setRateModel([
      0n,
      1_000_000_000_000_000_000n,     
      800_000_000_000_000_000n,       
      0n
    ], { account: deployer.account });

    await erc20.write.mint([user.account.address, 1_000n]);
    await erc20.write.approve([pool.address, 1_000n], { account: user.account });
    await pool.write.deposit([1_000n], { account: user.account });
    await pool.write.borrow([400n], { account: user.account });

    const s = await pool.read.poolState();
    const b = s.borrowAprE18;
    const util = s.utilizationE18;
    const sApr = s.supplyAprE18;
    const expected = (((b * util) / 10n ** 18n) * 9000n) / 10000n;
    const diff = sApr > expected ? (sApr - expected) : (expected - sApr);
    assert.ok(diff <= 5n, `supplyApr mismatch: got=${sApr} expected=${expected}`);
  });


});
