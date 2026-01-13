import hre from "hardhat";

async function main() {
  const connection = await hre.network.connect();
  const [walletClient] = await connection.viem.getWalletClients();

  const token = process.env.NEXT_PUBLIC_TOKEN_ADDRESS;

  console.log("Deployer:", walletClient.account.address);
  console.log("Token (mETH):", token);

  const pool = await connection.viem.deployContract("contracts/LendingPool.sol:LendingPool",[token]);
  console.log("LendingPool deployed to:", pool.address);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
