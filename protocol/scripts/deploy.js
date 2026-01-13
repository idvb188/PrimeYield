import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying with account:", deployer.address);

  const Token = await ethers.getContractFactory("ERC20Mock");
  const token = await Token.deploy("TestToken", "TST", deployer.address, 1_000_000n * 10n ** 18n);

  await token.waitForDeployment();

  console.log("Mock token deployed at:", await token.getAddress());

  const Pool = await ethers.getContractFactory("LendingPool");
  const pool = await Pool.deploy(await token.getAddress());

  await pool.waitForDeployment();

  console.log("LendingPool deployed at:", await pool.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
