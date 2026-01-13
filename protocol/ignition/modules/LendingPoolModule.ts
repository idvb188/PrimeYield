import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const LendingPoolModule = buildModule("LendingPoolModule", (m) => {
  const deployer = m.getAccount(0);

  const token = m.contract("ERC20Mock", [
    "TestToken",                // name
    "TST",                      // symbol
    deployer,                   // initial holder
    1_000_000n * 10n ** 18n,    // initial supply
  ]);

  const pool = m.contract("LendingPool", [token]);

  return { token, pool };
});

export default LendingPoolModule;
