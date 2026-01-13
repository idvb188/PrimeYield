import hre from "hardhat";

const TOKEN = process.env.NEXT_PUBLIC_TOKEN_ADDRESS;
const POLICY = process.env.NEXT_PUBLIC_WHITELIST_POLICY;

async function main() {
  const connection = await hre.network.connect();
  const [walletClient] = await connection.viem.getWalletClients();

  console.log("Deployer:", walletClient.account.address);
  console.log("Asset (mETH):", TOKEN);
  console.log("Policy:", POLICY);

  const vault = await connection.viem.deployContract(
    "contracts/RWAVault.sol:RWAVault",
    [walletClient.account.address, TOKEN, POLICY]
  );

  console.log("RWAVault deployed to:", vault.address);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
