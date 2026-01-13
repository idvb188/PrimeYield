import hre from "hardhat";

async function main() {
  const connection = await hre.network.connect();
  const [walletClient] = await connection.viem.getWalletClients();

  console.log("Deployer:", walletClient.account.address);
  const policy = await connection.viem.deployContract("contracts/WhitelistPolicy.sol:WhitelistPolicy",[walletClient.account.address]);
  console.log("WhitelistPolicy deployed to:", policy.address);

  const txHash = await policy.write.setAllowed([walletClient.account.address, true]);
  console.log("setAllowed tx:", txHash);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
