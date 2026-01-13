import hre from "hardhat";

async function main() {
  const connection = await hre.network.connect();
  const publicClient = await connection.viem.getPublicClient();
  const chainId = await publicClient.getChainId();
  console.log("chainId:", chainId);

  const [walletClient] = await connection.viem.getWalletClients();
  console.log("deployer:", walletClient.account.address);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
