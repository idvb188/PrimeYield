import hre from "hardhat";

async function main() {
  const connection = await hre.network.connect();

  const [walletClient] = await connection.viem.getWalletClients();
  console.log("Deployer:", walletClient.account.address);

  const token = await connection.viem.deployContract("contracts/MockMETH.sol:MockMETH", []);
  console.log("Mock mETH deployed to:", token.address);

  const bal = await token.read.balanceOf([walletClient.account.address]);
  console.log("Deployer mETH balance:", bal.toString());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
